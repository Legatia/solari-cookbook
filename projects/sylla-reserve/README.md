# sylla-protocol

The seven programs from `projects/sylla/MONETARY_PROTOCOL.md`, live on devnet.

| Program | Devnet address |
|---|---|
| `reserve` | `CFvQkQeqdo9wJtPYEqzF9RTrTPtar41UtcQUf6F7j1Dy` |
| `constitution` | `GTdJ5kvtBr3hAy3eSof9R4yxQwbVR1BSbwUCAkZFG6hS` |
| `mandate` | `EiK8fXf4oeSrmKc78dnmRV5fgY7coqpgQ6zewYhFavuo` |
| `charter` | `ACCizZVbLXRwU6WQqjf1HuowuXcJydoadZM4cU6fntQv` |
| `observatory` | `GNeC3AnGTZUFeRTkXkw3A1qxr7RzPGtWLxv6jV4FFNQE` |
| `clearing` | `Ez2UhS3Wm5q7ZicyrjS4okysQBvpAyb7gseXq23GYfDy` |
| `court` | `A3gSnb7GkuwMzSZZAYPXtbfiGfeZ8fJxw7zhsJLRfsYP` |

**Reserve** — one currency, capitalized in SOL, priced at NAV over a treasury
that may hold SOL plus up to four approved assets, each with a price feed, an
allocation band, and a prudential collateral factor.
**Constitution** — approved-program registry and charter compliance state.
**Mandate** — bounded, expiring, revocable agent spend authority.
**Charter** — sponsor bonds held apart from holder reserves.
**Observatory** — reserve attestations and permissionless breach proofs.
**Clearing** — agent-contract escrow, held outside any charter.
**Court** — inert by construction: a record that moves no value.

### Why the oracle is a settable account

Not a shortcut. The build sequence requires modelling oracle failure, depeg and
correlated drawdown, and none of those can be produced against a live feed: you
cannot make Pyth go stale, widen its confidence, or fall sixty percent on
demand. The feed's shape is Pyth's — price, publish slot, confidence — so a
Pyth adapter replaces one read and nothing else.

Valuation prices at the **low edge** of the confidence interval. A treasury
that marks itself at the optimistic end of every uncertain price discovers it
was smaller than it thought at the worst possible moment.

An unusable feed fails the whole valuation rather than being skipped. Skipping
would value the missing asset at zero and quietly mint someone a larger share
of a treasury that is merely unmeasured.

Collateral factors are computed but never applied to a holder's claim. Marking
holder assets below fair value transfers value between whoever redeems before
the mark and whoever redeems after; the factor exists to gate eligibility and
size capital, not to reprice someone's share.

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
