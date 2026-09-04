//! Full lifecycle of a root currency, executed against the real compiled
//! program in LiteSVM: publish, subscribe, activate, claim, mint, redeem.
//!
//! These are not unit tests of the arithmetic — `math.rs` covers that. These
//! prove the account rules hold on chain: that nothing tradeable exists before
//! reserves are verified, that supply follows what was actually funded, and
//! that redemption cannot be closed off by anyone.

use borsh::{BorshDeserialize, BorshSerialize};
use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    program_pack::Pack,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};

const PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("Sy11aRsrv1111111111111111111111111111111111");
const DECIMALS: u8 = 9;
const SCALE: u64 = 1_000_000_000;
/// 0.0001 SOL per whole token, the illustrative price from the protocol draft.
const INITIAL_PRICE: u64 = 100_000;

/// Anchor derives an instruction's discriminator from its snake-case name.
fn discriminator(name: &str) -> [u8; 8] {
    let digest = Sha256::digest(format!("global:{name}").as_bytes());
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

fn data(name: &str, args: &impl BorshSerialize) -> Vec<u8> {
    let mut bytes = discriminator(name).to_vec();
    args.serialize(&mut bytes).unwrap();
    bytes
}

#[derive(BorshSerialize)]
struct PublishParams {
    initial_price: u64,
    min_capitalization: u64,
    max_capitalization: u64,
    subscription_ends_at: i64,
    entry_fee_bps: u16,
    version_hash: [u8; 32],
}

/// Mirrors the on-chain `Constitution`, minus the 8-byte account discriminator.
#[derive(BorshDeserialize, Debug)]
struct Constitution {
    _authority: Pubkey,
    _currency_mint: Pubkey,
    _version_hash: [u8; 32],
    _initial_price: u64,
    _min_capitalization: u64,
    _max_capitalization: u64,
    _subscription_ends_at: i64,
    subscribed_lamports: u64,
    genesis_supply: u64,
    outstanding_supply: u64,
    reserve_lamports: u64,
    _entry_fee_bps: u16,
    _decimals: u8,
    state: u8,
    _bump: u8,
    _treasury_bump: u8,
}

struct World {
    svm: LiteSVM,
    mint: Pubkey,
    constitution: Pubkey,
    treasury: Pubkey,
    authority: Keypair,
}

impl World {
    fn constitution(&self) -> Constitution {
        let raw = self.svm.get_account(&self.constitution).unwrap().data;
        Constitution::try_from_slice(&raw[8..]).unwrap()
    }

    fn nav_numerator(&self) -> u128 {
        let state = self.constitution();
        (state.reserve_lamports as u128) * (SCALE as u128) / (state.outstanding_supply as u128)
    }

    fn send(&mut self, instruction: Instruction, signers: &[&Keypair]) -> Result<(), String> {
        let payer = signers[0];
        // Repeating an identical instruction would otherwise reuse the same
        // blockhash and collide on signature, which is not what these tests
        // are trying to observe.
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&payer.pubkey()),
            signers,
            blockhash,
        );
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{e:?}"))
    }

    fn token_balance(&self, account: &Pubkey) -> u64 {
        let raw = self.svm.get_account(account).unwrap().data;
        spl_token::state::Account::unpack(&raw).unwrap().amount
    }

    fn advance_past_window(&mut self, ends_at: i64) {
        let mut clock = self.svm.get_sysvar::<solana_sdk::clock::Clock>();
        clock.unix_timestamp = ends_at + 1;
        self.svm.set_sysvar(&clock);
    }
}

fn funded(svm: &mut LiteSVM, lamports: u64) -> Keypair {
    let key = Keypair::new();
    svm.airdrop(&key.pubkey(), lamports).unwrap();
    key
}

