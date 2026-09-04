# Sylla Monetary Protocol

> A constitutional reserve and charter-currency system for an economy of human-owned personal agents.

**Status:** Concept draft 0.3  
**Date:** 2026-09-02  
**Implementation status:** Not implemented  
**Product boundary:** Long-term Sylla protocol direction; not part of the current social-discovery pilot

## Thesis

Sylla may become more than portable identity and relationship infrastructure for personal agents. Its long-term hypothesis is that human-owned personal agents will become economic actors: they will contract, buy services, allocate resources, and form institutions across human boundaries. They therefore need an economic system with:

- A common reserve and settlement asset.
- Verifiable human authority over agent spending.
- Transparent treasuries.
- Rules for forming subordinate economic institutions.
- Solvency, disclosure, and liquidation standards.
- Courts and sanctions for violations that code alone cannot resolve.

The proposed model uses Solana as the execution layer and SOL as the universal founding capital. SOL enters the economy; $SYL circulates inside it.

Every protocol currency is initially capitalized with SOL. Its published initial price remains static until activation. After activation, its price floats against SOL according to the net asset value of its actual treasury reserves.

The root currency, provisionally called **$SYL**, combines two functions:

- **Reserve-backed asset:** it is minted and redeemed against a disclosed onchain treasury.
- **Native economic asset:** Sylla applications use it for agent payments, escrow, bounties, fees, institutional bonds, dispute deposits, and common settlement.

The protocol does not claim that reserve backing alone makes $SYL money. $SYL becomes useful only if participation in the Sylla economy provides services that agents and their humans genuinely value. SOL remains available outside the protocol; $SYL is the constitutional economic asset within it.

Chartered agent institutions may create specialized currencies. The protocol does not require them to hold $SYL. Charter compliance is enforced at the program level instead: charter programs are deployed by the Charter Factory and their operating authority can be frozen, while holder redemption is never gated. Charter sponsors separately post a slashable $SYL bond that is not part of holder backing.

The core doctrine is:

> Every currency may choose its treasury, but it cannot conceal its constitution, mint beyond its reserves, or externalize its failure onto the parent economy.

The resulting hierarchy is not intended to reproduce a nation-state central bank. It is a constitutional economy with automatic reserve issuance, native application demand, subordinate institutions, and bounded enforcement.

## Foundational principles

### Human sovereignty

Agents are not independent owners of human assets. A human principal owns the wallet and grants a personal agent a bounded, expiring, revocable economic mandate.

### SOL as founding capital

SOL is the only asset accepted during primary capitalization and continuous minting. A currency's treasury may subsequently allocate that SOL into its published reserve assets.

### Transparent monetary constitutions

Every currency publishes its treasury policy, initial price, valuation rules, risk limits, governance, and wind-down procedure before accepting capital.

### Reserve-backed issuance

No transferable currency may be issued without corresponding funded reserve value. Supply follows capital; a founder may not select an arbitrary supply and treat it as value.

### Native economic use

Core Sylla economic applications denominate or settle protocol-native obligations in $SYL. Requiring $SYL is justified only where it provides access to an actual Sylla service, such as clearing, escrow, institutional bonding, dispute resolution, or agent-to-agent contracting. Token ownership alone must not substitute for productive participation.

### Pluralism at the edges

$SYL remains the conservative root reserve. Chartered institutions may experiment with different purposes, assets, and monetary policies without imposing their risks on $SYL.

Pluralism applies to what a charter does, not to the code that governs its authority. Enforcement depends on the protocol retaining program-level control over charter operating authority, which means charter programs are standardized and factory-deployed rather than freely deployed by sponsors. This is a deliberate constraint and it is what makes every sanction in this document mechanically possible.

### Failure isolation

The root treasury never holds charter currencies. A charter reserve may hold only $SYL and explicitly approved external assets; it may not hold another charter currency, a wrapper containing one, or an LP position exposed to one. This hard whitelist prevents a local failure from recursively impairing the system.

### Legible and reversible authority

Humans can revoke agent mandates. Currency holders retain redemption and wind-down rights. Sanctions target a violating institution and its posted capital rather than unrelated human assets.

## Institutional hierarchy

```text
Human principals
└── Personal Agent Passports
    └── Sylla Constitution
        ├── Reserve Bank
        │   ├── Root $SYL mint
        │   ├── SOL liquidity reserve
        │   ├── Diversified strategic reserve
        │   └── Rule-bound issuance and revenue policy
        │
        ├── Charter Office
        │   └── Chartered Houses / Guilds
        │       ├── Charter currency
        │       ├── Local treasury
        │       ├── Governance constitution
        │       └── Agent branches and services
        │
        ├── Clearing House
        │   ├── $SYL/charter-currency markets
        │   ├── Agent-contract escrow
        │   └── Cross-currency settlement
        │
        ├── Observatory
        │   ├── Reserve proofs
        │   ├── Oracle and bridge monitoring
        │   ├── Asset risk grades
        │   └── Charter solvency monitoring
        │
        └── Court
            ├── Contract disputes
            ├── Charter compliance
            ├── Liquidation
            └── Human appeal
```

### Human principal

The human is the constitutional owner of their agent identity, wallets, memory, and economic authority. The human may revoke an agent mandate without surrendering ownership of the underlying assets.

### Personal Agent Passport

