---
title: "Designing Rerunnable Oracle Schema Synchronization with Wrong-Target Guards"
date: 2026-09-07
publication_date: 2026-09-07
slug: "safe-rerunnable-oracle-schema-sync"
draft: false
tags: ["oracle", "sqlplus", "database-migration", "idempotency", "schema-management", "verification"]
categories: ["Database"]
description: "Turn an Oracle change list into a fail-closed synchronization program with target identity checks, full preflight validation, conditional DDL, business-key MERGE, and repeat-run proof."
ai:
  schema_version: 1
  problem: "A migration test database had to receive later schema and reference-data changes without touching the source system or failing when part of the target was already upgraded."
  symptoms:
    - "The target contained a mixture of missing objects, already-correct objects, and one locally widened column that had to be preserved."
    - "A one-shot script could stop on duplicate objects after earlier DDL had already committed."
    - "The same SQL could cause damage if an operator connected to the source or another database by mistake."
  evidence:
    - "A read-only comparison identified the exact structural and reference-data delta while excluding transactional rows, equivalent program units, and target-side compatible improvements."
    - "A wrong-target execution test stopped at the identity guard with a nonzero Oracle error before any change block ran."
    - "Two complete executions against the intended test target returned success; the second skipped existing schema changes and both reference-data merges affected zero rows."
    - "Postconditions confirmed the expected columns, tables, sequences, reference rows, object validity, preserved wider column, and empty newly created business tables."
  root_cause: "The original script described a sequence of edits without proving target identity, classifying every existing object, or defining postconditions. Oracle DDL commits independently, so that structure could not provide safe all-or-nothing behavior or reliable recovery."
  resolution_steps:
    - "Bind the script to a verified target fingerprint before any side effect and reject every mismatch."
    - "Run a complete read-only preflight that classifies each desired object as missing, compatible, or conflicting; stop on any conflict before DDL begins."
    - "Make schema operations conditional, preserve compatible target improvements, and synchronize reference data with business-key MERGE statements that avoid no-op updates."
    - "Use SQL*Plus error propagation plus explicit postcondition assertions so automation receives a meaningful nonzero exit status."
    - "Execute the full script twice and require the second run to produce the same database state without duplicate objects or reference-data writes."
  verification:
    - "The wrong-target guard rejected a deliberately mismatched connection."
    - "Both intended-target runs completed with success exit status and an explicit success marker."
    - "The second run reported existing schema objects as already correct and both MERGE statements changed zero rows."
    - "The final audit found all expected objects valid, preserved the approved wider column, and found no copied transactional data in the new tables."
  limitations:
    - "Rerunnability does not make Oracle DDL transactional; a failed run can leave earlier successful DDL committed."
    - "An in-script target guard cannot protect a command that fails before SQL*Plus loads the script, so the invocation wrapper still needs hash, path, and connection checks."
    - "Schema and reference-data verification does not replace application-level migration tests or prove behavior under concurrent production load."
  applies_to:
    - "Oracle upgrade rehearsals that must align a cloned test database with a later source baseline"
    - "Change scripts containing a mixture of DDL, comments, sequences, and reference-data synchronization"
    - "Operational database changes that require wrong-target prevention and restartable execution"
  keywords: ["Oracle schema synchronization", "wrong-target guard", "rerunnable SQL", "SQL*Plus exit code", "MERGE idempotency"]
---

A database cloned for an upgrade rehearsal began from a valid source snapshot. Later source-side schema and reference-data changes still had to be applied to the test target before application testing could use a comparable baseline.

The target was not empty. It already contained part of the desired structure, plus one compatible improvement that should remain wider than the source definition. The synchronization also had to avoid copying transactional rows. A conventional list of unconditional `ALTER`, `CREATE`, and `INSERT` statements would be fragile in that state: it could fail halfway through, fail again on retry, or run against the wrong database after an operator selected the wrong connection.

The completed script treated synchronization as a desired-state program. It verified the target, classified the entire change set before writing, applied only missing changes, checked every postcondition, and then ran a second time to prove the no-change path.

## Establish the exact synchronization boundary

The source comparison was read-only and happened before the delivery script was executed. Its output was divided into three groups:

- schema differences required by the later application baseline;
- reference values needed by that schema or application contract;
- data and definitions that must stay outside the synchronization.

Transactional records were excluded. Equivalent procedures, views, and triggers were excluded as well; cosmetic text differences did not justify replacing valid program units. A target column that had already been widened safely was recorded as compatible and preserved.

