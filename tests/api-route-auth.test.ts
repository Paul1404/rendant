import { describe, expect, it, vi } from "vitest";
import { TenantAccessError } from "@/server/services/tenants";

// Every business route must pass through tenant authorization before it parses
// uploads or reads records. Keep exercising the real request wrapper here, with
// membership resolution mocked independently from business services.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/tenants", () => {
	class TenantAccessError extends Error {
		readonly status = 403;
		constructor() { super("Für diesen Verein besteht keine Zugriffsberechtigung"); }
	}
	return {
		TenantAccessError,
		resolveTenantSession: async () => {
			const session = await getSession();
			return session ? {
				session,
				user: session.user,
				tenant: { id: "00000000-0000-4000-8000-000000000001", slug: "svu", name: "SVU", role: session.user.role },
			} : null;
		},
	};
});

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

for (const [name, load, method, adminOnly] of [
	["import.helper-hour-expenses", () => import("@/routes/api/import.helper-hour-expenses"), "POST", true],
	["protokoll.pdf", () => import("@/routes/api/protokolle/$id/pdf"), "GET", false],
	["protokoll.storno-pdf", () => import("@/routes/api/protokolle/$id/storno-pdf"), "GET", false],
	["historical-revenue.source", () => import("@/routes/api/historical-revenues/$id/source"), "GET", false],
] as const) {
	ROUTES.push({ name, load, method, adminOnly, request: () => new Request(`http://t/api/${name}`, { method }) });
}

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

		it(`${route.name} refuses an inaccessible tenant before processing records`, async () => {
			getSession.mockRejectedValueOnce(new TenantAccessError());
			const mod = await route.load();
			const response: Response = await handlerOf(mod, route.method)({
				request: route.request(),
				params: { id: "00000000-0000-4000-8000-000000000000" },
			});
			expect(response.status).toBe(403);
		});

		it(`${route.name} refuses a club admin without the required functional permissions`, async () => {
			getSession.mockResolvedValueOnce({ user: { ...member.user, role: "admin", permissions: [] } });
			const mod = await route.load();
			const response: Response = await handlerOf(mod, route.method)({ request: route.request(), params: { id: "00000000-0000-4000-8000-000000000000" } });
			expect(response.status).toBe(403);
		});

		it(`${route.name} does not let a broad import or export grant bypass its dataset read permissions`, async () => {
			getSession.mockResolvedValueOnce({ user: { ...member.user, role: "board", permissions: ["imports.manage", "exports.download", "exports.archive"] } });
			const mod = await route.load();
			const response: Response = await handlerOf(mod, route.method)({ request: route.request(), params: { id: "00000000-0000-4000-8000-000000000000" } });
			expect(response.status).toBe(403);
		});

		if (route.adminOnly) {
			it(`${route.name} refuses a member without management permissions with 403`, async () => {
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
