"""Synthetic recovery tests. No boto3 install, AWS calls or production fixtures."""
import contextlib
import copy
import datetime as dt
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("object_recovery", Path(__file__).with_name("index.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class FakeError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}
        super().__init__("synthetic-private-object-name must not appear in logs")


class MissingObject(FakeError):
    def __init__(self):
        super().__init__("NoSuchKey")


class Exceptions:
    NoSuchKey = MissingObject
    ClientError = FakeError


class Body(io.BytesIO):
    def __init__(self, data, fail=False):
        super().__init__(data)
        self.fail = fail
        self.read_sizes = []

    def read(self, size=-1):
        self.read_sizes.append(size)
        if self.fail:
            raise OSError("synthetic-secret-access-key and private object path")
        return super().read(size)


class Context:
    def __init__(self, remaining=900000):
        self.remaining = remaining

    def get_remaining_time_in_millis(self):
        return self.remaining


class FakeSource:
    def __init__(self, objects):
        self.objects = dict(objects)
        self.modified = dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc)
        self.listings = 0
        self.gets = []
        self.streams = []
        self.fail_reads = False
        self.mutate_on_listing = None
        self.listed_size = None

    def get_paginator(self, operation):
        assert operation == "list_objects_v2"
        return self

    def paginate(self, **kwargs):
        self.listings += 1
        if self.listings == self.mutate_on_listing:
            self.modified += dt.timedelta(seconds=1)
        rows = [{"Key": key, "Size": self.listed_size if self.listed_size is not None else len(data),
                 "ETag": '"opaque-multipart-etag-7"', "LastModified": self.modified}
                for key, data in self.objects.items()]
        # More than one page is intentional: a first-page-only backup loses data.
        yield {"Contents": rows[:1]}
        yield {"Contents": rows[1:]}

    def get_object(self, **kwargs):
        self.gets.append(kwargs)
        assert kwargs["IfMatch"] == '"opaque-multipart-etag-7"'
        data = self.objects[kwargs["Key"]]
        body = Body(data, self.fail_reads)
        self.streams.append(body)
        return {"Body": body, "ContentLength": len(data), "LastModified": self.modified,
                "ETag": '"opaque-multipart-etag-7"', "ContentType": "application/pdf"}


class FakeDestination:
    exceptions = Exceptions()

    def __init__(self):
        self.objects = {}
        self.gets = []
        self.puts = []
        self.streams = []
        self.reject_manifest = False

    def put_object(self, **kwargs):
        key = kwargs["Key"]
        if self.reject_manifest and key.startswith("runs/"):
            raise FakeError("AccessDenied")
        versions = self.objects.setdefault(key, [])
        if versions and kwargs.get("IfNoneMatch") == "*":
            raise FakeError("PreconditionFailed")
        raw = kwargs["Body"]
        data = raw.read() if hasattr(raw, "read") else raw
        import base64
        assert kwargs["ChecksumSHA256"] == base64.b64encode(hashlib.sha256(data).digest()).decode()
        assert kwargs["ServerSideEncryption"] == "AES256"
        versions.append(data)
        self.puts.append(key)
        return {"VersionId": str(len(versions))}

    def get_object(self, **kwargs):
        self.gets.append(kwargs)
        versions = self.objects.get(kwargs["Key"])
        if not versions:
            raise MissingObject()
        number = int(kwargs.get("VersionId", str(len(versions))))
        body = Body(versions[number - 1])
        self.streams.append(body)
        return {"Body": body, "VersionId": str(number)}

    def head_object(self, **kwargs):
        return {"VersionId": str(len(self.objects[kwargs["Key"]]))}

    def latest_pointer(self):
        return self.objects.get("catalog/latest.json", []).copy()


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.source = FakeSource({"tenants/synthetic/receipt.pdf": b"synthetic PDF bytes", "archive/source.xlsx": b"synthetic workbook"})
        self.destination = FakeDestination()
        self.context = Context()

    def run_backup(self):
        return recovery.backup(self.source, "synthetic-source", "synthetic-source-id",
                               self.destination, "synthetic-backup", self.context)

    def test_self_test_rejects_missing_object_access_denial_before_any_write(self):
        with patch.object(self.destination, "get_object", side_effect=FakeError("AccessDenied")):
            with self.assertRaises(FakeError):
                recovery.self_test(self.destination, "synthetic-backup", self.context)
        self.assertEqual(self.destination.puts, [])

    def test_paginated_backup_hashes_bytes_independently_of_multipart_etag(self):
        result = self.run_backup()
        self.assertEqual(result["objects"], 2)
        self.assertEqual(result["copied"], 2)
        manifest = recovery.load_manifest(self.destination, "synthetic-backup")
        for entry in manifest["objects"]:
            self.assertEqual(entry["sha256"], hashlib.sha256(self.source.objects[entry["key"]]).hexdigest())
            self.assertTrue(entry["version_id"])
        self.assertTrue(all(body.closed for body in self.source.streams + self.destination.streams))
        self.assertTrue(all(size == recovery.CHUNK for body in self.source.streams for size in body.read_sizes))

    def test_unchanged_source_skips_source_download_but_rechecks_backup_bytes(self):
        self.run_backup()
        downloads, reads = len(self.source.gets), len(self.destination.gets)
        result = self.run_backup()
        self.assertEqual(result["copied"], 0)
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(len(self.source.gets), downloads)
        self.assertGreater(len(self.destination.gets), reads)

    def test_corrupt_existing_backup_fails_without_publishing_a_new_latest(self):
        self.run_backup()
        before = self.destination.latest_pointer()
        blob = next(key for key in self.destination.objects if key.startswith("blobs/"))
        self.destination.objects[blob][0] = b"corrupted synthetic bytes"
        with self.assertRaises(recovery.RecoveryFailure):
            self.run_backup()
        self.assertEqual(before, self.destination.latest_pointer())

    def test_source_changes_during_cycle_leave_previous_completed_run_authoritative(self):
        self.run_backup()
        before = self.destination.latest_pointer()
        self.source.objects["new.pdf"] = b"new synthetic receipt"
        self.source.mutate_on_listing = self.source.listings + 2
        with self.assertRaises(recovery.RecoveryFailure):
            self.run_backup()
        self.assertEqual(before, self.destination.latest_pointer())
        self.assertTrue(any(json.loads(v[-1]).get("status") == "failed"
                            for k, v in self.destination.objects.items() if k.startswith("runs/")))

    def test_interrupted_stream_closes_body_and_temporary_file(self):
        self.source.fail_reads = True
        files = []
        real_file = tempfile.TemporaryFile
        def tracked_file():
            file = real_file()
            files.append(file)
            return file
        with patch.object(recovery.tempfile, "TemporaryFile", tracked_file):
            with self.assertRaises(OSError):
                self.run_backup()
        self.assertTrue(files and all(file.closed for file in files))
        self.assertTrue(all(body.closed for body in self.source.streams))
        self.assertEqual(self.destination.latest_pointer(), [])

    def test_restore_uses_recorded_versions_and_materializes_without_source_access(self):
        self.run_backup()
        original = recovery.load_manifest(self.destination, "synthetic-backup")
        # Overwrite a latest blob version as an operator might accidentally do.
        # Recovery must still restore the exact immutable version in the manifest.
        for entry in original["objects"]:
            self.destination.objects[entry["blob"]].append(b"incorrect newer version")
        self.source.objects.clear()
        reads = len(self.source.gets)
        result = recovery.verify(self.destination, "synthetic-backup", self.context)
        self.assertTrue(result["restored"])
        self.assertEqual(result["objects"], 2)
        self.assertEqual(len(self.source.gets), reads)
        restore_manifest = next(json.loads(v[-1]) for k, v in self.destination.objects.items()
                                if k.startswith("restore/") and k.endswith("manifest.json"))
        self.assertEqual({e["key"] for e in restore_manifest["objects"]}, {e["key"] for e in original["objects"]})
        self.assertTrue(all(e["blob"].startswith("restore/") for e in restore_manifest["objects"]))
        self.assertNotIn("tenants", json.dumps(result))
        self.assertTrue(all(body.closed for body in self.destination.streams))

    def test_failed_manifest_upload_does_not_replace_latest_pointer(self):
        self.run_backup()
        before = self.destination.latest_pointer()
        self.destination.reject_manifest = True
        with self.assertRaises(FakeError):
            self.run_backup()
        self.assertEqual(before, self.destination.latest_pointer())

    def test_timeout_and_oversize_fail_before_source_download(self):
        self.context.remaining = 120000
        with self.assertRaises(recovery.RecoveryFailure):
            self.run_backup()
        self.assertEqual(self.source.gets, [])
        self.context.remaining = 900000
        self.source.listed_size = recovery.MAX_OBJECT_BYTES + 1
        with self.assertRaises(recovery.RecoveryFailure):
            self.run_backup()
        self.assertEqual(self.source.gets, [])

    def test_historical_completed_manifest_remains_selectable_after_source_removal(self):
        self.run_backup()
        pointer = json.loads(self.destination.objects["catalog/latest.json"][-1])
        old_objects = copy.deepcopy(self.destination.objects)
        self.source.objects.clear()
        self.run_backup()
        result = recovery.verify(self.destination, "synthetic-backup", self.context,
                                 pointer["manifest_key"], pointer["manifest_version_id"])
        self.assertEqual(result["objects"], 2)
        for key, versions in old_objects.items():
            self.assertEqual(self.destination.objects[key][:len(versions)], versions)

    def test_self_test_is_synthetic_and_requires_no_source_client(self):
        result = recovery.self_test(self.destination, "synthetic-backup", self.context)
        self.assertTrue(result["verified"])
        self.assertEqual(result["objects"], 1)
        self.assertEqual(self.source.gets, [])

    def test_handler_never_exposes_sdk_exception_text_or_private_keys(self):
        output = io.StringIO()
        with patch.object(recovery, "clients", side_effect=RuntimeError("SYNTHETIC-SECRET-KEY private/path.pdf")):
            with contextlib.redirect_stdout(output):
                with self.assertRaises(RuntimeError) as raised:
                    recovery.handler({"action": "backup"}, self.context)
        self.assertEqual(output.getvalue().strip(), '{"complete":false}')
        self.assertNotIn("SYNTHETIC-SECRET", str(raised.exception))
        self.assertNotIn("private/path", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
