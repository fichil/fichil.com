#!/usr/bin/env python3
"""Pure, fail-closed decisions for the cloud blog runner; never performs writes.

Inputs must be freshly read/verified by the orchestrator. This module is not an
approval authority, authentication adapter, semantic deduplicator, or scheduler.
"""
from datetime import datetime, timedelta
import re
from zoneinfo import ZoneInfo

SHA = re.compile(r"[0-9a-f]{40}")
HASH = re.compile(r"[0-9a-f]{64}")
ARTICLE = re.compile(r"content/(en|zh-cn)/blog/([a-z0-9]+(?:-[a-z0-9]+)*)/index\.md")
MARKER = re.compile(
    r"<!-- fichil-content-qa-approval:v1 status=approved head_sha=([0-9a-f]{40}) "
    r"content_sha256=([0-9a-f]{64}) qa_report_sha256=([0-9a-f]{64}) -->"
)
WEIGHTS = (30, 25, 20, 15, 10)


class GateError(ValueError):
    """Unsafe, unknown, stale, or incomplete evidence. No external action allowed."""


def require(value, message):
    if not value:
        raise GateError(message)


def window(now):
    require(now.tzinfo is not None, "Run timestamp must include timezone")
    day = now.astimezone(ZoneInfo("Asia/Shanghai")).date()
    return day, day - timedelta(days=30), day - timedelta(days=1)


def rank_candidates(candidates, now):
    """Rank pre-reviewed candidates, never infer completion/privacy/dedup from prose.

    Every candidate needs an aware completed_at, a stable source_id, five scores,
    and explicit completed/evidence_complete/public_safe/reusable/dedup_passed.
    Missing or failed hard filters skip it; malformed eligible records stop.
    Semantic full-history dedup and a second pre-write check remain mandatory.
    """
    _, start, end = window(now)
    ranked, seen = [], set()
    for candidate in candidates:
        if not all(candidate.get(k) is True for k in (
            "completed", "evidence_complete", "public_safe", "reusable", "dedup_passed"
        )):
            continue
        at = datetime.fromisoformat(candidate["completed_at"])
        require(at.tzinfo is not None, "Candidate timestamp must include timezone")
        day = at.astimezone(ZoneInfo("Asia/Shanghai")).date()
        if not start <= day <= end:
            continue
        source = candidate["source_id"]
        require(isinstance(source, str) and source, "Missing stable source identity")
        identity = (source, candidate.get("topic_id", source))
        require(identity not in seen, "Duplicate candidate identity: merge candidates first")
        seen.add(identity)
        scores = candidate["scores"]
        require(len(scores) == 5 and all(type(s) is int and 0 <= s <= cap
                for s, cap in zip(scores, WEIGHTS)), "Invalid five-part score")
        ranked.append((candidate, sum(scores), day))
    ranked.sort(key=lambda x: (-x[1], -x[0]["scores"][3], -x[0]["scores"][1],
                               -x[2].toordinal(), x[0]["source_id"], x[0].get("topic_id", x[0]["source_id"])))
    return [candidate for candidate, _, _ in ranked]


def validate_scope(paths, issues, recovery=False):
    require(len(paths) == len(set(paths)), "Duplicate diff paths")
    pairs = {}
    for path in paths:
        match = ARTICLE.fullmatch(path)
        require(match is not None, "Unexpected path in full PR diff")
        locale, slug = match.groups()
        pairs.setdefault(slug, set()).add(locale)
    require(pairs and all(locales == {"en", "zh-cn"} for locales in pairs.values()),
            "Missing bilingual counterpart")
    require(recovery or len(pairs) == 1, "New publication must contain exactly one topic")
    require(set(issues) == set(pairs) and all(type(v) is int and v > 0 for v in issues.values())
            and len(set(issues.values())) == len(issues), "Each slug requires a unique Issue")
    return sorted(pairs)


def validate_approval(body, head, content_hash, report_hash, review):
    """Compare hashes obtained from the QA skill's fresh verify-review execution.

    review is the verified skill result normalized by the caller, not an arbitrary
    PR comment. User approval provenance must be verified before invoking approve.
    """
    require(SHA.fullmatch(head or ""), "Invalid current head")
    require(HASH.fullmatch(content_hash or "") and HASH.fullmatch(report_hash or ""),
            "Invalid recomputed QA hashes")
    require(body.count("<!-- codex-workday-bilingual-blog -->") == 1, "Missing/duplicate task marker")
    require(body.count("<!-- fichil-content-qa-approval:v1 ") == 1, "Missing/duplicate approval")
    markers = MARKER.findall(body)
    require(markers == [(head, content_hash, report_hash)], "Stale or malformed approval")
    require(review == {"status": "approved", "head_sha": head,
                       "content_sha256": content_hash, "qa_report_sha256": report_hash},
            "Verified review does not match current content/head/report")


def production_plan(main_sha, checkout_sha, clean, runs, live_sha, versions):
    """Select only exact main push CI. Caller must provide complete latest attempts.

    This is eligibility, not permission to deploy. Observable checks, submodules, local
    build/audit/browser gates, source identity and known-good rollback are separate.
    """
    require(SHA.fullmatch(main_sha or ""), "Invalid main SHA")
    require(checkout_sha == main_sha and clean is True, "Checkout is not clean exact main")
    matching = [r for r in runs if r.get("name") == "Site Build Check"
                and r.get("head_sha") == main_sha and r.get("head_branch") == "main"
                and r.get("event") == "push"]
    require(matching, "Exact main push run missing; PR-only API is insufficient")
    require(all(type(r.get("run_number")) is int and type(r.get("run_attempt")) is int
                for r in matching), "Workflow run ordering evidence missing")
    latest = max(matching, key=lambda r: (r["run_number"], r["run_attempt"]))
    require(latest.get("status") == "completed" and latest.get("conclusion") == "success",
            "Latest exact main push run has not succeeded")
    if live_sha == main_sha:
        return {"action": "NOOP_ONLINE_CURRENT", "target_sha": main_sha}
    matching_versions = [v for v in versions if (v.get("source") or {}).get("commit_sha") == main_sha]
    require(len(matching_versions) <= 1, "Ambiguous versions: reconcile before creating/deploying")
    if matching_versions:
        require(matching_versions[0].get("version_id") is not None, "Saved version identity missing")
    return {"action": "REUSE_VERSION" if matching_versions else "BUILD_AND_SAVE",
            "target_sha": main_sha,
            "version_id": matching_versions[0]["version_id"] if matching_versions else None}


def stabilization(samples, target_sha, elapsed_seconds):
    """Samples represent 10-second, cache-bypassed observations, both article routes.

    Never rollback for one transient error. Continue full three-round core smoke
    after STABLE. The caller persists deployment identity before the first poll.
    """
    require(SHA.fullmatch(target_sha or ""), "Invalid target SHA")
    require(elapsed_seconds >= 0, "Invalid stabilization elapsed time")
    if elapsed_seconds > 180:
        return "ROLLBACK_KNOWN_GOOD"
    last = samples[-3:]
    if len(last) == 3:
        sha_ok = all(s.get("commit") == target_sha for s in last)
        if sha_ok and all(s.get("en") == 200 and s.get("zh-cn") == 200 for s in last):
            return "STABLE"
        if sha_ok and any(all(s.get(locale) != 200 for s in last) for locale in ("en", "zh-cn")):
            return "ROLLBACK_KNOWN_GOOD"
    return "ROLLBACK_KNOWN_GOOD" if elapsed_seconds >= 180 else "PROPAGATING"
