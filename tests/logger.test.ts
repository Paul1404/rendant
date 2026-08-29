import { describe, expect, it } from "vitest";
import { serializeLogValue } from "@/server/logger";

describe("serializeLogValue", () => {
	it("preserves useful Error details and redacts nested secrets", () => {
		const cause = new Error("socket closed");
		const error = Object.assign(new Error("PDF failed", { cause }), {
			code: "PDF_RENDER_FAILED",
		});

		expect(
			serializeLogValue({ err: error, authorization: "Bearer secret" }),
		).toMatchObject({
			err: {
				name: "Error",
				message: "PDF failed",
				code: "PDF_RENDER_FAILED",
				cause: { name: "Error", message: "socket closed" },
			},
			authorization: "[redacted]",
		});
	});

	it("serializes Error objects from another runtime realm", () => {
		const foreignError = Object.create(null);
		Object.defineProperties(foreignError, {
			name: { value: "TypeError" },
			message: { value: "Cannot resolve Helvetica" },
			stack: { value: "TypeError: Cannot resolve Helvetica\n at renderer" },
			code: { value: "MODULE_NOT_FOUND" },
		});

		expect(serializeLogValue(foreignError)).toEqual({
			name: "TypeError",
			message: "Cannot resolve Helvetica",
			stack: "TypeError: Cannot resolve Helvetica\n at renderer",
			code: "MODULE_NOT_FOUND",
		});
	});
});
