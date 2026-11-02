#!/usr/bin/env bash
# Synthetic round trip across two disposable PostgreSQL clusters. Never uses
# DATABASE_URL from the caller and never connects to an existing cluster.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
for tool in initdb pg_ctl pg_isready pg_dump pg_restore psql bun python3; do
	command -v "$tool" >/dev/null || { echo "Missing test dependency: $tool" >&2; exit 2; }
done
source_port=${TEST_PG_SOURCE_PORT:-55492}
target_port=${TEST_PG_TARGET_PORT:-55493}
if [[ $source_port == "$target_port" ]]; then
	echo "Test ports must differ" >&2
	exit 2
fi
for port in "$source_port" "$target_port"; do
	if pg_isready -h 127.0.0.1 -p "$port" >/dev/null 2>&1; then
		echo "Refusing to use occupied test port $port" >&2
		exit 2
	fi
done
umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/rendant-restore-test.XXXXXXXX")
cleanup() {
	status=$?
	if [[ $status != 0 ]]; then
		for log in "$work"/{migrate,mcp-seed,late-failure,restore,mcp-restore,readiness,nonempty,unsafe}.log; do
			if [[ -f $log ]]; then cat "$log" >&2; fi
		done
	fi
	for cluster in source target; do
		if [[ -f "$work/$cluster/postmaster.pid" ]]; then
			pg_ctl -D "$work/$cluster" -m fast -w stop >/dev/null
		fi
	done
	rm -rf -- "$work"
}
trap cleanup EXIT INT TERM
for cluster in source target; do
	initdb -D "$work/$cluster" -U restore_admin --auth=trust --no-locale >"$work/$cluster-init.log"
	port=$source_port
	[[ $cluster == target ]] && port=$target_port
	pg_ctl -D "$work/$cluster" -l "$work/$cluster.log" \
		-o "-h 127.0.0.1 -p $port -k $work" -w start >/dev/null
done
source_url="postgresql://restore_admin@127.0.0.1:$source_port/source_test"
target_url="postgresql://restore_admin@127.0.0.1:$target_port/restore_test"
RENDANT_TEST_DATABASE_URL="postgresql://restore_admin@127.0.0.1:$source_port/postgres" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 -c 'CREATE DATABASE source_test'
RENDANT_TEST_DATABASE_URL="postgresql://restore_admin@127.0.0.1:$target_port/postgres" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 -c 'CREATE DATABASE restore_test'
export BETTER_AUTH_SECRET=synthetic-restore-test-secret-at-least-32-bytes
export BETTER_AUTH_URL=http://127.0.0.1:3000
# Never seed accounts from a caller or local .env during this synthetic test.
export ADMIN_EMAIL= ADMIN_PASSWORD= ADMIN_NAME=
DATABASE_URL="$source_url" bun src/server/db/migrate.ts >"$work/migrate.log" 2>&1
RENDANT_TEST_DATABASE_URL="$source_url" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 <<'SQL'
INSERT INTO tenants(id, slug, name) VALUES ('00000000-0000-4000-8000-000000000002', 'restore-other', 'Synthetic other club');
INSERT INTO app_settings(id, tenant_id) VALUES (1, '00000000-0000-4000-8000-000000000002');
INSERT INTO "user"(id, name, email) VALUES ('restore-test-user', 'Synthetic restore', 'restore@example.invalid');
UPDATE tenants SET role_permissions = '{"user":["finance.read"],"admin":["users.manage","roles.manage"],"board":["helpers.read"]}'::jsonb,
 role_permissions_version = 7 WHERE id = '00000000-0000-4000-8000-000000000001';
INSERT INTO tenant_memberships(tenant_id,user_id,role)
 VALUES ('00000000-0000-4000-8000-000000000001','restore-test-user','board');
INSERT INTO belegnummer_sequences(tenant_id, year, next_sequence) VALUES ('00000000-0000-4000-8000-000000000001', 2026, 17);
SQL
# The only token here is a synthetic fixture. Never print transport secrets or
# their fingerprints, even in this disposable recovery rehearsal.
DATABASE_URL="$source_url" bun -e '
const {Pool}=await import("pg");
const {createHash}=await import("node:crypto");
const {encryptSecret}=await import("./src/server/services/secret-box.ts");
const client=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const token="synthetic-restorable-mcp-token-local-only";
try { await client.query("update app_settings set mcp_override=true,mcp_enabled=true,mcp_access_mode=$1,mcp_token_enc=$2,mcp_token_sha256=$3,mcp_actor_name=$4,mcp_actor_email=$5 where tenant_id=$6::uuid",["readonly",encryptSecret(token),createHash("sha256").update(token).digest("hex"),"Synthetic restore MCP","restore-mcp@example.invalid","00000000-0000-4000-8000-000000000001"]); }
finally { await client.end(); }
' >"$work/mcp-seed.log" 2>&1
DATABASE_URL="$source_url" scripts/backup-postgres.sh "$work/synthetic.dump" >/dev/null
restore() {
	RESTORE_DATABASE_URL="$target_url" CONFIRM_RESTORE_DATABASE=restore_test \
		CONFIRM_EMPTY_DATABASE_RESTORE=YES scripts/restore-postgres.sh "$1"
}
# Fail at the final permission step, after rows and policies have been loaded.
# Neither those rows nor the newly created cluster role may survive failure.
RENDANT_TEST_DATABASE_URL="$source_url" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 -c 'ALTER SEQUENCE audit_events_id_seq RENAME TO deliberately_missing_seq'
DATABASE_URL="$source_url" scripts/backup-postgres.sh "$work/broken.dump" >/dev/null
RENDANT_TEST_DATABASE_URL="$source_url" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 -c 'ALTER SEQUENCE deliberately_missing_seq RENAME TO audit_events_id_seq'
if restore "$work/broken.dump" >"$work/late-failure.log" 2>&1; then
	echo "Incomplete tenant archive unexpectedly restored" >&2; exit 1
