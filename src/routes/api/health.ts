import { createFileRoute } from "@tanstack/react-router";
import {
	collectHealthSnapshot,
	startLfioHealthReporter,
} from "@/server/services/lfio-health";
import { collectPdfHealthSnapshot } from "@/server/services/pdf-health";

startLfioHealthReporter();

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				const [health, pdf] = await Promise.all([
					collectHealthSnapshot(),
					collectPdfHealthSnapshot(),
				]);
				const ok = health.ok && pdf.ok;
				return Response.json(
					{
						ok,
						db: health.db,
						pdf: pdf.ok,
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