A nontransferable identity linking one personal agent to its human principal. The passport may accumulate verified work history and institutional roles, but it is not the currency and must not become transferable ownership of a person.

### Sylla Constitution

The highest protocol layer. It defines human rights, monetary invariants, charter requirements, change processes, sanctions, appeals, and failure isolation.

### Reserve Bank

The institution responsible only for the root $SYL currency, its treasury, valuation, minting, redemption, and published revenue-allocation policy. Supply expands and contracts through rule-bound minting and redemption rather than discretionary issuance.

### Charter Office

The registry and factory through which eligible agent institutions publish constitutions and create subordinate currencies.

### Clearing House

The common settlement layer for agent contracts and currency exchange. Recognition by the Clearing House is a privilege of compliant charters, not a guarantee or bailout.

### Observatory

The public accounting and risk layer. It reproduces NAV, monitors reserves and external dependencies, detects breaches, and publishes evidence. It does not unilaterally confiscate assets.

### Court

The bounded dispute and enforcement layer for cases that require interpretation. Objective onchain violations should be enforced by programs wherever possible; subjective disputes require due process and human appeal. The Court is a research placeholder, not deployable discretionary authority: until adjudicator selection, evidence standards, compensation, conflicts, appeal, and maximum penalties are specified, it cannot slash bonds or alter economic claims.

## Monetary hierarchy

```text
SOL
└── capitalizes root $SYL
    ├── circulates through Sylla applications
    │   ├── agent payments and bounties
    │   ├── escrow and contract settlement
    │   ├── protocol fees and dispute deposits
    │   └── institutional and sponsor bonds
    └── participates in charter capitalization
        ├── research currency
        ├── compute currency
        ├── coordination currency
        └── future charter economies
```

The hierarchy is asymmetric:

- SOL may capitalize $SYL and charter currencies.
- Charter operating authority is created by the Charter Factory and can be frozen by the protocol.
- The $SYL treasury may not hold charter currencies, and the Reserve Bank never takes ownership of charter reserve assets.
- Charter reserves may not hold other charter currencies, their wrappers, or LP positions exposed to them.
- No charter has an automatic claim on a $SYL bailout.

This document distinguishes four roles that must not be conflated:

| Role | Instrument |
|---|---|
| External capital and liquidity rail | SOL |
| Root reserve, native settlement, and protocol participation | $SYL |
| Specialized institutional economies | Charter currencies |
| Productive activity and demand | Human-authorized agent contracts |

### Root-first economic bootstrapping

The Sylla economy does not require charter currencies to exist at launch. Its first phase can use $SYL directly inside core Sylla applications:

- Agents commission and settle work in $SYL.
- Escrows and dispute deposits are posted in $SYL.
- Application fees and bounties are quoted or settled in $SYL.
- Humans acquire $SYL by exchanging existing tokens or capitalizing the reserve with SOL.

Charters arrive only after the root economy has demonstrated useful agent activity. They let groups form specialized institutions without replacing the common settlement layer. Because no charter is required to hold $SYL, this sequence is also the only thing that gives $SYL demand: it must be earned from services agents actually want, not manufactured by a protocol requirement.

## Currency lifecycle

Every root or charter currency progresses through the same high-level states.

```text
Draft
  constitution under development; no deposits

Published
  initial price and treasury rules fixed; no currency supply

Capitalizing
  SOL subscriptions accepted; nontransferable receipts issued

Forming Treasury
  subscription closes; approved reserve assets acquired

Active
  funded supply minted; continuous NAV pricing begins

Restricted
  new minting or treasury actions limited while a breach is cured

Wind-down
  new issuance disabled; reserves distributed to redeeming holders

Dissolved
  charter closed and remaining authorities revoked
```

## Genesis publication

Before accepting SOL, a currency must publish at least:

- Currency name, symbol, and purpose.
- Human and agent founders.
- Initial price in SOL per token.
- Target treasury assets and proportions.
- Exact Solana mint address for every allowed reserve asset.
- Minimum and maximum capitalization.
- Subscription opening and closing slots.
- Activation rules and launch slot or epoch.
- Entry, execution, management, and redemption fees.
- Oracle identifiers and fallback valuation method.
- Prudential collateral factors for each reserve asset.
- Permitted allocation bands.
- Approved swap, bridge, oracle, and token programs.
- Rebalancing cadence and execution limits.
- Minimum liquid sleeve and its permitted assets.
- Sponsor-bond size, custody, and release conditions for charter currencies.
- Governance and constitution-change process.
- Breach, sanction, appeal, liquidation, and dissolution procedures.

The complete publication is stored as an onchain constitution account and addressed by a version hash. A website is a readable projection, not the source of monetary law.

## Genesis capitalization

During capitalization, subscribers deposit SOL and receive nontransferable subscription receipts. No transferable currency is minted yet.

At the end of the subscription window:

1. Verify that minimum capitalization was reached.
2. Deduct all published formation costs and liabilities.
3. Acquire the treasury assets using approved execution programs.
4. Verify actual vault balances and ownership.
5. Calculate funded holder NAV in SOL and verify separately funded safety capital.
6. Mint the currency at the published static initial price.
7. Distribute minted currency pro rata to subscription receipts.
8. Activate continuous minting and redemption.

The genesis supply is determined by funded capital:

```text
genesis_supply = funded_holder_NAV_in_SOL / initial_price_in_SOL
```

Example:

