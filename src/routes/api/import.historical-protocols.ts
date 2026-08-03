import { createFileRoute } from "@tanstack/react-router";
import type { HistoricalProtocolClassificationOverrides } from "@/lib/historical-protocol-import";
import { isUmsatzbereich } from "@/lib/umsatzbereich";
import { auth } from "@/server/auth";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import {
	buildHistoricalProtocolPreview,
	HISTORICAL_PROTOCOL_MAX_FILES,
	HISTORICAL_PROTOCOL_MAX_TOTAL_BYTES,
	type HistoricalProtocolUploadFile,
	historicalProtocolManifestDigest,
	parseHistoricalProtocolFile,
} from "@/server/services/historical-protocol-folder";
import {
	enrichHistoricalProtocolPreview,
	importHistoricalProtocolFolder,
} from "@/server/services/historical-revenue-import";

function safeRelativePath(value: unknown): value is string {
	if (typeof value !== "string" || value.length < 1 || value.length > 1_000) {
		return false;
	}
	const normalized = value.replaceAll("\\", "/");
	return (
		!normalized.startsWith("/") &&
		!normalized.includes("\0") &&
		normalized.split("/").every((part) => part !== "..")
	);
}

type FileMetadata = { path: string; modifiedAt: string };

function safeFileMetadata(value: unknown): value is FileMetadata {
	return (
		Boolean(value) &&
		typeof value === "object" &&
		safeRelativePath((value as FileMetadata).path) &&
		/^20\d{2}-\d{2}-\d{2}$/.test((value as FileMetadata).modifiedAt)
	);
}

function parseOverrides(value: FormDataEntryValue | null) {
	if (typeof value !== "string" || !value) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error("Die Umsatzbereich-Zuordnung ist ungültig.");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Die Umsatzbereich-Zuordnung ist ungültig.");
	}
	const entries = Object.entries(parsed);
	if (entries.length > 200)
		throw new Error("Zu viele Umsatzbereich-Zuordnungen.");
	const overrides: HistoricalProtocolClassificationOverrides = {};
	for (const [key, area] of entries) {
		if (key.length > 120 || !isUmsatzbereich(area)) {
			throw new Error("Die Umsatzbereich-Zuordnung ist ungültig.");
		}
		overrides[key] = area;
	}
	return overrides;
}

function parseReviewIndices(value: FormDataEntryValue | null): Set<number> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(typeof value === "string" ? value : "[]");
	} catch {
		throw new Error("Die Auswahl der Prüffälle ist ungültig.");
	}
	if (
		!Array.isArray(parsed) ||
		parsed.length > HISTORICAL_PROTOCOL_MAX_FILES ||
		!parsed.every((entry) => Number.isInteger(entry) && entry >= 0)
	) {
		throw new Error("Die Auswahl der Prüffälle ist ungültig.");
	}
	return new Set(parsed as number[]);
}

async function parseUploadedFiles(files: HistoricalProtocolUploadFile[]) {
	const rows = new Array(files.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < files.length) {
			const index = nextIndex;
			nextIndex += 1;
			rows[index] = await parseHistoricalProtocolFile(files[index]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
	return rows;
}

export const Route = createFileRoute("/api/import/historical-protocols")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
				}
				if ((session.user as { role?: string }).role !== "admin") {
					return Response.json(
						{ error: "Adminrechte erforderlich" },
						{ status: 403 },
					);
				}

				let formData: FormData;
				try {
					formData = await request.formData();
				} catch {
					return Response.json(
						{ error: "Die Upload-Daten sind ungültig." },
						{ status: 400 },
					);
				}
				const mode = formData.get("mode");
				if (mode !== "preview" && mode !== "apply") {
					return Response.json({ error: "Ungültiger Modus." }, { status: 400 });
				}
				const uploaded = formData.getAll("files");
				let metadata: unknown;
				try {
					metadata = JSON.parse(String(formData.get("file_metadata") ?? "[]"));
				} catch {
					metadata = null;
				}
				if (
					!Array.isArray(metadata) ||
					uploaded.length === 0 ||
					uploaded.length !== metadata.length ||
					uploaded.length > HISTORICAL_PROTOCOL_MAX_FILES ||
					!uploaded.every((entry) => entry instanceof File) ||
					!metadata.every(safeFileMetadata)
				) {
					return Response.json(
						{
							error: `Bitte einen gültigen Ordner mit höchstens ${HISTORICAL_PROTOCOL_MAX_FILES} Dateien auswählen.`,
						},
						{ status: 400 },
					);
				}
				const totalBytes = uploaded.reduce(
					(sum, entry) => sum + (entry instanceof File ? entry.size : 0),
					0,
				);
				if (totalBytes > HISTORICAL_PROTOCOL_MAX_TOTAL_BYTES) {
					return Response.json(
						{ error: "Der Ordner darf höchstens 40 MB groß sein." },
						{ status: 413 },
					);
				}

				const files: HistoricalProtocolUploadFile[] = await Promise.all(
					uploaded.map(async (entry, index) => ({
						index,
						path: metadata[index].path.replaceAll("\\", "/"),
						modifiedAt: metadata[index].modifiedAt,
						bytes: new Uint8Array(await (entry as File).arrayBuffer()),
					})),
				);
				const digest = historicalProtocolManifestDigest(files);
				const rows = await parseUploadedFiles(files);
				const preview = await enrichHistoricalProtocolPreview(
					buildHistoricalProtocolPreview(files, rows, digest),
				);

				if (mode === "preview") {
					await recordAuditEvent({
						category: "umsaetze",
						action: "umsaetze.protocol_folder_previewed",
						actor: auditActor(session.user),
						request: auditRequest(request),
						metadata: {
							dateien: preview.files,
							erkannt: preview.spreadsheetFiles,
							importierbar: preview.toImport,
							prüffälle: preview.reviewRequired,
							bereits_vorhanden:
								preview.statusCounts.already_imported +
								preview.statusCounts.existing_protocol,
						},
					});
					return Response.json(preview);
				}

				if (formData.get("confirm_digest") !== digest) {
					return Response.json(
						{
							error:
								"Der Ordner wurde seit der Prüfung geändert. Bitte erneut prüfen.",
						},
						{ status: 409 },
					);
				}
				let overrides: HistoricalProtocolClassificationOverrides;
				try {
					overrides = parseOverrides(formData.get("classification_overrides"));
				} catch (error) {
					return Response.json(
						{
							error:
								error instanceof Error ? error.message : "Zuordnung ungültig",
						},
						{ status: 400 },
					);
				}
				let includedReviewIndices: Set<number>;
				try {
					includedReviewIndices = parseReviewIndices(
						formData.get("included_review_indices"),
					);
				} catch (error) {
					return Response.json(
						{
							error:
								error instanceof Error ? error.message : "Auswahl ungültig",
						},
						{ status: 400 },
					);
				}
				const result = await importHistoricalProtocolFolder(
					preview.rows,
					overrides,
					includedReviewIndices,
					auditActor(session.user),
					{
						request: auditRequest(request),
						subject: {
							type: "historischer_protokollordner_import",
							id: digest,
							label: preview.folderName.slice(0, 200),
						},
						metadata: {
							umsatz_cent: preview.totals.revenueCent,
							ausgaben_cent: preview.totals.expensesCent,
						},
					},
				);
				return Response.json({ ok: true, ...result });
			},
		},
	},
});
