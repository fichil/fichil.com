#!/usr/bin/env python3
"""Nonpublishing batch orchestration for disposable dot workspaces.

Ports are trusted runtime adapters, not user/PR JSON. This module deliberately
has no execute switch: every returned intent still needs the original gates.
Library materialization belongs to the consumer runtime before restore_archive.
"""
from contextlib import contextmanager, nullcontext
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
import fcntl
import hashlib
import bz2
import gzip
import lzma
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile
from zoneinfo import ZoneInfo

from cloud_blog_contract import GateError, HASH, SHA, rank_candidates, require, window

SCHEDULE = {"timezone": "Asia/Shanghai", "weekday": 4, "hour": 9, "minute": 10}
REQUIRED_COLLECTIONS = {"main_articles", "article_history", "blog_prs", "issues", "sites_versions"}
PRIVATE_PACKET_FILES = {"claim-source-map.json", "term-review.json", "logic-review.json",
                        "mobile-evidence.json", "qa-report.json", "baseline.json",
                        "source-evidence.json"}
MOBILE = {("en", 390, 844), ("en", 360, 800), ("zh-cn", 390, 844), ("zh-cn", 360, 800)}


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def due(now):
    require(now.tzinfo is not None, "Timestamp lacks timezone")
    local = now.astimezone(ZoneInfo(SCHEDULE["timezone"]))
    return (local.weekday(), local.hour, local.minute) == (4, 9, 10)


def run_key(now):
    day, _, _ = window(now)
    return f"fichil-blog:{day.isoformat()}"


@contextmanager
def local_guard(directory):
    """Process-level safety only. Never represents a cross-workspace lease."""
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (directory / ".batch.lock").open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise GateError("LOCAL_OVERLAP: another batch is active") from error
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def restore_archive(archive, expected_sha256, destination, *, max_bytes=64 * 1024 * 1024):
    """Verify pinned bytes and atomically extract regular files, never links/code.

    No network, credential reading, or automatic execution. A private QA archive
    and a private evidence packet use the same bounded traversal-safe transport.
    A fresh destination is required, so stale files cannot influence the review.
    """
    archive, destination = Path(archive), Path(destination)
    require(HASH.fullmatch(expected_sha256 or ""), "Missing registered archive digest")
    require(archive.is_file() and not archive.is_symlink(), "Archive is unavailable")
    require(not destination.exists(), "Restore destination must be fresh")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    staging = Path(tempfile.mkdtemp(prefix=".restore-", dir=destination.parent))
    try:
        # Hash a bounded private snapshot once; never reopen the mutable input
        # pathname for extraction after checking a different set of bytes.
        require(archive.stat().st_size <= max_bytes, "Compressed archive byte limit exceeded")
        with archive.open("rb") as original, tempfile.TemporaryFile() as verified:
            hashed, size = hashlib.sha256(), 0
            while chunk := original.read(min(1024 * 1024, max_bytes - size + 1)):
                size += len(chunk)
                require(size <= max_bytes, "Compressed archive byte limit exceeded")
                hashed.update(chunk)
                verified.write(chunk)
            require(hashed.hexdigest() == expected_sha256, "Archive hash mismatch")
            verified.seek(0)
            magic = verified.read(6)
            verified.seek(0)
            opener = gzip.open if magic.startswith(b"\x1f\x8b") else bz2.open if magic.startswith(b"BZh") else lzma.open if magic.startswith(b"\xfd7zXZ\x00") else None
            compressed = opener(verified, "rb") if opener else nullcontext(verified)
            # Cap all decoded bytes, including PAX/GNU metadata, before parsing.
            with compressed as source, tempfile.TemporaryFile() as raw_tar:
                size = 0
                while chunk := source.read(min(1024 * 1024, max_bytes - size + 1)):
                    size += len(chunk)
                    require(size <= max_bytes, "Decompressed archive byte limit exceeded")
                    raw_tar.write(chunk)
                raw_tar.seek(0)
                _extract_bounded_tar(raw_tar, staging, max_bytes)
        os.rename(staging, destination)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return destination