This scope decision matters because “make the clone match” is too broad for an executable migration contract. A useful contract names the objects that may change, the attributes that define compatibility, and the target-side differences that are intentionally retained.

## Reject the wrong target before side effects

The first executable block built a target fingerprint from several independent properties:

- the current schema user;
- the database identity;
- the connected service identity;
- the schema's expected default tablespace.

Every property had to match. A mismatch raised an application error before the change block ran. The protection test deliberately connected through a different identity and received a nonzero result without applying writes.

Using several attributes reduces the chance that one reused name authorizes the wrong environment. The values remain deployment inputs; public documentation and logs should not expose real hosts, services, schemas, or addresses.

An in-script guard starts only after `SQL*Plus` loads the file. During verification, one local invocation failed before the script began because the command path was not interpreted correctly. No database change occurred, but the event showed a separate boundary: an operator wrapper should verify the script hash, file resolution, and intended connection string before invoking `SQL*Plus`.

## Preflight every object before the first DDL statement

Oracle issues implicit commits around DDL, so completed DDL cannot be rolled back as one transaction ([Oracle DDL behavior](https://docs.oracle.com/en/database/oracle/oracle-database/19/tdddg/data-definition-language-ddl-statements.html)). The safe response was a complete read-only preflight, followed by restartable change steps.

For every column, table, constraint, sequence, and comment, preflight assigned one of three states:

```text
missing     -> create
compatible  -> skip
conflict    -> stop before DDL
```

Compatibility included datatype, length, precision, nullability, default, key structure, sequence behavior, and the explicitly preserved target-side widening. Existence alone was insufficient. Catching “already exists” and continuing could silently accept an object with the right name and the wrong contract.

Running all conflict checks first narrowed the partial-commit risk. Runtime conditions such as a lock timeout can still interrupt the change phase, but a known definition conflict cannot surface only after several earlier objects have committed.

## Make each change converge on the declared state

The change phase used the preflight result instead of assuming a fresh target:

```text
if missing:
    create or alter the object
else if compatible:
    report and skip
else:
    stop
```

Reference data needed a different identity. Surrogate row IDs can differ after a clone or local test activity, so the script matched rows by their stable business key. Oracle's `MERGE` statement selects matched rows for update and unmatched rows for insert ([Oracle `MERGE`](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/MERGE.html)). The update clause also compared business fields, preventing a matched row with identical values from becoming an unnecessary write.

Target-owned surrogate IDs and approved local metadata were preserved. New values were inserted only when the business key was absent. This made the reference-data section converge without pretending that every local identifier must equal the source.

## Turn verification failures into process failures

The script performed a full postcondition audit after the change phase. It checked exact column definitions, table columns and keys, sequence properties, comments, reference-row counts and values, object validity, and the preserved wider column. Newly created business tables also had to remain empty, proving that structural synchronization did not copy source transactions.

`SQL*Plus` was configured to exit when SQL or PL/SQL raised an error. Oracle documents that `WHENEVER SQLERROR` can return the SQL error code to the calling process, while also noting that it does not catch `SQL*Plus` command errors ([`SQL*Plus` `WHENEVER SQLERROR`](https://docs.oracle.com/en/database/oracle/oracle-database/18/sqpug/WHENEVER-SQLERROR.html)). Explicit success text was therefore useful for operators, but the process exit status remained the automation boundary.

The completed verification produced four independent signals:

1. the wrong-target test failed before the change phase;
2. the intended target passed identity checks and all postconditions;
3. every expected object was valid and excluded business tables contained no copied rows;
4. a second complete execution succeeded, skipped the existing schema objects, and changed zero reference rows.

The second run tested the actual delivered script from connection guard through final audit. Repeating only the individual DDL fragments would not prove that preflight, branching, and exit behavior remained rerunnable as a whole.

## Limits of the pattern

Two successful runs demonstrate convergence for the verified starting state. They do not cover every possible historical definition, concurrent DDL, privilege arrangement, or application workload. Unexpected existing definitions should continue to stop the script until a person reviews the difference.

The pattern also provides restartability, not atomic schema rollback. If a runtime failure occurs after one DDL statement commits, the repair path is to remove the blocking condition and rerun the same verified script. Each completed step is then recognized as compatible, while the remaining steps continue.

Application compatibility still needs its own boundary: startup checks, queries, writes, retries, and business-flow reconciliation. The schema script proves only the database state it explicitly asserts.

The reusable conclusion is to design synchronization around identity, compatibility, and postconditions. Verify the destination before writes, reject conflicting existing state, make every allowed operation converge, and prove the no-change path with a second full execution.
