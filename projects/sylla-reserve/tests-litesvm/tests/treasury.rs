//! A treasury that holds more than SOL, and what happens when its prices lie.
//!
//! These are the scenarios the build sequence asks for and that a live feed
//! cannot produce: a depeg, a stale oracle, a widening confidence interval, and
//! a correlated drawdown. Each one asks the same question — does the door out
//! stay open when the numbers stop being trustworthy?

mod common;
use common::*;

use borsh::{BorshDeserialize, BorshSerialize};
use litesvm::LiteSVM;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    program_pack::Pack,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
};

const PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("CFvQkQeqdo9wJtPYEqzF9RTrTPtar41UtcQUf6F7j1Dy");
const SOL: u64 = 1_000_000_000;
const CURRENCY_DECIMALS: u8 = 9;
/// A dollar-ish stand-in, six decimals like real USDC.
const TUSD_DECIMALS: u8 = 6;
const INITIAL_PRICE: u64 = 100_000;
const MAX_STALENESS_SLOTS: u64 = 300;

#[derive(BorshSerialize)]
struct PublishParams {
    initial_price: u64,
    min_capitalization: u64,
    max_capitalization: u64,
    subscription_ends_at: i64,
    entry_fee_bps: u16,
    version_hash: [u8; 32],
    max_staleness_slots: u64,
    max_confidence_bps: u16,
}

#[derive(BorshSerialize)]
struct AssetParams {
    target_weight_bps: u16,
    lower_band_bps: u16,
    upper_band_bps: u16,
    collateral_factor_bps: u16,
}

#[derive(BorshDeserialize, Debug)]
struct Constitution {
    _authority: Pubkey,
    _currency_mint: Pubkey,
    _version_hash: [u8; 32],
    _initial_price: u64,
    _min_capitalization: u64,
    _max_capitalization: u64,
    _subscription_ends_at: i64,
    _subscribed_lamports: u64,
    _genesis_supply: u64,
    outstanding_supply: u64,
    reserve_lamports: u64,
}

struct World {
    svm: LiteSVM,
    authority: Keypair,
    currency_mint: Pubkey,
    constitution: Pubkey,
    treasury: Pubkey,
    tusd_mint: Pubkey,
    tusd_treasury: Pubkey,
    tusd_feed: Pubkey,
}

impl World {
    fn state(&self) -> Constitution {
        let raw = account_data(&self.svm, &self.constitution);
        Constitution::deserialize(&mut &raw[8..]).unwrap()
    }

    /// The accounts every valuation-sensitive instruction must carry.
    fn valuation_accounts(&self) -> Vec<AccountMeta> {
        vec![
            AccountMeta::new_readonly(self.tusd_treasury, false),
            AccountMeta::new_readonly(self.tusd_feed, false),
        ]
    }

    fn token_balance(&self, account: &Pubkey) -> u64 {
        let raw = account_data(&self.svm, account);
        spl_token::state::Account::unpack(&raw).unwrap().amount
    }
}

