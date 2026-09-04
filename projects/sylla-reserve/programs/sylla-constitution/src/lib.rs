//! Sylla Constitution: the approved-program registry and charter compliance state.
//!
//! This is the root every other program defers to. It holds two things:
//!
//!   * which programs are approved to act inside the economy, and
//!   * what state each charter is in — the account every charter program reads
//!     before it will do anything privileged.
//!
//! The rule that shapes the whole file: **sanctions gate institutional
//! authority, never a holder's exit.** Nothing here can freeze a balance, and
//! nothing here can stop a redemption. It can only close doors that
//! institutions walk through.
//!
//! Emergency pauses lapse by default. A pause that required someone to
//! affirmatively lift it would become permanent through neglect, so
//! `lapse_pause` is permissionless and anyone may call it once the clock runs
//! out.

use anchor_lang::prelude::*;

declare_id!("GTdJ5kvtBr3hAy3eSof9R4yxQwbVR1BSbwUCAkZFG6hS");

pub const ROOT_SEED: &[u8] = b"root";
pub const PROGRAM_SEED: &[u8] = b"approved-program";
pub const COMPLIANCE_SEED: &[u8] = b"compliance";

/// The longest an unadjudicated emergency pause may last. Past this the pause
/// is void whether or not anyone remembers to lift it.
pub const MAX_PAUSE_SECONDS: i64 = 7 * 24 * 60 * 60;

