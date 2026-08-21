---
title: "When a File Exists but Archiving Says It Does Not"
date: 2026-08-21
draft: false
tags: ["windows", "sqlite", "path-resolution", "troubleshooting", "data-integrity"]
categories: ["DevOps"]
description: "A guarded, reversible recovery for a local task store whose persisted physical path no longer matched the application's logical home alias."
---

A desktop task store returned a file-not-found error whenever one recent task was archived. The transcript was still readable, its file existed, and the state database passed an integrity check. Retrying the archive operation produced the same failure.

The useful clue was path identity. Older records retained a physical storage-root alias, while current records used the application's logical home alias. Both aliases reached the same bytes through a directory link, but the archive transaction did not treat the two path forms as interchangeable.

This case shows why “the file exists” is only one part of a path failure. A stateful application can still fail when its persisted path identity no longer matches the root it uses to construct an archive operation.

## Separate the symptom from the evidence

The visible error supported several possible explanations: a missing transcript, insufficient permissions, database corruption, or a stale path. Read-only checks narrowed the scope before any repair:

- the target row was present and remained unarchived;
- the transcript existed exactly once and was not being written;
- a database quick check returned a healthy result;
- the physical and logical aliases resolved to a file with the same size and SHA-256;
- records already using the logical alias could be archived successfully;
- the application log placed the failure inside the archive transaction.

Together, these observations ruled out a broad reset. They also established a safe boundary: repair path metadata first, then let the application perform its own file move and state transition.

## How path alias drift breaks a transaction

A storage migration can preserve file access while changing the name by which an application reaches those files. For example, a physical data root may later be exposed through a stable logical home directory. The operating system can resolve both names to the same file, yet a database row may continue to store the old form.

The archive path then crosses two identities:

- stored row: `physical-root/item`;
- application root: `logical-home/item`;
- archive target: `logical-home/archive/item`.

If the archive implementation derives part of the operation from the stored row and another part from the current application root, string-based validation or path construction can fail before the file is moved. The resulting file-not-found error describes the failed transaction, not necessarily the presence of the source bytes.

## Repair only the stale identity

The recovery stayed reversible and row-scoped:

1. Confirm that the target had no active writer and record its current state.
2. Create an online database backup and a hash-verified copy of the transcript.
3. Prove that the old and new path aliases resolved to the same file.
4. Inventory every unarchived row that still used the old alias.
5. Normalize those paths in one guarded transaction.
6. Call the application's archive operation again.

The update used compare-and-swap conditions rather than an unrestricted rewrite:

```sql
UPDATE task_record
SET stored_path = :logical_path
WHERE id = :task_id
  AND archived = 0
  AND archived_at IS NULL
  AND stored_path = :old_path;
```

Each expected row had to change exactly once. A missing alias, a changed archive state, a mismatched identifier, or an unexpected row count would have rolled back the whole batch. The repair changed only path metadata; it did not mark tasks as archived or move transcript files by hand.

After normalization, the same application archive call succeeded. This mattered because the application still owned the real transaction: moving the transcript, setting archive fields, refreshing its lists, and preserving its own invariants.

## Verify every boundary that could drift

Success required more than a successful API response. The final checks confirmed that:

- the target left the active list and appeared in the archive list;
- its archive timestamp and archived state were populated;
- the archived transcript retained the original size and SHA-256;
- unrelated tasks kept their prior archive state;
- no stale physical-root paths remained in the scoped set;
- the state database still passed its integrity check;
- the archived transcript remained readable through the application.

These checks distinguished a complete recovery from a cosmetic UI refresh or a partially moved file.

## Limits and reusable conclusion

This technique applies only when both aliases are proven to identify the same bytes and the state store is understood well enough to make a guarded, reversible change. Stop if a writer is active, the hashes differ, the database is unhealthy, the affected rows cannot be enumerated exactly, or the application has an official migration routine that has not been tried.

When a stateful desktop application reports that an existing file cannot be found, compare persisted path identity with the application's current logical root. Back up first, normalize only proven stale metadata with compare-and-swap guards, and return control to the application for the actual transaction. That sequence repairs the broken identity without inventing a second archive workflow.
