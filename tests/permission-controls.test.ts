import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router",async(importOriginal)=>({...await importOriginal<typeof import("@tanstack/react-router")>(),useRouter:()=>({invalidate:vi.fn()})}));
vi.mock("@/components/catalog-picker",()=>({CatalogPicker:({onCreate,label}:{onCreate?:unknown;label:string})=>createElement("div",{"data-can-create":Boolean(onCreate)},label)}));
import { HelperHoursPage } from "@/components/helper-hours-page";
import { SumupSettingsForm } from "@/components/sumup-settings-form";
import { ExportForm } from "@/components/export-form";
function render(element:React.ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},element));client.clear();return html;}
describe("independent capability controls",()=>{
 it("hides hour-entry and import controls from a read-only helper viewer",()=>{const html=render(createElement(HelperHoursPage,{isAdmin:false,canWrite:false,canImport:false,canExport:false,onYearChange:vi.fn()}));expect(html).not.toContain("Helferstunde erfassen");expect(html).not.toContain("Excel-Datei auswählen");});
 it("allows hour booking without granting explicit catalogue creation",()=>{const html=render(createElement(HelperHoursPage,{isAdmin:false,canWrite:true,canImport:false,canExport:false,onYearChange:vi.fn()}));expect(html).toContain("Helferstunde erfassen");expect(html).toContain('data-can-create="false"');expect(html).not.toContain('data-can-create="true"');});
 it("hides the transaction-reading SumUp test independently of integration configuration",()=>{const html=render(createElement(SumupSettingsForm,{canTest:false,initial:{enabled:true,has_api_key:true,merchant_code:"DEMO",merchant_name:"Synthetic",updated_at:undefined}}));expect(html).not.toContain("Verbindung testen");expect(html).toContain("API-Key");});
 it("offers the complete archive independently of ordinary financial downloads",()=>{const html=render(createElement(ExportForm,{isAdmin:true,canDownload:false}));expect(html).toContain("Geschäftsarchiv");expect(html).not.toContain("Umsätze (CSV)");expect(html).not.toContain("Umsätze (Excel)");});
});
