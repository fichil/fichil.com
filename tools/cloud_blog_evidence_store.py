#!/usr/bin/env python3
"""Private evidence transport, with no network or production storage adapter.

Only explicitly named evidence files are exported. Local archives are private,
size-bounded, target-bound, and round-trip checked by the existing batch gates.
Injected ports are trusted runtime code, never PR/manifest JSON. LIVE_PRIVATE
requires an explicit runtime opt-in after recipient/data authorization and
credential screening. A mode label is not proof of either authorization or QA.

A real adapter must implement private immutable identity/version semantics and
independent remote fetches. This module does not invent a Library API, upload
public artifacts, create credentials, or treat stored review text as approval.
"""
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import stat
import tarfile
import tempfile
from typing import BinaryIO, ContextManager, Protocol

from cloud_blog_batch import PRIVATE_PACKET_FILES, restore_archive, verify_packet
from cloud_blog_contract import GateError, HASH, SHA, require

MAX_BYTES = 64 * 1024 * 1024
MAX_MANIFEST_BYTES = 128 * 1024
MANIFEST = "manifest.json"
MODES = {"MOCK", "LIVE_PRIVATE"}


@dataclass(frozen=True)
class LocalPacket:
    path: Path = field(repr=False)
    sha256: str
    size_bytes: int
    head_sha: str
    content_sha256: str
    evidence_mode: str = "MOCK"


@dataclass(frozen=True)
class PrivateReference:
    """Private runtime receipt. Never put this identity in a public PR/report."""
    object_id: str = field(repr=False)
    version: str = field(repr=False)
    sha256: str
    size_bytes: int
    visibility: str = "private"


@dataclass(frozen=True)
class SaveResult:
    status: str
    evidence_mode: str
    archive_sha256: str
    reference: PrivateReference = field(repr=False)
    durable_verified: bool = False
    review_status: str = "REVERIFY_REQUIRED"


class PrivateEvidenceStore(Protocol):
    """Runtime seam, not a concrete service API.

    MOCK must be local-only. LIVE_PRIVATE must use authorized private storage,
    retain immutable versions durably, and freshly fetch exact receipt bytes on
    every call. Each fetch must own a new stream/session; no local-cache fallback.
    The caller is responsible for persisting the receipt privately for restart.
    """
    evidence_mode: str
    visibility: str
    durable: bool

    def put_private(self, source: BinaryIO, *, sha256: str,
                    size_bytes: int) -> PrivateReference: ...

    def fetch_private(self, reference: PrivateReference, *,
                      purpose: str) -> ContextManager[BinaryIO]: ...


class EvidenceStoreError(GateError):
    """A save might have happened. Reconcile its identity; never blindly retry."""
    def __init__(self, stage, reference=None):
        self.stage = stage
        self.reference = reference
        self.status = "SAVE_UNVERIFIED_DO_NOT_RETRY"
        super().__init__(f"{self.status}: {stage}")


def _limits(max_bytes):
    require(type(max_bytes) is int and 0 < max_bytes <= MAX_BYTES,
            "Invalid private packet byte limit")


def _target(head_sha, content_sha256):
    require(isinstance(head_sha, str) and SHA.fullmatch(head_sha) and
            isinstance(content_sha256, str) and HASH.fullmatch(content_sha256),
            "Invalid private packet target")


def _name(name):
    require(isinstance(name, str) and 0 < len(name.encode("utf-8")) <= 240 and
            not PurePosixPath(name).is_absolute() and "\\" not in name and
            all(part not in {"", ".", ".."} for part in name.split("/")) and
            all(ord(char) >= 32 and ord(char) != 127 for char in name),
            "Unsafe private packet path")
    return name


