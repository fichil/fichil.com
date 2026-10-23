---
title: "Prove Message-Automation Safety Offline Before Touching a Live Client"
date: 2026-10-23
publication_date: 2026-10-23
slug: "offline-mock-safety-harness-before-live-automation"
draft: false
tags: ["automation", "testing", "python", "safety", "architecture"]
categories: ["Engineering"]
description: "Use a mock adapter, trusted policy, durable action state, and fault-injection tests to verify stop conditions before connecting message automation to a live client."
ai:
  schema_version: 1
  problem: "A message-automation design needed executable evidence for authorization and stop conditions before any real client integration."
  symptoms:
    - "The proposed system had more responsibilities than the first completed implementation could verify."
    - "A live-client test would combine policy behavior, interface timing, account state, and real external effects."
  evidence:
    - "A completed offline milestone implemented domain models, a mock adapter, policy, application orchestration, and SQLite deduplication state."
    - "Thirty-six unit tests passed with network socket creation blocked."
    - "Tests covered target mismatch, existing drafts, duplicate events, own messages, disconnects, injected timeouts, and uncertain action results."
    - "The default CLI mode was read-only; explicitly selected dry-run validated an action without submitting it."
  root_cause: "The design needed a small executable boundary that separated observed message data, trusted authorization, action attempts, and recorded outcomes."
  resolution_steps:
    - "Define separate contracts for message events, action requests, observed target state, and action results."
    - "Keep polling separate from execution so reading an event does not automatically schedule a reply."
    - "Check trusted policy and current target state before allowing an action."
    - "Persist an action claim before submission, then recheck target, draft, and pause state."
    - "Exercise the assembled path with a mock adapter and synthetic data."
  verification:
    - "Rejected preflight cases made zero submission calls."
    - "A recorded unknown result survived reopening the state store and prevented resubmission of the same request."
    - "Message text could not change the configured allowlist or operating mode."
    - "Explicit dry-run returned zero mock submissions even with an eligible synthetic event."
  limitations:
    - "No model provider, automatic reply generation, or conversational memory was implemented in this milestone."
    - "Timeouts were injected in tests; real UI hard deadlines and cancellation were not implemented."
    - "Mock confirmation did not prove real-client compatibility or recipient delivery."
    - "Deduplication state was not a reliable-consumption queue; deleting it would lose replay protection."
  applies_to:
    - "message or form automation that needs an offline safety milestone"
    - "agent tools with separate observation and action boundaries"
  keywords: ["mock adapter", "offline testing", "authorization policy", "action state", "dry run"]
---

A desktop message-automation design can look simple: observe a conversation and perform an action. The risky behavior sits between those steps. A selected target can change, a draft can appear, or an adapter can lose confirmation after a submission attempt.

One completed implementation addressed those risks with a deliberately small offline milestone. It used synthetic messages, a mock adapter, trusted policy, and persistent action state. Thirty-six unit tests passed with network socket creation blocked. No real client, model API, or automatic reply generator participated.

That scope matters. The evidence supports the assembled observation and action boundaries. A broader architecture diagram does not turn planned provider or conversational-memory layers into tested capabilities.

## Make the smallest complete flow executable

The implementation separated five responsibilities:

| Part | Implemented responsibility |
|---|---|
| Domain models | Describe targets, messages, action requests, observed state, and outcomes |
| Mock adapter | Supply synthetic observations and simulate submission and confirmation |
| Policy | Validate trusted targets, operating mode, operation type, and text length |
| State store | Record event deduplication and action identity/outcomes in SQLite |
| Application | Coordinate checks, pause behavior, attempts, and verification |

The state store was operational state, not conversational memory. Model providers and reply generation remained future work.

Polling and execution were separate application operations. Polling filtered duplicate events and the account's own messages, but did not schedule replies. An action required a separately constructed request. This gave tests a concrete boundary at which to inspect authorization without involving a model or a real conversation.

## Keep message text outside authorization

Trusted configuration supplied the target allowlist and operating mode. Adapter observations supplied connection state, target identity, and whether a draft existed. Received text stayed message data.

One test supplied text asking to allow every conversation, switch to live mode, and run commands. The configured allowlist and read-only mode remained unchanged. The application did not treat that text as permission to act.

The prototype offered three modes:

- **Read-only**, the default: polling could inspect allowed synthetic events; an action request was denied.
- **Dry-run**, explicitly selected: policy and current target checks ran, but submission did not occur and the action request ID was not consumed.
- **Mock**, explicitly selected: the bundled simulated adapter could exercise an in-memory submission and confirmation path. There was no live execution mode.

The CLI used fixed synthetic events and a fixed action request. Its dry-run result of zero mock submissions demonstrated mode enforcement with an eligible event present. It was not evidence of an empty-input startup path.

## Check the boundary, not only the return value

Preflight checks rejected an unauthorized or mismatched target, an existing draft, a disconnected adapter, or uncertain identity. Tests asserted both the returned reason and the absence of submission calls.

For an allowed mock action, the application persisted a claim before invoking the adapter. It then checked target, draft, and pause state again. The mock adapter also rechecked target and draft at its submission boundary. Tests changed these observations between checks to verify that the later check still stopped the action.

This sequencing produced a useful test surface: arrange a state change, run the application, then inspect calls and stored outcomes. A reassuring return value alone would not prove that an earlier side effect had been prevented.

## Record uncertainty without inventing a retry

Action outcomes distinguished an attempt from simulated UI confirmation, known failure, and an unknown result. An injected submission timeout or incomplete confirmation became unknown.

The state store recorded action identity and outcome. Repeating the same request returned the recorded result instead of submitting again. Tests also reopened the SQLite store and verified that an unknown result survived the restart without another submission. Reusing a request ID with a different payload or target was rejected.

These checks establish behavior for the tested request identities and local store. Event deduplication is a separate concern: an event was marked seen before being handed to the caller, so the milestone did not guarantee successful downstream consumption. Clearing the store would also remove the history needed to suppress replays.

## State exactly what the tests proved

The suite covered target and draft protection, duplicate and own-message filtering, pause behavior, disconnects, injected exceptions, persistence reopening, and CLI modes. Rejected preflight cases asserted zero adapter submissions; there were no provider-call assertions because no provider existed.

Timeout tests raised `TimeoutError` at controlled points. They verified the application's response to that exception. The synchronous prototype did not impose hard deadlines on real UI calls or implement cancellation. Those remain requirements for a future real adapter.

The evidence also stopped short of live-client compatibility and recipient delivery. Even a future UI confirmation would need to be recorded separately from proof that another person received a message. Live accounts, real writes, and transmission of conversation data to a model service require their own authorized tests.

The reusable lesson is to build an executable safety boundary before connecting external systems, then keep the completion claim as small as the evidence. A mock adapter can expose policy and sequencing defects early. It cannot certify integrations that have not been implemented or exercised.
