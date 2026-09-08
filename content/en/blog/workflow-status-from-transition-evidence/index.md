---
title: "Deriving Workflow Status from Real Transition Evidence"
date: 2026-09-08
publication_date: 2026-09-08
slug: "workflow-status-from-transition-evidence"
draft: false
tags: ["workflow", "oracle", "state-machine", "reporting", "idempotency", "verification"]
categories: ["Backend"]
description: "Repair a workflow report that advances too early by filtering invalid events, normalizing legacy stages, recovering from business evidence, and recording milestones only when transitions occur."
ai:
  schema_version: 1
  problem: "An operations report showed orders in later workflow stages even though the corresponding business activity had not started."
  symptoms:
    - "Completed receiving could appear as unloading or inspection before either activity had valid start evidence."
    - "Shipped orders could remain labelled as a verification stage because an older event code was interpreted with a newer mapping."
    - "Detail pages, summary tabs, elapsed-time calculations, and exception counts could disagree because each query reconstructed current state separately."
  evidence:
    - "Read-only database inspection found event rows with missing timestamps, next-stage placeholders written at the prior stage's completion time, and legacy codes whose current meaning had changed."
    - "Business records supplied independent evidence for actual receipt, inspection, and shipment activity when the event stream was incomplete."
    - "Source tracing found one producer that created an inspection-start milestone during receipt completion, before inspection had begun."
    - "After the repair, representative placeholder, missing-event, real-start, and legacy-code samples resolved to the expected phases, and detail counts reconciled with summary counts."
  root_cause: "The report treated the event log as an authoritative ordered sequence even when rows were null-timestamp placeholders or legacy encodings, while one write path recorded the next phase before its real transition. Duplicated resolution logic then allowed report views to drift."
  resolution_steps:
    - "Define one valid-event set that excludes events without an observable start time and rejects known placeholder transitions lacking supporting business evidence."
    - "Normalize legacy codes into the current phase model and derive a bounded fallback phase from receipt, inspection, or shipment evidence when a milestone is missing."
    - "Use the same resolved-stage relation for details, tabs, elapsed time, service-level comparison, and exception summaries."
    - "Move milestone creation to the business operation that actually starts the phase and make start/end recording idempotent and restart-safe."
    - "Keep monitoring writes from changing the business transaction result, while logging any recording failure for later reconciliation."
  verification:
    - "All modified query mappings passed structural parsing."
    - "A compatible Java runtime built all affected application modules successfully."
    - "Read-only database scenarios covered waiting orders with placeholders, active inspection without a valid event, real inspection starts, legacy shipment codes, and shipment evidence without a new event."
    - "Detail and summary results matched for normal, stage-filtered, and exception-filtered slices."
  limitations:
    - "The repair leaves historical event rows unchanged and interprets them at read time."
    - "Fallback state is only as reliable as the business timestamps and status fields used as evidence."
    - "Snapshot reconciliation does not prove behavior under every concurrent event ordering or delayed external callback."
  applies_to:
    - "operational dashboards derived from workflow or audit-event tables"
    - "systems migrating from legacy stage codes to a new state model"
    - "reports that must reconcile detail views, summary tabs, elapsed time, and exception counts"
  keywords: ["workflow status", "transition evidence", "placeholder events", "legacy state normalization", "idempotent milestones"]
---

An operations dashboard began moving orders into later phases before the work behind those phases had started. A completed receipt could appear as unloading or inspection. A shipped order could still carry the label of an earlier verification phase. The underlying transactions continued, but the report no longer described the real operational boundary.

The incident came from two directions. The read model accepted every workflow row as valid evidence, including rows with no start time and placeholders created for a future phase. The write path also created one next-stage milestone during completion of the current stage. Once those signals entered the same ordered event stream, choosing the “latest” row could not reliably answer which activity had actually begun.

The repair made current status a derived, reviewable result. It first classified event evidence, then normalized historical encodings, used business records only as a bounded fallback, and moved milestone writes to the real transition. One shared resolver now feeds every report view.

## Reproduce the disagreement across evidence sources

The first useful step was to compare three views of the same orders without writing to the database:

- the workflow event rows used by the report;
- the business status and timestamps owned by receiving, inspection, and shipping;
- the stage displayed by detail, summary, and exception queries.

That comparison exposed three distinct data shapes.

Some event rows carried a stage code but no start timestamp. One descending query could let such a row outrank valid history, so the report displayed a phase that had no observable start.

