import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorConsole, OperatorDenied } from "@/components/operator-console";
import { orpc } from "@/lib/orpc";

const user = { id: "operator-demo", email: "operator@example.invalid", name: "Operator Demo", role: "admin" as const };
const tenant = { id: "00000000-0000-4000-8000-000000000002", slug: "nord", name: "Nord Demo", url: "https://nord.example.invalid", memberCount: 1, adminCount: 1, createdAt: new Date("2026-01-01") };

function renderConsole(url: string | null = tenant.url) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	const club = { ...tenant, url };
	client.setQueryData(orpc.operators.list.queryOptions().queryKey, [club]);
	client.setQueryData(orpc.operators.members.queryOptions({ input: { tenantId: club.id } }).queryKey, { tenant: club, members: [{ ...user, banned: false, globalBanned: false, notifyProtokoll: true, createdAt: new Date("2026-01-01") }] });
	client.setQueryData(orpc.operators.invites.queryOptions({ input: { tenantId: club.id } }).queryKey, []);
	const result = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(OperatorConsole, { user, onSelect: vi.fn() })));
	client.clear();
	return result;
}

describe("operator console presentation", () => {
	it("renders club metadata and membership controls without accounting data", () => {
		const html = renderConsole();
		expect(html).toContain("Vereine verwalten");
		expect(html).toContain("Nord Demo");
		expect(html).toContain("nord.example.invalid");
		expect(html).toContain("Mitglieder und Rollen");
		expect(html).toContain("Einladungslink erstellen");
		expect(html).not.toContain("Kassenzählprotokolle");
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
