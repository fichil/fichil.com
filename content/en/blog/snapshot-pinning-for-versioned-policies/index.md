---
title: "Pin Policy Snapshots Before Long-Running Automation Executes"
date: 2026-08-08
draft: false
tags: ["automation", "configuration", "reliability", "idempotency", "testing"]
categories: ["DevOps"]
description: "How versioned policy snapshots keep active jobs and retries reproducible while new rules roll out prospectively."
---

A long-running automation rarely makes every decision in one process. One step creates a plan, later workers produce artifacts, and a retry may resume hours after the original process exited. If those steps repeatedly read a mutable global policy, one logical run can be judged under several rule sets.

That failure appeared during a policy upgrade. The new version added stricter selection, metadata, and presentation requirements. It was meant for newly created plans, yet historical regression fixtures began seeing parts of the future-effective policy. Nothing in the old plan had changed. The interpretation around it had changed.

The safe rollout model was to choose the policy once, copy a normalized snapshot into the run plan, and make every later stage validate that snapshot. New versions could then move forward without silently rewriting the meaning of active jobs.

## The observable failure is a moving decision boundary

The first useful question was not whether the new rules were correct. It was whether one run produced the same decision after time passed.

The sanitized evidence covered three plan generations:

| Evidence | Result |
| --- | --- |
| Historical plan fixtures | Preserved their embedded v2-v4 rules |
| New plan fixture | Selected v5 only after its effective boundary |
| Retry and recovery tests | Reused the original plan snapshot |
| Validator tests | Applied the schema belonging to the recorded version |
| Repository verification | Content QA, controller, guard, compilation, and safety checks passed |

The risky design resolved policy from the current configuration whenever a stage ran. A retry therefore had two identities: the old content plan and the newest policy. That combination is internally inconsistent. It can reject an artifact that previously passed, accept one under rules the creator never saw, or make a recovery attempt produce different output.

## Select policy when the plan is created

The plan-creation boundary owns policy selection. It has the run date, requested operation, and configuration versions available at that moment. Once it chooses a version, it should store both the version and the normalized values that affect decisions.

```json
{
  "run": "example",
  "version": "v5",
  "effective": "YYYY-MM-DD",
  "snapshot": {
    "min_score": 75,
    "sources": [1, 1],
    "evidence": [
      "claims",
      "mobile"
    ]
  }
}
```

The snapshot should contain decision inputs, not secrets or unrelated configuration. Normalizing it before storage also matters: defaults, ordering, and optional fields must already have one deterministic representation. A hash can then bind downstream evidence to the exact snapshot.

An effective date controls which version a new plan may select. It does not authorize workers to replace the policy of an existing plan.

## Make every stage consume the same snapshot

After plan creation, the global policy file stops being the source of truth for that run. Generation, review, completion, recovery, and readback all consume the embedded snapshot.

A strict controller follows this sequence:

1. Load the run plan and require a supported `policy_version`.
2. Validate the embedded snapshot with the schema for that version.
3. Recompute its identity and compare it with the plan or checkpoint binding.
4. Pass the same snapshot to generators and reviewers.
5. Reject missing, malformed, or mismatched snapshots instead of falling back to the latest global policy.

The last rule closes an easy compatibility hole. A fallback to “current” configuration may make a broken historical plan appear recoverable, but the resumed result no longer proves the original run.

## Version the validator as well as the configuration

Keeping an old JSON object is insufficient when one validator assumes only the newest schema. The validator needs explicit version dispatch.

```text
policy_version
  |
  +-- v2 -> validate_v2
  +-- v3 -> validate_v3
  +-- v4 -> validate_v4
  +-- v5 -> validate_v5
```

Each version defines the fields, defaults, and invariants that existed when its plans were created. Shared checks can stay in common helpers, while version-specific checks remain visible. This structure also makes retirement deliberate: removing a validator requires proving that no recoverable plan still references it.

The same distinction applies to tests. A new-policy test proves prospective behavior. Historical fixtures prove that old plan identities remain stable. Both are required for a safe rollout.

## Verify the transition, not only the new rules

The implementation was checked at several boundaries:

- policy tests confirmed that v5 became eligible only for new plans after its activation point;
- locked v2-v4 fixtures retained their stored behavior;
- controller tests covered creation, completion, retry, and recovery paths;
- guard tests rejected lowered thresholds, unsupported evidence, and falsified compatibility claims;
- content QA tests checked that new reader-visible metadata and mobile evidence participated in hashing;
- compilation, repository safety scanning, and diff checks passed;
- the protected change and its integrated default-branch result both passed CI.

The largest individual groups contained 112 controller tests, 80 content-QA tests, and 44 guard tests. Test counts alone are insufficient evidence. Their distribution shows that compatibility was exercised where state actually crosses stages.

## Limits and operational exceptions

Snapshot pinning preserves reproducibility; it should not freeze a known-dangerous rule forever. A security or legal emergency may require a global deny rule that blocks every version. That exception should be explicit, narrowly scoped, and recorded separately from ordinary policy evolution.

Some changes also require migration. A migration should create a new plan identity or a recorded revision that explains which fields changed and why. Mutating the old snapshot in place destroys the evidence needed to compare the original and revised decisions.

The reusable conclusion is simple: mutable policy selects the next run, while the run's snapshot governs its complete lifecycle. Version the validator, fail closed when the binding is missing, and test both the new policy and the historical plans that must remain recoverable.
