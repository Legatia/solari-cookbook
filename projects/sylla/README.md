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
   ├─ Mission controller → intent, plan, risk gate, budget, durable progress
   ├─ Solari Browser  → evidence research + bounded web-account control
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
- A versioned adult-consent gate covering approved-source research, private memory, host retention boundaries, optional matching and background continuation, and availability only when introductions are enabled
- Append-only participation audit events plus withdrawal that immediately releases runtime leases, revokes host connections, and removes the participant from matching
- Canonical Sylla user and personal-agent identifiers, lazily linked to existing first-session participants
- A built-in OAuth 2.1 authorization server with dynamic client registration, S256 PKCE, one-time authorization codes, rotating refresh tokens, and hashed opaque-token storage
- OAuth protected-resource and authorization-server discovery, plus optional issuer-, audience-, expiry-, and scope-bound external JWT validation
- A participant-visible **Connect your AI** panel listing every connected AI client by name, with per-client disconnect and a disconnect-all, plus the live MCP URL and setup instructions
- MCP-first conversational onboarding: the setup guide returns a purpose-first, one-question-at-a-time conversation contract, exact trust choices, conditional introduction/availability steps, and `/app` only as an optional visual fallback
- A portable conversation profile for reply length, warmth, directness, humor, challenge style, preferred address, and explicit do/don't preferences
- A topic-scoped conversation brief that ranks only approved cross-event memories, returns at most four relevant items, and never stores the supplied topic or full host transcript
- Deterministic identity linking: the same verified Sylla subject resolves to one user and agent across different MCP clients; the public prototype binds first-party grants to the participant's current Sylla browser session
- Per-client host-connection records without exposing Solari credentials or storing plaintext OAuth tokens
- Exclusive, expiring per-agent runtime leases with hashed capabilities, heartbeats, release, and cross-host handoff
- Durable Agent Run, checkpoint, approved fallback scope, budget, reason, and reconnect-handoff records
- A durable mission controller that turns a plain-language objective into a capability, resource plan, risk level, approval gate, bounded budget, and inspectable step ledger
- Persistent Solari Browser profiles plus a host-directed computer-use loop: the connected LLM receives compact page text and stable control references, chooses bounded actions, and can complete ordinary web work without making the participant configure browser tooling
- An atomic mock fallback controller that refuses active leases and completes the approved handoff task exactly once under concurrent workers
- An authenticated scheduled fallback sweep with stale-worker recovery and the same lease exclusion used by host clients
- A provider-neutral internal-model interface with deterministic default and an optional bounded OpenAI Responses adapter
- Trial/active entitlements, atomic work-credit reservations, an idempotent usage ledger, and expiring hosted-checkout capabilities
- Sign-in to a new browser approved from a connected AI, with a 180-second code and a 40-second window once approved, plus a Connected devices list with per-session revocation
- Import of a participant's own LinkedIn or X export as private, reviewable memory proposals
- Participant-supplied model access for background work — Anthropic, OpenAI, or a reviewed OpenAI-compatible provider preset — stored encrypted and never returned by any read path; arbitrary server targets are disabled during the pilot
- Persistent workspace metadata and lifecycle services for one Desktop, durable volume, recovery snapshots, reconnect/resume, pause, and withdrawal destruction
- A stateless Streamable HTTP MCP endpoint with portable-agent bootstrap, approved-context recall, mission start/status/approval/continue/cancel, durable run/handoff control, and private-workspace inspect/open/checkpoint/pause tools
- Companion-level setup, memory review, `sylla_remember`, `sylla_research`, `sylla_find_private_introduction`, and human-confirmed `sylla_propose_private_introduction` tools that hide lease choreography while retaining the lower-level recovery tools
- A disabled-by-default developer bearer bridge for local testing without bypassing production OAuth
- Agent naming, a current personal focus, and one to three participant-approved public sources
- A working Browser research route plus MCP run contract that records provider, run reference, extracted evidence, per-source status, checkpoints, and host-to-background handoff
- Mission-routed Solari execution: public research uses Browser, public repository checks run in a disposable Sandbox, durable workbench requests use Desktop, and private introductions use the bilateral Sandbox boundary
- Mission-scoped memory lineage, so repeated research adds reviewable proposals without deleting earlier approved memory or replacing the agent's enduring profile
- Deterministic candidate eligibility that enforces same-event consent, overlapping availability, blocks, prior declines, pair conflicts, and approved shareable context without producing a compatibility score
- Canonical candidate-pair reservations plus two independently persisted directional evaluations
- Privacy-preserving MCP pair tools that never return the other participant's identity, private context, rationale, or decline decision
- Billable Solari Sandbox evaluation with idempotent per-direction records, authorized-evidence citation validation, and a bilateral recommendation gate that still cannot disclose or introduce anyone
- Human-host-only disclosure envelopes containing one to five explicitly approved shareable observations; web and internal fallback leases are structurally refused at this gate
- Privacy-filtered introduction proposals that expose neither identity nor meeting details until both participants independently accept, and turn every decline into the same non-identifying closed state
- Strict structured meeting outcomes that reject raw debrief fields, never return the other participant's answers, and accept at most three already-distilled private memory proposals
- Human-host-only Keep/Edit/Forget review for post-introduction memory; only approved or edited memory enters portable context and the reconstructible Desktop workbench
- Versioned cross-event agent export plus explicit irreversible account deletion, both free of provider credentials, Desktop capabilities, raw debriefs, and other-participant outcomes; deletion destroys the provider-side Browser profile as well as Desktop resources
- Organizer aggregates suppressed below eight participants and coarsened below three observations, with no participant identifiers or private context
- A participant control room that inventories the canonical agent's memories, evidence, approved sources, permissions, connected AI hosts, and private workspace across participation records
- Evidence and relationship-memory ledgers with Keep, Correct, Private/Shareable, and Forget controls
- Discoverable passkey enrollment and login, so Face ID, Touch ID, a device PIN, or a synced password manager can recover the same canonical agent without making an LLM provider the identity owner
- Private follow-up reflections that return as proposed memory rather than being silently persisted as truth
- A reconstructible Desktop workbench generated only from approved memories and source artifacts
- A view-only live Desktop viewer for Solari streams, with an honest reconstructible preview in mock mode
- An explicit pause action that checkpoints and stops active Desktop compute while preserving the agent home; withdrawal remains the separate destructive path
- URL policy checks that reject obvious local and private-network sources
- Unit tests for adapter contracts, source URL policy, and observation-origin separation