def _manifest(manifest, head_sha, content_sha256):
    """Strict save schema: seven reviews and exactly four named PNGs, no extras."""
    _target(head_sha, content_sha256)
    require(isinstance(manifest, dict) and set(manifest) ==
            {"head_sha", "content_sha256", "files", "screenshots"},
            "Invalid private packet manifest schema")
    require(manifest["head_sha"] == head_sha and
            manifest["content_sha256"] == content_sha256, "Private packet is stale")
    files, shots = manifest["files"], manifest["screenshots"]
    require(isinstance(files, dict) and len(files) == len(PRIVATE_PACKET_FILES) + 4 and
            isinstance(shots, list) and len(shots) == 4, "Private packet incomplete")
    for name, digest in files.items():
        _name(name)
        require(isinstance(digest, str) and HASH.fullmatch(digest), "Invalid evidence hash")
    paths = []
    for shot in shots:
        require(isinstance(shot, dict) and set(shot) ==
                {"locale", "width", "height", "path", "inspected"}, "Invalid screenshot metadata")
        name = _name(shot["path"])
        require(name.endswith(".png") and type(shot["width"]) is int and
                type(shot["height"]) is int, "Invalid screenshot path or dimensions")
        paths.append(name)
    require(len(set(paths)) == 4 and set(files) == PRIVATE_PACKET_FILES | set(paths),
            "Unlisted or extra private evidence files")
    # Avoid a file/directory collision before touching the source tree.
    all_names = set(files) | {MANIFEST}
    require(not any(str(parent) in all_names for name in all_names
                    for parent in PurePosixPath(name).parents if str(parent) != "."),
            "Private packet path collision")
    data = json.dumps(manifest, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("utf-8")
    require(len(data) <= MAX_MANIFEST_BYTES, "Private manifest byte limit exceeded")
    return data


@contextmanager
def _directory(path):
    """Open every path component without following symlinks, including ancestors."""
    path = Path(path).absolute()
    require(".." not in path.parts, "Unsafe filesystem path")
    descriptor = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.parts[1:]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                dir_fd=descriptor)
            os.close(descriptor)
            descriptor = following
        yield descriptor
    finally:
        os.close(descriptor)


@contextmanager
def _regular(root_fd, name):
    """Use anchored descriptors so replacing a checked pathname cannot redirect reads."""
    parts = _name(name).split("/")
    directory = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                dir_fd=directory)
            os.close(directory)
            directory = following
        descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=directory)
        try:
            info = os.fstat(descriptor)
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
                    "Evidence must be a regular non-linked file")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                yield stream, info.st_size
        finally:
            os.close(descriptor)
    finally:
        os.close(directory)


def _copy(source, target, limit):
    hashed, count = hashlib.sha256(), 0
    while chunk := source.read(min(1024 * 1024, limit - count + 1)):
        require(isinstance(chunk, bytes), "Evidence stream must contain bytes")
        count += len(chunk)
        require(count <= limit, "Private packet byte limit exceeded")
        hashed.update(chunk)
        target.write(chunk)
    return hashed.hexdigest(), count


def _unique_fields(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate private manifest field")
        result[key] = value
    return result


def _restore_check(archive, sha, work, *, head_sha, content_sha256, max_bytes):
    restored = restore_archive(archive, sha, work / "restored", max_bytes=max_bytes)
    manifest_path = restored / MANIFEST
    require(manifest_path.is_file() and manifest_path.stat().st_size <= MAX_MANIFEST_BYTES,
            "Missing or oversized private manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"), object_pairs_hook=_unique_fields)
    _manifest(manifest, head_sha, content_sha256)
    actual = {file.relative_to(restored).as_posix() for file in restored.rglob("*") if file.is_file()}
    require(actual == set(manifest["files"]) | {MANIFEST}, "Unmanifested private archive files")
    return verify_packet(restored, manifest, head_sha=head_sha, content_sha256=content_sha256)


def _export(archive, destination, expected_sha, expected_size):
    """Exclusive atomic publication of 0600 bytes, never overwrite an existing path."""
    destination = Path(destination).absolute()
    _name(destination.name)
    with _directory(destination.parent) as parent:
        temporary = ".private-packet-" + secrets.token_hex(16)
        descriptor = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=parent)
        published = False
        try:
            with os.fdopen(descriptor, "w+b") as output, archive.open("rb") as source:
                sha, size = _copy(source, output, expected_size)
                require((sha, size) == (expected_sha, expected_size), "Export integrity mismatch")
                output.flush()
                os.fsync(output.fileno())
                output.seek(0)
                require(hashlib.file_digest(output, "sha256").hexdigest() == expected_sha,
                        "Export readback integrity mismatch")
            os.link(temporary, destination.name, src_dir_fd=parent, dst_dir_fd=parent,
                    follow_symlinks=False)
            published = True
            os.fsync(parent)
        except BaseException:
            if published:
                os.unlink(destination.name, dir_fd=parent)
            raise
        finally:
            os.unlink(temporary, dir_fd=parent)
    return destination


