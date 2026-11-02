import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { changePermissionSelection, RolePermissionsForm, RolePolicyEditor } from "@/components/role-permissions-form";
import { orpc } from "@/lib/orpc";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG, PERMISSION_KEYS, PROTECTED_ADMIN_PERMISSIONS } from "@/lib/permissions";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...await importOriginal<typeof import("@tanstack/react-router")>(),
	useRouter: () => ({ invalidate: vi.fn() }),
}));

describe("role permissions editing", () => {
	it("adds all read scopes required by an explicitly selected import grant", () => {
		const original = ["exports.download"] as const;
		const updated = changePermissionSelection(original, "imports.manage", true, PERMISSION_CATALOG);
		expect(updated).toEqual(expect.arrayContaining(["exports.download", "imports.manage", "finance.read", "helpers.read"]));
		expect(original).toEqual(["exports.download"]);
	});

	it("removes dependent grants when the corresponding read scope is revoked", () => {
		const updated = changePermissionSelection(DEFAULT_ROLE_PERMISSIONS.board, "finance.read", false, PERMISSION_CATALOG);
		expect(updated).not.toContain("finance.read");
		expect(updated).not.toContain("protocols.create");
		expect(updated).not.toContain("imports.manage");
		expect(updated).not.toContain("exports.archive");
		expect(updated).toContain("helpers.read");
		expect(updated).toContain("helpers.write");
		expect(updated).toContain("users.manage");
	});

	it("renders full default board rights and protects only required admin controls", () => {
		const client = new QueryClient();
		const policy = { version: 1, roles: DEFAULT_ROLE_PERMISSIONS, permissions: PERMISSION_CATALOG, grantablePermissions: PERMISSION_KEYS, locked: { user: [], board: [], admin: PROTECTED_ADMIN_PERMISSIONS } };
		const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RolePolicyEditor, { policy, tenantId: "00000000-0000-4000-8000-000000000002" })));
		client.clear();
		const boardInputs = html.match(/<input[^>]+aria-label="Vorstand:[^>]+>/g) ?? [];
		expect(boardInputs).toHaveLength(PERMISSION_CATALOG.length);
		expect(boardInputs.every((input) => input.includes('checked=""') && !input.includes('disabled=""'))).toBe(true);
		const lockedAdminInputs = (html.match(/<input[^>]+aria-label="Admin:[^>]+>/g) ?? []).filter((input) => input.includes('disabled=""'));
		expect(lockedAdminInputs).toHaveLength(PROTECTED_ADMIN_PERMISSIONS.length);
		expect(html).toContain("Berechtigungen speichern");
		expect(html).toContain("Schreibrechte aktivieren die nötigen Leserechte mit");
	});
});


it("loads each selected club policy through its tenant-scoped operator query", () => {
	const client = new QueryClient();
	const firstId = "00000000-0000-4000-8000-000000000002";
	const otherId = "00000000-0000-4000-8000-000000000003";
	const base = { version: 1, roles: DEFAULT_ROLE_PERMISSIONS, permissions: PERMISSION_CATALOG, grantablePermissions: PERMISSION_KEYS, locked: { user: [], board: [], admin: PROTECTED_ADMIN_PERMISSIONS } };
	client.setQueryData(orpc.operators.rolePolicy.queryOptions({ input: { tenantId: firstId } }).queryKey, { ...base, roles: { ...base.roles, user: base.roles.user.filter((key) => key !== "protocols.create") } });
	client.setQueryData(orpc.operators.rolePolicy.queryOptions({ input: { tenantId: otherId } }).queryKey, base);
	const firstHtml = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RolePermissionsForm, { tenantId: firstId })));
	const otherHtml = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RolePermissionsForm, { tenantId: otherId })));
	client.clear();
	const bookingInput = (html: string) => (html.match(/<input[^>]+>/g) ?? []).find((input) => input.includes('aria-label="Benutzer: Kassenzählprotokolle buchen"'));
	expect(bookingInput(firstHtml)).not.toContain('checked=""');
	expect(bookingInput(otherHtml)).toContain('checked=""');
});
