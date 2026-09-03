# Sylla — Project Roadmap

**Sylla (pronounced SILL-uh) is the public master brand for the portable relationship layer. Sylla is not the agent's name: each user names and shapes their own agent. The agent's approved identity, memory, trust, and working context persist across host LLMs; evidence-backed social discovery is the first flagship use case.**

This roadmap is organized around evidence gates rather than feature volume. A phase is complete only when its gate is satisfied. Visual polish cannot substitute for a working vertical slice or a real participant outcome.

## North-star outcome

Deliver one completed introduction between two opt-in event participants that:

1. Both personal-agent evaluations recommended.
2. Both humans explicitly accepted.
3. Actually happened.
4. Both participants said was worth having.

The strongest additional signal is a voluntary second action: exchanging contact information or arranging another interaction.

The first retention signal is different:

> After the introduction, does the participant voluntarily debrief, approve what the agent learned, and ask it to find someone else?

The first interaction signal is:

> Does the participant value concise conversation while voluntarily opening the agent's workspace to inspect, correct, or explore the underlying research and memory?

## Product boundary

This project is the first reference implementation of **portable relationship infrastructure for personal agents**. It is not a new chatbot or social destination. The participant's existing LLM is the preferred conversational surface; the web application is the durable identity, trust, privacy, memory, and workspace control plane. The event-introduction pilot is the first narrow proof that an attached personal agent can create a valuable real-world outcome.

- Relationships are expected to move to participants' existing communication tools.
- The product does not need feeds, DMs, followers, or engagement loops.
- One OAuth-authenticated remote MCP service exposes provider-neutral tools to major LLM hosts. Begin with a ChatGPT plugin and reuse the same contract for Claude, Grok, and later hosts.
- The web application exists for workspace access, context review, consent, auditing, introductions, fallback status, private reflection, memory control, export, and deletion. Its conversation is a reference and recovery surface rather than a new habit users must adopt.
- The first implementation remains narrowly focused on social discovery rather than attempting every future personal-agent capability at once.
- Solari Desktop is the agent's private, inspectable cloud workbench; it is not access to the participant's physical computer.
- The application database is the durable source of truth. Desktop workspaces must be reconstructible, pausable, and deletable.
- Sylla owns a canonical user and personal-agent identity that is independent of every host provider. MCP hosts, the web control center, and a future native Sylla application must all resolve to the same agent.
- Each activated agent receives a persistent private Desktop home backed by a durable volume and recoverable snapshots. The Desktop is paused between runs rather than treated as disposable or left continuously billable.
- Core operations must use typed service interfaces exposed through MCP in v1.
- The default MCP surface is a small mission contract: start, inspect, approve, continue, and cancel. Sylla owns capability classification, Solari resource selection, step persistence, credits, and approval gates; provider-level tools remain an advanced substrate.
- The same agent carries an explicit conversation profile across hosts. Before a substantive response, the host receives a compact brief containing only relevant approved memory and behavior guidance; Sylla never imports or stores the full host transcript.
- The connected host model is the default semantic orchestrator while its run lease is active. It observes and directs Solari through MCP using the participant's host-model allowance.
- Deterministic code handles non-semantic background work. A bounded internal agent is used only after the host lease expires or the participant explicitly requests background continuation.
- Fallback never expands authority: human approval is still required for memory, disclosure, acceptance, messaging, and other consequential actions.
- Sylla brokers Solari resources and customer entitlements. Participants never manage Solari accounts or keys; MCP can initiate hosted checkout and report usage, but payment credentials never enter tool arguments or model transcripts.

The trust principle is:

> Intimacy must be earned, legible, and reversible.

The competitive principle is:

> Portable agent memory and agent-to-agent matching are now category features. Sylla must prove relationship continuity, earned trust, inspectable evidence, and consequential real-world usefulness—not merely that an agent remembers or that two agents can recommend two people.

## Implementation checkpoint — first attachment loop

The first end-to-end attachment loop now exists in the reference application:

- A participant receives an isolated anonymous session, names their agent, states a current focus, and approves one to three public sources.
- A participant may instead redeem a bounded event invitation, review the explicit trust boundaries, optionally enable private introductions, provide availability only for that feature, and enter after accepting the current policy version.
- The Browser adapter produces source evidence and explicitly separated `Told to me`, `Observed`, and `Inferred` memory proposals.
- Neon persists research provenance, source evidence, agent identity, observation status, visibility, and workspace reconstruction state.
- The participant can Keep, Correct, change Private/Shareable status, or permanently Forget an observation.
- A concise follow-up reflection enters the same approval queue instead of becoming implicit memory.
- The Desktop adapter receives only approved observations and materializes both a machine-readable manifest and a visual private workbench.
- The browser UI can mount a live view-only Solari Desktop stream; mock mode renders the same approved state as an honest reconstructible preview.
- The participant can explicitly pause the workbench while preserving its home; a separate withdrawal path destroys the Desktop, retained volume, and materialized artifacts.

