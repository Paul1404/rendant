import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";

async function apply(client: PoolClient, tag: string) {
 const source=await readFile(resolve("drizzle",`${tag}.sql`),"utf8");
 await client.query("begin");
 try { for(const statement of source.split("--> statement-breakpoint")) if(statement.trim()) await client.query(statement); await client.query("commit"); }
 catch(error) {await client.query("rollback");throw error;}
}
describe("populated 0039 to 0040 tenant MCP migration",()=>{
 it("preserves every existing setting and financial row, defaults off for new clubs and retains forced tenant isolation",async()=>{
  if(process.env.RENDANT_INTEGRATION_TEST!=="1")throw new Error("MCP migration requires isolated integration mode");
  const input=new URL(process.env.DATABASE_URL??"");
  if(!input.pathname.endsWith("_test"))throw new Error("MCP migration refuses a non-test database");
  const name=`rendant_mcp_migration_${randomUUID().replaceAll("-","")}_test`;
  const admin=new Pool({connectionString:input.toString(),max:1});
  const fixtureUrl=new URL(input);fixtureUrl.pathname=`/${name}`;
  let fixture: Pool|undefined;
  try {
   await admin.query(`create database "${name}"`);
   fixture=new Pool({connectionString:fixtureUrl.toString(),max:1});
   const client=await fixture.connect();
   try {
    const journal=JSON.parse(await readFile(resolve("drizzle/meta/_journal.json"),"utf8")) as {entries:Array<{idx:number;tag:string}>};
    for(const entry of journal.entries.filter(entry=>entry.idx<=39))await apply(client,entry.tag);
    const svu="00000000-0000-4000-8000-000000000001";
    const other=randomUUID();
    await client.query("insert into tenants(id,slug,name)values($1,'mcp-migration','Synthetischer Zweitverein')",[other]);
    await client.query("insert into app_settings(tenant_id,id,vereinsname,smtp_password_enc,sumup_api_key_enc,updated_at)values($1,1,'Synthetischer Altbestand','opaque-old-smtp','opaque-old-sumup','2025-01-01') on conflict(tenant_id,id)do update set vereinsname=excluded.vereinsname,smtp_password_enc=excluded.smtp_password_enc,sumup_api_key_enc=excluded.sumup_api_key_enc,updated_at=excluded.updated_at",[svu]);
    await client.query("insert into app_settings(tenant_id,id,vereinsname,smtp_host)values($1,1,'Synthetischer Zweitverein','smtp-other.example.invalid')",[other]);
    await client.query("insert into protokolle(tenant_id,belegnummer,anlass_datum,anlass,gezaehlt_von,geprueft_von,wechselgeld_cent,gezaehlt_cent,ausgaben_cent,bestand_cent,tageseinnahmen_cent,pdf_s3_key,pdf_sha256)values($1,'MCP-ORIGINAL','2026-11-01','Synthetisch','Test','Test',0,100,0,100,100,'protokolle/unchanged.pdf',$2)",[svu,"a".repeat(64)]);
    const before=await client.query("select to_jsonb(t) as row from app_settings t order by tenant_id");
    const financial=await client.query("select to_jsonb(t) as row from protokolle t order by id");
    await apply(client,"0040_tenant_mcp");
    const after=await client.query("select to_jsonb(t)-ARRAY['mcp_override','mcp_enabled','mcp_access_mode','mcp_token_enc','mcp_token_sha256','mcp_actor_name','mcp_actor_email','mcp_updated_at'] as row from app_settings t order by tenant_id");
    expect(after.rows).toEqual(before.rows);
    expect((await client.query("select to_jsonb(t) as row from protokolle t order by id")).rows).toEqual(financial.rows);
    const state=await client.query("select mcp_override,mcp_enabled,mcp_access_mode,mcp_token_enc,mcp_token_sha256 from app_settings order by tenant_id");
    expect(state.rows).toEqual(Array.from({length:2},()=>({mcp_override:false,mcp_enabled:false,mcp_access_mode:"readonly",mcp_token_enc:"",mcp_token_sha256:""})));
    const security=await client.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.app_settings'::regclass");
    expect(security.rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
    await client.query("begin");
    try {
     await client.query("set local role rendant_tenant");
     await client.query("select set_config('app.tenant_id',$1,true)",[other]);
     expect((await client.query("select tenant_id from app_settings")).rows).toEqual([{tenant_id:other}]);
    } finally {await client.query("rollback");}
    const constraints=await client.query<{conname:string}>("select conname from pg_constraint where conrelid='public.app_settings'::regclass and contype='c' and conname like 'app_settings_mcp_%'");
    expect(constraints.rows.map(row=>row.conname).sort()).toEqual(["app_settings_mcp_mode_check","app_settings_mcp_token_hash_check","app_settings_mcp_token_pair_check"].sort());
   } finally {client.release();}
  } finally {await fixture?.end();await admin.query(`drop database if exists "${name}" with(force)`);await admin.end();}
 },90000);
});