/// Publish a currency and return the world plus the window close time.
fn publish(min_cap: u64, max_cap: u64, entry_fee_bps: u16) -> (World, i64) {
    let mut svm = LiteSVM::new();
    svm.add_program(PROGRAM_ID, include_bytes!("../../target/deploy/sylla_reserve.so"));

    let authority = funded(&mut svm, 100 * SCALE);
    let mint = Keypair::new();
    let (constitution, _) =
        Pubkey::find_program_address(&[b"constitution", mint.pubkey().as_ref()], &PROGRAM_ID);
    let (treasury, _) =
        Pubkey::find_program_address(&[b"treasury", mint.pubkey().as_ref()], &PROGRAM_ID);

    // The mint is created with the constitution PDA as mint authority and,
    // deliberately, no freeze authority at all — nobody can seize a balance.
    let mut mint_data = vec![0u8; spl_token::state::Mint::LEN];
    spl_token::state::Mint {
        mint_authority: solana_program::program_option::COption::Some(constitution),
        supply: 0,
        decimals: DECIMALS,
        is_initialized: true,
        freeze_authority: solana_program::program_option::COption::None,
    }
    .pack_into_slice(&mut mint_data);
    svm.set_account(
        mint.pubkey(),
        Account {
            lamports: 10_000_000,
            data: mint_data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();

    let ends_at = svm.get_sysvar::<solana_sdk::clock::Clock>().unix_timestamp + 3_600;
    let mut world = World { svm, mint: mint.pubkey(), constitution, treasury, authority };

    let params = PublishParams {
        initial_price: INITIAL_PRICE,
        min_capitalization: min_cap,
        max_capitalization: max_cap,
        subscription_ends_at: ends_at,
        entry_fee_bps,
        version_hash: [7u8; 32],
    };
    let authority_key = world.authority.pubkey();
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(authority_key, true),
            AccountMeta::new(constitution, false),
            AccountMeta::new_readonly(world.mint, false),
            AccountMeta::new(treasury, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("publish", &params),
    };
    let authority = world.authority.insecure_clone();
    world.send(instruction, &[&authority]).expect("publish");
    (world, ends_at)
}

fn subscribe(world: &mut World, who: &Keypair, lamports: u64) -> Result<(), String> {
    let (receipt, _) = Pubkey::find_program_address(
        &[b"subscription", world.constitution.as_ref(), who.pubkey().as_ref()],
        &PROGRAM_ID,
    );
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(who.pubkey(), true),
            AccountMeta::new(world.constitution, false),
            AccountMeta::new(receipt, false),
            AccountMeta::new(world.treasury, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("subscribe", &lamports),
    };
    world.send(instruction, &[who])
}

fn activate(world: &mut World) -> Result<(), String> {
    let cranker = funded(&mut world.svm, SCALE);
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(cranker.pubkey(), true),
            AccountMeta::new(world.constitution, false),
        ],
        data: data("activate", &()),
    };
    world.send(instruction, &[&cranker])
}

fn token_account(world: &mut World, owner: &Pubkey) -> Pubkey {
    let address = Keypair::new().pubkey();
    let mut raw = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account {
        mint: world.mint,
        owner: *owner,
        amount: 0,
        delegate: solana_program::program_option::COption::None,
        state: spl_token::state::AccountState::Initialized,
        is_native: solana_program::program_option::COption::None,
        delegated_amount: 0,
        close_authority: solana_program::program_option::COption::None,
    }
    .pack_into_slice(&mut raw);
    world
        .svm
        .set_account(
            address,
            Account {
                lamports: 10_000_000,
                data: raw,
                owner: spl_token::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    address
}

fn claim(world: &mut World, who: &Keypair, tokens: Pubkey) -> Result<(), String> {
    let (receipt, _) = Pubkey::find_program_address(
        &[b"subscription", world.constitution.as_ref(), who.pubkey().as_ref()],
        &PROGRAM_ID,
    );
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(who.pubkey(), true),
            AccountMeta::new_readonly(world.constitution, false),
            AccountMeta::new(receipt, false),
            AccountMeta::new(world.mint, false),
            AccountMeta::new(tokens, false),
            AccountMeta::new_readonly(spl_token::ID, false),
        ],
        data: data("claim", &()),
    };
    world.send(instruction, &[who])
}

fn mint_currency(
    world: &mut World,
    who: &Keypair,
    tokens: Pubkey,
    lamports: u64,
) -> Result<(), String> {
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(who.pubkey(), true),
            AccountMeta::new(world.constitution, false),
            AccountMeta::new(world.mint, false),
            AccountMeta::new(tokens, false),
            AccountMeta::new(world.treasury, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("mint_currency", &lamports),
    };
    world.send(instruction, &[who])
}