This loop has been exercised end to end in mock mode against the configured development database, including refresh persistence and exclusion of a forgotten observation. A bounded live Solari Browser run has also extracted the public Sylla repository, released its session, and produced an available replay. A live Sandbox smoke test ran successfully and was explicitly destroyed. A bounded durable-volume probe succeeded and cleaned up after itself. Desktop creation still returns `Desktop requires a paid plan` before allocation, but Solari has identified that response as an upstream subscription-gate bug rather than a genuine plan requirement. The persistent lifecycle is implemented against the SDK contract; the live Desktop viewer, snapshot, and pause/resume path will be re-verified when that defect is fixed.

The provider abstraction now has a durable mission layer. A host can submit one plain-language objective plus an optional URL scope and maximum credit budget. Sylla classifies the capability and risk, persists an inspectable step plan, requests approval for consequential intent, obtains the exclusive agent lease, and routes to Browser research or bounded web control, disposable Sandbox repository checks, Desktop workspace lifecycle, or the private-introduction pipeline. Mission-scoped lineage prevents a new research task from deleting earlier approved memories. Approved web-account missions now reuse a persistent Solari Browser profile and let the active host reason over compact page observations, then invoke stable referenced controls in bounded batches. Origin, action-count, credit, and sensitive-field gates are enforced in Sylla. Secure human takeover for passwords, OTPs, payment confirmation, and cross-origin authentication remains unimplemented, so those flows stop at an explicit checkpoint rather than requesting secrets through chat.

The attachment layer now also has a portable conversation contract. Participants can explicitly tune reply length, warmth, directness, humor, challenge style, preferred address, and concrete do/don't behaviors. A host can request a topic-scoped brief that ranks only confirmed or edited memories across the canonical agent's participation history, returns at most four, and does not persist the topic. Mission results carry human response cues so hosts do not repeat status enums, resource names, or execution logs. Deterministic regression checks flag common AI clichés, excessive questions and headings, long default replies, and internal-state leakage. Human transcript review is still required before claiming that the agent feels intimate.

The portability foundation is also underway: the database assigns canonical Sylla User and Personal Agent identifiers independently of host providers, records Desktop/volume/snapshot lifecycle metadata, and exposes a stateless Streamable HTTP MCP contract for agent bootstrap, approved-context recall, plan inspection, run leases, durable runs/checkpoints/handoffs, approved-source Browser research, privacy-preserving pair control, directional Sandbox evaluation, bilateral disclosure and introduction control, and workspace inspection/open/checkpoint/pause. Opening creates one durable volume, reconnects or resumes the existing Desktop when present, reconstructs the visible workbench only from approved state, and records a recovery snapshot; pausing checkpoints first and preserves the home for another client or the later native app. Bounded invitations, versioned consent, explicit host-data disclosure, optional background permission, availability windows, audit events, and withdrawal are implemented. Withdrawal releases runtime leases, revokes host connections and first-party OAuth grants, removes the participant from matching, and attempts workspace destruction without making withdrawal contingent on provider cleanup. Candidate retrieval now enforces same-event consent, current intent, overlapping availability, bilateral blocks, prior declines, pair conflicts, and approved shareable context without inventing a compatibility score. Canonical pair reservations feed two separately persisted directional evaluations: each direction may use its owner's approved private context but receives only the candidate's approved shareable envelope, and every rationale must cite authorized observations from both sides. Two live Solari Sandbox VMs completed this bilateral contract and were explicitly destroyed. Mutual recommendation still reveals nothing; each person must next approve a one-to-five-item shareable disclosure envelope under a human-controlled host lease. A proposal shows only that approved anonymous preview, and identity plus the public meeting area become visible only after two private acceptances. The other person's decision is never exposed, and a decline produces the same closed state for both sides. Internal and web leases cannot approve disclosure or acceptance. Exclusive leases bind the authenticated client plus conversation run ID to one agent, store only a capability hash, and support heartbeat, expiry, release, and cross-host handoff. The controller now supports a non-consequential reconnect summary and a second bounded task that resumes only the remaining participant-approved public URLs through Solari Browser. It checkpoints after each source, refuses automatic revisits of completed or ambiguous sources, regenerates only pending memory proposals, and charges each Browser visit through the usage ledger. An authenticated scheduled sweep acquires the same runtime lease as host clients, claims the participant-approved budget, invokes the bounded adapter, writes one auditable handoff, and releases. The deterministic summary default makes no external model call; optional live mode sends only the explicit checkpoint through a strict-schema, non-stored, token- and time-bounded Responses request, then degrades safely on provider failure. Eight-worker summary races, returning-host overlap, model failure, stale-worker recovery without a second charge, a one-source host-to-Browser-worker handoff with zero duplicate visits, a complete invitation-to-withdrawal lifecycle, bilateral live Sandbox evaluation, and the full anonymous-preview-to-mutual-reveal introduction gate have been exercised against Neon. Trial/active entitlements guard billable work through atomic reservations and an idempotent usage ledger; inactive accounts receive an expiring hosted-checkout continuation with no payment data entering MCP. Built-in OAuth 2.1 discovery, dynamic client registration, S256 PKCE, token rotation, session-bound consent, a participant-visible connection/revocation panel, and companion-level MCP actions are implemented and tested against Neon. This is not the full Phase 1 gate: durable cross-device account login and second-client identity linking, a real billing provider and verified webhook, production scheduler monitoring, and a real internal-model invocation with project credentials still remain.

