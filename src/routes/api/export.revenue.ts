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
import { exportRevenueCsv } from "@/server/services/revenue-export";

export const Route = createFileRoute("/api/export/revenue")({
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
				const result = await exportRevenueCsv(
					parsed.output.von,
					parsed.output.bis,
				);
				await recordAuditEvent({
					category: "exports",
					action: "exports.umsaetze_csv",
					actor: auditActor(session.user),
					request: auditRequest(request),
					metadata: {
						...parsed.output,
						zeilen: result.count,
						umsatz_cent: result.totalCent,
					},
				});
				const filename = `rendant-umsaetze-${parsed.output.von}-${parsed.output.bis}.csv`;
				return new Response(result.csv, {
					status: 200,
					headers: secureDownloadHeaders(
						"text/csv; charset=utf-8",
						`attachment; filename="${filename}"`,
					),
				});
			},
		},
	},
});
