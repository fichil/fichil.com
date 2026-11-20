---
title: "Reclaiming Deployment Disk Space Without Losing Rollback Evidence"
date: 2026-11-20T09:10:00+08:00
draft: false
tags: ["Deployment", "Backups", "Windows", "Operational Safety"]
categories: ["DevOps"]
description: "A Windows deployment case that recovered disk space by replacing verified duplicate snapshots with references and pruning only eligible release uploads."
---

A Windows production host was running low on disk space while the application was still healthy. The deployment inventory pointed to two sources of growth: historical database snapshots copied into successive rollback backups, and uploaded release packages that remained on disk after their deployment requests had finished.

The two groups required different proofs before deletion. A snapshot copy was redundant only if an original with the same contents could still be located. An upload could expire only after its deployment record showed that it was outside the active and retained releases.

## Follow each file back to its recovery role

A release backup held the operational data needed for rollback. It also copied directories that already held historical database snapshots. Checking file size and SHA-256 for both locations showed that some of those snapshot copies matched their originals. The same inventory identified older release uploads with matching request and status records.

The growth came from repeatedly copying archival data during each release and keeping uploads after their useful retention period. A blanket age cutoff would have skipped the recovery question: which remaining file can supply the same data, and which release still needs its package?

## Write the reference before removing the copy

For a duplicate snapshot, the cleanup checks the backup copy against the corresponding original. Before removing a verified copy, it writes a backup manifest entry containing the original's relative location, size, and digest. A missing original or a mismatch leaves the copy in place. The manifest lets an operator locate and verify the retained snapshot during a recovery review.

New backups in the fixed installation follow the same division. They still copy and verify the operational data, and they record references to the separately retained historical snapshots. The free-space preflight uses the same file scope as the backup. That keeps the space estimate aligned with what the backup will actually copy.

Uploads have their own rule. The current release and the three retained successful versions are protected. An older ZIP becomes eligible only after the matching request has been in an allowed terminal state for at least 24 hours and the package digest matches its recorded digest. Unknown files, failed requests, and incomplete uploads stay outside automatic deletion. Request and status records are retained.

## Recheck safety under the deployment lock

The cleanup command defaults to a preview that lists candidates, protected items, and estimated bytes. Applying it uses the same lock as deployment. The controller checks for pending work and rechecks deployment identity and candidate file evidence before removal. It stops if the deployment context changes and skips individual files that fail path or checksum checks. Windows junctions and other redirected paths are outside the cleanup scope.

A preview describes what was eligible at the time of inspection. The apply step establishes eligibility again and records what it actually removed or skipped. This matters when a new deployment or a file change makes an earlier inventory stale.

## Verify recovery data and service health separately

The rollout acceptance checked three retained rollback backups, all four original archive snapshots, database integrity, and unchanged snapshot digests. It also confirmed that the service remained healthy after the rollout and that automated upload retention had run. The disk measurement showed about six additional GiB of free space on this host.

A reference keeps recovery information while avoiding another local copy. It still depends on the referenced original. When disaster recovery requires surviving the loss of the whole disk, keep and test an independent backup. For local release retention, the working rule is to prove what still serves every recovery role before reclaiming space. Then check the retained data and the running application independently.
