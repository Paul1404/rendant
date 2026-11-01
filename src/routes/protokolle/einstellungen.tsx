import { createFileRoute } from "@tanstack/react-router";
import {
	Bell,
	Building2,
	CreditCard,
	HandHeart,
	Hash,
	Mail,
	Network,
	Receipt,
	Users,
	Wallet,
} from "lucide-react";
import { AnlassCatalogForm } from "@/components/anlass-catalog-form";
import { BelegnummerSettingsForm } from "@/components/belegnummer-settings-form";
import { CashRegistersForm } from "@/components/cash-registers-form";
import { DatevSettingsForm } from "@/components/datev-settings-form";
import { EmailSettingsForm } from "@/components/email-settings-form";
import {
	HelperHourCategoriesForm,
	HelperHourNameVariantsForm,
	HelperHourNoteRulesForm,
} from "@/components/helper-hour-categories-form";
import { McpSettingsPanel } from "@/components/mcp-settings-panel";
import { NotificationPrefForm } from "@/components/notification-pref-form";
import { PageHeader } from "@/components/page-header";
import { RolePermissionsForm } from "@/components/role-permissions-form";
import { SettingsSkeleton } from "@/components/skeletons";
import { SumupSettingsForm } from "@/components/sumup-settings-form";
import { SectionHeading } from "@/components/ui/section";
import { UmsatzUstBasisForm } from "@/components/umsatz-ust-basis-form";
import { UserManagement } from "@/components/user-management";
import { VereinSettingsForm } from "@/components/verein-settings-form";
import { orpcClient } from "@/lib/orpc";
import { hasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/protokolle/einstellungen")({
	loader: async ({ context }) => {
		const user = context.user;
		const canSettings = hasPermission(user, "settings.manage");
		const canIntegrations = hasPermission(user, "integrations.manage");
		const canHelpers = hasPermission(user, "helpers.manage");
		const [
			bookkeeping,
			registers,
			admin,
			email,
			mcp,
			notify,
			sumup,
			helperHourValue,
			datev,
			occasions,
		] = await Promise.all([
			canSettings
				? Promise.all([
						orpcClient.settings.getBelegnummer(),
						orpcClient.settings.getUmsatzUstBasis(),
						orpcClient.settings.getVerein(),
					]).then(([belegnummer, basis, verein]) => ({
						belegnummer,
						basis,
						verein,
					}))
				: null,
			hasPermission(user, "registers.manage")
				? orpcClient.registers.list()
				: null,
			hasPermission(user, "users.manage")
				? Promise.all([
						orpcClient.users.list(),
						orpcClient.invites.list(),
					]).then(([users, invites]) => ({ users, invites }))
				: null,
			canIntegrations ? orpcClient.settings.getEmail() : null,
			canIntegrations ? orpcClient.settings.getMcp() : null,
			orpcClient.profile.getNotify(),
			canIntegrations ? orpcClient.settings.getSumup() : null,
			canSettings || canHelpers
				? orpcClient.settings.getHelperHourValue()
				: null,
			canIntegrations ? orpcClient.settings.getDatev() : null,
			hasPermission(user, "occasions.manage")
				? orpcClient.anlassKatalog.list()
				: null,
		]);
		return {
			currentUserId: user.id,
			bookkeeping,
			registers,
			admin,
			email,
			mcp,
			sumup,
			helperHourValue,
			datev,
			occasions,
			notifyProtokoll: notify.notify,
		};
	},
	head: () => ({ meta: [{ title: "Einstellungen · Rendant" }] }),
	pendingComponent: SettingsSkeleton,
	component: EinstellungenPage,
});