#[program]
pub mod sylla_constitution {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, version_hash: [u8; 32]) -> Result<()> {
        let root = &mut ctx.accounts.root;
        root.authority = ctx.accounts.authority.key();
        root.version_hash = version_hash;
        root.charter_count = 0;
        root.bump = ctx.bumps.root;
        emit!(RootInitialized { root: root.key(), version_hash });
        Ok(())
    }

    /// Approve a program to act inside the economy.
    ///
    /// Charter treasuries reject any CPI target that is not registered here,
    /// which is what makes "unauthorized execution program" a mechanical
    /// breach rather than a judgement call.
    pub fn register_program(ctx: Context<RegisterProgram>, kind: ProgramKind) -> Result<()> {
        let entry = &mut ctx.accounts.entry;
        entry.program_id = ctx.accounts.approved_program.key();
        entry.kind = kind;
        entry.revoked = false;
        entry.bump = ctx.bumps.entry;
        emit!(ProgramRegistered { program_id: entry.program_id, kind });
        Ok(())
    }

    /// Withdraw approval. Existing accounts are untouched; only future
    /// privileged actions that check this entry stop working.
    pub fn revoke_program(ctx: Context<RevokeProgram>) -> Result<()> {
        let entry = &mut ctx.accounts.entry;
        entry.revoked = true;
        emit!(ProgramRevoked { program_id: entry.program_id });
        Ok(())
    }

    /// Open a compliance record for a charter. Starts Active.
    pub fn open_compliance(ctx: Context<OpenCompliance>, charter: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.compliance;
        state.charter = charter;
        state.status = CharterStatus::Active;
        state.breach_flags = 0;
        state.cure_deadline = 0;
        state.pause_expiry = 0;
        state.clearing_access = true;
        state.bump = ctx.bumps.compliance;
        ctx.accounts.root.charter_count = ctx
            .accounts
            .root
            .charter_count
            .checked_add(1)
            .ok_or(ConstitutionError::Overflow)?;
        Ok(())
    }

    /// Record an objectively provable breach and restrict the charter.
    ///
    /// Permissionless on purpose: an unapproved asset sitting in a reserve is
    /// a fact anyone can demonstrate, and enforcement of facts should not wait
    /// on an authority being available or willing.
    pub fn flag_objective_breach(
        ctx: Context<FlagBreach>,
        flag: u32,
        cure_seconds: i64,
    ) -> Result<()> {
        require!(flag != 0, ConstitutionError::EmptyFlag);
        require!(cure_seconds >= 0, ConstitutionError::NegativeDuration);
        let now = Clock::get()?.unix_timestamp;
        let state = &mut ctx.accounts.compliance;
        require!(
            state.status != CharterStatus::Dissolved,
            ConstitutionError::AlreadyDissolved
        );
        state.breach_flags |= flag;
        state.status = CharterStatus::Restricted;
        state.cure_deadline = now
            .checked_add(cure_seconds)
            .ok_or(ConstitutionError::Overflow)?;
        emit!(BreachFlagged { charter: state.charter, flag, cure_deadline: state.cure_deadline });
        Ok(())
    }

    /// Clear a breach once it has actually been cured.
    pub fn clear_breach(ctx: Context<AuthorityAction>, flag: u32) -> Result<()> {
        let state = &mut ctx.accounts.compliance;
        state.breach_flags &= !flag;
        if state.breach_flags == 0 && state.status == CharterStatus::Restricted {
            state.status = CharterStatus::Active;
            state.cure_deadline = 0;
        }
        emit!(BreachCleared { charter: state.charter, remaining: state.breach_flags });
        Ok(())
    }

    /// Suspend a charter over an allegation that needs interpretation.
    ///
    /// Bounded by construction: the pause carries an expiry, and cannot be set
    /// beyond `MAX_PAUSE_SECONDS`. Freezing an operating institution is close
    /// to ending it, so the power to do so on suspicion is deliberately
    /// short-lived.
    pub fn enter_emergency_pause(
        ctx: Context<AuthorityAction>,
        duration_seconds: i64,
    ) -> Result<()> {
        require!(
            duration_seconds > 0 && duration_seconds <= MAX_PAUSE_SECONDS,
            ConstitutionError::PauseTooLong
        );
        let now = Clock::get()?.unix_timestamp;
        let state = &mut ctx.accounts.compliance;
        require!(
            state.status == CharterStatus::Active || state.status == CharterStatus::Restricted,
            ConstitutionError::WrongStatus
        );
        state.status = CharterStatus::Suspended;
        state.pause_expiry = now
            .checked_add(duration_seconds)
            .ok_or(ConstitutionError::Overflow)?;
        emit!(EmergencyPauseEntered { charter: state.charter, expiry: state.pause_expiry });
        Ok(())
    }

    /// End a lapsed pause. Anyone may call this.
    ///
    /// This is the counterweight to the instruction above: the authority can
    /// start a pause but cannot make one outlast its own deadline, and does
    /// not get to decide when it ends.
    pub fn lapse_pause(ctx: Context<LapsePause>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let state = &mut ctx.accounts.compliance;
        require!(state.status == CharterStatus::Suspended, ConstitutionError::WrongStatus);
        require!(now >= state.pause_expiry, ConstitutionError::PauseStillRunning);
        state.status = if state.breach_flags == 0 {
            CharterStatus::Active
        } else {
            CharterStatus::Restricted
        };
        state.pause_expiry = 0;
        emit!(EmergencyPauseLapsed { charter: state.charter, status: state.status });
        Ok(())
    }

    /// Move a charter into resolution. Its holders' exits stay open; only the
    /// institution's own powers stop.
    pub fn enter_resolution(ctx: Context<AuthorityAction>) -> Result<()> {
        let state = &mut ctx.accounts.compliance;
        require!(
            state.status != CharterStatus::Dissolved,
            ConstitutionError::AlreadyDissolved
        );
        state.status = CharterStatus::Resolution;
        state.clearing_access = false;
        emit!(ResolutionEntered { charter: state.charter });
        Ok(())
    }
}

/// What a charter may currently do. Nothing here describes what a *holder* may
/// do, because no status in this enum can stop a redemption.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CharterStatus {
    Active,
    Warned,
    Restricted,
    Suspended,
    Resolution,
    Dissolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProgramKind {
    Reserve,
    Charter,
    Clearing,
    Observatory,
    Mandate,
    Court,
    Execution,
    Oracle,
}

#[account]
pub struct Root {
    pub authority: Pubkey,
    pub version_hash: [u8; 32],
    pub charter_count: u64,
    pub bump: u8,
}
impl Root {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1 + 8;
}

#[account]
pub struct ApprovedProgram {
    pub program_id: Pubkey,
    pub kind: ProgramKind,
    pub revoked: bool,
    pub bump: u8,
}
impl ApprovedProgram {
    pub const SIZE: usize = 8 + 32 + 2 + 1 + 1 + 8;
}

#[account]
pub struct ComplianceState {
    pub charter: Pubkey,
    pub status: CharterStatus,
    pub breach_flags: u32,
    pub cure_deadline: i64,
    pub pause_expiry: i64,
    pub clearing_access: bool,
    pub bump: u8,
}
impl ComplianceState {
    pub const SIZE: usize = 8 + 32 + 2 + 4 + 8 + 8 + 1 + 1 + 8;

