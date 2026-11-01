import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TenantSwitcher } from "@/components/tenant-switcher";
import type { SessionUser } from "@/lib/server-fns";

vi.mock("@/lib/server-fns", () => ({
	addTenant: vi.fn(),
	selectTenant: vi.fn(),
}));

const tenant = { id: "club-a", slug: "club-a", name: "Club A", role: "admin" as const };
const user: SessionUser = {
	id: "alice", email: "alice@example.invalid", name: "Alice", role: "admin",
	tenant, tenants: [tenant, { ...tenant, id: "club-b", name: "Club B" }],
	canCreateTenant: true, tenantHostBound: true,
};

describe("tenant hostname navigation", () => {
	it("shows only a static club identity on a tenant hostname", () => {
		const html = renderToStaticMarkup(createElement(TenantSwitcher, { user }));
		expect(html).toContain("Verein: Club A");
		expect(html).not.toContain("Club B");
		expect(html).not.toContain("<button");
		expect(html).not.toContain("<form");
	});

	it("retains the club selection dialog on the shared hostname", () => {
		const html = renderToStaticMarkup(createElement(TenantSwitcher, { user: { ...user, tenantHostBound: false } }));
		expect(html).toContain('aria-haspopup="dialog"');
		expect(html).toContain('aria-label="Verein: Club A"');
	});
});