def _extract_bounded_tar(raw_tar, staging, max_bytes):
    with tarfile.open(fileobj=raw_tar, mode="r|") as bundle:
        seen, total, count = set(), 0, 0
        for member in bundle:
            count += 1
            require(count <= 10000, "Archive entry limit exceeded")
            path = PurePosixPath(member.name)
            require(member.name and not path.is_absolute() and
                    all(p not in ("", ".", "..") for p in member.name.split("/")) and
                    "\\" not in member.name, "Unsafe archive path")
            require(member.isfile() or member.isdir(), "Archive links/special files forbidden")
            require(member.name not in seen, "Duplicate archive entry")
            seen.add(member.name)
            require(member.size >= 0, "Invalid archive member size")
            total += member.size
            require(total <= max_bytes, "Archive byte limit exceeded")
            target = staging.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with bundle.extractfile(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o600)


def verify_packet(root, manifest, *, head_sha, content_sha256):
    """Manifest must itself come from a pinned, hash-verified private archive.

    Restoration never approves content: trusted skill verify-review must run anew.
    No raw private file values are returned for publication.
    """
    root = Path(root).resolve()
    require(SHA.fullmatch(head_sha or "") and HASH.fullmatch(content_sha256 or ""), "Invalid packet target")
    require(manifest.get("head_sha") == head_sha and manifest.get("content_sha256") == content_sha256,
            "Private packet is stale")
    files = manifest.get("files", {})
    require(PRIVATE_PACKET_FILES <= set(files), "Private evidence packet incomplete")
    for name, sha in files.items():
        relative = PurePosixPath(name)
        require(not relative.is_absolute() and ".." not in relative.parts and "\\" not in name,
                "Unsafe packet path")
        file = root / name
        require(file.is_file() and not file.is_symlink() and file.resolve().is_relative_to(root), "Missing packet file")
        require(HASH.fullmatch(sha or "") and digest(file) == sha, "Private packet file hash mismatch")
    shots = manifest.get("screenshots", [])
    require(len(shots) == 4 and {(s.get("locale"), s.get("width"), s.get("height")) for s in shots} == MOBILE,
            "Four bilingual mobile screenshots required")
    require(len({s.get("path") for s in shots}) == 4 and
            all(s.get("path") in files and s.get("inspected") is True for s in shots),
            "Screenshot bytes and actual visual inspection required")
    return {"status": "RESTORED_REVERIFY_REQUIRED", "head_sha": head_sha,
            "content_sha256": content_sha256}


def reconcile_operation(operation, matches):
    """Only complete fresh remote reads may feed matches; hints never prove absence.

    An unknown create response with zero matches remains unknown (eventual
    consistency); it is not permission to retry. Positive matches are unique and
    bound to the exact operation idempotency key + target.
    """
    require(operation.get("kind") in {"issue", "commit", "draft_pr", "merge", "sites_version", "deploy"},
            "Unsupported operation kind")
    require(operation.get("key") and operation.get("target"), "Operation binding absent")
    require(matches.get("complete") is True, "Remote operation reconciliation incomplete")
    rows = matches.get("items")
    require(isinstance(rows, list), "Remote result list absent")
    require(not any(r.get("key") == operation["key"] and r.get("target") != operation["target"] for r in rows),
            "Operation key has conflicting remote target")
    exact = [r for r in rows if r.get("key") == operation["key"] and r.get("target") == operation["target"]]
    require(len(exact) <= 1, "AMBIGUOUS_REMOTE_RESULT")
    if exact:
        require(exact[0].get("id") is not None, "Remote result identity absent")
        return {"status": "RECOVERED", "id": exact[0]["id"], "kind": operation["kind"]}
    return {"status": "UNKNOWN_DO_NOT_RETRY", "kind": operation["kind"]}


