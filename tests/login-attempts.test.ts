import { describe, expect, it } from "vitest";
import { LOGIN_RATE_GLOBAL_MAX, LOGIN_RATE_MAX } from "@/lib/constants";
import { isLoginLimitedByCounts } from "@/server/services/login-attempts";

describe("isLoginLimitedByCounts", () => {
	it("allows attempts below both limits", () => {
		expect(
			isLoginLimitedByCounts(LOGIN_RATE_MAX - 1, LOGIN_RATE_GLOBAL_MAX - 1),
		).toBe(false);
	});

	it("limits when the per-IP threshold is reached", () => {
		expect(isLoginLimitedByCounts(LOGIN_RATE_MAX, 0)).toBe(true);
	});

	// The global backstop must not turn into a lockout weapon: anyone who can
	// reach the login page could otherwise spend LOGIN_RATE_GLOBAL_MAX bad
	// passwords and shut every member, admins included, out of the app.
	it("does not limit a clean address when only the global threshold is reached", () => {
		expect(isLoginLimitedByCounts(0, LOGIN_RATE_GLOBAL_MAX)).toBe(false);
	});

	it("limits an address with recent failures once the global threshold is reached", () => {
		expect(isLoginLimitedByCounts(1, LOGIN_RATE_GLOBAL_MAX)).toBe(true);
	});

	it("still limits a repeat offender below the global threshold", () => {
		expect(isLoginLimitedByCounts(LOGIN_RATE_MAX, LOGIN_RATE_GLOBAL_MAX - 1)).toBe(
			true,
		);
	});
});
