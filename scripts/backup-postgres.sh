#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "Usage: DATABASE_URL=... scripts/backup-postgres.sh /existing/directory/rendant.dump" >&2
}

if [[ ${1:-} == "--help" ]]; then
	usage
	exit 0
fi

if [[ -z ${DATABASE_URL:-} || $# -ne 1 ]]; then
	usage
	exit 2
fi

if ! command -v pg_dump >/dev/null 2>&1; then
	echo "pg_dump is required" >&2
	exit 2
fi

output=$1
parent=$(dirname "$output")
if [[ ! -d $parent ]]; then
	echo "Refusing to create a backup directory implicitly: $parent" >&2
	exit 2
fi
if [[ -e $output || -L $output ]]; then
	echo "Refusing to overwrite an existing path: $output" >&2
	exit 2
fi

umask 077
partial="${output}.partial.$$"
cleanup() {
	rm -f -- "$partial"
}
trap cleanup EXIT INT TERM

pg_dump \
	--dbname="$DATABASE_URL" \
	--format=custom \
	--no-owner \
	--no-privileges \
	--file="$partial"

if [[ ! -s $partial ]]; then
	echo "pg_dump produced an empty archive" >&2
	exit 1
fi

mv -- "$partial" "$output"
trap - EXIT INT TERM
echo "PostgreSQL archive written to $output"
