//! Bounded economic authority for a personal agent.
//!
//! An agent never owns its human's wallet. It holds a mandate: a spend limit, a
//! per-transaction ceiling, a list of counterparties it may pay, a window it is
//! valid for, and a revocation the human can exercise at any moment without
//! asking anyone.
//!
//! This is the program that works whether or not a currency ever exists. It is
//! the same shape as the bounded, expiring, revocable leases the Sylla app
//! already issues for agent runs, applied to money instead of compute.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("EiK8fXf4oeSrmKc78dnmRV5fgY7coqpgQ6zewYhFavuo");

pub const MANDATE_SEED: &[u8] = b"mandate";
pub const VAULT_SEED: &[u8] = b"mandate-vault";
/// Enough counterparties to be useful, few enough that the list stays legible
/// to the human approving it.
pub const MAX_COUNTERPARTIES: usize = 8;

#[program]
pub mod sylla_mandate {
    use super::*;

    /// Grant an agent bounded authority to spend on the human's behalf.
    pub fn grant(ctx: Context<Grant>, params: MandateParams) -> Result<()> {
        require!(params.total_limit > 0, MandateError::ZeroLimit);
        require!(
            params.per_transaction_limit > 0
                && params.per_transaction_limit <= params.total_limit,
            MandateError::InvalidPerTransactionLimit
        );
        require!(
            params.counterparties.len() <= MAX_COUNTERPARTIES,
            MandateError::TooManyCounterparties
        );
        let now = Clock::get()?.unix_timestamp;
        require!(params.expires_at > now, MandateError::AlreadyExpired);
        require!(params.valid_from < params.expires_at, MandateError::InvalidWindow);

        let mandate = &mut ctx.accounts.mandate;
        mandate.human = ctx.accounts.human.key();
        mandate.agent = ctx.accounts.agent.key();
        mandate.total_limit = params.total_limit;
        mandate.per_transaction_limit = params.per_transaction_limit;
        mandate.spent = 0;
        mandate.counterparties = params.counterparties;
        mandate.valid_from = params.valid_from;
        mandate.expires_at = params.expires_at;
        mandate.revoked = false;
        mandate.revoked_at = 0;
        mandate.bump = ctx.bumps.mandate;
        mandate.vault_bump = ctx.bumps.vault;

        // Fund the mandate's own vault. The agent spends from here and can
        // never reach the human's wallet, so the ceiling is physical as well
        // as arithmetic.
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.human.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            params
                .total_limit
                .checked_add(Rent::get()?.minimum_balance(0))
                .ok_or(MandateError::Overflow)?,
        )?;

