import { redirect } from "@tanstack/react-router";
import {
	firstClubPath,
	hasPermission,
	type Permission,
} from "@/lib/permissions";

/** Stop a denied deep link before its loader requests restricted data. */
export function requireClubPermission(
	subject: { permissions?: readonly string[] },
	...anyOf: Permission[]
): void {
	if (!anyOf.some((permission) => hasPermission(subject, permission)))
		throw redirect({ to: firstClubPath(subject) });
}
