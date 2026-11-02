import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/orpc", () => {
 const value:Record<string,unknown>={ "settings.getBelegnummer":{settings:{},preview:"01"},"settings.getUmsatzUstBasis":{umsatz_ust_basis:"post_card"},"settings.getVerein":{name:"Demo"},"settings.getHelperHourValue":{wert_cent:600},"profile.getNotify":{notify:true},"registers.list":[],"anlassKatalog.list":[],"users.list":[],"invites.list":[] };
 const group=(name:string)=>new Proxy({}, {get:(_target,key)=>async()=>{const path=`${name}.${String(key)}`;state.calls.push(path);return value[path]??{};}});
 return {orpcClient:{settings:group("settings"),registers:group("registers"),users:group("users"),invites:group("invites"),profile:group("profile"),anlassKatalog:group("anlassKatalog")}};
});
vi.mock("@/components/helper-hour-categories-form",()=>({HelperHourCategoriesForm:()=>null,HelperHourNameVariantsForm:()=>null,HelperHourNoteRulesForm:()=>null}));
vi.mock("@/components/user-management",()=>({UserManagement:()=>null}));
vi.mock("@/components/role-permissions-form",()=>({RolePermissionsForm:()=>null}));
vi.mock("@/components/notification-pref-form",()=>({NotificationPrefForm:()=>createElement("p",null,"own-notifications")}));
import { Route } from "@/routes/protokolle/einstellungen";
async function load(permissions:string[]){state.calls=[];const loader=Route.options.loader as (options:unknown)=>Promise<unknown>;const data=await loader({context:{user:{id:"demo",role:"board",permissions}}});return data;}
afterEach(()=>vi.restoreAllMocks());
describe("settings capability datasets",()=>{
 it("does not fetch technical settings for the default Board but retains business management",async()=>{
  const data=await load(DEFAULT_ROLE_PERMISSIONS.board) as Record<string,unknown>;
  for(const field of ["email","mcp","sumup","datev"]) expect(data[field]).toBeNull();
  for(const method of ["settings.getEmail","settings.getMcp","settings.getSumup","settings.getDatev"]) expect(state.calls).not.toContain(method);
  expect(data.bookkeeping).not.toBeNull();expect(data.registers).toEqual([]);expect(data.admin).not.toBeNull();
 });
 it("loads only the own notification preference when all optional rights are removed",async()=>{const data=await load([]);expect(state.calls).toEqual(["profile.getNotify"]);vi.spyOn(Route,"useLoaderData").mockReturnValue(data as never);vi.spyOn(Route,"useRouteContext").mockReturnValue({user:{permissions:[]}} as never);const html=renderToStaticMarkup(createElement(Route.options.component as ()=>React.ReactNode));expect(html).toContain("own-notifications");expect(html).not.toContain("SMTP-Zugang");expect(html).not.toContain("Vereinsstammdaten");});
 it("loads club defaults independently of integrations and financial read grants",async()=>{await load(["settings.manage"]);expect(state.calls).toEqual(expect.arrayContaining(["settings.getBelegnummer","settings.getUmsatzUstBasis","settings.getVerein","settings.getHelperHourValue","profile.getNotify"]));expect(state.calls).not.toContain("settings.getEmail");expect(state.calls).not.toContain("users.list");expect(state.calls).not.toContain("registers.list");});
 it("loads member management without unrelated financial or integration settings",async()=>{await load(["users.manage"]);expect(state.calls).toEqual(expect.arrayContaining(["users.list","invites.list","profile.getNotify"]));expect(state.calls).toHaveLength(3);});
 it("loads occasion catalogues without requiring financial reports",async()=>{await load(["occasions.manage"]);expect(state.calls).toEqual(expect.arrayContaining(["anlassKatalog.list","profile.getNotify"]));expect(state.calls).toHaveLength(2);});
 it("loads integrations without member-management rights",async()=>{await load(["integrations.manage"]);expect(state.calls).toEqual(expect.arrayContaining(["settings.getEmail","settings.getMcp","settings.getSumup","settings.getDatev","profile.getNotify"]));expect(state.calls).not.toContain("users.list");expect(state.calls).not.toContain("settings.getBelegnummer");});
});
