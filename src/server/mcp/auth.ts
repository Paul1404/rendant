import { createHash, timingSafeEqual } from "node:crypto";
import type { ORPCContext } from "@/server/orpc/base";
import { clientIpFromHeaders } from "@/server/orpc/context";
import { requestIdFromHeaders } from "@/server/request-id";

export type McpAccessMode = "readonly" | "admin";

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
		configured: mcpIsConfigured(),
		accessMode: configuredAccessMode(),
		endpoint: "/api/mcp",
		actor: configuredActor(),
		auditedMutations: true,
	};
}

export function authenticateMcpRequest(
	request: Request,
): McpAuthContext | null {
	const expected = configuredToken();
	if (!expected) return null;
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return null;
	const provided = authorization.slice("Bearer ".length).trim();
	if (!secureEqual(provided, expected)) return null;

	const accessMode = configuredAccessMode();
	const actor = configuredActor();
	const headers = new Headers(request.headers);
	const requestId = requestIdFromHeaders(headers);
	headers.set("x-request-id", requestId);
	return {
		accessMode,
		tokenFingerprint: createHash("sha256")
			.update(expected)
			.digest("hex")
			.slice(0, 24),
		orpc: {
			user: {
				id: "mcp:codex",
				email: actor.email,
				name: actor.name,
				role: accessMode === "admin" ? "admin" : "user",
			},
			headers,
			clientIp: clientIpFromHeaders(headers),
			requestId,
		},
	};
}

function configuredAccessMode(): McpAccessMode {
	return process.env.MCP_ACCESS_MODE === "admin" ? "admin" : "readonly";
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
	const configured = configuredOrigin(request);
	const requested = new URL(request.url);
	if (requested.host !== configured.host) {
		return new Response("invalid host", { status: 403 });
	}
	const origin = request.headers.get("origin");
	if (origin && !allowedOrigins(configured).has(origin)) {
		return new Response("invalid origin", { status: 403 });
	}
	return null;
}

export function configuredMcpOrigin(request: Request): URL {
	return configuredOrigin(request);
}

function configuredToken(): string | null {
	const value = process.env.MCP_BEARER_TOKEN?.trim();
	return value && value.length >= 32 ? value : null;
}

function configuredOrigin(request: Request): URL {
	const value = process.env.BETTER_AUTH_URL?.trim();
	if (value) return new URL(value);
	if (process.env.NODE_ENV === "production") {
		throw new Error("BETTER_AUTH_URL fehlt für den MCP-Endpunkt");
	}
	return new URL(new URL(request.url).origin);
}

function allowedOrigins(primary: URL): Set<string> {
	const origins = new Set([primary.origin]);
	for (const candidate of (process.env.AUTH_TRUSTED_ORIGINS ?? "").split(",")) {
		const value = candidate.trim();
		if (!value) continue;
		try {
			origins.add(new URL(value).origin);
		} catch {
			// Invalid optional aliases are ignored here and rejected by auth setup.
		}
	}
	return origins;
}

function secureEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);
	return (
		leftBytes.length === rightBytes.length &&
		timingSafeEqual(leftBytes, rightBytes)
	);
}