function EinstellungenPage() {
	const { user } = Route.useRouteContext();
	const {
		currentUserId,
		bookkeeping,
		registers,
		admin,
		email,
		mcp,
		sumup,
		helperHourValue,
		datev,
		occasions,
		notifyProtokoll,
	} = Route.useLoaderData();
	const canHelpers = hasPermission(user, "helpers.manage");
	return (
		<div className="space-y-10">
			<PageHeader
				eyebrow="Vereinsverwaltung"
				title="Einstellungen"
				description="Vereinsdaten, Vorlagen, Zugänge und deine persönlichen Benachrichtigungen."
			/>
			<nav
				aria-label="Einstellungsbereiche"
				className="mx-auto flex max-w-3xl flex-wrap gap-2"
			>
				{bookkeeping && (
					<>
						<SettingsLink href="#verein">Verein</SettingsLink>
						<SettingsLink href="#buchhaltung">Buchhaltung</SettingsLink>
					</>
				)}
				{registers && <SettingsLink href="#kassen">Kassen</SettingsLink>}
				{occasions && (
					<SettingsLink href="#anlaesse">Veranstaltungsanlässe</SettingsLink>
				)}
				{helperHourValue && (
					<SettingsLink href="#helferstunden">Helferstunden</SettingsLink>
				)}
				{sumup && <SettingsLink href="#sumup">SumUp</SettingsLink>}
				{datev && <SettingsLink href="#datev">DATEV</SettingsLink>}
				{mcp && (
					<SettingsLink href="#mcp">MCP &amp; Automatisierung</SettingsLink>
				)}
				{hasPermission(user, "roles.manage") && (
					<SettingsLink href="#rollen">Rollen und Rechte</SettingsLink>
				)}
				{admin && <SettingsLink href="#benutzer">Benutzer</SettingsLink>}
				<SettingsLink href="#benachrichtigungen">
					Meine Benachrichtigungen
				</SettingsLink>
			</nav>
			{bookkeeping && (
				<>
					<section
						id="verein"
						className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
					>
						<SectionHeading
							icon={Building2}
							title="Verein"
							description="Stammdaten für die App und neue PDF-Protokolle. Bereits gespeicherte Belege bleiben unverändert."
						/>
						<VereinSettingsForm initial={bookkeeping.verein} />
					</section>
					<section
						id="buchhaltung"
						className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
					>
						<SectionHeading
							icon={Hash}
							title="Belegnummer-Format"
							description="Aussehen der Belegnummer für neue Protokolle. Ein Formatwechsel innerhalb eines Geschäftsjahres sollte begründet werden."
						/>
						<BelegnummerSettingsForm
							initial={bookkeeping.belegnummer.settings}
							serverPreview={bookkeeping.belegnummer.preview}
							initialUpdatedAt={bookkeeping.belegnummer.updated_at}
						/>
					</section>
					<section className="mx-auto max-w-3xl space-y-4">
						<SectionHeading
							icon={Receipt}
							title="USt.-Aufteilung"
							description="Standard für die Aufteilung des Umsatzes nach USt.-Sätzen vor oder nach Kartenzahlung."
						/>
						<UmsatzUstBasisForm
							initial={bookkeeping.basis.umsatz_ust_basis}
							initialUpdatedAt={bookkeeping.basis.updated_at}
						/>
					</section>
				</>
			)}
			{registers && (
				<section
					id="kassen"
					className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
				>
					<SectionHeading
						icon={Wallet}
						title="Kassen"
						description="Vorlagen für Kassennummer, Kassenbezeichnung und Wechselgeld."
					/>
					<CashRegistersForm initial={registers} />
				</section>
			)}
			{occasions && (
				<section
					id="anlaesse"
					className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
				>
					<SectionHeading
						icon={Receipt}
						title="Veranstaltungsanlässe"
						description="Wiederkehrende und einmalige Anlässe für die Zuordnung von Einnahmen."
					/>
					<AnlassCatalogForm initial={occasions} />
				</section>
			)}
			{helperHourValue && (
				<section
					id="helferstunden"
					className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
				>
					<SectionHeading
						icon={HandHeart}
						title="Helferstunden"
						description="Stundenwert und Zuordnungen für die Vereinsarbeit."
					/>
					<HelperHourCategoriesForm
						valueCent={helperHourValue.wert_cent}
						valueUpdatedAt={helperHourValue.updated_at}
						canManageCategories={canHelpers}
						canManageValue={hasPermission(user, "settings.manage")}
					/>
					{canHelpers && (
						<>
							<HelperHourNoteRulesForm />
							<HelperHourNameVariantsForm />
						</>
					)}
				</section>
			)}
			<section id="benachrichtigungen" className="mx-auto max-w-3xl space-y-4">
				<SectionHeading
					icon={Bell}
					title="Meine Benachrichtigungen"
					description="Stelle ein, ob du selbst eine Info-E-Mail zu neuen Kassenzählprotokollen erhältst."
				/>
				<NotificationPrefForm initial={notifyProtokoll} />
			</section>
			{email && (
				<section className="mx-auto max-w-3xl space-y-4">
					<SectionHeading
						icon={Mail}
						title="E-Mail-Benachrichtigungen"
						description="SMTP-Zugang und zusätzliche Empfänger für neue Kassenzählprotokolle."
					/>
					<EmailSettingsForm initial={email} />
				</section>
			)}
			{datev && (
				<section
					id="datev"
					className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
				>
					<SectionHeading
						icon={Receipt}
						title="DATEV Kassenbelege"
						description="Versand der Protokoll- und Stornobelege über DATEV Upload Mail konfigurieren."
					/>
					<DatevSettingsForm initial={datev} />
				</section>
			)}
			{sumup && (
				<section
					id="sumup"
					className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
				>
					<SectionHeading
						icon={CreditCard}
						title="Kartenzahlung über SumUp"
						description="SumUp-Konto für den Abruf der Kartenumsätze verbinden."
					/>
					<SumupSettingsForm
						initial={sumup}
						canTest={hasPermission(user, "finance.read")}
					/>
				</section>
			)}
			{mcp && (
				<section id="mcp" className="mx-auto max-w-3xl scroll-mt-28 space-y-4">
					<SectionHeading
						icon={Network}
						title="MCP & Automatisierung"
						description="Status und Sicherheitsgrenze für vertrauenswürdige Assistenten."
					/>
					<McpSettingsPanel status={mcp} />
				</section>
			)}
			{hasPermission(user, "roles.manage") && (
				<section
					id="rollen"
					className="mx-auto max-w-6xl scroll-mt-28 space-y-4"
				>
					<SectionHeading
						icon={Users}
						title="Rollen und Berechtigungen"
						description="Rechte von Benutzer, Admin und Vorstand für diesen Verein anpassen."
					/>
					<RolePermissionsForm />
				</section>
			)}
			{admin && (
				<section
					id="benutzer"
					className="mx-auto max-w-3xl scroll-mt-28 space-y-4"
				>
					<SectionHeading
						icon={Users}
						title="Benutzer & Einladungen"
						description="Lade weitere Personen ein und verwalte die Zugänge zu diesem Verein."
					/>
					<UserManagement
						canManageRoles={hasPermission(user, "roles.manage")}
						canAssignAdmin={user.role === "admin"}
						users={admin.users}
						invites={admin.invites}
						currentUserId={currentUserId}
					/>
				</section>
			)}
		</div>
	);
}

function SettingsLink({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
		>
			{children}
		</a>
	);
}
