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
	adminOnly?: boolean;
};

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
	{
		href: "/protokolle",
		label: "Protokolle",
		icon: List,
		exact: true,
	},
	{
		href: "/protokolle/helferstunden",
		label: "Helferstunden",
		icon: HandHelping,
	},
	{
		href: "/protokolle/neu",
		label: "Neu",
		paletteLabel: "Neues Protokoll",
		icon: Plus,
	},
	{
		href: "/protokolle/umsaetze",
		label: "Umsätze",
		icon: ChartNoAxesColumnIncreasing,
	},
	{
		href: "/protokolle/export",
		label: "Import & Export",
		icon: Download,
	},
	{
		href: "/protokolle/audit",
		label: "Audit-Log",
		icon: ShieldCheck,
		adminOnly: true,
	},
	{
		href: "/protokolle/einstellungen",
		label: "Einstellungen",
		icon: Settings,
	},
] as const;