The first attachment loop is implemented and verified in mock mode against the configured Neon database. Live Solari Browser checks have both extracted recorded evidence from the public Sylla repository and reused one provider profile across sessions to discover a form, fill it, submit it, and verify the resulting page. Two live Solari Sandbox jobs have completed a bilateral candidate evaluation with directional privacy boundaries and explicit VM cleanup. A bounded live volume probe also created and deleted a Solari durable volume successfully. Live Desktop is now verified end to end: `pnpm verify:desktop-live` provisions a real durable volume and desktop, materializes the workbench from approved memory only, takes a recovery snapshot, checkpoints, pauses, refuses a checkpoint on a paused machine, and tears the machine down. The `FeatureRequiresPlan` gate was lifted in Solari's September release. Invitation exhaustion, explicit consent, availability, withdrawal, candidate filtering, pair-conflict prevention, bilateral evaluation, canonical identity, first-party OAuth discovery and PKCE exchange, passkey account recovery, connection revocation, exclusive host leases, durable checkpoints, scheduled fallback scanning, bounded model handoff, stale-worker recovery, trial entitlements, idempotent usage accounting, checkout continuations, and mission-bound login handoff are implemented and exercised against Neon. The handoff is single-use, expires in thirty minutes, and is issued only for an approved web mission stopped at a credential checkpoint on its approved origin. Real-site password, OTP, payment, and cross-origin login variants still need pilot rehearsal before claiming arbitrary authenticated-account operation. Lost-passkey recovery codes, a provisioned billing provider with a verified webhook, and production scheduler monitoring are now implemented and verified end to end against Neon by `pnpm verify:phase-one`. A real internal-model invocation with project credentials is now verified end to end against `gpt-5.6-luna` by `pnpm verify:internal-model`, which refuses to pass against the deterministic adapter so that a green run always means a real call. Credential lifecycle management remains before a paid production launch. See the roadmap for the revised implementation order.

