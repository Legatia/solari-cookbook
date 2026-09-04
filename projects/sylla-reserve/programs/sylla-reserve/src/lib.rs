//! Sylla root reserve currency.
//!
//! One currency, capitalized in SOL, priced at the net asset value of a
//! treasury that holds only SOL. Holding only SOL is the point of this first
//! program: with no imported assets there are no oracles, no bridges, and no
//! valuation disputes, so the accounting can be proved exactly before any of
//! that risk is added.
//!
//! The constitutional invariants this program enforces in code:
//!
//!   1. SOL is the only asset accepted, at capitalization and afterwards.
//!   2. The initial price is fixed at publication, before anyone deposits.
//!   3. No transferable supply exists until funded reserves are verified —
//!      subscribers hold a non-transferable receipt until activation.
//!   4. Supply follows capital. A smaller raise mints a smaller supply.
//!   5. Minting and redemption both price at current NAV.
//!   6. Redemption is never gated, fee'd, paused, or deadlined.
//!   7. Nobody can freeze or seize a holder's balance: the mint is created
//!      with no freeze authority and the program holds no delegate.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token_interface::{
    burn, mint_to, transfer_checked, Burn, Mint, MintTo, TokenAccount, TokenInterface,
    TransferChecked,
};

pub mod math;
pub mod oracle;
use crate::math::*;
use crate::oracle::*;

declare_id!("CFvQkQeqdo9wJtPYEqzF9RTrTPtar41UtcQUf6F7j1Dy");

pub const CONSTITUTION_SEED: &[u8] = b"constitution";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";

#[program]
pub mod sylla_reserve {
    use super::*;

    /// Publish the constitution and open capitalization.
    ///
    /// Everything that governs the currency is fixed here, in public, before a
    /// single lamport is accepted. Nothing below can be edited afterwards.
    pub fn publish(ctx: Context<Publish>, params: PublishParams) -> Result<()> {
        require!(params.initial_price > 0, ReserveError::InvalidPrice);
        require!(
            params.min_capitalization > 0
                && params.max_capitalization >= params.min_capitalization,
            ReserveError::InvalidCapitalization
        );
        require!(
            params.entry_fee_bps < BPS_DENOMINATOR as u16,
            ReserveError::InvalidFee
        );
        let now = Clock::get()?.unix_timestamp;
        require!(params.subscription_ends_at > now, ReserveError::WindowInPast);

        let constitution = &mut ctx.accounts.constitution;
        constitution.authority = ctx.accounts.authority.key();
        constitution.currency_mint = ctx.accounts.currency_mint.key();
        constitution.decimals = ctx.accounts.currency_mint.decimals;
        constitution.initial_price = params.initial_price;
        constitution.min_capitalization = params.min_capitalization;
        constitution.max_capitalization = params.max_capitalization;
        constitution.subscription_ends_at = params.subscription_ends_at;
        constitution.entry_fee_bps = params.entry_fee_bps;
        constitution.version_hash = params.version_hash;
        constitution.state = CurrencyState::Capitalizing;
        constitution.subscribed_lamports = 0;
        constitution.genesis_supply = 0;
        constitution.outstanding_supply = 0;
        constitution.reserve_lamports = 0;
        constitution.bump = ctx.bumps.constitution;
        constitution.treasury_bump = ctx.bumps.treasury;
        constitution.max_staleness_slots = if params.max_staleness_slots == 0 {
            DEFAULT_MAX_STALENESS_SLOTS
        } else {
            params.max_staleness_slots
        };
        constitution.max_confidence_bps = if params.max_confidence_bps == 0 {
            DEFAULT_MAX_CONFIDENCE_BPS
        } else {
            params.max_confidence_bps
        };
        constitution.assets = Default::default();

        // The treasury carries its own rent, separate from the reserve, so that
        // draining the reserve to zero can never purge the account holding it.
        let rent_exempt = Rent::get()?.minimum_balance(0);
        let treasury_balance = ctx.accounts.treasury.lamports();
        if treasury_balance < rent_exempt {
            transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.authority.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                rent_exempt - treasury_balance,
            )?;
        }

