import { call, ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { SumupSettingsSchema } from "@/lib/schemas";
import { type ORPCContext, pub } from "@/server/orpc/base";

const context: ORPCContext = {
	user: null,
	headers: new Headers(),
	clientIp: "127.0.0.1",
	requestId: "test-request",
};

// The whole point of the middleware: a rejected input must leave the server as a
// German message with no submitted value attached.
const procedure = pub
	.input(SumupSettingsSchema)
	.handler(() => ({ ok: true as const }));

describe("oRPC input rejection", () => {
	it("replaces the English frame message with a German one", async () => {
		const err = await call(
			procedure,
			{ enabled: true, api_key: "sup_sk_geheim".padEnd(600, "x") },
			{ context },
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ORPCError);
		const orpc = err as ORPCError<string, unknown>;
		expect(orpc.code).toBe("BAD_REQUEST");
		expect(orpc.message).toBe(
			"Eingabe abgelehnt. API-Key: höchstens 500 Zeichen.",
		);
	});

	it("does not hand the submitted value back to the browser", async () => {
		const err = (await call(
			procedure,
			{ enabled: true, api_key: "sup_sk_geheim".padEnd(600, "x") },
			{ context },
		).catch((e: unknown) => e)) as ORPCError<string, unknown>;
		expect(err.data).toBeUndefined();
		expect(JSON.stringify(err.toJSON())).not.toContain("sup_sk_geheim");
	});

	it("lets a valid input through", async () => {
		await expect(
			call(
				procedure,
				{ enabled: false, api_key: "", clear_api_key: false },
				{ context },
			),
		).resolves.toEqual({ ok: true });
	});
});
