import { describe, expect, it } from "vitest";
import { LOGIN_RATE_GLOBAL_MAX, LOGIN_RATE_MAX } from "@/lib/constants";
import { isLoginLimitedByCounts } from "@/server/services/login-attempts";

describe("isLoginLimitedByCounts", () => {
  it("allows attempts below both limits", () => {
    expect(isLoginLimitedByCounts(LOGIN_RATE_MAX - 1, LOGIN_RATE_GLOBAL_MAX - 1)).toBe(false);
  });

  it("limits when the per-IP threshold is reached", () => {
    expect(isLoginLimitedByCounts(LOGIN_RATE_MAX, 0)).toBe(true);
  });

  it("limits when the global threshold is reached", () => {
    expect(isLoginLimitedByCounts(0, LOGIN_RATE_GLOBAL_MAX)).toBe(true);
  });
});
