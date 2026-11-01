#!/usr/bin/env python3
"""Run a PostgreSQL client without a connection URL/password in its argv."""
import os
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

# libpq's PGDATABASE environment variable treats a URI as a literal name.
# Expand only documented libpq environment parameters; reject unsupported
# settings rather than quietly dropping TLS or other connection requirements.
QUERY_ENV = {
    "host": "PGHOST", "hostaddr": "PGHOSTADDR", "port": "PGPORT",
    "user": "PGUSER", "password": "PGPASSWORD", "dbname": "PGDATABASE",
    "application_name": "PGAPPNAME", "connect_timeout": "PGCONNECT_TIMEOUT",
    "options": "PGOPTIONS", "sslmode": "PGSSLMODE",
    "sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY", "sslrootcert": "PGSSLROOTCERT",
    "sslcrl": "PGSSLCRL", "sslcrldir": "PGSSLCRLDIR",
    "sslsni": "PGSSLSNI", "sslnegotiation": "PGSSLNEGOTIATION",
    "ssl_min_protocol_version": "PGSSLMINPROTOCOLVERSION",
    "ssl_max_protocol_version": "PGSSLMAXPROTOCOLVERSION",
    "channel_binding": "PGCHANNELBINDING", "gssencmode": "PGGSSENCMODE",
    "target_session_attrs": "PGTARGETSESSIONATTRS", "passfile": "PGPASSFILE",
}

def main():
    if len(sys.argv) < 3 or sys.argv[2] not in {"psql", "pg_dump"}:
        raise ValueError("Expected an environment variable name and PostgreSQL client")
    raw = os.environ.get(sys.argv[1], "")
    url = urlsplit(raw)
    if url.scheme not in {"postgres", "postgresql"} or url.fragment:
        raise ValueError("Expected a PostgreSQL connection URI")
    connection = {}
    if url.hostname is not None:
        connection["PGHOST"] = unquote(url.hostname)
    if url.port is not None:
        connection["PGPORT"] = str(url.port)
    if url.username is not None:
        connection["PGUSER"] = unquote(url.username)
    if url.password is not None:
        connection["PGPASSWORD"] = unquote(url.password)
    if url.path.lstrip("/"):
        connection["PGDATABASE"] = unquote(url.path[1:])
    for key, value in (parse_qsl(url.query, keep_blank_values=True, strict_parsing=True) if url.query else []):
        if key not in QUERY_ENV:
            raise ValueError("Unsupported PostgreSQL connection parameter")
        connection[QUERY_ENV[key]] = value
    if not connection.get("PGHOST") or not connection.get("PGDATABASE"):
        raise ValueError("A PostgreSQL host and database are required")
    env = os.environ.copy()
    # An ambient service definition or hostaddr can override host/port supplied
    # only as environment fields. The URI must remain the routing authority.
    for key in ("PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR"):
        env.pop(key, None)
    env.update(connection)
    os.execvpe(sys.argv[2], sys.argv[2:], env)

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError):
        # Never interpolate the URI or parser exception: either may contain a
        # password. The client receives credentials only in its environment.
        print("Cannot run PostgreSQL client: check the connection URI and supported parameters.", file=sys.stderr)
        sys.exit(2)
