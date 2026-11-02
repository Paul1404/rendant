import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, globalDb, pool } from "@/server/db";
import { user } from "@/server/db/auth-schema";
import { appSettings } from "@/server/db/schema";
import { tenants, memberships } from "@/server/db/tenant-schema";
import { authenticateMcpRequest, validateMcpRequestBoundary, getMcpStatus } from "@/server/mcp/auth";
import { handleMcpRequest } from "@/server/mcp/server";
import { getMcpSettings, type McpSettingsPatch } from "@/server/services/mcp-settings";
import { updateOperatorMcpSettings } from "@/server/services/operator-integrations";
import { getRolePolicy } from "@/server/services/role-policy";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

const run = randomUUID();
const clubs = ["a", "b"].map((label) => ({ id: randomUUID(), slug: `mcp-${label}-${run}`, name: `Synthetischer MCP-Verein ${label}` }));
const actor = { id: randomUUID(), email: `mcp-operator-${run}@example.invalid`, name: "Synthetischer Betreiber", role: "user" };
const legacyToken = `synthetic-legacy-${randomUUID()}`;
const tokenA = `synthetic-tenant-a-${randomUUID()}`;
const tokenB = `synthetic-tenant-b-${randomUUID()}`;
const patch = { enabled: true, accessMode: "admin" as const, actor_name: "Synthetischer MCP-Zugriff", actor_email: "mcp@example.invalid" };
const svu = { id: SVU_TENANT_ID, slug: "svu", name: "SVU" };
const defaults = { mcp_override: false, mcp_enabled: false, mcp_access_mode: "readonly", mcp_token_enc: "", mcp_token_sha256: "", mcp_actor_name: "Rendant MCP", mcp_actor_email: "mcp@rendant.local" };
let originalSvu: Pick<typeof appSettings.$inferSelect, keyof typeof defaults | "mcp_updated_at" | "updated_at">;
function request(club: {id:string;slug:string;name:string}, token: string, origin?: string) {
 const host = `${club.slug}.rendant.app`;
 return new Request(`https://${host}/api/mcp`, { method: "POST", headers: { host, authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...(origin ? {origin} : {}) }, body: JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"list_protocols",arguments:{}}}) });
}
async function save(index: number, changes: Partial<McpSettingsPatch> = {}) {
 return updateOperatorMcpSettings({tenantId:clubs[index].id,...patch,...changes}, actor);
}
async function settings(index: number) { return withTenant(clubs[index], getMcpSettings); }
async function row(index: number) { return withTenant(clubs[index], async () => (await db.select().from(appSettings))[0]); }

beforeAll(async () => {
 if(process.env.RENDANT_INTEGRATION_TEST!=="1") throw new Error("Tenant MCP requires isolated integration mode");
 const result=await pool.query<{name:string}>("select current_database() as name");
 if(!result.rows[0]?.name.endsWith("_test")) throw new Error("Tenant MCP refuses a non-test database");
 vi.stubEnv("MCP_BEARER_TOKEN",legacyToken);
 vi.stubEnv("MCP_ACCESS_MODE","admin");
 vi.stubEnv("BETTER_AUTH_URL","https://svu.rendant.app");
 vi.stubEnv("MCP_ALLOWED_ORIGINS","https://svu.rendant.app,https://legacy.example.invalid");
 vi.stubEnv("TENANT_BASE_DOMAIN","rendant.app");
 vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON","");
 vi.stubEnv("TENANT_HOST_ALIASES_JSON","");
 vi.stubEnv("TENANT_ADMIN_HOST","admin.rendant.app");
 vi.stubEnv("AUTH_TRUSTED_ORIGINS",["https://svu.rendant.app",...clubs.map(club=>`https://${club.slug}.rendant.app`)].join(","));
 vi.stubEnv("PLATFORM_ADMIN_EMAILS",actor.email);
 await globalDb.insert(user).values({...actor,emailVerified:true});
 await globalDb.insert(memberships).values({tenant_id:SVU_TENANT_ID,user_id:actor.id,role:"admin"});
 await globalDb.insert(tenants).values(clubs);
 for(const club of clubs) await withTenant(club,()=>db.insert(appSettings).values({id:1,vereinsname:club.name}));
 const [existing]=await globalDb.select().from(appSettings).where(eq(appSettings.tenant_id,SVU_TENANT_ID));
 originalSvu=Object.fromEntries([...Object.keys(defaults),"mcp_updated_at","updated_at"].map(key=>[key,existing[key as keyof typeof existing]])) as typeof originalSvu;
});
beforeEach(async()=>{
 for(const club of [...clubs,svu]) await globalDb.update(appSettings).set(defaults).where(eq(appSettings.tenant_id,club.id));
});
afterAll(async()=>{
 if(originalSvu) await globalDb.update(appSettings).set(originalSvu).where(eq(appSettings.tenant_id,SVU_TENANT_ID));
 vi.unstubAllEnvs(); await pool.end();
});