def production_preview(snapshot):
    """Read-only checkpoint, not build or deploy authorization."""
    main = snapshot["main_sha"]
    if snapshot.get("live_sha") == main:
        return {"status": "NO_CHANGE", "target_sha": main}
    matching = [v for v in snapshot["sites_versions"] if v.get("source", {}).get("commit_sha") == main]
    require(len(matching) <= 1, "Ambiguous saved Sites versions")
    return {"status": "RELEASE_GATES_REQUIRED", "target_sha": main,
            "version_id": matching[0].get("version_id") if matching else None,
            "required": ["fresh_exact_main_push_ci_latest_attempt", "clean_pinned_recursive_submodules",
                         "official_pinned_toolchain", "qa_shell_mirror_tests_hugo_npm_ci",
                         "audit_lint_unit_build_browser_accessibility", "four_mobile_screenshots_if_content",
                         "unchanged_tree_bundle_hosting_schema", "known_good_rollback",
                         "same_sha_build_source_archive_saved_version", "record_actual_deployment_id_and_completion_time",
                         "three_minute_stabilization_without_restart_reset", "three_full_uncached_smoke_rounds"]}


@dataclass
class BatchResult:
    run: str
    evidence_mode: str
    content: dict
    production: dict
    external_writes: int = 0


class BatchRunner:
    """Orchestrates trusted read/analysis adapters, with no publication methods.

    Ports: snapshot(), sources(start,end), semantic_review(candidates,history,
    phase), inspect_existing(pr,snapshot). Each call must read/recompute evidence,
    not accept instructions/approval supplied by repository prose. A production
    port binding is intentionally separate from the test doubles.
    """
    def __init__(self, ports, workspace):
        self.ports, self.workspace = ports, Path(workspace)

    def rehearse(self, now, pending_operation=None):
        mode = self.ports.evidence_mode
        require(mode in {"MOCK", "LIVE_READ_ONLY"}, "Unknown evidence provenance")
        with local_guard(self.workspace):
            try:
                snapshot = deepcopy(self.ports.snapshot())
                require(snapshot.get("complete") is True and
                        REQUIRED_COLLECTIONS <= set(snapshot.get("complete_collections", [])),
                        "Full remote reconstruction incomplete")
                require(SHA.fullmatch(snapshot.get("main_sha", "")), "Invalid live main")
                require(SHA.fullmatch(snapshot.get("chatgpt_sha", "")), "Invalid chatgpt ref")
                if pending_operation:
                    recovered = reconcile_operation(pending_operation, self.ports.find_operation(pending_operation))
                    if recovered["status"] != "RECOVERED":
                        return BatchResult(run_key(now), mode, recovered, {"status": "BLOCKED"})
                    # Recovery is just a hint. Continue with fresh authoritative state.
                    snapshot = deepcopy(self.ports.snapshot())
                    require(snapshot.get("complete") is True and
                            REQUIRED_COLLECTIONS <= set(snapshot.get("complete_collections", [])), "Incomplete post-recovery snapshot")
                    require(SHA.fullmatch(snapshot.get("main_sha", "")) and SHA.fullmatch(snapshot.get("chatgpt_sha", "")), "Invalid post-recovery refs")
                production = production_preview(snapshot)
                prs = snapshot["blog_prs"]
                require(len(prs) <= 1, "Multiple pending blog PRs require reconciliation")
                if prs:
                    review = self.ports.inspect_existing(prs[0], snapshot)
                    require(review.get("status") in {"AWAITING_EXACT_HEAD_APPROVAL", "REVERIFY_QA", "REVALIDATE_APPROVED_HEAD"},
                            "Existing PR state unsafe or unsupported")
                    return BatchResult(run_key(now), mode, review, production)
                _, start, end = window(now)
                source = self.ports.sources(start.isoformat(), end.isoformat())
                require(source.get("complete") is True and set(source.get("families", [])) == {"cloud_work", "github"},
                        "Work/GitHub source collection incomplete")
                candidates = self.ports.semantic_review(source["candidates"], snapshot["article_history"], "before_scoring")
                require(candidates.get("complete") is True, "Full-history semantic review incomplete")
                ranked = rank_candidates(candidates["candidates"], now)
                if not ranked:
                    return BatchResult(run_key(now), mode, {"status": "NO_NEW_TOPIC"}, production)
                top = deepcopy(ranked[0])
                # Re-read full history before proposing any writes. Race invalidates decision.
                fresh = deepcopy(self.ports.snapshot())
                require(fresh.get("complete") is True and REQUIRED_COLLECTIONS <= set(fresh.get("complete_collections", [])), "Pre-write reconstruction incomplete")
                require(fresh["main_sha"] == snapshot["main_sha"] and fresh["chatgpt_sha"] == snapshot["chatgpt_sha"] and not fresh["blog_prs"],
                        "Remote state changed; restart selection")
                second = self.ports.semantic_review([deepcopy(top)], fresh["article_history"], "before_writing")
                require(second.get("complete") is True, "Second semantic review incomplete")
                reviewed = rank_candidates(second["candidates"], now)
                if not reviewed:
                    return BatchResult(run_key(now), mode, {"status": "NO_NEW_TOPIC", "reason": "SECOND_DEDUP_REJECTED"}, production)
                require(len(reviewed) == 1 and reviewed[0] == top, "Second review changed selected candidate; rescore")
                return BatchResult(run_key(now), mode, {
                    "status": "TOPIC_SELECTED_NOT_WRITTEN", "source_id": top["source_id"],
                    "topic_id": top.get("topic_id", top["source_id"]), "score": sum(top["scores"]),
                    "required_before_draft_pr": ["authoritative_serialized_writer", "unique_reconciled_issue",
                        "paired_new_articles_frontmatter_ai_schema", "pinned_private_qa_package_selftests",
                        "full_claim_term_logic_privacy_review", "hugo_mobile_four_inspected_screenshots",
                        "fresh_skill_review_ready", "durable_private_packet_hash_verification",
                        "single_atomic_two_file_commit_fast_forward_readback"],
                    "required_before_merge": ["explicit_user_exact_remote_head_approval", "fresh_skill_verify_review",
                        "fresh_main_ancestry_app15368_build_sites", "normal_protected_expected_head_merge"]}, production)
            except (GateError, KeyError, TypeError, ValueError, OSError) as error:
                # Do not expose exception text, private paths, or source content in public reports.
                return BatchResult(run_key(now), mode, {"status": "TECHNICAL_FAILURE", "error_type": type(error).__name__},
                                   {"status": "BLOCKED"})


