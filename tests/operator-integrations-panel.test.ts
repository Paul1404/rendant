import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorIntegrationsPanel } from "@/components/operator-integrations-panel";
import { orpc } from "@/lib/orpc";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
 ...await importOriginal<typeof import("@tanstack/react-router")>(),
 useRouter: () => ({ invalidate: vi.fn() }),
}));
const stamp="2026-01-01T00:00:00.000Z";
function fixture(host:string,hasToken=false) {
 return {email:{enabled:false,host,port:587,security:"starttls" as const,user:"",from:"",has_password:true,notify_new_protokoll:false,recipients:"",updated_at:stamp},sumup:{enabled:false,has_api_key:true,merchant_code:"DEMO",merchant_name:"Demo Händler",updated_at:stamp},datev:{enabled:false,recipient:"",sender:"",updated_at:stamp},mcp:{enabled:false,accessMode:"readonly" as const,actor:{name:"Demo Assistent",email:"assistant@example.test"},has_token:hasToken,source:hasToken?"tenant" as const:"disabled" as const,updated_at:stamp,endpoint:"/api/mcp",configured:false}};
}
function renderPanel(tenantId:string,client:QueryClient,tenantUrl:string|null=null){return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(OperatorIntegrationsPanel,{tenantId,tenantUrl})));}

describe("operator technical configuration",()=>{
 it("renders four settings sections with write-only secrets and explicit tests",()=>{
  const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});
  const id="00000000-0000-4000-8000-000000000002";
  client.setQueryData(orpc.operators.integrationSettings.queryOptions({input:{tenantId:id}}).queryKey,fixture("smtp.demo.example",true));
  const html=renderPanel(id,client,"https://club.example.test");client.clear();
  for(const title of ["E-Mail","MCP","SumUp","DATEV"])expect(html).toContain(`>${title}</summary>`);
  expect(html).toContain("smtp.demo.example");
 expect(html).toContain("Entwürfe verwerfen und neu laden");
 expect(html).toContain("https://club.example.test/api/mcp");
 expect(html).toContain("MCP-Adresse kopieren");
 expect(html).not.toContain("https://admin.");
  expect(html).toContain("Test senden");
  expect(html).toContain("Verbindung testen");
  expect(html).toContain('id="operator-mcp-token"');
  const tokenInput = (html.match(/<input[^>]+>/g) ?? []).find(input => input.includes('id="operator-mcp-token"'));
 expect(tokenInput).toContain('type="password"');
 expect(tokenInput).toContain('value=""');
  expect(html).toContain("Ein Token ist gespeichert.");
  expect(html).toContain("Token entfernen und Zugang deaktivieren");
  expect(html).not.toContain('href="/protokolle');
  expect(html).not.toContain("Kartenzahlungen,");
  expect(html).not.toContain("Token erzeugen");
 });
 it("uses separate tenant query data and never mirrors another club settings",()=>{
  const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});
  const a="00000000-0000-4000-8000-000000000002", b="00000000-0000-4000-8000-000000000003";
  client.setQueryData(orpc.operators.integrationSettings.queryOptions({input:{tenantId:a}}).queryKey,fixture("first.example"));
  client.setQueryData(orpc.operators.integrationSettings.queryOptions({input:{tenantId:b}}).queryKey,fixture("second.example"));
  const first=renderPanel(a,client), second=renderPanel(b,client);client.clear();
  expect(first).toContain("first.example");expect(first).not.toContain("second.example");
  expect(second).toContain("second.example");expect(second).not.toContain("first.example");
 expect(second).toContain("noch keine Webadresse konfiguriert");
 expect(second).not.toContain("MCP-Adresse kopieren");
 });
});
