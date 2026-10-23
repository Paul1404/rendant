import { call } from "@orpc/server";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { DatevSettingsSchema } from "@/lib/schemas";
import { router } from "@/server/orpc/router";
import { validateDatevPdf } from "@/server/services/datev";

describe("DATEV trust boundaries", () => {
	const settings = {
		enabled: true,
		recipient: "11111111-2222-3333-4444-555555555555@uploadmail.datev.de",
		sender: "sender@example.invalid",
		expected_updated_at: "2026-10-23T12:00:00.000Z",
	};
	it("accepts a DATEV mailbox and rejects arbitrary recipients and header injection", () => {
		expect(v.safeParse(DatevSettingsSchema, settings).success).toBe(true);
		for (const recipient of [
			"someone@example.com",
			`${settings.recipient}.evil.test`,
			`${settings.recipient},other@example.com`,
			`${settings.recipient}\r\nBcc: other@example.com`,
		]) {
			expect(
				v.safeParse(DatevSettingsSchema, { ...settings, recipient }).success,
			).toBe(false);
		}
	});
	it("rejects missing, truncated, and oversized PDF attachments", () => {
		expect(() =>
			validateDatevPdf(Buffer.from("%PDF-1.7\n%%EOF")),
		).not.toThrow();
		for (const content of [
			Buffer.from("<html>error</html>"),
			Buffer.from("%PDF-truncated"),
			Buffer.concat([
				Buffer.from("%PDF-"),
				Buffer.alloc(20_000_000),
				Buffer.from("%%EOF"),
			]),
		]) {
			expect(() => validateDatevPdf(content)).toThrow("gültiges PDF");
		}
	});
	it("refuses anonymous and non-admin callers before accessing the database or mail server", async () => {
		const context = {
			headers: new Headers(),
			clientIp: "127.0.0.1",
			requestId: "datev-test",
		};
		for (const user of [
			null,
			{ id: "test", name: "Test", email: "test@example.invalid", role: "user" },
		]) {
			for (const procedure of [
				router.protokolle.datevStatus,
				router.protokolle.sendDatev,
				router.protokolle.resolveDatev,
				router.settings.getDatev,
				router.settings.updateDatev,
			]) {
				await expect(
					call(
						procedure as typeof router.protokolle.datevStatus,
						{ id: "11111111-2222-4333-8444-555555555555" },
						{ context: { ...context, user } },
					),
				).rejects.toMatchObject({ code: user ? "FORBIDDEN" : "UNAUTHORIZED" });
			}
		}
	});
});
