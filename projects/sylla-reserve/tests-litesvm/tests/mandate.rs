//! Bounded agent spending, exercised against the compiled program.
//!
//! Every test here is about a limit holding when someone wants it not to.

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

const PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("EiK8fXf4oeSrmKc78dnmRV5fgY7coqpgQ6zewYhFavuo");
const SOL: u64 = 1_000_000_000;

#[derive(BorshSerialize)]
struct MandateParams {
    total_limit: u64,
    per_transaction_limit: u64,
    counterparties: Vec<Pubkey>,
    valid_from: i64,
    expires_at: i64,
}

#[derive(BorshDeserialize, Debug)]
struct Mandate {
    _human: Pubkey,
    _agent: Pubkey,
    total_limit: u64,
    _per_transaction_limit: u64,
    spent: u64,
    _counterparties: Vec<Pubkey>,
    _valid_from: i64,
    _expires_at: i64,
    revoked: bool,
    _revoked_at: i64,
    _bump: u8,
    _vault_bump: u8,
}

struct Fixture {
    svm: LiteSVM,
    human: Keypair,
    agent: Keypair,
    mandate: Pubkey,
    vault: Pubkey,
}

impl Fixture {
    fn state(&self) -> Mandate {
        // Accounts are allocated with slack, so read the fields and ignore
        // whatever padding follows rather than demanding exact consumption.
        let raw = account_data(&self.svm, &self.mandate);
        Mandate::deserialize(&mut &raw[8..]).unwrap()
    }
    fn vault_balance(&self) -> u64 {
        self.svm.get_account(&self.vault).map(|a| a.lamports).unwrap_or(0)
    }
}

fn grant(total: u64, per_tx: u64, counterparties: Vec<Pubkey>, window: (i64, i64)) -> Fixture {
    let mut svm = LiteSVM::new();
    svm.add_program(PROGRAM_ID, include_bytes!("../../target/deploy/sylla_mandate.so"));
    let human = funded(&mut svm, 100 * SOL);
    let agent = funded(&mut svm, SOL);
    let (mandate, _) = Pubkey::find_program_address(
        &[b"mandate", human.pubkey().as_ref(), agent.pubkey().as_ref()],
        &PROGRAM_ID,
    );
    let (vault, _) = Pubkey::find_program_address(
        &[b"mandate-vault", human.pubkey().as_ref(), agent.pubkey().as_ref()],
        &PROGRAM_ID,
    );
    let params = MandateParams {
        total_limit: total,
        per_transaction_limit: per_tx,
        counterparties,
        valid_from: window.0,
        expires_at: window.1,
    };
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(human.pubkey(), true),
            AccountMeta::new_readonly(agent.pubkey(), false),
            AccountMeta::new(mandate, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("grant", &params),
    };
    send(&mut svm, instruction, &[&human]).expect("grant");
    Fixture { svm, human, agent, mandate, vault }
}

fn spend(fx: &mut Fixture, to: &Pubkey, lamports: u64) -> Result<(), String> {
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(fx.agent.pubkey(), true),
            AccountMeta::new(fx.mandate, false),
            AccountMeta::new(fx.vault, false),
            AccountMeta::new(*to, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("spend", &lamports),
    };
    let agent = fx.agent.insecure_clone();
    send(&mut fx.svm, instruction, &[&agent])
}

fn revoke(fx: &mut Fixture) -> Result<(), String> {
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(fx.human.pubkey(), true),
            AccountMeta::new(fx.mandate, false),
            AccountMeta::new(fx.vault, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("revoke", &()),
    };
    let human = fx.human.insecure_clone();
    send(&mut fx.svm, instruction, &[&human])
}

#[test]
fn an_agent_can_only_pay_someone_the_human_named() {
    let approved = Keypair::new().pubkey();
    let stranger = Keypair::new().pubkey();
    let start = 0;
    let mut fx = grant(10 * SOL, 5 * SOL, vec![approved], (start, i64::MAX / 2));

    spend(&mut fx, &approved, SOL).expect("approved counterparty");
    assert!(
        spend(&mut fx, &stranger, SOL).is_err(),
        "an unlisted counterparty must be refused",
    );
    assert_eq!(fx.state().spent, SOL);
}

#[test]
fn an_empty_list_authorizes_nobody() {
    // A mandate naming no counterparties is authority to spend nothing, not
    // authority to spend anywhere.
    let anyone = Keypair::new().pubkey();
    let mut fx = grant(10 * SOL, 5 * SOL, vec![], (0, i64::MAX / 2));
    assert!(spend(&mut fx, &anyone, 1).is_err());
}