        emit!(CurrencyPublished {
            constitution: constitution.key(),
            currency_mint: constitution.currency_mint,
            initial_price: constitution.initial_price,
            version_hash: constitution.version_hash,
        });
        Ok(())
    }

    /// Deposit SOL during the subscription window.
    ///
    /// The receipt is a PDA owned by this program and keyed to the subscriber.
    /// It cannot be transferred or sold — until reserves are verified there is
    /// nothing tradeable in existence, which is invariant 3.
    pub fn subscribe(ctx: Context<Subscribe>, lamports: u64) -> Result<()> {
        require!(lamports > 0, ReserveError::ZeroAmount);
        let constitution = &mut ctx.accounts.constitution;
        require!(
            constitution.state == CurrencyState::Capitalizing,
            ReserveError::WrongState
        );
        require!(
            Clock::get()?.unix_timestamp < constitution.subscription_ends_at,
            ReserveError::WindowClosed
        );
        let subscribed = constitution
            .subscribed_lamports
            .checked_add(lamports)
            .ok_or(ReserveError::Overflow)?;
        require!(
            subscribed <= constitution.max_capitalization,
            ReserveError::MaximumExceeded
        );

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.subscriber.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            lamports,
        )?;

        constitution.subscribed_lamports = subscribed;
        constitution.reserve_lamports = constitution
            .reserve_lamports
            .checked_add(lamports)
            .ok_or(ReserveError::Overflow)?;

        let receipt = &mut ctx.accounts.receipt;
        receipt.constitution = constitution.key();
        receipt.subscriber = ctx.accounts.subscriber.key();
        receipt.lamports = receipt
            .lamports
            .checked_add(lamports)
            .ok_or(ReserveError::Overflow)?;
        receipt.bump = ctx.bumps.receipt;
        Ok(())
    }

    /// Publish a price for one reserve asset.
    ///
    /// Settable by design: the failure scenarios this protocol must survive —
    /// depeg, staleness, a widening confidence interval — cannot be produced
    /// against a live feed.
    pub fn publish_price(
        ctx: Context<PublishPrice>,
        lamports_per_whole: u64,
        confidence_bps: u16,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let feed = &mut ctx.accounts.feed;
        feed.mint = ctx.accounts.mint.key();
        feed.publisher = ctx.accounts.publisher.key();
        feed.lamports_per_whole = lamports_per_whole;
        feed.confidence_bps = confidence_bps;
        feed.published_slot = clock.slot;
        feed.published_at = clock.unix_timestamp;
        feed.bump = ctx.bumps.feed;
        emit!(PricePublished {
            mint: feed.mint,
            lamports_per_whole,
            confidence_bps,
            slot: clock.slot,
        });
        Ok(())
    }

    /// Add an approved reserve asset, before any capital is accepted.
    ///
    /// Only during capitalization: the assets a currency may hold are part of
    /// what subscribers agreed to, and adding one afterwards would change the
    /// deal after the money arrived.
    pub fn register_asset(ctx: Context<RegisterAsset>, params: AssetParams) -> Result<()> {
        require!(
            params.collateral_factor_bps <= BPS_DENOMINATOR as u16,
            ReserveError::InvalidCollateralFactor
        );
        require!(
            params.lower_band_bps <= params.target_weight_bps
                && params.target_weight_bps <= params.upper_band_bps
                && params.upper_band_bps <= BPS_DENOMINATOR as u16,
            ReserveError::InvalidBand
        );
        let constitution = &mut ctx.accounts.constitution;
        require!(
            constitution.state == CurrencyState::Capitalizing,
            ReserveError::WrongState
        );
        // One slot per mint. Two slots holding the same asset would count it
        // twice in NAV, which is a way to mint against money that is not there.
        require!(
            !constitution
                .active_assets()
                .any(|(_, slot)| slot.mint == ctx.accounts.asset_mint.key()),
            ReserveError::AssetAlreadyRegistered
        );
        let slot = constitution
            .assets
            .iter_mut()
            .find(|slot| !slot.active)
            .ok_or(ReserveError::TooManyAssets)?;
        *slot = ReserveAssetSlot {
            mint: ctx.accounts.asset_mint.key(),
            price_feed: ctx.accounts.feed.key(),
            token_account: ctx.accounts.treasury_tokens.key(),
            decimals: ctx.accounts.asset_mint.decimals,
            target_weight_bps: params.target_weight_bps,
            lower_band_bps: params.lower_band_bps,
            upper_band_bps: params.upper_band_bps,
            collateral_factor_bps: params.collateral_factor_bps,
            active: true,
        };
        emit!(AssetRegistered {
            constitution: constitution.key(),
            mint: ctx.accounts.asset_mint.key(),
            target_weight_bps: params.target_weight_bps,
            collateral_factor_bps: params.collateral_factor_bps,
        });
        Ok(())
    }

    /// Move an approved asset into the treasury while forming it.
    pub fn deposit_asset(ctx: Context<DepositAsset>, amount: u64) -> Result<()> {
        require!(amount > 0, ReserveError::ZeroAmount);
        require!(
            ctx.accounts.constitution.state == CurrencyState::Capitalizing,
            ReserveError::WrongState
        );
        require!(
            ctx.accounts
                .constitution
                .active_assets()
                .any(|(_, slot)| slot.mint == ctx.accounts.asset_mint.key()
                    && slot.token_account == ctx.accounts.treasury_tokens.key()),
            ReserveError::UnapprovedAsset
        );
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.depositor_tokens.to_account_info(),
                    mint: ctx.accounts.asset_mint.to_account_info(),
                    to: ctx.accounts.treasury_tokens.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.asset_mint.decimals,
        )?;
        Ok(())
    }

    /// Close the window and fix the supply against what was actually funded.
    ///
    /// Permissionless on purpose: the founder cannot stall activation to keep
    /// subscribers' SOL locked in a currency that never starts.
    pub fn activate(ctx: Context<Activate>) -> Result<()> {
        let constitution = &mut ctx.accounts.constitution;
        require!(
            constitution.state == CurrencyState::Capitalizing,
            ReserveError::WrongState
        );
        require!(
            Clock::get()?.unix_timestamp >= constitution.subscription_ends_at,
            ReserveError::WindowOpen
        );
        require!(
            constitution.subscribed_lamports >= constitution.min_capitalization,
            ReserveError::MinimumNotReached
        );

        let supply = genesis_supply(
            constitution.reserve_lamports,
            constitution.initial_price,
            constitution.decimals,
        )?;
        require!(supply > 0, ReserveError::EmptySupply);

        constitution.genesis_supply = supply;
        constitution.outstanding_supply = supply;
        constitution.state = CurrencyState::Active;

        emit!(CurrencyActivated {
            constitution: constitution.key(),
            funded_lamports: constitution.reserve_lamports,
            genesis_supply: supply,
        });
        Ok(())
    }

    /// Exchange a subscription receipt for its pro-rata share of the supply.
    ///
    /// The receipt closes and its rent returns to the subscriber.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        require!(
            ctx.accounts.constitution.state == CurrencyState::Active,
            ReserveError::WrongState
        );

        let tokens = subscription_claim(
            ctx.accounts.receipt.lamports,
            ctx.accounts.constitution.subscribed_lamports,
            ctx.accounts.constitution.genesis_supply,
        )?;
        require!(tokens > 0, ReserveError::DustAmount);

        let currency_mint = ctx.accounts.constitution.currency_mint;
        let constitution_key = ctx.accounts.constitution.key();
        let seeds: &[&[u8]] = &[
            CONSTITUTION_SEED,
            currency_mint.as_ref(),
            &[ctx.accounts.constitution.bump],
        ];
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.currency_mint.to_account_info(),
                    to: ctx.accounts.subscriber_tokens.to_account_info(),
                    authority: ctx.accounts.constitution.to_account_info(),
                },
                &[seeds],
            ),
            tokens,
        )?;

        emit!(SubscriptionClaimed {
            constitution: constitution_key,
            subscriber: ctx.accounts.subscriber.key(),
            tokens,
        });
        Ok(())
    }

    /// Mint currency by depositing SOL at current NAV.
    pub fn mint_currency(ctx: Context<MintCurrency>, lamports: u64) -> Result<()> {
        require!(lamports > 0, ReserveError::ZeroAmount);
        let constitution = &mut ctx.accounts.constitution;
        require!(
            constitution.state == CurrencyState::Active,
            ReserveError::WrongState
        );

        let currency_mint = constitution.currency_mint;
        let constitution_bump = constitution.bump;
        let constitution_key = constitution.key();
        let (net, fee) = apply_fee(lamports, constitution.entry_fee_bps)?;
        // Priced against total NAV before this deposit lands — the SOL sleeve
        // plus every asset. If any feed is unusable this fails, and minting
        // stops until prices are trustworthy again.
        let (fair_nav, _prudential) = valuate(
            constitution,
            ctx.remaining_accounts,
            Clock::get()?.slot,
        )?;
        let tokens = tokens_for_deposit(net, fair_nav, constitution.outstanding_supply)?;
        // Refuse rather than pocket a deposit too small to mint anything.
        require!(tokens > 0, ReserveError::DustAmount);

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            lamports,
        )?;

        // The fee is never withdrawn; it stays in the reserve and lifts NAV.
        constitution.reserve_lamports = constitution
            .reserve_lamports
            .checked_add(lamports)
            .ok_or(ReserveError::Overflow)?;
        constitution.outstanding_supply = constitution
            .outstanding_supply
            .checked_add(tokens)
            .ok_or(ReserveError::Overflow)?;

        let seeds: &[&[u8]] = &[
            CONSTITUTION_SEED,
            currency_mint.as_ref(),
            &[constitution_bump],
        ];
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.currency_mint.to_account_info(),
                    to: ctx.accounts.depositor_tokens.to_account_info(),
                    authority: ctx.accounts.constitution.to_account_info(),
                },
                &[seeds],
            ),
            tokens,
        )?;

        emit!(CurrencyMinted {
            constitution: constitution_key,
            depositor: ctx.accounts.depositor.key(),
            lamports,
            fee,
            tokens,
        });
        Ok(())
    }

    /// Burn currency and take the corresponding share of the reserve.
    ///
    /// Deliberately available in every state the currency can reach after
    /// activation, including wind-down. There is no fee, no queue, no pause,
    /// and no authority that can stand in the way.
    pub fn redeem(ctx: Context<Redeem>, tokens: u64) -> Result<()> {
        require!(tokens > 0, ReserveError::ZeroAmount);
        let constitution = &mut ctx.accounts.constitution;
        require!(
            constitution.state == CurrencyState::Active
                || constitution.state == CurrencyState::WindDown,
            ReserveError::WrongState
        );

        // The SOL route is a convenience priced at full NAV, so it is bounded
        // by the liquid sleeve. When SOL runs out the in-kind route still
        // works, which is why redemption can never actually be closed.
        let (fair_nav, _prudential) = valuate(
            constitution,
            ctx.remaining_accounts,
            Clock::get()?.slot,
        )?;
        let owed = lamports_for_redemption(tokens, fair_nav, constitution.outstanding_supply)?;
        require!(owed > 0, ReserveError::DustAmount);
        require!(
            owed <= constitution.reserve_lamports,
            ReserveError::InsufficientLiquidSleeve
        );

        burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.currency_mint.to_account_info(),
                    from: ctx.accounts.holder_tokens.to_account_info(),
                    authority: ctx.accounts.holder.to_account_info(),
                },
            ),
            tokens,
        )?;

        // The treasury is a System-owned PDA, so it signs its own transfer out
        // rather than having lamports subtracted from it. Only the reserve is
        // ever spendable; the rent underneath it stays put.
        let currency_mint = constitution.currency_mint;
        let treasury_seeds: &[&[u8]] = &[
            TREASURY_SEED,
            currency_mint.as_ref(),
            &[constitution.treasury_bump],
        ];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury.to_account_info(),
                    to: ctx.accounts.holder.to_account_info(),
                },
                &[treasury_seeds],
            ),
            owed,
        )?;

        constitution.reserve_lamports = constitution
            .reserve_lamports
            .checked_sub(owed)
            .ok_or(ReserveError::Overflow)?;
        constitution.outstanding_supply = constitution
            .outstanding_supply
            .checked_sub(tokens)
            .ok_or(ReserveError::Overflow)?;

        emit!(CurrencyRedeemed {
            constitution: constitution.key(),
            holder: ctx.accounts.holder.key(),
            tokens,
            lamports: owed,
        });
        Ok(())
    }

    /// Stop new issuance while leaving redemption untouched.
    ///
    /// This is the strongest power the authority has, and it is deliberately
    /// one-directional: it can close the door in, never the door out.
    pub fn begin_wind_down(ctx: Context<BeginWindDown>) -> Result<()> {
        let constitution = &mut ctx.accounts.constitution;
        require!(
            constitution.state == CurrencyState::Active,
            ReserveError::WrongState
        );
        constitution.state = CurrencyState::WindDown;
        emit!(WindDownBegan {
            constitution: constitution.key(),
            reserve_lamports: constitution.reserve_lamports,
            outstanding_supply: constitution.outstanding_supply,
        });
        Ok(())
    }
}

