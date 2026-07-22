import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/server/auth";
import { listKatalog } from "@/server/services/anlass-catalog";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import {
	HistoricalRevenueCatalogError,
	HistoricalRevenueConflictError,
} from "@/server/services/historical-revenue";
import {
	findPotentialHistoricalRevenueDuplicates,
	importHistoricalRevenues,
	inspectPreviouslyImportedRows,
} from "@/server/services/historical-revenue-import";
import {
	parseRevenueImportWorkbook,
	REVENUE_IMPORT_MAX_BYTES,
} from "@/server/services/revenue-import-xlsx";

function fileDigest(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export const Route = createFileRoute("/api/import/revenue")({
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

				const contentLength = Number(
					request.headers.get("content-length") ?? 0,
				);
				if (
					Number.isFinite(contentLength) &&
					contentLength > REVENUE_IMPORT_MAX_BYTES + 100_000
				) {
					return Response.json(
						{ error: "Die Datei darf höchstens 5 MB groß sein." },
						{ status: 413 },
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
				const file = formData.get("file");
				const mode = formData.get("mode");
				if (
					!(file instanceof File) ||
					!file.name.toLowerCase().endsWith(".xlsx")
				) {
					return Response.json(
						{ error: "Bitte eine XLSX-Datei auswählen." },
						{ status: 400 },
					);
				}
				if (file.size === 0 || file.size > REVENUE_IMPORT_MAX_BYTES) {
					return Response.json(
						{ error: "Die Datei darf höchstens 5 MB groß sein." },
						{ status: 400 },
					);
				}
				if (mode !== "preview" && mode !== "apply") {
					return Response.json({ error: "Ungültiger Modus." }, { status: 400 });
				}

				const bytes = new Uint8Array(await file.arrayBuffer());
				const digest = fileDigest(bytes);
				const parsed = await parseRevenueImportWorkbook(
					bytes,
					await listKatalog(),
				);
				const [previousImport, possibleDuplicates] = await Promise.all([
					inspectPreviouslyImportedRows(parsed.rows),
					findPotentialHistoricalRevenueDuplicates(parsed.rows),
				]);
				const errors = [
					...parsed.errors,
					...Array.from(previousImport.conflicts).map((row) => ({
						row,
						message:
							"Diese Vorlagenzeile wurde bereits mit anderen Daten importiert. Bestehenden Eintrag stornieren und eine neue Vorlage verwenden.",
					})),
				];
				const alreadyImported = previousImport.alreadyImported.size;
				const rowsToImport = parsed.rows.filter(
					(row) => !previousImport.alreadyImported.has(row.rowNumber),
				);
				const totals = rowsToImport.reduce(
					(sum, row) => ({
						revenueCent: sum.revenueCent + row.umsatz_cent,
						expensesCent: sum.expensesCent + row.ausgaben_cent,
					}),
					{ revenueCent: 0, expensesCent: 0 },
				);

				if (mode === "preview") {
					await recordAuditEvent({
						category: "umsaetze",
						action: "umsaetze.import_previewed",
						actor: auditActor(session.user),
						request: auditRequest(request),
						metadata: {
							datei: file.name.slice(0, 200),
							zeilen: parsed.rows.length,
							fehler: errors.length,
							bereits_importiert: alreadyImported,
							mögliche_dubletten: possibleDuplicates.size,
						},
					});
					return Response.json({
						valid: errors.length === 0,
						digest,
						rows: parsed.rows.length,
						alreadyImported,
						possibleDuplicates: Array.from(possibleDuplicates).sort(
							(a, b) => a - b,
						),
						toImport: rowsToImport.length,
						errors: errors.slice(0, 100),
						totals,
						sample: parsed.rows.slice(0, 10).map((row) => ({
							row: row.rowNumber,
							date: row.anlass_datum,
							group: row.umsatzgruppe,
							event: row.veranstaltungsbezeichnung,
							revenueCent: row.umsatz_cent,
							expensesCent: row.ausgaben_cent,
						})),
					});
				}

				if (formData.get("confirm_digest") !== digest) {
					return Response.json(
						{
							error:
								"Die Datei wurde seit der Prüfung geändert. Bitte erneut prüfen.",
						},
						{ status: 409 },
					);
				}
				if (errors.length > 0 || parsed.rows.length === 0) {
					return Response.json(
						{ error: "Die Datei enthält Fehler. Bitte erneut prüfen." },
						{ status: 400 },
					);
				}

				const actor = auditActor(session.user);
				let result: Awaited<ReturnType<typeof importHistoricalRevenues>>;
				try {
					result = await importHistoricalRevenues(parsed.rows, actor);
				} catch (error) {
					if (
						error instanceof HistoricalRevenueConflictError ||
						error instanceof HistoricalRevenueCatalogError
					) {
						return Response.json(
							{
								error:
									"Die Daten haben sich seit der Prüfung geändert. Bitte die Datei erneut prüfen.",
							},
							{ status: 409 },
						);
					}
					throw error;
				}
				await recordAuditEvent({
					category: "umsaetze",
					action: "umsaetze.imported",
					actor,
					request: auditRequest(request),
					subject: {
						type: "historischer_umsatz_import",
						id: parsed.importId,
						label: file.name.slice(0, 200),
					},
					metadata: {
						zeilen: parsed.rows.length,
						angelegt: result.created,
						übersprungen: result.skipped,
						umsatz_cent: totals.revenueCent,
						ausgaben_cent: totals.expensesCent,
					},
				});
				return Response.json({ ok: true, ...result });
			},
		},
	},
});
