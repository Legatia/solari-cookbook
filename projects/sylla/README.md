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

- A responsive editorial marketing landing page at `/`, with the working participant prototype preserved at `/app`
- Next.js 16 App Router, TypeScript, Tailwind CSS, and shadcn/ui
- Neon Postgres with Drizzle schema and migrations
- Typed mock and live adapters for all three Solari products
- Deterministic mock mode for local work without billable sessions
- HttpOnly-cookie-isolated participant sessions backed by durable Neon state
- A server-side shared demo gate with a signed seven-day HttpOnly cookie; protected pages, APIs, checkout, invitations, and OAuth consent cannot create metered work before unlock
- Expiring, revocable, usage-bounded event invitations with atomic redemption
- A versioned adult-consent gate covering approved-source research, private memory, matching, host retention boundaries, optional background continuation, and concrete availability windows
- Append-only participation audit events plus withdrawal that immediately releases runtime leases, revokes host connections, and removes the participant from matching
- Canonical Sylla user and personal-agent identifiers, lazily linked to existing first-session participants
- A built-in OAuth 2.1 authorization server with dynamic client registration, S256 PKCE, one-time authorization codes, rotating refresh tokens, and hashed opaque-token storage
- OAuth protected-resource and authorization-server discovery, plus optional issuer-, audience-, expiry-, and scope-bound external JWT validation
- A participant-visible **Connect your AI** panel with the live MCP URL, setup instructions, connection status, and one-click revocation
- MCP-first conversational onboarding: the connected host can explain the exact consent boundary, collect explicit answers, name and focus the agent, save availability, and continue into source research without requiring `/app`
- Deterministic identity linking: the same verified Sylla subject resolves to one user and agent across different MCP clients; the public prototype binds first-party grants to the participant's current Sylla browser session
- Per-client host-connection records without exposing Solari credentials or storing plaintext OAuth tokens
- Exclusive, expiring per-agent runtime leases with hashed capabilities, heartbeats, release, and cross-host handoff
- Durable Agent Run, checkpoint, approved fallback scope, budget, reason, and reconnect-handoff records
- An atomic mock fallback controller that refuses active leases and completes the approved handoff task exactly once under concurrent workers
- An authenticated scheduled fallback sweep with stale-worker recovery and the same lease exclusion used by host clients
- A provider-neutral internal-model interface with deterministic default and an optional bounded OpenAI Responses adapter
- Trial/active entitlements, atomic work-credit reservations, an idempotent usage ledger, and expiring hosted-checkout capabilities
- Persistent workspace metadata and lifecycle services for one Desktop, durable volume, recovery snapshots, reconnect/resume, pause, and withdrawal destruction
- A stateless Streamable HTTP MCP endpoint with portable-agent bootstrap, approved-context recall, durable run/handoff control, and private-workspace inspect/open/checkpoint/pause tools
- Companion-level setup, memory review, `sylla_remember`, `sylla_research`, and `sylla_find_private_introduction` tools that hide lease choreography while retaining the lower-level recovery tools
- A disabled-by-default developer bearer bridge for local testing without bypassing production OAuth
- Agent naming, a current personal focus, and one to three participant-approved public sources
- A working Browser research route plus MCP run contract that records provider, run reference, extracted evidence, per-source status, checkpoints, and host-to-background handoff
- Deterministic candidate eligibility that enforces same-event consent, overlapping availability, blocks, prior declines, pair conflicts, and approved shareable context without producing a compatibility score
- Canonical candidate-pair reservations plus two independently persisted directional evaluations
- Privacy-preserving MCP pair tools that never return the other participant's identity, private context, rationale, or decline decision
- Billable Solari Sandbox evaluation with idempotent per-direction records, authorized-evidence citation validation, and a bilateral recommendation gate that still cannot disclose or introduce anyone
- Human-host-only disclosure envelopes containing one to five explicitly approved shareable observations; web and internal fallback leases are structurally refused at this gate
- Privacy-filtered introduction proposals that expose neither identity nor meeting details until both participants independently accept, and turn every decline into the same non-identifying closed state
- Strict structured meeting outcomes that reject raw debrief fields, never return the other participant's answers, and accept at most three already-distilled private memory proposals
- Human-host-only Keep/Edit/Forget review for post-introduction memory; only approved or edited memory enters portable context and the reconstructible Desktop workbench
- Versioned cross-event agent export plus explicit irreversible account deletion, both free of provider credentials, Desktop capabilities, raw debriefs, and other-participant outcomes
- Organizer aggregates suppressed below eight participants and coarsened below three observations, with no participant identifiers or private context
- A functional memory ledger with evidence-aware Keep, Correct, Private/Shareable, and Forget controls
- Private follow-up reflections that return as proposed memory rather than being silently persisted as truth
- A reconstructible Desktop workbench generated only from approved memories and source artifacts
- A view-only live Desktop viewer for Solari streams, with an honest reconstructible preview in mock mode
- An explicit pause action that checkpoints and stops active Desktop compute while preserving the agent home; withdrawal remains the separate destructive path
- URL policy checks that reject obvious local and private-network sources
- Unit tests for adapter contracts, source URL policy, and observation-origin separation

