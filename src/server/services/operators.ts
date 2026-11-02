import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { ClubRole } from "@/lib/permissions";
import { globalDb } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { appSettings, invitations } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { withTenant } from "@/server/tenant-context";
import { tenantSlugForHost } from "@/server/tenant-hostname";
import { type RecordAuditInput, recordAuditEventStrict } from "./audit";
import { sendInvitationEmail } from "./email";
import { createInviteInTransaction } from "./invitations";
import { tenantPublicBaseUrl } from "./public-url";

export { getOperatorRolePolicy, updateOperatorRolePolicy } from "./role-policy";

import {
	assertPlatformAdmin,
	assertPlatformAdminInTransaction,
	changeTenantMember,
	createTenant,
	type GlobalTransaction,
} from "./tenants";

type Actor = NonNullable<RecordAuditInput["actor"]>;
type RequestAudit = RecordAuditInput["request"];

function tenantMetadata(row: { id: string; slug: string; name: string }) {
	const candidate = tenantPublicBaseUrl(row);
	const url =
		candidate && tenantSlugForHost(new URL(candidate).host) === row.slug
			? candidate
			: null;
	return { id: row.id, slug: row.slug, name: row.name, url };
}

async function targetTenant(
	tx: typeof globalDb | GlobalTransaction,
	tenantId: string,
	lock = false,
) {
	const query = tx
		.select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.limit(1);
	const [tenant] = lock ? await query.for("update") : await query;
	if (!tenant)
		throw new ORPCError("NOT_FOUND", { message: "Verein nicht gefunden" });
	return tenant;
}

export async function listOperatorTenants(actor: Actor) {
	await assertPlatformAdmin(actor.id);
	const rows = await globalDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			name: tenants.name,
			createdAt: tenants.created_at,
			memberCount: sql<number>`count(${memberships.user_id})`,
			adminCount: sql<number>`count(${memberships.user_id}) filter (where ${memberships.role} = 'admin' and ${memberships.banned} = false and ${userTable.banned} is not true)`,
		})
		.from(tenants)
		.leftJoin(memberships, eq(memberships.tenant_id, tenants.id))
		.leftJoin(userTable, eq(userTable.id, memberships.user_id))
		.groupBy(tenants.id, tenants.slug, tenants.name, tenants.created_at)
		.orderBy(asc(tenants.name));
	return rows.map((row) => ({
		...tenantMetadata(row),
		createdAt: row.createdAt,
		memberCount: Number(row.memberCount),
		adminCount: Number(row.adminCount),
	}));
}

export async function createOperatorTenant(
	input: { name: string; slug: string },
	actor: Actor,
	request?: RequestAudit,
) {
	const created = await createTenant({
		...input,
		actor,
		audit: request,
		grantCreatorMembership: false,
	});
	return tenantMetadata(created);
}

export async function renameOperatorTenant(
	input: { tenantId: string; name: string },
	actor: Actor,
	request?: RequestAudit,
) {
	return globalDb.transaction(async (tx) => {
		await assertPlatformAdminInTransaction(tx, actor.id);
		const tenant = await targetTenant(tx, input.tenantId, true);
		const name = input.name.trim();
		if (!name || name.length > 120)
			throw new ORPCError("BAD_REQUEST", {
				message: "Der Vereinsname muss 1 bis 120 Zeichen enthalten",
			});
		await tx.execute(
			sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
		);
		await tx.update(tenants).set({ name }).where(eq(tenants.id, tenant.id));
		const [settings] = await tx
			.update(appSettings)
			.set({
				vereinsname: name,
				verein_updated_at: new Date(),
				updated_at: new Date(),
			})
			.where(and(eq(appSettings.tenant_id, tenant.id), eq(appSettings.id, 1)))
			.returning({ id: appSettings.id });
		if (!settings)
			throw new ORPCError("CONFLICT", {
				message:
					"Die Vereinseinstellungen sind unvollständig. Bitte den Betreiber kontaktieren",
			});
		await recordAuditEventStrict(tx, {
			category: "settings",
			action: "settings.tenant_renamed",
			actor,
			request,
			subject: { type: "tenant", id: tenant.id, label: name },
			metadata: { previous_name: tenant.name, name },
		});
		return tenantMetadata({ ...tenant, name });
	});
}

export async function listOperatorMembers(tenantId: string, actor: Actor) {
	await assertPlatformAdmin(actor.id);
	const tenant = await targetTenant(globalDb, tenantId);
	const members = await globalDb
		.select({
			id: userTable.id,
			email: userTable.email,
			name: userTable.name,
			role: memberships.role,
			banned: sql<boolean>`${memberships.banned} OR ${userTable.banned} is true`,
			globalBanned: sql<boolean>`${userTable.banned} is true`,
			notifyProtokoll: memberships.notify_protokoll,
			createdAt: memberships.created_at,
		})
		.from(memberships)
		.innerJoin(userTable, eq(userTable.id, memberships.user_id))
		.where(eq(memberships.tenant_id, tenant.id))
		.orderBy(asc(userTable.name));
	return { tenant: tenantMetadata(tenant), members };
}

