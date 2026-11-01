import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), platform: vi.fn() }));
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: state.session } } }));
vi.mock("@/server/services/tenants", () => ({ isPlatformAdmin: state.platform }));
import { resolveOperatorSession } from "@/server/services/operator-auth";
import { isOperatorHost, platformAdminEmailAllowed } from "@/server/operator-host";

beforeEach(() => {
	vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
	vi.stubEnv("PLATFORM_ADMIN_EMAILS", "operator@example.invalid");
	state.session.mockReset();
	state.platform.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("separate operator realm", () => {
	it("only recognizes the exact configured actual Host", () => {
		expect(isOperatorHost(new Headers({ host: "admin.rendant.app" }))).toBe(true);
		expect(isOperatorHost(new Headers({ host: "ADMIN.RENDANT.APP:443" }))).toBe(true);
		for (const host of ["sv-untereuerheim.rendant.app", "ssv-gaedheim.rendant.app", "admin.rendant.app.attacker.example", "admin.rendant.app,evil.example"]) {
			expect(isOperatorHost(new Headers({ host, "x-forwarded-host": "admin.rendant.app" }))).toBe(false);
		}
		vi.stubEnv("TENANT_ADMIN_HOST", "");
		expect(isOperatorHost(new Headers({ host: "admin.rendant.app" }))).toBe(false);
	});

	it("defaults platform email approval to deny and rejects wildcard configuration", () => {
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
		expect(platformAdminEmailAllowed("operator@example.invalid")).toBe(false);
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", " Operator@Example.Invalid, second@example.invalid ");
		expect(platformAdminEmailAllowed("operator@example.invalid")).toBe(true);
		expect(platformAdminEmailAllowed("other@example.invalid")).toBe(false);
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", "*@example.invalid");
		expect(() => platformAdminEmailAllowed("operator@example.invalid")).toThrow();
	});

	it("does not resolve or expose identity through club hosts", async () => {
		await expect(resolveOperatorSession(new Headers({ host: "sv-untereuerheim.rendant.app" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(state.session).not.toHaveBeenCalled();
	});

	it("returns null for anonymous operator-host sessions", async () => {
		state.session.mockResolvedValue(null);
		await expect(resolveOperatorSession(new Headers({ host: "admin.rendant.app" }))).resolves.toBeNull();
		expect(state.platform).not.toHaveBeenCalled();
	});

	it("checks uncached identity and live platform membership instead of the global role", async () => {
		state.session.mockResolvedValue({ user: { id: "ordinary-global-role", email: "operator@example.invalid", name: "Operator", role: "user" }, session: { id: "session-id" } });
		state.platform.mockResolvedValue(true);
		await expect(resolveOperatorSession(new Headers({ host: "admin.rendant.app" }))).resolves.toMatchObject({ user: { id: "ordinary-global-role", role: "admin" } });
		expect(state.session).toHaveBeenCalledWith(expect.objectContaining({ query: { disableCookieCache: true } }));
		expect(state.platform).toHaveBeenCalledWith("ordinary-global-role");
		state.session.mockResolvedValue({ user: { id: "global-admin", email: "outsider@example.invalid", name: "Outsider", role: "admin" } });
		state.platform.mockResolvedValue(false);
		await expect(resolveOperatorSession(new Headers({ host: "admin.rendant.app" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