fn redeem(world: &mut World, who: &Keypair, tokens: Pubkey, amount: u64) -> Result<(), String> {
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(who.pubkey(), true),
            AccountMeta::new(world.constitution, false),
            AccountMeta::new(world.mint, false),
            AccountMeta::new(tokens, false),
            AccountMeta::new(world.treasury, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("redeem", &amount),
    };
    world.send(instruction, &[who])
}

fn begin_wind_down(world: &mut World) -> Result<(), String> {
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(world.authority.pubkey(), true),
            AccountMeta::new(world.constitution, false),
        ],
        data: data("begin_wind_down", &()),
    };
    let authority = world.authority.insecure_clone();
    world.send(instruction, &[&authority])
}

#[test]
fn nothing_tradeable_exists_before_reserves_are_verified() {
    let (mut world, ends_at) = publish(10 * SCALE, 100 * SCALE, 0);
    let alice = funded(&mut world.svm, 50 * SCALE);
    subscribe(&mut world, &alice, 20 * SCALE).expect("subscribe");

    // The mint has no supply during capitalization; the receipt is a PDA that
    // cannot be sold or moved.
    let raw = world.svm.get_account(&world.mint).unwrap().data;
    assert_eq!(spl_token::state::Mint::unpack(&raw).unwrap().supply, 0);

    let tokens = token_account(&mut world, &alice.pubkey());
    assert!(claim(&mut world, &alice, tokens).is_err(), "claim before activation");
    assert!(
        mint_currency(&mut world, &alice, tokens, SCALE).is_err(),
        "minting before activation",
    );

    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");
    assert_eq!(world.constitution().state, 1, "currency is active");
}

#[test]
fn supply_follows_what_was_actually_funded() {
    let (mut world, ends_at) = publish(10 * SCALE, 1_000 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    // Raise 60 SOL against a 1000 SOL maximum.
    subscribe(&mut world, &alice, 60 * SCALE).expect("subscribe");
    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");

    let state = world.constitution();
    // 60 SOL at 0.0001 SOL per token is 600,000 whole tokens.
    assert_eq!(state.genesis_supply, 600_000 * SCALE);
    assert_eq!(state.outstanding_supply, state.genesis_supply);
    assert_eq!(state.reserve_lamports, 60 * SCALE);
}

#[test]
fn a_raise_below_the_minimum_cannot_activate() {
    let (mut world, ends_at) = publish(50 * SCALE, 100 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 10 * SCALE).expect("subscribe");
    world.advance_past_window(ends_at);
    assert!(activate(&mut world).is_err(), "minimum capitalization not reached");
}

#[test]
fn unclaimed_subscribers_are_not_diluted_by_those_who_claim_first() {
    let (mut world, ends_at) = publish(10 * SCALE, 1_000 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    let bob = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 30 * SCALE).expect("alice");
    subscribe(&mut world, &bob, 10 * SCALE).expect("bob");
    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");

    let genesis = world.constitution().genesis_supply;
    let alice_tokens = token_account(&mut world, &alice.pubkey());
    claim(&mut world, &alice, alice_tokens).expect("alice claims");

    // Outstanding supply already counts Bob's unclaimed tokens, so NAV per
    // token is unchanged by Alice claiming hers.
    let state = world.constitution();
    assert_eq!(state.outstanding_supply, genesis);
    assert_eq!(world.token_balance(&alice_tokens), genesis / 4 * 3);

    let bob_tokens = token_account(&mut world, &bob.pubkey());
    claim(&mut world, &bob, bob_tokens).expect("bob claims");
    assert_eq!(world.token_balance(&bob_tokens), genesis / 4);
}

#[test]
fn a_receipt_belongs_to_one_person_and_cannot_be_claimed_by_another() {
    let (mut world, ends_at) = publish(10 * SCALE, 1_000 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    let mallory = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 20 * SCALE).expect("alice");
    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");

    // Mallory has no receipt of her own, and cannot reach Alice's.
    let mallory_tokens = token_account(&mut world, &mallory.pubkey());
    assert!(claim(&mut world, &mallory, mallory_tokens).is_err());
}

#[test]
fn minting_and_redeeming_never_move_nav_down() {
    let (mut world, ends_at) = publish(10 * SCALE, 10_000 * SCALE, 25);
    let alice = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 40 * SCALE).expect("alice");
    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");

    let alice_tokens = token_account(&mut world, &alice.pubkey());
    claim(&mut world, &alice, alice_tokens).expect("claim");

    let bob = funded(&mut world.svm, 500 * SCALE);
    let bob_tokens = token_account(&mut world, &bob.pubkey());

    let mut nav = world.nav_numerator();
    for deposit in [SCALE / 3, SCALE, 7 * SCALE, SCALE / 7, 13 * SCALE] {
        mint_currency(&mut world, &bob, bob_tokens, deposit).expect("mint");
        let next = world.nav_numerator();
        assert!(next >= nav, "mint moved NAV down: {nav} -> {next}");
        nav = next;
    }

    // The entry fee stayed in the reserve, so NAV rose for everyone holding.
    assert!(nav > (INITIAL_PRICE as u128), "fees should lift NAV above the issue price");

    for burn in [1_000_000u64, 999_999_999, 12_345_678_901] {
        redeem(&mut world, &bob, bob_tokens, burn).expect("redeem");
        let next = world.nav_numerator();
        assert!(next >= nav, "redemption moved NAV down: {nav} -> {next}");
        nav = next;
    }
}

