// Notification preferences belong to club memberships. An account can opt in
// for one club without receiving accounting mail from another club.
import { and, eq, sql } from "drizzle-orm";
import { globalDb } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { memberships } from "@/server/db/tenant-schema";
import { requireTenant } from "@/server/tenant-context";
import { type RecordAuditInput, recordAuditEventStrict } from "./audit";

export async function getUserNotifyPref(userId: string): Promise<boolean> {
	const [member] = await globalDb
		.select({ notify: memberships.notify_protokoll })
		.from(memberships)
		.where(
			and(
				eq(memberships.tenant_id, requireTenant().id),
				eq(memberships.user_id, userId),
			),
		)
		.limit(1);
	return member?.notify ?? false;
}

export async function setUserNotifyPref(
	userId: string,
	notify: boolean,
	audit: RecordAuditInput,
): Promise<boolean> {
	const tenant = requireTenant();
	return globalDb.transaction(async (tx) => {
		const [member] = await tx
			.update(memberships)
			.set({ notify_protokoll: notify, updated_at: new Date() })
			.where(
				and(
					eq(memberships.tenant_id, tenant.id),
					eq(memberships.user_id, userId),
				),
			)
			.returning({ id: memberships.user_id });
		if (!member) return false;
		const [user] = await tx
			.select({ email: userTable.email })
			.from(userTable)
			.where(eq(userTable.id, userId));
		await tx.execute(
			sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
		);
		await recordAuditEventStrict(tx, {
			...audit,
			subject: { type: "user", id: member.id, label: user?.email },
			metadata: { ...audit.metadata, notify },
		});
		return true;
	});
}

export async function listOptedInUserEmails(): Promise<string[]> {
	const rows = await globalDb
		.select({ email: userTable.email })
		.from(memberships)
		.innerJoin(userTable, eq(userTable.id, memberships.user_id))
		.where(
			and(
				eq(memberships.tenant_id, requireTenant().id),
				eq(memberships.notify_protokoll, true),
				eq(memberships.banned, false),
				sql`${userTable.banned} is not true`,
			),
		);
	return rows.map((row) => row.email);
}
