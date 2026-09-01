# Sylla — Canonical Build Prompt

**Sylla (pronounced SILL-uh) is the public master brand and the relationship layer for personal AI. Sylla is not the agent's name: each user names and shapes their own agent. Sylla preserves that approved identity, memory, trust, and working context across host LLMs, while evidence-backed social discovery is the first flagship use case.**

You are the lead product engineer for **Sylla**, a Solari internship challenge submission.

Build a credible, testable product that uses personal agents to create one valuable introduction between two people who opted into the same real-world event. Each participant's agent should communicate through brief, natural conversation while maintaining a richer, inspectable research and memory workspace underneath. The project must use Solari as a meaningful part of the user experience, produce an end-to-end working demo, and be suitable for a small live pilot.

The long-term category is **portable relationship infrastructure for personal agents**, not a new chatbot or social application. The primary conversational surface is whichever major LLM the participant already uses, connected to Sylla through an OAuth-authenticated remote MCP service. Start with a ChatGPT plugin, keep the MCP contract portable to Claude, Gemini, Grok, and other capable hosts, and avoid maintaining separate product logic for each provider.

The web application is the durable trust and control center: identity, approved memory, evidence, consent, auditing, introductions, private workspace access, fallback status, export, and deletion. It may provide a reference conversation for demos and recovery, but it should not require participants to abandon their existing AI habit.

Sylla—not any host LLM and not a Solari VM—owns the canonical user and agent identity. The first MCP authorization creates or links a permanent Sylla account and a permanent user-owned agent record. ChatGPT, Claude, Gemini, Grok, the web application, and a future native Sylla application are interchangeable clients of that same agent. A participant who later signs into the native application with a linked identity must recover the same approved memory, relationships, permissions, subscription, work history, and private workspace without migration or reset.

Do not attempt to build every possible personal-agent capability, a generic matchmaking application, social feed, dating application, or speculative global social network. Build the smallest complete social-discovery experiment that proves the broader relationship layer can create a trusted real-world outcome.

## Product hypothesis

> Can a consented personal agent identify one opt-in stranger at an event whom neither person would likely have approached—and produce an introduction both later say was worth having?

The companion trust and retention hypothesis is:

> After a useful introduction, will a participant trust the agent enough to debrief privately, approve what it learned, and ask it to find someone else?

The interaction hypothesis is:

> Will people add a portable social capability to the LLM they already trust, while using an inspectable workspace to review the deeper research, evidence, activity, and memory beneath the conversation?

The product does not claim that AI can determine human compatibility. Each agent forms a limited, revisable opinion from evidence the participant controls. Both agents must independently recommend the introduction, and both humans must explicitly consent.

The agent creates an opportunity for a relationship. The humans create the relationship.

## Product promise

> Social media shows you people you already know. Your agent helps you discover the people you might wish you did.

Supporting product principle:

> Your agent has an opinion. You make the decision.

Interaction principle:

> Conversation is the relationship. The workspace is the evidence.

The emotional product question is:

> Who are you missing?

## Product category and boundary

The product is not another place for people to talk. It gives personal agents a way to discover who may be worth talking to.

An introduction may immediately move to WhatsApp, Telegram, Instagram, email, or any other existing communication habit. Treat that migration as success. The relationship belongs to the humans, not the platform.

The durable system is:

```text
user-named agent in participant's chosen LLM
        ↕ active reasoning and MCP tool calls
OAuth-authenticated Sylla MCP service
        ↕ canonical agent identity, memory, consent, and billing
persistent, pausable Solari Desktop home
        ↕ inspectable research and work artifacts
        ↓
user-reviewed context and memory
        ↓
opt-in discovery network
        ↓
bilateral evaluation and disclosure
        ↓
human consent and introduction
        ↓
user-chosen outcome feedback
```

Expose the core research, memory, discovery, bilateral-evaluation, consent, outcome, and run-control operations through typed server-side interfaces and a remote MCP server. MCP is the primary conversational integration in v1, not a future abstraction. Keep provider-specific packaging thin so the same authenticated service can support multiple LLM hosts.

Treat MCP as the conversational control surface for zero-infrastructure onboarding. After Sylla OAuth, an idempotent bootstrap operation creates or links the agent and prepares its durable workspace metadata. Sylla holds its own server-side Solari credentials and provisions Browser, Sandbox, Desktop, volumes, and snapshots on the participant's behalf. The participant must never need a Solari account or API key.

