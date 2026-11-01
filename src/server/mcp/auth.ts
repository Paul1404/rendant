import { createHash, timingSafeEqual } from "node:crypto";
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { resolveTrustedOrigins } from "@/server/auth-origins";
import { isOperatorHost } from "@/server/operator-host";
import type { ORPCContext } from "@/server/orpc/base";
import { clientIpFromHeaders } from "@/server/orpc/context";
import { requestIdFromHeaders } from "@/server/request-id";
import {
	currentTenant,
	SVU_TENANT_ID,
	type TenantContext,
} from "@/server/tenant-context";
import { tenantSlugForHost } from "@/server/tenant-hostname";

// "identity" additionally exposes invitation and user-role tools. It is opt-in
// and off by default: those tools can mint an admin account, so they should
// require a human session rather than a long-lived static token.
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

export function mcpIsConfigured(): boolean {
	return configuredToken() !== null;
}

export function getMcpStatus(): McpStatus {
	return {
		configured:
			mcpIsConfigured() &&
			(!currentTenant() || currentTenant()?.id === SVU_TENANT_ID),
		accessMode: configuredAccessMode(),
		endpoint: "/api/mcp",
		actor: configuredActor(),
		auditedMutations: true,
	};
}

export function authenticateMcpRequest(
	request: Request,
): McpAuthContext | null {
	if (isOperatorHost(new Headers({ host: new URL(request.url).host })))
		return null;
	const expected = configuredToken();
	if (!expected) return null;
	const hostTenant = tenantSlugForHost(new URL(request.url).host);
	if (hostTenant && hostTenant !== "svu") return null;
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return null;
	const provided = authorization.slice("Bearer ".length).trim();
	if (!secureEqual(provided, expected)) return null;
	// The existing deployment token belongs exclusively to SVU. A caller cannot
	// turn an operational token into access to a newly created club.
	const selectors = [
		request.headers.get("x-rendant-tenant"),
		new URL(request.url).searchParams.get("tenant"),
	];
	if (
		selectors.some(
			(selected) =>
				selected && selected !== SVU_TENANT_ID && selected !== "svu",
		)
	)
		return null;

	const accessMode = configuredAccessMode();
	const permissions = mcpPermissionCeiling(accessMode);
	const actor = configuredActor();
	const headers = new Headers(request.headers);
	const requestId = requestIdFromHeaders(headers);
	const tenant: TenantContext = {
		id: SVU_TENANT_ID,
		slug: "svu",
		name: "SVU",
		role: accessMode === "admin" ? "admin" : "user",
		permissions,
	};
	headers.set("x-request-id", requestId);
	return {
		accessMode,
		tokenFingerprint: createHash("sha256")
			.update(expected)
			.digest("hex")
			.slice(0, 24),
		orpc: {
			tenant,
			user: {
				id: "mcp:codex",
				email: actor.email,
				name: actor.name,
				role: accessMode === "admin" ? "admin" : "user",
				permissions,
			},
			headers,
			clientIp: clientIpFromHeaders(headers),
			requestId,
		},
	};
}

function configuredAccessMode(): McpAccessMode {
	const mode = process.env.MCP_ACCESS_MODE;
	if (mode === "identity") return "identity";
	return mode === "admin" ? "admin" : "readonly";
}

function configuredActor(): McpStatus["actor"] {
	return {
		email: process.env.MCP_ACTOR_EMAIL?.trim() || "codex@rendant.local",
		name: process.env.MCP_ACTOR_NAME?.trim() || "Codex MCP",
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
	if (isOperatorHost(new Headers({ host: requested.host })))
		return new Response("invalid host", { status: 403 });
	const hostTenant = tenantSlugForHost(requested.host);
	const origins = configuredOrigins(request);
	if (
		(hostTenant && hostTenant !== "svu") ||
		!origins.some((origin) => origin.host === requested.host)
	)
		return new Response("invalid host", { status: 403 });
	const origin = request.headers.get("origin");
	if (origin && !origins.some((allowed) => allowed.origin === origin))
		return new Response("invalid origin", { status: 403 });
	return null;
}

export function configuredMcpOrigin(request: Request): URL {
	const requested = new URL(request.url);
	const selected = configuredOrigins(request).find(
		(origin) => origin.host === requested.host,
	);
	if (!selected) throw new Error("Die MCP-Adresse ist nicht freigegeben");
	return selected;
}

function configuredOrigins(request: Request): URL[] {
	const explicit = process.env.MCP_ALLOWED_ORIGINS?.trim();
	if (explicit)
		return resolveTrustedOrigins(undefined, explicit, "production").map(
			(origin) => new URL(origin),
		);
	const primary = process.env.BETTER_AUTH_URL?.trim();
	if (primary) return [new URL(primary)];
	if (process.env.NODE_ENV === "production")
		throw new Error(
			"MCP_ALLOWED_ORIGINS oder BETTER_AUTH_URL fehlt für den MCP-Endpunkt",
		);
	return [new URL(new URL(request.url).origin)];
}

function configuredToken(): string | null {
	const value = process.env.MCP_BEARER_TOKEN?.trim();
	return value && value.length >= 32 ? value : null;
}

function secureEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);
	return (
		leftBytes.length === rightBytes.length &&
		timingSafeEqual(leftBytes, rightBytes)
	);
}