/// Total fair NAV in lamports: the SOL sleeve plus every asset at its
/// confidence-adjusted price.
///
/// Callers pass `[treasury_token_account, price_feed]` pairs in slot order via
/// `remaining_accounts`. Every pair is checked against the slot it claims to
/// be, so a caller cannot substitute a friendlier feed or a fuller account.
///
/// Any unusable feed fails the whole valuation rather than being skipped.
/// Skipping would value the missing asset at zero and quietly mint someone a
/// larger share of a treasury that is merely unmeasured.
fn valuate(
    constitution: &Constitution,
    remaining: &[AccountInfo],
    current_slot: u64,
) -> Result<(u64, u64)> {
    let mut fair = constitution.reserve_lamports;
    let mut prudential = constitution.reserve_lamports;
    let mut cursor = 0usize;

    for (_, slot) in constitution.active_assets() {
        let token_info = remaining
            .get(cursor)
            .ok_or(ReserveError::MissingValuationAccount)?;
        let feed_info = remaining
            .get(cursor + 1)
            .ok_or(ReserveError::MissingValuationAccount)?;
        cursor += 2;

        require_keys_eq!(
            token_info.key(),
            slot.token_account,
            ReserveError::MissingValuationAccount
        );
        require_keys_eq!(
            feed_info.key(),
            slot.price_feed,
            ReserveError::MissingValuationAccount
        );

        // Deserialize from the raw account rather than re-borrowing, so the
        // helper does not need the instruction's lifetime threaded through it.
        let tokens = {
            let raw = token_info.try_borrow_data()?;
            anchor_spl::token_interface::TokenAccount::try_deserialize(&mut &raw[..])?
        };
        require_keys_eq!(*feed_info.owner, crate::ID, ReserveError::MissingValuationAccount);
        let feed = {
            let raw = feed_info.try_borrow_data()?;
            PriceFeed::try_deserialize(&mut &raw[..])?
        };
        require!(
            feed_problem(
                &feed,
                current_slot,
                constitution.max_staleness_slots,
                constitution.max_confidence_bps,
            )
            .is_none(),
            ReserveError::FeedUnusable
        );

        let value =
            asset_value_lamports(tokens.amount, conservative_price(&feed), slot.decimals)?;
        fair = fair.checked_add(value).ok_or(ReserveError::Overflow)?;
        prudential = prudential
            .checked_add(prudential_value(value, slot.collateral_factor_bps)?)
            .ok_or(ReserveError::Overflow)?;
    }

    Ok((fair, prudential))
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PublishParams {
    /// Lamports per whole token, fixed forever at publication.
    pub initial_price: u64,
    pub min_capitalization: u64,
    pub max_capitalization: u64,
    pub subscription_ends_at: i64,
    pub entry_fee_bps: u16,
    /// Hash of the full published constitution. The document is the law; this
    /// is the anchor that proves which version the currency was sold under.
    pub version_hash: [u8; 32],
    /// Zero means the constitutional default.
    pub max_staleness_slots: u64,
    pub max_confidence_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CurrencyState {
    Capitalizing,
    Active,
    WindDown,
}

/// Up to four reserve assets beside SOL. Four is enough to express weights,
/// bands, drift and a correlated drawdown; more would only be more of the same,
/// and every extra asset is another oracle to trust.
pub const MAX_RESERVE_ASSETS: usize = 4;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq)]
pub struct ReserveAssetSlot {
    pub mint: Pubkey,
    pub price_feed: Pubkey,
    /// The treasury's token account for this asset.
    pub token_account: Pubkey,
    pub decimals: u8,
    pub target_weight_bps: u16,
    pub lower_band_bps: u16,
    pub upper_band_bps: u16,
    /// Prudential only. Never applied to a holder's claim.
    pub collateral_factor_bps: u16,
    pub active: bool,
}

