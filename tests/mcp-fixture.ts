import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { vi } from "vitest";
import { globalDb } from "@/server/db";
import { currentTenant, SVU_TENANT_ID } from "@/server/tenant-context";

export function installMcpRegistryFixture() {
 const dialect = new PgDialect();
 const clubs = [{ id: SVU_TENANT_ID, slug: "svu", name: "SVU" }];
 const builder = { from: () => ({ where: (condition: SQL) => ({ limit: async () => {
  const key = dialect.sqlToQuery(condition).params[0];
  return clubs.filter((club) => club.id === key || club.slug === key);
 } }) }) };
 vi.spyOn(globalDb, "select").mockReturnValue(builder as never);
}
export async function getMcpCredentialForAuthentication() {
 const scoped = currentTenant();
 const value = scoped?.id === SVU_TENANT_ID ? process.env.MCP_BEARER_TOKEN?.trim() : null;
 const token = value && value.length >= 32 ? value : null;
 const mode = process.env.MCP_ACCESS_MODE;
 return { token, enabled: token !== null, accessMode: mode === "admin" || mode === "identity" ? mode : "readonly" as const,
  actor: { name: "Codex MCP", email: "codex@rendant.local" }, source: scoped?.id === SVU_TENANT_ID ? "legacy" as const : "disabled" as const, updated_at: new Date(0).toISOString() };
}
export async function getMcpSettings() {
 const {token, ...settings} = await getMcpCredentialForAuthentication();
 return {...settings, has_token: token !== null, configured: settings.enabled && token !== null, endpoint: "/api/mcp"};
}
