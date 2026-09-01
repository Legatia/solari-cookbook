# Sylla

> Keep the agent. Change the model.

Sylla (pronounced **SILL-uh**) is the portable relationship layer for personal AI. A person names and shapes their own agent; Sylla gives that relationship approved memory, evidence, tools, and continuity across the LLMs they already use.

Evidence-backed social discovery is the flagship use case, not the product boundary. The first experiment creates one worthwhile introduction between two adults who opted into the same real-world event. Relationships are expected to continue in the communication tools people already use.

## Architecture

```text
user-named agent in the participant's existing LLM
   ↕ active reasoning under the participant's host quota
OAuth-authenticated Sylla MCP service ─── Neon Postgres (approved durable state)
   ├─ Solari Browser  → recorded research on approved public URLs
   ├─ Solari Desktop  ↔ visible, interruptible agent workspace
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

## Current foundation

- Next.js 16 App Router, TypeScript, Tailwind CSS, and shadcn/ui
- Neon Postgres with Drizzle schema and migrations
- Typed mock and live adapters for all three Solari products
- Deterministic mock mode for local work without billable sessions
- Anonymous, HttpOnly-cookie-isolated first sessions backed by durable Neon state
- Agent naming, a current personal focus, and one to three participant-approved public sources
- A working Browser research route that records provider, run reference, extracted evidence, and source status
- A functional memory ledger with evidence-aware Keep, Correct, Private/Shareable, and Forget controls
- Private follow-up reflections that return as proposed memory rather than being silently persisted as truth
- A reconstructible Desktop workbench generated only from approved memories and source artifacts
- A view-only live Desktop viewer for Solari streams, with an honest reconstructible preview in mock mode
- An explicit workbench close action that destroys a live Desktop and purges its materialized artifacts
- URL policy checks that reject obvious local and private-network sources
- Unit tests for adapter contracts, source URL policy, and observation-origin separation

The first attachment loop is implemented and verified in mock mode against the configured Neon database. It has also completed a bounded live Solari Browser run against the public Sylla repository: the source title and evidence were extracted, the session was released, and its gzip replay became available. A live Solari Sandbox smoke test completed and was explicitly destroyed. Live Desktop creation was attempted but rejected before allocation because the current Solari account requires a paid plan for Desktop. The remote MCP/OAuth layer, host-run leases, and internal-agent failover remain target architecture rather than implemented product behavior. See the roadmap for the revised implementation order.

The live Sandbox adapter currently runs a deterministic baseline inside a disposable VM. It proves isolation, structured output, and cleanup; it is explicitly not the final personal-agent evaluator.

## First-session flow

1. Name the personal agent and describe one question, transition, or ambition it should understand now.
2. Approve one to three public URLs. Sylla rejects local, private-network, and unsupported source targets.
3. Sylla researches those sources through the active Browser adapter and separates `Told to me`, `Observed`, and `Inferred` proposals.
4. The participant keeps, corrects, changes disclosure, or forgets each proposal. Nothing pending enters the workbench.
5. The participant can add a concise follow-up reflection, which also waits for explicit memory approval.
6. Sylla reconstructs the agent's Desktop workbench from approved database state. Rebuilding after a correction or deletion excludes the old material.

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

Solari product availability can differ by account tier. Browser and Sandbox have been verified with the current development account; Desktop currently returns `Desktop requires a paid plan` before creating a session.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Product documents

- [`PROJECT_PROMPT.md`](./PROJECT_PROMPT.md) — canonical scope, trust model, and definition of done
- [`ROADMAP.md`](./ROADMAP.md) — evidence-gated implementation and pilot roadmap

## Safety boundary

The v1 Desktop is a Solari-managed cloud Linux computer. It does not observe a participant's physical Mac or Windows computer. Native access to local applications would require a separate explicit, revocable connector and is outside the current scope.