The live Sandbox adapter supports the deterministic directional-evaluation baseline and a bounded public-repository check inside a disposable VM. These prove isolation, structured output, and cleanup; they are explicitly not a general shell exposed to the user or the final personal-agent evaluator.

## Mission interface

The normal MCP path is deliberately small: `sylla_start_mission`, `sylla_get_mission`, `sylla_approve_mission`, `sylla_continue_mission`, and `sylla_cancel_mission`, plus `sylla_act_on_web` while a web-account mission is active. The host describes the participant's outcome and any explicit URL scope; Sylla classifies it, selects Browser, Sandbox, Desktop, or no runtime, checks consent and credits, persists a step plan, and returns the next safe action. The participant should never need to understand Solari products, selectors, lease tokens, VM cleanup, or provider billing.

This is an abstraction over real bounded executors, not a claim that every computer task works today. Public-source research and comparison, meeting preparation, repository checks, workspace lifecycle, the private-introduction flow, and bounded web interaction are routed now. After explicit mission approval, the active host LLM can observe compact page state and choose referenced navigation, click, fill, select, check, key, back, and wait actions. Sylla persists the Solari Browser profile and current URL, enforces the approved origin set and credit budget, and refuses to carry passwords, one-time codes, or payment credentials through the model. At a detected credential checkpoint, the participant can open a thirty-minute single-use Solari handoff for that mission and approved origin, sign in directly, then let the host continue with the saved session. Real-site login and payment variants remain a pilot-verification item. A batch can contain up to twelve related actions, which matters because cookies and local storage persist between serverless sessions but unsaved DOM state does not. Desktop routing and live allocation are implemented and verified end to end.

## Conversation layer

The host calls `sylla_prepare_conversation` with a short description of the current topic before its first substantial reply. Sylla returns explicit voice preferences, relationship depth, at most four relevance-ranked approved memories, and a response contract covering the opening move, tone, length, questions, memory use, and honesty. The brief is private behavioral guidance: the host must not recite it, list memories to prove recall, leak mission states, or force a personal reference.

`sylla_tune_conversation` changes the portable profile only when the participant explicitly asks. It supports terse through detailed replies, warmth and directness levels, humor, challenge style, preferred address, and concrete preferred or avoided behaviors. Sylla does not infer these preferences from demographics, a temporary mood, or the transcript. The current topic is used in-memory for ranking and is not persisted. Full host transcripts remain outside Sylla.

## First-session flow

1. Redeem a bounded event invitation and accept the current policy version. Private introductions are optional; an availability window is required only when they are enabled.
2. Name the personal agent and describe one question, transition, or ambition it should understand now.
3. Approve one to three public URLs. Sylla rejects local, private-network, and unsupported source targets and refuses research without active permission.
4. Sylla researches those sources through the active Browser adapter and separates `Told to me`, `Observed`, and `Inferred` proposals.
5. The participant keeps, corrects, changes disclosure, or forgets each proposal. Nothing pending enters the workbench.
6. The participant can add a concise follow-up reflection, which also waits for explicit memory approval.
7. Sylla opens or reconstructs the agent's persistent Desktop home from approved database state and its durable volume. Rebuilding after a correction or deletion excludes the old material, and idle compute is paused rather than left running.

## What the cookbook changed

The cookbook examples are now treated as executable integration guidance, not just starter snippets:

- **Browser:** a session must be released and the TypeScript client must also be closed. Recording is session-scoped, becomes available asynchronously after release, and may contain sensitive DOM state. The current adapter records and retains the session reference; restricted replay retrieval, access control, and expiry remain required before the product can call a run auditable.
- **Profiles:** attached Browser profiles do not save themselves. Sylla now explicitly saves one provider profile per canonical agent after each bounded web-action call so cookies and local storage survive reconnects. Profile identifiers stay server-side and are excluded from portable exports; passwords and OTPs are never accepted as tool arguments.
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

