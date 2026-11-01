#!/usr/bin/env python3
"""Provision the backup credential reference without exposing runtime secrets.

Run through `railway run --no-local` for the application service. The explicit
local AWS profile is used only for the destination SSM write. Source credentials
stay in process memory and are never command arguments, files, or output.
"""
import argparse
import json
import os
import sys
from urllib.parse import urlsplit

import boto3
from botocore.config import Config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--region", default="eu-central-1")
    parser.add_argument("--parameter", default="/rendant/backup/source")
    args = parser.parse_args()
    try:
        source = {
            "endpoint": os.environ["AWS_ENDPOINT_URL_S3"],
            "region": os.environ.get("AWS_DEFAULT_REGION", "auto"),
            "bucket": os.environ["S3_BUCKET_NAME"],
            "access_key_id": os.environ["AWS_ACCESS_KEY_ID"],
            "secret_access_key": os.environ["AWS_SECRET_ACCESS_KEY"],
        }
        parsed = urlsplit(source["endpoint"])
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username
                or parsed.password or parsed.query or parsed.fragment
                or not all(source.values()) or not args.parameter.startswith("/rendant/backup/")):
            raise ValueError("Invalid backup source or parameter")
        # Explicit profile prevents the Railway-injected source credentials from
        # being mistaken for AWS control-plane credentials.
        session = boto3.Session(profile_name=args.profile, region_name=args.region)
        config = Config(connect_timeout=10, read_timeout=30,
                        ignore_configured_endpoint_urls=True,
                        retries={"mode": "standard", "total_max_attempts": 3})
        if session.client("sts", config=config).get_caller_identity()["Account"] != args.account:
            raise ValueError("Unexpected destination account")
        result = session.client("ssm", config=config).put_parameter(
            Name=args.parameter, Value=json.dumps(source), Type="SecureString",
            Overwrite=True, Description="Rendant document backup source; runtime-only credential reference",
        )
        print(json.dumps({"saved": True, "parameter": args.parameter,
                          "version": result["Version"]}))
        return 0
    except Exception:
        # SDK messages can contain endpoint names or submitted secret material.
        print("Backup credential provisioning failed; no credential details emitted", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
