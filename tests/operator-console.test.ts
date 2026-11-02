import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorConsole, OperatorDenied, OperatorInvitePanel, OperatorInvitationDeliveryNotice } from "@/components/operator-console";
import { orpc } from "@/lib/orpc";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG, PERMISSION_KEYS, PROTECTED_ADMIN_PERMISSIONS } from "@/lib/permissions";

vi.mock("@tanstack/react-router", async (importOriginal) => ({ ...await importOriginal<typeof import("@tanstack/react-router")>(), useRouter: () => ({ invalidate: vi.fn() }) }));

const user = { id: "operator-demo", email: "operator@example.invalid", name: "Operator Demo", role: "admin" as const };
const tenant = { id: "00000000-0000-4000-8000-000000000002", slug: "nord", name: "Nord Demo", url: "https://nord.example.invalid", memberCount: 1, adminCount: 1, createdAt: new Date("2026-01-01") };

function renderConsole(url: string | null = tenant.url, adminCount = tenant.adminCount) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	const club = { ...tenant, url, adminCount };
	client.setQueryData(orpc.operators.list.queryOptions().queryKey, [club]);
	client.setQueryData(orpc.operators.members.queryOptions({ input: { tenantId: club.id } }).queryKey, { tenant: club, members: [{ ...user, banned: false, globalBanned: false, notifyProtokoll: true, createdAt: new Date("2026-01-01") }] });
	client.setQueryData(orpc.operators.invites.queryOptions({ input: { tenantId: club.id } }).queryKey, []);
	client.setQueryData(orpc.operators.rolePolicy.queryOptions({ input: { tenantId: club.id } }).queryKey, { version: 1, roles: DEFAULT_ROLE_PERMISSIONS, permissions: PERMISSION_CATALOG, grantablePermissions: PERMISSION_KEYS, locked: { user: [], board: [], admin: PROTECTED_ADMIN_PERMISSIONS } });
	const result = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(OperatorConsole, { user, onSelect: vi.fn() })));
	client.clear();
	return result;
}

describe("operator console presentation", () => {
	it("renders club metadata and membership controls without accounting data", () => {
		const html = renderConsole();
		expect(html).toContain("Vereine verwalten");
		expect(html).toContain("Nord Demo verwalten");
		expect(html).toContain(">Verwalten</button>");
		expect(html).toContain("Nord Demo");
		expect(html).toContain("nord.example.invalid");
		expect(html).toContain("Mitglieder und Rollen");
		expect(html).toContain("Rollen und Berechtigungen");
		expect(html).toContain("Berechtigungen speichern");
		expect(html).toContain("Einladungslink erstellen");
		expect(html).toContain("Vereinsadmin einladen");
		expect(html).not.toContain('href="/protokolle');
		expect(html).not.toContain("Tageseinnahmen");
		expect(html).not.toContain("Belegnummer");
		expect(html).not.toContain("EUR");
	});

	it("honestly marks missing web configuration and blocks unusable invitations", () => {
		const html = renderConsole(null);
		expect(html).toContain("Noch nicht konfiguriert");
		expect(html).toContain("Für Einladungen zuerst eine Vereinsadresse konfigurieren.");
		expect(html).toMatch(/<input[^>]*id="operator-invite-email"[^>]*disabled/);
		expect(html).not.toContain("https://admin.");
	});

	it("shows a clear operator access denial without a club fallback", () => {
		const html = renderToStaticMarkup(createElement(OperatorDenied));
		expect(html).toContain("Keine Betreiberberechtigung");
		expect(html).toContain("Mit anderem Konto anmelden");
		expect(html).toContain("Vereinsverwaltung");
		expect(html).not.toContain("Finanzverwaltung");
		expect(html).not.toContain("SVU");
		expect(html).not.toContain("Nord Demo");
	});
});


function renderAdminInvite() {
	const client = new QueryClient();
	const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(OperatorInvitePanel, { tenantId: tenant.id, addressConfigured: true, activeInviteIds: [], adminOnly: true, inDialog: true })));
	client.clear();
	return html;
}

describe("in-app club admin invitation", () => {
	it("highlights the first admin while retaining admin invitations for existing clubs", () => {
		expect(renderConsole(tenant.url, 0)).toContain("Ersten Admin einladen");
		expect(renderConsole()).toContain("Vereinsadmin einladen");
	});

	it("collects the recipient email in the flow and fixes the invited role to admin", () => {
		const html = renderAdminInvite();
		expect(html).toContain('id="operator-admin-invite-email"');
		expect(html).toContain('type="email"');
		expect(html).toContain("Admin-Einladungslink erstellen");
		expect(html).toContain(">Admin</p>");
		expect(html).not.toContain("<select");
		expect(html).not.toContain('type="password"');
	});

	it("requires an explicit email-send choice instead of enabling delivery by default", () => {
		const html = renderAdminInvite();
		expect(html).toContain("Einladung per E-Mail senden");
		expect(html).toContain('type="checkbox"');
		expect(html).not.toContain('checked=""');
		expect(html).toContain("Ohne Auswahl wird nur ein Link erstellt.");
	});

	it("distinguishes SMTP acceptance, unavailable delivery and an unconfirmed send", () => {
		const accepted = renderToStaticMarkup(createElement(OperatorInvitationDeliveryNotice, { requested: true, status: "sent" }));
		expect(accepted).toContain("E-Mail-Server");
		expect(accepted).toContain("bestätigt noch keinen Eingang im Postfach");
		const failed = renderToStaticMarkup(createElement(OperatorInvitationDeliveryNotice, { requested: true, status: "failed" }));
		expect(failed).toContain("nicht bestätigt");
		expect(failed).toContain("nicht automatisch erneut gesendet");
		expect(failed).toContain("Einladungslink");
		const unavailable = renderToStaticMarkup(createElement(OperatorInvitationDeliveryNotice, { requested: true, status: "skipped" }));
		expect(unavailable).toContain("kein E-Mail-Versand eingerichtet");
		const linkOnly = renderToStaticMarkup(createElement(OperatorInvitationDeliveryNotice, { requested: false, status: "skipped" }));
		expect(linkOnly).toContain("keine E-Mail versendet");
	});
});


it("offers all three club roles in ordinary operator invitations", () => {
	const client = new QueryClient();
	const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(OperatorInvitePanel, { tenantId: tenant.id, addressConfigured: true, activeInviteIds: [] })));
	client.clear();
	expect(html).toContain('<option value="user" selected="">Benutzer</option>');
	expect(html).toContain('<option value="admin">Admin</option>');
	expect(html).toContain('<option value="board">Vorstand</option>');
});
