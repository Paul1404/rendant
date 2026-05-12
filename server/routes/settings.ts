import { Hono } from "hono";
import { authMiddleware } from "@/server/middleware/auth";
import {
  BelegnummerSettingsSchema,
  UmsatzUstBasisSettingsSchema,
} from "@/server/schemas";
import {
  getBelegnummerSettings,
  updateBelegnummerSettings,
  getUmsatzUstBasisDefault,
  updateUmsatzUstBasisDefault,
} from "@/server/services/settings";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { sql } from "@/lib/db";

export const settingsRoutes = new Hono();

settingsRoutes.use("*", authMiddleware);

settingsRoutes.get("/belegnummer", async (c) => {
  const [settings, preview] = await Promise.all([
    getBelegnummerSettings(),
    previewNextBelegnummer(sql),
  ]);
  return c.json({ settings, preview });
});

settingsRoutes.put("/belegnummer", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiger Request" }, 400);
  }
  const parsed = BelegnummerSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validierungsfehler", details: parsed.error.flatten() },
      400,
    );
  }
  try {
    const updated = await updateBelegnummerSettings(parsed.data);
    const preview = await previewNextBelegnummer(sql);
    return c.json({ settings: updated, preview });
  } catch (e) {
    console.error("updateBelegnummerSettings Fehler", e);
    return c.json({ error: "Speichern fehlgeschlagen" }, 500);
  }
});

settingsRoutes.get("/umsatz-ust-basis", async (c) => {
  const umsatz_ust_basis = await getUmsatzUstBasisDefault();
  return c.json({ umsatz_ust_basis });
});

settingsRoutes.put("/umsatz-ust-basis", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiger Request" }, 400);
  }
  const parsed = UmsatzUstBasisSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validierungsfehler", details: parsed.error.flatten() },
      400,
    );
  }
  try {
    const umsatz_ust_basis = await updateUmsatzUstBasisDefault(
      parsed.data.umsatz_ust_basis,
    );
    return c.json({ umsatz_ust_basis });
  } catch (e) {
    console.error("updateUmsatzUstBasisDefault Fehler", e);
    return c.json({ error: "Speichern fehlgeschlagen" }, 500);
  }
});
