//! Agent-contract escrow and settlement.
//!
//! Escrow lives here rather than inside a charter, and that placement is the
//! whole design decision. If a charter custodied in-flight contracts, freezing
//! a misbehaving charter would strand every counterparty it was working with —
//! including people who are not its holders and did nothing wrong. Holding
//! escrow at the clearing layer means a sanction can stop an institution
//! without touching the obligations it had already entered.
//!
//! Nothing here can be seized. A disputed escrow does not move to a third
//! party; it simply stops, and refunds to the payer when the deadline passes.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("Ez2UhS3Wm5q7ZicyrjS4okysQBvpAyb7gseXq23GYfDy");

pub const ESCROW_SEED: &[u8] = b"escrow";
pub const ESCROW_VAULT_SEED: &[u8] = b"escrow-vault";

#[program]
pub mod sylla_clearing {
    use super::*;

    /// Lock funds for a specific piece of agreed work.
    pub fn open_escrow(
        ctx: Context<OpenEscrow>,
        escrow_id: [u8; 32],
        lamports: u64,
        deadline: i64,
    ) -> Result<()> {
        require!(lamports > 0, ClearingError::ZeroAmount);
        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, ClearingError::DeadlineInPast);

        let escrow = &mut ctx.accounts.escrow;
        escrow.escrow_id = escrow_id;
        escrow.payer = ctx.accounts.payer.key();
        escrow.payee = ctx.accounts.payee.key();
        escrow.lamports = lamports;
        escrow.deadline = deadline;
        escrow.state = EscrowState::Open;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            lamports
                .checked_add(Rent::get()?.minimum_balance(0))
                .ok_or(ClearingError::Overflow)?,
        )?;

        emit!(EscrowOpened {
            escrow: escrow.key(),
            payer: escrow.payer,
            payee: escrow.payee,
            lamports,
            deadline,
        });
        Ok(())
    }

    /// Release to the payee. Only the payer, and only while the escrow is open.
    ///
    /// There is no arbitration path that moves money to a third party. Work was
    /// accepted or it was not.
    pub fn release(ctx: Context<Settle>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, ClearingError::NotOpen);
        require!(
            ctx.accounts.signer.key() == escrow.payer,
            ClearingError::OnlyPayerMayRelease
        );
        pay_out(
            &ctx.accounts.vault,
            &ctx.accounts.counterparty,
            &ctx.accounts.system_program,
            escrow,
            escrow.payee,
        )?;
        escrow.state = EscrowState::Released;
        emit!(EscrowSettled { escrow: escrow.key(), to: escrow.payee, lamports: escrow.lamports });
        Ok(())
    }

    /// Refund the payer after the deadline.
    ///
    /// Permissionless once the clock runs out, so funds cannot be stranded by a
    /// payee who simply stops responding.
    pub fn refund(ctx: Context<Settle>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.state == EscrowState::Open || escrow.state == EscrowState::Disputed,
            ClearingError::NotOpen
        );
        require!(now >= escrow.deadline, ClearingError::DeadlineNotReached);
        pay_out(
            &ctx.accounts.vault,
            &ctx.accounts.counterparty,
            &ctx.accounts.system_program,
            escrow,
            escrow.payer,
        )?;
        escrow.state = EscrowState::Refunded;
        emit!(EscrowSettled { escrow: escrow.key(), to: escrow.payer, lamports: escrow.lamports });
        Ok(())
    }

    /// Mark a disagreement. Records only — the money does not move.
    pub fn dispute(ctx: Context<Dispute>, reason_hash: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, ClearingError::NotOpen);
        let signer = ctx.accounts.signer.key();
        require!(
            signer == escrow.payer || signer == escrow.payee,
            ClearingError::NotAParty
        );
        escrow.state = EscrowState::Disputed;
        escrow.reason_hash = reason_hash;
        emit!(EscrowDisputed { escrow: escrow.key(), by: signer, reason_hash });
        Ok(())
    }
}

fn pay_out<'info>(
    vault: &UncheckedAccount<'info>,
    counterparty: &UncheckedAccount<'info>,
    system_program: &Program<'info, System>,
    escrow: &Escrow,
    expected: Pubkey,
) -> Result<()> {
    require!(counterparty.key() == expected, ClearingError::WrongCounterparty);
    let payer = escrow.payer;
    let seeds: &[&[u8]] = &[
        ESCROW_VAULT_SEED,
        payer.as_ref(),
        escrow.escrow_id.as_ref(),
        &[escrow.vault_bump],
    ];
    transfer(
        CpiContext::new_with_signer(
            system_program.to_account_info(),
            Transfer {
                from: vault.to_account_info(),
                to: counterparty.to_account_info(),
            },
            &[seeds],
        ),
        escrow.lamports,
    )
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowState {
    Open,
    Disputed,
    Released,
    Refunded,
}

#[account]
pub struct Escrow {
    pub escrow_id: [u8; 32],
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub lamports: u64,
    pub deadline: i64,
    pub reason_hash: [u8; 32],
    pub state: EscrowState,
    pub bump: u8,
    pub vault_bump: u8,
}
impl Escrow {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 32 + 2 + 1 + 1 + 8;
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct OpenEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: identified by address; the payee does not sign to be paid.
    pub payee: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = Escrow::SIZE,
        seeds = [ESCROW_SEED, payer.key().as_ref(), escrow_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: the escrow's own vault; seeds prove it.
    #[account(
        mut,
        seeds = [ESCROW_VAULT_SEED, payer.key().as_ref(), escrow_id.as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.payer.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: seeds prove the vault.
    #[account(
        mut,
        seeds = [ESCROW_VAULT_SEED, escrow.payer.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: must equal the party this settlement pays; checked in `pay_out`.
    #[account(mut)]
    pub counterparty: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Dispute<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.payer.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[event]
pub struct EscrowOpened {
    pub escrow: Pubkey,
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub lamports: u64,
    pub deadline: i64,
}
#[event]
pub struct EscrowSettled { pub escrow: Pubkey, pub to: Pubkey, pub lamports: u64 }
#[event]
pub struct EscrowDisputed { pub escrow: Pubkey, pub by: Pubkey, pub reason_hash: [u8; 32] }

#[error_code]
pub enum ClearingError {
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("The deadline must be in the future.")]
    DeadlineInPast,
    #[msg("This escrow is not open.")]
    NotOpen,
    #[msg("Only the payer may release an escrow.")]
    OnlyPayerMayRelease,
    #[msg("The deadline has not been reached.")]
    DeadlineNotReached,
    #[msg("Only the payer or payee may dispute.")]
    NotAParty,
    #[msg("This settlement pays a different party.")]
    WrongCounterparty,
    #[msg("Arithmetic overflowed.")]
    Overflow,
}
