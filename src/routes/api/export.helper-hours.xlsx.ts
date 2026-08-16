import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { secureDownloadHeaders } from "@/lib/download-headers";
import { HELPER_HOUR_CATEGORY_CODES } from "@/lib/helper-hours";
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
				const parsed = v.safeParse(
					v.picklist(HELPER_HOUR_CATEGORY_CODES),
					new URL(request.url).searchParams.get("abteilung"),
				);
				if (!parsed.success) {
					return Response.json(
						{ error: "Ungültige Abteilung" },
						{ status: 400 },
					);
				}
				const data = await loadHelperHourExport(parsed.output);
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
