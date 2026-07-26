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
import { exportJson } from "@/server/services/export";

export const Route = createFileRoute("/api/export/json")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
				}
				if (session.user.role !== "admin") {
					return Response.json(
						{ error: "Adminrechte erforderlich" },
						{ status: 403 },
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
				const data = await exportJson(parsed.output.von, parsed.output.bis);
				await recordAuditEvent({
					category: "exports",
					action: "exports.business_archive_json",
					actor: auditActor(session.user),
					request: auditRequest(request),
					metadata: parsed.output,
				});
				const filename = `svufo-geschaeftsarchiv-${parsed.output.von}-${parsed.output.bis}.json`;
				return new Response(JSON.stringify(data, null, 2), {
					status: 200,
					headers: secureDownloadHeaders(
						"application/json; charset=utf-8",
						`attachment; filename="${filename}"`,
					),
				});
			},
		},
	},
});
