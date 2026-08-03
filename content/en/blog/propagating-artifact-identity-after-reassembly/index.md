---
title: "Keeping Hashes, QA, and Capability Certifications Consistent After Reassembly"
date: 2026-08-03
draft: false
tags: ["artifact-integrity", "quality-gates", "provenance", "media-pipeline", "testing"]
categories: ["Quality Engineering"]
description: "A derived artifact can pass local checks while downstream QA and capability records still point to an older file. This article shows how to propagate identity changes through the full attestation graph."
---

A media pipeline successfully reassembled its final video after one source clip was replaced. The new file passed the repository's technical checks and received a fresh visual scorecard. An independent audit still failed: the state record contained the hash of the previous final file.

Fixing that single hash exposed a second stale binding. The pipeline's capability certification still referenced both the old final file and the old comparison scorecard. The incident showed that replacing a derived artifact is a state transition across an evidence graph, not merely a filesystem write.

## The first failure was useful

The independent audit compared three identities:

| Evidence | Expected binding |
| --- | --- |
| File on disk | SHA-256 of the current assembled artifact |
| Task state | The same current SHA-256 |
| Visual scorecard | The same current SHA-256 plus hashes of its inputs |

The file and scorecard agreed, but task state still pointed to the previous artifact. The audit stopped before final approval. That was the correct outcome: a technical pass says that a file is decodable and meets measurable thresholds; it does not prove that every approval record refers to that file.

The immediate cause was lifecycle ordering. The pipeline wrote `final.mp4` during assembly, but updated `final_sha256` only during final approval. Any independent check between those two operations necessarily saw a stale state record.

## Artifact identity belongs at the assembly boundary

The repair moved identity binding to the operation that creates or replaces the artifact:

```python
def assemble_and_bind(state, output):
    assemble(output)
    technical_result = run_technical_gates(output)
    if not technical_result.passed:
        raise GateFailure(technical_result.reasons)

    state["final_sha256"] = sha256(output)
    state["final_bound_at"] = now()
    save(state)
```

This ordering establishes a precise contract: after successful assembly and technical validation, task state identifies the current artifact even though visual approval is still pending. Final approval can then validate that its scorecards bind to the same identity instead of mutating identity as a side effect.

The pipeline also needed a bounded reconciliation path for an artifact produced before the fix. Reconciliation was allowed only while approval was pending, only after technical QA had passed, and only when the current visual scorecard already bound the file on disk. It recorded both the previous and current hashes. That made repair fail closed instead of turning a general-purpose command into an escape hatch.

## Follow the attestation graph downstream

Updating task state was necessary but incomplete. The same artifact identity appeared in a downstream capability record:

```text
assembled artifact
  -> technical QA
  -> visual scorecard
  -> comparison scorecard
  -> capability certification
```

Each arrow is a dependency. When the artifact changes, every descendant attestation must be recalculated, invalidated, or proven independent of the change. Leaving one descendant untouched creates a split-brain result: the current task looks approved while a registry still certifies an older file.

The capability refresh used four safeguards:

1. refresh an existing pass only for the same task and the same capability mode;
2. require the current technical, visual, and comparison gates to pass;
3. copy the replaced certification into an append-only `history` entry marked as superseded;
4. preserve unrelated modes and the registry's overall qualification state.

These constraints matter because rework should not silently certify a different task, broaden a capability, or erase the evidence that supported an earlier decision.

## Invalidation needs an explicit policy

A derived artifact system benefits from classifying every downstream record by how it reacts to an identity change:

| Dependency type | Required action after replacement |
| --- | --- |
| Content-bound | Recompute or invalidate |
| Input-set-bound | Recompute if any bound input changed |
| Task-bound but content-independent | Verify task identity, then retain |
| Historical | Preserve as superseded, never present as current |

This classification prevents two common errors. Blanket deletion destroys audit history. Blanket reuse presents stale evidence as current. A dependency-specific policy keeps the current state strict while retaining a trace of what changed.

## Verification must prove both failure and recovery

The repaired pipeline was verified at several levels:

- the independent audit first failed on the stale hash instead of accepting a technically valid but misbound file;
- a targeted test proved that assembly binds the current artifact before visual approval;
- reconciliation tests rejected missing technical evidence and mismatched scorecards;
- capability tests refreshed only same-task evidence, retained the old certification in history, and left other capability modes unchanged;
- the full offline suite completed with 277 passing tests;
- a final read-only audit confirmed that the production state did not change while evidence was inspected.

The useful signal is not the test count by itself. The tests cover the state transitions that caused the incident: creation, pending approval, reconciliation, same-task rework, historical preservation, and unrelated capability isolation.

## Practical design rules

This pattern applies to videos, compiled packages, generated reports, machine-learning models, signed archives, and any other artifact whose approvals are hash-bound.

1. Bind identity where the artifact becomes authoritative, not in a later approval step.
2. Store the hashes of evidence inputs, not only the final decision.
3. Model approvals and certifications as a dependency graph.
4. Make replacement trigger deterministic invalidation or refresh rules.
5. Preserve replaced attestations as history, clearly separated from current truth.
6. Add an independent verifier that reads state without repairing it automatically.

## Limits

Hash agreement proves that records refer to the same bytes. It does not prove that the artifact is correct, visually acceptable, safe, or fit for every downstream consumer. Those properties still require their own gates.

The approach also assumes that state updates can be made reliably after artifact creation. Systems that cannot atomically publish a file and its metadata need a recoverable two-phase protocol, such as writing a pending record, moving the artifact into place, and then committing the current binding. The exact storage mechanism can vary; the invariant remains the same: no current certification may point to superseded bytes.
