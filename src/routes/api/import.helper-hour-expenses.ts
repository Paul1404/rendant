import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { minutesFromCent } from "@/lib/helper-hours";
import { auth } from "@/server/auth";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import { listHelperHourCategories } from "@/server/services/helper-hour-categories";
import {
	HELPER_HOUR_EXPENSE_IMPORT_MAX_BYTES,
	parseHelperHourExpenseWorkbook,
} from "@/server/services/helper-hour-expense-import";
import {
	existingHelperHourExpenseSignatures,
	importHelperHourExpenses,
} from "@/server/services/helper-hours";
import { getHelperHourValueCent } from "@/server/services/settings";

export const Route = createFileRoute("/api/import/helper-hour-expenses")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session)
					return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
				if ((session.user as { role?: string }).role !== "admin")
					return Response.json(
						{ error: "Adminrechte erforderlich" },
						{ status: 403 },
					);
				const contentLength = Number(
					request.headers.get("content-length") ?? 0,
				);
				if (
					Number.isFinite(contentLength) &&
					contentLength > HELPER_HOUR_EXPENSE_IMPORT_MAX_BYTES + 100_000
				)
					return Response.json(
						{ error: "Die Datei darf höchstens 2 MB groß sein." },
						{ status: 413 },
					);
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
				)
					return Response.json(
						{ error: "Bitte eine XLSX-Datei auswählen." },
						{ status: 400 },
					);
				if (file.size === 0 || file.size > HELPER_HOUR_EXPENSE_IMPORT_MAX_BYTES)
					return Response.json(
						{ error: "Die Datei darf höchstens 2 MB groß sein." },
						{ status: 400 },
					);
				if (mode !== "preview" && mode !== "apply")
					return Response.json({ error: "Ungültiger Modus." }, { status: 400 });

				const bytes = new Uint8Array(await file.arrayBuffer());
				const digest = createHash("sha256").update(bytes).digest("hex");
				const [categories, valueCent, known] = await Promise.all([
					listHelperHourCategories(),
					getHelperHourValueCent(),
					existingHelperHourExpenseSignatures(),
				]);
				const parsed = await parseHelperHourExpenseWorkbook(
					bytes,
					file.name,
					categories,
					digest,
				);
				// A booked purchase is never deleted or silently replaced, so a row
				// already present stays untouched and only genuinely new rows are
				// added. Rows the list no longer contains have to be cancelled with
				// a reason, which the preview points out.
				const pending = parsed.rows.filter(
					(row) => !known.all.has(row.signature),
				);
				const listSignatures = new Set(parsed.rows.map((row) => row.signature));
				const missing = [...known.active].filter(
					(signature) => !listSignatures.has(signature),
				).length;
				const cent = pending.reduce((sum, row) => sum + row.betrag_cent, 0);

				if (mode === "preview") {
					await recordAuditEvent({
						category: "helferstunden",
						action: "helferstunden.expenses_import_previewed",
						actor: auditActor(session.user),
						request: auditRequest(request),
						metadata: {
							datei: file.name.slice(0, 200),
							zeilen: parsed.rows.length,
							fehler: parsed.errors.length,
						},
					});
					return Response.json({
						valid: parsed.errors.length === 0 && parsed.rows.length > 0,
						digest,
						rows: parsed.rows.length,
						toImport: pending.length,
						alreadyImported: parsed.rows.length - pending.length,
						missing,
						minutes: pending.reduce(
							(sum, row) => sum + minutesFromCent(row.betrag_cent, valueCent),
							0,
						),
						cent,
						errors: parsed.errors.slice(0, 100),
						sample: pending.slice(0, 20).map((row) => ({
							sheet: row.sheet,
							row: row.rowNumber,
							date: row.datum,
							category: row.kategorie_label,
							description: row.bezeichnung,
							minutes: minutesFromCent(row.betrag_cent, valueCent),
						})),
					});
				}

				if (formData.get("confirm_digest") !== digest)
					return Response.json(
						{
							error:
								"Die Datei wurde seit der Prüfung geändert. Bitte erneut prüfen.",
						},
						{ status: 409 },
					);
				if (parsed.errors.length || !parsed.rows.length)
					return Response.json(
						{ error: "Die Datei enthält Fehler. Bitte erneut prüfen." },
						{ status: 400 },
					);
				const result = await importHelperHourExpenses(
					pending,
					auditActor(session.user),
					{
						request: auditRequest(request),
						subject: {
							type: "helferstunden_import",
							id: digest,
							label: file.name.slice(0, 200),
						},
					},
				);
				return Response.json({ ok: true, ...result, missing });
			},
		},
	},
});
