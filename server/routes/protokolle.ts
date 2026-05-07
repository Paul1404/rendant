import { Hono } from "hono";
import {
  CreateProtokollSchema,
  StornoSchema,
  ExportQuerySchema,
} from "@/server/schemas";
import {
  createProtokoll,
  getProtokoll,
  listProtokolle,
  stornoProtokoll,
} from "@/server/services/protokoll";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { downloadPdf } from "@/server/services/s3";
import { exportCsv } from "@/server/services/csv-export";
import { sql } from "@/lib/db";
import { authMiddleware } from "@/server/middleware/auth";

export const protokolleRoutes = new Hono();

protokolleRoutes.use("*", authMiddleware);

protokolleRoutes.get("/", async (c) => {
  const includeStorniert = c.req.query("storno") === "true";
  const list = await listProtokolle({ includeStorniert });
  return c.json({
    items: list.map((p) => ({
      id: p.id,
      belegnummer: p.belegnummer,
      erstellt_am: p.erstellt_am,
      anlass: p.anlass,
      tageseinnahmen_cent: p.tageseinnahmen_cent,
      gezaehlt_cent: p.gezaehlt_cent,
      bestand_cent: p.bestand_cent,
      storniert_am: p.storniert_am,
    })),
  });
});

protokolleRoutes.get("/next-belegnummer", async (c) => {
  const belegnummer = await previewNextBelegnummer(sql);
  return c.json({ belegnummer });
});

protokolleRoutes.get("/export", async (c) => {
  const parsed = ExportQuerySchema.safeParse({
    von: c.req.query("von"),
    bis: c.req.query("bis"),
  });
  if (!parsed.success) {
    return c.json({ error: "Ungültige Parameter" }, 400);
  }
  const csv = await exportCsv(parsed.data.von, parsed.data.bis);
  const filename = `svufo-export-${parsed.data.von}-${parsed.data.bis}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

protokolleRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiger Request" }, 400);
  }
  const parsed = CreateProtokollSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validierungsfehler", details: parsed.error.flatten() },
      400,
    );
  }
  try {
    const result = await createProtokoll(parsed.data);
    return c.json(result, 201);
  } catch (e) {
    console.error("createProtokoll Fehler", e);
    return c.json({ error: "Speichern fehlgeschlagen" }, 500);
  }
});

protokolleRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const detail = await getProtokoll(id);
  if (!detail) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(detail);
});

protokolleRoutes.post("/:id/storno", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiger Request" }, 400);
  }
  const parsed = StornoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Storno-Grund fehlt oder zu kurz" },
      400,
    );
  }
  try {
    await stornoProtokoll(id, parsed.data);
    return c.json({ ok: true });
  } catch (e) {
    console.error("stornoProtokoll Fehler", e);
    const msg = (e as Error).message;
    if (msg === "Protokoll nicht gefunden") {
      return c.json({ error: msg }, 404);
    }
    if (msg === "Protokoll ist bereits storniert") {
      return c.json({ error: msg }, 409);
    }
    return c.json({ error: "Stornierung fehlgeschlagen" }, 500);
  }
});

async function streamPdf(
  key: string | null,
  filename: string,
): Promise<Response> {
  if (!key) {
    return Response.json({ error: "PDF nicht verfügbar" }, { status: 404 });
  }
  const buffer = await downloadPdf(key);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}

protokolleRoutes.get("/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const detail = await getProtokoll(id);
  if (!detail) return c.json({ error: "Nicht gefunden" }, 404);
  const key = detail.protokoll.pdf_s3_key;
  const filename = key ? key.split("/").pop()! : `${detail.protokoll.belegnummer}.pdf`;
  return streamPdf(key, filename);
});

protokolleRoutes.get("/:id/storno-pdf", async (c) => {
  const id = c.req.param("id");
  const detail = await getProtokoll(id);
  if (!detail) return c.json({ error: "Nicht gefunden" }, 404);
  const key = detail.protokoll.storno_pdf_s3_key;
  const filename = key
    ? key.split("/").pop()!
    : `${detail.protokoll.belegnummer}_STORNO.pdf`;
  return streamPdf(key, filename);
});
