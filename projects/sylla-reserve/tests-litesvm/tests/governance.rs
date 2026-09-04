//! Constitution, Charter, Observatory and Court, exercised together.
//!
//! The through-line: authority can close doors institutions walk through, and
//! cannot touch anything a holder owns.

mod common;
use common::*;

use borsh::{BorshDeserialize, BorshSerialize};
use litesvm::LiteSVM;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
};

const CONSTITUTION: Pubkey =
    solana_sdk::pubkey!("GTdJ5kvtBr3hAy3eSof9R4yxQwbVR1BSbwUCAkZFG6hS");
const CHARTER: Pubkey =
    solana_sdk::pubkey!("ACCizZVbLXRwU6WQqjf1HuowuXcJydoadZM4cU6fntQv");
const OBSERVATORY: Pubkey =
    solana_sdk::pubkey!("GNeC3AnGTZUFeRTkXkw3A1qxr7RzPGtWLxv6jV4FFNQE");
const COURT: Pubkey =
    solana_sdk::pubkey!("A3gSnb7GkuwMzSZZAYPXtbfiGfeZ8fJxw7zhsJLRfsYP");
const SOL: u64 = 1_000_000_000;
const DAY: i64 = 24 * 60 * 60;

// Status discriminants, in declaration order.
const ACTIVE: u8 = 0;
const RESTRICTED: u8 = 2;
const SUSPENDED: u8 = 3;
const RESOLUTION: u8 = 4;

#[derive(BorshDeserialize, Debug)]
struct Compliance {
    _charter: Pubkey,
    status: u8,
    breach_flags: u32,
    _cure_deadline: i64,
    pause_expiry: i64,
    clearing_access: bool,
    _bump: u8,
}

fn svm_with(programs: &[(Pubkey, &[u8])]) -> LiteSVM {
    let mut svm = LiteSVM::new();
    for (id, bytes) in programs {
        svm.add_program(*id, bytes);
    }
    svm
}

struct Gov {
    svm: LiteSVM,
    authority: Keypair,
    root: Pubkey,
    charter_key: Pubkey,
    compliance: Pubkey,
}

impl Gov {
    fn compliance(&self) -> Compliance {
        let raw = account_data(&self.svm, &self.compliance);
        Compliance::deserialize(&mut &raw[8..]).unwrap()
    }
}

