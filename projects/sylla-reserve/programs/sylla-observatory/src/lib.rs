//! Public accounting and risk reporting.
//!
//! The Observatory records what can be checked, and refuses to record what
//! cannot. Reserve attestations and objective breach proofs live here; opinions
//! do not. It moves no value and holds no vault, so a compromised Observatory
//! can mislead but cannot steal.
//!
//! Detection latency, not penalty severity, is what determines how much of a
//! holder's claim survives a bad actor. That makes this the most consequential
//! program in the set that has no money in it.

use anchor_lang::prelude::*;

declare_id!("GNeC3AnGTZUFeRTkXkw3A1qxr7RzPGtWLxv6jV4FFNQE");

pub const ATTESTATION_SEED: &[u8] = b"attestation";
pub const OBSERVER_SEED: &[u8] = b"observer";

/// Breach flags, matched to the constitution's compliance bitfield. Every one
/// of these is a fact a stranger can verify from chain state alone.
pub mod breach {
    pub const UNAPPROVED_RESERVE_ASSET: u32 = 1 << 0;
    pub const UNAPPROVED_EXECUTION_PROGRAM: u32 = 1 << 1;
    pub const RESERVE_BELOW_LIQUID_SLEEVE: u32 = 1 << 2;
    pub const SUPPLY_EXCEEDS_RESERVE: u32 = 1 << 3;
    pub const STALE_ATTESTATION: u32 = 1 << 4;
}

#[program]
pub mod sylla_observatory {
    use super::*;

    pub fn register_observer(ctx: Context<RegisterObserver>) -> Result<()> {
        let observer = &mut ctx.accounts.observer;
        observer.key = ctx.accounts.observer_key.key();
        observer.attestations = 0;
        observer.bump = ctx.bumps.observer;
        Ok(())
    }

    /// Publish a reserve attestation for a currency.
    ///
    /// Deliberately dumb: it records reserves, supply and a slot, and derives
    /// nothing. Anyone can recompute NAV from these numbers, which is the point
    /// — the Observatory is a witness, not an oracle to be trusted.
    pub fn attest_reserves(
        ctx: Context<Attest>,
        reserve_lamports: u64,
        outstanding_supply: u64,
    ) -> Result<()> {
        require!(outstanding_supply > 0, ObservatoryError::EmptySupply);
        let clock = Clock::get()?;
        let attestation = &mut ctx.accounts.attestation;
        attestation.currency = ctx.accounts.currency.key();
        attestation.observer = ctx.accounts.observer.key();
        attestation.reserve_lamports = reserve_lamports;
        attestation.outstanding_supply = outstanding_supply;
        attestation.observed_slot = clock.slot;
        attestation.observed_at = clock.unix_timestamp;
        attestation.bump = ctx.bumps.attestation;

        let observer = &mut ctx.accounts.observer;
        observer.attestations = observer.attestations.saturating_add(1);

        emit!(ReservesAttested {
            currency: attestation.currency,
            reserve_lamports,
            outstanding_supply,
            observed_slot: attestation.observed_slot,
        });
        Ok(())
    }

    /// Record a proven, objective breach.
    ///
    /// Permissionless, and it must stay that way: an unapproved asset in a
    /// reserve is visible to anyone, and enforcement of a visible fact should
    /// not depend on an authority being available or willing to look.
    ///
    /// The flag is written here for the record. Restricting the charter is the
    /// Constitution program's job — this program never gains that power.
    pub fn record_objective_breach(
        ctx: Context<RecordBreach>,
        flag: u32,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        require!(flag != 0, ObservatoryError::EmptyFlag);
        require!(
            flag & !ALL_KNOWN_FLAGS == 0,
            ObservatoryError::UnknownFlag
        );
        let clock = Clock::get()?;
        let finding = &mut ctx.accounts.finding;
        finding.charter = ctx.accounts.charter.key();
        finding.reporter = ctx.accounts.reporter.key();
        finding.flag = flag;
        finding.evidence_hash = evidence_hash;
        finding.observed_slot = clock.slot;
        finding.bump = ctx.bumps.finding;
        emit!(BreachRecorded {
            charter: finding.charter,
            flag,
            reporter: finding.reporter,
            evidence_hash,
        });
        Ok(())
    }
}

const ALL_KNOWN_FLAGS: u32 = breach::UNAPPROVED_RESERVE_ASSET
    | breach::UNAPPROVED_EXECUTION_PROGRAM
    | breach::RESERVE_BELOW_LIQUID_SLEEVE
    | breach::SUPPLY_EXCEEDS_RESERVE
    | breach::STALE_ATTESTATION;

#[account]
pub struct Observer {
    pub key: Pubkey,
    pub attestations: u64,
    pub bump: u8,
}
impl Observer {
    pub const SIZE: usize = 8 + 32 + 8 + 1 + 8;
}

#[account]
pub struct ReserveAttestation {
    pub currency: Pubkey,
    pub observer: Pubkey,
    pub reserve_lamports: u64,
    pub outstanding_supply: u64,
    pub observed_slot: u64,
    pub observed_at: i64,
    pub bump: u8,
}
impl ReserveAttestation {
    pub const SIZE: usize = 8 + 32 + 32 + 8 * 4 + 1 + 8;
}

#[account]
pub struct BreachFinding {
    pub charter: Pubkey,
    pub reporter: Pubkey,
    pub flag: u32,
    pub evidence_hash: [u8; 32],
    pub observed_slot: u64,
    pub bump: u8,
}
impl BreachFinding {
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 32 + 8 + 1 + 8;
}

#[derive(Accounts)]
pub struct RegisterObserver<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: identified by address.
    pub observer_key: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = Observer::SIZE,
        seeds = [OBSERVER_SEED, observer_key.key().as_ref()],
        bump,
    )]
    pub observer: Account<'info, Observer>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Attest<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the currency being attested, by address.
    pub currency: UncheckedAccount<'info>,
    #[account(mut, seeds = [OBSERVER_SEED, payer.key().as_ref()], bump = observer.bump)]
    pub observer: Account<'info, Observer>,
    #[account(
        init_if_needed,
        payer = payer,
        space = ReserveAttestation::SIZE,
        seeds = [ATTESTATION_SEED, currency.key().as_ref(), payer.key().as_ref()],
        bump,
    )]
    pub attestation: Account<'info, ReserveAttestation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(flag: u32)]
pub struct RecordBreach<'info> {
    #[account(mut)]
    pub reporter: Signer<'info>,
    /// CHECK: the charter being reported, by address.
    pub charter: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = reporter,
        space = BreachFinding::SIZE,
        seeds = [b"finding", charter.key().as_ref(), &flag.to_le_bytes()],
        bump,
    )]
    pub finding: Account<'info, BreachFinding>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct ReservesAttested {
    pub currency: Pubkey,
    pub reserve_lamports: u64,
    pub outstanding_supply: u64,
    pub observed_slot: u64,
}
#[event]
pub struct BreachRecorded {
    pub charter: Pubkey,
    pub flag: u32,
    pub reporter: Pubkey,
    pub evidence_hash: [u8; 32],
}

#[error_code]
pub enum ObservatoryError {
    #[msg("An attestation with no supply says nothing.")]
    EmptySupply,
    #[msg("A breach flag cannot be empty.")]
    EmptyFlag,
    #[msg("This flag is not one of the enumerated objective breaches.")]
    UnknownFlag,
}
