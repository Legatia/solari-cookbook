//! Agent-contract escrow.
//!
//! The placement is the design: escrow lives at the clearing layer so that
//! freezing a charter can never strand a counterparty who is not its holder.

mod common;
use common::*;

use borsh::BorshDeserialize;
use litesvm::LiteSVM;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
};

const CLEARING: Pubkey =
    solana_sdk::pubkey!("Ez2UhS3Wm5q7ZicyrjS4okysQBvpAyb7gseXq23GYfDy");
const SOL: u64 = 1_000_000_000;

const OPEN: u8 = 0;
const DISPUTED: u8 = 1;
const RELEASED: u8 = 2;
const REFUNDED: u8 = 3;

#[derive(BorshDeserialize, Debug)]
struct Escrow {
    _escrow_id: [u8; 32],
    _payer: Pubkey,
    _payee: Pubkey,
    lamports: u64,
    _deadline: i64,
    _reason_hash: [u8; 32],
    state: u8,
    _bump: u8,
    _vault_bump: u8,
}

struct Fx {
    svm: LiteSVM,
    payer: Keypair,
    payee: Keypair,
    escrow: Pubkey,
    vault: Pubkey,
}

impl Fx {
    fn state(&self) -> Escrow {
        let raw = account_data(&self.svm, &self.escrow);
        Escrow::deserialize(&mut &raw[8..]).unwrap()
    }
}

fn open(amount: u64, deadline_in: i64) -> (Fx, i64) {
    let mut svm = LiteSVM::new();
    svm.add_program(CLEARING, include_bytes!("../../target/deploy/sylla_clearing.so"));
    let payer = funded(&mut svm, 100 * SOL);
    let payee = funded(&mut svm, SOL);
    let id = [11u8; 32];
    let (escrow, _) =
        Pubkey::find_program_address(&[b"escrow", payer.pubkey().as_ref(), &id], &CLEARING);
    let (vault, _) =
        Pubkey::find_program_address(&[b"escrow-vault", payer.pubkey().as_ref(), &id], &CLEARING);
    let deadline = now(&svm) + deadline_in;
    send(
        &mut svm,
        Instruction {
            program_id: CLEARING,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new_readonly(payee.pubkey(), false),
                AccountMeta::new(escrow, false),
                AccountMeta::new(vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data("open_escrow", &(id, amount, deadline)),
        },
        &[&payer],
    )
    .expect("open escrow");
    (Fx { svm, payer, payee, escrow, vault }, deadline)
}

fn settle(fx: &mut Fx, name: &str, signer: &Keypair, to: Pubkey) -> Result<(), String> {
    let ix = Instruction {
        program_id: CLEARING,
        accounts: vec![
            AccountMeta::new_readonly(signer.pubkey(), true),
            AccountMeta::new(fx.escrow, false),
            AccountMeta::new(fx.vault, false),
            AccountMeta::new(to, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data(name, &()),
    };
    send(&mut fx.svm, ix, &[signer])
}

#[test]
fn only_the_payer_releases_and_the_payee_cannot_take() {
    let (mut fx, _) = open(10 * SOL, 3_600);
    let payee = fx.payee.insecure_clone();
    let payer = fx.payer.insecure_clone();

    assert!(
        settle(&mut fx, "release", &payee, payee.pubkey()).is_err(),
        "a payee cannot release funds to itself",
    );

    let before = fx.svm.get_account(&payee.pubkey()).unwrap().lamports;
    settle(&mut fx, "release", &payer, payee.pubkey()).expect("payer releases");
    assert_eq!(fx.state().state, RELEASED);
    assert_eq!(
        fx.svm.get_account(&payee.pubkey()).unwrap().lamports,
        before + 10 * SOL
    );
}

#[test]
fn a_release_cannot_be_redirected_to_a_stranger() {
    let (mut fx, _) = open(10 * SOL, 3_600);
    let payer = fx.payer.insecure_clone();
    let stranger = Keypair::new().pubkey();
    assert!(
        settle(&mut fx, "release", &payer, stranger).is_err(),
        "settlement must pay the party the escrow names",
    );
}

#[test]
fn funds_come_home_after_the_deadline_even_if_the_payee_vanishes() {
    let (mut fx, deadline) = open(10 * SOL, 3_600);
    let payer = fx.payer.insecure_clone();
    assert!(
        settle(&mut fx, "refund", &payer, payer.pubkey()).is_err(),
        "no refund before the deadline",
    );

    warp(&mut fx.svm, deadline);
    // Permissionless: a payer who lost their key is not the only person who can
    // unstick this.
    let stranger = funded(&mut fx.svm, SOL);
    let before = fx.svm.get_account(&payer.pubkey()).unwrap().lamports;
    settle(&mut fx, "refund", &stranger, payer.pubkey()).expect("anyone may refund the payer");
    assert_eq!(fx.state().state, REFUNDED);
    assert_eq!(
        fx.svm.get_account(&payer.pubkey()).unwrap().lamports,
        before + 10 * SOL
    );
}

#[test]
fn a_dispute_stops_the_money_without_giving_it_to_anyone() {
    let (mut fx, deadline) = open(10 * SOL, 3_600);
    let payee = fx.payee.insecure_clone();
    let payer = fx.payer.insecure_clone();

    let vault_before = fx.svm.get_account(&fx.vault).unwrap().lamports;
    send(
        &mut fx.svm,
        Instruction {
            program_id: CLEARING,
            accounts: vec![
                AccountMeta::new_readonly(payee.pubkey(), true),
                AccountMeta::new(fx.escrow, false),
            ],
            data: data("dispute", &[4u8; 32]),
        },
        &[&payee],
    )
    .expect("payee disputes");

    assert_eq!(fx.state().state, DISPUTED);
    // Nothing moved. There is no arbitration path that hands the money to a
    // third party.
    assert_eq!(fx.svm.get_account(&fx.vault).unwrap().lamports, vault_before);
    assert!(
        settle(&mut fx, "release", &payer, payee.pubkey()).is_err(),
        "a disputed escrow cannot simply be released",
    );

    warp(&mut fx.svm, deadline);
    settle(&mut fx, "refund", &payer, payer.pubkey()).expect("a dispute resolves by refund");
}

#[test]
fn a_stranger_cannot_dispute_someone_elses_contract() {
    let (mut fx, _) = open(SOL, 3_600);
    let stranger = funded(&mut fx.svm, SOL);
    assert!(
        send(
            &mut fx.svm,
            Instruction {
                program_id: CLEARING,
                accounts: vec![
                    AccountMeta::new_readonly(stranger.pubkey(), true),
                    AccountMeta::new(fx.escrow, false),
                ],
                data: data("dispute", &[0u8; 32]),
            },
            &[&stranger],
        )
        .is_err(),
        "only a party to the contract may dispute it",
    );
    assert_eq!(fx.state().state, OPEN);
}

#[test]
fn an_escrow_settles_once() {
    let (mut fx, _) = open(5 * SOL, 3_600);
    let payer = fx.payer.insecure_clone();
    let payee_key = fx.payee.pubkey();
    settle(&mut fx, "release", &payer, payee_key).expect("release");
    assert_eq!(fx.state().lamports, 5 * SOL);
    assert!(
        settle(&mut fx, "release", &payer, payee_key).is_err(),
        "a settled escrow cannot pay twice",
    );
}
