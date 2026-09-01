# Sylla

> Keep the agent. Change the model.

Sylla (pronounced **SILL-uh**) is the portable relationship layer for personal AI. A person names and shapes their own agent; Sylla gives that relationship approved memory, evidence, tools, and continuity across the LLMs they already use.

Evidence-backed social discovery is the flagship use case, not the product boundary. The first experiment creates one worthwhile introduction between two adults who opted into the same real-world event. Relationships are expected to continue in the communication tools people already use.

## Architecture

```text
canonical user-owned Sylla agent
   ↕ same identity from every connected client
user-named agent in the participant's existing LLM or future Sylla app
   ↕ active reasoning under the participant's host quota
OAuth-authenticated Sylla MCP service ─── Neon Postgres (identity, approved state, entitlements)
   ├─ Solari Browser  → recorded research on approved public URLs
   ├─ Solari Desktop  ↔ persistent, pausable agent home + durable volume
   └─ Solari Sandbox  → directional boundaries and fallback evaluations
                  ↕
internal agent only after the host orchestration lease is lost
```

The host LLM is the preferred semantic brain while an active MCP run is connected. The application decides what may be inspected, persisted, and disclosed. Solari provides execution environments, not authorization policy. Raw private debrief text is deliberately absent from the database schema and must never enter Browser recordings, Desktop files, or Sandbox jobs.

## Orchestration contract

- **Host orchestrated:** ChatGPT or another connected LLM observes Solari state, reasons with the participant's existing host allowance, and invokes composable MCP tools.
- **Deterministic background:** ordinary code performs indexing, retries, validation, filtering, and notifications.
- **Internal fallback:** an internal model resumes an already-approved task only after the host lease expires or the participant explicitly requests background continuation.

Every long-running run requires a heartbeat, owner lease, checkpoint, idempotency key, scope, and fallback budget. Fallback cannot approve memories, widen access, disclose information, accept introductions, or make another human decision. A reconnecting host receives an auditable handoff and must not duplicate completed work.

The MCP server cannot draw from a user's ChatGPT or other consumer subscription after that host run ends. Host reasoning uses the participant's host quota; Solari runtime and any internal fallback model use project resources.

Sylla is the system of record and infrastructure broker. Participants connect to Sylla through OAuth and never handle a Solari account or API key. MCP may bootstrap the agent, check entitlements, estimate work, report usage, and initiate a hosted checkout; payment credentials stay outside the model conversation and are processed by a Sylla-controlled billing service. The later native Sylla application will use the same account and agent identifiers, so signing in reveals the existing agent rather than creating a replacement.

## Current foundation

- Next.js 16 App Router, TypeScript, Tailwind CSS, and shadcn/ui
- Neon Postgres with Drizzle schema and migrations
- Typed mock and live adapters for all three Solari products
- Deterministic mock mode for local work without billable sessions
- HttpOnly-cookie-isolated participant sessions backed by durable Neon state
- Expiring, revocable, usage-bounded event invitations with atomic redemption
- A versioned adult-consent gate covering approved-source research, private memory, matching, host retention boundaries, optional background continuation, and concrete availability windows
- Append-only participation audit events plus withdrawal that immediately releases runtime leases, revokes host connections, and removes the participant from matching
- Canonical Sylla user and personal-agent identifiers, lazily linked to existing first-session participants
- OAuth protected-resource discovery plus issuer-, audience-, expiry-, and scope-bound JWT validation
- Deterministic identity linking: the same verified Sylla subject resolves to one user and agent across different MCP clients
- Per-client host-connection records without storing upstream access tokens
- Exclusive, expiring per-agent runtime leases with hashed capabilities, heartbeats, release, and cross-host handoff
- Durable Agent Run, checkpoint, approved fallback scope, budget, reason, and reconnect-handoff records
- An atomic mock fallback controller that refuses active leases and completes the approved handoff task exactly once under concurrent workers
- An authenticated scheduled fallback sweep with stale-worker recovery and the same lease exclusion used by host clients
- A provider-neutral internal-model interface with deterministic default and an optional bounded OpenAI Responses adapter
- Trial/active entitlements, atomic work-credit reservations, an idempotent usage ledger, and expiring hosted-checkout capabilities
- Persistent workspace metadata and lifecycle services for one Desktop, durable volume, recovery snapshots, reconnect/resume, pause, and withdrawal destruction
- A stateless Streamable HTTP MCP endpoint with portable-agent bootstrap, approved-context recall, durable run/handoff control, and private-workspace inspect/open/checkpoint/pause tools
- A disabled-by-default developer bearer bridge for exercising MCP before production OAuth is connected
- Agent naming, a current personal focus, and one to three participant-approved public sources
- A working Browser research route plus MCP run contract that records provider, run reference, extracted evidence, per-source status, checkpoints, and host-to-background handoff
- Deterministic candidate eligibility that enforces same-event consent, overlapping availability, blocks, prior declines, pair conflicts, and approved shareable context without producing a compatibility score
- Canonical candidate-pair reservations plus two independently persisted directional evaluations
- Privacy-preserving MCP pair tools that never return the other participant's identity, private context, rationale, or decline decision
- Billable Solari Sandbox evaluation with idempotent per-direction records, authorized-evidence citation validation, and a bilateral recommendation gate that still cannot disclose or introduce anyone
- A functional memory ledger with evidence-aware Keep, Correct, Private/Shareable, and Forget controls
- Private follow-up reflections that return as proposed memory rather than being silently persisted as truth
- A reconstructible Desktop workbench generated only from approved memories and source artifacts
- A view-only live Desktop viewer for Solari streams, with an honest reconstructible preview in mock mode
- An explicit pause action that checkpoints and stops active Desktop compute while preserving the agent home; withdrawal remains the separate destructive path
- URL policy checks that reject obvious local and private-network sources
- Unit tests for adapter contracts, source URL policy, and observation-origin separation

