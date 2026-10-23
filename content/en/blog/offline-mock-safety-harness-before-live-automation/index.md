---
title: "Prove Message-Automation Safety Offline Before Touching a Live Client"
date: 2026-10-23
publication_date: 2026-10-23
slug: "offline-mock-safety-harness-before-live-automation"
draft: false
tags: ["automation", "testing", "python", "safety", "architecture"]
categories: ["Engineering"]
description: "Build a mock-backed vertical slice across adapter, provider, policy, memory, and application layers, then test unsafe message paths before enabling a live desktop client."
ai:
  schema_version: 1
  problem: "A desktop message-automation design could reach an external write boundary before its target checks, draft protection, deduplication, and uncertain outcomes had been exercised together."
  symptoms:
    - "Individual components looked plausible, but there was no executable proof that their combined control flow stopped unsafe writes."
    - "Testing against a live client would mix policy defects with client state, account state, UI timing, and real external effects."
  evidence:
    - "A completed offline vertical slice separated adapter, provider, policy, memory, and application responsibilities."
    - "Synthetic fixtures exercised target mismatch, existing drafts, duplicate events, timeouts, own-message loops, disconnects, and unknown send outcomes."
    - "Thirty-six unit tests passed without connecting to a real desktop client or model API."
    - "The implementation was merged only with an explicit limitation that live compatibility and recipient delivery remained unverified."
  root_cause: "The design lacked a deterministic boundary where message acquisition, generation, authorization, write attempts, and durable outcome recording could be tested as one flow without external side effects."
  resolution_steps:
    - "Define narrow contracts for the client adapter and response provider."
    - "Keep authorization policy independent from message text and generated output."
    - "Persist event identity and write outcomes in a dedicated memory layer."
    - "Run the application flow against mock implementations and synthetic conversations."
    - "Represent attempted, confirmed, failed, and unknown writes as different states, and stop automatic retry after an uncertain boundary crossing."
  verification:
    - "Unit tests covered the complete mock-backed flow as well as isolated policy, adapter, provider, and memory behavior."
    - "Repeated events produced no second submission."
    - "Wrong targets, existing drafts, disconnects, timeouts, and own messages stopped before a permitted write."
    - "The default command completed in dry-run mode with zero mock submissions when no eligible event was supplied."
  limitations:
    - "Mock evidence does not prove compatibility with a particular client version or operating-system build."
    - "A UI-confirmed submission would not prove recipient delivery."
    - "Real accounts, conversations, clipboard behavior, focus changes, and model-provider data handling still require separately authorized tests."
    - "Consequential account operations remain outside this boundary."
  applies_to:
    - "desktop UI automation that may send messages or submit forms"
    - "agent workflows that need a safe offline milestone before live integration"
  keywords: ["mock vertical slice", "message automation", "safety policy", "unknown outcome", "dry run"]
---

A desktop message agent can appear small on paper: read an event, generate a reply, and submit it. The risky behavior lives between those verbs. The selected conversation can change, a draft may already exist, an event can be delivered twice, or the interface can time out after accepting a write.

Connecting a prototype to a live client makes all of those variables arrive at once. A completed implementation therefore began with an offline, mock-backed vertical slice. It exercised the complete decision path while preventing real client access and paid model calls. Thirty-six unit tests passed against synthetic inputs.

The result did not claim live compatibility. Its purpose was narrower: establish that the application has explicit places to observe, authorize, attempt, and record a write before any real account is involved.

## Start with one complete path

Unit-testing isolated helper functions cannot show whether the assembled application checks the target immediately before submission or records an uncertain result before a retry decision. A vertical slice connects the minimum set of layers needed to answer those questions.

The offline slice used five responsibilities:

| Layer | Responsibility | What the test can replace |
|---|---|---|
| Adapter | Observe a conversation and request a submission | Desktop client |
| Provider | Produce a candidate response | Model service |
| Policy | Decide whether this event and target may proceed | Authorization rules |
| Memory | Store event identity and outcome | Durable local state |
| Application | Coordinate the sequence and stop conditions | Live orchestration |