impl ReserveAssetSlot {
    pub const SIZE: usize = 32 * 3 + 1 + 2 * 4 + 1;
}

#[account]
pub struct Constitution {
    pub authority: Pubkey,
    pub currency_mint: Pubkey,
    pub version_hash: [u8; 32],
    pub initial_price: u64,
    pub min_capitalization: u64,
    pub max_capitalization: u64,
    pub subscription_ends_at: i64,
    pub subscribed_lamports: u64,
    pub genesis_supply: u64,
    /// Every token owed, including genesis tokens not yet claimed. NAV divides
    /// by this rather than the mint's supply, or unclaimed holders would be
    /// silently diluted by everyone who claimed before them.
    pub outstanding_supply: u64,
    /// Spendable reserve, excluding the treasury PDA's own rent.
    pub reserve_lamports: u64,
    pub entry_fee_bps: u16,
    pub decimals: u8,
    pub state: CurrencyState,
    pub bump: u8,
    pub treasury_bump: u8,
    /// Beyond this a price is a memory, and valuation-sensitive operations stop.
    pub max_staleness_slots: u64,
    pub max_confidence_bps: u16,
    pub assets: [ReserveAssetSlot; MAX_RESERVE_ASSETS],
}

impl Constitution {
    pub const SIZE: usize = 8
        + 32 * 3
        + 8 * 7
        + 2
        + 1
        + 1
        + 1
        + 1
        + 8
        + 2
        + ReserveAssetSlot::SIZE * MAX_RESERVE_ASSETS
        + 16;

