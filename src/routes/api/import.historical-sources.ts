import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/server/auth";
import { auditActor, auditRequest } from "@/server/services/audit";
import {
	archiveHistoricalSource,
	historicalSourceContentType,
	knownHistoricalRevenueHashes,
	recordHistoricalSourceArchiveAudit,
} from "@/server/services/historical-source-archive";

const MAX_FILES = 1_500;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

function supported(file: File): boolean {
	const lower = file.name.toLowerCase();
	return lower.endsWith(".xlsx") || lower.endsWith(".ods");
}

export const Route = createFileRoute("/api/import/historical-sources")({
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
				const uploaded = formData.getAll("files");
				if (
					uploaded.length === 0 ||
					uploaded.length > MAX_FILES ||
					!uploaded.every((entry) => entry instanceof File)
				) {
					return Response.json(
						{ error: `Bitte höchstens ${MAX_FILES} Dateien auswählen.` },
						{ status: 400 },
					);
				}
				const totalBytes = uploaded.reduce(
					(sum, entry) => sum + (entry instanceof File ? entry.size : 0),
					0,
				);
				if (totalBytes > MAX_TOTAL_BYTES) {
					return Response.json(
						{ error: "Die Dateien dürfen zusammen höchstens 40 MB groß sein." },
						{ status: 413 },
					);
				}
				const candidates = await Promise.all(
					(uploaded as File[]).filter(supported).map(async (file) => {
						const bytes = new Uint8Array(await file.arrayBuffer());
						return {
							file,
							bytes,
							sha256: createHash("sha256").update(bytes).digest("hex"),
						};
					}),
				);
				const known = await knownHistoricalRevenueHashes(
					candidates.map((candidate) => candidate.sha256),
				);
				const matches = candidates.filter((candidate) =>
					known.has(candidate.sha256),
				);
				const actor = auditActor(session.user);
				let archived = 0;
				let existing = 0;
				let nextIndex = 0;
				async function worker() {
					while (nextIndex < matches.length) {
						const index = nextIndex;
						nextIndex += 1;
						const match = matches[index];
						const result = await archiveHistoricalSource(
							{
								bytes: match.bytes,
								expectedSha256: match.sha256,
								originalFilename: match.file.name,
								contentType: historicalSourceContentType(match.file.name),
							},
							actor,
						);
						if (result.created) archived += 1;
						else existing += 1;
					}
				}
				await Promise.all(
					Array.from({ length: Math.min(6, matches.length) }, worker),
				);
				await recordHistoricalSourceArchiveAudit(
					actor,
					{ request: auditRequest(request) },
					{
						dateien: uploaded.length,
						tabellen: candidates.length,
						zugeordnet: matches.length,
						neu: archived,
						bereits_archiviert: existing,
						quelle: "Bestandszuordnung",
					},
				);
				return Response.json({
					files: uploaded.length,
					spreadsheets: candidates.length,
					matched: matches.length,
					archived,
					existing,
					unmatched: candidates.length - matches.length,
				});
			},
		},
	},
});
