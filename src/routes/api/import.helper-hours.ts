import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import {
	catalogKey,
	createHelperHourAlias,
	createHelperHourEvent,
	createHelperHourPerson,
	loadHelperHourResolver,
	personKey,
} from "@/server/services/helper-hour-catalog";
import { listHelperHourCategories } from "@/server/services/helper-hour-categories";
import {
	parseNameDecisions,
	resolveImportNames,
} from "@/server/services/helper-hour-resolve";
import {
	helperHourSheetStatus,
	importHelperHours,
	listHelperHourNoteRules,
} from "@/server/services/helper-hours";
import {
	applyHelperHoursImportCorrections,
	HELPER_HOURS_IMPORT_MAX_BYTES,
	parseHelperHoursImportCorrections,
	parseHelperHoursWorkbook,
} from "@/server/services/helper-hours-import";
import { withRequestTenant } from "@/server/tenant-context";

export const Route = createFileRoute("/api/import/helper-hours")({
	server: {
		handlers: {
			POST: async ({ request }) =>
				withRequestTenant(request, async ({ session }) => {
					if (!session)
						return Response.json(
							{ error: "Nicht angemeldet" },
							{ status: 401 },
						);
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
						contentLength > HELPER_HOURS_IMPORT_MAX_BYTES + 100_000
					)
						return Response.json(
							{ error: "Die Datei darf höchstens 5 MB groß sein." },
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
					if (file.size === 0 || file.size > HELPER_HOURS_IMPORT_MAX_BYTES)
						return Response.json(
							{ error: "Die Datei darf höchstens 5 MB groß sein." },
							{ status: 400 },
						);
					if (mode !== "preview" && mode !== "apply")
						return Response.json(
							{ error: "Ungültiger Modus." },
							{ status: 400 },
						);
					const bytes = new Uint8Array(await file.arrayBuffer());
					const digest = createHash("sha256").update(bytes).digest("hex");
					const [categories, noteRules, resolver] = await Promise.all([
						listHelperHourCategories(),
						listHelperHourNoteRules(),
						loadHelperHourResolver(),
					]);
					const parsed = await parseHelperHoursWorkbook(
						bytes,
						file.name,
						categories,
						digest,
						[],
						noteRules,
					);
					const unresolved = resolveImportNames(parsed.rows, resolver);
					// Every row of the file is imported: the monthly sheets are the
					// register of record, so what Rendant already holds for those sheets
					// is replaced rather than added to.
					const pending = parsed.rows;
					const replaced = await helperHourSheetStatus(parsed.sheets);
					const hours = pending.reduce(
						(sum, row) => sum + row.gemeldete_summe_minuten,
						0,
					);
					if (mode === "preview") {
						await recordAuditEvent({
							category: "helferstunden",
							action: "helferstunden.import_previewed",
							actor: auditActor(session.user),
							request: auditRequest(request),
							metadata: {
								datei: file.name.slice(0, 200),
								zeilen: parsed.rows.length,
								fehler: parsed.errors.length,
								warnungen: parsed.warnings,
								automatisch_korrigiert: parsed.repairs,
								moegliche_doppelschreibungen: parsed.similarNames.length,
								vermerke_ohne_punkt: parsed.noteCandidates.length,
							},
						});
						return Response.json({
							valid: parsed.errors.length === 0 && parsed.rows.length > 0,
							digest,
							rows: parsed.rows.length,
							toImport: pending.length,
							replaces: replaced.existing,
							sheets: parsed.sheets,
							unknownColumns: parsed.unknownColumns,
							similarNames: parsed.similarNames,
							noteCandidates: parsed.noteCandidates.map((entry) => ({
								...entry,
								categories: entry.categories.map((category) => ({
									label:
										categories.find((item) => item.code === category.code)
											?.label ?? category.code,
									minutes: category.minutes,
								})),
							})),
							repairs: parsed.repairs,
							unresolvedPersons: unresolved.persons,
							unresolvedEvents: unresolved.events,
							repairSample: pending
								.filter((row) => row.repairs.length > 0)
								.slice(0, 40)
								.map((row) => ({
									sheet: row.sheet,
									row: row.rowNumber,
									before:
										`${row.originalValues.nachname}, ${row.originalValues.vorname}`.trim(),
									after: `${row.nachname}, ${row.vorname}`.trim(),
									beforeDate: row.originalValues.datum,
									afterDate: row.datum,
									repairs: row.repairs,
								})),
							hours,
							warnings: pending.reduce(
								(sum, row) => sum + row.warnings.length,
								0,
							),
							errors: parsed.errors.slice(0, 100),
							warningSample: pending
								.filter((row) => row.warnings.length > 0)
								.slice(0, 12)
								.map((row) => ({
									sheet: row.sheet,
									row: row.rowNumber,
									warnings: row.warnings,
								})),
							reviewRows: pending
								.filter((row) => row.issues.length > 0)
								.map((row) => ({
									sheet: row.sheet,
									rowNumber: row.rowNumber,
									date: row.datum,
									event: row.veranstaltung,
									vorname: row.vorname,
									nachname: row.nachname,
									allocations: row.allocations,
									gemeldete_summe_minuten: row.gemeldete_summe_minuten,
									issues: row.issues,
									warnings: row.warnings,
								})),
							categories: categories.map((category) => ({
								code: category.code,
								label: category.label,
								art: category.art,
								aktiv: category.aktiv,
							})),
							sample: parsed.rows.slice(0, 8).map((row) => ({
								sheet: row.sheet,
								row: row.rowNumber,
								date: row.datum,
								event: row.veranstaltung,
								name: `${row.vorname} ${row.nachname}`.trim(),
								minutes: row.gemeldete_summe_minuten,
								warnings: row.warnings,
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
					const decisions = parseNameDecisions(formData.get("names"));
					if (!decisions)
						return Response.json(
							{ error: "Die Namenszuordnungen sind ungültig." },
							{ status: 400 },
						);
					const actor = auditActor(session.user);
					const auditCtx = { request: auditRequest(request) };
					// Jede offene Schreibweise braucht eine Entscheidung, bevor irgendetwas
					// geschrieben wird: entweder ein vorhandener Katalogeintrag oder ein
					// bewusst neu angelegter.
					const byKey = new Map(
						decisions.map((entry) => [
							`${entry.art}:${catalogKey(entry.schreibweise)}`,
							entry,
						]),
					);
					for (const offen of [...unresolved.persons, ...unresolved.events]) {
						if (!byKey.has(`${offen.art}:${catalogKey(offen.schreibweise)}`))
							return Response.json(
								{
									error: `"${offen.schreibweise}" ist noch nicht zugeordnet.`,
								},
								{ status: 409 },
							);
					}
					for (const entscheidung of decisions) {
						if (entscheidung.art === "person") {
							const [nachname, vorname] = entscheidung.schreibweise
								.split(",")
								.map((part) => part.trim());
							const ziel = entscheidung.neu
								? await createHelperHourPerson(
										{ nachname, vorname },
										actor,
										auditCtx,
									)
								: { id: entscheidung.ziel_id as string };
							if (!entscheidung.neu)
								await createHelperHourAlias(
									{
										art: "person",
										schreibweise: entscheidung.schreibweise,
										ziel_id: ziel.id,
									},
									actor,
									auditCtx,
								);
						} else {
							const ziel = entscheidung.neu
								? await createHelperHourEvent(
										{ name: entscheidung.schreibweise },
										actor,
										auditCtx,
									)
								: { id: entscheidung.ziel_id as string };
							if (!entscheidung.neu)
								await createHelperHourAlias(
									{
										art: "veranstaltung",
										schreibweise: entscheidung.schreibweise,
										ziel_id: ziel.id,
									},
									actor,
									auditCtx,
								);
						}
					}
					// Nach den Entscheidungen neu laden, damit jede Zeile aufloest.
					const fertig = await loadHelperHourResolver();
					const corrections = parseHelperHoursImportCorrections(
						formData.get("corrections"),
					);
					if (!corrections)
						return Response.json(
							{ error: "Die Korrekturen sind ungültig. Bitte erneut prüfen." },
							{ status: 400 },
						);
					const reviewed = applyHelperHoursImportCorrections(
						pending,
						corrections,
						new Set(categories.map((category) => category.code)),
					);
					if (reviewed.errors.length > 0)
						return Response.json(
							{ error: reviewed.errors[0] },
							{ status: 400 },
						);
					if (reviewed.openIssues > 0)
						return Response.json(
							{
								error: `${reviewed.openIssues} Hinweise sind noch nicht geklärt.`,
							},
							{ status: 409 },
						);
					const katalog = {
						personen: new Map(
							fertig.persons.map((person) => [
								personKey(person.nachname, person.vorname),
								person,
							]),
						),
						veranstaltungen: new Map(
							fertig.events.map((event) => [catalogKey(event.name), event]),
						),
					};
					for (const row of reviewed.rows) {
						if (row.nachname && row.vorname) {
							const treffer = fertig.person(row.nachname, row.vorname);
							if (treffer)
								katalog.personen.set(
									personKey(row.nachname, row.vorname),
									treffer,
								);
						}
						const anlass = fertig.event(row.veranstaltung);
						if (anlass)
							katalog.veranstaltungen.set(
								catalogKey(row.veranstaltung),
								anlass,
							);
					}
					const result = await importHelperHours(
						reviewed.rows,
						parsed.sheets,
						katalog,
						actor,
						{
							request: auditRequest(request),
							subject: {
								type: "helferstunden_import",
								id: digest,
								label: file.name.slice(0, 200),
							},
						},
						{
							corrected: reviewed.corrected,
							accepted: reviewed.accepted,
							repaired: parsed.repairs,
						},
					);
					return Response.json({ ok: true, ...result });
				}),
		},
	},
});
