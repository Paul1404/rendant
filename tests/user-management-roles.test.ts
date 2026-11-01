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

function render(canAssignAdmin: boolean) {
	return renderToStaticMarkup(createElement(UserManagement, { users, invites: [], currentUserId: "viewer", canManageRoles: true, canAssignAdmin }));
}

function button(html: string, label: string) {
	return (html.match(/<button[^>]*>/g) ?? []).find((tag) => tag.includes(`aria-label="${label}"`));
}

describe("protected Admin membership controls", () => {
	it("keeps Admin role and bans read-only for a non-Admin manager", () => {
		const html = render(false);
		expect(button(html, "Rolle von Admin Fixture")).toContain('disabled=""');
		expect(button(html, "Admin Fixture sperren")).toContain('disabled=""');
		expect(button(html, "Rolle von Board Fixture")).not.toContain('disabled=""');
		expect(button(html, "Board Fixture sperren")).not.toContain('disabled=""');
		expect(html).toContain("Die Rolle Admin wird nur von Admin verwaltet.");
	});

	it("allows an actual Admin to use other Admin membership controls", () => {
		const html = render(true);
		expect(button(html, "Rolle von Admin Fixture")).not.toContain('disabled=""');
		expect(button(html, "Admin Fixture sperren")).not.toContain('disabled=""');
	});
});
