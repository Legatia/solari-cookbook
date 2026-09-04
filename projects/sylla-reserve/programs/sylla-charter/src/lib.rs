//! Chartered institutions: sponsor bonds and segregated capital.
//!
//! After the mandatory reserve allocation was removed from the protocol, the
//! sponsor bond is the only economic instrument the protocol can reach. This
//! program exists to keep two pools of money visibly and mechanically apart:
//!
//!   * the **holder reserve**, which belongs to the charter's currency holders
//!     and can never be slashed, and
//!   * the **sponsor bond**, funded by founders and operators, which is the
//!     only thing an adjudicated violation can take.
//!
//! Freeze is prospective — it stops further harm. The bond is retrospective —
//! it pays for harm already done. Neither substitutes for the other, which is
//! why both exist.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("ACCizZVbLXRwU6WQqjf1HuowuXcJydoadZM4cU6fntQv");

pub const CHARTER_SEED: &[u8] = b"charter";
pub const BOND_SEED: &[u8] = b"sponsor-bond";

/// A bond cannot be withdrawn the moment trouble appears. This window exists so
/// harmed holders can surface a claim before the sponsor walks away with it.
pub const MIN_EXIT_CLAIMS_SECONDS: i64 = 30 * 24 * 60 * 60;

#[program]
pub mod sylla_charter {
    use super::*;

    /// Open a charter by posting its sponsor bond.
    ///
    /// The bond lands in a program-owned vault, not the sponsor's account. A
    /// bond the sponsor can still move is a promise, not a bond.
    pub fn open_charter(ctx: Context<OpenCharter>, params: CharterParams) -> Result<()> {
        require!(params.bond_lamports > 0, CharterError::BondRequired);
        require!(
            params.minimum_liquid_sleeve_bps <= 10_000,
            CharterError::InvalidSleeve
        );

        let charter = &mut ctx.accounts.charter;
        charter.sponsor = ctx.accounts.sponsor.key();
        charter.currency_mint = ctx.accounts.currency_mint.key();
        charter.constitution = params.constitution;
        charter.purpose_hash = params.purpose_hash;
        charter.bond_lamports = params.bond_lamports;
        charter.minimum_liquid_sleeve_bps = params.minimum_liquid_sleeve_bps;
        charter.status = CharterLifecycle::Active;
        charter.exit_claims_ends_at = 0;
        charter.bump = ctx.bumps.charter;
        charter.bond_bump = ctx.bumps.bond_vault;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.sponsor.to_account_info(),
                    to: ctx.accounts.bond_vault.to_account_info(),
                },
            ),
            params
                .bond_lamports
                .checked_add(Rent::get()?.minimum_balance(0))
                .ok_or(CharterError::Overflow)?,
        )?;

        emit!(CharterOpened {
            charter: charter.key(),
            sponsor: charter.sponsor,
            bond_lamports: charter.bond_lamports,
        });
        Ok(())
    }

    /// Add to the bond. Always allowed — raising your own stake is never a risk.
    pub fn top_up_bond(ctx: Context<TopUpBond>, lamports: u64) -> Result<()> {
        require!(lamports > 0, CharterError::ZeroAmount);
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.sponsor.to_account_info(),
                    to: ctx.accounts.bond_vault.to_account_info(),
                },
            ),
            lamports,
        )?;
        let charter = &mut ctx.accounts.charter;
        charter.bond_lamports = charter
            .bond_lamports
            .checked_add(lamports)
            .ok_or(CharterError::Overflow)?;
        Ok(())
    }

    /// Begin winding the charter down and start the claims clock.
    pub fn request_bond_release(
        ctx: Context<SponsorAction>,
        claims_seconds: i64,
    ) -> Result<()> {
        require!(
            claims_seconds >= MIN_EXIT_CLAIMS_SECONDS,
            CharterError::ClaimsPeriodTooShort
        );
        let now = Clock::get()?.unix_timestamp;
        let charter = &mut ctx.accounts.charter;
        require!(charter.status == CharterLifecycle::Active, CharterError::WrongStatus);
        charter.status = CharterLifecycle::Exiting;
        charter.exit_claims_ends_at = now
            .checked_add(claims_seconds)
            .ok_or(CharterError::Overflow)?;
        emit!(BondReleaseRequested {
            charter: charter.key(),
            claims_end: charter.exit_claims_ends_at,
        });
        Ok(())
    }

    /// Return the bond once the claims period has run with nothing outstanding.
    pub fn release_bond(ctx: Context<ReleaseBond>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let charter = &mut ctx.accounts.charter;
        require!(charter.status == CharterLifecycle::Exiting, CharterError::WrongStatus);
        require!(now >= charter.exit_claims_ends_at, CharterError::ClaimsPeriodOpen);
        require!(charter.open_claims == 0, CharterError::ClaimsOutstanding);

        let mint = charter.currency_mint;
        let seeds: &[&[u8]] = &[BOND_SEED, mint.as_ref(), &[charter.bond_bump]];
        let payout = charter.bond_lamports;
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bond_vault.to_account_info(),
                    to: ctx.accounts.sponsor.to_account_info(),
                },
                &[seeds],
            ),
            payout,
        )?;
        charter.bond_lamports = 0;
        charter.status = CharterLifecycle::Closed;
        emit!(BondReleased { charter: charter.key(), lamports: payout });
        Ok(())
    }

    /// Record a claim against the bond, which blocks its release.
    ///
    /// Recording a claim is deliberately cheap and permissionless. Deciding one
    /// is not, and does not happen here.
    pub fn record_claim(ctx: Context<RecordClaim>) -> Result<()> {
        let charter = &mut ctx.accounts.charter;
        charter.open_claims = charter
            .open_claims
            .checked_add(1)
            .ok_or(CharterError::Overflow)?;
        emit!(ClaimRecorded { charter: charter.key(), open_claims: charter.open_claims });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CharterParams {
    pub constitution: Pubkey,
    pub purpose_hash: [u8; 32],
    pub bond_lamports: u64,
    pub minimum_liquid_sleeve_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CharterLifecycle {
    Active,
    Exiting,
    Closed,
}

#[account]
pub struct Charter {
    pub sponsor: Pubkey,
    pub currency_mint: Pubkey,
    pub constitution: Pubkey,
    pub purpose_hash: [u8; 32],
    pub bond_lamports: u64,
    /// The share of the holder reserve kept liquid, so part of every claim can
    /// be met instantly in resolution without a forced sale.
    pub minimum_liquid_sleeve_bps: u16,
    pub open_claims: u32,
    pub exit_claims_ends_at: i64,
    pub status: CharterLifecycle,
    pub bump: u8,
    pub bond_bump: u8,
}
impl Charter {
    pub const SIZE: usize = 8 + 32 * 3 + 32 + 8 + 2 + 4 + 8 + 2 + 1 + 1 + 8;
}

#[derive(Accounts)]
pub struct OpenCharter<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    /// CHECK: identified by address only.
    pub currency_mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = sponsor,
        space = Charter::SIZE,
        seeds = [CHARTER_SEED, currency_mint.key().as_ref()],
        bump,
    )]
    pub charter: Account<'info, Charter>,
    /// CHECK: program-derived bond vault; the sponsor cannot move it.
    #[account(mut, seeds = [BOND_SEED, currency_mint.key().as_ref()], bump)]
    pub bond_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TopUpBond<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(mut, seeds = [CHARTER_SEED, charter.currency_mint.as_ref()], bump = charter.bump)]
    pub charter: Account<'info, Charter>,
    /// CHECK: seeds prove the vault.
    #[account(mut, seeds = [BOND_SEED, charter.currency_mint.as_ref()], bump = charter.bond_bump)]
    pub bond_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SponsorAction<'info> {
    #[account(address = charter.sponsor @ CharterError::NotSponsor)]
    pub sponsor: Signer<'info>,
    #[account(mut, seeds = [CHARTER_SEED, charter.currency_mint.as_ref()], bump = charter.bump)]
    pub charter: Account<'info, Charter>,
}