    /// Slots that actually hold something, in declaration order.
    pub fn active_assets(&self) -> impl Iterator<Item = (usize, &ReserveAssetSlot)> {
        self.assets
            .iter()
            .enumerate()
            .filter(|(_, slot)| slot.active)
    }
}

#[account]
pub struct SubscriptionReceipt {
    pub constitution: Pubkey,
    pub subscriber: Pubkey,
    pub lamports: u64,
    pub bump: u8,
}

impl SubscriptionReceipt {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AssetParams {
    pub target_weight_bps: u16,
    pub lower_band_bps: u16,
    pub upper_band_bps: u16,
    pub collateral_factor_bps: u16,
}

#[derive(Accounts)]
pub struct PublishPrice<'info> {
    #[account(mut)]
    pub publisher: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = publisher,
        space = PriceFeed::SIZE,
        seeds = [FEED_SEED, mint.key().as_ref()],
        bump,
    )]
    pub feed: Account<'info, PriceFeed>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterAsset<'info> {
    #[account(mut, address = constitution.authority @ ReserveError::NotAuthority)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        seeds = [FEED_SEED, asset_mint.key().as_ref()],
        bump = feed.bump,
        constraint = feed.mint == asset_mint.key() @ ReserveError::FeedMintMismatch,
    )]
    pub feed: Account<'info, PriceFeed>,
    /// The treasury's holding account, owned by the constitution PDA.
    #[account(
        constraint = treasury_tokens.mint == asset_mint.key() @ ReserveError::UnapprovedAsset,
        constraint = treasury_tokens.owner == constitution.key() @ ReserveError::UnapprovedAsset,
    )]
    pub treasury_tokens: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct DepositAsset<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub depositor_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Publish<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Constitution::SIZE,
        seeds = [CONSTITUTION_SEED, currency_mint.key().as_ref()],
        bump,
    )]
    pub constitution: Account<'info, Constitution>,
    /// The mint must already have this constitution PDA as its mint authority
    /// and, per invariant 7, no freeze authority at all.
    #[account(
        mint::authority = constitution,
        constraint = currency_mint.freeze_authority.is_none() @ ReserveError::FreezeAuthorityPresent,
        constraint = currency_mint.supply == 0 @ ReserveError::SupplyBeforePublication,
    )]
    pub currency_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: a bare system account that holds the reserve; seeds prove it.
    #[account(
        mut,
        seeds = [TREASURY_SEED, currency_mint.key().as_ref()],
        bump,
    )]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub subscriber: Signer<'info>,
    #[account(
        mut,
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
    #[account(
        init_if_needed,
        payer = subscriber,
        space = SubscriptionReceipt::SIZE,
        seeds = [
            SUBSCRIPTION_SEED,
            constitution.key().as_ref(),
            subscriber.key().as_ref(),
        ],
        bump,
    )]
    pub receipt: Account<'info, SubscriptionReceipt>,
    /// CHECK: seeds prove this is the treasury for this currency.
    #[account(
        mut,
        seeds = [TREASURY_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.treasury_bump,
    )]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Activate<'info> {
    /// Anyone may activate once the window has closed and the minimum is met.
    pub cranker: Signer<'info>,
    #[account(
        mut,
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub subscriber: Signer<'info>,
    #[account(
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
    #[account(
        mut,
        close = subscriber,
        seeds = [
            SUBSCRIPTION_SEED,
            constitution.key().as_ref(),
            subscriber.key().as_ref(),
        ],
        bump = receipt.bump,
        constraint = receipt.subscriber == subscriber.key() @ ReserveError::WrongSubscriber,
    )]
    pub receipt: Account<'info, SubscriptionReceipt>,
    #[account(mut, address = constitution.currency_mint)]
    pub currency_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = subscriber_tokens.mint == constitution.currency_mint,
        constraint = subscriber_tokens.owner == subscriber.key(),
    )]
    pub subscriber_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct MintCurrency<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        mut,
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
    #[account(mut, address = constitution.currency_mint)]
    pub currency_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = depositor_tokens.mint == constitution.currency_mint,
        constraint = depositor_tokens.owner == depositor.key(),
    )]
    pub depositor_tokens: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: seeds prove this is the treasury for this currency.
    #[account(
        mut,
        seeds = [TREASURY_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.treasury_bump,
    )]
    pub treasury: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(
        mut,
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
    #[account(mut, address = constitution.currency_mint)]
    pub currency_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = holder_tokens.mint == constitution.currency_mint,
        constraint = holder_tokens.owner == holder.key(),
    )]
    pub holder_tokens: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: seeds prove this is the treasury for this currency.
    #[account(
        mut,
        seeds = [TREASURY_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.treasury_bump,
    )]
    pub treasury: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BeginWindDown<'info> {
    #[account(address = constitution.authority @ ReserveError::NotAuthority)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONSTITUTION_SEED, constitution.currency_mint.as_ref()],
        bump = constitution.bump,
    )]
    pub constitution: Account<'info, Constitution>,
}

