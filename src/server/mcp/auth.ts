import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { resolveTrustedOrigins } from "@/server/auth-origins";
import { globalDb } from "@/server/db";
import { tenants } from "@/server/db/tenant-schema";
import { isOperatorHost } from "@/server/operator-host";
import type { ORPCContext } from "@/server/orpc/base";
import { clientIpFromHeaders } from "@/server/orpc/context";
import { requestIdFromHeaders } from "@/server/request-id";
import {
	getMcpCredentialForAuthentication,
	getMcpSettings,
} from "@/server/services/mcp-settings";
import {
	currentTenant,
	SVU_TENANT_ID,
	type TenantContext,
	tenantRequestHeaders,
	withTenant,
} from "@/server/tenant-context";
import { tenantSlugForHost } from "@/server/tenant-hostname";

// "identity" is the compatibility token mode bounded by ordinary user rights.
// Audit labels do not identify an interactive account. Role administration is
// unavailable to every MCP mode and stays in the operator console.
export type McpAccessMode = "readonly" | "admin" | "identity";

export function mcpPermissionCeiling(mode: McpAccessMode): Permission[] {
	if (mode === "readonly")
		return ["finance.read", "helpers.read", "exports.download"];
	return [...DEFAULT_ROLE_PERMISSIONS[mode === "admin" ? "admin" : "user"]];
}

export type McpAuthContext = {
	accessMode: McpAccessMode;
	orpc: ORPCContext & { user: NonNullable<ORPCContext["user"]> };
	tokenFingerprint: string;
};

export type McpStatus = {
	configured: boolean;
	accessMode: McpAccessMode;
	endpoint: string;
	actor: {
		name: string;
		email: string;
	};
	auditedMutations: true;
};

export async function mcpIsConfigured(): Promise<boolean> {
	return (await getMcpStatus()).configured;
}

export async function getMcpStatus() {
	if (!currentTenant())
		return {
			configured: false,
			enabled: false,
			accessMode: "readonly" as const,
			endpoint: "/api/mcp",
			actor: { name: "Rendant MCP", email: "mcp@rendant.local" },
			has_token: false,
			source: "disabled" as const,
			auditedMutations: true as const,
		};
	return { ...(await getMcpSettings()), auditedMutations: true as const };
}

export async function authenticateMcpRequest(
	request: Request,
): Promise<McpAuthContext | null> {
	if (validateMcpRequestBoundary(request)) return null;
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return null;
	const hostTenant = tenantSlugForHost(new URL(request.url).host);
	// A neutral old endpoint remains exclusively an SVU compatibility address,
	// including after its operator explicitly saves a tenant configuration.
	if (
		!hostTenant &&
		!legacyOrigins(request).some(
			(origin) => origin.host === new URL(request.url).host,
		)
	)
		return null;
	const [resolved] = await globalDb
		.select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
		.from(tenants)
		.where(
			hostTenant ? eq(tenants.slug, hostTenant) : eq(tenants.id, SVU_TENANT_ID),
		)
		.limit(1);
	if (!resolved) return null;
	const selectors = [
		request.headers.get("x-rendant-tenant"),
		new URL(request.url).searchParams.get("tenant"),
	];
	if (
		selectors.some(
			(selected) =>
				selected && selected !== resolved.id && selected !== resolved.slug,
		)
	)
		return null;
	const configuration = await withTenant(
		resolved,
		getMcpCredentialForAuthentication,
	);
	if (!configuration.enabled || !configuration.token) return null;
	// The deployment credential never crosses its original host allowlist or
	// tenant boundary. Other clubs require their own explicit stored credential.
	if (
		configuration.source === "legacy" &&
		(resolved.id !== SVU_TENANT_ID ||
			!legacyOrigins(request).some(
				(origin) => origin.host === new URL(request.url).host,
			))
	)
		return null;
	if (resolved.id !== SVU_TENANT_ID && configuration.source !== "tenant")
		return null;
	if (
		!secureEqual(
			authorization.slice("Bearer ".length).trim(),
			configuration.token,
		)
	)
		return null;
	const accessMode = configuration.accessMode;
	const permissions = mcpPermissionCeiling(accessMode);
	const headers = tenantRequestHeaders(request);
	const requestId = requestIdFromHeaders(headers);
	headers.set("x-request-id", requestId);
	const tenant: TenantContext = {
		...resolved,
		role: accessMode === "admin" ? "admin" : "user",
		permissions,
	};
	return {
		accessMode,
		tokenFingerprint: createHash("sha256")
			.update(configuration.token)
			.digest("hex")
			.slice(0, 24),
		orpc: {
			tenant,
			user: {
				id:
					configuration.source === "legacy"
						? "mcp:codex"
						: `mcp:${resolved.id}`,
				email: configuration.actor.email,
				name: configuration.actor.name,
				role: accessMode === "admin" ? "admin" : "user",
				permissions,
			},
			headers,
			clientIp: clientIpFromHeaders(headers),
			requestId,
		},
	};
}

