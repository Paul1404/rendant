import { describe, expect, it } from "vitest";
import { credentialUserRecoveryAction } from "@/server/services/auth-accounts";

describe("credentialUserRecoveryAction", () => {
  it("creates and links when no user exists", () => {
    expect(credentialUserRecoveryAction(false, false)).toBe("create-user-and-link");
    expect(credentialUserRecoveryAction(false, true)).toBe("create-user-and-link");
  });

  it("links an existing user that has no credential account", () => {
    expect(credentialUserRecoveryAction(true, false)).toBe("link-existing-user");
  });

  it("treats an existing credential account as recovered", () => {
    expect(credentialUserRecoveryAction(true, true)).toBe("already-linked");
  });
});
