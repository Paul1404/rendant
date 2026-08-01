import { createFileRoute } from "@tanstack/react-router";
import {
	Bell,
	Building2,
	Hash,
	Mail,
	Receipt,
	Users,
	Wallet,
} from "lucide-react";
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
		const [belegnummer, basis, verein, registers, admin, email, notify] =
			await Promise.all([
				orpcClient.settings.getBelegnummer(),
				orpcClient.settings.getUmsatzUstBasis(),
				orpcClient.settings.getVerein(),
				orpcClient.registers.list(),
				isAdmin
					? Promise.all([orpcClient.users.list(), orpcClient.invites.list()])
					: Promise.resolve(null),
				isAdmin ? orpcClient.settings.getEmail() : Promise.resolve(null),
				orpcClient.profile.getNotify(),
			]);
		return {
			currentUserId: context.user.id,
			settings: belegnummer.settings,
			preview: belegnummer.preview,
			umsatzUstBasis: basis.umsatz_ust_basis,
			verein,
			registers,
			admin: admin ? { users: admin[0], invites: admin[1] } : null,
			email,
			notifyProtokoll: notify.notify,
		};
	},
	head: () => ({ meta: [{ title: "Einstellungen · Rendant" }] }),
	pendingComponent: SettingsSkeleton,
	component: EinstellungenPage,
});

function EinstellungenPage() {
	const {
		currentUserId,
		settings,
		preview,
		umsatzUstBasis,
		verein,
		registers,
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
						description="Stammdaten des Vereins, für den diese Rendant-Instanz läuft. Der Name erscheint dezent in der App; Anschrift, Vorstand und Registereintrag stehen in der Fußzeile der PDF-Protokolle. Nur für Admins."
					/>
					<VereinSettingsForm initial={verein} />
				</section>
			) : null}

			{admin ? (
				<section className="mx-auto max-w-3xl space-y-4">
					<SectionHeading
						icon={Wallet}
						title="Kassen"
						description="Vorlagen für Kassennummer, Kassenbezeichnung und Anfangsbestand (Wechselgeld). Beim Erfassen eines Protokolls lassen sich diese Werte mit einem Klick übernehmen. Nur für Admins."
					/>
					<CashRegistersForm initial={registers} />
				</section>
			) : null}

			{admin ? (
				<>
					<section className="mx-auto max-w-3xl space-y-4">
						<SectionHeading
							icon={Hash}
							title="Belegnummer-Format"
							description="Aussehen der Belegnummer für neue Protokolle. Wir empfehlen, das Format während eines Geschäftsjahres nicht mehr zu ändern. Das Finanzamt verlangt sonst eine Begründung für einen Formatwechsel mitten im Jahr. Nur für Admins."
						/>
						<BelegnummerSettingsForm
							initial={settings}
							serverPreview={preview}
						/>
					</section>

					<section className="mx-auto max-w-3xl space-y-4">
						<SectionHeading
							icon={Receipt}
							title="USt.-Aufteilung"
							description="Standard, ob die Aufteilung des Umsatzes nach USt.-Sätzen auf die Tageseinnahmen vor oder nach Kartenzahlung bezogen wird. Nur für Admins."
						/>
						<UmsatzUstBasisForm initial={umsatzUstBasis} />
					</section>
				</>
			) : null}

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
					<UserManagement
						users={admin.users}
						invites={admin.invites}
						currentUserId={currentUserId}
					/>
				</section>
			) : null}
		</div>
	);
}