describe("tenant MCP configuration and authentication on PostgreSQL",()=>{
 it("keeps the legacy credential exclusively on SVU and disables unconfigured clubs",async()=>{
  expect((await withTenant(svu,getMcpStatus)).source).toBe("legacy");
  expect((await settings(0)).configured).toBe(false);
  expect(await authenticateMcpRequest(request(clubs[0],legacyToken))).toBeNull();
  expect((await authenticateMcpRequest(request(svu,legacyToken)))?.orpc.tenant?.id).toBe(SVU_TENANT_ID);
 });
 it("stores a write-only encrypted credential and binds each token, actor and selector to its own club",async()=>{
  const safe=await save(0,{token:tokenA}); await save(1,{token:tokenB});
  expect(JSON.stringify(safe).includes(tokenA)).toBe(false);
  expect("mcp_token_sha256" in safe || "token" in safe).toBe(false);
  const persisted=await row(0);
  expect(persisted.mcp_token_enc!==tokenA && !persisted.mcp_token_enc.includes(tokenA)).toBe(true);
  expect(persisted.mcp_token_sha256===createHash("sha256").update(tokenA).digest("hex")).toBe(true);
  const resolved=await authenticateMcpRequest(request(clubs[0],tokenA));
  expect(resolved?.orpc.tenant?.id).toBe(clubs[0].id);
  expect(resolved?.orpc.user.id).toBe(`mcp:${clubs[0].id}`);
  expect(await authenticateMcpRequest(request(clubs[1],tokenA))).toBeNull();
  expect(await authenticateMcpRequest(request(svu,tokenA))).toBeNull();
  const mismatched=request(clubs[0],tokenA); mismatched.headers.set("x-rendant-tenant",clubs[1].id);
  expect(await authenticateMcpRequest(mismatched)).toBeNull();
  expect(validateMcpRequestBoundary(request(clubs[0],tokenA,`https://${clubs[1].slug}.rendant.app`))?.status).toBe(403);
  const forged=request(clubs[0],tokenA);forged.headers.set("host",`${clubs[1].slug}.rendant.app`);
  expect(await authenticateMcpRequest(forged)).toBeNull();
  const operator=new Request("https://admin.rendant.app/api/mcp",{headers:{authorization:`Bearer ${tokenA}`}});
  expect(await authenticateMcpRequest(operator)).toBeNull();
 });
 it("retains a blank token, rotates it explicitly, rejects stale writes and clears without environment fallback",async()=>{
  const first=await save(0,{token:tokenA});
  await save(0,{actor_name:"Anderer Auditname",expected_updated_at:first.updated_at});
  expect((await authenticateMcpRequest(request(clubs[0],tokenA)))?.orpc.user.name).toBe("Anderer Auditname");
  await expect(save(0,{token:tokenB,expected_updated_at:"2000-01-01T00:00:00.000Z"})).rejects.toMatchObject({name:"SettingsConcurrencyError"});
  await save(0,{token:tokenB});
  expect(await authenticateMcpRequest(request(clubs[0],tokenA))).toBeNull();
  expect((await authenticateMcpRequest(request(clubs[0],tokenB)))?.orpc.tenant?.id).toBe(clubs[0].id);
  await save(0,{enabled:false,clear_token:true});
  expect((await settings(0)).has_token).toBe(false);
  expect(await authenticateMcpRequest(request(clubs[0],tokenB))).toBeNull();
 });
 it("preserves the effective SVU token on first save and keeps approved neutral legacy endpoints after override",async()=>{
  try {
   await updateOperatorMcpSettings({tenantId:SVU_TENANT_ID,...patch},actor);
   const safe=await withTenant(svu,getMcpSettings);
   expect(safe.source).toBe("tenant");expect(safe.has_token).toBe(true);
   const old=new Request("https://legacy.example.invalid/api/mcp",{headers:{authorization:`Bearer ${legacyToken}`}});
   expect((await authenticateMcpRequest(old))?.orpc.tenant?.id).toBe(SVU_TENANT_ID);
   await updateOperatorMcpSettings({tenantId:SVU_TENANT_ID,...patch,enabled:false,clear_token:true},actor);
   expect(await authenticateMcpRequest(old)).toBeNull();
  } finally { await globalDb.update(appSettings).set(defaults).where(eq(appSettings.tenant_id,SVU_TENANT_ID)); }
 });
 it("rejects the legacy secret for other clubs and enforces unique tenant credentials under concurrent saves",async()=>{
  await expect(save(0,{token:legacyToken})).rejects.toMatchObject({code:"CONFLICT"});
  const both=await Promise.allSettled([save(0,{token:tokenA}),save(1,{token:tokenA})]);
  expect(both.filter(result=>result.status==="fulfilled").length).toBe(1);
  const rejected=both.find(result=>result.status==="rejected");
  expect(rejected?.status==="rejected" && rejected.reason.code).toBe("CONFLICT");
 });
 it("uses the authenticated tenant's current policy rather than SVU permissions",async()=>{
  await save(0,{token:tokenA});
  const prior=await getRolePolicy(clubs[0].id);
  await globalDb.update(tenants).set({role_permissions:{...prior.roles,admin:["users.manage"]}}).where(eq(tenants.id,clubs[0].id));
  try {
   const response=await handleMcpRequest(request(clubs[0],tokenA));
   const body=await response.json();
   expect(body.result.isError).toBe(true);
   expect(body.result.content[0].text.startsWith("FORBIDDEN:")).toBe(true);
  } finally {await globalDb.update(tenants).set({role_permissions:prior.roles}).where(eq(tenants.id,clubs[0].id));}
 });
 it("keeps readonly tokens read-only and lets a scoped admin token perform an existing authorized club action",async()=>{
  await save(0,{token:tokenA,accessMode:"readonly"});
  const readonly=await authenticateMcpRequest(request(clubs[0],tokenA));
  expect(readonly?.orpc.user.permissions?.includes("protocols.create")).toBe(false);
  expect(readonly?.orpc.user.permissions?.includes("settings.manage")).toBe(false);
  await save(0,{accessMode:"admin"});
  const change=new Request(request(clubs[0],tokenA),{body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"update_club_settings",arguments:{vereinsname:"Synthetischer MCP-Änderungstest"}}})});
  try {
   const response=await handleMcpRequest(change);const body=await response.json();
   expect(body.result.isError??false).toBe(false);
   expect((await row(0)).vereinsname).toBe("Synthetischer MCP-Änderungstest");
   expect((await globalDb.select({name:tenants.name}).from(tenants).where(eq(tenants.id,clubs[0].id)))[0].name).toBe("Synthetischer MCP-Änderungstest");
  } finally {
   await globalDb.update(tenants).set({name:clubs[0].name}).where(eq(tenants.id,clubs[0].id));
   await globalDb.update(appSettings).set({vereinsname:clubs[0].name}).where(eq(appSettings.tenant_id,clubs[0].id));
  }
 });
 it("rechecks operator authority inside technical writes and returns no secret on revoked access",async()=>{
  await globalDb.update(memberships).set({banned:true}).where(and(eq(memberships.tenant_id,SVU_TENANT_ID),eq(memberships.user_id,actor.id)));
  try { await expect(save(0,{token:tokenA})).rejects.toMatchObject({code:"FORBIDDEN"});expect((await settings(0)).configured).toBe(false); }
  finally { await globalDb.update(memberships).set({banned:false}).where(and(eq(memberships.tenant_id,SVU_TENANT_ID),eq(memberships.user_id,actor.id))); }
 });
});