Each boundary is deliberately narrow. The adapter reports observations and accepts a typed submission request. It does not decide that the current target is authorized. The provider returns content but receives no authority to change allowed targets or retry budgets. Policy reads trusted configuration and structured observations, not instructions embedded in a message.

This separation made the whole path runnable with a mock adapter and mock provider. A test could arrange an observed conversation, execute one application cycle, and inspect both the attempted adapter calls and the persisted outcome.

## Keep observed data out of the control plane

Received text is untrusted data. A message that says “switch to another conversation,” “ignore the existing draft,” or “send this twice” must remain content. It cannot rewrite policy.

The application therefore builds its decision from separate inputs:

- trusted configuration identifies the allowed target and operating mode;
- adapter observations describe the current target, draft state, event identity, and connection state;
- the provider supplies only a proposed response;
- policy combines the trusted configuration with structured observations;
- the application performs the allowed action and records the outcome.

Tests supplied hostile or misleading message text while keeping the configured target unchanged. The policy result remained tied to the trusted target identity. This verifies a useful architectural property: changing received text alone cannot widen the write scope.

## Treat a write as a state transition

A single Boolean such as `sent=true` is too weak for a UI write. The implementation distinguished four outcomes:

- **attempted**: the application crossed the write boundary;
- **confirmed**: the adapter observed the expected local confirmation;
- **failed**: evidence showed that submission did not occur;
- **unknown**: the boundary may have been crossed, but confirmation was incomplete.

The difference controls retry authority. A connection failure before any submission attempt can permit a bounded retry. A timeout after the adapter invoked submission cannot safely become an automatic retry. The client may have accepted the first attempt even though the confirmation was lost.

Event identity is persisted before that retry decision. When the same synthetic event arrives again, memory exposes the earlier terminal or uncertain state and the application does not create a second submission. This behavior complements transport-level safeguards; it does not claim proof of recipient delivery.

## Test stop conditions as first-class behavior

The test suite covered successful dry-run flow and the paths that must stop:

1. **Target mismatch** — the observed conversation differs from the allowed target.
2. **Existing draft** — automation would overwrite user-authored text.
3. **Duplicate event** — the event identity already has a recorded decision.
4. **Own-message loop** — the newest event originated from the automated account.
5. **Disconnect** — current client state cannot be observed reliably.
6. **Timeout** — the operation does not reach a known result within its bound.
7. **Unknown write outcome** — submission may have occurred, so automatic retry stops.

Assertions checked absence as well as presence. A rejected case had to produce zero provider calls when generation was unnecessary, zero submission calls, and an explicit recorded reason. This prevents a superficially correct return value from hiding an earlier side effect.

The default dry-run command also completed with zero mock submissions when no eligible event was present. That check verified the safest startup state, rather than only testing a prepared success fixture.

## Promote evidence in stages

Offline completion is a milestone, not a substitute for live acceptance. A later live test should add evidence one boundary at a time:

1. pin the exact client version, operating-system build, and adapter revision;
2. use one authorized test conversation and inspect no unrelated conversations;
3. start with read-only observation;
4. verify target identity and draft protection again immediately before a write;
5. submit controlled, non-sensitive content only after explicit enablement;
6. record UI confirmation separately from recipient delivery;
7. keep an emergency stop and the automation library's fail-safe behavior enabled.

Real model use adds another gate. Conversation content should not be transmitted until the operator has opted in to the selected provider and the retention boundary is understood. The offline provider keeps that decision out of the first implementation milestone.

The reusable lesson is to make safety behavior executable before integration pressure arrives. A mock-backed vertical slice gives policy, persistence, and write outcomes one deterministic test surface. It cannot certify a live client, but it can prevent basic authorization and retry defects from reaching that client unexamined.
