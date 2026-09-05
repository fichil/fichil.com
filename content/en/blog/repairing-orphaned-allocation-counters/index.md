---
title: "Repairing Orphaned Allocation Counters Without Weakening Database Invariants"
date: 2026-09-05
publication_date: 2026-09-05
slug: "repairing-orphaned-allocation-counters"
draft: false
tags: ["oracle", "spring", "transactions", "data-integrity", "inventory", "troubleshooting"]
categories: ["Database"]
description: "Trace a valid database rejection back to stale derived allocation counters, repair the data under row locks and version checks, and translate the error only after rollback is guaranteed."
ai:
  schema_version: 1
  problem: "An order-copy transaction was rejected by a database invariant even though the underlying inventory was eligible and physically present."
  symptoms:
    - "The API surfaced an application-defined database error that sounded like an inventory-quality failure."
    - "Physical quantity existed, but the availability calculation returned zero."
    - "The failed copy did not leave a partial order, so the rejection was protective even though its visible explanation was incomplete."
  evidence:
    - "The quality attribute was in an allowed state and the physical quantity covered the requested amount."
    - "Allocation counters at both the lot and location layers consumed the entire quantity."
    - "No matching active, pending, or deleted allocation records explained those counters."
    - "A guarded repair restored computed availability, and one repeated copy produced exactly one complete order while leaving the source unchanged."
  root_cause: "Denormalized allocation counters had drifted away from their authoritative reservation records. The trigger evaluated the stored counters correctly and rejected a write whose computed availability was zero; the remaining historical evidence did not prove which earlier workflow created the drift."
  resolution_steps:
    - "Keep the database invariant enabled and prove which input made it reject the transaction."
    - "Give the whole copy operation one transaction boundary and let the database exception cross that boundary so rollback happens before the API converts it to a safe business message."
    - "Lock every affected base row, recheck eligibility, counters, row versions, and the absence of authoritative allocation records in one transaction."
    - "Use conditional updates that require the expected old counter and row version, and roll back unless every expected row changes exactly once."
    - "Reconcile the availability view before commit, then repeat the original operation once and verify both source and destination records."
  verification:
    - "Before data repair, the improved error path returned a bounded business message and left no partial destination rows."
    - "After the guarded repair, both allocation layers were zero and computed available quantity matched physical eligible quantity."
    - "One positive retry created one destination order with the expected single detail and zero downstream allocation, picking, and shipping quantities."
    - "The source order remained unchanged and no new invariant error appeared after the successful retry."
  limitations:
    - "The exact historical workflow that introduced the stale counters was not proven, so the repair does not assign an unsupported cause."
    - "Direct counter repair is appropriate only when authoritative reservation records are exhaustively reconciled and the affected rows are locked."
    - "A clearer error message improves diagnosis but does not replace the invariant or prevent future drift."
  applies_to:
    - "Systems that store both authoritative reservation rows and denormalized allocation counters"
    - "Database-triggered business invariants exposed through Spring transactional services"
    - "Operational data repairs that require fail-closed concurrency and reconciliation checks"
  keywords: ["orphaned allocation counter", "ghost reservation", "database invariant", "SELECT FOR UPDATE NOWAIT", "Spring transaction rollback"]
---

An order-copy request failed with an application-defined database error. The message suggested that inventory quality made the stock ineligible, yet the physical quantity existed and the recorded quality attribute allowed the operation.

The database still had a valid reason to reject the write. Availability was calculated from physical quantity minus allocated quantity, and two denormalized counter layers said that the entire quantity was allocated. No corresponding reservation record existed. The trigger saw zero availability and protected the invariant it had been written to enforce.

The safe repair kept that invariant, corrected the orphaned counters under concurrency guards, and improved the application boundary so a failed multi-row copy rolled back before its database error became a user-facing message.

## Treat the rejection as evidence

The first diagnostic step was to identify the exact statement and invariant that stopped the transaction. The order header had been prepared and the detail insert activated a database trigger. That trigger checked whether eligible, unallocated inventory covered the requested quantity and raised an application error when the computed result was insufficient.

