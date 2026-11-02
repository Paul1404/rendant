import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateMcpRequest, configuredMcpOrigin, validateMcpRequestBoundary } from "@/server/mcp/auth";

vi.mock("@/server/services/mcp-settings", async () => import("./mcp-fixture"));
import { installMcpRegistryFixture } from "./mcp-fixture";
beforeEach(installMcpRegistryFixture);
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("MCP domain transition", () => {
	it("preserves the old endpoint while the main application address changes", async () => {
		vi.stubEnv("BETTER_AUTH_URL", "https://app.rendant.app");
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://rendant.sv-untereuerheim.de,https://svu.rendant.app");
		for (const origin of ["https://rendant.sv-untereuerheim.de", "https://svu.rendant.app"]) {
			const request = new Request(`${origin}/api/mcp`, { headers: { origin } });
			expect(validateMcpRequestBoundary(request)).toBeNull();
			expect(configuredMcpOrigin(request).origin).toBe(origin);
		}
		vi.stubEnv("MCP_BEARER_TOKEN", "a".repeat(64));
		expect(await authenticateMcpRequest(new Request("https://app.rendant.app/api/mcp", { headers: { authorization: `Bearer ${"a".repeat(64)}` } }))).toBeNull();
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

	it("allows explicit SVU legacy origin aliases without accepting another club or operator origin", () => {
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
		vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://svu.rendant.app,https://rendant.sv-untereuerheim.de,https://ssv-gaedheim.rendant.app,https://admin.rendant.app");
		const request = (origin: string) => new Request("https://svu.rendant.app/api/mcp", { headers: { origin } });
		expect(validateMcpRequestBoundary(request("https://rendant.sv-untereuerheim.de"))).toBeNull();
		expect(validateMcpRequestBoundary(request("https://ssv-gaedheim.rendant.app"))?.status).toBe(403);
		expect(validateMcpRequestBoundary(request("https://admin.rendant.app"))?.status).toBe(403);
	});
});


describe("operator host does not expose financial MCP access", () => {
	it("rejects an accidentally allowlisted operator host", async () => {
		vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://admin.rendant.app,https://sv-untereuerheim.rendant.app");
		expect(validateMcpRequestBoundary(new Request("https://admin.rendant.app/api/mcp"))?.status).toBe(403);
		vi.stubEnv("MCP_BEARER_TOKEN", "a".repeat(64));
		expect(await authenticateMcpRequest(new Request("https://admin.rendant.app/api/mcp", { headers: { authorization: `Bearer ${"a".repeat(64)}` } }))).toBeNull();
	});
});