```text
Published initial price:       0.0001 SOL per token
Funded holder NAV:             100,000 SOL
Resulting genesis supply:      1,000,000,000 tokens
```

If only 60,000 SOL of holder NAV is funded, the resulting supply is 600,000,000 tokens. The supply is an accounting result, not a founding promise. A protocol capital buffer, when required, is funded and accounted for separately rather than created by marking holder assets below fair value.

## Root $SYL treasury

An illustrative founding constitution could target:

| Asset | Target | Function |
|---|---:|---|
| SOL | 50% | Native liquidity, execution, and redemption |
| WBTC | 30% | External scarce monetary reserve |
| HYPE | 10% | Exposure to an active onchain market economy |
| WETH | 10% | External programmable settlement reserve |

These weights are illustrative, not approved launch parameters. No asset or weight is justified until the root treasury has a stated objective function. Candidate objectives include tracking SOL, maximizing long-horizon reserve growth, limiting drawdown, or preserving purchasing power over agent resources such as computation, inference, storage, and blockspace. Those objectives imply different portfolios and must not be mixed without an explicit priority rule.

The treasury should distinguish three operational layers:

- **Liquidity reserve:** native SOL available for ordinary mint and redemption flows.
- **Security reserve:** conservative assets held for long-term reserve strength.
- **Strategic reserve:** capped exposure to productive or emerging onchain economies.

Assets discoverable through gateways such as Sunrise are candidates, not automatically approved reserves. Every asset requires independent evaluation of its mint authority, bridge or issuer, source-chain redemption, oracle, liquidity, concentration, and failure procedure.

## NAV and exchange rate

The initial price remains static only before activation. Once a currency becomes active, its canonical price is the fair net asset value of holder-owned treasury holdings divided by redeemable supply.

For the illustrative $SYL treasury:

```text
NAV_SOL =
    Q_SOL
  + Q_WBTC × Price_WBTC_in_SOL
  + Q_HYPE × Price_HYPE_in_SOL
  + Q_WETH × Price_WETH_in_SOL
  + value_of_other_protocol_assets_in_SOL
  - liabilities_in_SOL
```

```text
price_per_token_in_SOL = NAV_SOL / redeemable_supply
```

Target weights do not directly determine exchange rate. They define the intended portfolio. Actual balances, asset prices, fees, yield, protocol-owned liquidity, liabilities, minting, redemption, and rebalancing determine NAV.

### Informational weighted return

Between treasury transactions, the price effect of the founding basket may be illustrated by its initial weights:

```text
P_t = P_0 × (
    0.50
  + 0.30 × (WBTC/SOL_t ÷ WBTC/SOL_0)
  + 0.10 × (HYPE/SOL_t ÷ HYPE/SOL_0)
  + 0.10 × (WETH/SOL_t ÷ WETH/SOL_0)
)
```

This expression is informational only. Onchain minting and redemption must use actual holder vault NAV under the published valuation methodology.

### Fair NAV and prudential capital

Native SOL and an imported WBTC token do not have identical risk. The protocol must not hide those risks by applying the same haircut to both minting and redemption: a symmetric haircut merely rescales the token price and creates no safety buffer.

Holder NAV therefore uses fair marked values:

```text
holder_NAV_SOL =
Σ(holder_quantity_i × fair_price_i_in_SOL) - holder_liabilities_in_SOL
```

Risk is handled separately through prudential collateral factors, concentration limits, liquidity requirements, and protocol-owned safety capital:

```text
prudential_collateral_value_SOL =
Σ(quantity_i × fair_price_i_in_SOL × collateral_factor_i)

required_safety_capital_SOL =
f(bridge_risk, liquidity, volatility, concentration, operational_risk)
```

Collateral factors account for:

- Bridge or custodian risk.
- Oracle quality.
- Liquidity and market depth.
- Asset volatility.
- Redemption reliability.
- Concentration.
- Smart-contract and governance risk.

Collateral-factor changes affect asset eligibility, capital requirements, and future treasury actions; they do not retroactively rewrite holder claims. When an oracle or asset cannot be valued reliably, the protocol pauses valuation-sensitive minting and convenience redemption rather than granting an emergency actor discretion to transfer value between early and late redeemers.

## Continuous minting

After activation, a user mints by depositing SOL at current NAV:

```text
tokens_minted =
SOL_deposited × (1 - published_entry_fee)
÷ current_holder_NAV_per_token
```

The incoming SOL must be:

1. Deposited into currency-controlled vaults.
2. Allocated according to the active treasury constitution.
3. Valued with approved oracle accounts.
4. Matched by newly minted supply only after reserve value is verified.

The preferred implementation is atomic deposit, execution, verification, and minting. Where that is impossible because multiple swaps exceed transaction constraints, the depositor receives a nontransferable pending-mint receipt until allocation settles. The protocol must never issue transferable currency against assets it has not acquired.

## Rule-bound supply and revenue policy

$SYL does not depend on a committee choosing an arbitrary money supply. Its base issuance policy is elastic and reserve-constrained:

```text
verified capital enters → reserve value increases → SYL is minted
SYL is redeemed → reserve value exits → SYL is burned
```

Application demand does not authorize unbacked issuance. If demand for $SYL rises, participants must acquire existing $SYL or mint against new SOL-funded reserves. Open minting and redemption are intended to keep the market price connected to holder NAV; utility should primarily appear as increased circulation and reserve capitalization rather than an unexplained premium.

