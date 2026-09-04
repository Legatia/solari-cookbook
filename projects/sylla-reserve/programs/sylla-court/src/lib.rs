//! The Court: a record, and deliberately nothing more.
//!
//! The protocol document is explicit that this is a research placeholder rather
//! than deployable discretionary authority. Until adjudicator selection,
//! evidence standards, compensation, conflicts, appeal rights and maximum
//! penalties are specified, a Court that could move value would be an
//! unaccountable power wearing a judicial name.
//!
//! So this program is inert by construction, not by policy:
//!
//!   * it imports no token program and no system transfer,
//!   * it declares no vault, no mint and no token account in any context, and
//!   * every instruction writes a record and returns.
//!
//! A decision here is testimony that can be pointed at. Acting on one requires
//! a separate, specified process that does not exist yet. If a future version
//! gains the power to slash, that power should arrive with the procedure that
//! constrains it — in the same commit, not a later one.

use anchor_lang::prelude::*;

declare_id!("A3gSnb7GkuwMzSZZAYPXtbfiGfeZ8fJxw7zhsJLRfsYP");

pub const DOCKET_SEED: &[u8] = b"docket";

/// A decision is not self-executing. Nothing in this program consumes it; it
/// exists to be read by humans and by a future enforcement path that must be
/// specified before it is built.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CaseStatus {
    Opened,
    Answered,
    Decided,
    Appealed,
    Withdrawn,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Finding {
    NotProven,
    Proven,
    OutOfScope,
}

#[program]
pub mod sylla_court {
    use super::*;

    /// Open a case against a charter. Anyone may file.
    pub fn open_case(
        ctx: Context<OpenCase>,
        case_id: [u8; 32],
        claim_hash: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let docket = &mut ctx.accounts.docket;
        docket.case_id = case_id;
        docket.charter = ctx.accounts.charter.key();
        docket.complainant = ctx.accounts.complainant.key();
        docket.claim_hash = claim_hash;
        docket.response_hash = [0u8; 32];
        docket.decision_hash = [0u8; 32];
        docket.finding = Finding::NotProven;
        docket.status = CaseStatus::Opened;
        docket.opened_at = clock.unix_timestamp;
        docket.decided_at = 0;
        docket.bump = ctx.bumps.docket;
        emit!(CaseOpened { docket: docket.key(), charter: docket.charter, claim_hash });
        Ok(())
    }

    /// The charter answers. A case cannot be decided before this is possible,
    /// which is the only piece of due process this program can enforce alone.
    pub fn record_response(ctx: Context<RecordResponse>, response_hash: [u8; 32]) -> Result<()> {
        let docket = &mut ctx.accounts.docket;
        require!(docket.status == CaseStatus::Opened, CourtError::WrongStatus);
        docket.response_hash = response_hash;
        docket.status = CaseStatus::Answered;
        emit!(ResponseRecorded { docket: docket.key(), response_hash });
        Ok(())
    }

    /// Record a decision.
    ///
    /// This changes no balance anywhere. It is a published finding that a human
    /// process may later act on, and its only on-chain effect is to exist.
    pub fn record_decision(
        ctx: Context<RecordDecision>,
        finding: Finding,
        decision_hash: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let docket = &mut ctx.accounts.docket;
        require!(
            docket.status == CaseStatus::Answered,
            CourtError::AnswerRequiredBeforeDecision
        );
        docket.finding = finding;
        docket.decision_hash = decision_hash;
        docket.status = CaseStatus::Decided;
        docket.decided_at = clock.unix_timestamp;
        emit!(DecisionRecorded {
            docket: docket.key(),
            charter: docket.charter,
            finding,
            decision_hash,
            enforceable: false,
        });
        Ok(())
    }

    /// Note an appeal. Also purely a record.
    pub fn record_appeal(ctx: Context<RecordResponse>, appeal_hash: [u8; 32]) -> Result<()> {
        let docket = &mut ctx.accounts.docket;
        require!(docket.status == CaseStatus::Decided, CourtError::WrongStatus);
        docket.response_hash = appeal_hash;
        docket.status = CaseStatus::Appealed;
        emit!(AppealRecorded { docket: docket.key(), appeal_hash });
        Ok(())
    }

    /// The complainant withdraws.
    pub fn withdraw_case(ctx: Context<WithdrawCase>) -> Result<()> {
        let docket = &mut ctx.accounts.docket;
        require!(
            docket.status == CaseStatus::Opened || docket.status == CaseStatus::Answered,
            CourtError::WrongStatus
        );
        docket.status = CaseStatus::Withdrawn;
        Ok(())
    }
}

#[account]
pub struct Docket {
    pub case_id: [u8; 32],
    pub charter: Pubkey,
    pub complainant: Pubkey,
    pub claim_hash: [u8; 32],
    pub response_hash: [u8; 32],
    pub decision_hash: [u8; 32],
    pub finding: Finding,
    pub status: CaseStatus,
    pub opened_at: i64,
    pub decided_at: i64,
    pub bump: u8,
}
impl Docket {
    pub const SIZE: usize = 8 + 32 * 5 + 32 + 2 + 2 + 8 + 8 + 1 + 8;
}

#[derive(Accounts)]
#[instruction(case_id: [u8; 32])]
pub struct OpenCase<'info> {
    #[account(mut)]
    pub complainant: Signer<'info>,
    /// CHECK: the charter complained of, by address.
    pub charter: UncheckedAccount<'info>,
    #[account(
        init,
        payer = complainant,
        space = Docket::SIZE,
        seeds = [DOCKET_SEED, charter.key().as_ref(), case_id.as_ref()],
        bump,
    )]
    pub docket: Account<'info, Docket>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordResponse<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [DOCKET_SEED, docket.charter.as_ref(), docket.case_id.as_ref()],
        bump = docket.bump,
    )]
    pub docket: Account<'info, Docket>,
}

#[derive(Accounts)]
pub struct RecordDecision<'info> {
    pub adjudicator: Signer<'info>,
    #[account(
        mut,
        seeds = [DOCKET_SEED, docket.charter.as_ref(), docket.case_id.as_ref()],
        bump = docket.bump,
    )]
    pub docket: Account<'info, Docket>,
}

#[derive(Accounts)]
pub struct WithdrawCase<'info> {
    #[account(address = docket.complainant @ CourtError::NotComplainant)]
    pub complainant: Signer<'info>,
    #[account(
        mut,
        seeds = [DOCKET_SEED, docket.charter.as_ref(), docket.case_id.as_ref()],
        bump = docket.bump,
    )]
    pub docket: Account<'info, Docket>,
}

#[event]
pub struct CaseOpened { pub docket: Pubkey, pub charter: Pubkey, pub claim_hash: [u8; 32] }
#[event]
pub struct ResponseRecorded { pub docket: Pubkey, pub response_hash: [u8; 32] }
#[event]
pub struct DecisionRecorded {
    pub docket: Pubkey,
    pub charter: Pubkey,
    pub finding: Finding,
    pub decision_hash: [u8; 32],
    /// Always false. Kept in the event so anyone reading the log sees that a
    /// decision carries no automatic consequence.
    pub enforceable: bool,
}
#[event]
pub struct AppealRecorded { pub docket: Pubkey, pub appeal_hash: [u8; 32] }

#[error_code]
pub enum CourtError {
    #[msg("The case is not in the required status.")]
    WrongStatus,
    #[msg("A charter must be able to answer before a case is decided.")]
    AnswerRequiredBeforeDecision,
    #[msg("Only the complainant may withdraw a case.")]
    NotComplainant,
}
