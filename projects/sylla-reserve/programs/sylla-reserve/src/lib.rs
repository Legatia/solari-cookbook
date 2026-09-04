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
    burn, mint_to, Burn, Mint, MintTo, TokenAccount, TokenInterface,
};

pub mod math;
use crate::math::*;

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
        // Priced against the reserve as it stands before this deposit lands.
        let tokens = tokens_for_deposit(
            net,
            constitution.reserve_lamports,
            constitution.outstanding_supply,
        )?;
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

        let owed = lamports_for_redemption(
            tokens,
            constitution.reserve_lamports,
            constitution.outstanding_supply,
        )?;
        require!(owed > 0, ReserveError::DustAmount);
        require!(owed <= constitution.reserve_lamports, ReserveError::Overflow);

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
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CurrencyState {
    Capitalizing,
    Active,
    WindDown,
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
}

impl Constitution {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 * 7 + 2 + 1 + 1 + 1 + 1 + 8;
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
    #[msg("Arithmetic overflowed.")]
    Overflow,
}
