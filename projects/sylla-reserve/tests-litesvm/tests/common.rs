//! Shared harness for the programs that are not the reserve.
#![allow(dead_code)]

use borsh::BorshSerialize;
use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

pub fn discriminator(name: &str) -> [u8; 8] {
    let digest = Sha256::digest(format!("global:{name}").as_bytes());
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

pub fn data(name: &str, args: &impl BorshSerialize) -> Vec<u8> {
    let mut bytes = discriminator(name).to_vec();
    args.serialize(&mut bytes).unwrap();
    bytes
}

pub fn funded(svm: &mut LiteSVM, lamports: u64) -> Keypair {
    let key = Keypair::new();
    svm.airdrop(&key.pubkey(), lamports).unwrap();
    key
}

pub fn send(
    svm: &mut LiteSVM,
    instruction: Instruction,
    signers: &[&Keypair],
) -> Result<(), String> {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&signers[0].pubkey()),
        signers,
        blockhash,
    );
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{e:?}"))
}

pub fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<solana_sdk::clock::Clock>().unix_timestamp
}

pub fn warp(svm: &mut LiteSVM, to: i64) {
    let mut clock = svm.get_sysvar::<solana_sdk::clock::Clock>();
    clock.unix_timestamp = to;
    svm.set_sysvar(&clock);
}

pub fn account_data(svm: &LiteSVM, key: &Pubkey) -> Vec<u8> {
    svm.get_account(key).unwrap().data
}