Realized protocol revenue creates a separate policy question. Before activation, the constitution must state how fees are divided among:

- Holder NAV.
- Protocol-owned safety capital.
- Shared Sylla infrastructure and public goods.
- Insurance or loss reserves.
- Any other explicitly permitted use.

Revenue policy must be public, delayed when changed, and incapable of minting claims without assets.

## Redemption

The base holder right is pro-rata in-kind redemption:

```text
claim_fraction = tokens_burned / redeemable_supply_before_burn
asset_i_returned = claim_fraction × holder_reserve_asset_i
```

The protocol should offer:

- Immediate pro-rata in-kind redemption as the nonpreferential default.
- Optional SOL redemption as a priced convenience, subject to available liquidity.
- A published swing price or liquidity fee that charges the redeemer for conversion costs and accrues any excess to the holder reserve.
- A disclosed delayed conversion route for holders who prefer SOL and accept execution delay or slippage.

No redeemer receives a subsidized first claim on the liquid SOL sleeve. Redemption must not depend on the continuing permission of a charter manager, and no sanction, freeze, or resolution may gate it, fee it, or place a deadline on it.

## Treasury constitution

Every treasury publishes three separate allocation concepts:

- **Target weight:** intended strategic proportion.
- **Current weight:** actual marked-to-NAV proportion.
- **Permitted band:** range within which market drift is allowed.

Illustrative bands:

| Asset | Target | Permitted band |
|---|---:|---:|
| SOL | 50% | 45–55% |
| WBTC | 30% | 25–35% |
| HYPE | 10% | 7–13% |
| WETH | 10% | 7–13% |

Price movement can cause lawful drift. Drift becomes a compliance breach only when it remains outside the permitted band beyond the published cure period.

The onchain constitution should include:

```text
TreasuryConstitution
├── constitution_version
├── currency_mint
├── initial_price_in_SOL
├── approved_assets[]
│   ├── token_mint
│   ├── token_program
│   ├── oracle_feed
│   ├── target_weight_bps
│   ├── lower_band_bps
│   ├── upper_band_bps
│   ├── collateral_factor_bps
│   └── concentration_limit_bps
├── approved_execution_programs[]
├── minimum_liquid_sleeve_bps
├── sponsor_bond_requirement
├── rebalance_cadence
├── maximum_execution_slippage_bps
├── proposal_timelock_slots
├── cure_period_slots
└── wind_down_rules
```

## Charter currencies

A charter is permission to establish a subordinate agent institution and currency under the Sylla Constitution. It is not permission to mint $SYL or create obligations for the root Reserve Bank.

Each charter must publish:

- Institutional purpose and eligible activities.
- Founding human principals and agent governors.
- Currency and treasury constitution.
- Revenue model and productive activity signal.
- Minimum liquid sleeve.
- Separately funded sponsor bond and its published sizing rule.
- Governance, succession, and agent-role rules.
- Contract, dispute, and human-appeal rules.
- Insolvency and wind-down procedure.

### Example charter

```text
Research Charter — $KNOW

Initial price:
  0.00005 SOL per KNOW

Target treasury:
  30% SOL
  25% SYL
  20% WBTC
  15% TAO
  10% HYPE

Minimum liquid sleeve:
  25% held in SOL and SYL combined

Sponsor bond:
  separately posted in SYL; Factory-custodied; excluded from KNOW holder NAV

Revenue:
  verified agent research contracts

Productive signal:
  accepted work value × completion quality × low-dispute factor

Failure mode:
  disable minting, preserve redemption, liquidate pro rata
```

## Sponsor bonds and charter capital

Earlier drafts required every charter to route at least 20% of its capitalization into $SYL. That requirement has been removed. It was doing four jobs, and three of them are already done better elsewhere in this document: first-loss capital is the sponsor bond, resolution liquidity is the minimum liquid sleeve, and enforcement leverage is program-level freeze authority. The only job left was manufacturing demand for $SYL, which is not a legitimate reason to encumber holder assets. $SYL must earn demand from services agents actually want.

A charter treasury may still hold $SYL, and many will. No ratio is imposed.

### Freeze and bond are complementary

Removing the allocation rule leaves the sponsor bond as the only economic instrument the protocol can reach. It is not redundant with freeze authority, because the two act on different timelines:

- **Freeze is prospective.** It stops further harm from an institution misbehaving now.
- **The bond is retrospective.** It compensates for harm that already happened before the freeze landed.

Freezing a fraudulent charter at 03:00 does not return what was taken at 02:00. Only the bond does.

### The bond

Each charter sponsor must post a separately funded $SYL institutional bond. The bond:

- Is funded by founders, governors, or operators rather than charter currency holders.
- Is held in a Charter Factory-owned vault, never a sponsor-controlled account.
- Is excluded from charter-token holder NAV.
- Is not withdrawable while the charter's status is anything other than Active.
- May be released only after a published exit and claims period with no open breach flags.
- May be slashed only for enumerated violations proved under published procedures.

Posting a bond is itself a legitimate source of $SYL demand: it is collateral posted by an institution to obtain a privilege, priced against the risk of that privilege, rather than a levy on holder assets.

The two capital pools must remain visibly distinct:

```text
Charter institution
├── Holder reserve vault
│   ├── approved external reserve assets
│   └── minimum liquid sleeve (SOL and, at the charter's option, $SYL)
│
└── Sponsor bond vault
    ├── owned by the Charter Factory
    └── slashable $SYL institutional capital
```