## Phase 0 — Lock the experiment

### Objective

Turn the concept into one operational pilot with a real source of participants.

### Work

- Select one AI/technology event or builder community for the engineering alpha.
- Identify a follow-up consumer validation cohort centered on a social transition, such as people new to a city or people arriving alone at a recurring interest-based event.
- Obtain organizer permission or choose a community where the team can legitimately recruit.
- Define one meeting area and several 20–30 minute event windows.
- Choose the primary introduction intents supported in the pilot.
- Draft participant consent, data-use, retention, withdrawal, and safety language.
- Draft host-provider disclosure explaining that the chosen LLM may retain its conversation under its own terms and that MCP receives only intentional tool payloads.
- Draft the background-continuation policy: approved task types, lease timeout, internal-model budget, maximum duration, notification behavior, and actions that always wait for the human.
- Draft the private-debrief promise, model-provider disclosure, ephemeral-processing boundary, and proposed-memory consent language.
- Decide the pilot's minimum viable cohort and recruitment target.
- Define how follow-up will be delivered after the meeting.

### Recommended cohort

- Minimum for a meaningful dry run: 8–12 participants
- Engineering alpha: 8–20 participants
- Consumer validation pilot: 20–40 participants, substantially non-technical
- Maximum for either initial run: 40 participants

### Gate

- A named community or organizer agrees to recruit participants.
- A meeting setting and pilot window are defined.
- The participant-facing consent and data boundaries are understandable without technical explanation.
- A participant can distinguish private debrief, proposed memory, approved memory, shareable context, and aggregate outcome data.
- A participant understands that the visible workspace is a managed cloud desktop and that the agent does not observe their physical computer.
- A participant can explain the difference between host-model quota, Solari runtime cost, and internal fallback-model cost.
- A participant can enable, limit, or disable internal-agent continuation without losing access to the product.

### Parallel fallback

Do not block software development while arranging the cohort. Maintain a clearly labeled synthetic demo event for engineering, but never present synthetic activity as pilot evidence.

## Phase 1 — Identity, MCP, run control, and invitation flow

### Objective

Create the smallest host-independent skeleton capable of authenticating participants, accepting tool calls from an existing LLM, and onboarding real participants safely.

### Work