The first attachment loop is implemented and verified in mock mode against the configured Neon database. It has also completed a bounded live Solari Browser run against the public Sylla repository: the source title and evidence were extracted, the session was released, and its gzip replay became available. Two live Solari Sandbox jobs have completed a bilateral candidate evaluation with directional privacy boundaries and explicit VM cleanup. A bounded live volume probe also created and deleted a Solari durable volume successfully. Live Desktop creation still returns `FeatureRequiresPlan`, which Solari has identified as an upstream subscription-gate bug rather than an actual product-plan requirement; Sylla therefore implements the complete volume/restore/checkpoint/pause lifecycle while live Desktop verification awaits that fix. Invitation exhaustion, explicit consent, availability, withdrawal, candidate filtering, pair-conflict prevention, bilateral evaluation, canonical identity, OAuth resource-server verification, cross-client recovery, exclusive host leases, durable checkpoints, scheduled fallback scanning, bounded model handoff, stale-worker recovery, trial entitlements, idempotent usage accounting, and checkout continuations are implemented and exercised against Neon. A real identity-provider tenant and billing provider must still be connected before public deployment or paid activation; live Desktop/snapshot verification, production cron deployment/monitoring, participant-visible OAuth connection management, and one real internal-model invocation with project credentials also remain. See the roadmap for the revised implementation order.

The live Sandbox adapter currently runs a deterministic baseline inside a disposable VM. It proves isolation, structured output, and cleanup; it is explicitly not the final personal-agent evaluator.

## First-session flow

1. Redeem a bounded event invitation and accept the current policy version, including host-data boundaries and at least one availability window.
2. Name the personal agent and describe one question, transition, or ambition it should understand now.
3. Approve one to three public URLs. Sylla rejects local, private-network, and unsupported source targets and refuses research without active permission.
4. Sylla researches those sources through the active Browser adapter and separates `Told to me`, `Observed`, and `Inferred` proposals.
5. The participant keeps, corrects, changes disclosure, or forgets each proposal. Nothing pending enters the workbench.
6. The participant can add a concise follow-up reflection, which also waits for explicit memory approval.
7. Sylla opens or reconstructs the agent's persistent Desktop home from approved database state and its durable volume. Rebuilding after a correction or deletion excludes the old material, and idle compute is paused rather than left running.

## What the cookbook changed

The cookbook examples are now treated as executable integration guidance, not just starter snippets:

- **Browser:** a session must be released and the TypeScript client must also be closed. Recording is session-scoped, becomes available asynchronously after release, and may contain sensitive DOM state. The current adapter records and retains the session reference; restricted replay retrieval, access control, and expiry remain required before the product can call a run auditable.
- **Profiles:** attached Browser profiles do not save themselves. Sylla deliberately avoids persistent profiles in v1 because its approved sources are public; authenticated sources require a later, explicit privacy design.
- **Sandbox:** commands receive an executable plus an argument array rather than shell syntax. Idle timeouts roll forward on activity, and `kill()`—not `close()`—destroys the VM. The live adapter follows those rules. Public port previews must never expose personal workspaces or private evaluation data.
- **Desktop:** readiness is asynchronous, so the live adapter polls health before use. Coordinate actions can silently target the wrong window; future MCP computer-use tools must observe a screenshot, act narrowly, then observe again. Closing the local channel does not destroy the remote Desktop, so pause and destroy remain explicit lifecycle operations.

