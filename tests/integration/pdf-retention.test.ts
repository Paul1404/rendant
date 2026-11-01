import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), deleted: [] as string[], serial: 0, uploadHook: undefined as undefined | ((key: string) => Promise<void>) }));
vi.mock("@/server/services/pdf", () => ({ renderProtokollPdf: async () => { const serial = ++storage.serial; return { buffer: Buffer.from(`synthetic-pdf-${serial}`), hash: serial.toString(16).padStart(64, "0") }; } }));
vi.mock("@/server/services/s3", () => ({ uploadPdf: async (key: string, body: Buffer) => { storage.objects.set(key, body); await storage.uploadHook?.(key); }, deletePdf: async (key: string) => { storage.deleted.push(key); storage.objects.delete(key); } }));
vi.mock("@/server/services/settings", () => ({ getVereinStammdaten: async () => ({ name: "Synthetischer PDF-Prüfverein", strasse: "", plz: "", ort: "", vorstand: "", registergericht: "", registernummer: "" }) }));

import { db, globalDb, pool } from "@/server/db";
import { protokolle } from "@/server/db/schema";
import { tenants } from "@/server/db/tenant-schema";
import { regenerateProtokollPdf, stornoProtokoll } from "@/server/services/protokoll";
import { withTenant } from "@/server/tenant-context";

const club = { id: randomUUID(), slug: `pdf-${randomUUID()}`, name: "Synthetischer PDF-Prüfverein" };
const actor = { id: "synthetic-pdf-admin", email: "synthetic@example.invalid", name: "PDF-Test", role: "admin" };
function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}
async function fixture(cancelled = false) {
	return withTenant(club, async () => {
		const id = randomUUID();
		const key = `tenants/${club.id}/protokolle/${id}-original.pdf`;
		const stornoKey = cancelled ? `tenants/${club.id}/protokolle/${id}-storno.pdf` : null;
		storage.objects.set(key, Buffer.from("published-original"));
		if (stornoKey) storage.objects.set(stornoKey, Buffer.from("published-cancellation"));
		const [row] = await db.insert(protokolle).values({ id, belegnummer: id, anlass_datum: "2026-11-01", anlass: "Synthetisch", gezaehlt_von: "Test", geprueft_von: "Test", wechselgeld_cent: 0, gezaehlt_cent: 100, ausgaben_cent: 0, bestand_cent: 100, tageseinnahmen_cent: 100, pdf_s3_key: key, pdf_sha256: "a".repeat(64), storniert_am: cancelled ? new Date("2026-11-01T12:00:00Z") : null, storno_grund: cancelled ? "Synthetische Stornierung" : null, storno_pdf_s3_key: stornoKey, storno_pdf_sha256: cancelled ? "b".repeat(64) : null }).returning();
		return row;
	});
}
async function read(id: string) {
	return withTenant(club, async () => (await db.select().from(protokolle).where(eq(protokolle.id, id)))[0]);
}
beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1") throw new Error("PDF retention tests require an isolated database");
	const database = await pool.query<{ name: string }>("select current_database() as name");
	if (database.rows[0]?.name !== "rendant_test") throw new Error("PDF retention tests refuse a database other than rendant_test");
	await globalDb.insert(tenants).values(club);
});
beforeEach(() => { storage.objects.clear(); storage.deleted = []; storage.serial = 0; storage.uploadHook = undefined; });
afterAll(async () => { await pool.end(); });

