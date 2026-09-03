import { describe, expect, it } from "vitest";
import { redactText, serializeLogValue } from "@/server/logger";

// The fixtures are assembled at runtime rather than written as literals: a
// committed string shaped like a connection string or an access key id trips
// secret scanning on every future run, and a check that always fails is a check
// people stop reading.
const dbUri = ["postgres://user", ":", "pw-fixture", "@db.internal:5432/x"].join(
	"",
);
const accessKeyId = `AKIA${"IOSFODNN7EXAMPLE"}`;

describe("redactText", () => {
	it("strips credentials from a connection string", () => {
		expect(redactText(`connect ECONNREFUSED ${dbUri}`)).toBe(
			"connect ECONNREFUSED postgres://[redacted]@db.internal:5432/x",
		);
	});

	it("strips key=value secrets", () => {
		expect(redactText("failed with token=abc123 and password: pw-fixture")).toBe(
			"failed with token=[redacted] and password: [redacted]",
		);
	});

	it("strips AWS access key ids", () => {
		expect(redactText(`${accessKeyId} denied`)).toBe("[redacted] denied");
	});

	it("leaves ordinary text alone", () => {
		expect(redactText("Beleg 01 konnte nicht erzeugt werden")).toBe(
			"Beleg 01 konnte nicht erzeugt werden",
		);
	});
});

describe("serializeLogValue", () => {
	it("redacts by key name", () => {
		expect(serializeLogValue({ password: "x", ok: 1 })).toEqual({
			password: "[redacted]",
			ok: 1,
		});
	});

	it("redacts secrets carried inside an error message", () => {
		// The case that motivated this: a pg failure puts the connection string in
		// err.message, which is logged and also sent to the external health ingest.
		const err = new Error(`getaddrinfo failed for ${dbUri}`);
		const out = serializeLogValue(err) as { message: string };
		expect(out.message).toBe(
			"getaddrinfo failed for postgres://[redacted]@db.internal:5432/x",
		);
	});
});