Sylla is also the customer-facing entitlement and usage boundary. MCP may display plans, estimate an operation, check remaining credits, and initiate a hosted checkout, but payment credentials must never pass through an LLM transcript or MCP tool arguments. A Sylla-controlled billing service and hosted payment page process the transaction; verified webhooks update entitlements before a billable Solari operation may begin. Zero setup means no infrastructure work, not zero authentication, consent, or payment confirmation.

The v1 capability must remain narrowly focused on social discovery rather than pretending to implement Sylla's entire long-term platform. Its job is to let the user's chosen agent understand which human interactions the participant values, research relevant social opportunities, organize evidence, and improve only from memories the participant explicitly approves. Keep the underlying identity, memory, provenance, and run contracts reusable for later non-social capabilities.

## Competitive boundary

Do not position portable agent memory or agent-to-agent matchmaking itself as novel. Active products already market portable AI selves, personal agents that negotiate introductions, one-person recommendations, deep conversational onboarding, and AI matchmaking. Sylla must win on a stronger combined claim:

> The portable relationship layer that lets a person keep their chosen agent across models—and trust it with consequential real-world outcomes.

The social flagship must prove that broader promise through provider-neutral MCP access, participant-approved and portable memory, source-level provenance, an inspectable Solari workspace, directional disclosure, explicit four-way consent, ephemeral private debriefs, and bounded fallback. Avoid competitor language such as destiny, soulmate, universal compatibility, or an always-on agent that silently profiles the world.

## Host-model orchestration and internal fallback

Use the participant's active host LLM as the default reasoning engine. While a ChatGPT, Claude, Gemini, Grok, or other supported conversation is actively orchestrating the task, the host model should observe Solari state, reason, and call fine-grained MCP tools. This deliberately uses the participant's existing host-model allowance for semantic reasoning while Sylla pays for its own storage, network, and Solari execution.

The MCP service cannot withdraw from a participant's ChatGPT or other consumer subscription after the host run ends. Document the compute boundary honestly:

```text
Host-model reasoning and vision during an active or eligible scheduled run
  → participant's host-plan allowance

Solari Browser, Desktop, and Sandbox runtime
  → Sylla's Solari allowance

Internal fallback-model calls
  → Sylla's model allowance
```

Support three explicit execution modes behind one typed run contract:

1. **Host-orchestrated:** the preferred mode. The connected LLM performs semantic reasoning and invokes composable Browser, Desktop, Sandbox, memory, and matchmaking tools.
2. **Deterministic background:** ordinary code handles retries, indexing, hard filters, validation, notifications, and other work that does not require model judgment.
3. **Internal-agent fallback:** a bounded internal agent continues an already-authorized task only when the host orchestration lease is lost, the participant explicitly requests background continuation, or the host cannot complete the task within its active run.

Every long-running task must have an owner lease, heartbeat, checkpoint, idempotency key, approved scope, and budget. One completed MCP request does not by itself mean the host connection was lost. Treat the host as unavailable only after its orchestration lease expires or it explicitly releases the task. The internal agent resumes from the last durable checkpoint and must never race or duplicate work with a returning host.

Fallback is continuity, not expanded authority. It may continue approved read-only research, evidence organization, candidate filtering, and bounded evaluation. It may not approve a memory, widen source access, disclose information, accept an introduction, message another person, or make a human decision. If fallback reaches such a gate, it pauses and asks the participant through the next available surface.

When the host reconnects, return a concise handoff containing completed actions, evidence, costs, uncertainties, pending approvals, and the next safe step. Do not expose hidden reasoning from either orchestrator.

The first implemented fallback milestone must stay narrower than the eventual semantic agent: authorize only `prepare_reconnect_summary`, require the host lease to be absent, charge at most one approved fallback credit, preserve the latest explicit checkpoint, take no consequential action, and commit the checkpoint plus reconnect handoff exactly once in one atomic database operation. This mock task proves lease exclusion, budget enforcement, duplicate-work prevention, and cross-host recovery. Do not describe it as full internal-model continuation until an automatic scheduler and bounded model adapter actually exist.

## Interaction model: conversation in the host, workspace beneath it

Do not make the primary agent experience read like an essay generator. The conversational surface should usually be the participant's existing LLM and should remain brief, warm, and progressive: one recommendation, question, or decision at a time. A participant should be able to act from the concise answer without reading a research report.

From Sylla, the host receives only the MCP tool inputs and results necessary for the current action. Sylla must not silently ingest the participant's entire host chat history. When the host proposes a durable memory, show the exact distilled statement and require explicit approval before saving it.

Place depth in the agent workspace. The workspace may contain:

- Current research tasks and an interruptible activity log
- Source-backed evidence cards and research boards
- A map of opted-in people, communities, interests, and possible introductions
- Match hypotheses with uncertainty and provenance
- Upcoming events, introduction states, and next actions
- A memory ledger separating evidence origin from approval status
- Controls to inspect, correct, approve, forget, export, and delete

Use progressive disclosure. For example, the agent may say:

> I found someone at Thursday's event you may appreciate. You both care about urban gardening but approach community differently. Want the short reason, the evidence, or neither?

The user can continue in the host conversation or open the Sylla workspace to inspect how the agent reached that view. The workspace must expose concise rationale, provenance, run ownership, and fallback activity, never hidden chain-of-thought.

The workspace is an instrument of trust, not a surveillance dashboard. Research must be visible, purpose-limited, and based on participant-approved sources and opted-in people. Do not imply that the agent observes the user's physical computer, private applications, or off-platform relationships.

## Trust and memory philosophy

The difficult product problem is not storing facts. It is earning enough trust that a participant can speak honestly about an introduction while remaining in control of what persists and what is disclosed.

Use this principle:

> Intimacy must be earned, legible, and reversible.

The agent climbs a trust ladder:

1. Inspect only sources the participant approves.
2. Show what it believes and let the participant correct it.
3. Make one useful recommendation.
4. Respect every disclosure boundary.
5. Invite, but never pressure, the participant to reflect privately.
6. Ask permission before turning reflection into memory.
7. Demonstrate improved judgment on a later request.

Do not optimize for longer, more emotional, or more revealing conversations. Trust is measured by comprehension, control, voluntary reflection, memory approval, and repeated use—not disclosure depth or time spent in the application.

## Initial customer and setting

Separate the first engineering cohort from the first intended consumer beachhead.

For the Solari challenge and engineering alpha, assume 8–20 adults attending one AI or technology event. This cohort is useful for debugging agent behavior, Solari execution, source diversity, and consent. Do not mistake positive feedback from technically sophisticated participants for broad product-market evidence.

The first consumer validation cohort should be adults in a social transition—especially people new to a city or people arriving alone at a recurring interest-based event. The initial promise for that cohort is:

> You arrived alone. Leave knowing one person worth seeing again.

Recruit through a bounded organizer or community so there is a dense, explicitly opt-in pool and a safe public meeting setting. Follow the engineering alpha with a mixed, substantially non-technical cohort before claiming that the product generalizes. The application must never scrape an attendee list or silently profile non-participants.

For each experiment, configure a small set of cohort-appropriate intents. A general consumer cohort may use:

- Meet another person who also arrived alone or is new here.
- Meet someone who shares one of my interests but has a different perspective.
- Have a thoughtful conversation rather than ordinary event small talk.
- Find one person I might genuinely want to see again.

The technical alpha may substitute a collaboration-oriented intent. Do not support dating, romance, mentorship, hiring, or open-ended citywide friendship search in v1. Those categories have different objectives and safety requirements. The v1 unit remains one bounded, platonic introduction inside an opted-in event.

## Unit of value and success criteria

The unit of value is:

> One completed introduction that both participants say was worth having.

Track the complete funnel:

1. Participant completes onboarding.
2. Participant approves a context model.
3. Both personal-agent evaluations recommend the introduction.
4. Both humans accept.
5. The meeting happens.
6. Both participants say the conversation was worthwhile.
7. They exchange contact details or plan a second interaction.
8. A participant voluntarily debriefs and approves what the agent may remember.
9. A participant asks the agent to find someone else.
10. The organizer says they would run the experience again.

Before revealing an introduction, ask enough to estimate the counterfactual:

- Did you already know this person?
- Had you previously considered approaching them?
- Without this introduction, would you likely have met during the event?

Do not claim that a relationship “would never have happened.” Report what participants actually said and did.

## End-to-end participant journey

### 1. Invitation and consent

The participant installs or invokes the Sylla plugin, completes Sylla OAuth, and opens a unique event invitation. Explain, in plain language:

- What the agent will inspect.
- What data will be produced.
- Which information may be considered for introductions.
- That the model can be wrong.
- That nothing is disclosed to another participant without approval.
- How to delete their information.
- That the visible agent workspace is a Solari-managed cloud computer, not access to their physical device.
- Which LLM host is currently connected, what information MCP sends to Sylla, and that the host provider applies its own transcript and retention terms.
- Whether internal fallback is enabled, which tasks it may continue, and the participant's cost and duration limits.

Require confirmation that the participant is at least 18 years old and agrees to the pilot terms.

