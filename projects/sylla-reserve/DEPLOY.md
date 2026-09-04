# Deploying the root reserve to devnet

The program builds and its full lifecycle is proven in LiteSVM. Nothing below
touches mainnet, and nothing below should be run against real value.

## Once

```bash
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json   # if you have no key
solana airdrop 5
```

## Program address

`Anchor.toml` and `declare_id!` currently carry a vanity placeholder
(`Sy11aRsrv…`) that nobody holds the key for. Generate a real one and replace
it in both places before deploying:

```bash
solana-keygen grind --starts-with Syl:1 --ignore-case
mv Syl*.json target/deploy/sylla_reserve-keypair.json
solana address -k target/deploy/sylla_reserve-keypair.json
```

Put that address into `declare_id!` in `programs/sylla-reserve/src/lib.rs` and
into both `[programs.*]` blocks in `Anchor.toml`, then rebuild.

## Build and deploy

```bash
anchor build --no-idl
solana program deploy target/deploy/sylla_reserve.so \
  --program-id target/deploy/sylla_reserve-keypair.json \
  --url devnet
```

`--no-idl` is required until the Anchor version here can generate an IDL under
the Rust that ships with Solana tools; see the note in the README. The IDL is a
client convenience, not part of the deployed program.

## Bringing a currency up

1. Create an SPL mint with **no freeze authority** and mint authority set to
   the constitution PDA, `["constitution", mint]`. `publish` rejects a mint that
   has a freeze authority or any existing supply.
2. `publish` — fixes the price, the capitalization band, the window, and the
   hash of the constitution document. Nothing here can be edited afterwards.
3. `subscribe` — SOL in, non-transferable receipt out.
4. `activate` — permissionless once the window closes and the minimum is met.
   Supply is computed from what was actually funded.
5. `claim` — receipt in, pro-rata tokens out, rent returned.
6. `mint_currency` / `redeem` — open from then on.

## What this is not

One currency with a SOL-only treasury. No external reserve assets, no oracles,
no charter currencies, no clearing, no court. Those are separate programs and
separate risk; this one exists to prove the accounting exactly before any of it
is added.
