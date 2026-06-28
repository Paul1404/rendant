// Per-user opt-in for the "new protokoll" notification mail. The preference
// lives on the user table (notify_protokoll). Recipients of the FYI mail are the
// union of opted-in user accounts and the free-form address list kept by an
// admin under Einstellungen.

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";

export async function getUserNotifyPref(userId: string): Promise<boolean> {
	const rows = await db
		.select({ notify: userTable.notifyProtokoll })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);
	// Default to on for an unknown row, matching the column default.
	return rows[0]?.notify ?? true;
}

// Sets the preference for a user. Returns false when no such user exists.
export async function setUserNotifyPref(
	userId: string,
	notify: boolean,
): Promise<boolean> {
	const rows = await db
		.update(userTable)
		.set({ notifyProtokoll: notify })
		.where(eq(userTable.id, userId))
		.returning({ id: userTable.id });
	return rows.length > 0;
}

// E-mail addresses of every user who is opted in and not banned. Banned is a
// nullable boolean, so null counts as "not banned".
export async function listOptedInUserEmails(): Promise<string[]> {
	const rows = await db
		.select({ email: userTable.email })
		.from(userTable)
		.where(
			and(
				eq(userTable.notifyProtokoll, true),
				or(isNull(userTable.banned), ne(userTable.banned, true)),
			),
		);
	return rows.map((r) => r.email);
}
