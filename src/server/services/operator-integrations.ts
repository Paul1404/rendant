import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import type * as v from "valibot";
import type {
	DatevSettingsSchema,
	EmailSettingsSchema,
	SumupSettingsSchema,
} from "@/lib/schemas";
import { globalDb, type TransactionRunner } from "@/server/db";
import { tenants } from "@/server/db/tenant-schema";
import { type TenantContext, withTenant } from "@/server/tenant-context";
import { type RecordAuditInput, recordAuditEventStrict } from "./audit";
import { getDatevSettings, updateDatevSettings } from "./datev";
import { getEmailSettings, sendTestEmail, updateEmailSettings } from "./email";
import { getMcpSettings, updateMcpSettings } from "./mcp-settings";
import { SettingsConcurrencyError } from "./settings";
import {
	getSumupSettings,
	SumupError,
	testSumupConnection,
	updateSumupSettings,
} from "./sumup";
import {
	assertPlatformAdmin,
	assertPlatformAdminInTransaction,
} from "./tenants";

type Actor = NonNullable<RecordAuditInput["actor"]>;
type RequestAudit = RecordAuditInput["request"];
type TenantInput<T> = T & { tenantId: string };

async function target(tenantId: string, actor: Actor): Promise<TenantContext> {
	await assertPlatformAdmin(actor.id);
	const [tenant] = await globalDb
		.select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
		.from(tenants)
		.where(eq(tenants.id, tenantId));
	if (!tenant)
		throw new ORPCError("NOT_FOUND", { message: "Verein nicht gefunden" });
	return tenant;
}

async function scoped<T>(
	tenant: TenantContext,
	work: () => Promise<T>,
): Promise<T> {
	try {
		return await withTenant(tenant, work);
	} catch (error) {
		if (error instanceof ORPCError || error instanceof SettingsConcurrencyError)
			throw error;
		if (error instanceof SumupError)
			throw new ORPCError("BAD_REQUEST", { message: error.message });
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message:
				"Die technische Einrichtung konnte nicht verarbeitet werden. Bitte Eingaben und Verbindung prüfen.",
		});
	}
}

/** A single transaction holds the operator proof through the technical write.
 * Once authorized, the remaining queries use the restricted business role and
 * transaction-local destination. No transport secret or financial row escapes. */
function writer(tenant: TenantContext, actor: Actor): TransactionRunner {
	return (work) =>
		globalDb.transaction(async (tx) => {
			await assertPlatformAdminInTransaction(tx, actor.id);
			const [exists] = await tx
				.select({ id: tenants.id })
				.from(tenants)
				.where(eq(tenants.id, tenant.id));
			if (!exists)
				throw new ORPCError("NOT_FOUND", { message: "Verein nicht gefunden" });
			await tx.execute(
				sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
			);
			await tx.execute(sql`SET LOCAL ROLE rendant_tenant`);
			return work(tx);
		});
}

function audit(
	actor: Actor,
	request: RequestAudit,
	id: string,
	metadata: Record<string, unknown>,
): RecordAuditInput {
	return {
		actor,
		request,
		category: "settings",
		action: `settings.${id}_changed`,
		subject: { type: "settings", id, label: id },
		metadata: { ...metadata, operator: true },
	};
}

export async function getOperatorIntegrations(tenantId: string, actor: Actor) {
	const tenant = await target(tenantId, actor);
	return scoped(tenant, async () => {
		const [email, sumup, datev, mcp] = await Promise.all([
			getEmailSettings(),
			getSumupSettings(),
			getDatevSettings(),
			getMcpSettings(),
		]);
		return { email, sumup, datev, mcp };
	});
}

export async function updateOperatorEmailSettings(
	input: TenantInput<v.InferOutput<typeof EmailSettingsSchema>> & {
		expected_updated_at: string;
	},
	actor: Actor,
	request?: RequestAudit,
) {
	const tenant = await target(input.tenantId, actor);
	return scoped(tenant, () =>
		updateEmailSettings(
			input,
			audit(actor, request, "email", {
				enabled: input.enabled,
				password_changed: Boolean(input.password || input.clear_password),
			}),
			writer(tenant, actor),
		),
	);
}
export async function updateOperatorSumupSettings(
	input: TenantInput<v.InferOutput<typeof SumupSettingsSchema>>,
	actor: Actor,
	request?: RequestAudit,
) {
	const tenant = await target(input.tenantId, actor);
	return scoped(tenant, () =>
		updateSumupSettings(
			input,
			audit(actor, request, "sumup", {
				enabled: input.enabled,
				api_key_changed: Boolean(input.api_key || input.clear_api_key),
			}),
			input.expected_updated_at,
			writer(tenant, actor),
		),
	);
}
export async function updateOperatorDatevSettings(
	input: TenantInput<v.InferOutput<typeof DatevSettingsSchema>>,
	actor: Actor,
	request?: RequestAudit,
) {
	const tenant = await target(input.tenantId, actor);
	return scoped(tenant, () =>
		updateDatevSettings(
			input,
			{ actor, request, operator: true },
			writer(tenant, actor),
		),
	);
}
export async function updateOperatorMcpSettings(
	input: TenantInput<Parameters<typeof updateMcpSettings>[0]>,
	actor: Actor,
	request?: RequestAudit,
) {
	const tenant = await target(input.tenantId, actor);
	return scoped(tenant, () =>
		updateMcpSettings(
			input,
			audit(actor, request, "mcp", {
				enabled: input.enabled,
				token_changed: Boolean(input.token || input.clear_token),
			}),
			writer(tenant, actor),
		),
	);
}

async function recordTestIntent(
	tenant: TenantContext,
	actor: Actor,
	request: RequestAudit,
	kind: string,
) {
	await writer(
		tenant,
		actor,
	)(async (tx) =>
		recordAuditEventStrict(tx, {
			actor,
			request,
			category: "settings",
			action: `settings.${kind}_test_requested`,
			subject: { type: "settings", id: kind, label: kind },
			metadata: { operator: true },
		}),
	);
}
export async function sendOperatorTestEmail(
	input: { tenantId: string; to: string },
	actor: Actor,
	request?: RequestAudit,
) {
	const tenant = await target(input.tenantId, actor);
	await recordTestIntent(tenant, actor, request, "email");
	// Sending is an explicit external action. A failure is never retried here;
	// the recorded intent does not claim inbox delivery or SMTP acceptance.
	try {
		await scoped(tenant, () => sendTestEmail(input.to));
		return { ok: true as const };
	} catch {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Der E-Mail-Versand ist nicht bestätigt. Bitte vor einem erneuten Versand das Zielpostfach prüfen.",
		});
	}
}
export async function testOperatorSumupConnection(
	input: { tenantId: string },
	actor: Actor,
	request?: RequestAudit,
) {
	const tenant = await target(input.tenantId, actor);
	await recordTestIntent(tenant, actor, request, "sumup");
	return scoped(tenant, () => testSumupConnection());
}