    /// Whether a charter may take privileged action right now.
    pub fn may_operate(&self) -> bool {
        matches!(self.status, CharterStatus::Active | CharterStatus::Warned)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = Root::SIZE, seeds = [ROOT_SEED], bump)]
    pub root: Account<'info, Root>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterProgram<'info> {
    #[account(mut, address = root.authority @ ConstitutionError::NotAuthority)]
    pub authority: Signer<'info>,
    #[account(seeds = [ROOT_SEED], bump = root.bump)]
    pub root: Account<'info, Root>,
    /// CHECK: recorded by address only; never invoked from here.
    pub approved_program: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = ApprovedProgram::SIZE,
        seeds = [PROGRAM_SEED, approved_program.key().as_ref()],
        bump,
    )]
    pub entry: Account<'info, ApprovedProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeProgram<'info> {
    #[account(address = root.authority @ ConstitutionError::NotAuthority)]
    pub authority: Signer<'info>,
    #[account(seeds = [ROOT_SEED], bump = root.bump)]
    pub root: Account<'info, Root>,
    #[account(mut, seeds = [PROGRAM_SEED, entry.program_id.as_ref()], bump = entry.bump)]
    pub entry: Account<'info, ApprovedProgram>,
}

#[derive(Accounts)]
#[instruction(charter: Pubkey)]
pub struct OpenCompliance<'info> {
    #[account(mut, address = root.authority @ ConstitutionError::NotAuthority)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [ROOT_SEED], bump = root.bump)]
    pub root: Account<'info, Root>,
    #[account(
        init,
        payer = authority,
        space = ComplianceState::SIZE,
        seeds = [COMPLIANCE_SEED, charter.as_ref()],
        bump,
    )]
    pub compliance: Account<'info, ComplianceState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlagBreach<'info> {
    /// Anyone. An objective breach is a fact, and facts do not need standing.
    pub reporter: Signer<'info>,
    #[account(mut, seeds = [COMPLIANCE_SEED, compliance.charter.as_ref()], bump = compliance.bump)]
    pub compliance: Account<'info, ComplianceState>,
}

#[derive(Accounts)]
pub struct AuthorityAction<'info> {
    #[account(address = root.authority @ ConstitutionError::NotAuthority)]
    pub authority: Signer<'info>,
    #[account(seeds = [ROOT_SEED], bump = root.bump)]
    pub root: Account<'info, Root>,
    #[account(mut, seeds = [COMPLIANCE_SEED, compliance.charter.as_ref()], bump = compliance.bump)]
    pub compliance: Account<'info, ComplianceState>,
}

#[derive(Accounts)]
pub struct LapsePause<'info> {
    /// Anyone, again on purpose.
    pub caller: Signer<'info>,
    #[account(mut, seeds = [COMPLIANCE_SEED, compliance.charter.as_ref()], bump = compliance.bump)]
    pub compliance: Account<'info, ComplianceState>,
}

#[event]
pub struct RootInitialized { pub root: Pubkey, pub version_hash: [u8; 32] }
#[event]
pub struct ProgramRegistered { pub program_id: Pubkey, pub kind: ProgramKind }
#[event]
pub struct ProgramRevoked { pub program_id: Pubkey }
#[event]
pub struct BreachFlagged { pub charter: Pubkey, pub flag: u32, pub cure_deadline: i64 }
#[event]
pub struct BreachCleared { pub charter: Pubkey, pub remaining: u32 }
#[event]
pub struct EmergencyPauseEntered { pub charter: Pubkey, pub expiry: i64 }
#[event]
pub struct EmergencyPauseLapsed { pub charter: Pubkey, pub status: CharterStatus }
#[event]
pub struct ResolutionEntered { pub charter: Pubkey }

#[error_code]
pub enum ConstitutionError {
    #[msg("Only the constitution authority may do this.")]
    NotAuthority,
    #[msg("A breach flag cannot be empty.")]
    EmptyFlag,
    #[msg("A duration cannot be negative.")]
    NegativeDuration,
    #[msg("An emergency pause cannot exceed the constitutional maximum.")]
    PauseTooLong,
    #[msg("This pause has not expired yet.")]
    PauseStillRunning,
    #[msg("The charter is not in the required status.")]
    WrongStatus,
    #[msg("This charter is already dissolved.")]
    AlreadyDissolved,
    #[msg("Arithmetic overflowed.")]
    Overflow,
}
