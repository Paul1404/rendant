import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ entry: vi.fn(), operator: vi.fn() }));
vi.mock("@/lib/server-fns", () => ({ fetchClubEntry: state.entry, fetchOperatorSession: state.operator }));
vi.mock("@/routes/__root", () => ({ useBranding: () => ({ vereinsname: "Nord Demo" }) }));
vi.mock("@/components/header", () => ({ Header: () => null }));
vi.mock("@/components/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("@/components/version-chip", () => ({ VersionChip: () => null }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

import { Route as LoginRoute } from "@/routes/login";
import { Route as ClubRoute } from "@/routes/protokolle/route";

afterEach(() => vi.restoreAllMocks());

describe("club access recovery routes", () => {
	it("renders an account-switch action on login for a valid session without club access", async () => {
		state.operator.mockResolvedValue({ operatorHost: false, user: null, forbidden: false });
		state.entry.mockResolvedValue({ user: null, forbidden: true });
		const context = await LoginRoute.options.beforeLoad?.({} as never);
		expect(context).toMatchObject({ clubForbidden: true });
		vi.spyOn(LoginRoute, "useRouteContext").mockReturnValue(context as never);
		vi.spyOn(LoginRoute, "useSearch").mockReturnValue({});
		const html = renderToStaticMarkup(createElement(LoginRoute.options.component as () => React.ReactNode));
		expect(html).toContain("Kein Zugang zu diesem Verein");
		expect(html).toContain("Nord Demo");
		expect(html).toContain("Abmelden und mit anderem Konto anmelden");
		expect(html).not.toContain("Etwas ist schiefgelaufen");
		expect(html).not.toContain('type="password"');
	});

	it("redirects a denied accounting entry to the recoverable login before loading financial pages", async () => {
		state.entry.mockResolvedValue({ user: null, forbidden: true });
		await expect(ClubRoute.options.beforeLoad?.({ location: { searchStr: "", href: "/protokolle" } } as never)).rejects.toMatchObject({ options: { to: "/login" } });
	});
});