- Initialize the application, database, migrations, formatting, linting, and tests.
- Add typed configuration and `.env.example`.
- Build a public remote MCP endpoint over the same typed services used by the web application.
- Add permanent Sylla User and Personal Agent identifiers before introducing provider-specific authentication. Never use an OpenAI, Anthropic, Google, or other host subject as the canonical owner identifier.
- Implement OAuth 2.1 participant authentication, narrowly scoped tool permissions, revocation, and account linking across host providers.
- Make the first authorized MCP call idempotently create or link the personal agent and its workspace metadata without requiring a Solari account or key from the participant.
- Add linked identities so a later native-app login resolves the same agent, approved memory, relationship history, subscription, and workspace.
- Add entitlement, usage-ledger, spend-budget, runtime-lease, and billing-event models in front of Solari provisioning.
- Let MCP return plan information, operation estimates, usage, and a hosted-checkout URL. Process card data outside MCP and activate entitlements only from verified billing state.
- Package the first ChatGPT plugin with thin instructions and tool metadata; document manual connection from other MCP-capable hosts without duplicating business logic.
- Define composable tools for source research, workspace observation and action, approved-memory proposals, candidate retrieval, run status, checkpointing, cancellation, and safe resumption.
- Add Agent Run, Orchestration Lease, Heartbeat, Checkpoint, Idempotency Key, Fallback Policy, Fallback Reason, and Budget Usage models.
- Implement `host_orchestrated`, `deterministic_background`, and `internal_fallback` execution modes behind one run contract.
- Add a lease-expiry handoff that cannot race with a returning host and that produces an auditable reconnect summary.
- Build a mock host harness so quota ownership and failover can be tested without relying on a consumer LLM during CI.
- Implement Event, Invitation, Participant, Intent, Availability, and Audit Event models.
- Build organizer event creation and unique invitation links.
- Build participant consent, age confirmation, intent, and availability screens.
- Build a concise conversational shell that renders one question, recommendation, or decision at a time.
- Add a participant-only entry point for the future agent workspace, with a clear explanation of its cloud-computer boundary.
- Implement participant withdrawal and a first-pass deletion path.
- Add deterministic seed data for local development.

### Gate

A participant can connect from ChatGPT through OAuth-authenticated MCP, idempotently bootstrap a canonical personal agent, invoke a typed read-only tool, revoke the connection, and complete consent, intent, and availability without manual database edits. The same linked identity resolves the same agent from a second client. A simulated host loss transfers one authorized mock task to the internal fallback exactly once and returns a valid handoff when the host reconnects. A billable tool refuses an inactive entitlement and returns a hosted-checkout continuation rather than accepting payment data.

**Implementation status:** the first-party OAuth connection, PKCE exchange, session-bound agent bootstrap, context recall, visible connection management, revocation, high-level memory/research/introduction actions, leases, handoff, consent, and entitlement refusal are implemented. Durable cross-device login and verified second-client account linking remain before the full gate is complete.

## Phase 2 — Solari Browser evidence collection

### Objective

Prove the first Solari-native primitive: auditable exploration of participant-approved public sources.

### Work

- Add an approved-source submission flow limited to one to three public URLs.
- Validate URLs and reject private-network, local, unsafe, unsupported, and non-HTTP targets.
- Create a typed Browser adapter with mock and live Solari implementations.
- Launch recorded Solari Browser sessions server-side.
- Maintain a separate profile-backed Browser path for approved web-account missions; explicitly save cookies and local storage after each bounded call and keep provider identifiers out of portable exports.
- Expose compact page observations and stable element references rather than raw selectors. Permit only typed navigation, click, fill, select, check, key, back, and bounded-wait actions within the approved origin set.
- Detect password and one-time-code controls and stop at a human checkpoint. Add secure takeover before claiming end-to-end login, payment, or cross-origin OAuth support.
- Expose bounded `observe`, `navigate`, `extract`, `checkpoint`, and `cancel` operations through MCP so the active host model remains the default semantic research brain.
- Compress Browser observations before returning them to the host; avoid spending host context on irrelevant page content or every visual frame.
- Checkpoint after each approved source and resume under the internal agent only after lease expiry and within the participant's fallback policy.
- Navigate only approved URLs and extract page title, final URL, visible text, and relevant evidence.
- Treat page content as untrusted data and isolate it from system instructions.
- Store session identifiers and restricted replay metadata server-side.
- After releasing a recorded Browser session, poll the asynchronous replay endpoint with a bounded deadline; treat an initial 404 as not-ready rather than proof that recording failed.
- Put replay retrieval behind participant authorization and a short retention policy because the DOM-level recording may contain more than the extracted evidence cards.
- Close sessions reliably on success, timeout, cancellation, and exception paths.
- Add retries, timeouts, per-source status, and participant-friendly error states.
- Emit a participant-visible research activity stream without exposing hidden reasoning.

### Gate

A live host-orchestrated run can inspect at least three representative source types—such as a personal site, GitHub page, and blog—then produce traceable evidence and a restricted recording without leaking credentials. A forced disconnect resumes from the last completed source without visiting a URL twice or widening scope.

## Phase 3 — User-reviewed context model

### Objective

Let the participant see, correct, and control the agent's limited understanding before matching begins.

### Work

