import { createHash } from "node:crypto";
import { basename } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
	historicalRevenues,
	historicalSourceArchives,
} from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEvent,
} from "@/server/services/audit";
import { downloadObject, uploadObject } from "@/server/services/s3";

export const HISTORICAL_SOURCE_PREFIX = "historical-sources";

export type HistoricalSourceArchiveInput = {
	bytes: Uint8Array;
	expectedSha256: string;
	originalFilename: string;
	contentType: string;
};

export class HistoricalSourceHashMismatchError extends Error {
	constructor() {
		super(
			"Die Datei stimmt nicht mit der gespeicherten SHA256-Prüfsumme überein",
		);
		this.name = "HistoricalSourceHashMismatchError";
	}
}

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function safeFilename(value: string): string {
	const name = basename(value.replaceAll("\\", "/"))
		.replaceAll(/[^\p{L}\p{N}._ -]+/gu, "_")
		.trim();
	return (name || "originaldatei").slice(0, 255);
}

function extension(filename: string): string {
	const match = /\.([a-z0-9]{1,10})$/i.exec(filename);
	return match ? `.${match[1].toLowerCase()}` : "";
}

export function historicalSourceObjectKey(
	sha: string,
	filename: string,
): string {
	return `${HISTORICAL_SOURCE_PREFIX}/${sha}/original${extension(filename)}`;
}

export function historicalSourceContentType(filename: string): string {
	const lower = filename.toLowerCase();
	if (lower.endsWith(".xlsx")) {
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	}
	if (lower.endsWith(".ods")) {
		return "application/vnd.oasis.opendocument.spreadsheet";
	}
	return "application/octet-stream";
}

export async function archiveHistoricalSource(
	input: HistoricalSourceArchiveInput,
	actor: AuthUser,
): Promise<{ created: boolean; sha256: string }> {
	const actualSha256 = sha256(input.bytes);
	if (actualSha256 !== input.expectedSha256) {
		throw new HistoricalSourceHashMismatchError();
	}
	const [existing] = await db
		.select({ sha256: historicalSourceArchives.sha256 })
		.from(historicalSourceArchives)
		.where(eq(historicalSourceArchives.sha256, actualSha256))
		.limit(1);
	if (existing) return { created: false, sha256: actualSha256 };

	const filename = safeFilename(input.originalFilename);
	const objectKey = historicalSourceObjectKey(actualSha256, filename);
	await uploadObject(objectKey, input.bytes, input.contentType);
	const [created] = await db
		.insert(historicalSourceArchives)
		.values({
			sha256: actualSha256,
			object_key: objectKey,
			original_filename: filename,
			content_type: input.contentType.slice(0, 200),
			size_bytes: input.bytes.byteLength,
			archived_by_user_id: actor.id,
			archived_by_name: actor.name,
		})
		.onConflictDoNothing({ target: historicalSourceArchives.sha256 })
		.returning({ sha256: historicalSourceArchives.sha256 });
	return { created: Boolean(created), sha256: actualSha256 };
}

export async function recordHistoricalSourceArchiveAudit(
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">,
	metadata: Record<string, unknown>,
): Promise<void> {
	await recordAuditEvent({
		...audit,
		category: "umsaetze",
		action: "umsaetze.historical_sources_archived",
		actor,
		subject: { type: "historische_quellen" },
		metadata: { ...audit.metadata, ...metadata },
	});
}

export async function knownHistoricalRevenueHashes(
	hashes: string[],
): Promise<Set<string>> {
	if (hashes.length === 0) return new Set();
	const rows = await db
		.select({ sha256: historicalRevenues.quelle_sha256 })
		.from(historicalRevenues)
		.where(inArray(historicalRevenues.quelle_sha256, hashes));
	return new Set(rows.flatMap((row) => (row.sha256 ? [row.sha256] : [])));
}

export async function getHistoricalSourceArchive(sha: string) {
	const [archive] = await db
		.select()
		.from(historicalSourceArchives)
		.where(eq(historicalSourceArchives.sha256, sha))
		.limit(1);
	return archive ?? null;
}

export async function downloadHistoricalSource(sha: string): Promise<{
	archive: NonNullable<Awaited<ReturnType<typeof getHistoricalSourceArchive>>>;
	buffer: Buffer;
}> {
	const archive = await getHistoricalSourceArchive(sha);
	if (!archive) throw new Error("Originaldatei ist nicht archiviert");
	const buffer = await downloadObject(archive.object_key);
	if (sha256(buffer) !== sha) {
		throw new HistoricalSourceHashMismatchError();
	}
	return { archive, buffer };
}