        emit!(MandateGranted {
            mandate: mandate.key(),
            human: mandate.human,
            agent: mandate.agent,
            total_limit: mandate.total_limit,
            expires_at: mandate.expires_at,
        });
        Ok(())
    }

    /// Spend against the mandate. The agent signs; the human does not.
    ///
    /// Every bound is checked here rather than trusted to the caller: window,
    /// revocation, per-transaction ceiling, cumulative total, and whether this
    /// counterparty was ever approved.
    pub fn spend(ctx: Context<Spend>, lamports: u64) -> Result<()> {
        require!(lamports > 0, MandateError::ZeroAmount);
        let now = Clock::get()?.unix_timestamp;
        let mandate = &mut ctx.accounts.mandate;

        require!(!mandate.revoked, MandateError::Revoked);
        require!(now >= mandate.valid_from, MandateError::NotYetValid);
        require!(now < mandate.expires_at, MandateError::Expired);
        require!(
            lamports <= mandate.per_transaction_limit,
            MandateError::PerTransactionLimitExceeded
        );

        let spent = mandate
            .spent
            .checked_add(lamports)
            .ok_or(MandateError::Overflow)?;
        require!(spent <= mandate.total_limit, MandateError::TotalLimitExceeded);

        // An empty list means the human approved no one. That is a mandate to
        // spend nothing, not a mandate to spend anywhere.
        require!(
            mandate.counterparties.contains(&ctx.accounts.counterparty.key()),
            MandateError::CounterpartyNotPermitted
        );

        let human = mandate.human;
        let agent = mandate.agent;
        let vault_seeds: &[&[u8]] = &[
            VAULT_SEED,
            human.as_ref(),
            agent.as_ref(),
            &[mandate.vault_bump],
        ];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.counterparty.to_account_info(),
                },
                &[vault_seeds],
            ),
            lamports,
        )?;

        mandate.spent = spent;
        emit!(MandateSpent {
            mandate: mandate.key(),
            counterparty: ctx.accounts.counterparty.key(),
            lamports,
            remaining: mandate.total_limit - spent,
        });
        Ok(())
    }

    /// Revoke immediately.
    ///
    /// Only the human. No notice, no cooling-off, no counter-signature, and no
    /// state in which this is unavailable — including while the agent is
    /// mid-task. Unspent funds return in the same instruction.
    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let mandate = &mut ctx.accounts.mandate;
        require!(!mandate.revoked, MandateError::Revoked);
        // A separate flag rather than a zero sentinel: a revocation at unix
        // timestamp zero is unlikely but a sentinel that can be a real value
        // is a bug waiting for the one clock that reads it.
        mandate.revoked = true;
        mandate.revoked_at = now;

        let human = mandate.human;
        let agent = mandate.agent;
        let vault_seeds: &[&[u8]] = &[
            VAULT_SEED,
            human.as_ref(),
            agent.as_ref(),
            &[mandate.vault_bump],
        ];
        let refundable = ctx
            .accounts
            .vault
            .lamports()
            .saturating_sub(Rent::get()?.minimum_balance(0));
        if refundable > 0 {
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.human.to_account_info(),
                    },
                    &[vault_seeds],
                ),
                refundable,
            )?;
        }

        emit!(MandateRevoked {
            mandate: mandate.key(),
            refunded: refundable,
            spent: mandate.spent,
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MandateParams {
    pub total_limit: u64,
    pub per_transaction_limit: u64,
    pub counterparties: Vec<Pubkey>,
    pub valid_from: i64,
    pub expires_at: i64,
}

#[account]
pub struct Mandate {
    pub human: Pubkey,
    pub agent: Pubkey,
    pub total_limit: u64,
    pub per_transaction_limit: u64,
    pub spent: u64,
    pub counterparties: Vec<Pubkey>,
    pub valid_from: i64,
    pub expires_at: i64,
    pub revoked: bool,
    pub revoked_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}
impl Mandate {
    pub const SIZE: usize =
        8 + 32 + 32 + 8 * 3 + (4 + 32 * MAX_COUNTERPARTIES) + 8 * 3 + 1 + 1 + 1 + 8;
}

#[derive(Accounts)]
pub struct Grant<'info> {
    #[account(mut)]
    pub human: Signer<'info>,
    /// CHECK: identified by address; the agent does not sign a grant.
    pub agent: UncheckedAccount<'info>,
    #[account(
        init,
        payer = human,
        space = Mandate::SIZE,
        seeds = [MANDATE_SEED, human.key().as_ref(), agent.key().as_ref()],
        bump,
    )]
    pub mandate: Account<'info, Mandate>,
    /// CHECK: the mandate's own SOL vault; seeds prove it.
    #[account(
        mut,
        seeds = [VAULT_SEED, human.key().as_ref(), agent.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Spend<'info> {
    #[account(address = mandate.agent @ MandateError::NotAgent)]
    pub agent: Signer<'info>,
    #[account(
        mut,
        seeds = [MANDATE_SEED, mandate.human.as_ref(), mandate.agent.as_ref()],
        bump = mandate.bump,
    )]
    pub mandate: Account<'info, Mandate>,
    /// CHECK: seeds prove this is the mandate's vault.
    #[account(
        mut,
        seeds = [VAULT_SEED, mandate.human.as_ref(), mandate.agent.as_ref()],
        bump = mandate.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: must appear on the human's approved list; verified in the handler.
    #[account(mut)]
    pub counterparty: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Revoke<'info> {
    #[account(mut, address = mandate.human @ MandateError::NotHuman)]
    pub human: Signer<'info>,
    #[account(
        mut,
        seeds = [MANDATE_SEED, mandate.human.as_ref(), mandate.agent.as_ref()],
        bump = mandate.bump,
    )]
    pub mandate: Account<'info, Mandate>,
    /// CHECK: seeds prove this is the mandate's vault.
    #[account(
        mut,
        seeds = [VAULT_SEED, mandate.human.as_ref(), mandate.agent.as_ref()],
        bump = mandate.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct MandateGranted {
    pub mandate: Pubkey,
    pub human: Pubkey,
    pub agent: Pubkey,
    pub total_limit: u64,
    pub expires_at: i64,
}
#[event]
pub struct MandateSpent {
    pub mandate: Pubkey,
    pub counterparty: Pubkey,
    pub lamports: u64,
    pub remaining: u64,
}
#[event]
pub struct MandateRevoked { pub mandate: Pubkey, pub refunded: u64, pub spent: u64 }

#[error_code]
pub enum MandateError {
    #[msg("A mandate must permit some spending.")]
    ZeroLimit,
    #[msg("The per-transaction limit must be positive and within the total.")]
    InvalidPerTransactionLimit,
    #[msg("More counterparties than a human can reasonably review.")]
    TooManyCounterparties,
    #[msg("The mandate would expire before it began.")]
    AlreadyExpired,
    #[msg("The validity window is inverted.")]
    InvalidWindow,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("This mandate was revoked.")]
    Revoked,
    #[msg("This mandate is not valid yet.")]
    NotYetValid,
    #[msg("This mandate has expired.")]
    Expired,
    #[msg("This payment exceeds the per-transaction limit.")]
    PerTransactionLimitExceeded,
    #[msg("This payment exceeds the mandate's total limit.")]
    TotalLimitExceeded,
    #[msg("This counterparty is not on the human's approved list.")]
    CounterpartyNotPermitted,
    #[msg("Only the agent named in the mandate may spend.")]
    NotAgent,
    #[msg("Only the human principal may revoke.")]
    NotHuman,
    #[msg("Arithmetic overflowed.")]
    Overflow,
}