- Define and validate the Observation schema.
- Synthesize observations from onboarding answers and extracted evidence.
- Let the host model propose structured observations and memories through MCP, but never grant the MCP server implicit access to the participant's complete host transcript.
- Distinguish user statements, observed facts, and agent inferences.
- Define separate memory-ledger dimensions: origin (Observed, Inferred, Told to me) and status (Pending, Confirmed, Edited, Forgotten).
- Display source, excerpt, confidence, sensitivity, and uncertainty.
- Implement Keep, Edit, Delete, Private, and Shareable controls.
- Add export of approved context in a simple machine-readable format.
- Generate an approved shareable-context envelope.
- Ensure deleted or rejected observations cannot enter downstream retrieval or evaluation.
- Add a clear ready-for-introduction confirmation.
- Show which orchestrator proposed each inference and whether fallback was involved.

### Gate

A participant can correct an incorrect inference, approve a context model, and inspect exactly what may be used or shared. Automated tests prove rejected observations are excluded downstream.

## Phase 4 — Solari Desktop agent workspace

### Objective

Prove the second Solari-native primitive: a private, visual workbench that makes the agent's deeper work inspectable while conversation remains concise.

### Work

- Define Agent Workspace, Workspace Research Task, Workspace Artifact, and Agent Activity Event models.
- Create typed mock and live Desktop adapters.
- Create or resume a participant-specific Solari Desktop on demand.
- Create one durable volume for the agent's approved files and user-visible work history, and attach it whenever the Desktop is reconstructed.
- Treat the Desktop as the agent's persistent private home across host conversations and the later native application, while keeping compute paused when idle.
- Expose narrow MCP tools for observing selected workspace state, clicking, typing, opening approved artifacts, checkpointing, interrupting, and releasing the run lease.
- Implement computer use as an observe-act-observe loop: capture a selected screenshot before a coordinate action and verify the resulting screen afterward instead of assuming a click or keystroke landed correctly.
- Let the active host model direct semantic Desktop work using selected screenshots or compressed state under the participant's host allowance.
- Add a lease-aware fallback controller that resumes from the latest Desktop checkpoint only when background continuation is authorized.
- Materialize approved research artifacts, evidence boards, introduction states, and the memory ledger from the application database.
- Implement one genuine multi-step research task that benefits from a graphical computer and records source-backed artifacts in the workspace.
- Build a lightweight workspace application inside the VM rather than exposing an unstructured Linux desktop as the product.
- Let the participant view the live workspace, inspect the current task, and interrupt or take over when appropriate.
- Keep Desktop stream URLs, session identifiers, files, screenshots, and activity history participant-private and server-mediated.
- Pause idle VMs, reconnect safely, and destroy them on withdrawal or retention expiry.
- Snapshot meaningful recovery points and record the current VM, volume, and snapshot mappings server-side.
- Prove that the workspace can be reconstructed from approved database records, the durable volume, and the latest valid snapshot after its VM is destroyed.
- Prevent raw debriefs, unapproved proposed memories, hidden reasoning, and unapproved third-party dossiers from entering Desktop files or streams.

### Gate

A participant can open a live Solari Desktop workspace while their host LLM directs a visible task, inspect source-backed artifacts and the memory ledger, interrupt the task, return after a pause from another client, and reconstruct the Desktop without losing approved state. Withdrawal destroys the VM and retained volume according to policy. A simulated host disconnect transfers the lease without duplicate clicks or writes. Automated tests prove cross-participant workspace isolation.

## Phase 5 — Candidate retrieval

### Objective

Generate a small, legitimate candidate set without pretending that similarity equals human compatibility.

### Work

- Apply hard filters for event, activation, availability, intent, blocks, and prior declines.
- Build a simple shortlist using only approved shareable context.
- Keep retrieval logic explainable and inspectable.
- Prevent duplicate or conflicting pair assignments.
- Add an organizer-triggered matching-run state.
- Run continuous hard filtering and index refreshes deterministically; do not spend internal-model tokens on work ordinary code can perform.
- Record which approved observations contributed to retrieval.

### Gate

Given a seeded cohort, the system returns valid candidate shortlists while consistently respecting consent, availability, and disclosure boundaries.

## Phase 6 — Solari Sandbox bilateral evaluation and fallback

### Objective

Prove the third Solari-native primitive: independent, clean directional evaluation boundaries that prefer the participant's active host model and can safely fall back when that host is unavailable.

### Work

