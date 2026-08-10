---
title: "Handing Off Automation Ownership Without Losing Recovery Evidence"
date: 2026-08-10
draft: false
tags: ["automation", "operations", "reliability", "git", "testing"]
categories: ["DevOps"]
description: "A safe automation handoff separates live authority, recovery evidence, retired execution paths, and disposable local state before anything is removed."
---

An automation handoff changes who may act, which instructions are current, and what evidence a future recovery can trust. Renaming the operator in one document does not complete that transfer. Old schedules can still run, stale playbooks can still grant authority, and an aggressive branch cleanup can erase the state needed to reconstruct an interrupted job.

A sanitized handoff exposed all three risks at once. The repository still named the former executor in active operating documents, while historical run branches and delivery artifacts remained part of the recovery model. Some retired publication routes also had value: their hard-deny implementations proved that forbidden operations stayed unavailable.

The safe approach was to classify every surface before changing it. Current authority moved together, historical evidence stayed readable, retired write paths remained explicitly blocked, and only items proven to be disposable were removed.

## One repository can contain four different kinds of state

A search for the former executor found many matches, but the matches did not have the same role.

| State class | Examples | Handoff action |
| --- | --- | --- |
| Live authority | operating rules, runtime contract, scheduler ownership, active playbook | update as one control plane |
| Recovery evidence | run branches, readback records, historical outputs, audit notes | preserve until retention policy says otherwise |
| Retired execution paths | disabled commands, rejection tests, migration notes | keep the hard-deny boundary |
| Disposable local state | clean unused worktrees, caches, temporary directories | remove after a read-only check |

Treating all four classes as “old content” creates opposite failures. Keeping stale live authority leaves two apparent operators. Deleting recovery evidence weakens retries and audits. Removing a disabled command together with its rejection test can make a future regression harder to detect.

The classification therefore had to come before cleanup.

## Move authority as one control plane

The active surface included repository instructions, the operator contract, scheduling prompts, the operating playbook, handoff documentation, and the current status description. They collectively answered three questions:

1. Which executor owns the next action?
2. What evidence must exist before that action is allowed?
3. Which operations remain outside the executor's authority?

Updating only one answer would leave an internally inconsistent system. The implementation changed the active documents together and added a dedicated operator runtime contract. The delivery automation kept its existing draft-only boundary, while the operator path received its own preconditions and fail-closed browser rules.

This separation prevented ownership from expanding silently. A new executor received the intended operating role without inheriting unrelated publication APIs, credential access, or permission to rewrite historical state.

## Preserve evidence without preserving stale authority

Historical run branches can look like clutter because they are no longer development branches. In this case, they carried the source revisions and delivery state used for reconciliation and recovery. Removing them would have made the repository visually simpler while weakening the controller's evidence chain.

The handoff retained those run branches, archived outputs, and historical notes. It also retained code that rejected deprecated publication routes. Their continued presence did not grant authority: the current runtime contract defined the live path, while tests kept the retired paths closed.

This distinction is useful beyond Git. A queue record, deployment manifest, external-object identifier, or readback receipt can be inactive operationally and still be necessary for recovery. Retention should follow its evidence role, not its age or branch prefix.

## Remove only items with a complete disposal proof

Cleanup targeted local worktrees, caches, temporary directories, and merged feature branches only after read-only checks established that they were clean, no longer active, and not referenced by the recovery flow.

The order mattered:

1. inventory active tasks, branches, worktrees, and current contracts;
2. move authority and add regression coverage;
3. merge the exact reviewed change;
4. verify the new control plane and scheduler state;
5. remove the items already proven disposable;
6. read back the final branch and task inventory.

Destructive cleanup happened after the replacement authority was verifiable. A deletion failure could then be reported independently without leaving the system between two owners.

## Verification must cover both permission and recovery

The implementation changed the active responsibility documents, introduced the operator contract, corrected unsupported status claims, and added regression coverage. Its validation reported 74 content-policy tests and 323 repository-automation tests, followed by a successful repository check on the reviewed head.

The final review also checked the operational boundary:

- current documents no longer assigned live responsibility to the former executor;
- draft delivery still had no publication authority;
- deprecated publication routes still failed closed;
- recovery branches and historical evidence remained available;
- the unused worktree and obsolete feature branches were gone;
- the repository and scheduler inventory matched the intended owner.

A clean text search alone could prove only the first item. The handoff was complete when authority, denial rules, recovery evidence, and actual runtime ownership agreed.

## Limits

This pattern assumes historical branches and outputs have a defined recovery or audit purpose. Repositories without that dependency may use a shorter retention policy. Evidence that contains sensitive data still needs access controls and an explicit deletion schedule; “needed for recovery” does not justify unlimited retention.

Scheduler migration may also require a staged pause when two hosts could run concurrently. The sanitized case had one active host and verified task ownership, so it did not prove a zero-downtime multi-host transfer.

The reusable rule is to map state by function before transferring automation ownership. Move live authority as one unit, preserve evidence that reconstructs prior work, keep retired routes demonstrably closed, and delete local or remote state only after its disposal proof is complete.
