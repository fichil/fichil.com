---
title: "Assigning Incrementing Job IDs Without Duplicating Paid Work on Retry"
date: 2026-07-28
lastmod: 2026-07-29
draft: false
tags: ["automation", "idempotency", "scheduling", "state-management", "reliability"]
categories: ["DevOps"]
description: "How a stable allocation key and a process lock let a recurring paid pipeline create several jobs per period without duplicating work when a scheduled run retries."
---

A weekly media pipeline needed to support more than one release in the same ISO week. A simple weekly identifier was no longer unique, so task directories and history records were changed to a versioned form such as `2026-W32-0`, `2026-W32-1`, and `2026-W32-2`.

That solved only half of the problem. A scheduler may restart after it has allocated a task but before it records success. If every retry asks for “the next sequence,” one logical run can consume several identifiers. In a paid pipeline, the consequence can be worse than untidy folders: a later command may initialize a second job and submit duplicate provider requests.

## Why a retry can create duplicate work

The workflow had to satisfy two requirements that look contradictory:

1. different runs in the same week must receive increasing sequence numbers;
2. retries of the same scheduled run must receive the original number.

Using only the current maximum sequence satisfies the first requirement but violates the second. Using only a fixed weekly name makes retries safe but prevents legitimate additional releases. A timestamp is also insufficient: it makes every retry unique, which is exactly the behavior that must be avoided.

The missing information was a stable identifier for the scheduled invocation itself. The scheduler already knew which logical invocation it was executing, but that identifier was not saved with the allocated task.

## Separate the period, sequence, and scheduled invocation

The task identity was split into three fields:

- `week_id` groups work by ISO week;
- `sequence` gives the zero-based position within that week;
- `episode_id` combines them into the unique persistent identifier used by directories, state, history, and later commands.

Allocation also accepts a stable allocation key, `allocation_key`. A scheduled run derives it from its own schedule identity, for example `scheduled-run:2026-08-07`. The exact format is less important than one rule: every retry of the same logical invocation must reuse the same key.

Under the pipeline lock, the allocator performs this sequence:

1. read existing task state and completed history;
2. search for a task already carrying the supplied allocation key;
3. if exactly one match exists in the requested ISO week, return its existing task ID;
4. if the key is already associated with another week or multiple tasks, fail closed;
5. otherwise calculate `max(sequence) + 1`, persist the new task, and return its ID.

The process lock ensures that only one allocation runs at a time. Without it, two first-time callers could observe the same maximum and allocate the same next sequence. Conversely, a lock without a stable allocation key would serialize retries while still assigning each one a new number. Both controls are required.

## Keep allocation separate from paid execution

Planning commands may allocate a new ID, but paid commands must never do so implicitly. Every generation, approval, retry, and reassembly command now requires an explicit existing `episode_id`.

If the task does not exist, execution stops before credentials are read or a provider client is initialized. This establishes a useful safety boundary:

- allocation decides *which durable task* a scheduler invocation owns;
- execution decides *whether that known task* may spend money.

The task state also remains the source of truth for accepted remote task references and cost accounting. Recovering an interrupted run therefore resumes the saved task instead of reconstructing provider requests from a directory name.

## Migrating existing state without losing evidence

Two completed tasks were migrated from weekly names to versioned identifiers. Their state and history gained the new task ID, week, sequence, and migration metadata, while existing provider references, approval state, cost records, completion timestamps, and media hashes were preserved.

Migration verification did not rely on the directory move alone. Each migrated task passed the normal read-only task checker, and the final media and cover hashes remained unchanged. No paid API was called during the migration.

## Verification

The completed implementation passed 69 automated tests. The allocation-specific coverage proved that:

- sequences increment within one ISO week and reset in the next week;
- the same allocation key returns the same task after a retry;
- an allocation key cannot silently cross ISO-week boundaries;
- concurrent allocation is serialized by the pipeline lock;
- multiple completed tasks can coexist in one weekly history group;
- paid execution requires an explicit task ID;
- a missing task fails before credentials or the paid provider are accessed.

The two migrated tasks also passed end-to-end read-only checks. Their artifacts, cost ledgers, and remote task-reference counts remained unchanged.

## Lessons and limits

An incrementing suffix is a naming convention, not an idempotency design. Reliable recurring allocation needs a durable invocation identity and mutual exclusion. If one allocation key is associated with multiple tasks or weeks, the allocator must stop instead of guessing which task to reuse.

This pattern applies beyond media generation. It is useful for recurring exports, billing batches, model-evaluation runs, report snapshots, and any scheduler that may legitimately create several jobs per period while also retrying after uncertain completion.

The allocation key must come from a stable scheduler identity. A freshly generated random value or the retry start time defeats recovery. The pipeline lock must also cover both discovery and persistence; locking only the final write still leaves a race between reading the current maximum and choosing the next sequence.

Finally, idempotent allocation does not make the paid provider itself idempotent. Remote submission still needs persisted task references, explicit recovery rules, and a prohibition on resubmitting when acceptance is unknown.
