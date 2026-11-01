import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { validateRpcRequestBoundary } from "@/server/rpc-request-boundary";

const club = "https://sv-untereuerheim.rendant.app";
const operator = "https://admin.rendant.app";
const legacy = "https://rendant.sv-untereuerheim.de";
const origins = [club, operator, legacy];

describe("RPC browser request boundary", () => {
	it("rejects simple browser media types, including an absent content type", () => {
		for (const type of [null, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/jsonp"]) {
			const headers = new Headers();
			if (type) headers.set("content-type", type);
			const result = validateRpcRequestBoundary(new Request(`${club}/api/rpc/test`, { method: "POST", headers }), origins);
			expect(result?.status).toBe(415);
		}
	});

	it("rejects foreign, sibling, null and malformed origins for every write method", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			for (const origin of [operator, "https://attacker.example", "null", `${club}/`, `${club}/path`, "invalid", `${club}, ${operator}`]) {
				expect(validateRpcRequestBoundary(new Request(`${club}/api/rpc/test`, { method, headers: { "content-type": "application/json", origin } }), origins)?.status).toBe(403);
			}
		}
	});

	it("accepts own canonical, operator and legacy origins after TLS termination", () => {
		for (const origin of origins) {
			const request = new Request(`${origin.replace("https:", "http:")}/api/rpc/test`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8", origin } });
			expect(validateRpcRequestBoundary(request, origins)).toBeNull();
		}
	});

	it("uses the actual local origin without trusting forwarded hosts or schemes", () => {
		const request = (origin: string) => new Request("http://localhost:3100/api/rpc/test", { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-host": "admin.rendant.app", "x-forwarded-proto": "https" } });
		expect(validateRpcRequestBoundary(request("http://localhost:3100"), origins)).toBeNull();
		expect(validateRpcRequestBoundary(request(operator), origins)?.status).toBe(403);
	});

	it("accepts originless JSON server requests with a session cookie", () => {
		const request = new Request("http://127.0.0.1:3100/api/rpc/test", { method: "POST", headers: { "content-type": "application/json", cookie: "synthetic=session", host: "admin.rendant.app" } });
		expect(validateRpcRequestBoundary(request, origins)).toBeNull();
	});

	it("blocks the installed RPC handler's simple POST exploit before mutation", async () => {
		let mutations = 0;
		const handler = new RPCHandler({ mutate: os.input(v.object({ value: v.number() })).handler(() => ({ mutations: ++mutations })) });
		const serve = async (request: Request) => validateRpcRequestBoundary(request, origins) ?? (await handler.handle(request, { prefix: "/api/rpc", context: {} })).response;
		const bytes = new TextEncoder().encode(JSON.stringify({ json: { value: 1 } }));
		const request = (origin?: string, json = false) => new Request(`${club}/api/rpc/mutate`, { method: "POST", headers: { ...(origin ? { origin } : {}), ...(json ? { "content-type": "application/json" } : {}), cookie: "synthetic=session" }, body: bytes });

		expect((await serve(request(operator)))?.status).toBe(415);
		expect((await serve(request(operator, true)))?.status).toBe(403);
		expect(mutations).toBe(0);
		expect((await serve(request(club, true)))?.status).toBe(200);
		expect((await serve(request(undefined, true)))?.status).toBe(200);
		expect(mutations).toBe(2);
		const data = encodeURIComponent(JSON.stringify({ json: { value: 1 } }));
		expect((await serve(new Request(`${club}/api/rpc/mutate?data=${data}`)))?.status).toBe(405);
		expect(mutations).toBe(2);
	});
});
