import { createFileRoute } from "@tanstack/react-router";
import { secureDownloadHeaders } from "@/lib/download-headers";
import { auth } from "@/server/auth";
import { listKatalog } from "@/server/services/anlass-catalog";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import { revenueImportTemplate } from "@/server/services/revenue-import-xlsx";

export const Route = createFileRoute("/api/import/revenue/template")({
	server: {
		handlers: {
			GET: async ({ request }) => {
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
				const catalog = await listKatalog();
				const xlsx = await revenueImportTemplate(catalog);
				const body = new ArrayBuffer(xlsx.byteLength);
				new Uint8Array(body).set(xlsx);
				await recordAuditEvent({
					category: "exports",
					action: "exports.umsaetze_import_vorlage",
					actor: auditActor(session.user),
					request: auditRequest(request),
					metadata: {
						umsatzgruppen: catalog.filter((entry) => entry.aktiv).length,
					},
				});
				return new Response(body, {
					headers: secureDownloadHeaders(
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						'attachment; filename="rendant-altumsaetze-importvorlage.xlsx"',
					),
				});
			},
		},
	},
});
