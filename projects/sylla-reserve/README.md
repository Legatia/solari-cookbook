# sylla-reserve

The root reserve currency from `projects/sylla/MONETARY_PROTOCOL.md`, as a
Solana program. Step 4 of that document's build sequence: one currency, exact
on-chain accounting, nothing else.

The treasury holds only SOL. That is the design, not a simplification waiting to
be undone: with no imported assets there are no oracles, no bridges and no
valuation disputes, so the accounting can be proved before any of that risk is
introduced.

## Invariants enforced in code

| Invariant | Where |
|---|---|
| SOL is the only asset accepted, always | no other transfer path exists |
| The price is fixed before anyone deposits | `publish` |
| Nothing tradeable exists before reserves are verified | non-transferable `SubscriptionReceipt` |
| Supply follows capital, not ambition | `activate` computes from funded lamports |
| Mint and redeem both price at current NAV | `tokens_for_deposit`, `lamports_for_redemption` |
| Redemption is never gated, fee'd, paused or deadlined | `redeem` runs in `Active` and `WindDown` |
| Nobody can freeze or seize a balance | `publish` rejects a mint with a freeze authority |
| Rounding always favours the people who stay | every ratio floors, proven in `math.rs` |

## Tests

```bash
cargo test -p sylla-reserve --lib   # 11 accounting tests, no validator
cd tests-litesvm && cargo test      # 10 lifecycle tests against the real .so
```

The accounting tests are the deterministic model the protocol document asks for
in step 2, written as the same code that runs on chain rather than a separate
simulation that could drift from it.

`tests-litesvm` is its own cargo workspace on purpose. It builds with the host
toolchain, while `programs/` builds with the older Rust that ships with Solana
tools; a shared lockfile would drag edition-2024 crates into the on-chain build.

## Known limitation

`anchor build` cannot generate an IDL here: Anchor 0.30.1's macro crate needs a
`proc-macro2` API that newer versions removed, and the pins that satisfy the
on-chain build cannot also satisfy it. `anchor build --no-idl` produces the
deployable program. A hand-written IDL, or an Anchor upgrade, is the fix when a
TypeScript client is needed.

Deployment: see `DEPLOY.md`.