The first attachment loop is implemented and verified in mock mode against the configured Neon database. It has also completed a bounded live Solari Browser run against the public Sylla repository: the source title and evidence were extracted, the session was released, and its gzip replay became available. Two live Solari Sandbox jobs have completed a bilateral candidate evaluation with directional privacy boundaries and explicit VM cleanup. A bounded live volume probe also created and deleted a Solari durable volume successfully. Live Desktop creation still returns `FeatureRequiresPlan`, which Solari has identified as an upstream subscription-gate bug rather than an actual product-plan requirement; Sylla therefore implements the complete volume/restore/checkpoint/pause lifecycle while live Desktop verification awaits that fix. Invitation exhaustion, explicit consent, availability, withdrawal, candidate filtering, pair-conflict prevention, bilateral evaluation, canonical identity, first-party OAuth discovery and PKCE exchange, connection revocation, exclusive host leases, durable checkpoints, scheduled fallback scanning, bounded model handoff, stale-worker recovery, trial entitlements, idempotent usage accounting, and checkout continuations are implemented and exercised against Neon. Durable cross-device account login, a real billing provider and verified webhook, live Desktop/snapshot verification, production cron monitoring, and one real internal-model invocation with project credentials still remain before a paid production launch. See the roadmap for the revised implementation order.

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

`SYLLA_ENABLE_DEMO_SESSIONS=true` permits invitation-free synthetic sessions. Production defaults to invitation-only entry. `SYLLA_DEMO_PASSWORD` adds a server-side shared-password gate in front of the application, protected APIs, invitations, checkout, and OAuth consent. The public showcase combines that gate with `INTEGRATION_MODE=live`, so approved Browser, Sandbox, and workspace operations use the configured Solari account without exposing it to anonymous traffic. This shared password is a controlled-demo boundary, not a replacement for durable per-user login.

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

## Connect an AI host

The public Streamable HTTP endpoint is `https://serendipity-kappa.vercel.app/mcp`. In ChatGPT, enable Developer mode, add the remote MCP URL, enter the private-demo password when Sylla opens its OAuth flow, and approve the relationship. The host first calls `sylla_bootstrap_agent`; if setup is incomplete it calls `sylla_get_setup_guide`, discusses each permission with the participant, and records the explicit answers through `sylla_complete_setup`. Naming, current focus, availability, approved-source research, and memory review can all happen in the conversation. `/app` remains an optional visual control surface for inspecting the same state, managing connections, and using richer controls.

For local development, the disabled-by-default bearer bridge can exercise MCP without running the browser OAuth flow when all three variables are configured:

```text
SYLLA_ENABLE_DEV_MCP=true
SYLLA_MCP_DEV_TOKEN=<local bearer secret>
SYLLA_MCP_DEV_PARTICIPANT_ID=<existing participant UUID>
```

This temporary bridge binds one bearer token to one existing development participant. It must remain disabled on public deployments. The MCP contract exposes conversational setup, observation review, three flagship companion actions, and portable-agent/context/workspace, plan, lease, durable-run, approved-source, Browser execution, pair evaluation, disclosure, introduction, outcome, post-meeting memory review, export/deletion, checkpoint, fallback, and handoff tools for advanced orchestration. Mutating low-level host tools require the active lease capability; billable operations also require an idempotency key. Disclosure, acceptance, outcome submission, post-meeting memory review, and deletion additionally require a human-controlled host lease, so neither the web worker nor internal fallback can cross those gates. Permanent deletion is not registered unless the token also carries the elevated `sylla:delete` scope. None exposes Solari credentials or stream capabilities.

## Runtime leases and work credits

Only one host run may operate an agent at a time. A host acquires a 30–300 second lease using its authenticated MCP client ID and a conversation-specific run ID, heartbeats while working, and releases when finished. Sylla stores only a SHA-256 hash of the lease capability. A second host is refused until the active lease expires or is released; it can then recover the same canonical agent and persistent workspace. The participant's authenticated web control surface may explicitly take over the lease to pause or withdraw, invalidating the old host capability.

New accounts receive a configurable prototype trial (`SYLLA_TRIAL_CREDITS`, default `500`). Each approved Browser source, directional Sandbox evaluation, and workspace open, resume, or explicit checkpoint reserves estimated work credits before calling Solari. Success atomically settles the ledger; failure releases the reservation; repeated idempotency keys never charge twice. Pausing is always allowed at zero credits because stopping compute is a safety and cost-control action. Inactive or exhausted entitlements return an expiring Sylla-hosted checkout URL instead of accepting card data through MCP. The public checkout page intentionally does not activate payment yet because no billing provider or verified webhook is connected.

## Durable run handoff

A host can create an idempotent Agent Run under its active lease, persist a narrow participant-visible checkpoint, and explicitly yield the run. Checkpoints contain a concise summary, completed actions, next action, and evidence references—not chain of thought, credentials, arbitrary transcript state, or raw debrief text.