Oracle documents that a DML trigger can raise an application error and cause the pending statement to roll back ([Oracle DML triggers](https://docs.oracle.com/en/database/oracle/oracle-database/19/lnpls/dml-triggers.html)). That behavior mattered here: disabling the trigger would have allowed a transaction to proceed while the database still described the stock as fully allocated.

The failed transaction also left no destination header or detail behind. This was useful evidence. The invariant was active, and the existing transaction path prevented a half-copied order from becoming durable.

## Reconcile every layer that contributes to availability

The visible message named one possible cause, but the availability calculation had several inputs. The investigation reconciled them separately:

1. The stock's quality attribute was in an allowed state.
2. Physical quantity covered the requested quantity.
3. The source order had no active allocation for the stock.
4. Lot-level and location-level counters each marked the full quantity as allocated.
5. Active allocations, pending allocations, and retained deletion history contained no record that explained those counters.

That combination established an orphaned allocation: derived counters claimed a reservation that the authoritative reservation sets could not identify.

The evidence did not establish which historical workflow introduced the mismatch. It could have come from a migration, an interrupted cleanup, a manual repair, or an older application defect. The completed repair therefore described the proven state mismatch without assigning an unsupported origin.

This distinction prevents two common mistakes. A team might weaken a valid invariant because its message is imprecise, or it might zero a counter after checking only one reservation table. Both actions can turn a diagnosable rejection into silent inventory corruption.

## Preserve rollback before translating the error

The copy operation wrote a header followed by one or more details. Its public service boundary needed to own the entire unit of work. Spring's default declarative transaction settings roll back on unchecked exceptions that escape the transactional method ([Spring `@Transactional`](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)).

The implementation kept the database exception on that path until the transaction interceptor had marked the work for rollback. Only outside the transactional boundary did the API walk the cause chain, recognize the application-defined error, extract a bounded business sentence, and return a normal error envelope.

This ordering has two independent goals:

- transaction semantics: every header and detail either commits together or rolls back together;
- response semantics: a known business rejection is useful to the operator, while SQL text, table names, stack traces, and unknown database errors remain private.

Focused tests covered nested exception causes, multi-line database messages, extraction of the approved business sentence, and the rule that unknown errors must not expose internal diagnostics. Before repairing the data, one negative copy verified that the new response was readable and that no partial destination rows remained.

## Repair derived state with fail-closed conditions

The data correction touched two rows: one owned the lot-level counter, and one owned the location-level counter. Both had to change atomically because the availability view depended on both.

The transaction followed this pattern:

```sql
select id,
       physical_qty,
       alloc_qty,
       version_no
from inventory_layer
where id = :id
for update nowait;

update inventory_layer
set alloc_qty = 0,
    version_no = version_no + 1
where id = :id
  and alloc_qty = :old_alloc
  and version_no = :old_version;
```

Oracle's `NOWAIT` clause returns control immediately when another transaction already holds a requested row lock ([Oracle `SELECT`](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SELECT.html)). For an operational repair, that is safer than waiting while the evidence used to authorize the change becomes stale.

Locks alone were not enough. After acquiring both rows, the repair repeated every precondition inside the same transaction:

- exact identity and eligibility attributes still matched;
- physical and allocated quantities still matched the reviewed snapshot;
- row versions were unchanged;
- all authoritative allocation sets still had no matching record;
- each conditional update affected exactly one row;
- the computed availability view returned the expected result after both updates.

Any mismatch caused a rollback. The procedure did not search for similar rows, adjust unrelated stock, or convert this one incident into a bulk cleanup.

## Verify both the failed and successful paths

Verification covered the boundary before and after the data repair.

Before repair, one controlled copy exercised the improved error path. It returned a safe business failure, and database reconciliation found no new header or detail. That proved the transaction boundary independently of the data correction.

After repair, both counter layers were zero, their row versions had advanced, and computed available quantity matched the eligible physical quantity. One positive copy then created exactly one destination order with one expected detail. Downstream allocated, picked, and shipped quantities all began at zero, and the source order's audit state remained unchanged. No new invariant error appeared after the successful transaction.

The repair succeeded because each claim had a separate check: the trigger remained enabled, rollback was proven on the negative path, the data change was conditional and atomic, and the final business operation was reconciled across source, destination, counters, and logs.

## Keep invariants and derived data accountable

Database invariants often reveal upstream drift before a user-visible report does. When an invariant rejects a valid-looking command, first identify the exact value it evaluated. Reconcile authoritative records against every cached or denormalized input, and keep the invariant active while the mismatch is understood.

If derived state must be repaired, lock the exact rows, repeat the evidence inside the transaction, require versioned conditional updates, and verify the computed boundary before commit. Then test the original operation once. A friendly error message helps operators act, but the lasting safety comes from preserving rollback and proving that authoritative and derived state agree.

## Limits

This method does not justify routine direct database edits. It applies when the authoritative record sets are known, the mismatch is narrowly scoped, the rows can be locked, and the expected values are independently verified. If any reservation source is missing from the reconciliation, the repair must stop.

The historical source of the mismatch also remains an open prevention question. A durable follow-up may add reconciliation telemetry, write-path assertions, or a repair tool with the same fail-closed contract. Those controls require evidence from the workflows that maintain the counters; the successful incident repair alone does not prove which preventive change is correct.
