import { describe, expect, it } from "vitest";
import {
	createSandboxCredentials,
	objectStoreResponse,
	parsePublishedPort,
	sandboxPort,
} from "../scripts/sandbox";

describe("disposable sandbox", () => {
	it("generates fresh throwaway credentials and secrets", () => {
		const first = createSandboxCredentials();
		const second = createSandboxCredentials();

		expect(first.name).toBe("Sandbox Admin");
		expect(first.email).toMatch(/^sandbox-[a-f0-9]{12}@example\.test$/);
		expect(first.password.length).toBeGreaterThanOrEqual(20);
		expect(first.authSecret).toHaveLength(64);
		expect(second.email).not.toBe(first.email);
		expect(second.password).not.toBe(first.password);
	});

	it("uses port 3100 by default and validates overrides", () => {
		expect(sandboxPort(undefined)).toBe(3100);
		expect(sandboxPort("4310")).toBe(4310);
		expect(() => sandboxPort("80")).toThrow(/1024/);
		expect(() => sandboxPort("invalid")).toThrow(/1024/);
	});

	it("parses Docker's dynamically published localhost port", () => {
		expect(parsePublishedPort("127.0.0.1:49172\n")).toBe(49_172);
		expect(() => parsePublishedPort("not-a-port")).toThrow(/Docker-Port/);
	});

	it("stores, lists, returns and deletes PDF objects in memory", () => {
		const objects = new Map<string, Buffer>();
		const objectUrl = "http://127.0.0.1/rendant-sandbox/protokolle/test.pdf";

		expect(
			objectStoreResponse("PUT", objectUrl, Buffer.from("pdf"), objects).status,
		).toBe(200);
		expect(objects.get("protokolle/test.pdf")?.toString()).toBe("pdf");

		const listed = objectStoreResponse(
			"GET",
			"http://127.0.0.1/rendant-sandbox?list-type=2&prefix=protokolle%2F",
			Buffer.alloc(0),
			objects,
		);
		expect(listed.status).toBe(200);
		expect(String(listed.body)).toContain("<Key>protokolle/test.pdf</Key>");

		const downloaded = objectStoreResponse(
			"GET",
			objectUrl,
			Buffer.alloc(0),
			objects,
		);
		expect(downloaded.status).toBe(200);
		expect(Buffer.from(downloaded.body ?? "").toString()).toBe("pdf");

		expect(
			objectStoreResponse("DELETE", objectUrl, Buffer.alloc(0), objects).status,
		).toBe(204);
		expect(objects.size).toBe(0);
	});
});
