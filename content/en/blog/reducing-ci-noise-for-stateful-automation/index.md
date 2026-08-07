---
title: "Preventing CI Notification Storms on High-Churn State Branches"
date: 2026-08-07
draft: false
tags: ["github-actions", "ci", "automation", "reliability", "testing"]
categories: ["DevOps"]
description: "How to keep required repository checks meaningful when an automation branch frequently commits heartbeats, checkpoints, and other run state."
---

A scheduled automation stored its recovery state in Git. During one long run, it committed lease heartbeats, checkpoints, and readback results to a dedicated branch. Those writes were intentional: another process could reconstruct ownership and resume safely after a failure.

The repository's continuous-integration workflow treated every state write as a code change. Once a pull request was open, one commit could create both a branch `push` run and a `pull_request` run. A genuine fixture failure was therefore reported again and again as the state branch advanced. The result was a notification storm that made one defect look like dozens of new incidents.

The durable fix was to align CI with review boundaries. State commits remained auditable, while full validation moved to the moments when code was ready for review and when the reviewed result entered the default branch.

## Evidence before changing the workflow

The first step was to correlate notifications, workflow runs, commits, and pull-request state. The sanitized history showed this pattern:

| Evidence | Observation |
| --- | --- |
| State branch | Heartbeats and checkpoints produced frequent, legitimate commits |
| Workflow triggers | Both `push` and `pull_request` applied to the same branch history |
| Open draft | Most branch pushes also synchronized the pull request |
| Failure signature | Repeated runs failed in the same test fixtures, at the same assertion boundary |
| Notification count | 40 pushes produced 40 push runs and 39 pull-request runs |

The repeated failures were not false alerts. One test had a temporary directory cleanup race. Later failures came from historical fixtures being rebound to a newer, future-effective policy. The alert volume was still misleading because the trigger design multiplied those failures across operational state commits.

This distinction matters. Disabling notifications would hide a real regression. Fixing only the tests would leave the repository ready for the next storm. Both the failing assertions and the event model needed attention.

## Model three different kinds of commit

The branch carried three classes of change:

1. **Operational state**: lease heartbeats, checkpoints, and recovery evidence.
2. **Reviewable implementation**: controller, tests, workflow, or documentation changes.
3. **Integrated result**: the exact revision merged into the default branch.

They do not need the same validation cadence. Operational state needs cheap structural guards and deterministic writers. Reviewable implementation needs the full suite before it becomes mergeable. The integrated result needs one regression on the exact default-branch commit.

GitHub Actions can react independently to `push` and `pull_request` events, and pull-request activity can be narrowed with `types` such as `ready_for_review` ([events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)). The workflow should express those boundaries directly.

## Put full CI at the review boundaries

The generalized workflow shape was:

```yaml
name: Repository checks

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
    types:
      - opened
      - reopened
      - synchronize
      - ready_for_review
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    # Draft condition here.
    runs-on: ubuntu-latest
    steps:
      - uses: >-
          actions/checkout@v7
      - run: >-
          python -m unittest
          discover -s tests
          -p 'test_*.py' -v
```

Each part has a separate job:

- `push` is limited to `main`, so a state branch no longer launches a second full run for every checkpoint.
- A Draft pull request still creates a visible check, but the validation job is skipped.
- `ready_for_review` runs the full suite at the transition where the change becomes mergeable.
- Later synchronization of a non-Draft pull request runs the suite again against the new head.
- The merge commit receives one full `main` regression.

GitHub documents an important status-check difference here. If an entire required workflow is suppressed by path filtering, branch filtering, or a skip message, its check can remain pending and block the pull request. A job skipped by an `if` condition reports a successful conclusion for merge gating ([troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)). That is why a job-level Draft condition was safer than making the required workflow disappear.

## Collapse obsolete runs without weakening the latest check

High-churn branches can receive another commit while an earlier validation is still running. Testing both heads rarely helps when only the newest head can be merged.

A concurrency group keyed by pull-request number or ref gives all runs for the same review lineage one identity. With `cancel-in-progress: true`, a newer run replaces an obsolete in-progress run. GitHub's concurrency contract allows one running and one pending member per group by default, and the cancel option also stops the older running member ([workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)).

The group key must include the workflow or repository context needed to avoid collisions. Reusing a broad literal group across unrelated workflows can cancel work that should remain independent.

## Keep cheap safety checks close to the writer

Reducing hosted CI does not authorize arbitrary state commits. The automation still needs local, deterministic gates before each write:

- validate the state schema and transition;
- confirm the lease owner and expected remote head;
- limit the write set to approved state paths;
- use a normal fast-forward push;
- make retries idempotent;
- preserve enough evidence for another process to reconstruct the run.

For this case, the controller also combined a checkpoint and lease refresh into one fast-forward commit when both belonged to the same transition. That reduced write frequency without weakening recovery. An early heartbeat became a zero-write success when the existing lease was still fresh.

These changes address the source of branch churn. Workflow filtering alone would reduce runner usage while leaving unnecessary state transitions in place.

## Verification at the real boundary

The revised path was verified in four layers:

1. Workflow-structure tests checked the default-branch-only push trigger, Draft condition, pull-request activity types, concurrency key, and test discovery.
2. Controller tests covered lease, checkpoint, recovery, and historical policy-snapshot behavior.
3. A Draft pull request produced a skipped validation job without consuming a runner for the full suite.
4. The Ready head passed one full pull-request validation, and the merge commit passed one full default-branch regression.

The final check used the exact reviewed head and the exact merge commit. A passing run on an earlier checkpoint would not prove the revision that entered `main`.

## Limits and tradeoffs

This design fits repositories where Draft means “state is still being assembled” and Ready means “run the complete merge gate.” A team that expects every Draft commit to be fully testable should keep those pull-request runs.

Cancellation is also inappropriate when every intermediate revision produces a required artifact or migration result. In that case, queueing or separate workflow identities may be safer.

The reusable conclusion is to classify writes before assigning CI. Frequent operational state can remain in Git, but it should not inherit the validation cost and alert semantics of reviewable code. Keep lightweight invariants at the writer, run the full suite at explicit review boundaries, and verify the exact commit that will be merged.
