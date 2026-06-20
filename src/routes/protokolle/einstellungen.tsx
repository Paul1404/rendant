import { createFileRoute } from "@tanstack/react-router";
import { Hash, Receipt, Users, Wallet } from "lucide-react";
import { BelegnummerSettingsForm } from "@/components/belegnummer-settings-form";
import { CashRegistersForm } from "@/components/cash-registers-form";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/skeletons";
import { SectionHeading } from "@/components/ui/section";
import { UmsatzUstBasisForm } from "@/components/umsatz-ust-basis-form";
import { UserManagement } from "@/components/user-management";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/protokolle/einstellungen")({
	loader: async ({ context }) => {
		const isAdmin = context.user.role === "admin";
		const [belegnummer, basis, registers, admin] = await Promise.all([
			orpcClient.settings.getBelegnummer(),
			orpcClient.settings.getUmsatzUstBasis(),
			orpcClient.registers.list(),
			isAdmin
				? Promise.all([orpcClient.users.list(), orpcClient.invites.list()])
				: Promise.resolve(null),
		]);
		return {
			settings: belegnummer.settings,
			preview: belegnummer.preview,
			umsatzUstBasis: basis.umsatz_ust_basis,
			registers,
			admin: admin ? { users: admin[0], invites: admin[1] } : null,
		};
	},
	head: () => ({ meta: [{ title: "Einstellungen · SVUFO" }] }),
	pendingComponent: SettingsSkeleton,
	component: EinstellungenPage,
});

function EinstellungenPage() {
	const { settings, preview, umsatzUstBasis, registers, admin } =
		Route.useLoaderData();

	return (
		<div className="space-y-10">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Einstellungen"
				description="Vorlagen und Standardwerte für die Kassenzählprotokolle: Kassen, Belegnummer-Format und USt.-Aufteilung."
			/>

			<section className="mx-auto max-w-3xl space-y-4">
				<SectionHeading
					icon={Wallet}
					title="Kassen"
					description="Vorlagen für Kassennummer, Kassenbezeichnung und Anfangsbestand (Wechselgeld). Beim Erfassen eines Protokolls lassen sich diese Werte mit einem Klick übernehmen."
				/>
				<CashRegistersForm initial={registers} />
			</section>

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