#[test]
fn the_per_transaction_ceiling_cannot_be_stepped_over() {
    let payee = Keypair::new().pubkey();
    let mut fx = grant(10 * SOL, 2 * SOL, vec![payee], (0, i64::MAX / 2));
    assert!(spend(&mut fx, &payee, 2 * SOL + 1).is_err(), "one lamport over the ceiling");
    spend(&mut fx, &payee, 2 * SOL).expect("exactly at the ceiling");
}

#[test]
fn the_total_cannot_be_reached_by_salami_slicing() {
    let payee = Keypair::new().pubkey();
    let mut fx = grant(5 * SOL, 2 * SOL, vec![payee], (0, i64::MAX / 2));
    for _ in 0..2 {
        spend(&mut fx, &payee, 2 * SOL).expect("within total");
    }
    // 4 SOL spent, 1 remaining: a third full-size payment must fail even though
    // each individual payment is under the per-transaction ceiling.
    assert!(spend(&mut fx, &payee, 2 * SOL).is_err());
    spend(&mut fx, &payee, SOL).expect("the remainder is still spendable");
    assert_eq!(fx.state().spent, 5 * SOL);
    assert!(spend(&mut fx, &payee, 1).is_err(), "the mandate is exhausted");
}

#[test]
fn a_mandate_stops_at_its_expiry_without_anyone_intervening() {
    let payee = Keypair::new().pubkey();
    let start = 1_000;
    let end = 2_000;
    let mut fx = grant(10 * SOL, 5 * SOL, vec![payee], (start, end));
    warp(&mut fx.svm, start + 1);
    spend(&mut fx, &payee, SOL).expect("inside the window");
    warp(&mut fx.svm, end);
    assert!(spend(&mut fx, &payee, SOL).is_err(), "expiry needs no revocation");
}

#[test]
fn a_mandate_is_not_live_before_it_begins() {
    let payee = Keypair::new().pubkey();
    let mut fx = grant(10 * SOL, 5 * SOL, vec![payee], (5_000, 9_000));
    warp(&mut fx.svm, 4_999);
    assert!(spend(&mut fx, &payee, SOL).is_err());
}

#[test]
fn the_human_can_revoke_mid_flight_and_the_money_comes_home() {
    let payee = Keypair::new().pubkey();
    let mut fx = grant(10 * SOL, 5 * SOL, vec![payee], (0, i64::MAX / 2));
    spend(&mut fx, &payee, 3 * SOL).expect("spend");

    let before = fx.svm.get_account(&fx.human.pubkey()).unwrap().lamports;
    revoke(&mut fx).expect("revoke");

    let state = fx.state();
    assert!(state.revoked, "the mandate records that it was revoked");
    assert_eq!(state.spent, 3 * SOL);
    // The unspent remainder returned; only rent stays behind.
    assert!(fx.svm.get_account(&fx.human.pubkey()).unwrap().lamports > before + 6 * SOL);
    assert!(fx.vault_balance() < SOL / 100);

    assert!(spend(&mut fx, &payee, 1).is_err(), "a revoked mandate is dead");
}

#[test]
fn only_the_human_may_revoke() {
    let payee = Keypair::new().pubkey();
    let mut fx = grant(10 * SOL, 5 * SOL, vec![payee], (0, i64::MAX / 2));
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(fx.agent.pubkey(), true),
            AccountMeta::new(fx.mandate, false),
            AccountMeta::new(fx.vault, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("revoke", &()),
    };
    let agent = fx.agent.insecure_clone();
    assert!(send(&mut fx.svm, instruction, &[&agent]).is_err());
}

#[test]
fn the_agent_cannot_reach_past_the_vault_into_the_human_wallet() {
    // The ceiling is physical as well as arithmetic: the vault holds exactly
    // the mandate, so even a bug in the limit checks could not spend more.
    let payee = Keypair::new().pubkey();
    let fx = grant(4 * SOL, 4 * SOL, vec![payee], (0, i64::MAX / 2));
    let vault = fx.vault_balance();
    assert!(vault >= 4 * SOL && vault < 4 * SOL + SOL / 100);
}

#[test]
fn only_the_named_agent_may_spend() {
    let payee = Keypair::new().pubkey();
    let mut fx = grant(10 * SOL, 5 * SOL, vec![payee], (0, i64::MAX / 2));
    let impostor = funded(&mut fx.svm, SOL);
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(impostor.pubkey(), true),
            AccountMeta::new(fx.mandate, false),
            AccountMeta::new(fx.vault, false),
            AccountMeta::new(payee, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("spend", &SOL),
    };
    assert!(send(&mut fx.svm, instruction, &[&impostor]).is_err());
}
