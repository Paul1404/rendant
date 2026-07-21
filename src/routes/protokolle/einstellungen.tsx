import { createFileRoute } from "@tanstack/react-router";
import {
	Bell,
	Building2,
	CalendarRange,
	Hash,
	Mail,
	Receipt,
	Users,
	Wallet,
} from "lucide-react";
import { AnlassCatalogForm } from "@/components/anlass-catalog-form";
import { BelegnummerSettingsForm } from "@/components/belegnummer-settings-form";
import { CashRegistersForm } from "@/components/cash-registers-form";
import { EmailSettingsForm } from "@/components/email-settings-form";
import { NotificationPrefForm } from "@/components/notification-pref-form";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/skeletons";
import { SectionHeading } from "@/components/ui/section";
import { UmsatzUstBasisForm } from "@/components/umsatz-ust-basis-form";
import { UserManagement } from "@/components/user-management";
import { VereinSettingsForm } from "@/components/verein-settings-form";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/protokolle/einstellungen")({
	loader: async ({ context }) => {
		const isAdmin = context.user.role === "admin";
		const [
			belegnummer,
			basis,
			verein,
			registers,
			anlass,
			admin,
			email,
			notify,
		] = await Promise.all([
			orpcClient.settings.getBelegnummer(),
			orpcClient.settings.getUmsatzUstBasis(),
			orpcClient.settings.getVerein(),
			orpcClient.registers.list(),
			orpcClient.anlassKatalog.list(),
			isAdmin
				? Promise.all([orpcClient.users.list(), orpcClient.invites.list()])
				: Promise.resolve(null),
			isAdmin ? orpcClient.settings.getEmail() : Promise.resolve(null),
			orpcClient.profile.getNotify(),
		]);
		return {
			settings: belegnummer.settings,
			preview: belegnummer.preview,
			umsatzUstBasis: basis.umsatz_ust_basis,
			verein,
			registers,
			anlassKatalog: anlass,
			admin: admin ? { users: admin[0], invites: admin[1] } : null,
			email,
			notifyProtokoll: notify.notify,
		};
	},
	head: () => ({ meta: [{ title: "Einstellungen · SVUFO" }] }),
	pendingComponent: SettingsSkeleton,
	component: EinstellungenPage,
});

function EinstellungenPage() {
	const {
		settings,
		preview,
		umsatzUstBasis,
		verein,
		registers,
		anlassKatalog,
		admin,
		email,
		notifyProtokoll,
	} = Route.useLoaderData();

	return (
		<div className="space-y-10">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Einstellungen"
				description="Vorlagen und Standardwerte für die Kassenzählprotokolle: Kassen, Belegnummer-Format und USt.-Aufteilung."
			/>

			{admin ? (
				<section className="mx-auto max-w-3xl space-y-4">
					<SectionHeading
						icon={Building2}
						title="Verein"
						description="Stammdaten des Vereins, für den diese SVUFO-Instanz läuft. Der Name erscheint dezent in der App; Anschrift, Vorstand und Registereintrag stehen in der Fußzeile der PDF-Protokolle. Nur für Admins."
					/>
					<VereinSettingsForm initial={verein} />
				</section>
			) : null}

			<section className="mx-auto max-w-3xl space-y-4">
				<SectionHeading
					icon={Wallet}
					title="Kassen"
					description="Vorlagen für Kassennummer, Kassenbezeichnung und Anfangsbestand (Wechselgeld). Beim Erfassen eines Protokolls lassen sich diese Werte mit einem Klick übernehmen."
				/>
				<CashRegistersForm initial={registers} />
			</section>

			{admin ? (
				<section className="mx-auto max-w-3xl space-y-4">
					<SectionHeading
						icon={CalendarRange}
						title="Anlässe"
						description="Fester Katalog der Vereins-Anlässe. Beim Erfassen wird der Anlass daraus gewählt statt frei getippt, damit der Jahresvergleich über die Jahre zusammenpasst. Wiederkehrende Anlässe (z. B. Biergarten) werden pro Saison zusammengefasst, einmalige (z. B. Sommerfest) Jahr für Jahr verglichen. Nur für Admins."
					/>
					<AnlassCatalogForm initial={anlassKatalog} />
				</section>
			) : null}

			<section className="mx-auto max-w-3xl space-y-4">
				<SectionHeading
					icon={Hash}
					title="Belegnummer-Format"
					description="Aussehen der Belegnummer für neue Protokolle. Wir empfehlen, das Format während eines Geschäftsjahres nicht mehr zu ändern. Das Finanzamt verlangt sonst eine Begründung für einen Formatwechsel mitten im Jahr."
				/>
				<BelegnummerSettingsForm initial={settings} serverPreview={preview} />
			</section>

			<section className="mx-auto max-w-3xl space-y-4">
				<SectionHeading
					icon={Receipt}
					title="USt.-Aufteilung"
					description="Standard, ob die Aufteilung des Umsatzes nach USt.-Sätzen auf die Tageseinnahmen vor oder nach Kartenzahlung bezogen wird."
				/>
				<UmsatzUstBasisForm initial={umsatzUstBasis} />
			</section>

			<section className="mx-auto max-w-3xl space-y-4">
				<SectionHeading
					icon={Bell}
					title="Meine Benachrichtigungen"
					description="Stelle ein, ob du selbst eine Info-E-Mail erhältst, sobald ein neues Kassenzählprotokoll erfasst wurde."
				/>
				<NotificationPrefForm initial={notifyProtokoll} />
			</section>

			{email ? (
				<section className="mx-auto max-w-3xl space-y-4">
					<SectionHeading
						icon={Mail}
						title="E-Mail-Benachrichtigungen"
						description="SMTP-Zugang und zusätzliche externe Empfänger für eine kurze Info-E-Mail bei jedem neuen Kassenzählprotokoll. Nur für Admins."
					/>
					<EmailSettingsForm initial={email} />
				</section>
			) : null}

			{admin ? (
				<section className="mx-auto max-w-3xl space-y-4">
					<SectionHeading
						icon={Users}
						title="Benutzer & Einladungen"
						description="Lade weitere Personen ein und verwalte bestehende Konten. Nur für Admins sichtbar."
					/>
					<UserManagement users={admin.users} invites={admin.invites} />
				</section>
			) : null}
		</div>
	);
}
