import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { secureDownloadHeaders } from "@/lib/download-headers";
import { ExportQuerySchema } from "@/lib/schemas";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import { exportUstCsv } from "@/server/services/export";
import { withRequestTenant } from "@/server/tenant-context";

export const Route = createFileRoute("/api/export/ust")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				withRequestTenant(request, async ({ session }) => {
					if (!session) {
						return Response.json(
							{ error: "Nicht angemeldet" },
							{ status: 401 },
						);
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
					const csv = await exportUstCsv(parsed.output.von, parsed.output.bis);
					await recordAuditEvent({
						category: "exports",
						action: "exports.ust_csv",
						actor: auditActor(session.user),
						request: auditRequest(request),
						metadata: parsed.output,
					});
					const filename = `rendant-ust-${parsed.output.von}-${parsed.output.bis}.csv`;
					return new Response(csv, {
						status: 200,
						headers: secureDownloadHeaders(
							"text/csv; charset=utf-8",
							`attachment; filename="${filename}"`,
						),
					});
				}),
		},
	},
});