Other rows represented a future inspection phase and shared the exact time at which receiving ended. The business inspection state was still waiting. Source tracing confirmed that receipt completion created this next-stage row as a convenience, which turned a placeholder into apparent proof of work.

The final group used legacy outbound codes. Their original meaning described shipping activity, while the newer report mapping interpreted one code as an earlier verification phase. The raw value was present and ordered correctly, yet its semantic translation was wrong.

These cases required different treatment. Removing null timestamps could not repair a legacy mapping. Remapping a code could not distinguish a real inspection start from a placeholder. A single “take the maximum event” rule had hidden several separate contracts.

## Build one resolved-stage relation

The repaired queries begin with a shared conceptual pipeline:

```text
raw events
  -> started events
  -> no placeholders
  -> normalized legacy codes
  -> bounded domain fallback
  -> one resolved current phase
```

An event without a start timestamp is excluded from current-phase ordering. It may remain in the audit table for historical reasons, but it cannot prove that an operation began.

A known inspection placeholder is also rejected when all three conditions hold: it coincides with the prior phase's completion, the inspection state is still waiting, and no independent inspection activity exists. A genuine inspection start remains valid because its business state or work record supplies supporting evidence.

Legacy codes are translated before the current phase is selected. The mapping is explicit and testable; it does not rely on numeric order to imply process order.

If a valid milestone is missing, the resolver can synthesize a phase from a narrow set of domain-owned signals. A completed receipt timestamp can support the receiving phase. An active inspection state can support inspection. A shipment timestamp can support shipping. The fallback never invents a time from a generic row update when a more specific business timestamp should exist.

This produces one relation containing the phase, start time, end time, and evidence class. Detail results, tab filters, elapsed time, target-time comparisons, and exception summaries all consume that relation. Keeping several copies of the same decision tree would make the next correction vulnerable to partial rollout.

## Record milestones at the actual transition

Read-time compatibility protects existing history, but future records also need a correct producer.

Receipt completion stopped creating an inspection-start event. Inspection start is now recorded by operations that demonstrate the phase has begun: successful inspection-task creation or a confirmed transition into an active inspection state. Each path calls one idempotent recorder after its business update succeeds.

The recorder preserves the first valid start. A repeated callback does not create another row or reset the timestamp. If it encounters an old placeholder that exactly matches the prior phase's completion, the real start can repair that placeholder. If an end notification arrives without a start, the recorder creates a bounded zero-duration event so the completed phase is not left without a resolvable record.

Monitoring must also respect the business boundary. A failure to append reporting evidence is logged for reconciliation, while the already successful receiving or inspection transaction keeps its original result. This avoids turning an observability repair into a new operational outage. It also means the reconciliation path remains necessary: business success with event-write failure is an allowed degraded state, not proof that the event exists.

## Verify semantics, buildability, and reconciliation

The verification combined static, build, and database evidence.

First, every modified query mapping passed structural parsing. The affected application modules then built successfully with the runtime version required by the legacy project. This checked that the shared event recorder and all callers remained type-compatible across module boundaries.

Read-only database scenarios then exercised the status resolver:

| Scenario | Expected resolved phase |
| --- | --- |
| Prior phase complete, next-stage placeholder present, business state still waiting | Prior phase |
| Business inspection active, valid inspection event missing | Inspection |
| Genuine inspection start present | Inspection |
| Legacy outbound code representing shipment | Shipping |
| Shipment evidence present, new shipment event missing | Shipping |

The same scenarios were run through detail and summary query shapes. Stage-filtered totals matched the corresponding detail rows. Exception-filtered totals also matched, showing that elapsed-time and threshold logic used the same resolved phase rather than an older branch of the query.

The validation did not rewrite historical events. It proved that the new read model could interpret the observed legacy and placeholder states, and that future event writers would record the phase closer to its actual start.

## Limits of the repair

Business-data fallback is a compatibility mechanism. If its source status or timestamp is itself delayed or incorrect, the derived phase can still be wrong. Each fallback therefore needs a named owner, a precise meaning, and reconciliation monitoring.

The read-only scenarios covered the known failure shapes at one point in time. They did not simulate every ordering of concurrent updates or every delayed external callback. Production telemetry should watch for business states that lack matching valid events and for report partitions whose detail and summary counts diverge.

The reusable conclusion is to treat workflow status as an evidence-resolution problem. Accept only events that prove a transition, normalize historical meanings explicitly, use domain data as a narrow fallback, record milestones idempotently at the real operation, and make every report projection consume the same resolved state.
