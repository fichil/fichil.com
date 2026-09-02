---
title: "Repairing Oracle Sequence Drift After a Data Migration"
date: 2026-09-02
publication_date: 2026-09-02
slug: "oracle-sequence-drift-after-migration"
draft: false
tags: ["oracle", "oracle-19c", "database-migration", "sequence", "ora-00001", "troubleshooting"]
categories: ["Database"]
description: "Diagnose primary-key collisions caused by sequence drift after an Oracle migration, align sequences forward during a verified write freeze, and prove recovery with complete transactions."
ai:
  schema_version: 1
  problem: "After a data migration, Oracle application writes failed with ORA-00001 because primary-key sequences could still emit values that already existed in their target tables."
  symptoms:
    - "A new business transaction failed on a primary-key unique constraint even though the application was using a sequence for the key."
    - "The failing generated key already belonged to an older row in the migrated table."
    - "USER_SEQUENCES.LAST_NUMBER could appear greater than MAX(primary_key), yet a cached sequence could still emit a lower conflicting value."
    - "Fixing only the first failed table exposed the risk that later tables in the same transaction could fail next."
  evidence:
    - "Two independent write workflows reproduced ORA-00001 with sequence-generated keys that already existed in migrated tables."
    - "A transaction-chain inventory found every sequence-backed primary key that could be written after the first insert."
    - "With all writers stopped, repeated table maxima were stable and every repaired sequence was advanced only forward."
    - "After services restarted, complete transactions inserted all expected rows with keys above the pre-repair maxima and produced no related ORA-00001 errors."
  root_cause: "Table data and sequence state were not reconciled as one migration unit. Cached sequence semantics also made LAST_NUMBER a persisted cache boundary rather than proof of the exact next value, so a superficial LAST_NUMBER versus MAX(primary_key) comparison could report a false sense of safety."
  resolution_steps:
    - "Use the violated constraint and application logs to identify the exact table, primary-key column, and generated value."
    - "Trace the entire write transaction and inventory every dependent sequence-backed primary key before changing anything."
    - "Stop all writers, including schedulers and every application instance, then take repeated MAX(primary_key) and sequence-property snapshots until the table maxima are stable."
    - "For each ascending sequence, choose a forward-only target no lower than both MAX(primary_key) plus one and the recorded LAST_NUMBER boundary."
    - "Advance the sequence with a supported Oracle operation, verify NEXTVAL and sequence attributes, then restart only the services that were previously running."
    - "Validate a complete business transaction across every expected table and check logs for recurring unique-constraint failures."
  verification:
    - "Repeated write-freeze snapshots showed stable table maxima before any sequence DDL was executed."
    - "Every verification NEXTVAL was greater than the corresponding pre-repair table maximum, while increment, cache, cycle, and ordering attributes remained unchanged."
    - "Two sanitized end-to-end saves created all expected header, detail, and auxiliary rows without duplicate primary keys."
    - "Post-repair logs contained no related ORA-00001 errors during the verified transactions."
  limitations:
    - "The procedure assumes an ascending sequence used for a numeric key; descending, cycling, session, scalable, or sharded sequences require separate analysis."
    - "In clustered or multi-writer environments, every writer and scheduler must be included in the write freeze; stopping one application process is insufficient."
    - "Advancing a sequence can create gaps, which are normal for Oracle sequences and must not be repaired by moving the sequence backward."
    - "A successful NEXTVAL check proves the sequence boundary, not the whole business workflow; transaction-level verification remains required."
  applies_to:
    - "Oracle 19c migrations that move table data and sequence definitions or state"
    - "Applications that use Oracle sequences for numeric primary keys"
    - "Multi-table write transactions where a later insert can expose another stale sequence"
  keywords: ["Oracle sequence drift", "ORA-00001 after migration", "LAST_NUMBER cache", "sequence versus MAX primary key", "ALTER SEQUENCE RESTART", "write freeze database repair"]
---

A newly created business record failed with `ORA-00001` on a primary key. That was unexpected because the application generated the key from an Oracle sequence. The log resolved the contradiction: the generated value already belonged to an older row that had arrived with the migrated data.

This was not a duplicate form submission. It was migration drift between two objects that must be treated as one unit: the table data and the sequence that supplies future keys. A second workflow exposed the same pattern, which also showed why repairing only the first failed insert is unsafe.

## Start with the violated constraint

