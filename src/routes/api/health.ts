import { createFileRoute } from "@tanstack/react-router";
import {
	collectHealthSnapshot,
	startLfioHealthReporter,
} from "@/server/services/lfio-health";

startLfioHealthReporter();

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				const health = await collectHealthSnapshot();
				return Response.json(
					{
						ok: health.ok,
						db: health.db,
						status: health.status,
						latencyMs: health.latencyMs,
					},
					{ status: health.ok ? 200 : 503 },
				);
			},
		},
	},
});
