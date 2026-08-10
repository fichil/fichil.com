---
title: "Safely Revising Completed Jobs with a Fail-Closed State Machine"
date: 2026-08-09
draft: false
tags: ["automation", "state-machine", "reliability", "idempotency", "testing"]
categories: ["DevOps"]
description: "How an explicit revision lifecycle can reopen a completed external-delivery job without duplicating remote objects or trusting stale review evidence."
---

A completed automation job is more than a status flag. It may already have created remote objects, read them back, stored quality evidence, and closed a lease. An ordinary retry should therefore be a zero-write operation. Repeating the delivery can duplicate an object or replace evidence that once described a different artifact.

Human review creates a legitimate exception. A delivered draft can be complete from the controller's perspective and still need clearer writing or a better layout. Treating that request as another ordinary retry leaves the controller with no way to distinguish harmless replay from an authorized revision.

The safe change was to add a separate, fail-closed revision lifecycle. It binds one explicit request to the completed source state, invalidates evidence that has become stale, preserves the identities of existing remote objects, and refuses completion until the revised artifacts have been updated and read back.

## The failure starts with an ambiguous completed state

The sanitized case involved a two-artifact, draft-only delivery. Both drafts had passed review, had been saved, and had complete readback evidence. The normal finalize command correctly returned an already-complete decision without writing anything.

After human review rejected the presentation, the job needed to change both drafts. Reusing the normal finalize path would have mixed two incompatible meanings:

- an idempotent retry means the completed result must remain unchanged;
- a revision means selected artifacts are expected to change.

A hidden override would weaken both guarantees. It could create replacement objects when the original identities were missing, or it could leave an old review packet attached to new content.

The controller needed a new transition whose inputs and completion rules were visible in durable state.

## Bind the revision before reopening the job

The revision request records a reason, a request digest, and the exact artifact scope. The digest is an identity anchor for the request; it is not publication authority.

Before it opens the lifecycle, the controller checks the completed source:

1. The delivery mode permits revision without publication.
2. The original job is complete and has no publication signal.
3. Every requested artifact has a bound remote identity and verified readback.
4. The review workflow still points to the current delivery head.
5. No other revision lifecycle is active.

If any prerequisite is missing, the controller returns a zero-write decision. It does not infer that a missing remote object should be recreated.

The prepared record also captures the superseded content and QA hashes. Those values define what the revision must replace and prevent a later retry from quietly changing its starting point.

## Reopen only the state that must change

Preparing a revision does not erase the completed history. It creates a new sequence number and moves the current completion status back to pending readback. Existing remote identities and checkpoints remain attached to the run, so downstream delivery can use update semantics.

At the same time, the old review packet becomes invalid. It was bound to the superseded content and cannot approve the revision.

The durable transitions are deliberately small:

- `COMPLETED → REVISION_PREPARED`: accept an explicit request after checking the completed source;
- `REVISION_PREPARED → REVISION_COMPLETED`: update the bound objects and verify fresh readbacks;
- `REVISION_PREPARED → REVISION_FAILED`: record a failed delivery or expired lease;
- `REVISION_FAILED → REVISION_PREPARED`: resume only with the same request binding.

This transition separates durable history from mutable delivery state. The completed result remains auditable, while the new sequence explains why the controller is allowed to change selected artifacts.

## Make completion prove a real revision

The controller does not accept a successful command exit as completion. Each requested artifact must satisfy all of the following:

- its content hash differs from the superseded content hash;
- its QA hash differs from the superseded QA hash;
- the delivery action is an update of the bound remote object;
- a fresh readback matches the revised title, summary, body, and assets;
- the new review packet binds the current content and QA evidence;
- the current review head and publication guard remain valid.

These checks close two subtle gaps. First, a revision cannot complete after changing only one member of a paired delivery. Second, updating an object is insufficient without reading the stored result back from the external boundary.

If the remote identity disappears, the revision stops. Creating a replacement may be a valid recovery policy, but it needs its own explicit transition and evidence. It must not be smuggled into an update-only revision.

## Resume failures by request identity

External delivery can fail after the controller has invalidated the old review packet but before readback completes. The job is then neither ordinarily complete nor safe to restart from scratch.

Recovery is allowed only when the retry presents the same request digest, reason, artifact scope, sequence, and superseded bindings. A different request cannot take over the unfinished lifecycle. It must wait for the current revision to reach a terminal state and then create a new sequence.

This rule makes retry behavior deterministic. The controller knows whether it is continuing one revision or starting another, and concurrent workers cannot reinterpret the same pending state.

## Verification and limits

Targeted controller tests covered the command contract, preparation, stale-review invalidation, preserved identities, changed-hash requirements, update readbacks, same-request recovery, and rejection of unrelated bootstrap changes. A sanitized same-day run also exercised a missing-identity stop before later completing through verified reconciliation without duplicate creation.

The first implementation did not complete every historical test fixture in the repository. The evidence therefore supports the revision state machine and its exercised boundaries; it does not claim blanket certification of unrelated automation behavior.

This pattern applies to jobs that write drafts, tickets, deployments, or other external objects. Keep ordinary completion idempotent. Reopen it through an explicit revision record, preserve external identity, invalidate stale evidence, and require a new readback before declaring the revised job complete.
