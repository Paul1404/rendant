import { randomUUID } from "node:crypto";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { globalDb } from "@/server/db";
import { user, verification } from "@/server/db/auth-schema";
import { memberships } from "@/server/db/tenant-schema";
import { logger } from "@/server/logger";
import { withPasswordResetDelivery } from "@/server/password-reset-delivery";
import { withTenant } from "@/server/tenant-context";
import { tenantSlugForHost } from "@/server/tenant-hostname";
import { sendPasswordResetEmail } from "./email";
import { getValidInvite } from "./invitations";
import { publicBaseUrl } from "./public-url";
import { resolveHostTenant, TenantAccessError } from "./tenants";

const ACCEPTED = { ok: true as const };

async function requestRecovery(
	input: { email?: string; inviteToken?: string },
	headers: Headers,
): Promise<typeof ACCEPTED> {
	try {
		const tenant = await resolveHostTenant(headers);
		if (!tenant) return ACCEPTED;
		const base = publicBaseUrl(headers);
		if (!base || tenantSlugForHost(new URL(base).host) !== tenant.slug)
			return ACCEPTED;
		// Never fall back to a different club, even if the deployment's primary
		// auth URL is trusted. The actual approved authority chooses the mail link.
		if (new URL(`http://${headers.get("host")}`).host !== new URL(base).host)
			return ACCEPTED;
		let email = input.email?.trim().toLowerCase();
		if (input.inviteToken) {
			const invite = await getValidInvite(input.inviteToken, headers);
			if (!invite?.existingAccount || invite.tenant_id !== tenant.id)
				return ACCEPTED;
			email = invite.email;
		}
		if (!email) return ACCEPTED;
		const [identity] = await globalDb
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(and(eq(user.email, email), sql`${user.banned} is not true`))
			.limit(1);
		if (!identity) return ACCEPTED;
		const [member] = await globalDb
			.select({ banned: memberships.banned })
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, tenant.id),
					eq(memberships.user_id, identity.id),
				),
			)
			.limit(1);
		if (member?.banned || (!input.inviteToken && !member)) return ACCEPTED;
		// Share a durable per-identity cooldown across clubs, invitations and app
		// instances. Native server API calls do not use the HTTP rate limiter.
		const claimed = await globalDb.transaction(async (tx) => {
			const marker = `club-password-reset-cooldown:${identity.id}`;
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${marker}, 0))`,
			);
			const now = new Date();
			const [recent] = await tx
				.select({ id: verification.id })
				.from(verification)
				.where(
					and(
						eq(verification.identifier, marker),
						gt(verification.expiresAt, now),
					),
				)
				.limit(1);
			if (recent) return false;
			await tx
				.delete(verification)
				.where(
					and(
						eq(verification.identifier, marker),
						lte(verification.expiresAt, now),
					),
				);
			await tx.insert(verification).values({
				id: randomUUID(),
				identifier: marker,
				value: identity.id,
				expiresAt: new Date(now.getTime() + 60_000),
			});
			return true;
		});
		if (!claimed) return ACCEPTED;
		await withTenant(tenant, () =>
			withPasswordResetDelivery(
				{
					email: identity.email,
					send: async (token) => {
						const reset = new URL(
							input.inviteToken
								? `/invite/${encodeURIComponent(input.inviteToken)}`
								: "/login",
							base,
						);
						reset.searchParams.set("resetToken", token);
						await sendPasswordResetEmail({
							to: identity.email,
							resetUrl: reset.toString(),
							verein: tenant.name,
						});
					},
				},
				() =>
					auth.api.requestPasswordReset({ body: { email: identity.email } }),
			),
		);
	} catch (error) {
		// Recovery remains indistinguishable for unknown, revoked, banned and
		// unconfigured accounts. Never log native token queries or SMTP payloads.
		if (!(error instanceof TenantAccessError))
			logger.warn("Passwort-Anfrage konnte nicht bearbeitet werden", {
				event: "auth.password_recovery.failed",
			});
	}
	return ACCEPTED;
}

export function requestInvitePasswordReset(token: string, headers: Headers) {
	return requestRecovery({ inviteToken: token }, headers);
}

export function requestMemberPasswordReset(email: string, headers: Headers) {
	return requestRecovery({ email }, headers);
}
