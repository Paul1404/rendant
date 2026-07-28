#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat >&2 <<'EOF'
Usage:
  RESTORE_DATABASE_URL=... \
  CONFIRM_RESTORE_DATABASE=exact_database_name \
  CONFIRM_EMPTY_DATABASE_RESTORE=YES \
  scripts/restore-postgres.sh /path/to/rendant.dump

The target database must have no tables in the public schema. This script never
drops or overwrites an existing schema.
EOF
}

if [[ ${1:-} == "--help" ]]; then
	usage
	exit 0
fi

if [[ -z ${RESTORE_DATABASE_URL:-} || -z ${CONFIRM_RESTORE_DATABASE:-} || $# -ne 1 ]]; then
	usage
	exit 2
fi
if [[ ${CONFIRM_EMPTY_DATABASE_RESTORE:-} != "YES" ]]; then
	echo "Set CONFIRM_EMPTY_DATABASE_RESTORE=YES after verifying the target" >&2
	exit 2
fi
if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
	echo "pg_restore and psql are required" >&2
	exit 2
fi

archive=$1
if [[ ! -f $archive || -L $archive ]]; then
	echo "Archive must be a regular, non-symlink file: $archive" >&2
	exit 2
fi

# Validate the archive before connecting to the restore target.
pg_restore --list "$archive" >/dev/null

target_database=$(psql \
	--dbname="$RESTORE_DATABASE_URL" \
	--no-psqlrc \
	--tuples-only \
	--no-align \
	--set=ON_ERROR_STOP=1 \
	--command="select current_database()")
if [[ $target_database != "$CONFIRM_RESTORE_DATABASE" ]]; then
	echo "Target confirmation mismatch. Connected to '$target_database'." >&2
	exit 2
fi

public_table_count=$(psql \
	--dbname="$RESTORE_DATABASE_URL" \
	--no-psqlrc \
	--tuples-only \
	--no-align \
	--set=ON_ERROR_STOP=1 \
	--command="select count(*) from pg_catalog.pg_tables where schemaname = 'public'")
if [[ $public_table_count != "0" ]]; then
	echo "Refusing to restore into a non-empty public schema ($public_table_count tables)." >&2
	exit 2
fi

pg_restore \
	--dbname="$RESTORE_DATABASE_URL" \
	--exit-on-error \
	--single-transaction \
	--no-owner \
	--no-privileges \
	"$archive"

echo "Restore completed in confirmed empty database '$target_database'"
