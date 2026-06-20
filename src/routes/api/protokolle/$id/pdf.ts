import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/server/auth";
import { getProtokoll } from "@/server/services/protokoll";
import { downloadPdf } from "@/server/services/s3";

export const Route = createFileRoute("/api/protokolle/$id/pdf")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
				}
				const detail = await getProtokoll(params.id);
				if (!detail) {
					return Response.json({ error: "Nicht gefunden" }, { status: 404 });
				}
				const key = detail.protokoll.pdf_s3_key;
				if (!key) {
					return Response.json(
						{ error: "PDF nicht verfügbar" },
						{ status: 404 },
					);
				}
				const buffer = await downloadPdf(key);
				const filename =
					key.split("/").pop() ?? `${detail.protokoll.belegnummer}.pdf`;
				return new Response(new Uint8Array(buffer), {
					status: 200,
					headers: {
						"Content-Type": "application/pdf",
						"Content-Disposition": `attachment; filename="${filename}"`,
						"Content-Length": String(buffer.length),
					},
				});
			},
		},
	},
});