#[event]
pub struct PricePublished {
    pub mint: Pubkey,
    pub lamports_per_whole: u64,
    pub confidence_bps: u16,
    pub slot: u64,
}

#[event]
pub struct AssetRegistered {
    pub constitution: Pubkey,
    pub mint: Pubkey,
    pub target_weight_bps: u16,
    pub collateral_factor_bps: u16,
}

#[event]
pub struct CurrencyPublished {
    pub constitution: Pubkey,
    pub currency_mint: Pubkey,
    pub initial_price: u64,
    pub version_hash: [u8; 32],
}

#[event]
pub struct CurrencyActivated {
    pub constitution: Pubkey,
    pub funded_lamports: u64,
    pub genesis_supply: u64,
}

#[event]
pub struct SubscriptionClaimed {
    pub constitution: Pubkey,
    pub subscriber: Pubkey,
    pub tokens: u64,
}

#[event]
pub struct CurrencyMinted {
    pub constitution: Pubkey,
    pub depositor: Pubkey,
    pub lamports: u64,
    pub fee: u64,
    pub tokens: u64,
}

#[event]
pub struct CurrencyRedeemed {
    pub constitution: Pubkey,
    pub holder: Pubkey,
    pub tokens: u64,
    pub lamports: u64,
}

#[event]
pub struct WindDownBegan {
    pub constitution: Pubkey,
    pub reserve_lamports: u64,
    pub outstanding_supply: u64,
}

