import { Hono } from "hono";
import { authMiddleware } from "@/server/middleware/auth";
import {
  BelegnummerSettingsSchema,
  CashRegisterSchema,
  UmsatzUstBasisSettingsSchema,
} from "@/server/schemas";
import {
  getBelegnummerSettings,
  updateBelegnummerSettings,
  getUmsatzUstBasisDefault,
  updateUmsatzUstBasisDefault,
} from "@/server/services/settings";
import {
  createCashRegister,
  deleteCashRegister,
  listCashRegisters,
  updateCashRegister,
} from "@/server/services/cash-registers";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { sql } from "@/lib/db";

export const settingsRoutes = new Hono();

settingsRoutes.use("*", authMiddleware);

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "23505";
}

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

settingsRoutes.get("/registers", async (c) => {
  const registers = await listCashRegisters();
  return c.json({ registers });
});

settingsRoutes.post("/registers", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiger Request" }, 400);
  }
  const parsed = CashRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validierungsfehler", details: parsed.error.flatten() },
      400,
    );
  }
  try {
    const register = await createCashRegister(parsed.data);
    return c.json({ register }, 201);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return c.json({ error: "Kassennummer bereits vergeben" }, 409);
    }
    console.error("createCashRegister Fehler", e);
    return c.json({ error: "Speichern fehlgeschlagen" }, 500);
  }
});

settingsRoutes.put("/registers/:id", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiger Request" }, 400);
  }
  const parsed = CashRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validierungsfehler", details: parsed.error.flatten() },
      400,
    );
  }
  try {
    const register = await updateCashRegister(id, parsed.data);
    if (!register) return c.json({ error: "Kasse nicht gefunden" }, 404);
    return c.json({ register });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return c.json({ error: "Kassennummer bereits vergeben" }, 409);
    }
    console.error("updateCashRegister Fehler", e);
    return c.json({ error: "Speichern fehlgeschlagen" }, 500);
  }
});

settingsRoutes.delete("/registers/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const ok = await deleteCashRegister(id);
    if (!ok) return c.json({ error: "Kasse nicht gefunden" }, 404);
    return c.json({ ok: true });
  } catch (e) {
    console.error("deleteCashRegister Fehler", e);
    return c.json({ error: "Löschen fehlgeschlagen" }, 500);
  }
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