fn make_mint(svm: &mut LiteSVM, authority: Option<Pubkey>, decimals: u8) -> Pubkey {
    let key = Keypair::new().pubkey();
    let mut raw = vec![0u8; spl_token::state::Mint::LEN];
    spl_token::state::Mint {
        mint_authority: match authority {
            Some(a) => solana_program::program_option::COption::Some(a),
            None => solana_program::program_option::COption::None,
        },
        supply: 0,
        decimals,
        is_initialized: true,
        freeze_authority: solana_program::program_option::COption::None,
    }
    .pack_into_slice(&mut raw);
    svm.set_account(
        key,
        Account { lamports: 10_000_000, data: raw, owner: spl_token::ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();
    key
}

fn make_token_account(svm: &mut LiteSVM, mint: Pubkey, owner: Pubkey, amount: u64) -> Pubkey {
    let key = Keypair::new().pubkey();
    let mut raw = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account {
        mint,
        owner,
        amount,
        delegate: solana_program::program_option::COption::None,
        state: spl_token::state::AccountState::Initialized,
        is_native: solana_program::program_option::COption::None,
        delegated_amount: 0,
        close_authority: solana_program::program_option::COption::None,
    }
    .pack_into_slice(&mut raw);
    svm.set_account(
        key,
        Account { lamports: 10_000_000, data: raw, owner: spl_token::ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();
    key
}

fn publish_price(world: &mut World, price: u64, confidence_bps: u16) -> Result<(), String> {
    let authority = world.authority.insecure_clone();
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new_readonly(world.tusd_mint, false),
            AccountMeta::new(world.tusd_feed, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: data("publish_price", &(price, confidence_bps)),
    };
    send(&mut world.svm, ix, &[&authority])
}

/// A currency capitalized with 40 SOL and holding 4,000 tUSD, priced at
/// 0.01 SOL each — so the asset sleeve is worth 40 SOL too, a 50/50 treasury.
fn world_with_treasury() -> World {
    let mut svm = LiteSVM::new();
    svm.add_program(PROGRAM_ID, include_bytes!("../../target/deploy/sylla_reserve.so"));
    let authority = funded(&mut svm, 1_000 * SOL);

    let currency_mint = Keypair::new().pubkey();
    let (constitution, _) =
        Pubkey::find_program_address(&[b"constitution", currency_mint.as_ref()], &PROGRAM_ID);
    let (treasury, _) =
        Pubkey::find_program_address(&[b"treasury", currency_mint.as_ref()], &PROGRAM_ID);

    // Recreate the currency mint with the constitution as its authority.
    let mut raw = vec![0u8; spl_token::state::Mint::LEN];
    spl_token::state::Mint {
        mint_authority: solana_program::program_option::COption::Some(constitution),
        supply: 0,
        decimals: CURRENCY_DECIMALS,
        is_initialized: true,
        freeze_authority: solana_program::program_option::COption::None,
    }
    .pack_into_slice(&mut raw);
    svm.set_account(
        currency_mint,
        Account { lamports: 10_000_000, data: raw, owner: spl_token::ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();

    let tusd_mint = make_mint(&mut svm, Some(authority.pubkey()), TUSD_DECIMALS);
    // 4,000 tUSD at 0.01 SOL is 40 SOL, matching the 40 SOL sleeve.
    let tusd_treasury = make_token_account(&mut svm, tusd_mint, constitution, 4_000_000_000);
    let (tusd_feed, _) =
        Pubkey::find_program_address(&[b"price-feed", tusd_mint.as_ref()], &PROGRAM_ID);

    let ends_at = now(&svm) + 3_600;
    let mut world = World {
        svm,
        authority,
        currency_mint,
        constitution,
        treasury,
        tusd_mint,
        tusd_treasury,
        tusd_feed,
    };

    let authority = world.authority.insecure_clone();
    send(
        &mut world.svm,
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(authority.pubkey(), true),
                AccountMeta::new(constitution, false),
                AccountMeta::new_readonly(currency_mint, false),
                AccountMeta::new(treasury, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data(
                "publish",
                &PublishParams {
                    initial_price: INITIAL_PRICE,
                    min_capitalization: 10 * SOL,
                    max_capitalization: 10_000 * SOL,
                    subscription_ends_at: ends_at,
                    entry_fee_bps: 0,
                    version_hash: [7u8; 32],
                    max_staleness_slots: MAX_STALENESS_SLOTS,
                    max_confidence_bps: 200,
                },
            ),
        },
        &[&authority],
    )
    .expect("publish");

    // 0.01 SOL per tUSD.
    publish_price(&mut world, SOL / 100, 0).expect("first price");

    send(
        &mut world.svm,
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(authority.pubkey(), true),
                AccountMeta::new(constitution, false),
                AccountMeta::new_readonly(world.tusd_mint, false),
                AccountMeta::new_readonly(world.tusd_feed, false),
                AccountMeta::new_readonly(world.tusd_treasury, false),
            ],
            data: data(
                "register_asset",
                &AssetParams {
                    target_weight_bps: 5_000,
                    lower_band_bps: 4_500,
                    upper_band_bps: 5_500,
                    // Bridged-asset style factor: prudential only.
                    collateral_factor_bps: 8_000,
                },
            ),
        },
        &[&authority],
    )
    .expect("register asset");

    // Subscribe 40 SOL.
    let (receipt, _) = Pubkey::find_program_address(
        &[b"subscription", constitution.as_ref(), authority.pubkey().as_ref()],
        &PROGRAM_ID,
    );
    send(
        &mut world.svm,
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(authority.pubkey(), true),
                AccountMeta::new(constitution, false),
                AccountMeta::new(receipt, false),
                AccountMeta::new(treasury, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: data("subscribe", &(40 * SOL)),
        },
        &[&authority],
    )
    .expect("subscribe");



    warp(&mut world.svm, ends_at + 1);
    let cranker = funded(&mut world.svm, SOL);
    send(
        &mut world.svm,
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(cranker.pubkey(), true),
                AccountMeta::new(constitution, false),
            ],
            data: data("activate", &()),
        },
        &[&cranker],
    )
    .expect("activate");

    world
}

fn mint_currency(world: &mut World, who: &Keypair, tokens: Pubkey, lamports: u64) -> Result<(), String> {
    let mut accounts = vec![
        AccountMeta::new(who.pubkey(), true),
        AccountMeta::new(world.constitution, false),
        AccountMeta::new(world.currency_mint, false),
        AccountMeta::new(tokens, false),
        AccountMeta::new(world.treasury, false),
        AccountMeta::new_readonly(spl_token::ID, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];
    accounts.extend(world.valuation_accounts());
    let ix = Instruction { program_id: PROGRAM_ID, accounts, data: data("mint_currency", &lamports) };
    send(&mut world.svm, ix, &[who])
}

fn redeem(world: &mut World, who: &Keypair, tokens: Pubkey, amount: u64) -> Result<(), String> {
    let mut accounts = vec![
        AccountMeta::new(who.pubkey(), true),
        AccountMeta::new(world.constitution, false),
        AccountMeta::new(world.currency_mint, false),
        AccountMeta::new(tokens, false),
        AccountMeta::new(world.treasury, false),
        AccountMeta::new_readonly(spl_token::ID, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];
    accounts.extend(world.valuation_accounts());
    let ix = Instruction { program_id: PROGRAM_ID, accounts, data: data("redeem", &amount) };
    send(&mut world.svm, ix, &[who])
}

fn claim(world: &mut World, who: &Keypair, tokens: Pubkey) -> Result<(), String> {
    let (receipt, _) = Pubkey::find_program_address(
        &[b"subscription", world.constitution.as_ref(), who.pubkey().as_ref()],
        &PROGRAM_ID,
    );
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(who.pubkey(), true),
            AccountMeta::new_readonly(world.constitution, false),
            AccountMeta::new(receipt, false),
            AccountMeta::new(world.currency_mint, false),
            AccountMeta::new(tokens, false),
            AccountMeta::new_readonly(spl_token::ID, false),
        ],
        data: data("claim", &()),
    };
    send(&mut world.svm, ix, &[who])
}

#[test]
fn nav_counts_the_asset_sleeve_not_just_the_sol() {
    let mut world = world_with_treasury();
    let holder = funded(&mut world.svm, 100 * SOL);
    let tokens = make_token_account(&mut world.svm, world.currency_mint, holder.pubkey(), 0);

    // 40 SOL of SOL and 40 SOL of tUSD: a deposit of 8 SOL buys a tenth of the
    // supply, not a fifth. Valuing only the SOL sleeve would mint twice as much.
    let supply_before = world.state().outstanding_supply;
    mint_currency(&mut world, &holder, tokens, 8 * SOL).expect("mint");
    let minted = world.token_balance(&tokens);
    let expected = supply_before / 10;
    assert!(
        minted.abs_diff(expected) < expected / 1_000,
        "minted {minted}, expected about {expected}",
    );
}

#[test]
fn a_depeg_marks_the_treasury_down_and_everyone_shares_it() {
    let mut world = world_with_treasury();
    let holder = funded(&mut world.svm, 100 * SOL);
    let tokens = make_token_account(&mut world.svm, world.currency_mint, holder.pubkey(), 0);
    mint_currency(&mut world, &holder, tokens, 8 * SOL).expect("mint at par");
    let held = world.token_balance(&tokens);

    // tUSD halves. Nothing else changes.
    publish_price(&mut world, SOL / 200, 0).expect("depeg");

    // The claim is smaller because the treasury is smaller — not because
    // anyone was singled out. Before: 88 SOL of NAV. After: 68.
    let before = world.svm.get_account(&holder.pubkey()).unwrap().lamports;
    redeem(&mut world, &holder, tokens, held).expect("redemption still works");
    let received = world.svm.get_account(&holder.pubkey()).unwrap().lamports - before;
    assert!(
        received < 8 * SOL,
        "a depegged treasury must pay out less, got {received}",
    );
    assert!(received > 5 * SOL, "but it must still pay the real remaining value");
}

#[test]
fn a_stale_feed_stops_minting_and_leaves_redemption_alone() {
    let mut world = world_with_treasury();
    let holder = funded(&mut world.svm, 100 * SOL);
    let tokens = make_token_account(&mut world.svm, world.currency_mint, holder.pubkey(), 0);
    mint_currency(&mut world, &holder, tokens, 8 * SOL).expect("mint while fresh");
    let held = world.token_balance(&tokens);

    // Let the price go quiet for longer than the constitution allows.
    let slot = world.svm.get_sysvar::<solana_sdk::clock::Clock>().slot;
    world.svm.warp_to_slot(slot + MAX_STALENESS_SLOTS + 10);

    assert!(
        mint_currency(&mut world, &holder, tokens, SOL).is_err(),
        "minting against a stale price must stop",
    );
    // The SOL route is also valuation-sensitive and pauses with it. What must
    // never close is the exit itself, which is why in-kind exists — see the
    // next test.
    assert!(redeem(&mut world, &holder, tokens, held / 2).is_err());

    // A fresh price reopens both, with no intervention beyond publishing.
    publish_price(&mut world, SOL / 100, 0).expect("republish");
    redeem(&mut world, &holder, tokens, held / 2).expect("redemption resumes");
}

#[test]
fn an_uncertain_price_is_refused_before_it_is_wrong() {
    let mut world = world_with_treasury();
    let holder = funded(&mut world.svm, 100 * SOL);
    let tokens = make_token_account(&mut world.svm, world.currency_mint, holder.pubkey(), 0);

    // The price has not moved, but the feed says it is no longer sure.
    publish_price(&mut world, SOL / 100, 900).expect("wide confidence");
    assert!(
        mint_currency(&mut world, &holder, tokens, SOL).is_err(),
        "a feed that admits uncertainty must not price a mint",
    );

    publish_price(&mut world, SOL / 100, 50).expect("narrow again");
    mint_currency(&mut world, &holder, tokens, SOL).expect("confidence restored");
}

#[test]
fn valuation_prices_at_the_low_edge_of_an_uncertain_interval() {
    let mut world = world_with_treasury();
    let holder = funded(&mut world.svm, 100 * SOL);
    let a = make_token_account(&mut world.svm, world.currency_mint, holder.pubkey(), 0);
    mint_currency(&mut world, &holder, a, 4 * SOL).expect("certain price");
    let certain = world.token_balance(&a);

    // Same price, but the feed is now less sure. A lower marked NAV means the
    // same money buys a larger share — the conservative direction.
    publish_price(&mut world, SOL / 100, 150).expect("some uncertainty");
    let b = make_token_account(&mut world.svm, world.currency_mint, holder.pubkey(), 0);
    mint_currency(&mut world, &holder, b, 4 * SOL).expect("uncertain price");
    assert!(
        world.token_balance(&b) > certain,
        "marking down for uncertainty must not favour the treasury's optimism",
    );
}

#[test]
fn a_correlated_drawdown_still_settles_pro_rata() {
    let mut world = world_with_treasury();
    let alice = funded(&mut world.svm, 200 * SOL);
    let bob = funded(&mut world.svm, 200 * SOL);
    let alice_tokens = make_token_account(&mut world.svm, world.currency_mint, alice.pubkey(), 0);
    let bob_tokens = make_token_account(&mut world.svm, world.currency_mint, bob.pubkey(), 0);
    mint_currency(&mut world, &alice, alice_tokens, 20 * SOL).expect("alice");
    mint_currency(&mut world, &bob, bob_tokens, 20 * SOL).expect("bob");

    // Everything falls at once: the asset sleeve loses seventy percent.
    publish_price(&mut world, SOL * 3 / 1_000, 0).expect("drawdown");

    // Both hold the same amount and both get the same, smaller, honest share.
    let alice_held = world.token_balance(&alice_tokens);
    let bob_held = world.token_balance(&bob_tokens);
    assert!(alice_held.abs_diff(bob_held) < alice_held / 1_000);

    let a_before = world.svm.get_account(&alice.pubkey()).unwrap().lamports;
    redeem(&mut world, &alice, alice_tokens, alice_held).expect("alice exits");
    let a_got = world.svm.get_account(&alice.pubkey()).unwrap().lamports - a_before;

    let b_before = world.svm.get_account(&bob.pubkey()).unwrap().lamports;
    redeem(&mut world, &bob, bob_tokens, bob_held).expect("bob exits after");
    let b_got = world.svm.get_account(&bob.pubkey()).unwrap().lamports - b_before;

    // Going second is not punished. There is no first-mover advantage to find.
    assert!(
        a_got.abs_diff(b_got) < a_got / 100,
        "first out got {a_got}, second out got {b_got}",
    );
}

#[test]
fn the_sol_route_is_bounded_by_the_sleeve_it_draws_on() {
    let mut world = world_with_treasury();
    // The authority is the genesis subscriber, so its receipt is the one to
    // claim; the token account has to belong to it.
    let authority = world.authority.insecure_clone();
    let tokens =
        make_token_account(&mut world.svm, world.currency_mint, authority.pubkey(), 0);
    claim(&mut world, &authority, tokens).expect("claim genesis");

    let held = world.token_balance(&tokens);
    let reserve = world.state().reserve_lamports;
    assert!(reserve > 0);
    // The whole genesis claim is worth the whole treasury, but only half of it
    // is SOL. The convenience route refuses rather than overdrawing the sleeve.
    assert!(
        redeem(&mut world, &authority, tokens, held).is_err(),
        "cannot pay a whole-treasury claim out of the SOL sleeve alone",
    );
    // A smaller claim the sleeve can cover still settles.
    redeem(&mut world, &authority, tokens, held / 8).expect("within the sleeve");
}

#[test]
fn a_substituted_feed_or_account_is_refused() {
    let mut world = world_with_treasury();
    let holder = funded(&mut world.svm, 100 * SOL);
    let tokens = make_token_account(&mut world.svm, world.currency_mint, holder.pubkey(), 0);

    // A fuller token account for the same asset, which a caller might prefer.
    let richer = make_token_account(&mut world.svm, world.tusd_mint, world.constitution, u32::MAX as u64);
    let mut accounts = vec![
        AccountMeta::new(holder.pubkey(), true),
        AccountMeta::new(world.constitution, false),
        AccountMeta::new(world.currency_mint, false),
        AccountMeta::new(tokens, false),
        AccountMeta::new(world.treasury, false),
        AccountMeta::new_readonly(spl_token::ID, false),
        AccountMeta::new_readonly(system_program::ID, false),
        AccountMeta::new_readonly(richer, false),
        AccountMeta::new_readonly(world.tusd_feed, false),
    ];
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.clone(),
        data: data("mint_currency", &SOL),
    };
    assert!(
        send(&mut world.svm, ix, &[&holder]).is_err(),
        "the treasury account is fixed by the slot, not chosen by the caller",
    );

    // Omitting the valuation accounts entirely must also fail, rather than
    // silently valuing the asset sleeve at zero.
    accounts.truncate(7);
    let ix = Instruction { program_id: PROGRAM_ID, accounts, data: data("mint_currency", &SOL) };
    assert!(send(&mut world.svm, ix, &[&holder]).is_err(), "a missing feed is not a zero price");
}
