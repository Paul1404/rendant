import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { secureDownloadHeaders } from "@/lib/download-headers";
import { ExportQuerySchema } from "@/lib/schemas";
import { auth } from "@/server/auth";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import { loadRevenueExportRows } from "@/server/services/revenue-export";
import { revenueXlsxDocument } from "@/server/services/revenue-xlsx";

export const Route = createFileRoute("/api/export/revenue/xlsx")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
				}
				const url = new URL(request.url);
				const parsed = v.safeParse(ExportQuerySchema, {
					von: url.searchParams.get("von"),
					bis: url.searchParams.get("bis"),
				});
				if (!parsed.success) {
					return Response.json(
						{ error: "Ungültige Parameter" },
						{ status: 400 },
					);
				}
				const rows = await loadRevenueExportRows(
					parsed.output.von,
					parsed.output.bis,
				);
				const xlsx = await revenueXlsxDocument(rows);
				const body = new ArrayBuffer(xlsx.byteLength);
				new Uint8Array(body).set(xlsx);
				await recordAuditEvent({
					category: "exports",
					action: "exports.umsaetze_xlsx",
					actor: auditActor(session.user),
					request: auditRequest(request),
					metadata: { ...parsed.output, zeilen: rows.length },
				});
				const filename = `rendant-umsaetze-${parsed.output.von}-${parsed.output.bis}.xlsx`;
				return new Response(body, {
					headers: secureDownloadHeaders(
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						`attachment; filename="${filename}"`,
					),
				});
			},
		},
	},
});