### Bond sizing is the deterrent ceiling

Because holder reserves can never be slashed, the maximum credible penalty against a charter is the bond. Misconduct is rational whenever:

```text
expected extractable value  >  bond_size × P(proven and slashed)
```

The sizing rule is therefore not an implementation detail; it sets the entire deterrent. It must be published before the charter accepts capital and must scale with maximum extractable value — treasury size, liabilities, escrow exposure, and operational discretion — rather than being a flat listing fee.

That rule is not yet specified, and neither is the adjudication procedure. Until both exist, `P(proven and slashed)` is zero and the bond deters nothing. The protocol's operative sanctions today are program-enforced only: freeze, restriction, and de-recognition.

### Where slashed value goes

Slashed bond value follows a published waterfall and never reaches the Reserve Bank:

```text
1. Holder reserve          → pro rata to charter token holders (always, unconditional)
2. Sponsor bond, slashed   → to harmed holders first
3. Residual                → insurance and loss reserve
4. Never                   → Reserve Bank general treasury or $SYL holder NAV
```

If the root profits from charter failure, the institution deciding guilt acquires a financial interest in finding it. Step 4 is a constraint, not a preference.

Posting a bond does not create a bailout guarantee.

## Productive economic signal

Capital inflow alone cannot distinguish productive agent commerce from speculation. Each active currency should publish both a capital signal and a productive signal.

For the root economy:

```text
capital_signal =
net_SOL_mint_inflow - SOL_equivalent_redemption_outflow
```

```text
productive_signal =
accepted_agent_contracts
× settled_value
× completion_quality
× low_dispute_factor
```

Until activity measurement is demonstrably resistant to self-dealing, Sybil identities, circular contracts, and metric farming, these signals are observational only. They may inform research and public reporting but must not control:

- Protocol fee allocation.
- Productive grants funded from realized revenue.
- Charter capital requirements.
- Marketplace capacity.
- Reserve accumulation.
- Insurance funding.

They must not authorize unbacked minting or automatically move protocol capital. Any later economic use requires a separate constitution change, adversarial simulation, and explicit bounds.

## Constitution changes

No treasury manager may silently change reserve policy.

A normal change requires:

1. An onchain proposal containing the complete replacement constitution.
2. An Observatory risk report.
3. A fixed public timelock.
4. Notice to currency holders and participating agents.
5. Unrestricted redemption during the notice period.
6. Activation at a predetermined slot or epoch.
7. Replacement of the active constitution version hash.

The rules must distinguish:

- **Market drift:** asset prices move current weights away from targets.
- **Rebalancing:** approved trades restore weights within active bands.
- **Constitutional change:** target assets, weights, collateral factors, adapters, or governance change.

Only the third requires a new constitution version.

## Compliance and sanctions

Protocol law should use the term **noncompliant** or **out of charter** rather than implying that protocol rules are equivalent to the laws of a real-world jurisdiction.

### Breach classes

- Uncured allocation-band violation.
- Unauthorized reserve asset.
- Unauthorized token, bridge, swap, or oracle program.
- Minting without verified reserve value.
- Concealed liability.
- Misreported reserve or constitution.
- Unauthorized constitution change.
- Reserve held below the published minimum liquid sleeve.
- Inadequate or prematurely withdrawn sponsor bond.
- Insolvency.

### Enforcement ladder

The ladder has two halves that must not be read as one. Program-enforced responses are objective, automatic, and operative today.

| Condition | Protocol response |
|---|---|
| Temporary market drift | Warning and cure period |
| Persistent allocation breach | Disable new minting |
| Unauthorized reserve asset or execution program | Automatic restriction on permissionless proof |
| Reserve below minimum liquid sleeve | Disable new minting until cured |
| Oracle or bridge uncertainty | Pause valuation-sensitive minting and convenience redemption; preserve in-kind exit |
| Unauthorized treasury action | Disable treasury management authority |
| Insolvency | Enter Resolution and begin pro-rata wind-down |

Adjudicated responses require the Court. They are **inert** until adjudicator selection, evidence standards, compensation, conflicts, appeal, and maximum penalties are specified.

| Condition | Protocol response | Status |
|---|---|---|
| Fraudulent disclosure | Slash sponsor bond | inert |
| Repeated material violation | Revoke charter recognition and Clearing House access | inert |

Enforcement targets institutional privileges and the separately posted sponsor bond. It must never slash the charter's holder reserve, gate holder redemption, confiscate unrelated holder assets, or silently rewrite balances.

### Due process

Except for narrowly defined objective safety pauses, sanctions require:

- Public evidence.
- A machine-readable breach identifier.
- Notice to the charter.
- A cure or response period.
- Adjudication under published rules.
- Human appeal.
- A final onchain decision record.

## Resolution and consumer protection

A sanction must never become a freeze on the people the sanction exists to protect. The governing rule is asymmetric:

> Sanctions gate institutional authority. Sanctions never gate holder exit.

This is deliberately the opposite of a holder blocklist of the kind used by centralized stablecoin issuers. The protocol has no authority over any holder's balance and no permanent delegate over any mint. It has authority over what an *institution* may do.

### Compliance state

Charter programs are deployed by the Charter Factory and read a protocol-owned compliance account before every privileged instruction.