fn constitution_world() -> Gov {
    let mut svm = svm_with(&[(
        CONSTITUTION,
        include_bytes!("../../target/deploy/sylla_constitution.so"),
    )]);
    let authority = funded(&mut svm, 100 * SOL);
    let (root, _) = Pubkey::find_program_address(&[b"root"], &CONSTITUTION);
    send(
        &mut svm,
        Instruction {
            program_id: CONSTITUTION,
            accounts: vec![
                AccountMeta::new(authority.pubkey(), true),
                AccountMeta::new(root, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data("initialize", &[9u8; 32]),
        },
        &[&authority],
    )
    .expect("initialize");

    let charter_key = Keypair::new().pubkey();
    let (compliance, _) =
        Pubkey::find_program_address(&[b"compliance", charter_key.as_ref()], &CONSTITUTION);
    send(
        &mut svm,
        Instruction {
            program_id: CONSTITUTION,
            accounts: vec![
                AccountMeta::new(authority.pubkey(), true),
                AccountMeta::new(root, false),
                AccountMeta::new(compliance, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data("open_compliance", &charter_key),
        },
        &[&authority],
    )
    .expect("open compliance");

    Gov { svm, authority, root, charter_key, compliance }
}

fn authority_ix(g: &Gov, name: &str, args: &impl BorshSerialize) -> Instruction {
    Instruction {
        program_id: CONSTITUTION,
        accounts: vec![
            AccountMeta::new_readonly(g.authority.pubkey(), true),
            AccountMeta::new_readonly(g.root, false),
            AccountMeta::new(g.compliance, false),
        ],
        data: data(name, args),
    }
}

#[test]
fn a_provable_breach_can_be_flagged_by_a_stranger() {
    let mut g = constitution_world();
    let stranger = funded(&mut g.svm, SOL);
    // An unapproved asset in a reserve is a fact anyone can see. Enforcement of
    // a visible fact should not wait on an authority being willing to look.
    send(
        &mut g.svm,
        Instruction {
            program_id: CONSTITUTION,
            accounts: vec![
                AccountMeta::new_readonly(stranger.pubkey(), true),
                AccountMeta::new(g.compliance, false),
            ],
            data: data("flag_objective_breach", &(1u32, 7 * DAY)),
        },
        &[&stranger],
    )
    .expect("permissionless flag");

    let state = g.compliance();
    assert_eq!(state.status, RESTRICTED);
    assert_eq!(state.breach_flags, 1);
}

#[test]
fn an_emergency_pause_lapses_on_its_own() {
    let mut g = constitution_world();
    let start = now(&g.svm);
    let authority = g.authority.insecure_clone();
    let ix = authority_ix(&g, "enter_emergency_pause", &(2 * DAY));
    send(&mut g.svm, ix, &[&authority]).expect("pause");
    assert_eq!(g.compliance().status, SUSPENDED);

    // Before expiry, nobody can lift it early by simply asking.
    let anyone = funded(&mut g.svm, SOL);
    let lapse = Instruction {
        program_id: CONSTITUTION,
        accounts: vec![
            AccountMeta::new_readonly(anyone.pubkey(), true),
            AccountMeta::new(g.compliance, false),
        ],
        data: data("lapse_pause", &()),
    };
    assert!(send(&mut g.svm, lapse.clone(), &[&anyone]).is_err(), "still running");

    // After expiry, anyone can. A pause that needed an affirmative act to lift
    // would become permanent through neglect.
    warp(&mut g.svm, start + 2 * DAY + 1);
    send(&mut g.svm, lapse, &[&anyone]).expect("lapse");
    assert_eq!(g.compliance().status, ACTIVE);
    assert_eq!(g.compliance().pause_expiry, 0);
}

#[test]
fn a_pause_cannot_outlast_the_constitutional_maximum() {
    let mut g = constitution_world();
    let authority = g.authority.insecure_clone();
    assert!(
        { let ix = authority_ix(&g, "enter_emergency_pause", &(8 * DAY)); send(&mut g.svm, ix, &[&authority]).is_err() },
        "eight days exceeds the seven-day ceiling",
    );
}

#[test]
fn a_lapsed_pause_returns_to_restricted_when_a_breach_is_still_open() {
    let mut g = constitution_world();
    let stranger = funded(&mut g.svm, SOL);
    send(
        &mut g.svm,
        Instruction {
            program_id: CONSTITUTION,
            accounts: vec![
                AccountMeta::new_readonly(stranger.pubkey(), true),
                AccountMeta::new(g.compliance, false),
            ],
            data: data("flag_objective_breach", &(4u32, DAY)),
        },
        &[&stranger],
    )
    .expect("flag");

    let start = now(&g.svm);
    let authority = g.authority.insecure_clone();
    let ix = authority_ix(&g, "enter_emergency_pause", &DAY);
    send(&mut g.svm, ix, &[&authority]).expect("pause");
    warp(&mut g.svm, start + DAY + 1);
    send(
        &mut g.svm,
        Instruction {
            program_id: CONSTITUTION,
            accounts: vec![
                AccountMeta::new_readonly(stranger.pubkey(), true),
                AccountMeta::new(g.compliance, false),
            ],
            data: data("lapse_pause", &()),
        },
        &[&stranger],
    )
    .expect("lapse");
    // The pause ended; the unresolved breach did not.
    assert_eq!(g.compliance().status, RESTRICTED);
}

#[test]
fn resolution_closes_clearing_access_and_nothing_else() {
    let mut g = constitution_world();
    let authority = g.authority.insecure_clone();
    assert!(g.compliance().clearing_access);
    let ix = authority_ix(&g, "enter_resolution", &());
    send(&mut g.svm, ix, &[&authority]).expect("resolution");
    let state = g.compliance();
    assert_eq!(state.status, RESOLUTION);
    assert!(!state.clearing_access, "the institution loses the settlement layer");
}

#[test]
fn only_the_authority_can_pause_or_resolve() {
    let mut g = constitution_world();
    let impostor = funded(&mut g.svm, SOL);
    for name in ["enter_emergency_pause", "enter_resolution"] {
        let ix = Instruction {
            program_id: CONSTITUTION,
            accounts: vec![
                AccountMeta::new_readonly(impostor.pubkey(), true),
                AccountMeta::new_readonly(g.root, false),
                AccountMeta::new(g.compliance, false),
            ],
            data: if name == "enter_emergency_pause" {
                data(name, &DAY)
            } else {
                data(name, &())
            },
        };
        assert!(send(&mut g.svm, ix, &[&impostor]).is_err(), "{name} must be gated");
    }
}

#[test]
fn a_sponsor_bond_cannot_be_taken_back_during_the_claims_period() {
    let mut svm = svm_with(&[(CHARTER, include_bytes!("../../target/deploy/sylla_charter.so"))]);
    let sponsor = funded(&mut svm, 100 * SOL);
    let mint = Keypair::new().pubkey();
    let (charter, _) = Pubkey::find_program_address(&[b"charter", mint.as_ref()], &CHARTER);
    let (bond_vault, _) = Pubkey::find_program_address(&[b"sponsor-bond", mint.as_ref()], &CHARTER);

    #[derive(BorshSerialize)]
    struct CharterParams {
        constitution: Pubkey,
        purpose_hash: [u8; 32],
        bond_lamports: u64,
        minimum_liquid_sleeve_bps: u16,
    }
    send(
        &mut svm,
        Instruction {
            program_id: CHARTER,
            accounts: vec![
                AccountMeta::new(sponsor.pubkey(), true),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new(charter, false),
                AccountMeta::new(bond_vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data(
                "open_charter",
                &CharterParams {
                    constitution: CONSTITUTION,
                    purpose_hash: [1u8; 32],
                    bond_lamports: 20 * SOL,
                    minimum_liquid_sleeve_bps: 2_500,
                },
            ),
        },
        &[&sponsor],
    )
    .expect("open charter");

    // The bond is in a program vault, not the sponsor's account.
    assert!(svm.get_account(&bond_vault).unwrap().lamports >= 20 * SOL);

    let start = now(&svm);
    let release = Instruction {
        program_id: CHARTER,
        accounts: vec![
            AccountMeta::new(sponsor.pubkey(), true),
            AccountMeta::new(charter, false),
            AccountMeta::new(bond_vault, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("release_bond", &()),
    };
    assert!(send(&mut svm, release.clone(), &[&sponsor]).is_err(), "no exit before requesting one");

    send(
        &mut svm,
        Instruction {
            program_id: CHARTER,
            accounts: vec![
                AccountMeta::new_readonly(sponsor.pubkey(), true),
                AccountMeta::new(charter, false),
            ],
            data: data("request_bond_release", &(30 * DAY)),
        },
        &[&sponsor],
    )
    .expect("request release");
    assert!(send(&mut svm, release.clone(), &[&sponsor]).is_err(), "claims period is open");

    // A claim recorded during the window blocks the exit entirely.
    let claimant = funded(&mut svm, SOL);
    send(
        &mut svm,
        Instruction {
            program_id: CHARTER,
            accounts: vec![
                AccountMeta::new_readonly(claimant.pubkey(), true),
                AccountMeta::new(charter, false),
            ],
            data: data("record_claim", &()),
        },
        &[&claimant],
    )
    .expect("record claim");

    warp(&mut svm, start + 31 * DAY);
    assert!(
        send(&mut svm, release, &[&sponsor]).is_err(),
        "an outstanding claim outlives the clock",
    );
}

#[test]
fn a_short_claims_period_is_refused() {
    let mut svm = svm_with(&[(CHARTER, include_bytes!("../../target/deploy/sylla_charter.so"))]);
    let sponsor = funded(&mut svm, 100 * SOL);
    let mint = Keypair::new().pubkey();
    let (charter, _) = Pubkey::find_program_address(&[b"charter", mint.as_ref()], &CHARTER);
    let (bond_vault, _) = Pubkey::find_program_address(&[b"sponsor-bond", mint.as_ref()], &CHARTER);

    #[derive(BorshSerialize)]
    struct CharterParams {
        constitution: Pubkey,
        purpose_hash: [u8; 32],
        bond_lamports: u64,
        minimum_liquid_sleeve_bps: u16,
    }
    send(
        &mut svm,
        Instruction {
            program_id: CHARTER,
            accounts: vec![
                AccountMeta::new(sponsor.pubkey(), true),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new(charter, false),
                AccountMeta::new(bond_vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data(
                "open_charter",
                &CharterParams {
                    constitution: CONSTITUTION,
                    purpose_hash: [2u8; 32],
                    bond_lamports: SOL,
                    minimum_liquid_sleeve_bps: 0,
                },
            ),
        },
        &[&sponsor],
    )
    .expect("open");
    assert!(
        send(
            &mut svm,
            Instruction {
                program_id: CHARTER,
                accounts: vec![
                    AccountMeta::new_readonly(sponsor.pubkey(), true),
                    AccountMeta::new(charter, false),
                ],
                data: data("request_bond_release", &(DAY)),
            },
            &[&sponsor],
        )
        .is_err(),
        "one day is below the constitutional minimum",
    );
}

#[test]
fn the_observatory_records_facts_and_refuses_invented_flags() {
    let mut svm = svm_with(&[(
        OBSERVATORY,
        include_bytes!("../../target/deploy/sylla_observatory.so"),
    )]);
    let reporter = funded(&mut svm, 10 * SOL);
    let charter_key = Keypair::new().pubkey();

    let finding = |flag: u32| {
        Pubkey::find_program_address(
            &[b"finding", charter_key.as_ref(), &flag.to_le_bytes()],
            &OBSERVATORY,
        )
        .0
    };
    let record = |flag: u32| Instruction {
        program_id: OBSERVATORY,
        accounts: vec![
            AccountMeta::new(reporter.pubkey(), true),
            AccountMeta::new_readonly(charter_key, false),
            AccountMeta::new(finding(flag), false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("record_objective_breach", &(flag, [3u8; 32])),
    };

    send(&mut svm, record(1), &[&reporter]).expect("a known breach");
    assert!(
        send(&mut svm, record(1 << 20), &[&reporter]).is_err(),
        "a flag outside the enumerated set is not a fact",
    );
}

#[test]
fn a_court_decision_moves_no_money_and_needs_an_answer_first() {
    let mut svm = svm_with(&[(COURT, include_bytes!("../../target/deploy/sylla_court.so"))]);
    let complainant = funded(&mut svm, 10 * SOL);
    let charter_key = Keypair::new().pubkey();
    let case_id = [5u8; 32];
    let (docket, _) =
        Pubkey::find_program_address(&[b"docket", charter_key.as_ref(), &case_id], &COURT);

    send(
        &mut svm,
        Instruction {
            program_id: COURT,
            accounts: vec![
                AccountMeta::new(complainant.pubkey(), true),
                AccountMeta::new_readonly(charter_key, false),
                AccountMeta::new(docket, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data("open_case", &(case_id, [6u8; 32])),
        },
        &[&complainant],
    )
    .expect("open case");

    let decide = Instruction {
        program_id: COURT,
        accounts: vec![
            AccountMeta::new_readonly(complainant.pubkey(), true),
            AccountMeta::new(docket, false),
        ],
        // Finding::Proven
        data: data("record_decision", &(1u8, [8u8; 32])),
    };
    // The only due process this program can enforce alone: a charter must be
    // able to answer before it can be found against.
    assert!(send(&mut svm, decide.clone(), &[&complainant]).is_err());

    send(
        &mut svm,
        Instruction {
            program_id: COURT,
            accounts: vec![
                AccountMeta::new_readonly(complainant.pubkey(), true),
                AccountMeta::new(docket, false),
            ],
            data: data("record_response", &[7u8; 32]),
        },
        &[&complainant],
    )
    .expect("response");

    let before = svm.get_account(&complainant.pubkey()).unwrap().lamports;
    send(&mut svm, decide, &[&complainant]).expect("decision");
    let after = svm.get_account(&complainant.pubkey()).unwrap().lamports;
    // A finding of Proven changed no balance anywhere. That is the point: this
    // program is a record, and enforcement is a separate, unspecified process.
    assert!(before - after < SOL / 100, "a decision must not move value");
}
