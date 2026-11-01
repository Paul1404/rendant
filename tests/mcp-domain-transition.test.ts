import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredMcpOrigin, validateMcpRequestBoundary } from "@/server/mcp/auth";

afterEach(() => vi.unstubAllEnvs());

describe("MCP domain transition", () => {
	it("preserves the old endpoint while the main application address changes", () => {
		vi.stubEnv("BETTER_AUTH_URL", "https://app.rendant.app");
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://rendant.sv-untereuerheim.de,https://svu.rendant.app");
		for (const origin of ["https://rendant.sv-untereuerheim.de", "https://svu.rendant.app"]) {
			const request = new Request(`${origin}/api/mcp`, { headers: { origin } });
			expect(validateMcpRequestBoundary(request)).toBeNull();
			expect(configuredMcpOrigin(request).origin).toBe(origin);
		}
		expect(validateMcpRequestBoundary(new Request("https://app.rendant.app/api/mcp"))?.status).toBe(403);
	});

	it("never extends the SVU token to SSV even if its host is mistakenly allowlisted", () => {
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://svu.rendant.app,https://ssv-gaedheim.rendant.app,https://ssv-gaedheim.rendant.pdcd.net");
		for (const hostname of ["ssv-gaedheim.rendant.app", "ssv-gaedheim.rendant.pdcd.net"]) {
			expect(validateMcpRequestBoundary(new Request(`https://${hostname}/api/mcp`))?.status).toBe(403);
		}
	});

	it("does not use the application origin list or forwarded headers to authorize MCP", () => {
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://ssv-gaedheim.rendant.app");
		vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://svu.rendant.app");
		const request = new Request("https://svu.rendant.app/api/mcp", { headers: { origin: "https://ssv-gaedheim.rendant.app", "x-forwarded-host": "svu.rendant.app" } });
		expect(validateMcpRequestBoundary(request)?.status).toBe(403);
		expect(validateMcpRequestBoundary(new Request("https://evil.example/api/mcp", { headers: { "x-forwarded-host": "svu.rendant.app" } }))?.status).toBe(403);
	});
});
