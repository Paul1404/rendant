import { createFileRoute } from "@tanstack/react-router";
import { BelegnummerSettingsForm } from "@/components/belegnummer-settings-form";
import { CashRegistersForm } from "@/components/cash-registers-form";
import { PageHeader } from "@/components/page-header";
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
	component: EinstellungenPage,
});

function SectionHeading({
	title,
	description,
}: {
	title: string;
	description: React.ReactNode;
}) {
	return (
		<div className="mx-auto max-w-3xl">
			<h2 className="text-lg font-semibold tracking-tight text-foreground">
				{title}
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">{description}</p>
		</div>
	);
}

function EinstellungenPage() {
	const { settings, preview, umsatzUstBasis, registers, admin } =
		Route.useLoaderData();

	return (
		<div className="space-y-10">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Einstellungen"
				description="Vorlagen und Standardwerte für die Kassenzählprotokolle – Kassen, Belegnummer-Format und USt.-Aufteilung."
			/>

			<section className="space-y-4">
				<SectionHeading
					title="Kassen"
					description="Vorlagen für Kassennummer, Kassenbezeichnung und Anfangsbestand (Wechselgeld). Beim Erfassen eines Protokolls lassen sich diese Werte mit einem Klick übernehmen."
				/>
				<div className="mx-auto max-w-3xl">
					<CashRegistersForm initial={registers} />
				</div>
			</section>

			<section className="space-y-4">
				<SectionHeading
					title="Belegnummer-Format"
					description="Aussehen der Belegnummer für neue Protokolle. Wir empfehlen, das Format während eines Geschäftsjahres nicht mehr zu ändern – das Finanzamt verlangt eine Begründung für Formatwechsel mitten im Jahr."
				/>
				<div className="mx-auto max-w-3xl">
					<BelegnummerSettingsForm initial={settings} serverPreview={preview} />
				</div>
			</section>

			<section className="space-y-4">
				<SectionHeading
					title="USt.-Aufteilung"
					description="Standard, ob die Aufteilung des Umsatzes nach USt.-Sätzen auf die Tageseinnahmen vor oder nach Kartenzahlung bezogen wird."
				/>
				<div className="mx-auto max-w-3xl">
					<UmsatzUstBasisForm initial={umsatzUstBasis} />
				</div>
			</section>

			{admin ? (
				<section className="space-y-4">
					<SectionHeading
						title="Benutzer & Einladungen"
						description="Lade weitere Personen ein und verwalte bestehende Konten. Nur für Admins sichtbar."
					/>
					<div className="mx-auto max-w-3xl">
						<UserManagement users={admin.users} invites={admin.invites} />
					</div>
				</section>
			) : null}
		</div>
	);
}
