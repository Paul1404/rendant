import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Permission } from "@/lib/permissions";
const state = vi.hoisted(() => ({ stored: [] as Permission[], load: vi.fn() }));
vi.mock("@/server/services/role-policy", () => ({ getTenantRolePermissions: state.load }));
import { authenticateMcpRequest, mcpPermissionCeiling } from "@/server/mcp/auth";
import { handleMcpRequest } from "@/server/mcp/server";
vi.mock("@/server/services/mcp-settings", async () => import("./mcp-fixture"));
import { installMcpRegistryFixture } from "./mcp-fixture";
import { SVU_TENANT_ID } from "@/server/tenant-context";

function request(name: string) {
	return new Request("http://localhost:3000/api/mcp", { method: "POST", headers: { host: "localhost:3000", authorization: `Bearer ${"a".repeat(64)}`, accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) });
}
beforeEach(() => {
 installMcpRegistryFixture();
	vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
	vi.stubEnv("MCP_BEARER_TOKEN", "a".repeat(64));
	vi.stubEnv("MCP_ACCESS_MODE", "readonly");
	vi.stubEnv("TENANT_BASE_DOMAIN", "");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", "");
	vi.stubEnv("MCP_ALLOWED_ORIGINS", "");
	state.load.mockReset();
	state.load.mockImplementation(async () => state.stored);
	state.stored = [];
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("MCP capability ceilings and live tenant policy", () => {
	it("never grants write capabilities to readonly even if the user role policy later does", async () => {
		expect(mcpPermissionCeiling("readonly")).toEqual(["finance.read", "helpers.read", "exports.download"]);
		const resolved = await authenticateMcpRequest(request("list_protocols"));
		expect(resolved?.orpc.user.permissions).not.toContain("protocols.create");
		expect(resolved?.orpc.tenant?.permissions).not.toContain("users.manage");
	});

	it("preserves prior identity mode's ordinary user grants without granting administration", () => {
		const ceiling = mcpPermissionCeiling("identity");
		expect(ceiling).toContain("protocols.create");
		expect(ceiling).not.toContain("users.manage");
		expect(ceiling).not.toContain("roles.manage");
	});

	it("refuses business reads after their permission is removed from the stored SVU user policy", async () => {
		const response = await handleMcpRequest(request("list_protocols"));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.result.isError).toBe(true);
		expect(body.result.content[0].text.startsWith("FORBIDDEN:")).toBe(true);
		expect(state.load).toHaveBeenCalledWith(SVU_TENANT_ID, "user");
	});

	it("checks the stored admin policy for admin tokens instead of trusting the static role label", async () => {
		vi.stubEnv("MCP_ACCESS_MODE", "admin");
		const response = await handleMcpRequest(request("list_users"));
		const body = await response.json();
		expect(body.result.isError).toBe(true);
		expect(body.result.content[0].text.startsWith("FORBIDDEN:")).toBe(true);
		expect(state.load).toHaveBeenCalledWith(SVU_TENANT_ID, "admin");
	});
});