- Define the Directional Evaluation input and output schemas.
- Create mock and live Sandbox adapters.
- Prepare a reproducible evaluator environment and snapshot if setup cost warrants it.
- Run Alice→Bob and Bob→Alice as separate sandbox jobs.
- Pass each job only one participant's approved private model and the candidate's shareable envelope.
- In host-orchestrated mode, prepare the minimal directional packet, return it only to that participant's active host, and validate the host's structured judgment through MCP.
- In fallback mode, run the internal evaluator inside the bounded job only after lease expiry and only when the participant authorized background evaluation.
- Record the orchestrator, host provider when applicable, fallback reason, checkpoint, model cost, and policy version without recording hidden reasoning.
- Validate every result and reject malformed or unsupported rationales.
- Require rationale statements to reference approved observation identifiers.
- Record uncertainty and cautions without producing a compatibility score.
- Terminate, revert, or pause jobs safely on every path.
- Add idempotency so retries cannot create multiple active evaluations or introductions.

### Gate

Two real Solari Sandbox jobs produce validated bilateral results, no rationale references an unauthorized observation, and failure cleanup is verified. At least one evaluation uses active host reasoning and one deliberately exercises internal fallback; both satisfy the same schema and disclosure policy without duplicate evaluations.

## Phase 7 — Disclosure, consent, and introduction

**Implementation status: complete in the reference backend and MCP contract; live participant UX rehearsal remains in Phase 9.**

### Objective

Turn two agent recommendations into one human-controlled introduction.

### Work

- Implement the bilateral recommendation gate.
- Allow the host conversation to present and collect a response through MCP, but require an explicit human confirmation for disclosure and acceptance; an internal fallback agent can never supply it.
- Show each participant a non-identifying preview based only on approved rationale.
- Let each participant approve requested disclosures.
- Add Accept, Decline, Block, and Withdraw actions.
- Ensure neither participant can infer who declined.
- Reveal identity only after all agent and human gates pass.
- Assign a public meeting area and compatible event window.
- Add clear operational states for waiting, expired, declined, matched, and completed introductions.

### Gate

No identity is revealed without two valid recommendations, two approved disclosure envelopes, and two human acceptances. A decline ends the proposal without leaking the other participant's decision.

## Phase 8 — Private debrief, memory, and organizer evidence

**Implementation status: complete in the reference backend and MCP contract; participant-facing debrief polish, authenticated organizer presentation, and live rehearsal remain in Phase 9.**

### Objective

Measure whether the introduction created value and whether the agent earned enough trust for voluntary reflection and repeated use.

### Work

- Ask whether the participants already knew or would otherwise have approached each other.
- Record whether the meeting happened.
- Offer Quick reflection, Talk it through privately, and Skip.
- Explain before the debrief what remains private, which host or internal model processes it, what Sylla receives, what will not persist without approval, and that the chosen host may retain its own transcript.
- Keep the debrief conversational: one short, human question at a time rather than a generated essay or interrogation.
- Ask both whether the meeting was worthwhile and whether they would meet again.
- Ask what surprised them, how the interaction felt, what worked, and what the agent should understand better.
- Record contact exchange or a planned second interaction as optional behavioral signals.
- Process raw debrief content received by Sylla ephemerally without writing it to the application database, analytics, audit logs, browser recordings, Solari Desktop, or Solari jobs. Treat any host-retained transcript as a separately disclosed boundary.
- When the debrief occurs in a host LLM, accept only intentionally submitted structured outcomes and proposed memories through MCP rather than silently importing the full conversation.
- Generate zero to three proposed memories about the participant, not judgments about the other person.
- Let the participant Keep, Edit, or Forget every proposed memory.
- Keep approved personal memories private by default and separate from outcome events and shareable context.
- Add approved memories to the workspace memory ledger only after explicit confirmation.
- Ask whether the participant wants the agent to find someone else.
- Add export and deletion for approved context and approved memory.
- Build an aggregate organizer dashboard.
- Prevent organizers from seeing private observations, private evaluation inputs, private debriefs, or personal memories.
- Suppress or coarsen small-cohort metrics that could reveal which participant debriefed, rejected a memory, or requested another introduction.
- Add anonymized results export.

### Gate

The system can distinguish accepted introductions, completed meetings, mutually worthwhile meetings, second actions, debrief opt-in, memory approval, and repeat-introduction requests. Raw debrief content is absent from persistent stores and Solari resources, and no memory affects future recommendations before explicit approval.

## Phase 9 — Trust, reliability, and live rehearsal

### Objective

Make the complete flow safe and reliable enough for real participants.

### Work

