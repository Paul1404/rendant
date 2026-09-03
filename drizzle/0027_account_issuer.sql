-- better-auth 1.7 namespaces every account row by `issuer` and sign-in only
-- accepts a credential account whose issuer matches
-- `createLocalAccountIssuer("credential")` -> 'local:credential'.
--
-- Drizzle generates a bare `ADD COLUMN "issuer" text NOT NULL`, which both
-- aborts on a populated table and would leave every existing login unmatched.
-- The column is therefore added nullable, backfilled, and only then constrained.
--
-- This app configures email/password only (no OAuth, no SSO), so every existing
-- row is a local credential account and takes the 'local:' prefix. The final
-- SET NOT NULL is the guard: if any row were left unbackfilled it fails, the
-- migration aborts, and Railway keeps the previous release running rather than
-- starting a deployment nobody can log in to.

ALTER TABLE "account" ADD COLUMN "issuer" text;

UPDATE "account"
SET "issuer" = 'local:' || "provider_id"
WHERE "issuer" IS NULL;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