`SYLLA_ENABLE_DEMO_SESSIONS=true` permits invitation-free synthetic sessions. Production defaults to invitation-only entry. `SYLLA_DEMO_PASSWORD` adds a server-side shared-password gate in front of the application, protected APIs, invitations, checkout, and OAuth consent. The public showcase combines that gate with `INTEGRATION_MODE=live`, so approved Browser, Sandbox, and workspace operations use the configured Solari account without exposing it to anonymous traffic. This shared password is only the outer controlled-demo boundary. Inside it, a participant can enroll a passkey from **Account & privacy** and later use `/login` to create a fresh durable browser session for the same canonical agent.

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

Browser, Sandbox, durable volumes, snapshots, and Desktop lifecycle have been verified with the current development account. Solari's September release lifted the earlier erroneous Desktop plan gate; Sylla still treats live allocations as metered resources and pauses Desktop compute when idle.

## Connect an AI host

The public Streamable HTTP endpoint is `https://serendipity-kappa.vercel.app/mcp`. In ChatGPT, enable Developer mode, add the remote MCP URL, enter the private-demo password when Sylla opens its OAuth flow, and approve the relationship. The host first calls `sylla_bootstrap_agent`; if setup is incomplete it calls `sylla_get_setup_guide`. That tool tells the host to begin with what would make an agent worth keeping, briefly reflect each answer, ask at most one question per reply, and then explain the trust boundary without dumping a form into chat. The host records the explicit answers through `sylla_complete_setup`; matchmaking and background work remain optional, and availability is requested only for matchmaking. After that, ordinary work should begin with `sylla_start_mission`. Naming, current focus, approved-source research, memory review, and missions can all happen in the conversation. `/app` is returned as the plan-B visual form when a participant asks for it or wants to review the choices on a page.

For local development, the disabled-by-default bearer bridge can exercise MCP without running the browser OAuth flow when all three variables are configured:

```text
SYLLA_ENABLE_DEV_MCP=true
SYLLA_MCP_DEV_TOKEN=<local bearer secret>
SYLLA_MCP_DEV_PARTICIPANT_ID=<existing participant UUID>
```

This temporary bridge binds one bearer token to one existing development participant. It must remain disabled on public deployments. The preferred MCP contract is the five mission lifecycle tools plus the conditional `sylla_act_on_web` control loop. Conversational setup, observation review, four flagship companion actions, and portable-agent/context/workspace, plan, lease, durable-run, approved-source, Browser execution, pair evaluation, disclosure, introduction, outcome, post-meeting memory review, export/deletion, checkpoint, fallback, and handoff tools remain available for advanced orchestration and recovery. Mutating low-level host tools require the active lease capability; billable operations also require an idempotency key. Disclosure, acceptance, outcome submission, post-meeting memory review, and deletion additionally require a human-controlled host lease, so neither the web worker nor internal fallback can cross those gates. Permanent deletion is not registered unless the token also carries the elevated `sylla:delete` scope. None exposes Solari credentials or stream capabilities.

## Runtime leases and work credits

Only one host run may operate an agent at a time. A host acquires a 30–300 second lease using its authenticated MCP client ID and a conversation-specific run ID, heartbeats while working, and releases when finished. Sylla stores only a SHA-256 hash of the lease capability. A second host is refused until the active lease expires or is released; it can then recover the same canonical agent and persistent workspace. The participant's authenticated web control surface may explicitly take over the lease to pause or withdraw, invalidating the old host capability.

