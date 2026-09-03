import { readFileSync } from "node:fs";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_ACCOUNT_ISSUER,
  credentialUserRecoveryAction,
} from "@/server/services/auth-accounts";

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

// better-auth matches credential accounts on `issuer` at sign-in. The value is
// hardcoded in the service and again in migration 0027, so if better-auth ever
// changes how it derives the issuer these must fail rather than silently
// leaving every account unmatched.
describe("CREDENTIAL_ACCOUNT_ISSUER", () => {
  it("matches the issuer better-auth derives for credential accounts", () => {
    expect(CREDENTIAL_ACCOUNT_ISSUER).toBe(createLocalAccountIssuer("credential"));
  });

  it("matches the value migration 0027 backfills onto existing rows", () => {
    const migration = readFileSync("drizzle/0027_account_issuer.sql", "utf8");
    // The migration backfills 'local:' || provider_id for provider_id 'credential'.
    expect(migration).toContain("'local:' || \"provider_id\"");
    expect(CREDENTIAL_ACCOUNT_ISSUER).toBe(`local:${"credential"}`);
  });
});
