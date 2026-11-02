import { sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { globalDb as db, db as tenantDb } from "@/server/db";
import { account, session, user } from "@/server/db/auth-schema";
import { appSettings } from "@/server/db/schema";
import {
	authSecurityEvents,
	memberships,
	tenants,
} from "@/server/db/tenant-schema";
import { logger } from "@/server/logger";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

type HealthSnapshot = {
	ok: boolean;
	db: boolean;
	status: "up" | "down" | "degraded";
	latencyMs: number;
	message: string;
	checkedAt: string;
};

const log = logger.child({ capability: "health" });
const PROBE_TIMEOUT_MS = 10_000;
const DEGRADED_LATENCY_MS = 1_500;

const TENANT_TABLES = [
	"anlass_aliase",
	"anlass_katalog",
	"app_settings",
	"audit_events",
	"ausgaben",
	"belegnummer_sequences",
	"cash_registers",
	"datev_deliveries",
	"helper_hour_aliases",
	"helper_hour_allocations",
	"helper_hour_categories",
	"helper_hour_events",
	"helper_hour_expenses",
	"helper_hour_note_rules",
	"helper_hour_persons",
	"helper_hours",
	"historical_protocol_import_drafts",
	"historical_protocol_import_items",
	"historical_protocol_import_review_items",
	"historical_protocol_import_review_phases",
	"historical_revenues",
	"historical_source_archives",
	"invitations",
	"protokoll_sumup_tage",
	"protokoll_umsatz_ust",
	"protokolle",
] as const;

async function withinHealthTimeout<T>(check: Promise<T>): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			check,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Readiness check timed out")),
					PROBE_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export async function collectAuthReadiness(): Promise<boolean> {
	try {
		await withinHealthTimeout(
			(async () => {
				const context = await auth.$context;
				if (!context.checkSchema)
					throw new Error("Auth schema check unavailable");
				await context.checkSchema();
				// The Drizzle adapter validates our declared model. Probe the physical
				// tables too: a missed migration can leave the model and PostgreSQL at
				// different revisions even when the adapter's verdict is clean.
				await Promise.all([
					db
						.select({
							enabled: appSettings.mcp_enabled,
							hash: appSettings.mcp_token_sha256,
							stamp: appSettings.mcp_updated_at,
						})
						.from(appSettings)
						.limit(0),
					db.select().from(user).limit(0),
					db.select().from(session).limit(0),
					db.select().from(account).limit(0),
				]);
				const result = await db.execute<{ issuer_optional: boolean }>(sql`
					select not exists (
						select 1 from information_schema.columns
						where table_schema = current_schema() and table_name = 'account'
							and column_name = 'issuer' and is_nullable = 'NO'
							and column_default is null
					) as issuer_optional
				`);
				if (!result.rows[0]?.issuer_optional) {
					throw new Error(
						"Legacy account issuer constraint blocks new accounts",
					);
				}
			})(),
		);
		return true;
	} catch (err) {
		log.error("Anmeldung nicht betriebsbereit", { err });
		return false;
	}
}

export async function collectTenantReadiness(): Promise<boolean> {
	try {
		await withinHealthTimeout(
			(async () => {
				// Probe the physical control-plane columns, not only Drizzle's model.
				await Promise.all([
					db.select().from(tenants).limit(0),
					db.select().from(memberships).limit(0),
					db.select().from(authSecurityEvents).limit(0),
				]);
				const result = await db.execute<{
					global_access: boolean;
					runtime_role_safe: boolean;
					business_tables_secure: boolean;
				}>(sql`
				select
					exists (select 1 from pg_roles where rolname = current_user
						and (rolsuper or rolbypassrls)) as global_access,
					exists (select 1 from pg_roles where rolname = 'rendant_tenant'
						and not rolsuper and not rolbypassrls and not rolcanlogin
						and not rolcreatedb and not rolcreaterole and not rolinherit) as runtime_role_safe,
					not exists (
						select 1 from unnest(${sql.param([...TENANT_TABLES])}::text[]) required(name)
						left join pg_namespace n on n.nspname = 'public'
						left join pg_class c on c.relnamespace = n.oid and c.relname = required.name
						where c.oid is null or not c.relrowsecurity or not c.relforcerowsecurity
							or not exists (
								select 1 from pg_policy p join pg_roles r on r.oid = any(p.polroles)
								where p.polrelid = c.oid and p.polname = 'tenant_isolation'
									and p.polcmd = '*' and r.rolname = 'rendant_tenant'
									and p.polqual is not null and p.polwithcheck is not null
							)
					) as business_tables_secure
			`);
				const verdict = result.rows[0];
				if (
					!verdict?.global_access ||
					!verdict.runtime_role_safe ||
					!verdict.business_tables_secure
				) {
					throw new Error("Tenant database isolation is not ready");
				}
				// Exercise the actual guarded pool too. A successful privileged ping
				// cannot prove that SET ROLE, tenant context and RLS work at runtime.
				const runtime = await withTenant(
					{ id: SVU_TENANT_ID, slug: "svu", name: "SVU" },
					async () =>
						await tenantDb.execute<{
							runtime_role: boolean;
							tenant_scope: boolean;
							settings_ready: boolean;
							foreign_rows_hidden: boolean;
						}>(sql`
					select current_user = 'rendant_tenant' as runtime_role,
						current_setting('app.tenant_id', true) = ${SVU_TENANT_ID} as tenant_scope,
						(select count(*) from public.app_settings where id = 1
							and tenant_id = ${SVU_TENANT_ID}::uuid) = 1 as settings_ready,
						not exists (select 1 from public.app_settings
							where tenant_id <> ${SVU_TENANT_ID}::uuid) as foreign_rows_hidden
				`),
				);
				const probe = runtime.rows[0];
				if (
					!probe?.runtime_role ||
					!probe.tenant_scope ||
					!probe.settings_ready ||
					!probe.foreign_rows_hidden
				) {
					throw new Error("Tenant runtime isolation is not ready");
				}
			})(),
		);
		return true;
	} catch (err) {
		log.error("Vereinsdaten nicht betriebsbereit", { err });
		return false;
	}
}

export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
	const started = performance.now();
	try {
		await withinHealthTimeout(db.execute(sql`select 1`));
		const latencyMs = Math.round(performance.now() - started);
		const degraded = latencyMs > DEGRADED_LATENCY_MS;
		return {
			ok: true,
			db: true,
			status: degraded ? "degraded" : "up",
			latencyMs,
			message: degraded ? `database ping ${latencyMs}ms` : "database ping OK",
			checkedAt: new Date().toISOString(),
		};
	} catch (err) {
		const latencyMs = Math.round(performance.now() - started);
		log.error("Health-Check Fehler", { err });
		return {
			ok: false,
			db: false,
			status: "down",
			latencyMs,
			message: "database ping failed",
			checkedAt: new Date().toISOString(),
		};
	}
}
