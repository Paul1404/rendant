import { createFileRoute } from "@tanstack/react-router";
import {
	collectAuthReadiness,
	collectHealthSnapshot,
	collectTenantReadiness,
} from "@/server/services/health";
import { collectPdfHealthSnapshot } from "@/server/services/pdf-health";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				const [health, pdf, authReady, tenantsReady] = await Promise.all([
					collectHealthSnapshot(),
					collectPdfHealthSnapshot(),
					collectAuthReadiness(),
					collectTenantReadiness(),
				]);
				const ok = health.ok && pdf.ok && authReady && tenantsReady;
				return Response.json(
					{
						ok,
						db: health.db,
						pdf: pdf.ok,
						auth: authReady,
						tenants: tenantsReady,
						status: ok ? health.status : "down",
						latencyMs: health.latencyMs,
						pdfLatencyMs: pdf.latencyMs,
					},
					{ status: ok ? 200 : 503 },
				);
			},
		},
	},
});