export async function listOperatorInvites(tenantId: string, actor: Actor) {
	await assertPlatformAdmin(actor.id);
	await targetTenant(globalDb, tenantId);
	// An already-created invitation token is a capability, not ordinary metadata.
	return globalDb
		.select({
			id: invitations.id,
			tenant_id: invitations.tenant_id,
			email: invitations.email,
			role: invitations.role,
			invited_by: invitations.invited_by,
			expires_at: invitations.expires_at,
			accepted_at: invitations.accepted_at,
			created_at: invitations.created_at,
		})
		.from(invitations)
		.where(eq(invitations.tenant_id, tenantId))
		.orderBy(desc(invitations.created_at));
}

export async function inviteOperatorMember(
	input: {
		tenantId: string;
		email: string;
		role: ClubRole;
		sendEmail?: boolean;
	},
	actor: Actor,
	request?: RequestAudit,
) {
	const created = await globalDb.transaction(async (tx) => {
		await assertPlatformAdminInTransaction(tx, actor.id);
		const tenant = await targetTenant(tx, input.tenantId);
		const baseUrl = tenantPublicBaseUrl(tenant);
		// A generated capability must lead to the invited club's approved origin.
		if (!baseUrl || tenantSlugForHost(new URL(baseUrl).host) !== tenant.slug)
			throw new ORPCError("CONFLICT", {
				message:
					"Für diesen Verein ist noch keine Anmeldeadresse freigeschaltet",
			});
		const invite = await createInviteInTransaction(tx, tenant.id, {
			email: input.email,
			role: input.role,
			invitedBy: actor.email,
			audit: {
				actor,
				request,
				metadata: { operator: true, emailRequested: input.sendEmail === true },
			},
		});
		return {
			tenant,
			invite: { ...invite, inviteUrl: `${baseUrl}/invite/${invite.token}` },
		};
	});
	// The authorized invitation commits before any external delivery. A repeat
	// creation hits the existing active-invite conflict before reaching SMTP.
	// This narrow scope reads the invited club's transport internally; it never
	// gives the operator membership, financial access or SMTP settings in a response.
	const emailStatus =
		input.sendEmail === true
			? await withTenant(created.tenant, () =>
					sendInvitationEmail({
						to: created.invite.email,
						inviteUrl: created.invite.inviteUrl,
						role: created.invite.role,
						invitedBy: created.invite.invited_by,
					}),
				)
			: ("skipped" as const);
	return {
		...created.invite,
		sendEmail: input.sendEmail === true,
		email_status: emailStatus,
	};
}

export async function revokeOperatorInvite(
	input: { tenantId: string; id: string },
	actor: Actor,
	request?: RequestAudit,
) {
	return globalDb.transaction(async (tx) => {
		await assertPlatformAdminInTransaction(tx, actor.id);
		const tenant = await targetTenant(tx, input.tenantId);
		await tx.execute(
			sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
		);
		const [invite] = await tx
			.delete(invitations)
			.where(
				and(
					eq(invitations.tenant_id, tenant.id),
					eq(invitations.id, input.id),
					isNull(invitations.accepted_at),
				),
			)
			.returning({ email: invitations.email });
		if (!invite)
			throw new ORPCError("NOT_FOUND", {
				message: "Einladung nicht gefunden oder bereits angenommen",
			});
		await recordAuditEventStrict(tx, {
			category: "users",
			action: "users.invite_revoked",
			actor,
			request,
			subject: { type: "invite", id: input.id, label: invite.email },
			metadata: { operator: true },
		});
		return { ok: true as const };
	});
}

export async function setOperatorMemberRole(
	input: { tenantId: string; id: string; role: ClubRole },
	actor: Actor,
	request?: RequestAudit,
) {
	// The shared mutation rechecks operator authorization in its write transaction
	// and retains the same last-admin, self-protection and audited updates.
	await assertPlatformAdmin(actor.id);
	const tenant = await targetTenant(globalDb, input.tenantId);
	return changeTenantMember({
		id: input.id,
		role: input.role,
		actor,
		audit: request,
		operatorTenant: tenant,
	});
}

export async function setOperatorMemberBanned(
	input: { tenantId: string; id: string; banned: boolean },
	actor: Actor,
	request?: RequestAudit,
) {
	await assertPlatformAdmin(actor.id);
	const tenant = await targetTenant(globalDb, input.tenantId);
	return changeTenantMember({
		id: input.id,
		banned: input.banned,
		actor,
		audit: request,
		operatorTenant: tenant,
	});
}