- Audit participant and organizer authorization.
- Audit OAuth scopes, token revocation, connector account linking, and cross-host identity isolation.
- Test run-lease expiry, delayed heartbeats, host reconnection races, checkpoint corruption, idempotent retries, fallback budget exhaustion, and fallback cancellation.
- Verify the internal agent never runs while a valid host lease exists and never crosses a human-approval gate.
- Audit the debrief path for database writes, analytics capture, error logging, model-provider retention, and accidental Solari transmission.
- Test URL validation, prompt-injection handling, output validation, and secret boundaries.
- Verify Browser, Desktop, and Sandbox cleanup under forced failures.
- Verify Desktop pause, reconnect, reconstruction, cross-participant isolation, stream authorization, withdrawal destruction, and retention expiry.
- Verify withdrawal and deletion across observations, envelopes, evaluations, and pending introductions.
- Verify export and deletion across approved personal memories and outcome events.
- Establish and implement a short data-retention policy.
- Add operational monitoring for stuck Browser sessions, Desktop VMs, and Sandbox jobs.
- Add operational monitoring for stuck host leases, unexpected fallback use, duplicate run ownership, and internal-model spend.
- Run a full synthetic rehearsal with success, decline, timeout, malformed output, and participant withdrawal cases.
- Rehearse private debrief skip, full memory rejection, edited memory approval, and repeat-introduction request cases.
- Conduct a small human dry run before the main event.

### Gate

The team completes an end-to-end rehearsal without manual database repair, persisted Sylla-side raw debriefs, leaked private context, orphaned Solari resources, duplicate host/fallback work, unbounded internal-model spend, or ambiguous participant states.

## Phase 10 — Live pilot

### Objective

Produce real behavioral evidence first from the engineering alpha and then from a substantially non-technical consumer validation cohort.

### Before the event

- Recruit the opt-in cohort.
- Confirm meeting windows and location.
- Complete onboarding early enough to repair failed source runs.
- Confirm every participant understands the cloud-workspace boundary and can access their workspace.
- Review operational dashboards and resource limits.
- Confirm host connections, fallback preferences, lease timeouts, and internal-model budgets.
- Prepare a manual support path that does not bypass consent.

### During the event

- Trigger or confirm matching.
- Measure how much semantic work is completed by participant host models versus internal fallback without exposing conversation content.
- Monitor only operational status, not private model content.
- Help participants locate the public meeting area.
- Record whether introductions occur.
- Observe whether participants voluntarily open the workspace, inspect evidence, correct an item, or interrupt a task; do not pressure them to use it.

### After the event

- Send follow-up promptly.
- Record mutual-value and second-action outcomes.
- Offer the private debrief without pressuring participants to disclose.
- Measure debrief opt-in, proposed-memory approval or rejection, trust comprehension, and requests for another introduction.
- Measure concise-chat satisfaction, workspace opens, evidence inspections, corrections, and whether the workspace increased or reduced trust.
- Measure host-connection success, fallback frequency, resume success, duplicate-work incidents, and whether participants understood who powered each run.
- Ask the organizer whether they would repeat the experience.
- Purge data according to the stated retention policy.
- Document failures and surprising behavior honestly.

### Gate

At least one introduction completes and both participants report that it was worth having. At least one participant completes the memory-control flow, including approval, editing, or full rejection. At least one participant uses the workspace to inspect or correct the agent's work. Report the entire funnel, including failures, declines, debrief skips, memory rejections, workspace non-use, and repeat requests. Do not claim general consumer fit from the technical alpha alone.

## Phase 11 — Public submission

### Objective

Turn the working product and pilot into a credible public application.

### Repository

- Clear README with problem, hypothesis, architecture, setup, and limitations.
- Architecture diagram showing the participant's host LLM, OAuth/MCP, run leases and fallback, Browser research, the application policy and data layer, Desktop workspace, and Sandbox jobs.
- Documented host-quota, Solari-credit, and internal-fallback cost boundaries.
- Documented mock mode and live Solari mode.
- `.env.example`, migrations, seed flow, and test commands.
- No secrets, participant data, private replay URLs, or identifying pilot artifacts.

### Demo

Tell one complete story:

1. Alice connects the plugin to her existing LLM through Sylla OAuth and approves sources.
2. Her host LLM directs the Solari Browser through MCP and uses its own host quota for reasoning.
3. Alice removes an incorrect inference.
4. Alice opens the Solari Desktop workspace while the host directs a visible task.
5. The demo deliberately interrupts the host lease; the bounded internal agent resumes from the checkpoint without duplicating work.
6. Alice's host reconnects and receives a concise, auditable handoff while deeper provenance remains in the workspace.
7. Bob independently completes onboarding from another supported host or the reference client.
8. Two Sandbox evaluations recommend one introduction, with the orchestrator for each clearly disclosed.
9. Both humans approve.
10. They meet.
11. The agent offers a private debrief with the host-transcript boundary explained.
12. Alice reviews what the agent proposes to remember and sees only her approved learning enter the workspace.
13. The product records whether she wants another introduction.

