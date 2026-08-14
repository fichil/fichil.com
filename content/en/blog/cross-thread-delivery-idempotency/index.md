---
title: "Preventing Duplicate Delivery Across Automation Threads"
date: 2026-08-14
draft: false
tags: ["automation", "idempotency", "reliability", "state-management", "testing"]
categories: ["DevOps"]
description: "How a destination-and-content idempotency key, unknown-result handling, and repeated sibling-task checks can stop resumed automation from repeating an external side effect."
---

An automated file delivery produced two copies of the same content at the same destination. Two sibling tasks—separate executions derived from the same parent request—had been created. The first task may have completed the external action, but its user-interface evidence could not prove the final filename, so it reported an unknown result. The second task resumed later, saw only that its own local execution had not sent anything, and crossed the delivery boundary again.

The duplicate exposed a gap that appears in many agent and workflow systems. Task-local state can make each worker look safe while their combined external behavior is unsafe. Here, a side effect means an action that changes an external system. Preventing the next duplicate required a global decision for one side effect, including a rule for outcomes that could have succeeded even when confirmation was incomplete.

## The incident had an uncertain success, not a confirmed failure

The sanitized evidence established four facts:

- both tasks referred to the same destination and the same content bytes;
- the earlier task had activated controls that could submit the file;
- a new outgoing item appeared without a visible failure indicator;
- the interface changed how the item was displayed, so exact post-delivery identity could not be confirmed.

That evidence supported an `unknown` result. It did not support `not_sent`. The distinction matters because an automatic retry after a confirmed non-delivery can be safe, while a retry after a possible delivery can create a duplicate.

The later task relied on a narrower statement: *this task has not sent the file*. That statement was true and still insufficient. The external destination had already been affected by a sibling task.

## The missing identity belonged to the side effect

Each task had its own execution history, but the delivery had no identity shared across tasks. A restart, overnight continuation, delegated worker, or context reconstruction could therefore create another local execution that appeared new.

The repair defined a global idempotency key, a stable identifier that every attempt must reuse for the same intended effect, from two inputs: the destination identity and the content SHA-256. Their canonical values are joined into one key before any delivery action begins.

The destination component identifies where the side effect lands. The content hash identifies the bytes being delivered, independent of a local path or filename. In systems with provider-assigned channel or recipient IDs, those stable IDs are preferable to display names. A constrained desktop workflow may have only an exact visible title, and should record that limitation.

The key represents one intended external delivery. Every sibling, delegated worker, and resumed task must resolve the same key before it opens the attachment picker or invokes any equivalent side-effecting control.

## Unknown results consume the key

The gate uses three terminal interpretations:

- **`not_sent`**: evidence proves that no submission-capable control fired. A new unique executor may continue.
- **`sent_verified`**: the external result is confirmed. All matching tasks stop.
- **`send_status_unknown`**: submission may have occurred, but final confirmation is incomplete. All matching tasks stop.

The last row carries the safety property. Once a task may have crossed the external boundary, the key is consumed. A timeout, interface change, lost response, or interrupted readback cannot restore permission to retry.

The same rule applies when a transcript contains evidence that the attachment picker accepted the file or that the send control may have fired, even if the task did not produce a clean terminal label. Side-effect evidence has priority over a local status summary.

## Choose one executor and recheck near the boundary

Before performing any user-interface action, the workflow enumerates accessible parent, sibling, delegated, and resumed tasks that may share the key. It then applies these rules:

1. A matching consumed key stops the current task.
2. Multiple active matching tasks elect one executor; the earliest eligible task wins in the constrained implementation.
3. A matching `not_sent` result permits progress only when its evidence proves that the delivery boundary was not crossed.
4. Missing or unreadable relevant history stops the task because uniqueness cannot be established. This is fail-closed behavior: uncertainty removes authority to continue.

One early lookup is too weak for a long-running task. The complete check runs again after a restart, overnight continuation, timeout, context reconstruction, or other interruption. It also runs immediately before opening the attachment picker and again before activating a submission-capable control. Any state change invalidates the earlier decision.

These repeated checks narrow the race window. They do not make task-history search atomic. A system that requires a strict exactly-once guarantee should claim the key in a transactional shared store or use a provider idempotency token before any external request is accepted.

## Intentional redelivery needs a new authorization scope

A person may deliberately request another copy after being told that the first delivery probably succeeded. That request should create a new delivery intent with an explicit authorization record. It must not reinterpret the old task as an ordinary retry.

The new intent still elects one executor and performs the same pre-boundary checks. Recording the distinction preserves two separate facts: the first key was consumed, and a person knowingly authorized one additional side effect.

## Verification covered failure paths without sending another file

The implementation updated the delivery policy and its user-facing metadata, then passed the skill's structural validator. Seven read-only scenarios exercised the gate:

- no matching historical task;
- simultaneous matching tasks;
- a prior task proven `not_sent`;
- a prior `sent_verified` result;
- a prior `send_status_unknown` result;
- an overnight resume after a sibling may have sent;
- unavailable or unreadable task history.

The tests also covered informed redelivery while keeping only one executor. They did not open the external application or transmit a file. This verifies the policy branches and metadata contract without creating another real side effect.

## Lessons and limits

Idempotency must describe the external effect, not merely the worker that attempted it. Destination identity plus a content hash is a practical key for file delivery, and an uncertain result must consume that key whenever the boundary may have been crossed.

Task-history inspection is a useful fail-closed safeguard when an atomic store is unavailable. It remains vulnerable to a narrow race if two workers pass their final checks at the same instant. Stronger systems need transactional key claims, provider-side idempotency support, or leases with fencing tokens: increasing versions that invalidate an older worker's write authority.

Content hashes also do not express every business intention. Delivering identical bytes twice can be legitimate, and two visually identical destination names can refer to different recipients. Stable provider identities and explicit redelivery authorization should be included whenever the surrounding system can supply them.
