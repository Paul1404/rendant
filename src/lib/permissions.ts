export const CLUB_ROLES = ["user", "admin", "board"] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];
export const ROLE_LABELS: Record<ClubRole, string> = {
	user: "Benutzer",
	admin: "Admin",
	board: "Vorstand",
};
export function roleLabel(role: string): string {
	return ROLE_LABELS[role as ClubRole] ?? "Unbekannte Rolle";
}
export const PERMISSION_CATALOG = [
	{
		key: "finance.read",
		label: "Buchhaltung und Belege ansehen",
		group: "Buchhaltung",
		requires: [],
	},
	{
		key: "protocols.create",
		label: "Kassenzählprotokolle buchen",
		group: "Buchhaltung",
		requires: ["finance.read"],
	},
	{
		key: "protocols.cancel",
		label: "Kassenzählprotokolle stornieren",
		group: "Buchhaltung",
		requires: ["finance.read"],
	},
	{
		key: "protocols.reclassify",
		label: "Umsatzbereiche berichtigen",
		group: "Buchhaltung",
		requires: ["finance.read"],
	},
	{
		key: "documents.regenerate",
		label: "Belegdateien erneut erzeugen",
		group: "Buchhaltung",
		requires: ["finance.read"],
	},
	{
		key: "revenues.manage",
		label: "Historische Umsätze erfassen und berichtigen",
		group: "Buchhaltung",
		requires: ["finance.read"],
	},
	{
		key: "imports.manage",
		label: "Daten importieren und Importe prüfen",
		group: "Daten",
		requires: ["finance.read", "helpers.read"],
	},
	{
		key: "exports.download",
		label: "Auswertungen und Listen exportieren",
		group: "Daten",
		requires: [],
	},
	{
		key: "exports.archive",
		label: "Vollständiges Geschäftsarchiv exportieren",
		group: "Daten",
		requires: ["finance.read", "helpers.read"],
	},
	{
		key: "helpers.read",
		label: "Helferstunden ansehen",
		group: "Helferstunden",
		requires: [],
	},
	{
		key: "helpers.write",
		label: "Helferstunden erfassen",
		group: "Helferstunden",
		requires: ["helpers.read"],
	},
	{
		key: "helpers.manage",
		label: "Helferstunden, Einkäufe und Kataloge verwalten",
		group: "Helferstunden",
		requires: ["helpers.read"],
	},
	{
		key: "registers.manage",
		label: "Kassen verwalten",
		group: "Vereinsverwaltung",
		requires: [],
	},
	{
		key: "occasions.manage",
		label: "Veranstaltungsanlässe verwalten",
		group: "Vereinsverwaltung",
		requires: [],
	},
	{
		key: "settings.manage",
		label: "Vereinsdaten und Buchungsvorgaben verwalten",
		group: "Vereinsverwaltung",
		requires: [],
	},
	{
		key: "integrations.manage",
		label: "E-Mail und Integrationen konfigurieren",
		group: "Vereinsverwaltung",
		requires: [],
	},
	{
		key: "datev.send",
		label: "Belege an DATEV übermitteln und Versand klären",
		group: "Buchhaltung",
		requires: ["finance.read"],
	},
	{
		key: "users.manage",
		label: "Mitglieder, Einladungen und Sperren verwalten",
		group: "Zugriffe",
		requires: [],
	},
	{
		key: "audit.read",
		label: "Änderungsprotokoll ansehen",
		group: "Daten",
		requires: ["finance.read"],
	},
] as const;
export type Permission = (typeof PERMISSION_CATALOG)[number]["key"];
export const PERMISSION_KEYS = PERMISSION_CATALOG.map((entry) => entry.key) as [
	Permission,
	...Permission[],
];
export type RolePolicy = Record<ClubRole, Permission[]>;
export const PROTECTED_ADMIN_PERMISSIONS: Permission[] = ["users.manage"];
export const DEFAULT_ROLE_PERMISSIONS: RolePolicy = {
	user: [
		"finance.read",
		"protocols.create",
		"exports.download",
		"helpers.read",
		"helpers.write",
	],
	admin: [...PERMISSION_KEYS],
	board: [...PERMISSION_KEYS],
};
export function isClubRole(role: unknown): role is ClubRole {
	return CLUB_ROLES.includes(role as ClubRole);
}
export function normalizeRolePolicy(value: unknown): RolePolicy {
	const policy =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Partial<Record<ClubRole, unknown>>)
			: {};
	return Object.fromEntries(
		CLUB_ROLES.map((role) => {
			const stored = policy[role];
			const granted =
				stored === undefined
					? DEFAULT_ROLE_PERMISSIONS[role]
					: Array.isArray(stored)
						? stored.filter((key): key is Permission =>
								PERMISSION_KEYS.includes(key as Permission),
							)
						: [];
			const permissions = new Set<Permission>([
				...granted,
				...(role === "admin" ? PROTECTED_ADMIN_PERMISSIONS : []),
			]);
			// A write grant without its required read scope must never expose data.
			for (const entry of PERMISSION_CATALOG) {
				if (entry.requires.some((key) => !permissions.has(key)))
					permissions.delete(entry.key);
			}
			return [role, PERMISSION_KEYS.filter((key) => permissions.has(key))];
		}),
	) as RolePolicy;
}
export function hasPermission(
	subject: { permissions?: readonly string[] } | null | undefined,
	permission: Permission,
): boolean {
	return subject?.permissions?.includes(permission) === true;
}
export function hasEveryPermission(
	subject: { permissions?: readonly string[] } | null | undefined,
	...permissions: Permission[]
): boolean {
	return permissions.every((permission) => hasPermission(subject, permission));
}
export function firstClubPath(subject: {
	permissions?: readonly string[];
}): "/protokolle" | "/protokolle/helferstunden" | "/protokolle/einstellungen" {
	if (hasPermission(subject, "finance.read")) return "/protokolle";
	if (hasPermission(subject, "helpers.read"))
		return "/protokolle/helferstunden";
	return "/protokolle/einstellungen";
}