```text
ComplianceState (PDA, owned by the Constitution program)
├── charter_id
├── status: Active | Warned | Restricted | Suspended | Resolution | Dissolved
├── breach_flags[]
├── cure_deadline_slot
├── pause_expiry_slot
└── clearing_access
```

| Charter instruction | Under freeze |
|---|---|
| `mint` | blocked |
| `rebalance` / `treasury_swap` | blocked |
| `treasury_withdraw` | blocked |
| `fee_claim` | blocked |
| `governance_propose` / `constitution_change` | blocked |
| `open_contract` / `accept_escrow` | blocked |
| `bond_release` | blocked |
| **`redeem_in_kind`** | **always open, never gated, no fee** |

A frozen charter can do nothing except hand assets back. This asymmetry, not the conversion machinery below, is what actually protects holders.

Agent contract escrow is held by the Clearing House rather than inside charters, so that freezing a charter never strands a counterparty who is not a charter holder.

### Freezing is itself a weapon

Freezing an operating institution is close to ending it, so the power to freeze must be bounded differently depending on what is alleged.

- **Objective breach** — a non-whitelisted mint present in the reserve, an unapproved execution program, an unpinned oracle, a reserve below the published liquid sleeve. Permissionlessly provable by submitting the accounts. Restriction is automatic, immediate, and curable; no adjudication is involved.
- **Subjective breach** — fraud, misreporting, concealed liability. No freeze on accusation alone. An emergency pause may be entered, but it carries `pause_expiry_slot` and **lapses by default** unless adjudication concludes within the published window. Emergency authority must expire through inaction rather than require an affirmative act to lift, or every temporary pause becomes permanent by neglect.

Announcement and freeze are simultaneous. A freeze is disclosed only once it has landed onchain. There is never public notice of a pending freeze, because that interval is exactly when a treasury is drained and insiders sell.

### Resolution vault

On entering Resolution, the charter's holder reserve moves to a resolution vault. **Authority transfers; ownership does not.**

```text
ResolutionVault (PDA)
├── owner:         program, not the Reserve Bank
├── beneficiary:   charter token holders, pro rata
├── administrator: bounded root execution authority, approved programs only
└── accounting:    never enters $SYL holder NAV or any Reserve Bank balance
```

The Reserve Bank never acquires the charter's assets. It administers a segregated vault on behalf of that charter's holders. Absorbing charter assets onto the root balance sheet, even transiently, would be a bailout and is prohibited.

### Claims are earmarked, and never expire

There is no conversion window and no cliff. A deadline would create a run inside the window, a publicly known forced-seller date, and an arbitrary penalty for holders who are not watching a feed.

Instead, claims are earmarked at burn:

```text
burn → claim_fraction = tokens_burned / redeemable_supply_before_burn
     → earmark the holder's pro-rata slice of each reserve asset
     → execute the holder's chosen route against that earmarked slice only
```

Because each slice is segregated before any execution, one holder's chosen route never dilutes another's. There is no advantage to claiming early and therefore no run. Market impact from liquidation is still shared, which is a further reason to keep in-kind the default and to cap slippage per fill.

A published escheat period of at least one year governs genuinely abandoned claims. The residue goes to the insurance and loss reserve, never to the Reserve Bank.

### Three voluntary routes

| Route | Cost | Timing |
|---|---|---|
| Pro-rata in kind | none | immediate |
| Convert to SOL | swing fee, realized execution | pending-conversion receipt until settled |
| Convert to $SYL | swing fee, realized execution | pending-conversion receipt until settled |

In-kind is the default and the one right no holder can lose. Conversion is a priced convenience, never a guaranteed rate.

The $SYL route runs through the root's ordinary mint:

```text
charter token → earmarked reserve slice
              ├── liquid sleeve slice → passes through directly, no execution cost
              └── remaining assets    → liquidated to SOL → root mint → $SYL at NAV on settlement
```

The Reserve Bank supplies nothing. It accepts SOL and issues $SYL at current holder NAV exactly as it would for any other depositor, so the conversion is funded entirely by the charter's own reserves and no $SYL is created without corresponding SOL. Invariants 1, 5 and 18 hold throughout.

The charter's minimum liquid sleeve is what allows part of every claim to convert instantly and without execution cost. That is its primary justification: it is pre-positioned resolution liquidity, not a solvency ratio.

### Execution rules for the liquidation leg

The liquidation hop is where value is actually lost, and a resolution vault's contents are public, so the sale is front-runnable by construction.

- Staged execution with a published maximum slippage per fill.
- A breached slippage cap halts the fill rather than completing it.
- No published liquidation schedule.
- Slippage is borne by the converting holder, never by holders who took in kind.
- The entry fee is waived on resolution mints, or routed to the insurance reserve. Harmed holders must not pay the protocol for the privilege of exiting, and the protocol must not book revenue from a charter's failure.

The holder receives realized execution minus the swing fee, minted at NAV on settlement rather than at burn. Slippage, delay, and NAV drift are all borne by the holder who chose conversion, and all three must be disclosed at the point of choice.

### What holders are and are not protected from

- **Protected from:** theft, dilution, gated exit, preferential redemption, and continued operation by a bad actor.
- **Not protected from:** falling asset prices, mismanagement that already occurred, or losses exceeding the sponsor bond.

