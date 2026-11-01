import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
	session: null as null | { user: { email: string } },
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: state.session, isPending: false }),
		resetPassword: vi.fn(),
		signOut: vi.fn(),
	},
}));
vi.mock("@/lib/server-fns", () => ({ selectTenant: vi.fn() }));
vi.mock("@/lib/orpc", () => ({
	orpcClient: {
		invites: { requestPasswordReset: vi.fn() },
		recovery: { request: vi.fn() },
	},
}));
vi.mock("@/routes/__root", () => ({
	useBranding: () => ({ vereinsname: "Synthetic SSV" }),
}));
import { Route } from "@/routes/invite.$token";
import { LoginForm } from "@/components/login-form";
import { ResetPasswordForm } from "@/components/invite-password-recovery";
const invite = {
	valid: true,
	email: "synthetic@example.invalid",
	role: "admin",
	existingAccount: false,
	tenantName: "Synthetic SSV",
};
function renderInvite(
	data: unknown = invite,
	search: { resetToken?: string } = {},
) {
	vi.spyOn(Route, "useParams").mockReturnValue({ token: "synthetic-invite" });
	vi.spyOn(Route, "useLoaderData").mockReturnValue(data as never);
	vi.spyOn(Route, "useSearch").mockReturnValue(search);
	return renderToStaticMarkup(
		createElement(Route.options.component as () => React.ReactNode),
	);
}
afterEach(() => {
	vi.restoreAllMocks();
	state.session = null;
});
describe("invitation onboarding", () => {
	it("offers login recovery when a consumed or expired invite is reopened", () => {
		const html = renderInvite({ valid: false });
		expect(html).toContain('href="/login"');
		expect(html).toContain("bereits angenommen");
		expect(html).not.toContain('type="password"');
	});
	it("asks a new identity for its own name and new password with a visibility control", () => {
		const html = renderInvite();
		expect(html).toContain('autoComplete="name"');
		expect(html).toContain('autoComplete="new-password"');
		expect(html).toContain('maxLength="256"');
		expect(html).toContain("Passwort anzeigen");
		expect(html).not.toContain("Passwort vergessen?");
	});
	it("offers password recovery only when the invited existing identity must sign in", () => {
		const html = renderInvite({ ...invite, existingAccount: true });
		expect(html).toContain("Dein bisheriges Passwort");
		expect(html).toContain("Passwort vergessen?");
		expect(html).not.toContain('autoComplete="name"');
	});
	it("does not ask a matching authenticated account for another password", () => {
		state.session = { user: { email: invite.email } };
		const html = renderInvite({ ...invite, existingAccount: true });
		expect(html).not.toContain('type="password"');
		expect(html).not.toContain("Passwort vergessen?");
		expect(html).toContain("Einladung annehmen");
	});
	it("requires an explicit account switch for another signed-in identity", () => {
		state.session = { user: { email: "other@example.invalid" } };
		const html = renderInvite({ ...invite, existingAccount: true });
		expect(html).toContain("Konto wechseln");
		expect(html).not.toContain('type="password"');
	});
	it("renders reset links with the global-account effect and password confirmation", () => {
		const html = renderInvite(
			{ ...invite, existingAccount: true },
			{ resetToken: "synthetic-reset-token" },
		);
		expect(html).toContain("Neues Passwort festlegen");
		expect(html).toContain("für alle deine Vereine");
		expect(html).toContain("auf allen Geräten abgemeldet");
		expect(html).toContain("Passwort wiederholen");
		expect(html).toContain("Passwörter anzeigen");
		expect(html).not.toContain("Dein bisheriges Passwort");
	});
	it("offers member recovery in club login but hides it in the operator realm", () => {
		expect(
			renderToStaticMarkup(
				createElement(LoginForm, { redirectTo: "/protokolle" }),
			),
		).toContain("Passwort vergessen?");
		expect(
			renderToStaticMarkup(
				createElement(LoginForm, {
					redirectTo: "/admin",
					allowRecovery: false,
				}),
			),
		).not.toContain("Passwort vergessen?");
	});
	it("supports reset without an invitation or exposing a membership claim", () => {
		const html = renderToStaticMarkup(
			createElement(ResetPasswordForm, { resetToken: "synthetic-reset-token" }),
		);
		expect(html).toContain("Passwort speichern");
		expect(html).not.toContain("Einladung annehmen");
	});
});