fi
[[ $(RENDANT_TEST_DATABASE_URL="$target_url" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -XAtc "select to_regclass('public.tenants') is null and not exists(select 1 from pg_roles where rolname='rendant_tenant')") == t ]]
restore "$work/synthetic.dump" >"$work/restore.log" 2>&1
SOURCE_RESTORE_TEST_URL="$source_url" TARGET_RESTORE_TEST_URL="$target_url" bun -e '
const {Pool}=await import("pg");
const {decryptSecret}=await import("./src/server/services/secret-box.ts");
const source=new Pool({connectionString:process.env.SOURCE_RESTORE_TEST_URL,max:1});
const target=new Pool({connectionString:process.env.TARGET_RESTORE_TEST_URL,max:1});
const query="select mcp_override,mcp_enabled,mcp_access_mode,mcp_token_enc,mcp_token_sha256,mcp_actor_name,mcp_actor_email,mcp_updated_at from app_settings where tenant_id=$1::uuid";
try {
 const [before,after]=await Promise.all([source.query(query,["00000000-0000-4000-8000-000000000001"]),target.query(query,["00000000-0000-4000-8000-000000000001"])]);
 if(!before.rows[0]?.mcp_override||!after.rows[0]?.mcp_enabled||JSON.stringify(before.rows)!==JSON.stringify(after.rows)||decryptSecret(after.rows[0].mcp_token_enc)!=="synthetic-restorable-mcp-token-local-only") throw new Error("Synthetic encrypted MCP configuration changed during restore");
} finally { await Promise.all([source.end(),target.end()]); }
' >"$work/mcp-restore.log" 2>&1
RENDANT_TEST_DATABASE_URL="$target_url" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 -f scripts/test-postgres-restore.sql
# The actual readiness probes must work before replaying any migrations.
DATABASE_URL="$target_url" bun -e '
const {collectAuthReadiness,collectTenantReadiness}=await import("./src/server/services/health.ts");
const {pool}=await import("./src/server/db/index.ts");
try { if(!await collectAuthReadiness() || !await collectTenantReadiness()) throw new Error("Restored database readiness failed"); }
finally { await pool.end(); }
' >"$work/readiness.log" 2>&1
if restore "$work/synthetic.dump" >"$work/nonempty.log" 2>&1; then
	echo "Non-empty target unexpectedly accepted" >&2; exit 1
fi
# An unsafe existing cluster role is rejected, without normalizing its flags.
RENDANT_TEST_DATABASE_URL="postgresql://restore_admin@127.0.0.1:$target_port/postgres" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 -c 'CREATE DATABASE unsafe_test'
RENDANT_TEST_DATABASE_URL="$target_url" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -Xqv ON_ERROR_STOP=1 -c 'ALTER ROLE rendant_tenant LOGIN'
if RESTORE_DATABASE_URL="postgresql://restore_admin@127.0.0.1:$target_port/unsafe_test" \
	CONFIRM_RESTORE_DATABASE=unsafe_test CONFIRM_EMPTY_DATABASE_RESTORE=YES \
	scripts/restore-postgres.sh "$work/synthetic.dump" >"$work/unsafe.log" 2>&1; then
	echo "Unsafe existing tenant role unexpectedly accepted" >&2; exit 1
fi
[[ $(RENDANT_TEST_DATABASE_URL="postgresql://restore_admin@127.0.0.1:$target_port/unsafe_test" python3 scripts/postgres-connection.py RENDANT_TEST_DATABASE_URL psql -XAtc "select to_regclass('public.tenants') is null and (select rolcanlogin from pg_roles where rolname='rendant_tenant')") == t ]]
echo "PASS: fresh-cluster restore, encrypted MCP configuration, tenant isolation, counters, auth readiness, atomic failure and target/role guards"