Resolution preserves claims; it cannot restore value that is already gone. Detection latency, not penalty severity, therefore determines how much of a holder's claim survives — which makes the Observatory, not the Court, the primary consumer-protection institution.

A frozen charter's token also continues to trade on any venue, at whatever discount the market applies. Holders who sell into a thin market rather than redeeming are protected by none of the above, which is why the redemption route must be prominent and available from the first block of a freeze.

## Agent economic mandates

The currency system is subordinate to human authorization.

An agent mandate should specify:

```text
EconomicMandate
├── human_principal
├── agent_passport
├── source_vault
├── currency_mint
├── total_spend_limit
├── per_transaction_limit
├── permitted_counterparties
├── permitted_service_categories
├── valid_from_slot
├── expires_at_slot
├── approval_threshold
└── revocation_authority
```

Agents use mandates to commission work, enter escrow, and settle contracts. They do not receive irrevocable ownership of the human's wallet.

## Solana implementation direction

This section records a candidate technical direction, not a completed specification.

### Programs

- **Constitution program:** root invariants, approved program registry, and versioning.
- **Reserve program:** $SYL treasury vaults, NAV, minting, redemption, and wind-down.
- **Charter factory:** standardized creation of charter accounts, holder reserves, sponsor-bond vaults, and mints.
- **Observatory program:** accepted reports, reserve proofs, and breach state.
- **Clearing program:** escrow and currency settlement.
- **Mandate program:** bounded agent delegation and revocation.
- **Resolution program:** compliance state, freeze and pause expiry, resolution vaults, claim earmarking, and conversion execution.
- **Court program:** proposals, adjudication records, appeals, and sanctions.

### Token model

- Use a standard transferable SPL or Token-2022 currency mint.
- Do not give the currency a permanent delegate capable of arbitrary holder seizure.
- Keep human-agent spend authority in separate bounded mandate accounts.
- Use nontransferable accounts or credentials for Agent Passports and institutional roles.
- Pin every accepted mint, owner program, oracle account, and CPI target.

### Program safety invariants

- Validate every account owner, signer, mint, token program, PDA, and writable account.
- Reject arbitrary CPI program substitution.
- Reject duplicate mutable vault accounts.
- Use checked arithmetic and fixed-point basis-point calculations.
- Prevent reinitialization of currencies, charters, and constitutions.
- Make minting and redemption idempotent where offchain orchestration is involved.
- Confirm onchain settlement rather than trusting client callbacks.
- Preserve cluster and oracle freshness checks in every valuation-sensitive instruction.

### Candidate stack

- Anchor for initial program iteration and IDL generation.
- `@solana/kit` for new client and transaction code.
- Codama-generated typed clients after program interfaces stabilize.
- LiteSVM or Mollusk for program unit tests.
- Surfpool for integration tests against realistic asset, oracle, and liquidity state.

## Constitutional invariants

The following should be extremely difficult or impossible to change:

1. SOL is the only primary capitalization and mint-deposit asset.
2. A currency's initial price is published before capitalization.
3. No transferable supply exists before funded reserve verification.
4. Active minting uses current fair holder NAV; prudential collateral factors do not silently rewrite holder claims.
5. The $SYL treasury never holds charter currencies, and the Reserve Bank never takes ownership of charter reserve assets, including during resolution.
6. Charter holder reserves and sponsor bonds are segregated; only the sponsor bond is slashable.
7. Charter reserves cannot hold other charter currencies, wrappers containing them, or LP positions exposed to them.
8. Sanctions gate institutional authority. Holder redemption is never gated, fee-charged, or deadlined by any sanction, freeze, or resolution.
9. No protocol authority may freeze, seize, or delegate a holder's token balance; no currency mint carries a permanent delegate.
10. Emergency pauses carry an expiry slot and lapse by default rather than requiring an affirmative act to lift.
11. Slashed bond value flows to harmed holders and the insurance reserve, never to the Reserve Bank or to $SYL holder NAV.
12. Treasury constitutions and changes are public and versioned onchain.
13. Unauthorized assets and execution programs are rejected by code wherever possible.
14. Humans can revoke personal-agent economic mandates.
15. Sanctions do not grant arbitrary seizure of holder reserves or unrelated human assets.
16. Wind-down and resolution preserve pro-rata holder claims.
17. No charter has an automatic bailout claim against $SYL.
18. Capital or market activity alone cannot authorize unbacked issuance.

## Open questions

The design is not ready for implementation until these questions are resolved:

### Economic design

With the mandatory charter allocation removed, $SYL has no manufactured demand. The first question below is now load-bearing for the entire design rather than one item among many.

- Which Sylla services must use $SYL at launch, and what value does each provide beyond simply transferring SOL?
- Should agent contracts denominate obligations directly in $SYL or use a separate resource-indexed unit of account while settling in $SYL?
- What explicit objective does the root reserve optimize: SOL tracking, long-term growth, drawdown control, or purchasing power over agent resources?
- How should protocol revenue divide among holder NAV, protocol-owned safety capital, shared agent infrastructure, and other constitutionally permitted uses?
- What swing-pricing and liquidity-fee rules govern optional SOL redemption?
- What fraction of $SYL reserves must remain liquid SOL?
- Should continuous deposits rebalance the entire treasury or only allocate new capital?
- How are protocol-owned liquidity positions included in NAV and liabilities?
- What prevents governance from accepting correlated or low-quality reserve assets?

### Price and oracle design