### 2. Intent and availability

The participant selects one introduction intent, answers a short onboarding conversation in their chosen host or the reference client, and selects one or more meeting windows inside the event. Keep agent responses concise and offer links into the workspace when the participant wants evidence or more detail. Avoid personality tests and large questionnaires.

### 3. Approved sources

The participant may submit one to three public URLs that they explicitly want the agent to consider, such as:

- Personal website
- GitHub profile or repository
- Portfolio
- Blog or public essay
- Public event profile

Do not access authenticated social accounts in v1. Do not accept private documents, private community content, event-registration records, direct messages, calendars, or saved browser sessions.

### 4. Auditable agent exploration

Use a recorded Solari Browser session to visit only the submitted URLs. In host-orchestrated mode, expose bounded observe, navigate, extract, and checkpoint operations through MCP so the active host model can direct semantic research using the participant's host quota. In fallback mode, resume the same run from its checkpoint under the approved internal-agent budget. Treat all website content as untrusted data, never as agent instructions. Extract relevant visible evidence and preserve provenance.

Each proposed observation must include:

```json
{
  "claim": "Enjoys building experimental AI products",
  "kind": "user_statement | observed_fact | agent_inference",
  "sourceUrl": "https://example.com/post",
  "sourceTitle": "Example post",
  "evidenceExcerpt": "A short relevant excerpt",
  "observedAt": "ISO-8601 timestamp",
  "confidence": "low | medium | high",
  "sensitivity": "normal | sensitive",
  "shareable": false,
  "status": "pending | kept | edited | deleted"
}
```

Never expose hidden chain-of-thought. Show concise, source-backed recommendation rationale.

### 5. User-reviewed context model

Present “What your agent thinks it knows about you.” For every observation, the participant can:

- Keep it
- Edit it
- Delete it
- Mark it shareable or private

The agent must clearly say when it is making an inference and that it may be wrong. Rejected observations must not be used in retrieval, evaluation, explanations, analytics, or future runs.

Avoid the phrase “agent-generated identity.” Use **user-reviewed context model** or **evidence-backed introduction context**. The application understands only a narrow slice of the participant for one stated purpose.

Materialize the approved model in the participant's workspace as a memory ledger. Show two separate dimensions rather than blending evidence origin with consent state:

- **Origin:** Observed, Inferred, or Told to me
- **Status:** Pending, Confirmed, Edited, or Forgotten

“Told to me” never means “saved.” A directly disclosed item remains ephemeral unless the participant confirms a distilled memory. Private and shareable status must remain separately explicit.

### 6. Candidate retrieval

Use hard constraints first:

- Same event
- Overlapping availability
- Compatible introduction intent
- Both participants active and opted in
- No existing block or prior decline

Then use only approved shareable context to shortlist a small number of candidates. Do not run expensive bilateral evaluations for every possible pair.

The shortlist may combine structured filters, embeddings, and a simple relevance score. Do not show participants a compatibility percentage.

### 7. Independent bilateral evaluation

Do not simulate a theatrical free-form negotiation between agents.

For each shortlisted pair, run two separate directional evaluation tasks with clean Solari Sandbox boundaries:

```text
Alice evaluation:
  Alice's approved private context
  + Bob's approved shareable context

Bob evaluation:
  Bob's approved private context
  + Alice's approved shareable context
```

Each job returns a validated structured result:

```json
{
  "recommend": true,
  "rationale": [
    {
      "statement": "Their different approaches to the same problem could produce a useful conversation.",
      "supportingObservationIds": ["obs_123", "obs_456"]
    }
  ],
  "requestedDisclosureObservationIds": ["obs_123"],
  "uncertainty": "medium",
  "caution": "They may want different levels of technical depth."
}
```

Prefer the participant's active host model as the semantic evaluator. The Sandbox prepares and validates the minimal directional packet, the host returns the structured judgment through MCP, and the Sandbox or policy layer validates observation references and disclosure boundaries. If the host lease expires after the participant authorized continuation, the internal fallback agent may complete that one directional evaluation inside the same bounded job and record `fallbackReason`, model provider, cost, and checkpoint provenance.

The two jobs must not share private context with each other. A participant's host must never receive the other participant's private model. Solari provides clean workload isolation; the application remains responsible for data minimization, authorization, encryption, logging, retention, and disclosure policy. Do not describe Solari sandboxes as a cryptographic privacy guarantee.

### 8. Disclosure and human consent

An introduction can proceed only when:

