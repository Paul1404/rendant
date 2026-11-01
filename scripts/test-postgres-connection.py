#!/usr/bin/env python3
"""Check URI transport without starting a client or handling real credentials."""
import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("connection", Path(__file__).with_name("postgres-connection.py"))
connection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(connection)


class ConnectionTest(unittest.TestCase):
    def launch(self, uri):
        with patch.dict(os.environ, {"TEST_URL": uri}, clear=True), patch.object(
            sys, "argv", ["launcher", "TEST_URL", "psql", "--version"]
        ), patch.object(os, "execvpe") as execute:
            connection.main()
            return execute.call_args.args

    def test_credentials_and_tls_use_environment_only(self):
        executable, argv, env = self.launch(
            "postgresql://test%20user:synthetic%40password@127.0.0.1:55493/restore_test"
            "?sslmode=verify-full&sslrootcert=%2Ftmp%2Fsynthetic-root.crt&connect_timeout=3"
        )
        self.assertEqual((executable, argv), ("psql", ["psql", "--version"]))
        self.assertEqual(env["PGHOST"], "127.0.0.1")
        self.assertEqual(env["PGPORT"], "55493")
        self.assertEqual(env["PGDATABASE"], "restore_test")
        self.assertEqual(env["PGUSER"], "test user")
        self.assertEqual(env["PGPASSWORD"], "synthetic@password")
        self.assertEqual(env["PGSSLMODE"], "verify-full")
        self.assertEqual(env["PGSSLROOTCERT"], "/tmp/synthetic-root.crt")
        self.assertEqual(env["PGCONNECT_TIMEOUT"], "3")

    def test_missing_host_or_database_and_unknown_options_fail_closed(self):
        for uri in (
            "postgresql:///restore_test", "postgresql://127.0.0.1",
            "postgresql://127.0.0.1/restore_test?unsupported_protection=required",
            "postgresql://127.0.0.1:not-a-port/restore_test",
        ):
            with self.assertRaises(ValueError):
                self.launch(uri)

    def test_uri_without_query_on_python39(self):
        self.assertEqual(self.launch("postgresql://127.0.0.1:55492/source_test")[2]["PGPORT"], "55492")


if __name__ == "__main__":
    unittest.main()