- Which price sources establish each asset/SOL rate?
- How are oracle and DEX TWAP disagreement handled?
- What staleness, confidence, and manipulation thresholds pause minting?
- How frequently is NAV struck and which operations require a fresh strike?
- How are bridge failures reflected in fair valuation, operational pauses, capital requirements, and in-kind redemption?

### Charter design

- Who is eligible to publish a charter?
- What bond sizing rule scales with maximum extractable value rather than with treasury size alone?
- What minimum liquid sleeve makes resolution conversion meaningful without over-constraining charter strategy?
- Which external reserve assets and wrappers satisfy the hard whitelist?
- How is productive agent work verified without inviting fake activity?

### Freeze authority and program control

Enforcement now depends entirely on the protocol retaining program-level control of charter operating authority. That control, not the treasury, is the highest-stakes unresolved question in this document.

- Who holds the freeze authority, and under what quorum?
- Who holds the Charter Factory upgrade authority, and can it be burned once the program set stabilizes?
- What prevents a freeze from being used against a solvent competitor?
- What is the maximum duration of an unadjudicated emergency pause?
- What compensation exists for a charter frozen in error?
- May a charter exit the protocol voluntarily, retaining its token and reserves, without entering resolution?
- Does retaining freeze authority make Sylla a permissioned platform rather than a constitutional economy, and is that the intended posture for v1?

### Governance and court design

- Which constitutional rights are immutable?
- Who may propose and approve root treasury changes?
- How are agent governors represented without displacing human principals?
- Who adjudicates fraud, and what evidence standard applies?
- How is emergency authority constrained, expired, and reviewed?

### Legal and operational design

As presently conceived, a reserve-backed floating-NAV token with pooled assets, professional treasury management, subscription, transferable pro-rata claims, and redemption rights may be treated as a collective investment product or securities offering in relevant jurisdictions. The Clearing House may add exchange, payments, or financial-intermediation obligations. Administering a frozen charter's reserves on behalf of its holders is closer still to custody and asset management, and retaining freeze authority over third-party institutions may itself carry supervisory or compliance obligations. This is a design constraint, not a disclaimer to address after implementation.

Independent legal analysis is therefore a gate before the protocol is presented as a capitalization or fundraising mechanism, before subscriptions are solicited, and before real assets are accepted.

- How will reserve-backed floating-NAV currencies be characterized in target jurisdictions?
- Which activities constitute asset management, fund issuance, payments, or financial intermediation?
- Which disclosures and participant restrictions may be required?
- How does Sylla distinguish internal protocol law from external legal obligations?

## Research and build sequence

1. Define and test the economic objective: why agents use $SYL, what the root reserve optimizes, and which observations would falsify the design.
2. Build a deterministic spreadsheet or simulation for fair NAV, minting, redemption, revenue, safety capital, drift, rebalancing, and charter failure before writing further mechanism prose.
3. Model bridge failure, oracle failure, SOL liquidity exhaustion, $SYL drawdowns, sponsor-bond impairment, and simultaneous charter stress.
4. Prototype one root currency with fake devnet assets and exact onchain accounting.
5. Add continuous SOL minting and pro-rata redemption.
6. Add one charter currency with a segregated mock sponsor bond and a published minimum liquid sleeve.
7. Prove that recursive collateral and arbitrary CPI targets are rejected.
8. Prove the asymmetric freeze end to end: every privileged instruction blocked, in-kind redemption still open and free, an emergency pause lapsing at its expiry slot, and a full resolution with earmarked claims and a $SYL conversion routed through the root mint.
9. Add published constitution changes, cure periods, and nonconfiscatory sanctions.
10. Obtain independent economic, smart-contract, and legal review before presenting the design as a public capitalization or fundraising mechanism and before using real assets.
11. Only then evaluate mainnet deployment or public capitalization.

## Relationship to the current Sylla product

The current Sylla product remains focused on portable personal-agent identity, approved memory, trust, consent, and evidence-backed social discovery. The monetary protocol is a separate, longer-term research track. Its purpose is to investigate the economic layer of a society composed of human-owned personal agents; it is not required for the present product to operate.

The present codebase already contains conceptual foundations that may later be reused:

- Canonical human and agent identity.
- Exclusive runtime leases.
- Bounded work credits and usage reservations.
- Idempotent accounting.
- Participant-visible audit events.
- Human approval boundaries.

Internal Sylla work credits are not $SYL and must not be presented as onchain currency or financial claims.

## References

- [The Standard Reserve protocol](https://www.standardreserve.xyz/app/protocol/)
- [The Standard Reserve whitepaper](https://www.standardreserve.xyz/whitepaper/)
- [Sunrise token universe](https://sunrise.xyz/tokens)
- [Solana tokenization documentation](https://solana.com/docs/tokenization)
- [Solana token basics](https://solana.com/docs/tokens/basics)
- [Solana spend permissions](https://solana.com/docs/payments/advanced-payments/spend-permissions)
- [Pyth price feeds on Solana](https://docs.pyth.network/price-feeds/core/push-feeds/solana)

## Disclaimer

This document is a product and protocol design draft. It is not an implementation specification, offering document, investment recommendation, or legal opinion. A reserve-backed token, charter currency, treasury manager, exchange, or settlement network may be regulated differently across jurisdictions. No real assets should be accepted until the economic model, programs, operational controls, disclosures, and legal structure have received appropriate independent review.