1. Both directional evaluations recommend it.
2. Each participant approves the exact facts and rationale that may be shown.
3. Each participant accepts the introduction.

Until both accept, do not reveal names, contact information, private URLs, or identifying details beyond the explicitly approved introduction preview.

### 9. Meeting

After mutual consent, reveal the participants and assign or suggest a 20–30 minute meeting inside a designated public area and time window at the event. Do not autonomously send external messages, make reservations, or access calendars in v1.

### 10. Follow-up

After the meeting, invite the participant to debrief. Offer three clear choices:

- Quick reflection
- Talk it through privately
- Skip

Before any debrief, state:

> Nothing you send to Sylla will be shown to the other participant or the organizer. Sylla will not store the raw reflection, and nothing becomes personal memory unless you approve it. If you debrief in your existing AI chat, that host may retain the conversation under its own terms.

Only make this promise if the implementation enforces it. Disclose which host or fallback model processes the conversation and do not imply end-to-end confidentiality that the system does not provide. The MCP server should receive only the structured outcome fields and proposed memories that the host intentionally submits, not the host's full transcript.

Ask human, non-judgmental questions such as:

- Did the meeting happen?
- How did you feel afterward—energized, neutral, or drained?
- What surprised you?
- What made the conversation work or not work?
- Would you meet this person again?
- Did you exchange contact information?
- Did you arrange another interaction?
- What should your agent understand better before introducing you to someone else?

Separate four data layers:

```text
Private debrief
  Raw, ephemeral reflection. Never shared.

Proposed memory
  A concise learning about the participant, awaiting approval.

Approved personal memory
  Kept for future recommendations; private by default.

Outcome event
  Minimal structured facts such as meeting completed or second interaction planned.
```

The agent may propose zero to three memories after a debrief. The participant can Keep, Edit, or Forget each one. Nothing becomes durable personal memory without explicit approval.

Learn about the participant rather than storing gossip about the other person. If Alice says, “Bob was arrogant,” do not store that as a claim about Bob. The agent may propose a private learning such as, “You prefer balanced conversations over status-heavy ones,” and Alice must approve or correct it.

Never relay one participant's private debrief to the other participant. Never expose it to the organizer. Do not use raw debrief content for candidate retrieval, matching, analytics, model training, or public proof.

Raw debrief content received by Sylla must not be written to the application database, analytics, audit logs, browser recordings, Solari Desktop, or Solari jobs. Process it ephemerally, then discard it after the participant finishes reviewing proposed memories. A transcript retained by the participant's chosen LLM host is outside Sylla's storage boundary and must be disclosed rather than falsely described as ephemeral. Prefer model-provider configurations that do not retain inputs where available, and document the actual provider behavior honestly.

Finish by asking:

> Would you like me to find someone else for you?

This is the first retention test for the personal-agent relationship.

## Solari's role

Use Solari as the execution and audit layer, not as a decorative dependency or an unsupported privacy claim.

```text
participant's chosen LLM
   ↕ active reasoning under the participant's host quota
OAuth-authenticated MCP service ───── durable approved data
   ├─ Solari Browser  → auditable public-source evidence
   ├─ Solari Desktop  ↔ visible, interruptible agent workspace
   └─ Solari Sandbox  → isolated directional packets and fallback evaluations
                 ↕
bounded internal agent only when the host lease is unavailable
```

The application policy layer authorizes every input and persistence decision. Solari supplies execution environments; it does not decide what the agent may inspect, remember, or disclose.

### Solari Browser

Use `@solarisdk/browser` to:

- Navigate participant-approved public sources.
- Expose composable observe, navigate, extract, cancel, and checkpoint tools so the active host model can remain the default research brain.
- Handle heterogeneous dynamic web pages.
- Record the exploration session for audit and demonstration.
- Produce evidence with URLs, titles, excerpts, and timestamps.
- Close every session reliably, including error paths.
- Resume an incomplete run under the internal fallback agent only after the host lease expires and the participant's continuation policy permits it.

Do not use persistent browser profiles in v1 because the pilot uses only public sources. Do not expose replay URLs publicly. Replays may contain more information than the participant-facing evidence view and must have restricted access and a retention policy.

### Solari Sandbox

Use `@solarisdk/sandbox` to:

- Prepare and validate directional personal-agent evaluations in clean, disposable microVM jobs.
- Accept a structured directional judgment from the active host model when available.
- Run the internal semantic evaluator only as a bounded fallback when no host lease remains.
- Start jobs from a prepared snapshot when useful.
- Pass each job only the minimum inputs it needs.
- Validate structured output before accepting it.
- Destroy or safely pause jobs after completion.
- Prevent accidental state reuse between different participants.