New accounts receive a configurable prototype trial (`SYLLA_TRIAL_CREDITS`, default `500`). Each approved Browser source or bounded web-action batch, directional Sandbox evaluation, and workspace open, resume, or explicit checkpoint reserves estimated work credits before calling Solari. Success atomically settles the ledger; failure releases the reservation; repeated idempotency keys never charge twice. Pausing is always allowed at zero credits because stopping compute is a safety and cost-control action. Inactive or exhausted entitlements return an expiring Sylla-hosted checkout URL instead of accepting card data through MCP. Stripe now backs the checkout page. Card details never enter an MCP tool argument or a model transcript: the agent produces a hosted-checkout URL and the participant pays on Stripe's own page. Credits are granted only when a signed webhook arrives, never when the browser returns from the redirect, because a redirect is a claim and a signature is evidence. The grant is idempotent twice over — a repeated Stripe event id is rejected by a unique constraint, and a second, different event aimed at an already-completed checkout is rejected by a conditional update — so Stripe's own retries cannot double-credit an account.

## Durable run handoff

A host can create an idempotent Agent Run under its active lease, persist a narrow participant-visible checkpoint, and explicitly yield the run. Checkpoints contain a concise summary, completed actions, next action, and evidence references—not chain of thought, credentials, arbitrary transcript state, or raw debrief text.

The fallback controller supports two explicitly scoped task types. `prepare_reconnect_summary` costs one bounded fallback credit and performs no consequential action. `research_approved_sources` may visit only the one-to-three public URLs stored in the run scope; it checkpoints each completed source, never automatically revisits completed, failed, or ambiguous in-flight sources, and creates reviewable memory proposals rather than approved memories. Both workers first acquire the same exclusive runtime lease used by host clients, atomically claim the run and budget, write one audit handoff, and release the lease. A reconnecting host therefore cannot overlap either the model call or a Browser visit. Concurrent workers still produce one execution and one handoff.

`/api/cron/fallbacks` runs both bounded task sweeps and rejects every request unless `Authorization: Bearer $CRON_SECRET` matches. `vercel.json` schedules one daily sweep so the project can deploy on Vercel Hobby. A Pro deployment or another trusted scheduler can call the same route more frequently. `SYLLA_FALLBACK_SWEEP_LIMIT` defaults to ten and is capped at twenty per task type per invocation.

Run `pnpm verify:handoff` against a migrated development database to exercise active-host refusal, an eight-worker claim race, model-failure degradation, stale-worker recovery without double charge, returning-host exclusion during a model call, second-host acknowledgment, and cleanup of the synthetic participant. The live OpenAI transport is contract-tested with a stub and is not called unless live mode and credentials are explicitly configured.

Run `pnpm verify:browser` to exercise the durable Browser contract against Neon with a recording test adapter: one source per host call, active-host exclusion, background completion of only the remaining source, settled per-source usage, proposal regeneration, duplicate suppression, reconnect handoff, and synthetic-data cleanup.

Run `pnpm verify:computer-live` to exercise live profile-backed Solari computer use against a safe public form: observe referenced controls, reuse the same profile in a second session, fill and submit the form, verify the result, and delete the temporary provider profile.

Run `pnpm verify:participation` to exercise single-use invitation redemption, policy-versioned consent, availability persistence, runtime-lease release, host-connection revocation, privacy-safe audit events, withdrawal, and cleanup against Neon.

Run `pnpm verify:matching` to exercise block and availability filtering, pair-conflict prevention, private/shareable evidence separation, two idempotent directional evaluations, usage settlement, the bilateral gate, and synthetic cleanup. Prefix it with `SYLLA_VERIFY_LIVE_SANDBOX=true` to run both directions in real Solari Sandbox VMs.

Run `pnpm verify:introduction` to exercise the complete bilateral disclosure and acceptance gate against Neon: internal-fallback refusal, private-observation refusal, two explicit shareable envelopes, anonymous preview, first-acceptance privacy, mutual identity/meeting reveal, audit records, and synthetic cleanup.

Run `pnpm verify:outcome` to continue that proof through two structured outcomes, raw-field rejection, internal-fallback refusal, proposed-memory Edit/Forget review, completed-introduction state, other-outcome privacy, small-cohort organizer suppression, and cleanup.

