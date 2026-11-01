import {
	ChartNoAxesColumnIncreasing,
	Download,
	HandHelping,
	List,
	type LucideIcon,
	Plus,
	Settings,
	ShieldCheck,
} from "lucide-react";
import { hasPermission, type Permission } from "@/lib/permissions";

export type AppNavHref =
	| "/protokolle"
	| "/protokolle/neu"
	| "/protokolle/umsaetze"
	| "/protokolle/helferstunden"
	| "/protokolle/export"
	| "/protokolle/audit"
	| "/protokolle/einstellungen";

type AppNavItem = {
	href: AppNavHref;
	label: string;
	paletteLabel?: string;
	icon: LucideIcon;
	exact?: boolean;
	permissions?: readonly Permission[];
};

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
	{
		href: "/protokolle",
		permissions: ["finance.read"],
		label: "Protokolle",
		icon: List,
		exact: true,
	},
	{
		href: "/protokolle/helferstunden",
		permissions: ["helpers.read"],
		label: "Helferstunden",
		icon: HandHelping,
	},
	{
		href: "/protokolle/neu",
		permissions: ["protocols.create"],
		label: "Neu",
		paletteLabel: "Neues Protokoll",
		icon: Plus,
	},
	{
		href: "/protokolle/umsaetze",
		permissions: ["finance.read"],
		label: "Umsätze",
		icon: ChartNoAxesColumnIncreasing,
	},
	{
		href: "/protokolle/export",
		permissions: ["exports.download", "exports.archive", "imports.manage"],
		label: "Import & Export",
		icon: Download,
	},
	{
		href: "/protokolle/audit",
		permissions: ["audit.read"],
		label: "Audit-Log",
		icon: ShieldCheck,
	},
	{
		href: "/protokolle/einstellungen",
		label: "Einstellungen",
		icon: Settings,
	},
] as const;

export function visibleNavigation(subject: {
	permissions?: readonly string[];
}) {
	return APP_NAV_ITEMS.filter(
		(item) =>
			(item.href !== "/protokolle/export" || canOpenExportPage(subject)) &&
			(!item.permissions ||
				item.permissions.some((permission) =>
					hasPermission(subject, permission),
				)),
	);
}

export function canOpenExportPage(subject: {
	permissions?: readonly string[];
}) {
	return (
		hasPermission(subject, "imports.manage") ||
		hasPermission(subject, "exports.archive") ||
		(hasPermission(subject, "exports.download") &&
			hasPermission(subject, "finance.read"))
	);
}