The application—not Solari—enforces which observations are private, shareable, requested for disclosure, and finally disclosed.

Never send a raw private debrief into Solari Browser, Sandbox, replay, or persistent volume. Future directional evaluations may receive only approved distilled personal memories that are relevant to the participant's current intent.

### Solari Desktop

Use `@solarisdk/desktop` to provide the agent's private, visible workbench. This is a real product primitive, not an SDK showcase.

Use Desktop to:

- Give each activated agent a persistent private home that survives individual host conversations and can later be opened from the native Sylla application.
- Materialize a participant workspace from approved application data.
- Organize research artifacts, evidence boards, introduction hypotheses, and the memory ledger.
- Carry out visible multi-step research across graphical applications when a task genuinely benefits from a full computer, while recording source-backed artifacts rather than hidden reasoning.
- Let the participant watch the agent work, inspect its current task, and interrupt or take over when appropriate.
- Let the active host model observe and operate the workspace through narrow MCP tools, using compressed screen state or selected screenshots rather than streaming every frame into model context.
- Persist checkpoints and transfer the run lease safely to the internal agent if host orchestration is lost and background continuation is authorized.
- Open source material and supporting applications when a full graphical environment is useful.
- Produce screenshots or a sanitized live view for the challenge demo.
- Mount a participant-specific durable volume for approved files, research artifacts, journals, and user-visible work history.
- Pause the VM when idle, reconnect to the same workspace during the pilot, and take snapshots at meaningful recovery points.

Persistent state does not mean continuously running compute. The canonical agent identity, approved structured memory, permissions, provenance, relationships, billing, and resource mappings remain in the application database. The durable Solari volume is the agent's user-visible home, while snapshots preserve recoverable machine state and the paused Desktop preserves continuity between active runs. A workspace must still be reconstructible from approved records and its volume so deletion, retention, authorization, recovery, and provider migration do not depend on one running VM. Resume Desktops on demand, pause them when idle, and destroy the VM and retained storage when the participant withdraws or the retention period ends.

Treat the desktop stream URL, session identifier, files, screenshots, and activity history as sensitive. Provide participant-only access through a narrowly scoped server-mediated mechanism. Never expose one participant's workspace to another participant or the organizer.

Do not claim that Solari Desktop can inspect the participant's actual Mac or Windows computer. The v1 workspace is a Solari-managed cloud Linux computer. Native access to local applications would require a separate, explicit, revocable connector and is out of scope.

Never place raw debrief text, unapproved proposed memories, model hidden reasoning, or unapproved third-party dossiers in the Desktop. The workspace may show approved memories and purpose-limited evidence about opted-in candidates only.

Use Solari Browser as the default acquisition path for submitted public URLs because it provides a clean recorded run. Use Desktop when the work benefits from a stateful visual environment, multiple applications, user observation, or takeover. Do not duplicate the same action across products merely to increase SDK usage.

## Technical defaults

Unless the existing repository requires something else, use:

- TypeScript throughout
- Next.js App Router for the web application
- A relational database with migrations
- A public remote MCP server as the primary agent interface
- OAuth 2.1 with narrowly scoped per-participant authorization for MCP clients
- A canonical Sylla user identifier and agent identifier that never depend on a host-provider account identifier
- Linked authentication identities so MCP hosts, the web control center, and a future native app resolve to the same agent
- Thin host packages, beginning with a ChatGPT plugin, over one provider-neutral MCP contract
- Runtime validation for every AI-generated structure
- Server-only Solari and model-provider credentials
- Invite-token event access layered on authenticated participant identity
- A small provider interface around the internal fallback model; the connected host model does not require or reveal its API key to Sylla
- Run leases, heartbeats, checkpoints, idempotency, and bounded fallback budgets for all long-running tasks
- Mock Solari and model adapters for deterministic automated tests
- A live integration mode behind environment variables
- A Sylla-owned entitlement, usage-ledger, and budget layer in front of all billable Solari creation
- Hosted checkout and verified billing webhooks; never collect payment credentials through MCP

Required environment variables should be documented in `.env.example`, including at minimum:

```text
SOLARI_API_KEY=
MODEL_API_KEY= # internal fallback only
DATABASE_URL=
APP_BASE_URL=
```

Never commit secrets. Never expose Solari session identifiers, sandbox identifiers, replay URLs, or provider keys to the browser unless a narrowly scoped server endpoint requires it.

## Core data model

Design a minimal relational model around these concepts:

