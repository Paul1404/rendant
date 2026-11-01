import { describe, expect, it } from "vitest";
import { visibleNavigation } from "@/lib/navigation";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { requireClubPermission } from "@/lib/route-permissions";
const paths = (permissions: string[]) => visibleNavigation({ permissions }).map((item) => item.href);
describe("capability-based club navigation", () => {
 it("keeps default board and admin navigation complete", () => { expect(paths(DEFAULT_ROLE_PERMISSIONS.board)).toEqual(paths(DEFAULT_ROLE_PERMISSIONS.admin));expect(paths(DEFAULT_ROLE_PERMISSIONS.board)).toHaveLength(7); });
 it("keeps profile settings reachable with no financial or helper scope", () => { expect(paths([])).toEqual(["/protokolle/einstellungen"]); });
 it("separates financial reading from booking and audit", () => { const links=paths(["finance.read"]);expect(links).toContain("/protokolle");expect(links).toContain("/protokolle/umsaetze");expect(links).not.toContain("/protokolle/neu");expect(links).not.toContain("/protokolle/audit"); });
 it("keeps helper-only users away from an empty financial export page", () => { expect(paths(["helpers.read","exports.download"])).toEqual(["/protokolle/helferstunden","/protokolle/einstellungen"]); });
 it("shows financial downloads independently of archive permission", () => { expect(paths(["finance.read","exports.download"])).toContain("/protokolle/export"); });
 it("redirects denied deep links to the first permitted club area", () => { expect(()=>requireClubPermission({permissions:["helpers.read"]},"finance.read")).toThrow(expect.objectContaining({ options: expect.objectContaining({ to:"/protokolle/helferstunden" }) }));expect(()=>requireClubPermission({permissions:[]},"protocols.create")).toThrow(expect.objectContaining({options:expect.objectContaining({to:"/protokolle/einstellungen"})})); });
 it("authorizes a grant without inspecting the role label", () => { expect(()=>requireClubPermission({permissions:["audit.read"]},"audit.read")).not.toThrow(); });
});
