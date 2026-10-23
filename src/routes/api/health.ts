import { createFileRoute } from "@tanstack/react-router";
import {
	collectAuthReadiness,
	collectHealthSnapshot,
} from "@/server/services/health";
import { collectPdfHealthSnapshot } from "@/server/services/pdf-health";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				const [health, pdf, authReady] = await Promise.all([
					collectHealthSnapshot(),
					collectPdfHealthSnapshot(),
					collectAuthReadiness(),
				]);
				const ok = health.ok && pdf.ok && authReady;
				return Response.json(
					{
						ok,
						db: health.db,
						pdf: pdf.ok,
						auth: authReady,
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