def create_private_packet(source, manifest, destination, *, head_sha,
                          content_sha256, evidence_mode="MOCK", max_bytes=MAX_BYTES):
    """Export a local archive; this is neither durable storage nor content approval.

    Source and destination parent must exist and contain no symlink components.
    Extra source files are ignored, including source-side manifest/credential files.
    Manifest screenshot inspection flags are merely carried; actual fresh skill
    review and explicit user exact-head approval remain mandatory downstream.
    """
    _limits(max_bytes)
    require(evidence_mode in MODES, "Unknown evidence provenance")
    manifest = deepcopy(manifest)
    serialized = _manifest(manifest, head_sha, content_sha256)
    with tempfile.TemporaryDirectory(prefix="private-packet-") as temporary:
        work = Path(temporary)
        snapshot = work / "snapshot"
        snapshot.mkdir(mode=0o700)
        total = len(serialized)
        require(total <= max_bytes, "Private packet byte limit exceeded")
        with _directory(source) as root:
            for name, expected in sorted(manifest["files"].items()):
                output = snapshot / name
                output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with _regular(root, name) as (stream, size), output.open("xb") as target:
                    require(size <= max_bytes - total, "Private packet byte limit exceeded")
                    sha, copied = _copy(stream, target, max_bytes - total)
                    require(sha == expected and copied == size, "Private evidence changed or hash mismatch")
                    total += copied
                output.chmod(0o600)
        (snapshot / MANIFEST).write_bytes(serialized)
        (snapshot / MANIFEST).chmod(0o600)
        verify_packet(snapshot, manifest, head_sha=head_sha, content_sha256=content_sha256)
        archive = work / "packet.tar"
        names = sorted(set(manifest["files"]) | {MANIFEST})
        # USTAR has no hidden PAX records. Include every header, padded body,
        # end marker, and final record before writing any archive bytes.
        tar_bytes = sum(512 + ((snapshot / name).stat().st_size + 511) // 512 * 512
                        for name in names) + 1024
        tar_bytes = (tar_bytes + tarfile.RECORDSIZE - 1) // tarfile.RECORDSIZE * tarfile.RECORDSIZE
        require(tar_bytes <= max_bytes, "Private archive byte limit exceeded")
        with tarfile.open(archive, "w", format=tarfile.USTAR_FORMAT) as bundle:
            for name in names:
                file = snapshot / name
                member = tarfile.TarInfo(name)
                member.size, member.mode, member.mtime = file.stat().st_size, 0o600, 0
                with file.open("rb") as stream:
                    bundle.addfile(member, stream)
        archive.chmod(0o600)
        require(archive.stat().st_size <= max_bytes, "Private archive byte limit exceeded")
        with archive.open("rb") as stream:
            sha = hashlib.file_digest(stream, "sha256").hexdigest()
        _restore_check(archive, sha, work, head_sha=head_sha,
                       content_sha256=content_sha256, max_bytes=max_bytes)
        size = archive.stat().st_size
        destination = _export(archive, destination, sha, size)
    return LocalPacket(destination, sha, size, head_sha, content_sha256, evidence_mode)


def _store_gate(store, mode, allow_external):
    require(mode in MODES and store.evidence_mode == mode, "Storage provenance mismatch")
    require(store.visibility == "private", "Private storage is required")
    if mode == "LIVE_PRIVATE":
        require(allow_external is True, "External private storage is disabled")
        require(store.durable is True, "Durable private storage contract absent")


def _reference(reference, sha, size):
    require(type(reference) is PrivateReference, "Private storage receipt absent")
    require(all(isinstance(value, str) and value and len(value) <= 512 and
                all(32 <= ord(char) < 127 for char in value)
                for value in (reference.object_id, reference.version)),
            "Immutable private storage identity absent")
    require(reference.visibility == "private" and reference.sha256 == sha and
            type(reference.size_bytes) is int and reference.size_bytes == size,
            "Private storage receipt mismatch")


