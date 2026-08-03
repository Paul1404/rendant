import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { McpAuthContext } from "@/server/mcp/auth";
import { buildMcpServer, handleMcpRequest } from "@/server/mcp/server";

const previous = {
	url: process.env.BETTER_AUTH_URL,
	token: process.env.MCP_BEARER_TOKEN,
	mode: process.env.MCP_ACCESS_MODE,
};

afterEach(() => {
	restore("BETTER_AUTH_URL", previous.url);
	restore("MCP_BEARER_TOKEN", previous.token);
	restore("MCP_ACCESS_MODE", previous.mode);
});

describe("Rendant MCP", () => {
	it("rejects requests without a bearer token", async () => {
		process.env.BETTER_AUTH_URL = "http://localhost:3000";
		process.env.MCP_BEARER_TOKEN = "a".repeat(64);
		const response = await handleMcpRequest(mcpRequest("initialize", {}, 1));
		expect(response.status).toBe(401);
	});

	it("negotiates authenticated stateless Streamable HTTP", async () => {
		process.env.BETTER_AUTH_URL = "http://localhost:3000";
		process.env.MCP_BEARER_TOKEN = "a".repeat(64);
		process.env.MCP_ACCESS_MODE = "admin";
		const response = await handleMcpRequest(
			mcpRequest(
				"initialize",
				{
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "test", version: "1.0.0" },
				},
				1,
				"a".repeat(64),
			),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.result.serverInfo.name).toBe("rendant");
		expect(body.result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("exposes broad reads but no mutations in readonly mode", async () => {
		const server = buildMcpServer(auth("readonly"));
		const client = new Client({ name: "test", version: "1.0.0" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
		const result = await client.listTools();
		const names = result.tools.map((tool) => tool.name);
		expect(names).toContain("list_protocols");
		expect(names).toContain("list_historical_revenues");
		expect(names).toContain("revenue_summary");
		expect(names).toContain("list_cash_registers");
		expect(names).toContain("get_settings");
		expect(names).not.toContain("create_protocol");
		expect(names).not.toContain("list_users");
		expect(names).not.toContain("list_protocol_import_drafts");
		await client.close();
		await server.close();
	});

	it("advertises audited admin operations with destructive annotations", async () => {
		const server = buildMcpServer(auth("admin"));
		const client = new Client({ name: "test", version: "1.0.0" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
		const result = await client.listTools();
		const cancel = result.tools.find(
			(tool) => tool.name === "cancel_historical_revenue",
		);
		expect(cancel?.annotations?.destructiveHint).toBe(true);
		const importDraft = result.tools.find(
			(tool) => tool.name === "apply_protocol_import_draft",
		);
		expect(importDraft?.annotations?.destructiveHint).toBe(true);
		expect(result.tools.map((tool) => tool.name)).toContain("create_protocol");
		expect(result.tools.map((tool) => tool.name)).toContain("list_audit_events");
		expect(result.tools.map((tool) => tool.name)).toContain(
			"get_protocol_import_draft",
		);
		expect(result.tools.map((tool) => tool.name)).toContain(
			"update_protocol_import_draft_item",
		);
		await client.close();
		await server.close();
	});
});

function auth(accessMode: "readonly" | "admin"): McpAuthContext {
	return {
		accessMode,
		tokenFingerprint: "test",
		orpc: {
			user: {
				id: "mcp:test",
				email: "mcp@example.test",
				name: "MCP Test",
				role: accessMode === "admin" ? "admin" : "user",
			},
			headers: new Headers(),
			clientIp: "127.0.0.1",
			requestId: crypto.randomUUID(),
		},
	};
}

function mcpRequest(
	method: string,
	params: unknown,
	id: number,
	token?: string,
): Request {
	return new Request("http://localhost:3000/api/mcp", {
		method: "POST",
		headers: {
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
			host: "localhost:3000",
			"mcp-protocol-version": "2025-06-18",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
	});
}

function restore(key: string, value: string | undefined): void {
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
}
