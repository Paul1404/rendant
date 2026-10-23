import { describe, expect, it, vi } from "vitest";
import {
	checkPdfReadiness,
	isValidPdfBuffer,
} from "@/server/services/pdf-health";

describe("PDF readiness", () => {
	it("fails readiness if the renderer never completes and clears its timer", async () => {
		vi.useFakeTimers();
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const pending = checkPdfReadiness(() => new Promise(() => {}));
			await vi.advanceTimersByTimeAsync(15_000);
			expect(await pending).toMatchObject({
				ok: false,
				status: "down",
				latencyMs: 15_000,
			});
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
			errorLog.mockRestore();
		}
	});

	it("accepts a complete PDF and data hash", async () => {
		const buffer = Buffer.concat([
			Buffer.from("%PDF-1.7\n"),
			Buffer.alloc(5_000, "x"),
			Buffer.from("\n%%EOF\n"),
		]);
		const snapshot = await checkPdfReadiness(async () => ({
			buffer,
			hash: "a".repeat(64),
		}));

		expect(snapshot).toMatchObject({
			ok: true,
			status: "up",
			bytes: buffer.length,
		});
	});

	it("rejects truncated and undersized PDF buffers", () => {
		expect(isValidPdfBuffer(Buffer.from("%PDF-1.7\n%%EOF"))).toBe(false);
		expect(isValidPdfBuffer(Buffer.alloc(6_000, "x"))).toBe(false);
	});

	it("returns a down snapshot when rendering throws", async () => {
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
		const snapshot = await checkPdfReadiness(async () => {
			throw new Error("Helvetica module missing");
		});

		expect(snapshot).toMatchObject({
			ok: false,
			status: "down",
			message: "PDF renderer failed",
		});
		expect(errorLog).toHaveBeenCalledWith(
			expect.stringContaining("Helvetica module missing"),
		);
		errorLog.mockRestore();
	});
});