def _fetch_check(store, reference, purpose, head_sha, content_sha256, max_bytes):
    # Every call materializes into a different empty consumer workspace. No bytes
    # from the pre-save archive or earlier readback are used as remote evidence.
    with tempfile.TemporaryDirectory(prefix="private-reacquire-") as temporary:
        work = Path(temporary)
        archive = work / "packet.tar"
        with store.fetch_private(reference, purpose=purpose) as source, archive.open("xb") as output:
            sha, size = _copy(source, output, max_bytes)
        archive.chmod(0o600)
        require((sha, size) == (reference.sha256, reference.size_bytes),
                "Private storage readback integrity mismatch")
        return _restore_check(archive, sha, work, head_sha=head_sha,
                              content_sha256=content_sha256, max_bytes=max_bytes)


def save_private_packet(packet, store, *, allow_external=False, max_bytes=MAX_BYTES):
    """Save once, verify readback, independently reacquire, then report provenance.

    Failed/uncertain writes never retry. Even a valid put receipt proves nothing
    until both fresh reads pass all archive/file/target gates. MOCK always returns
    durable_verified=False. Runtime authorization is not inferred from this API.
    """
    _limits(max_bytes)
    require(type(packet) is LocalPacket, "Local private packet descriptor required")
    _target(packet.head_sha, packet.content_sha256)
    require(isinstance(packet.sha256, str) and HASH.fullmatch(packet.sha256) and
            type(packet.size_bytes) is int and 0 < packet.size_bytes <= max_bytes,
            "Invalid local private packet identity")
    _store_gate(store, packet.evidence_mode, allow_external)
    with tempfile.TemporaryDirectory(prefix="private-save-") as temporary:
        work = Path(temporary)
        archive = work / "packet.tar"
        path = Path(packet.path)
        with _directory(path.parent) as parent, _regular(parent, path.name) as (source, size):
            require(size == packet.size_bytes, "Local private packet size changed")
            with archive.open("xb") as output:
                sha, size = _copy(source, output, max_bytes)
        archive.chmod(0o600)
        require((sha, size) == (packet.sha256, packet.size_bytes), "Local private packet hash changed")
        _restore_check(archive, sha, work, head_sha=packet.head_sha,
                       content_sha256=packet.content_sha256, max_bytes=max_bytes)
        reference, stage = None, "write"
        try:
            with archive.open("rb") as source:
                receipt = store.put_private(source, sha256=sha, size_bytes=size)
            stage = "receipt"
            _reference(receipt, sha, size)
            reference = receipt
            for stage in ("readback", "reacquire"):
                _fetch_check(store, reference, stage, packet.head_sha,
                             packet.content_sha256, max_bytes)
        except Exception:
            # Do not leak exception strings, private source bytes, IDs or paths.
            raise EvidenceStoreError(stage, reference) from None
    live = packet.evidence_mode == "LIVE_PRIVATE"
    return SaveResult("PRIVATE_SAVED_REACQUIRED_REVERIFY_REQUIRED" if live else
                      "MOCK_SAVED_REACQUIRED_REVERIFY_REQUIRED", packet.evidence_mode,
                      packet.sha256, reference, durable_verified=live)


def verify_saved_private_packet(reference, store, *, expected_sha256,
                                expected_size_bytes, head_sha, content_sha256,
                                evidence_mode="MOCK", allow_external=False,
                                max_bytes=MAX_BYTES):
    """Read-only restart/reconciliation from a privately persisted pinned receipt.

    Caller supplies independently pinned hash/size/head/content, not hashes just
    returned by the store. A missing/unknown write identity must be reconciled by
    the real adapter; this function never guesses identities or retries writes.
    """
    _limits(max_bytes)
    _target(head_sha, content_sha256)
    require(isinstance(expected_sha256, str) and HASH.fullmatch(expected_sha256) and
            type(expected_size_bytes) is int and 0 < expected_size_bytes <= max_bytes,
            "Invalid pinned private archive identity")
    _store_gate(store, evidence_mode, allow_external)
    _reference(reference, expected_sha256, expected_size_bytes)
    try:
        _fetch_check(store, reference, "reacquire", head_sha, content_sha256, max_bytes)
    except Exception:
        # Match save-time redaction: provider exceptions can contain private IDs,
        # paths, response bodies, or credential-bearing URLs. Suppress chaining.
        raise EvidenceStoreError("reacquire", reference) from None
    return {"status": "RESTORED_REVERIFY_REQUIRED", "evidence_mode": evidence_mode,
            "head_sha": head_sha, "content_sha256": content_sha256,
            "archive_sha256": expected_sha256}