Run `pnpm verify:portability` to create one canonical agent across two event records, export only approved state from both, exclude pending memory and private runtime capabilities, then irreversibly delete the account and verify that its participants, audit rows, user, and agent no longer exist.

Run `SYLLA_DEMO_PASSWORD=… pnpm verify:mcp-live https://serendipity-kappa.vercel.app` to exercise production OAuth, the 45-tool MCP surface, conversation briefing and tuning, conversational setup, approved memory, the durable mission lifecycle, connection visibility, and revocation. Add `SYLLA_VERIFY_LIVE_RESEARCH=true` for one mission-routed Browser source, `SYLLA_VERIFY_LIVE_SANDBOX_MISSION=true` for one mission-routed disposable repository check, or `SYLLA_VERIFY_LIVE_DESKTOP_MISSION=true` for one live Desktop allocation. Those optional modes consume real Solari resources when allocation succeeds.

Create an invitation with `pnpm invite:create <event-slug> "Circle name" [max-uses] [hours-valid]`. It prints the only copy of two forms of the same invitation: a bearer URL to paste into a chat, and a twelve-character code to read down a phone. They share one seat count, so handing out both cannot enlarge the circle. Store and distribute them accordingly.

Opening the link shows what is being joined — the circle's name, seats left, when it closes — and spends nothing. A seat is taken only when the invited person presses the button, because every messenger that renders a link preview fetches the URL first, and a redemption on `GET` would let a group chat burn seats and create agents before a human ever clicked. Redeeming also lifts the demo password gate for that browser: the invitation expires, is capped, is revocable, and names one circle, so it is already the stronger of the two credentials and a friend should not need a second shared secret to use the one they were given.

Codes tolerate how people actually read them back — case, spacing, and the letters Crockford base32 leaves out, so `OIL0` and `0110` are the same code.

`pnpm circle:status <event-slug>` shows seats spent, seats left, and who is actually present. Those are different numbers: someone can open an invitation and never finish consent.


## Verification scripts

Each proves one boundary against the configured Neon database; the live ones
provision real Solari machines and cost credits.

| Command | What it proves |
|---|---|
| `verify:handoff` | Lease exclusion, worker races, bounded fallback, no double charge |
| `verify:browser` | One source per host call, background completion, no duplicate visits |
| `verify:participation` | Invitation exhaustion, consent, withdrawal, audit |
| `verify:matching` | Eligibility filters, directional privacy, bilateral gate |
| `verify:introduction` / `verify:outcome` | Disclosure, mutual reveal, structured outcomes |
| `verify:one-sided` | One agent is enough to propose; two people still decide |
| `verify:portability` | Export excludes pending state; deletion is irreversible |
| `verify:device-login` | Server-derived context, split clocks, single-use session |
| `verify:data-import` | Consent-gated import, pending and private by default |
| `verify:model-key` | Encrypted at rest, never returned, safe on secret rotation |
| `verify:desktop-live` | **Live**: volume, desktop, workbench, snapshot pruning, pause |

## OAuth MCP authentication

With `APP_BASE_URL` configured, Sylla is its own OAuth 2.1 authorization server for MCP clients. It publishes protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` and authorization-server metadata at `/.well-known/oauth-authorization-server`. Public clients register dynamically at `/oauth/register`, authorize through `/oauth/authorize`, and exchange an S256 PKCE code at `/oauth/token`. Access and rotating refresh tokens are opaque; only SHA-256 hashes are stored. Authorization codes are short-lived and single-use.

The consent screen binds a grant to the participant represented by the current HttpOnly Sylla browser session. After first entering through MCP or an invitation, the participant may bind a discoverable passkey to the canonical Sylla User. A successful usernameless passkey ceremony creates a hashed, revocable browser-session token that resolves an active participation record for the same Personal Agent. Biometric data and device PINs remain with the authenticator; Sylla stores only the public credential, counter, and non-secret authenticator metadata. Account recovery when every passkey is lost and participant-facing passkey removal still need a production policy. The canonical user and personal-agent identifiers do not depend on an LLM provider.

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
