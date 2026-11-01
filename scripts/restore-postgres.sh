#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat >&2 <<'EOF'
Usage:
  RESTORE_DATABASE_URL=... \
  CONFIRM_RESTORE_DATABASE=exact_database_name \
  CONFIRM_EMPTY_DATABASE_RESTORE=YES \
  scripts/restore-postgres.sh /path/to/rendant.dump

The target database must have no user tables, views or sequences. This script never
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
if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
	echo "pg_restore, psql and python3 are required" >&2
	exit 2
fi

archive=$1
if [[ ! -f $archive || -L $archive ]]; then
	echo "Archive must be a regular, non-symlink file: $archive" >&2
	exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# Validate the archive before connecting to the restore target.
pg_restore --list "$archive" >/dev/null

target_database=$(python3 "$script_dir/postgres-connection.py" RESTORE_DATABASE_URL psql \
	--no-psqlrc \
	--tuples-only \
	--no-align \
	--set=ON_ERROR_STOP=1 \
	--command="select current_database()")
if [[ $target_database != "$CONFIRM_RESTORE_DATABASE" ]]; then
	echo "Target confirmation mismatch. Connected to '$target_database'." >&2
	exit 2
fi

global_access=$(python3 "$script_dir/postgres-connection.py" RESTORE_DATABASE_URL psql \
	--no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
	--command="select rolsuper or rolbypassrls from pg_roles where rolname = current_user")
if [[ $global_access != "t" ]]; then
	echo "Restore requires the privileged application/migration role with SUPERUSER or BYPASSRLS. No role attributes were changed." >&2
	exit 2
fi

user_object_count=$(python3 "$script_dir/postgres-connection.py" RESTORE_DATABASE_URL psql \
	--no-psqlrc \
	--tuples-only \
	--no-align \
	--set=ON_ERROR_STOP=1 \
	--command="select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_toast' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')")
if [[ $user_object_count != "0" ]]; then
	echo "Refusing to restore into a non-empty database ($user_object_count user objects)." >&2
	exit 2
fi

# Materialize SQL privately before connecting the writer. A failed pg_restore
# must never become an apparently successful, partially committed SQL pipe.
umask 077
restore_work=$(mktemp -d "${TMPDIR:-/tmp}/rendant-restore.XXXXXXXX")
cleanup() {
	rm -rf -- "$restore_work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
pg_restore \
	--no-owner \
	--no-privileges \
	--file="$restore_work/archive.sql" \
	"$archive"

# Role creation, restored data and explicit tenant ACLs commit together. Source
# role owners and unrelated cluster privileges never cross the restore boundary.
python3 "$script_dir/postgres-connection.py" RESTORE_DATABASE_URL psql \
	--no-psqlrc \
	--quiet \
	--set=ON_ERROR_STOP=1 \
	--single-transaction \
	--file="$script_dir/restore-tenant-role.sql" \
	--file="$restore_work/archive.sql" \
	--file="$script_dir/restore-tenant-permissions.sql"

echo "Restore completed in confirmed empty database '$target_database'"