- Sylla user
- User-owned personal agent
- Linked authentication identity
- Host connection
- Subscription and entitlement
- Usage ledger and spend budget
- Solari resource lease, durable volume, and snapshot mapping
- Event
- Organizer
- Participant
- External agent connection
- OAuth grant and revocation state
- Invitation
- Participant intent
- Availability window
- Approved source
- Browser exploration run
- Observation
- Context-model approval
- Agent workspace
- Workspace research task
- Workspace artifact
- Agent activity event
- Agent run
- Orchestration lease and heartbeat
- Run checkpoint and handoff
- Fallback policy, reason, and budget usage
- Private debrief session state without persisted raw content
- Proposed memory
- Approved personal memory
- Shareable context envelope
- Candidate shortlist
- Directional evaluation
- Disclosure request
- Introduction
- Human consent
- Meeting assignment
- Outcome event
- Repeat-introduction request
- Audit event

Store identifiers and structured states rather than raw hidden model reasoning. Make every transition auditable.

## Trust and safety requirements

- Participants must be 18 or older.
- The candidate pool must be explicitly opt-in.
- Validate submitted URLs and block private-network, local, non-HTTP, and unsafe targets.
- Treat browsed content as untrusted and defend against prompt injection.
- Make active research visible and interruptible; do not silently monitor the participant's physical computer or private applications.
- Disclose which host LLM is active, what MCP transmits, and which provider's retention terms apply to the host conversation.
- Never claim that Sylla can spend a participant's consumer LLM quota after the host or eligible scheduled run has ended.
- Require explicit opt-in and a bounded budget before an internal agent may continue background work.
- Prevent host and fallback orchestrators from holding the same active lease or duplicating a side effect.
- Treat reconnection as a handoff: show what fallback completed, what it cost, and what still requires human approval.
- Do not infer or optimize on protected or highly sensitive traits.
- Do not collect relationship status, health, religion, sexuality, political affiliation, or similarly sensitive information for v1.
- Do not rank people by attractiveness, popularity, prestige, follower count, or wealth.
- Provide edit, withdrawal, block, decline, and deletion controls.
- Let participants export their approved context and approved personal memories in a simple machine-readable format.
- A decline must not disclose which party declined.
- Keep meetings in a designated public event setting.
- Do not auto-message, impersonate, or make commitments for participants.
- Minimize logs and establish a short pilot-data retention policy.
- Keep private debriefs ephemeral and proposed memories uncommitted until explicit approval.
- Keep raw debriefs and unapproved proposed memories out of Solari Desktop files, screenshots, activity logs, and streams.
- Never relay private reflections or judgments between participants.
- Do not infer facts about the other participant from one person's debrief.
- Do not optimize for emotional disclosure, conversation length, or dependency on the agent.
- Suppress or coarsen organizer metrics when a small cohort could make private behavior identifiable.
- Comply with the terms and policies of every website accessed.

## Organizer experience

Provide a minimal organizer dashboard that can:

- Create an event and meeting windows.
- Generate participant invitation links.
- See aggregate funnel counts.
- See operational failures requiring attention.
- Trigger or monitor the matching run.
- Assign a designated public meeting area.
- Export anonymized pilot results.

The organizer must not see participants' private observations, private evaluation inputs, debrief content, or personal memories. Aggregate metrics must not make individual behavior inferable in a small cohort.

## Participant-facing screens

Prioritize these screens:

1. Plugin discovery, Sylla OAuth, and connector permissions
2. Invitation and consent
3. Intent and availability
4. Concise conversation in the chosen host
5. Approved-source submission
6. Agent activity, run owner, and fallback status
7. Agent workspace overview
8. Evidence board and context-model review
9. Memory ledger
10. Ready-for-introduction state
11. Introduction preview and disclosure approval
12. Accept or decline
13. Mutual introduction and meeting details
14. Private debrief choice with host-retention disclosure
15. Proposed-memory review
16. Find-another request
17. Export, disconnect, withdraw, and delete data

The experience should feel calm, human, and transparent. Avoid swipe mechanics, feeds, scores, gamification, anthropomorphic agent theatre, and exaggerated claims about understanding a person.

## Non-goals

Do not build:

