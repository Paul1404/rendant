import { describe, expect, it, vi } from "vitest";

// Every gate in src/routes/api is hand-rolled - there is no shared middleware
// enforcing them - so this asserts each route actually refuses an anonymous
// caller, and that the admin-only ones also refuse a signed-in non-admin.
const getSession = vi.fn();
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: () => getSession() } } }));

type Method = "GET" | "POST";

// path, module, method, admin-only, a request the route accepts far enough to
// reach its gate
const ROUTES: Array<{
	name: string;
	load: () => Promise<unknown>;
	method: Method;
	adminOnly: boolean;
	request: () => Request;
}> = [
	{
		name: "export",
		load: () => import("@/routes/api/export"),
		method: "GET",
		adminOnly: false,
		request: () =>
			new Request("http://t/api/export?von=2026-01-01&bis=2026-12-31"),
	},
	{
		name: "export.ust",
		load: () => import("@/routes/api/export.ust"),
		method: "GET",
		adminOnly: false,
		request: () =>
			new Request("http://t/api/export/ust?von=2026-01-01&bis=2026-12-31"),
	},
	{
		name: "export.revenue",
		load: () => import("@/routes/api/export.revenue"),
		method: "GET",
		adminOnly: false,
		request: () => new Request("http://t/api/export/revenue"),
	},
	{
		name: "export.revenue.xlsx",
		load: () => import("@/routes/api/export.revenue.xlsx"),
		method: "GET",
		adminOnly: false,
		request: () => new Request("http://t/api/export/revenue.xlsx"),
	},
	{
		name: "export.helper-hours.xlsx",
		load: () => import("@/routes/api/export.helper-hours.xlsx"),
		method: "GET",
		adminOnly: false,
		request: () =>
			new Request("http://t/api/export/helper-hours.xlsx?abteilung=fussball"),
	},
	{
		name: "export.json",
		load: () => import("@/routes/api/export.json"),
		method: "GET",
		adminOnly: true,
		request: () => new Request("http://t/api/export/json"),
	},
	{
		name: "import.revenue.template",
		load: () => import("@/routes/api/import.revenue.template"),
		method: "GET",
		adminOnly: true,
		request: () => new Request("http://t/api/import/revenue/template"),
	},
	{
		name: "import.revenue",
		load: () => import("@/routes/api/import.revenue"),
		method: "POST",
		adminOnly: true,
		request: () =>
			new Request("http://t/api/import/revenue", { method: "POST" }),
	},
	{
		name: "import.helper-hours",
		load: () => import("@/routes/api/import.helper-hours"),
		method: "POST",
		adminOnly: true,
		request: () =>
			new Request("http://t/api/import/helper-hours", { method: "POST" }),
	},
	{
		name: "import.historical-protocols",
		load: () => import("@/routes/api/import.historical-protocols"),
		method: "POST",
		adminOnly: true,
		request: () =>
			new Request("http://t/api/import/historical-protocols", {
				method: "POST",
			}),
	},
	{
		name: "import.historical-sources",
		load: () => import("@/routes/api/import.historical-sources"),
		method: "POST",
		adminOnly: true,
		request: () =>
			new Request("http://t/api/import/historical-sources", { method: "POST" }),
	},
];

// biome-ignore lint/suspicious/noExplicitAny: reaching into the generated route
function handlerOf(mod: any, method: Method) {
	return mod.Route.options.server.handlers[method];
}

const anonymous = null;
const member = {
	user: { id: "u1", email: "m@x.invalid", name: "Mitglied", role: "user" },
};

describe("API route authorization", () => {
	for (const route of ROUTES) {
		it(`${route.name} refuses an anonymous request with 401`, async () => {
			getSession.mockResolvedValueOnce(anonymous);
			const mod = await route.load();
			const response: Response = await handlerOf(mod, route.method)({
				request: route.request(),
				params: { id: "00000000-0000-4000-8000-000000000000" },
			});
			expect(response.status).toBe(401);
		});

		if (route.adminOnly) {
			it(`${route.name} refuses a non-admin with 403`, async () => {
				getSession.mockResolvedValueOnce(member);
				const mod = await route.load();
				const response: Response = await handlerOf(mod, route.method)({
					request: route.request(),
					params: { id: "00000000-0000-4000-8000-000000000000" },
				});
				expect(response.status).toBe(403);
			});
		}
	}
});