#[derive(Accounts)]
pub struct ReleaseBond<'info> {
    #[account(mut, address = charter.sponsor @ CharterError::NotSponsor)]
    pub sponsor: Signer<'info>,
    #[account(mut, seeds = [CHARTER_SEED, charter.currency_mint.as_ref()], bump = charter.bump)]
    pub charter: Account<'info, Charter>,
    /// CHECK: seeds prove the vault.
    #[account(mut, seeds = [BOND_SEED, charter.currency_mint.as_ref()], bump = charter.bond_bump)]
    pub bond_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordClaim<'info> {
    /// Anyone harmed, or anyone acting for them.
    pub claimant: Signer<'info>,
    #[account(mut, seeds = [CHARTER_SEED, charter.currency_mint.as_ref()], bump = charter.bump)]
    pub charter: Account<'info, Charter>,
}

#[event]
pub struct CharterOpened { pub charter: Pubkey, pub sponsor: Pubkey, pub bond_lamports: u64 }
#[event]
pub struct BondReleaseRequested { pub charter: Pubkey, pub claims_end: i64 }
#[event]
pub struct BondReleased { pub charter: Pubkey, pub lamports: u64 }
#[event]
pub struct ClaimRecorded { pub charter: Pubkey, pub open_claims: u32 }

#[error_code]
pub enum CharterError {
    #[msg("A charter must post a sponsor bond.")]
    BondRequired,
    #[msg("The liquid sleeve must be a share of the reserve.")]
    InvalidSleeve,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("The claims period is shorter than the constitutional minimum.")]
    ClaimsPeriodTooShort,
    #[msg("The claims period is still open.")]
    ClaimsPeriodOpen,
    #[msg("Claims are outstanding against this bond.")]
    ClaimsOutstanding,
    #[msg("The charter is not in the required status.")]
    WrongStatus,
    #[msg("Only the sponsor may do this.")]
    NotSponsor,
    #[msg("Arithmetic overflowed.")]
    Overflow,
}