Show a sanitized Browser replay excerpt, the live Desktop workspace, the host-to-fallback handoff, and the two clean Sandbox jobs. Do not show hidden reasoning or private participant data.

### Public build post

- State the problem and testable hypothesis.
- Explain why Solari Browser, Desktop, and Sandbox each materially helped.
- Explain why the participant's host LLM is the primary brain, exactly when internal fallback is allowed, and which quota pays for each mode.
- Share real funnel numbers with denominators.
- Include debrief opt-in, memory-control, and repeat-request metrics without exposing reflection content.
- Separate product evidence from future vision.
- Explain that the introduction may leave the product and that this is intentional.
- Include one or more approved participant reactions if available.
- Link the public repository and demo.
- Tag the accounts requested in the challenge post.

### Gate

Someone outside the team can understand the experiment, run the project in mock mode, verify the architecture, and distinguish real results from aspiration.

## Suggested implementation order

When time is constrained, build one vertical slice in this order:

1. Canonical Sylla user/agent identity and authenticated remote MCP endpoint
2. Plain-language mission controller with risk, approval, budget, resource routing, and durable steps
3. Cross-host account linking, entitlement guard, and hosted-checkout continuation
4. Persistent Desktop-home metadata: VM, durable volume, snapshot, and pause/resume lifecycle
5. Run lease, checkpoint, and mock host-to-fallback handoff
6. Seeded event and two participant invitations
7. Consent, intent, availability, and source submission
8. One host-directed live Solari Browser exploration
9. Observation review and deletion
10. One host-directed live Solari Desktop workspace with deliberate fallback takeover
11. Evidence board, activity stream, and memory ledger reconstruction
12. Deterministic shortlist
13. Two live Solari Sandbox evaluations using the common host/fallback schema
14. Bilateral human consent
15. Meeting assignment
16. Private debrief and proposed-memory review
17. Repeat-introduction request
18. Organizer metrics
19. Reliability and visual polish

Do not build secondary organizer tooling, elaborate animations, bespoke integrations for every host, or additional connection categories before this slice works.

## Decision log still requiring real-world input

These decisions do not block development, but they must be resolved before the live pilot:

- The specific event or community
- The organizer and participant recruitment channel
- Exact meeting windows and public location
- Supported introduction intents for that cohort
- Pilot retention period
- Desktop pause, reconstruction, destruction, and stream-access policy
- Solari's commercial terms for multi-tenant brokerage and production pricing for Desktop, volumes, and snapshots
- Initial Sylla plan, included work credits, overage behavior, and participant-visible spend limits
- Which workspace views are necessary for the vertical slice
- Raw debrief processing and model-provider retention configuration
- Which host surfaces qualify for the first pilot and whether scheduled host runs may invoke the plugin
- Host lease timeout and reconnect grace period
- Which read-only tasks may continue automatically under fallback
- Per-run internal-model cost and duration limits
- Participant support and incident contact
- Whether contact exchange occurs inside or outside the product
- Brand voice, visual identity, and pronunciation guidance for Sylla

## Stop conditions

Pause feature expansion and investigate if:

- Participants do not understand what the agent will inspect.
- Participants mistake the Solari workspace for access to their physical computer.
- Participants consistently ignore the workspace, or find it more overwhelming than trustworthy.
- Participants cannot explain whether the host model or internal fallback performed a task.
- The internal agent handles routine work that should have remained on an active host model or deterministic code.
- Host reconnection causes duplicate actions, conflicting checkpoints, or lost approvals.
- The workspace becomes an unstructured data dump instead of helping users understand or control the agent.
- Participants approve context models but reject most resulting introductions.
- The agent repeatedly cites irrelevant or unsupported evidence.
- People accept but do not attend meetings.
- Meetings happen but neither participant finds them worthwhile.
- Participants do not trust the private-debrief boundary or cannot explain what is retained.
- Most participants reject proposed memories because the agent overgeneralizes from one interaction.
- Valuable introductions occur but nobody asks the agent for another one.
- Organizers will not recruit a second cohort.

These are product-learning signals, not problems to hide with more features.
