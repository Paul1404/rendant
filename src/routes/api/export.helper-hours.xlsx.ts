import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { secureDownloadHeaders } from "@/lib/download-headers";
import { auth } from "@/server/auth";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import { loadHelperHourExport } from "@/server/services/helper-hours";
import { helperHoursXlsxDocument } from "@/server/services/helper-hours-xlsx";

export const Route = createFileRoute("/api/export/helper-hours/xlsx")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
				}
				// Categories are configurable, so the code is validated by shape
				// here and resolved against the database by the loader.
				const parsed = v.safeParse(
					v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9_]{0,39}$/)),
					new URL(request.url).searchParams.get("abteilung"),
				);
				if (!parsed.success) {
					return Response.json(
						{ error: "Ungültige Abteilung" },
						{ status: 400 },
					);
				}
				let data: Awaited<ReturnType<typeof loadHelperHourExport>>;
				try {
					data = await loadHelperHourExport(parsed.output);
				} catch {
					return Response.json(
						{ error: "Abteilung nicht gefunden" },
						{ status: 404 },
					);
				}
				const xlsx = await helperHoursXlsxDocument(data);
				const body = new ArrayBuffer(xlsx.byteLength);
				new Uint8Array(body).set(xlsx);
				await recordAuditEvent({
					category: "exports",
					action: "exports.helferstunden_xlsx",
					actor: auditActor(session.user),
					request: auditRequest(request),
					metadata: {
						abteilung: parsed.output,
						helferstunden: data.hours.length,
						ausgaben: data.expenses.length,
					},
				});
				return new Response(body, {
					headers: secureDownloadHeaders(
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						`attachment; filename="helferstunden-${parsed.output}.xlsx"`,
					),
				});
			},
		},
	},
});
