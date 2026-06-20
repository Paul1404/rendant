import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { ExportQuerySchema } from "@/lib/schemas";
import { auth } from "@/server/auth";
import { exportUstCsv } from "@/server/services/export";

export const Route = createFileRoute("/api/export/ust")({
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
				const csv = await exportUstCsv(parsed.output.von, parsed.output.bis);
				const filename = `svufo-ust-${parsed.output.von}-${parsed.output.bis}.csv`;
				return new Response(csv, {
					status: 200,
					headers: {
						"Content-Type": "text/csv; charset=utf-8",
						"Content-Disposition": `attachment; filename="${filename}"`,
					},
				});
			},
		},
	},
});
