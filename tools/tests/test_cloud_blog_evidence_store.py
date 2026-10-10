import copy
from contextlib import contextmanager
from dataclasses import replace
import hashlib
import io
import json
import os
import shutil
from pathlib import Path
import sys
import tarfile
import tempfile
import traceback
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import cloud_blog_batch as batch
import cloud_blog_evidence_store as evidence

HEAD, CONTENT = "a" * 40, "c" * 64


class MemoryStore:
    """Explicit local-only test double, not a durable integration demonstration."""
    evidence_mode, visibility, durable = "MOCK", "private", False

    def __init__(self):
        self.data = None
        self.puts = 0
        self.fetches = []
        self.bad_receipt = False
        self.fail_write = False
        self.fail_fetch = None
        self.corrupt_fetch = None
        self.oversize_fetch = None

    def put_private(self, source, *, sha256, size_bytes):
        self.puts += 1
        self.data = source.read()
        if self.fail_write:
            raise OSError("sensitive exception detail must not appear")
        return evidence.PrivateReference("private-object", "immutable-v1",
                                         "0" * 64 if self.bad_receipt else sha256, size_bytes)

    @contextmanager
    def fetch_private(self, reference, *, purpose):
        self.fetches.append(purpose)
        if purpose == self.fail_fetch:
            raise OSError("sensitive exception detail must not appear")
        content = self.data
        if purpose == self.corrupt_fetch:
            content = b"corrupt"
        if purpose == self.oversize_fetch:
            content = b"x" * 100_001
        yield io.BytesIO(content)


class EvidenceStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.source.mkdir(mode=0o700)
        files = {}
        for name in batch.PRIVATE_PACKET_FILES:
            (self.source / name).write_text('{"fixture":true}')
            files[name] = batch.digest(self.source / name)
        shots = []
        for locale, width, height in sorted(batch.MOBILE):
            name = f"screenshots/{locale}-{width}.png"
            (self.source / name).parent.mkdir(exist_ok=True)
            # Fixture bytes are deliberately not represented as inspected pixels.
            (self.source / name).write_bytes(f"MOCK {locale} {width}".encode())
            files[name] = batch.digest(self.source / name)
            shots.append(dict(locale=locale, width=width, height=height,
                              path=name, inspected=True))
        self.manifest = dict(head_sha=HEAD, content_sha256=CONTENT,
                             files=files, screenshots=shots)
        self.destination = self.root / "packet.tar"

    def create(self, **overrides):
        kwargs = dict(head_sha=HEAD, content_sha256=CONTENT)
        kwargs.update(overrides)
        return evidence.create_private_packet(self.source, self.manifest, self.destination, **kwargs)

    def test_local_roundtrip_is_private_deterministic_and_unapproved(self):
        packet = self.create()
        self.assertEqual(packet.evidence_mode, "MOCK")
        self.assertEqual(packet.sha256, batch.digest(packet.path))
        self.assertEqual(packet.path.stat().st_mode & 0o777, 0o600)
        other = evidence.create_private_packet(self.source, self.manifest, self.root / "other.tar",
                                                head_sha=HEAD, content_sha256=CONTENT)
        self.assertEqual(packet.sha256, other.sha256)
        restored = batch.restore_archive(packet.path, packet.sha256, self.root / "restored")
        manifest = json.loads((restored / "manifest.json").read_text())
        review = batch.verify_packet(restored, manifest, head_sha=HEAD, content_sha256=CONTENT)
        self.assertEqual(review["status"], "RESTORED_REVERIFY_REQUIRED")
        for file in restored.rglob("*"):
            if file.is_file():
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_unlisted_source_files_never_exported(self):
        (self.source / "credentials.env").write_text("do not export")
        (self.source / "manifest.json").write_text('{"approval":"approved"}')
        packet = self.create()
        with tarfile.open(packet.path) as archive:
            self.assertEqual(set(archive.getnames()), set(self.manifest["files"]) | {"manifest.json"})
            self.assertNotIn(b"approved", archive.extractfile("manifest.json").read())

    def test_no_unmanifested_secret_or_extra_file_allowed(self):
        self.manifest["files"]["credentials.env"] = "a" * 64
        with self.assertRaises(batch.GateError):
            self.create()
        self.assertFalse(self.destination.exists())

    def test_manifest_cannot_confer_approval(self):
        self.manifest["approval"] = "approved"
        with self.assertRaises(batch.GateError):
            self.create()

    def test_stale_target_and_uninspected_shot_rejected(self):
        for field, value in (("head_sha", "b" * 40), ("content_sha256", "b" * 64)):
            with self.subTest(field=field), self.assertRaises(batch.GateError):
                self.create(**{field: value})
        self.manifest["screenshots"][0]["inspected"] = False
        with self.assertRaises(batch.GateError):
            self.create()

    def test_source_hash_mismatch_leaves_no_export(self):
        (self.source / "qa-report.json").write_text("changed")
        with self.assertRaises(batch.GateError):
            self.create()
        self.assertFalse(self.destination.exists())
        self.assertFalse(list(self.root.glob(".private-packet-*")))

    def test_unsafe_paths_rejected(self):
        for name in ("../escape.png", "/escape.png", "a//b.png", "a/./b.png", "a/../b.png",
                     "a\\b.png", "bad\n.png", "\x00.png", "a" * 241 + ".png"):
            with self.subTest(name=name):
                original = copy.deepcopy(self.manifest)
                old = self.manifest["screenshots"][0]["path"]
                self.manifest["screenshots"][0]["path"] = name
                self.manifest["files"][name] = self.manifest["files"].pop(old)
                with self.assertRaises(batch.GateError):
                    self.create()
                self.manifest = original

    def test_symlink_file_and_directory_rejected(self):
        report = self.source / "qa-report.json"
        backup = self.root / "report.json"
        report.rename(backup)
        report.symlink_to(backup)
        with self.assertRaises((OSError, batch.GateError)):
            self.create()
        report.unlink()
        backup.rename(report)
        shots = self.source / "screenshots"
        shots.rename(self.root / "screens")
        shots.symlink_to(self.root / "screens", target_is_directory=True)
        with self.assertRaises((OSError, batch.GateError)):
            self.create()

    def test_symlink_root_and_ancestor_rejected(self):
        link = self.root / "link"
        link.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises((OSError, batch.GateError)):
            evidence.create_private_packet(link, self.manifest, self.destination,
                                            head_sha=HEAD, content_sha256=CONTENT)
        ancestor = self.root / "ancestor"
        ancestor.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises((OSError, batch.GateError)):
            evidence.create_private_packet(ancestor / "source", self.manifest, self.destination,
                                            head_sha=HEAD, content_sha256=CONTENT)

    def test_hardlink_fifo_and_directory_source_rejected(self):
        report = self.source / "qa-report.json"
        os.link(report, self.root / "hardlink")
        with self.assertRaises(batch.GateError):
            self.create()
        (self.root / "hardlink").unlink()
        report.unlink()
        os.mkfifo(report)
        with self.assertRaises(batch.GateError):
            self.create()
        report.unlink()
        report.mkdir()
        with self.assertRaises(batch.GateError):
            self.create()

    def test_destination_cannot_overwrite_or_follow_symlink(self):
        self.destination.write_bytes(b"existing")
        with self.assertRaises(FileExistsError):
            self.create()
        self.assertEqual(self.destination.read_bytes(), b"existing")
        self.destination.unlink()
        self.destination.symlink_to(self.root / "missing")
        with self.assertRaises(FileExistsError):
            self.create()
        self.assertFalse((self.root / "missing").exists())
        self.assertFalse(list(self.root.glob(".private-packet-*")))

    def test_destination_symlink_ancestor_rejected(self):
        linked = self.root / "linked"
        linked.symlink_to(self.root, target_is_directory=True)
        self.destination = linked / "packet.tar"
        with self.assertRaises((OSError, batch.GateError)):
            self.create()
        self.assertFalse((self.root / "packet.tar").exists())

    def test_invalid_and_total_archive_size_limits(self):
        for limit in (0, -1, True, "100", evidence.MAX_BYTES + 1, 100, 5_000):
            with self.subTest(limit=limit), self.assertRaises(batch.GateError):
                self.create(max_bytes=limit)
        large = self.source / "qa-report.json"
        large.write_bytes(b"x" * 100_001)
        self.manifest["files"]["qa-report.json"] = batch.digest(large)
        with self.assertRaises(batch.GateError):
            self.create(max_bytes=100_000)
        self.assertFalse(self.destination.exists())

    def test_partial_export_failure_cleans_staging(self):
        with patch.object(evidence.os, "link", side_effect=OSError("disk error")):
            with self.assertRaises(OSError):
                self.create()
        self.assertFalse(self.destination.exists())
        self.assertFalse(list(self.root.glob(".private-packet-*")))

    def test_directory_sync_failure_removes_published_file(self):
        real_sync = evidence.os.fsync
        calls = []
        def sync(descriptor):
            calls.append(descriptor)
            if len(calls) == 2:
                raise OSError("directory sync failed")
            return real_sync(descriptor)
        with patch.object(evidence.os, "fsync", sync), self.assertRaises(OSError):
            self.create()
        self.assertFalse(self.destination.exists())
        self.assertFalse(list(self.root.glob(".private-packet-*")))

    def test_mock_save_readback_and_reacquisition_never_claim_durable_or_approval(self):
        packet, store = self.create(), MemoryStore()
        result = evidence.save_private_packet(packet, store)
        self.assertEqual(store.puts, 1)
        self.assertEqual(store.fetches, ["readback", "reacquire"])
        self.assertEqual(result.status, "MOCK_SAVED_REACQUIRED_REVERIFY_REQUIRED")
        self.assertFalse(result.durable_verified)
        self.assertEqual(result.review_status, "REVERIFY_REQUIRED")
        self.assertNotIn("private-object", repr(result))
        self.assertNotIn(str(self.root), repr(packet))

    def test_reacquisition_uses_fresh_materializations(self):
        packet, store = self.create(), MemoryStore()
        original = evidence._restore_check
        paths = []
        def record(archive, sha, work, **kwargs):
            paths.append(work)
            return original(archive, sha, work, **kwargs)
        with patch.object(evidence, "_restore_check", record):
            evidence.save_private_packet(packet, store)
        self.assertEqual(len(set(paths)), 3)
        self.assertTrue(all(not path.exists() for path in paths))

    def test_external_disabled_before_any_store_call(self):
        packet, store = self.create(evidence_mode="LIVE_PRIVATE"), MemoryStore()
        store.evidence_mode, store.durable = "LIVE_PRIVATE", True
        with self.assertRaisesRegex(batch.GateError, "disabled"):
            evidence.save_private_packet(packet, store)
        self.assertEqual(store.puts, 0)
        self.assertEqual(store.fetches, [])

    def test_mock_cannot_be_promoted_to_live(self):
        packet, store = self.create(), MemoryStore()
        store.evidence_mode, store.durable = "LIVE_PRIVATE", True
        with self.assertRaisesRegex(batch.GateError, "provenance"):
            evidence.save_private_packet(packet, store, allow_external=True)
        self.assertEqual(store.puts, 0)

    def test_public_or_nondurable_live_backend_rejected(self):
        packet, store = self.create(evidence_mode="LIVE_PRIVATE"), MemoryStore()
        store.evidence_mode = "LIVE_PRIVATE"
        with self.assertRaises(batch.GateError):
            evidence.save_private_packet(packet, store, allow_external=True)
        store.durable, store.visibility = True, "public"
        with self.assertRaises(batch.GateError):
            evidence.save_private_packet(packet, store, allow_external=True)
        self.assertEqual(store.puts, 0)

    def test_local_archive_tampering_rejected_before_write(self):
        packet, store = self.create(), MemoryStore()
        original = packet.path.read_bytes()
        packet.path.write_bytes(b"bad" + original[3:])
        with self.assertRaises(batch.GateError):
            evidence.save_private_packet(packet, store)
        self.assertEqual(store.puts, 0)

    def test_archive_symlink_rejected_before_write(self):
        packet, store = self.create(), MemoryStore()
        packet.path.rename(self.root / "original.tar")
        packet.path.symlink_to(self.root / "original.tar")
        with self.assertRaises((OSError, batch.GateError)):
            evidence.save_private_packet(packet, store)
        self.assertEqual(store.puts, 0)

    def test_uncertain_write_never_retries_or_leaks(self):
        packet, store = self.create(), MemoryStore()
        store.fail_write = True
        with self.assertRaises(evidence.EvidenceStoreError) as raised:
            evidence.save_private_packet(packet, store)
        self.assertEqual(raised.exception.stage, "write")
        self.assertEqual(raised.exception.status, "SAVE_UNVERIFIED_DO_NOT_RETRY")
        self.assertNotIn("sensitive", str(raised.exception))
        self.assertIsNone(raised.exception.reference)
        self.assertEqual(store.puts, 1)
        self.assertEqual(store.fetches, [])

    def test_bad_receipt_never_fetches_or_claims_success(self):
        packet, store = self.create(), MemoryStore()
        store.bad_receipt = True
        with self.assertRaises(evidence.EvidenceStoreError) as raised:
            evidence.save_private_packet(packet, store)
        self.assertEqual(raised.exception.stage, "receipt")
        self.assertEqual(store.fetches, [])
        self.assertEqual(store.puts, 1)

    def test_partial_and_corrupt_readback_and_reacquisition_block(self):
        packet = self.create()
        for stage in ("readback", "reacquire"):
            for attribute in ("fail_fetch", "corrupt_fetch", "oversize_fetch"):
                with self.subTest(stage=stage, attribute=attribute):
                    store = MemoryStore()
                    setattr(store, attribute, stage)
                    with self.assertRaises(evidence.EvidenceStoreError) as raised:
                        evidence.save_private_packet(packet, store, max_bytes=100_000)
                    self.assertEqual(raised.exception.stage, stage)
                    self.assertIsNotNone(raised.exception.reference)
                    self.assertEqual(store.puts, 1)

    def test_read_only_restart_uses_pinned_receipt_and_fresh_bytes(self):
        packet, store = self.create(), MemoryStore()
        saved = evidence.save_private_packet(packet, store)
        # A later consumer must not need the producer archive or source tree.
        packet.path.unlink()
        shutil.rmtree(self.source)
        result = evidence.verify_saved_private_packet(saved.reference, store,
                    expected_sha256=packet.sha256, expected_size_bytes=packet.size_bytes,
                    head_sha=HEAD, content_sha256=CONTENT)
        self.assertEqual(result["status"], "RESTORED_REVERIFY_REQUIRED")
        self.assertEqual(result["evidence_mode"], "MOCK")
        self.assertEqual(store.puts, 1)
        self.assertEqual(store.fetches, ["readback", "reacquire", "reacquire"])
        for override in ({"expected_sha256": "b" * 64}, {"head_sha": "b" * 40},
                         {"expected_size_bytes": packet.size_bytes + 1}):
            args = dict(expected_sha256=packet.sha256, expected_size_bytes=packet.size_bytes,
                        head_sha=HEAD, content_sha256=CONTENT)
            args.update(override)
            with self.assertRaises(batch.GateError):
                evidence.verify_saved_private_packet(saved.reference, store, **args)
        self.assertEqual(store.puts, 1)

    def test_restart_provider_failure_is_redacted_in_all_exception_formats(self):
        packet, store = self.create(), MemoryStore()
        saved = evidence.save_private_packet(packet, store)
        store.fail_fetch = "reacquire"
        try:
            evidence.verify_saved_private_packet(saved.reference, store,
                expected_sha256=packet.sha256, expected_size_bytes=packet.size_bytes,
                head_sha=HEAD, content_sha256=CONTENT)
        except evidence.EvidenceStoreError as error:
            self.assertEqual(error.stage, "reacquire")
            self.assertEqual(error.status, "SAVE_UNVERIFIED_DO_NOT_RETRY")
            self.assertEqual(error.reference, saved.reference)
            self.assertTrue(error.__suppress_context__)
            formatted = "".join(traceback.format_exception(type(error), error, error.__traceback__))
            for rendered in (str(error), repr(error), formatted):
                self.assertNotIn("sensitive exception detail must not appear", rendered)
                self.assertNotIn("private-object", rendered)
                self.assertNotIn(str(self.root), rendered)
        else:
            self.fail("Restart failure must never return a successful verification")
        self.assertEqual(store.puts, 1)
        self.assertEqual(store.fetches, ["readback", "reacquire", "reacquire"])

    def test_local_descriptor_cannot_smuggle_unmanifested_archive_file(self):
        packet, store = self.create(), MemoryStore()
        with tarfile.open(packet.path, "a") as archive:
            item = tarfile.TarInfo("secret.txt")
            item.size = 6
            archive.addfile(item, io.BytesIO(b"secret"))
        forged = replace(packet, sha256=batch.digest(packet.path), size_bytes=packet.path.stat().st_size)
        with self.assertRaisesRegex(batch.GateError, "Unmanifested"):
            evidence.save_private_packet(forged, store)
        self.assertEqual(store.puts, 0)

    def test_source_replacement_after_open_uses_verified_descriptor(self):
        original = evidence._regular
        replaced = []
        @contextmanager
        def swapping(root_fd, name):
            with original(root_fd, name) as opened:
                if name == "qa-report.json":
                    target = self.source / name
                    target.rename(self.root / "old-report.json")
                    target.write_bytes(b"unexpected replacement")
                    replaced.append(name)
                yield opened
        with patch.object(evidence, "_regular", swapping):
            packet = self.create()
        with tarfile.open(packet.path) as archive:
            self.assertEqual(archive.extractfile("qa-report.json").read(), b'{"fixture":true}')
        self.assertEqual(replaced, ["qa-report.json"])

    def test_local_archive_replacement_after_check_uses_snapshot(self):
        packet, store = self.create(), MemoryStore()
        original = evidence._restore_check
        def swap(archive, sha, work, **kwargs):
            result = original(archive, sha, work, **kwargs)
            packet.path.write_bytes(b"unexpected replacement")
            return result
        with patch.object(evidence, "_restore_check", swap):
            result = evidence.save_private_packet(packet, store)
        self.assertEqual(hashlib.sha256(store.data).hexdigest(), packet.sha256)
        self.assertEqual(result.review_status, "REVERIFY_REQUIRED")

    def test_duplicate_manifest_fields_rejected_before_write(self):
        packet, store = self.create(), MemoryStore()
        edited = self.root / "edited.tar"
        with tarfile.open(packet.path) as source, tarfile.open(edited, "w") as output:
            for member in source:
                data = source.extractfile(member).read()
                if member.name == "manifest.json":
                    data = ('{"head_sha":"' + HEAD + '",' + data.decode()[1:]).encode()
                member.size = len(data)
                output.addfile(member, io.BytesIO(data))
        edited.replace(packet.path)
        forged = replace(packet, sha256=batch.digest(packet.path), size_bytes=packet.path.stat().st_size)
        with self.assertRaisesRegex(batch.GateError, "Duplicate"):
            evidence.save_private_packet(forged, store)
        self.assertEqual(store.puts, 0)

    def test_file_directory_collision_rejected(self):
        shot = self.manifest["screenshots"][0]
        new = "qa-report.json/shot.png"
        self.manifest["files"][new] = self.manifest["files"].pop(shot["path"])
        shot["path"] = new
        with self.assertRaisesRegex(batch.GateError, "collision"):
            self.create()

    def test_storage_metadata_is_not_approval_authority(self):
        packet, store = self.create(), MemoryStore()
        store.approved = True
        store.durable = True
        result = evidence.save_private_packet(packet, store)
        self.assertFalse(result.durable_verified)
        self.assertEqual(result.review_status, "REVERIFY_REQUIRED")


if __name__ == "__main__":
    unittest.main()