describe("published PDF retention with real PostgreSQL publication", () => {
	it.each([false, true])("retains every previously published document when regenerating cancelled=%s", async (cancelled) => {
		const before = await fixture(cancelled);
		await withTenant(club, () => regenerateProtokollPdf(before.id));
		const after = await read(before.id);
		expect(after.pdf_s3_key).not.toBe(before.pdf_s3_key);
		expect(storage.objects.get(before.pdf_s3_key!)).toEqual(Buffer.from("published-original"));
		if (cancelled) {
			expect(after.storno_pdf_s3_key).not.toBe(before.storno_pdf_s3_key);
			expect(storage.objects.get(before.storno_pdf_s3_key!)).toEqual(Buffer.from("published-cancellation"));
		}
		expect(storage.deleted).toEqual([]);
	});

	it("cleans only the unpublished pair if the second upload fails", async () => {
		const before = await fixture(true);
		storage.uploadHook = async (key) => { if (key.includes("_STORNO")) throw new Error("synthetic upload failure"); };
		await expect(withTenant(club, () => regenerateProtokollPdf(before.id))).rejects.toThrow("synthetic upload failure");
		expect(await read(before.id)).toEqual(before);
		expect([...storage.objects.keys()].sort()).toEqual([before.pdf_s3_key, before.storno_pdf_s3_key].sort());
		expect(storage.deleted).toHaveLength(2);
	});

	it("publishes one complete pair when concurrent regenerations start from the same keys", async () => {
		const before = await fixture(true);
		const reached = gate();
		const proceed = gate();
		let first = true;
		storage.uploadHook = async () => { if (first) { first = false; reached.release(); await proceed.promise; } };
		const loser = withTenant(club, () => regenerateProtokollPdf(before.id));
		await reached.promise;
		await withTenant(club, () => regenerateProtokollPdf(before.id));
		const winner = await read(before.id);
		proceed.release();
		await expect(loser).rejects.toThrow("zwischenzeitlich geändert");
		expect(await read(before.id)).toEqual(winner);
		expect([...storage.objects.keys()].sort()).toEqual([before.pdf_s3_key, before.storno_pdf_s3_key, winner.pdf_s3_key, winner.storno_pdf_s3_key].sort());
		expect(storage.deleted).toHaveLength(2);
	});

	it("does not let delayed initial cancellation publication overwrite a regenerated cancellation", async () => {
		const before = await fixture();
		const reached = gate();
		const proceed = gate();
		let delayedKey: string | undefined;
		storage.uploadHook = async (key) => { if (!delayedKey) { delayedKey = key; reached.release(); await proceed.promise; } };
		const initial = withTenant(club, () => stornoProtokoll(before.id, { storno_grund: "Synthetische Stornierung" }, actor, {}));
		await reached.promise;
		await withTenant(club, () => regenerateProtokollPdf(before.id));
		const winner = await read(before.id);
		proceed.release();
		await initial;
		expect(await read(before.id)).toEqual(winner);
		expect(winner.storno_pdf_s3_key).not.toBe(delayedKey);
		expect(storage.deleted).toEqual([delayedKey]);
		expect(storage.objects.has(before.pdf_s3_key!)).toBe(true);
		expect(storage.objects.has(winner.pdf_s3_key!)).toBe(true);
		expect(storage.objects.has(winner.storno_pdf_s3_key!)).toBe(true);
	});

	it("rejects regeneration that began before cancellation without replacing either published PDF", async () => {
		const before = await fixture();
		const reached = gate();
		const proceed = gate();
		let delayedKey: string | undefined;
		storage.uploadHook = async (key) => { if (!delayedKey) { delayedKey = key; reached.release(); await proceed.promise; } };
		const regeneration = withTenant(club, () => regenerateProtokollPdf(before.id));
		await reached.promise;
		await withTenant(club, () => stornoProtokoll(before.id, { storno_grund: "Synthetische Stornierung" }, actor, {}));
		const winner = await read(before.id);
		proceed.release();
		await expect(regeneration).rejects.toThrow("zwischenzeitlich geändert");
		expect(await read(before.id)).toEqual(winner);
		expect(storage.deleted).toEqual([delayedKey]);
		expect(storage.objects.has(before.pdf_s3_key!)).toBe(true);
		expect(storage.objects.has(winner.storno_pdf_s3_key!)).toBe(true);
	});
});