These examples validate the product split: Browser is the agent's audited web research surface, Desktop is its visible graphical workbench, and Sandbox is its disposable computation and policy boundary. They also make clear that Solari supplies execution environments—not consent, authorization, retention, or model reasoning.

## Local setup

Requirements: Node.js 20+, pnpm 10+, a Postgres database, and optionally a Solari API key.

```bash
cd projects/sylla
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

`SYLLA_ENABLE_DEMO_SESSIONS=true` permits the invitation-free synthetic first session during local development. Production defaults to invitation-only entry; do not enable the demo bypass on a public deployment.

The Vercel-linked development environment can instead be pulled with:

```bash
vercel link
vercel env pull .env.local --yes
```

Never commit `.env.local`, Solari API keys, Desktop stream capabilities, session identifiers, or replay URLs.

## Integration modes

`INTEGRATION_MODE=mock` is the safe default. It uses deterministic in-process adapters and creates no Solari resources.

To use real infrastructure:

```bash
INTEGRATION_MODE=live
SOLARI_API_KEY=slr_live_...
SOLARI_BASE_URL=https://api.getsolari.com
```

Live calls are server-only. `MODEL_API_KEY` is reserved for bounded internal fallback; it is not needed to use a participant's active host LLM through MCP. Desktop stream capabilities must be exchanged through a short-lived, participant-authorized endpoint before any viewer is added.

Internal fallback defaults to `SYLLA_INTERNAL_MODEL_MODE=mock`, which makes no model API call. To exercise the optional live adapter, set `SYLLA_INTERNAL_MODEL_MODE=live`, `MODEL_API_KEY`, and an explicit `SYLLA_INTERNAL_MODEL`; Sylla deliberately assumes no model name. The adapter sends only the purpose and latest explicit checkpoint, requests strict-schema output, sets `store: false`, limits output to 220 tokens, and times out after eight seconds. A refusal, timeout, HTTP failure, or invalid schema falls back to the deterministic reconnect summary and records the error for audit.

Browser and Sandbox have been verified with the current development account, and the durable-volume API succeeds. Desktop currently returns `Desktop requires a paid plan` before creating a session; Solari has identified this response as an upstream gate bug. Sylla does not model it as a required paid tier.

## Developer MCP bridge

The Streamable HTTP endpoint is `POST /mcp`. Until production OAuth and account linking are implemented, it is deliberately unavailable unless all three development variables are configured:

```text
SYLLA_ENABLE_DEV_MCP=true
SYLLA_MCP_DEV_TOKEN=<local bearer secret>
SYLLA_MCP_DEV_PARTICIPANT_ID=<existing participant UUID>
```

This temporary bridge binds one bearer token to one existing development participant. It must remain disabled on public deployments. The MCP contract exposes portable-agent/context/workspace tools plus plan, lease, durable-run, approved-source preparation, one-source Browser execution, research-progress, privacy-preserving pair preparation/status, one-direction Sandbox evaluation, checkpoint, yield, fallback-attempt, reconnect-read, and handoff-acknowledgment tools. Mutating host tools require the active lease capability; billable operations also require an idempotency key. None exposes Solari credentials or stream capabilities.

## Runtime leases and work credits

Only one host run may operate an agent at a time. A host acquires a 30–300 second lease using its authenticated MCP client ID and a conversation-specific run ID, heartbeats while working, and releases when finished. Sylla stores only a SHA-256 hash of the lease capability. A second host is refused until the active lease expires or is released; it can then recover the same canonical agent and persistent workspace. The participant's authenticated web control surface may explicitly take over the lease to pause or withdraw, invalidating the old host capability.

New accounts receive a configurable prototype trial (`SYLLA_TRIAL_CREDITS`, default `500`). Each approved Browser source, directional Sandbox evaluation, and workspace open, resume, or explicit checkpoint reserves estimated work credits before calling Solari. Success atomically settles the ledger; failure releases the reservation; repeated idempotency keys never charge twice. Pausing is always allowed at zero credits because stopping compute is a safety and cost-control action. Inactive or exhausted entitlements return an expiring Sylla-hosted checkout URL instead of accepting card data through MCP. The public checkout page intentionally does not activate payment yet because no billing provider or verified webhook is connected.

## Durable run handoff

A host can create an idempotent Agent Run under its active lease, persist a narrow participant-visible checkpoint, and explicitly yield the run. Checkpoints contain a concise summary, completed actions, next action, and evidence references—not chain of thought, credentials, arbitrary transcript state, or raw debrief text.

The fallback controller supports two explicitly scoped task types. `prepare_reconnect_summary` costs one bounded fallback credit and performs no consequential action. `research_approved_sources` may visit only the one-to-three public URLs stored in the run scope; it checkpoints each completed source, never automatically revisits completed, failed, or ambiguous in-flight sources, and creates reviewable memory proposals rather than approved memories. Both workers first acquire the same exclusive runtime lease used by host clients, atomically claim the run and budget, write one audit handoff, and release the lease. A reconnecting host therefore cannot overlap either the model call or a Browser visit. Concurrent workers still produce one execution and one handoff.

`/api/cron/fallbacks` runs both bounded task sweeps and rejects every request unless `Authorization: Bearer $CRON_SECRET` matches. `vercel.json` schedules it every minute; deployment therefore needs a Vercel plan that supports that interval, or another trusted scheduler can call the same route. `SYLLA_FALLBACK_SWEEP_LIMIT` defaults to ten and is capped at twenty per task type per invocation.

Run `pnpm verify:handoff` against a migrated development database to exercise active-host refusal, an eight-worker claim race, model-failure degradation, stale-worker recovery without double charge, returning-host exclusion during a model call, second-host acknowledgment, and cleanup of the synthetic participant. The live OpenAI transport is contract-tested with a stub and is not called unless live mode and credentials are explicitly configured.

Run `pnpm verify:browser` to exercise the durable Browser contract against Neon with a recording test adapter: one source per host call, active-host exclusion, background completion of only the remaining source, settled per-source usage, proposal regeneration, duplicate suppression, reconnect handoff, and synthetic-data cleanup.

Run `pnpm verify:participation` to exercise single-use invitation redemption, policy-versioned consent, availability persistence, runtime-lease release, host-connection revocation, privacy-safe audit events, withdrawal, and cleanup against Neon.

Run `pnpm verify:matching` to exercise block and availability filtering, pair-conflict prevention, private/shareable evidence separation, two idempotent directional evaluations, usage settlement, the bilateral gate, and synthetic cleanup. Prefix it with `SYLLA_VERIFY_LIVE_SANDBOX=true` to run both directions in real Solari Sandbox VMs.

Create an event invitation locally with `pnpm invite:create <event-slug> "Event name" [max-uses] [hours-valid]`. The command prints the only copy of the bearer invitation URL; store and distribute it accordingly.

## OAuth MCP authentication

For a deployed MCP server, configure a dedicated OAuth/OIDC identity provider to issue JWT access tokens for Sylla:

```text
APP_BASE_URL=https://your-sylla-host.example
SYLLA_OAUTH_ISSUER=https://your-identity-provider.example/
SYLLA_OAUTH_JWKS_URL=https://your-identity-provider.example/.well-known/jwks.json
SYLLA_OAUTH_AUDIENCE=https://your-sylla-host.example/mcp
```

The token must include:

- `iss` matching `SYLLA_OAUTH_ISSUER`
- `aud` matching `SYLLA_OAUTH_AUDIENCE`
- an unexpired `exp`
- `sub` identifying the Sylla account
- `client_id` or `azp` identifying the MCP host
- the `sylla:agent` scope in `scope` or `scp`

Sylla publishes RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`. It stores the verified issuer/subject mapping and each client connection, but never stores the upstream access token. Two clients presenting tokens for the same issuer and subject recover the same canonical user, personal agent, participant state, and workspace metadata.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm verify:handoff
pnpm verify:browser
pnpm verify:participation
pnpm verify:matching
```

## Product documents

- [`PROJECT_PROMPT.md`](./PROJECT_PROMPT.md) — canonical scope, trust model, and definition of done
- [`ROADMAP.md`](./ROADMAP.md) — evidence-gated implementation and pilot roadmap

## Safety boundary

The v1 Desktop is a Solari-managed cloud Linux computer. It does not observe a participant's physical Mac or Windows computer. Native access to local applications would require a separate explicit, revocable connector and is outside the current scope.