def resume_deployment(record, remote, now):
    """Recover the actual deployment identity and original stabilization deadline.

    Completion timestamps come from fresh Sites deployment reads; a local hint
    cannot restart the three-minute window. Unknown timing blocks automation.
    """
    require(now.tzinfo is not None, "Timestamp lacks timezone")
    require(record.get("deployment_id") is not None and record.get("deployment_id") == remote.get("deployment_id"),
            "Deployment identity mismatch")
    require(SHA.fullmatch(record.get("target_sha", "")) and record["target_sha"] == remote.get("target_sha"),
            "Deployment target mismatch")
    status = remote.get("status")
    if status in {"pending", "running"}:
        return {"status": "WAIT_EXISTING_DEPLOYMENT", "deployment_id": record["deployment_id"]}
    require(status == "succeeded", "Deployment failed or outcome unknown")
    completed = datetime.fromisoformat(remote.get("completed_at", ""))
    require(completed.tzinfo is not None, "Deployment completion timezone absent")
    require(not record.get("completed_at") or datetime.fromisoformat(record["completed_at"]) == completed,
            "Deployment completion identity changed")
    elapsed = (now - completed).total_seconds()
    require(elapsed >= 0, "Deployment completion is in the future")
    return {"status": "RECONCILE_LIVE_THEN_ROLLBACK_IF_UNSTABLE" if elapsed >= 180 else "RESUME_STABILIZATION",
            "deployment_id": record["deployment_id"], "elapsed_seconds": elapsed,
            "remaining_seconds": max(0, 180 - elapsed), "reuse_pre_restart_samples": False}