#[test]
fn a_round_trip_cannot_extract_value_from_the_reserve() {
    let (mut world, ends_at) = publish(10 * SCALE, 10_000 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 40 * SCALE).expect("alice");
    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");
    let alice_tokens = token_account(&mut world, &alice.pubkey());
    claim(&mut world, &alice, alice_tokens).expect("claim");

    let mallory = funded(&mut world.svm, 200 * SCALE);
    let mallory_tokens = token_account(&mut world, &mallory.pubkey());
    let reserve_before = world.constitution().reserve_lamports;

    for _ in 0..8 {
        mint_currency(&mut world, &mallory, mallory_tokens, 3 * SCALE + 7).expect("mint");
        let held = world.token_balance(&mallory_tokens);
        redeem(&mut world, &mallory, mallory_tokens, held).expect("redeem");
    }

    assert!(
        world.constitution().reserve_lamports >= reserve_before,
        "eight round trips drained the reserve",
    );
    assert_eq!(world.token_balance(&mallory_tokens), 0);
}

#[test]
fn wind_down_closes_issuance_but_never_the_exit() {
    let (mut world, ends_at) = publish(10 * SCALE, 1_000 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 40 * SCALE).expect("alice");
    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");
    let alice_tokens = token_account(&mut world, &alice.pubkey());
    claim(&mut world, &alice, alice_tokens).expect("claim");

    begin_wind_down(&mut world).expect("wind down");
    assert_eq!(world.constitution().state, 2);

    // The door in is shut.
    assert!(
        mint_currency(&mut world, &alice, alice_tokens, SCALE).is_err(),
        "minting must stop during wind-down",
    );
    // The door out is not, and never can be.
    let held = world.token_balance(&alice_tokens);
    let sol_before = world.svm.get_account(&alice.pubkey()).unwrap().lamports;
    redeem(&mut world, &alice, alice_tokens, held / 2).expect("redemption stays open");
    assert!(world.svm.get_account(&alice.pubkey()).unwrap().lamports > sol_before);
}

#[test]
fn only_the_published_authority_can_close_issuance() {
    let (mut world, ends_at) = publish(10 * SCALE, 1_000 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 40 * SCALE).expect("alice");
    world.advance_past_window(ends_at);
    activate(&mut world).expect("activate");

    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(alice.pubkey(), true),
            AccountMeta::new(world.constitution, false),
        ],
        data: data("begin_wind_down", &()),
    };
    assert!(world.send(instruction, &[&alice]).is_err());
}

#[test]
fn subscriptions_stop_at_the_published_maximum_and_the_published_deadline() {
    let (mut world, ends_at) = publish(SCALE, 10 * SCALE, 0);
    let alice = funded(&mut world.svm, 100 * SCALE);
    subscribe(&mut world, &alice, 9 * SCALE).expect("within the maximum");
    assert!(
        subscribe(&mut world, &alice, 2 * SCALE).is_err(),
        "the maximum capitalization is a hard ceiling",
    );

    world.advance_past_window(ends_at);
    assert!(
        subscribe(&mut world, &alice, SCALE).is_err(),
        "the window closes on the published slot",
    );
}