- A global social network
- Dating or romance features
- A content feed or direct-message system
- An in-product destination for maintaining human relationships
- Autonomous outreach
- Private-account scraping
- Calendar or email integrations
- Native mobile applications
- Payment-card collection inside MCP or a model transcript
- Separate business logic or separate social graphs for every LLM provider
- An internal LLM that runs by default while an authorized host model is available
- A standalone ChatGPT replacement or pre-named emotional-companion application; Sylla strengthens the user's chosen agent instead
- Passive monitoring of messages, contacts, calendars, or relationships
- Unconsented access to or recording of the user's physical computer
- Claims that the agent knows what happened after a relationship leaves the product
- Model training or a purported defensibility moat
- A compatibility percentage
- Raw chain-of-thought display
- Treating a Solari Desktop filesystem as the sole durable copy of user data
- Complex organizer CRM functionality

## Verification and definition of done

The project is not complete until the following can be demonstrated end to end:

1. A participant connects from at least one major host LLM through OAuth-authenticated MCP and can revoke the connection.
2. The same participant signs into a second host or reference client and receives the same canonical agent identity and approved state; a simulated future-native-app login resolves identically.
3. An organizer creates an event and participant invitations.
4. Two or more participants complete consent, intent, availability, and source submission.
5. During an active host response, the host model observes and directs a live Solari Browser or Desktop through composable MCP tools, demonstrating that host quota supplies the semantic reasoning.
6. A live Solari Browser visits approved sources and produces source-backed observations.
7. A participant edits or deletes an incorrect observation, and it disappears from all downstream inputs.
8. A participant opens a live Solari Desktop workspace, inspects the agent's current task and evidence, and can interrupt or leave it without losing approved state.
9. An unfinished host-orchestrated task survives a simulated connection loss: its lease expires, the bounded internal agent resumes from the checkpoint without duplicate actions, and the returning host receives an auditable handoff.
10. Workspace artifacts can be reconstructed from the application database, and participant withdrawal destroys the Desktop without orphaning the only copy of approved data.
11. Candidate shortlisting respects event, consent, availability, and disclosure constraints.
12. Two clean Solari Sandbox jobs produce validated directional evaluations, using host reasoning when available and the internal model only for the explicitly demonstrated fallback path.
13. The system does not reveal an introduction unless both evaluations recommend it and both humans consent.
14. The resulting rationale cites only approved observations.
15. Participants receive a public event meeting window and location.
16. Follow-up captures whether the meeting happened, was worthwhile, and led to a second action.
17. A participant can choose a private debrief, understand the host transcript boundary, review proposed memories, and reject all Sylla persistence.
18. Raw debrief content received by Sylla is absent from the database, analytics, audit logs, replays, Solari Desktop, and Solari jobs.
19. Only explicitly approved personal memories can influence a later introduction.
20. The system asks whether the participant wants another introduction and records the request without requiring them to remain in an in-product social channel.
21. Export, connector revocation, withdrawal, and deletion work across approved context, memory, and workspace artifacts.
22. Browser sessions close, Desktop VMs pause or terminate as intended, and Sandbox jobs terminate on success and failure paths.
23. Automated tests cover OAuth authorization, run leases, checkpoint handoff, duplicate-work prevention, state transitions, workspace isolation, deleted-observation exclusion, bilateral gating, memory approval, ephemeral debrief handling, output validation, and failure cleanup.
24. A live smoke test exercises the MCP connection plus Browser, Desktop, and Sandbox with real credentials when present.

## Public proof required for the challenge

The final submission must include:

- A public GitHub repository with clear setup instructions.
- An architecture explanation showing exactly why Browser, Desktop, and Sandbox are used.
- A demonstration of a host LLM directing Solari through MCP, plus one deliberate connection-loss handoff to the internal fallback agent.
- A short end-to-end demonstration video.
- A browser replay and sanitized Desktop workspace excerpt that contain no sensitive data.
- Real pilot results clearly separated from hypothetical examples.
- Participant reactions used only with permission.
- Honest limitations, safety decisions, and next experiments.
- A clear explanation that relationships are expected to continue outside the product.
- A public LinkedIn or X build post tagging the requested Solari/Pinetree accounts.

Do not fabricate users, testimonials, meetings, conversion numbers, or claims of product-market fit.

## Working method

Before implementation:

1. Inspect the repository and preserve any existing work.
2. Convert this prompt into a concise implementation plan.
3. Identify the smallest vertical slice that proves host-model orchestration, safe fallback continuity, and the end-to-end introduction mechanism.
4. Build that slice before adding visual polish or secondary organizer features.
5. Keep mock and live integrations behind the same typed interfaces.
6. Verify each milestone with tests and a runnable demo.
7. Record assumptions and deviations in the README.

When forced to choose, prioritize a real completed introduction, earned trust, participant control, provenance, and reliable cleanup over breadth.