The fallback controller supports two explicitly scoped task types. `prepare_reconnect_summary` costs one bounded fallback credit and performs no consequential action. `research_approved_sources` may visit only the one-to-three public URLs stored in the run scope; it checkpoints each completed source, never automatically revisits completed, failed, or ambiguous in-flight sources, and creates reviewable memory proposals rather than approved memories. Both workers first acquire the same exclusive runtime lease used by host clients, atomically claim the run and budget, write one audit handoff, and release the lease. A reconnecting host therefore cannot overlap either the model call or a Browser visit. Concurrent workers still produce one execution and one handoff.

`/api/cron/fallbacks` runs both bounded task sweeps and rejects every request unless `Authorization: Bearer $CRON_SECRET` matches. `vercel.json` schedules one daily sweep so the project can deploy on Vercel Hobby. A Pro deployment or another trusted scheduler can call the same route more frequently. `SYLLA_FALLBACK_SWEEP_LIMIT` defaults to ten and is capped at twenty per task type per invocation.

Run `pnpm verify:handoff` against a migrated development database to exercise active-host refusal, an eight-worker claim race, model-failure degradation, stale-worker recovery without double charge, returning-host exclusion during a model call, second-host acknowledgment, and cleanup of the synthetic participant. The live OpenAI transport is contract-tested with a stub and is not called unless live mode and credentials are explicitly configured.

Run `pnpm verify:browser` to exercise the durable Browser contract against Neon with a recording test adapter: one source per host call, active-host exclusion, background completion of only the remaining source, settled per-source usage, proposal regeneration, duplicate suppression, reconnect handoff, and synthetic-data cleanup.

Run `pnpm verify:participation` to exercise single-use invitation redemption, policy-versioned consent, availability persistence, runtime-lease release, host-connection revocation, privacy-safe audit events, withdrawal, and cleanup against Neon.

Run `pnpm verify:matching` to exercise block and availability filtering, pair-conflict prevention, private/shareable evidence separation, two idempotent directional evaluations, usage settlement, the bilateral gate, and synthetic cleanup. Prefix it with `SYLLA_VERIFY_LIVE_SANDBOX=true` to run both directions in real Solari Sandbox VMs.

Run `pnpm verify:introduction` to exercise the complete bilateral disclosure and acceptance gate against Neon: internal-fallback refusal, private-observation refusal, two explicit shareable envelopes, anonymous preview, first-acceptance privacy, mutual identity/meeting reveal, audit records, and synthetic cleanup.

Run `pnpm verify:outcome` to continue that proof through two structured outcomes, raw-field rejection, internal-fallback refusal, proposed-memory Edit/Forget review, completed-introduction state, other-outcome privacy, small-cohort organizer suppression, and cleanup.

Run `pnpm verify:portability` to create one canonical agent across two event records, export only approved state from both, exclude pending memory and private runtime capabilities, then irreversibly delete the account and verify that its participants, audit rows, user, and agent no longer exist.

Create an event invitation locally with `pnpm invite:create <event-slug> "Event name" [max-uses] [hours-valid]`. The command prints the only copy of the bearer invitation URL; store and distribute it accordingly.

## OAuth MCP authentication

With `APP_BASE_URL` configured, Sylla is its own OAuth 2.1 authorization server for MCP clients. It publishes protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` and authorization-server metadata at `/.well-known/oauth-authorization-server`. Public clients register dynamically at `/oauth/register`, authorize through `/oauth/authorize`, and exchange an S256 PKCE code at `/oauth/token`. Access and rotating refresh tokens are opaque; only SHA-256 hashes are stored. Authorization codes are short-lived and single-use.

The prototype consent screen binds a grant to the participant represented by the current HttpOnly Sylla browser session. A later production account-login flow must link that session to a durable verified identity before Sylla can promise recovery on a different device. The existing canonical user and personal-agent identifiers do not depend on an LLM provider.

A dedicated OAuth/OIDC provider can optionally replace discovery while the built-in access tokens continue to work. Configure these variables to accept external JWT access tokens:

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

The optional `sylla:delete` scope is separately required before the permanent-deletion tool is even visible. The tool still requires an active human-host lease and the exact destructive confirmation phrase. Ordinary agent tokens can export but cannot delete.

For external JWTs, Sylla stores the verified issuer/subject mapping and each client connection, but never stores the upstream access token. Two clients presenting tokens for the same issuer and subject recover the same canonical user, personal agent, participant state, and workspace metadata.

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
pnpm verify:introduction
pnpm verify:outcome
pnpm verify:portability
```

## Product documents

- [`PROJECT_PROMPT.md`](./PROJECT_PROMPT.md) — canonical scope, trust model, and definition of done
- [`ROADMAP.md`](./ROADMAP.md) — evidence-gated implementation and pilot roadmap

## Safety boundary

The v1 Desktop is a Solari-managed cloud Linux computer. It does not observe a participant's physical Mac or Windows computer. Native access to local applications would require a separate explicit, revocable connector and is outside the current scope.
