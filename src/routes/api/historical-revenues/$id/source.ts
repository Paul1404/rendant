import { createFileRoute } from "@tanstack/react-router";
import { secureDownloadHeaders } from "@/lib/download-headers";
import {
	auditActor,
	auditRequest,
	recordAuditEvent,
} from "@/server/services/audit";
import { getHistoricalRevenueDetails } from "@/server/services/historical-revenue";
import { downloadHistoricalSource } from "@/server/services/historical-source-archive";
import { withRequestTenant } from "@/server/tenant-context";

export const Route = createFileRoute("/api/historical-revenues/$id/source")({
	server: {
		handlers: {
			GET: async ({ request, params }) =>
				withRequestTenant(request, async ({ session }) => {
					if (!session) {
						return Response.json(
							{ error: "Nicht angemeldet" },
							{ status: 401 },
						);
					}
					let detail: Awaited<ReturnType<typeof getHistoricalRevenueDetails>>;
					try {
						detail = await getHistoricalRevenueDetails(params.id);
					} catch {
						return Response.json({ error: "Nicht gefunden" }, { status: 404 });
					}
					const source = detail.source;
					const sha = source?.sha256;
					if (!sha || !source.archive) {
						return Response.json(
							{ error: "Originaldatei ist noch nicht archiviert" },
							{ status: 404 },
						);
					}
					const { archive, buffer } = await downloadHistoricalSource(sha);
					const filename = archive.original_filename.replaceAll(
						/["\r\n]/g,
						"_",
					);
					await recordAuditEvent({
						category: "umsaetze",
						action: "umsaetze.historical_source_downloaded",
						actor: auditActor(session.user),
						subject: {
							type: "historischer_umsatz",
							id: detail.id,
							label: detail.anlass,
						},
						request: auditRequest(request),
						metadata: { sha256: sha },
					});
					return new Response(new Uint8Array(buffer), {
						headers: {
							...secureDownloadHeaders(
								archive.content_type,
								`attachment; filename="${filename}"`,
							),
							"Content-Length": String(buffer.length),
						},
					});
				}),
		},
	},
});
