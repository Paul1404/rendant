"""Credential boundary checks with synthetic SDK doubles, without network access."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class ProvisionTests(unittest.TestCase):
    def run_provision(self, *, account="expected", fail=False, missing=False):
        calls = []

        class Config:
            def __init__(self, **options):
                self.options = options

        class Session:
            def __init__(self, **options):
                calls.append(("session", options))

            def client(self, name, config):
                # Railway supplies an S3 endpoint in AWS_ENDPOINT_URL. The
                # control-plane clients must explicitly ignore that override.
                if not config.options.get("ignore_configured_endpoint_urls"):
                    raise RuntimeError("synthetic-secret sent to wrong endpoint")
                return self

            def get_caller_identity(self):
                return {"Account": account}

            def put_parameter(self, **options):
                calls.append(("put", options))
                if fail:
                    raise RuntimeError("synthetic-secret provider response")
                return {"Version": 1}

        modules = {"boto3": types.SimpleNamespace(Session=Session),
                   "botocore": types.ModuleType("botocore"),
                   "botocore.config": types.SimpleNamespace(Config=Config)}
        environment = {"AWS_ACCESS_KEY_ID": "synthetic-key", "AWS_SECRET_ACCESS_KEY": "synthetic-secret",
                       "AWS_ENDPOINT_URL": "https://synthetic-source.invalid",
                       "AWS_ENDPOINT_URL_S3": "https://synthetic-source.invalid", "S3_BUCKET_NAME": "synthetic-bucket"}
        if missing:
            del environment["AWS_SECRET_ACCESS_KEY"]
        output, errors = io.StringIO(), io.StringIO()
        with patch.dict(sys.modules, modules), patch.dict(os.environ, environment, clear=True), \
                patch.object(sys, "argv", ["provision", "--profile", "approved-profile", "--account", "expected"]), \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            spec = importlib.util.spec_from_file_location("provision", Path(__file__).with_name("provision-object-backup-source.py"))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            result = module.main()
        self.assertNotIn("synthetic-secret", output.getvalue() + errors.getvalue())
        self.assertNotIn("synthetic-key", output.getvalue() + errors.getvalue())
        return result, calls, output.getvalue()

    def test_control_plane_uses_approved_profile_and_ignores_source_endpoint(self):
        result, calls, output = self.run_provision()
        self.assertEqual(result, 0)
        self.assertEqual(calls[0][1]["profile_name"], "approved-profile")
        stored = calls[1][1]
        self.assertEqual(stored["Type"], "SecureString")
        self.assertEqual(stored["Name"], "/rendant/backup/source")
        self.assertEqual(json.loads(stored["Value"])["secret_access_key"], "synthetic-secret")
        self.assertTrue(json.loads(output)["saved"])

    def test_wrong_destination_account_never_stores_credentials(self):
        result, calls, _ = self.run_provision(account="wrong")
        self.assertEqual(result, 1)
        self.assertFalse(any(kind == "put" for kind, _ in calls))

    def test_missing_credential_never_contacts_destination(self):
        result, calls, _ = self.run_provision(missing=True)
        self.assertEqual(result, 1)
        self.assertEqual(calls, [])

    def test_provider_failure_cannot_expose_credential(self):
        result, _, _ = self.run_provision(fail=True)
        self.assertEqual(result, 1)


if __name__ == "__main__":
    unittest.main()