Oracle defines `ORA-00001` as an attempted `INSERT`, `UPDATE`, or `MERGE` that duplicates a value protected by a unique constraint, unique index, or primary key ([Oracle `ORA-00001`](https://docs.oracle.com/en/error-help/db/ora-00001/)). The first diagnostic step is therefore to identify:

- the constraint or index;
- its table and columns;
- the generated value in the failed statement;
- whether that value already exists;
- the code path that requested the value.

If the application uses `NEXTVAL` and the failed value already exists in the same primary-key column, the working hypothesis becomes sequence drift. It is still a hypothesis until the sequence-to-table mapping and the actual write chain are verified.

Do not respond by removing the constraint. The constraint is reporting that two independent key-generation histories have collided. Weakening it would hide the symptom while allowing ambiguous identifiers into the data model.

## Do not treat LAST_NUMBER as the next value

The tempting check is:

```sql
SELECT MAX(id) FROM order_header;

SELECT last_number
FROM user_sequences
WHERE sequence_name = 'HDR_SEQ';
```

It is useful evidence, but it is not enough. Oracle documents `LAST_NUMBER` as the last sequence number written to disk. When caching is enabled, it is the last number placed in the cache and is likely to be greater than the last value actually used ([Oracle 19c `ALL_SEQUENCES`](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_SEQUENCES.html)).

That means `LAST_NUMBER > MAX(id)` does not prove that the next emitted value is safe. The current cached position can still be below both numbers. `CURRVAL` is not a universal inspection shortcut either: it is session-specific and is undefined in a session until that session has called `NEXTVAL`.

The correct conclusion is narrower:

- `MAX(id)` describes committed table data at the instant of the query;
- `LAST_NUMBER` describes a persisted sequence/cache boundary;
- neither value, by itself, proves what a concurrent writer will insert next.

## Inventory the entire transaction

A request that begins with a header insert may continue through detail, mapping, audit, or workflow tables. After the header sequence is repaired, the transaction can simply fail at the next stale sequence.

Before any DDL, trace the successful path and create a repair inventory. For each write, record the key column, its sequence, whether the write is conditional, and the required result. A typical chain might contain:

- a header that must create exactly one row with a new key;
- details whose row count must match the request;
- a mapping that may be created or safely reused;
- an auxiliary row that exists only when its business rule matches.

Also search for triggers, scheduled jobs, import workers, and other services that can draw from the same sequences. A maintenance window is not a write freeze if one background writer remains active.

## Establish a real write freeze

Changing a live primary-key sequence while requests continue is a race. Use an explicit maintenance boundary:

1. Record database identity, sequence owner, sequence attributes, service state, and the intended scope.
2. Stop every application instance, worker, scheduler, and integration that can write the affected tables.
3. Query each `MAX(primary_key)` and its sequence metadata twice, separated by a short observation interval.
4. Continue only when the table maxima are unchanged and no other writer is present.

For an ascending sequence, a conservative target is:

```text
table_next = MAX(id) + 1
target = GREATEST(
  table_next,
  LAST_NUMBER
)
```

The first term avoids committed keys. The second prevents the repair from moving behind the recorded sequence boundary. Choosing the larger value may skip numbers, but Oracle sequences do not promise gap-free numbering. Oracle notes that cached values can be lost after a system failure and that rolled-back or concurrent transactions can also leave gaps ([Oracle 19c `CREATE SEQUENCE`](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/CREATE-SEQUENCE.html)).

Never choose a lower target merely to make the numbers contiguous.

## Advance only forward and preserve attributes

On a supported Oracle 19c release, the conceptual repair is:

```sql
ALTER SEQUENCE order_header_seq
  RESTART START WITH <target>;
```

Oracle documents that `ALTER SEQUENCE` changes future sequence numbers and can change increment, limits, cache, cycle, and ordering behavior ([Oracle 19c `ALTER SEQUENCE`](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/ALTER-SEQUENCE.html)). Use syntax supported by the exact database release and privileges. If the release does not support the chosen restart operation, use a separately reviewed forward-advance procedure rather than improvising on production.

Repair one inventoried sequence at a time, then:

- obtain and record one verification `NEXTVAL`;
- confirm it is greater than the pre-repair table maximum;
- confirm `INCREMENT_BY`, `CACHE_SIZE`, `CYCLE_FLAG`, and `ORDER_FLAG` still match the baseline;
- record the consumed verification value as an expected gap;
- keep writes stopped until every sequence in the transaction has passed.

Do not drop and recreate a sequence casually. Dependencies, grants, attributes, and concurrent consumers are part of its contract.

## Verify the transaction, not just NEXTVAL

A safe `NEXTVAL` proves only that one generator crossed one boundary. It does not prove that the application can complete its work.

After restarting only the services that were running before maintenance, execute a retained test transaction and verify:

- the page or API reports success;
- the header exists exactly once;
- the expected detail and auxiliary rows exist;
- every generated key is above its recorded pre-repair table maximum;
- no duplicate primary key exists;
- the application can read the saved transaction back;
- logs contain no related `ORA-00001` after the repair.

In the sanitized run behind this article, two independent workflows passed this full check. Each inserted its expected chain of rows, every generated key crossed the relevant baseline, and the related unique-constraint error did not recur during verification.

## Treat migration acceptance as a paired invariant

The reusable lesson is not “increase a sequence when an insert fails.” It is to make table data and key generators one acceptance unit.

For every migrated sequence-backed key, record and verify the table maximum, sequence properties and persisted boundary, all active writers, forward-only target, verification `NEXTVAL`, complete transaction result, and post-repair error scan.

Run the audit before enabling writes on the target database. A migration can copy every table correctly and still remain operationally unsafe if its sequences describe an older history.

## Limits

This procedure targets ordinary ascending sequences used for numeric keys. Descending, cycling, session, scalable, or sharded sequences have different semantics and need their own analysis. In RAC or any multi-instance deployment, every writer and every database-instance cache must be considered; stopping a single front end is not sufficient.

Finally, sequence gaps are normal. Risk comes from moving a generator backward, treating a dictionary boundary as the exact next value, or declaring a transaction recovered after a single `NEXTVAL` check.
