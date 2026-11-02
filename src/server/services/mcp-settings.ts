import { createHash, timingSafeEqual } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { db, type TransactionRunner } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import type { McpAccessMode } from "@/server/mcp/auth";
import { requireTenant, SVU_TENANT_ID } from "@/server/tenant-context";
import { type RecordAuditInput, recordAuditEventStrict } from "./audit";
import { decryptSecret, encryptSecret } from "./secret-box";
import { claimSettingsGroup, SettingsConcurrencyError } from "./settings";

type Row = typeof appSettings.$inferSelect;
export type McpSettingsPatch = {
	enabled: boolean;
	accessMode: McpAccessMode;
	actor_name: string;
	actor_email: string;
	token?: string;
	clear_token?: boolean;
	expected_updated_at?: string;
};
export function legacyMcpToken(): string | null {
	const value = process.env.MCP_BEARER_TOKEN?.trim();
	return value && value.length >= 32 ? value : null;
}
function effective(row: Row) {
	const tenant = requireTenant();
	const legacy = tenant.id === SVU_TENANT_ID && !row.mcp_override;
	const raw = legacy
		? legacyMcpToken()
		: row.mcp_override
			? decryptSecret(row.mcp_token_enc)
			: null;
	const token = raw && raw.length >= 32 ? raw : null;
	const configuredMode = legacy
		? process.env.MCP_ACCESS_MODE
		: row.mcp_access_mode;
	const accessMode: McpAccessMode =
		configuredMode === "admin" || configuredMode === "identity"
			? configuredMode
			: "readonly";
	return {
		token,
		enabled: legacy ? token !== null : row.mcp_override && row.mcp_enabled,
		accessMode,
		actor: legacy
			? {
					name: process.env.MCP_ACTOR_NAME?.trim() || "Codex MCP",
					email: process.env.MCP_ACTOR_EMAIL?.trim() || "codex@rendant.local",
				}
			: { name: row.mcp_actor_name, email: row.mcp_actor_email },
		source: legacy
			? ("legacy" as const)
			: row.mcp_override
				? ("tenant" as const)
				: ("disabled" as const),
		updated_at: row.mcp_updated_at.toISOString(),
	};
}
function sanitized(row: Row) {
	const { token, ...settings } = effective(row);
	return {
		...settings,
		has_token: token !== null,
		endpoint: "/api/mcp",
		configured: settings.enabled && token !== null,
	};
}
async function row() {
	const [value] = await db
		.select()
		.from(appSettings)
		.where(
			and(eq(appSettings.tenant_id, requireTenant().id), eq(appSettings.id, 1)),
		)
		.limit(1);
	if (!value)
		throw new ORPCError("CONFLICT", {
			message: "Die Vereinseinstellungen sind unvollständig",
		});
	return value;
}
export async function getMcpSettings() {
	return sanitized(await row());
}
// Authentication-only credential read. Never expose this result through RPC.
export async function getMcpCredentialForAuthentication() {
	return effective(await row());
}
export async function updateMcpSettings(
	patch: McpSettingsPatch,
	audit: RecordAuditInput,
	transaction: TransactionRunner = (work) => db.transaction(work),
) {
	const tenant = requireTenant();
	if (
		!["readonly", "admin", "identity"].includes(patch.accessMode) ||
		!patch.actor_name.trim() ||
		patch.actor_name.length > 120 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.actor_email.trim()) ||
		patch.actor_email.length > 254
	)
		throw new ORPCError("BAD_REQUEST", {
			message: "Bitte gültige MCP-Einstellungen angeben",
		});
	const replacement = patch.token?.trim();
	if (replacement && (replacement.length < 32 || replacement.length > 4096))
		throw new ORPCError("BAD_REQUEST", {
			message: "Das Zugriffstoken muss 32 bis 4096 Zeichen lang sein",
		});
	if (replacement && patch.clear_token)
		throw new ORPCError("BAD_REQUEST", {
			message: "Bitte das Token entweder ersetzen oder entfernen",
		});
	try {
		return await transaction(async (tx) => {
			const stamp = await claimSettingsGroup(
				tx,
				"mcp_updated_at",
				patch.expected_updated_at,
				tenant.id,
			);
			const [current] = await tx
				.select()
				.from(appSettings)
				.where(
					and(eq(appSettings.tenant_id, tenant.id), eq(appSettings.id, 1)),
				);
			const token = patch.clear_token
				? null
				: replacement || effective(current).token;
			if (patch.enabled && !token)
				throw new ORPCError("BAD_REQUEST", {
					message: "Bitte ein Zugriffstoken speichern oder MCP deaktivieren",
				});
			const legacy = legacyMcpToken();
			if (tenant.id !== SVU_TENANT_ID && token && legacy) {
				const left = Buffer.from(createHash("sha256").update(token).digest());
				const right = Buffer.from(createHash("sha256").update(legacy).digest());
				if (timingSafeEqual(left, right))
					throw new ORPCError("CONFLICT", {
						message:
							"Bitte ein eigenes Zugriffstoken für diesen Verein verwenden",
					});
			}
			const [saved] = await tx
				.update(appSettings)
				.set({
					mcp_override: true,
					mcp_enabled: patch.enabled,
					mcp_access_mode: patch.accessMode,
					mcp_actor_name: patch.actor_name.trim(),
					mcp_actor_email: patch.actor_email.trim(),
					mcp_token_enc: token ? encryptSecret(token) : "",
					mcp_token_sha256: token
						? createHash("sha256").update(token).digest("hex")
						: "",
					mcp_updated_at: stamp,
					updated_at: stamp,
				})
				.where(and(eq(appSettings.tenant_id, tenant.id), eq(appSettings.id, 1)))
				.returning();
			await recordAuditEventStrict(tx, {
				...audit,
				metadata: {
					...audit.metadata,
					enabled: patch.enabled,
					accessMode: patch.accessMode,
					token_changed: Boolean(replacement || patch.clear_token),
					legacy_overridden: !current.mcp_override,
				},
			});
			return sanitized(saved);
		});
	} catch (error) {
		const cause = (error as { cause?: { code?: string; constraint?: string } })
			?.cause;
		if (
			cause?.code === "23505" &&
			cause.constraint === "app_settings_mcp_token_sha256_unique"
		)
			throw new ORPCError("CONFLICT", {
				message: "Bitte ein eigenes Zugriffstoken für diesen Verein verwenden",
			});
		if (error instanceof ORPCError || error instanceof SettingsConcurrencyError)
			throw error;
		// Drizzle errors include bound values, including encrypted credentials.
		// Keep them out of both the generic RPC logger and the client response.
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Die MCP-Einstellungen konnten nicht gespeichert werden",
		});
	}
}
