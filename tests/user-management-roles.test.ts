import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserManagement } from "@/components/user-management";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...await importOriginal<typeof import("@tanstack/react-router")>(),
	useRouter: () => ({ invalidate: vi.fn() }),
}));

const base = { email: "fixture@example.invalid", banned: false, createdAt: new Date("2026-01-01"), notifyProtokoll: true };
const users = [{ ...base, id: "admin", name: "Admin Fixture", role: "admin" }, { ...base, id: "board", name: "Board Fixture", role: "board" }];

function render(canManageAdminAccess: boolean) {
	return renderToStaticMarkup(createElement(UserManagement, { users, invites: [], currentUserId: "viewer", canManageAdminAccess }));
}

function button(html: string, label: string) {
	return (html.match(/<button[^>]*>/g) ?? []).find((tag) => tag.includes(`aria-label="${label}"`));
}

describe("club membership presentation without role editing", () => {
	it("shows roles as read-only text and protects Admin bans for a non-Admin manager", () => {
		const html = render(false);
		expect(button(html, "Rolle von Admin Fixture")).toBeUndefined();
		expect(button(html, "Admin Fixture sperren")).toContain('disabled=""');
		expect(button(html, "Rolle von Board Fixture")).toBeUndefined();
		expect(button(html, "Board Fixture sperren")).not.toContain('disabled=""');
		expect(html).toContain("Vorstand");
		expect(html).toContain("Neue Personen werden als Benutzer eingeladen.");
		expect(html).not.toContain('role="combobox"');
		expect(html).not.toContain("Berechtigungen speichern");
	});

	it("allows an actual club Admin to manage bans while role editing remains absent", () => {
		const html = render(true);
		expect(button(html, "Rolle von Admin Fixture")).toBeUndefined();
		expect(button(html, "Admin Fixture sperren")).not.toContain('disabled=""');
	});
});
