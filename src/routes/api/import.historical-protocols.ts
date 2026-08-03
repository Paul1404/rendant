import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/server/auth";
import { auditActor, auditRequest } from "@/server/services/audit";
import {
	buildHistoricalProtocolPreview,
	HISTORICAL_PROTOCOL_MAX_FILES,
	HISTORICAL_PROTOCOL_MAX_TOTAL_BYTES,
	type HistoricalProtocolUploadFile,
	historicalProtocolManifestDigest,
	parseHistoricalProtocolFile,
} from "@/server/services/historical-protocol-folder";
import { createHistoricalProtocolImportDraft } from "@/server/services/historical-protocol-import-draft";
import { enrichHistoricalProtocolPreview } from "@/server/services/historical-revenue-import";

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
				if (mode !== "preview") {
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

				const draft = await createHistoricalProtocolImportDraft(
					preview,
					auditActor(session.user),
					{ request: auditRequest(request) },
				);
				return Response.json(draft);
			},
		},
	},
});
