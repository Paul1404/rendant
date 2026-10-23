import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	row: {
		smtp_enabled: true,
		smtp_host: "smtp.example.invalid",
		smtp_port: 587,
		smtp_security: "starttls",
		smtp_user: "notify@example.invalid",
		smtp_from: "notify@example.invalid",
		smtp_password_enc: "",
		notify_recipients: "extra@example.invalid",
	},
	sendMail: vi.fn(),
	close: vi.fn(),
	createTransport: vi.fn(),
}));
vi.mock("@/server/db", () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => [mocks.row] }) }),
		}),
	},
}));
vi.mock("nodemailer", () => ({
	default: { createTransport: mocks.createTransport },
}));
import { prepareDatevEmail } from "@/server/services/email";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.row.smtp_enabled = true;
	mocks.row.smtp_security = "starttls";
	mocks.createTransport.mockReturnValue({
		sendMail: mocks.sendMail,
		close: mocks.close,
	});
	mocks.sendMail.mockResolvedValue({
		accepted: ["target@uploadmail.datev.de"],
	});
});

describe("DATEV SMTP submission", () => {
	const mail = {
		to: "target@uploadmail.datev.de",
		filename: "Beleg_123.pdf",
		content: Buffer.from("%PDF-1.7\n%%EOF"),
		messageId: "<test@example.invalid>",
		subject: "Kassenbeleg 123",
	};
	it("sends one stored PDF only to DATEV using the approved sender in header and envelope", async () => {
		const send = await prepareDatevEmail("datev@example.invalid");
		await send(mail);
		expect(mocks.createTransport).toHaveBeenCalledWith(
			expect.objectContaining({ requireTLS: true, socketTimeout: 60_000 }),
		);
		const submitted = mocks.sendMail.mock.calls[0][0];
		expect(submitted).toMatchObject({
			from: "datev@example.invalid",
			to: mail.to,
			envelope: { from: "datev@example.invalid", to: [mail.to] },
			messageId: mail.messageId,
		});
		expect(submitted.attachments).toEqual([
			{
				filename: mail.filename,
				content: mail.content,
				contentType: "application/pdf",
			},
		]);
		expect(submitted.cc).toBeUndefined();
		expect(submitted.bcc).toBeUndefined();
		expect(mocks.close).toHaveBeenCalledOnce();
	});
	it("does not report success when SMTP rejects the recipient", async () => {
		mocks.sendMail.mockResolvedValue({ accepted: [], rejected: [mail.to] });
		await expect(
			(await prepareDatevEmail("datev@example.invalid"))(mail),
		).rejects.toThrow("nicht angenommen");
		expect(mocks.close).toHaveBeenCalledOnce();
	});
	it("blocks disabled and unencrypted SMTP before a delivery is claimed", async () => {
		mocks.row.smtp_enabled = false;
		await expect(prepareDatevEmail("datev@example.invalid")).rejects.toThrow(
			"aktivieren",
		);
		mocks.row.smtp_enabled = true;
		mocks.row.smtp_security = "none";
		await expect(prepareDatevEmail("datev@example.invalid")).rejects.toThrow(
			"verschlüsselter",
		);
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});
});