#[error_code]
pub enum ReserveError {
    #[msg("The published price must be greater than zero.")]
    InvalidPrice,
    #[msg("Minimum capitalization must be positive and no greater than the maximum.")]
    InvalidCapitalization,
    #[msg("A fee cannot be one hundred percent or more.")]
    InvalidFee,
    #[msg("The subscription window must close in the future.")]
    WindowInPast,
    #[msg("The currency is not in the state this instruction requires.")]
    WrongState,
    #[msg("The subscription window has closed.")]
    WindowClosed,
    #[msg("The subscription window is still open.")]
    WindowOpen,
    #[msg("This subscription would exceed the published maximum capitalization.")]
    MaximumExceeded,
    #[msg("Minimum capitalization was not reached.")]
    MinimumNotReached,
    #[msg("Funded capital is too small to mint any supply.")]
    EmptySupply,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("This amount is too small to change any balance.")]
    DustAmount,
    #[msg("This receipt belongs to another subscriber.")]
    WrongSubscriber,
    #[msg("Only the published authority may do this.")]
    NotAuthority,
    #[msg("The currency mint must have no freeze authority.")]
    FreezeAuthorityPresent,
    #[msg("The currency mint already has supply.")]
    SupplyBeforePublication,
    #[msg("A collateral factor cannot exceed one hundred percent.")]
    InvalidCollateralFactor,
    #[msg("The allocation band must contain its own target weight.")]
    InvalidBand,
    #[msg("This currency already holds the maximum number of reserve assets.")]
    TooManyAssets,
    #[msg("That asset is already registered; a mint occupies exactly one slot.")]
    AssetAlreadyRegistered,
    #[msg("That asset is not on this currency's approved list.")]
    UnapprovedAsset,
    #[msg("That price feed prices a different asset.")]
    FeedMintMismatch,
    #[msg("A reserve asset is missing its treasury account or price feed.")]
    MissingValuationAccount,
    #[msg("A price feed is stale, too uncertain, or empty; valuation is paused.")]
    FeedUnusable,
    #[msg("The liquid SOL sleeve cannot cover this redemption. Redeem in kind instead.")]
    InsufficientLiquidSleeve,
    #[msg("Arithmetic overflowed.")]
    Overflow,
}
