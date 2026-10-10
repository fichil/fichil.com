import copy
from datetime import datetime
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("contract", Path(__file__).parents[1] / "cloud_blog_contract.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
A, B, H, Q = "a" * 40, "b" * 40, "c" * 64, "d" * 64


class CloudContractTests(unittest.TestCase):
    def test_shanghai_full_days_at_utc_boundary(self):
        self.assertEqual(tuple(map(str, c.window(datetime.fromisoformat("2026-10-01T17:10:00+00:00")))),
                         ("2026-10-02", "2026-09-02", "2026-10-01"))
        with self.assertRaises(c.GateError):
            c.window(datetime(2026, 10, 2))

    def candidate(self, identity="github:a"):
        return dict(source_id=identity, completed_at="2026-10-01T12:00:00+08:00",
                    completed=True, evidence_complete=True, public_safe=True, reusable=True,
                    dedup_passed=True, scores=[30, 25, 20, 15, 10])

    def test_filters_and_stable_ranking(self):
        now = datetime.fromisoformat("2026-10-02T09:10:00+08:00")
        a, b = self.candidate(), self.candidate("github:b")
        skipped = [dict(a, completed=False), dict(a, completed_at="2026-10-02T00:00:00+08:00"),
                   dict(a, public_safe=False), dict(a, completed_at="2026-09-01T23:59:59+08:00")]
        self.assertEqual(c.rank_candidates([b, *skipped, a], now), [a, b])
        with self.assertRaises(c.GateError):
            c.rank_candidates([a, a], now)
        with self.assertRaises(c.GateError):
            c.rank_candidates([dict(a, scores=[31, 25, 20, 15, 10])], now)

    def test_different_problems_can_share_source(self):
        now = datetime.fromisoformat("2026-10-02T09:10:00+08:00")
        a, b = dict(self.candidate(), topic_id="a"), dict(self.candidate(), topic_id="b")
        self.assertEqual(c.rank_candidates([b, a], now), [a, b])

    def test_full_scope_and_unique_issue(self):
        paths = [f"content/{lang}/blog/topic/index.md" for lang in ("en", "zh-cn")]
        self.assertEqual(c.validate_scope(paths, {"topic": 5}), ["topic"])
        for bad in (paths[:1], paths + ["hugo.yaml"], paths + paths):
            with self.assertRaises(c.GateError):
                c.validate_scope(bad, {"topic": 5})
        more = paths + [p.replace("topic", "another") for p in paths]
        with self.assertRaises(c.GateError):
            c.validate_scope(more, {"topic": 5, "another": 6})
        c.validate_scope(more, {"topic": 5, "another": 6}, recovery=True)
        with self.assertRaises(c.GateError):
            c.validate_scope(more, {"topic": 5, "another": 5}, recovery=True)

    def test_head_hash_and_review_binding(self):
        marker = f"<!-- fichil-content-qa-approval:v1 status=approved head_sha={A} content_sha256={H} qa_report_sha256={Q} -->"
        body = "<!-- codex-workday-bilingual-blog -->" + marker
        review = dict(status="approved", head_sha=A, content_sha256=H, qa_report_sha256=Q)
        c.validate_approval(body, A, H, Q, review)
        for args in ((body, B, H, Q, review), (body + marker, A, H, Q, review),
                     (body, A, "e" * 64, Q, review), (body, A, H, Q, {})):
            with self.assertRaises(c.GateError):
                c.validate_approval(*args)

    def run_record(self, **kw):
        return dict(dict(name="Site Build Check", head_sha=A, head_branch="main", event="push",
                         run_number=9, run_attempt=1, status="completed", conclusion="success"), **kw)

    def test_push_only_latest_attempt_and_exact_main(self):
        good = self.run_record()
        self.assertEqual(c.production_plan(A, A, True, [good], A, [])["action"], "NOOP_ONLINE_CURRENT")
        for runs in ([], [self.run_record(event="pull_request")],
                     [good, self.run_record(run_attempt=2, conclusion="failure")],
                     [self.run_record(head_sha=B)], [self.run_record(head_branch="other")]):
            with self.assertRaises(c.GateError):
                c.production_plan(A, A, True, runs, B, [])
        for checkout, clean in ((B, True), (A, False)):
            with self.assertRaises(c.GateError):
                c.production_plan(A, checkout, clean, [good], B, [])

    def test_saved_version_reconciliation(self):
        v = dict(source=dict(commit_sha=A), version_id=58)
        self.assertEqual(c.production_plan(A, A, True, [self.run_record()], B, [v])["version_id"], 58)
        with self.assertRaises(c.GateError):
            c.production_plan(A, A, True, [self.run_record()], B, [v, v])

    def test_propagation_and_rollback(self):
        good = dict(commit=A, en=200, **{"zh-cn": 200})
        bad = dict(commit=A, en=404, **{"zh-cn": 200})
        self.assertEqual(c.stabilization([bad], A, 10), "PROPAGATING")
        self.assertEqual(c.stabilization([bad, good, good], A, 30), "PROPAGATING")
        self.assertEqual(c.stabilization([good] * 3, A, 30), "STABLE")
        self.assertEqual(c.stabilization([bad] * 3, A, 30), "ROLLBACK_KNOWN_GOOD")
        self.assertEqual(c.stabilization([], A, 180), "ROLLBACK_KNOWN_GOOD")
        self.assertEqual(c.stabilization([good] * 3, A, 181), "ROLLBACK_KNOWN_GOOD")


if __name__ == "__main__":
    unittest.main()