export function mcpUnauthorizedResponse(): Response {
	return Response.json(
		{
			jsonrpc: "2.0",
			error: { code: -32001, message: "Unauthorized" },
			id: null,
		},
		{
			status: 401,
			headers: { "www-authenticate": "Bearer" },
		},
	);
}

export function validateMcpRequestBoundary(request: Request): Response | null {
	const requested = new URL(request.url);
	try {
		const headers = tenantRequestHeaders(request);
		if (isOperatorHost(headers))
			return new Response("invalid host", { status: 403 });
		const origins = configuredOrigins(request);
		if (!origins.some((origin) => origin.host === requested.host))
			return new Response("invalid host", { status: 403 });
		const origin = headers.get("origin");
		if (origin && !configuredMcpAllowedOrigins(request).includes(origin))
			return new Response("invalid origin", { status: 403 });
		return null;
	} catch {
		return new Response("invalid host", { status: 403 });
	}
}

export function configuredMcpOrigin(request: Request): URL {
	const requested = new URL(request.url);
	const selected = configuredOrigins(request).find(
		(origin) => origin.host === requested.host,
	);
	if (!selected) throw new Error("Die MCP-Adresse ist nicht freigegeben");
	return selected;
}

export function configuredMcpAllowedOrigins(request: Request): string[] {
	const requested = new URL(request.url);
	const own = configuredOrigins(request)
		.filter((origin) => origin.host === requested.host)
		.map((origin) => origin.origin);
	const owner = tenantSlugForHost(requested.host);
	if (
		(owner === "svu" || owner === null) &&
		process.env.MCP_ALLOWED_ORIGINS?.trim()
	) {
		const legacy = legacyOrigins(request);
		if (legacy.some((origin) => origin.host === requested.host)) {
			for (const origin of legacy) {
				const bound = tenantSlugForHost(origin.host);
				if (
					(bound === "svu" || bound === null) &&
					!isOperatorHost(new Headers({ host: origin.host }))
				)
					own.push(origin.origin);
			}
		}
	}
	return [...new Set(own)];
}

function configuredOrigins(request: Request): URL[] {
	const hostTenant = tenantSlugForHost(new URL(request.url).host);
	const approved = resolveTrustedOrigins(
		process.env.BETTER_AUTH_URL,
		process.env.AUTH_TRUSTED_ORIGINS,
	).map((origin) => new URL(origin));
	// Application-origin additions can enable a new club's own stored token,
	// but never authorize the old deployment token on that club's host.
	if (hostTenant)
		return hostTenant === "svu"
			? [...legacyOrigins(request), ...approved]
			: approved;
	return legacyOrigins(request);
}

function legacyOrigins(request: Request): URL[] {
	const explicit = process.env.MCP_ALLOWED_ORIGINS?.trim();
	if (explicit)
		return resolveTrustedOrigins(undefined, explicit, "production").map(
			(origin) => new URL(origin),
		);
	const primary = process.env.BETTER_AUTH_URL?.trim();
	if (primary) return [new URL(primary)];
	if (process.env.NODE_ENV === "production") return [];
	return [new URL(new URL(request.url).origin)];
}

function secureEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);
	return (
		leftBytes.length === rightBytes.length &&
		timingSafeEqual(leftBytes, rightBytes)
	);
}
