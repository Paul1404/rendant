import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
	ProtokollForm,
	type ProtokollInitialValues,
} from "@/components/protokoll-form";
import { NeuSkeleton } from "@/components/skeletons";
import { orpcClient } from "@/lib/orpc";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/protokolle/neu")({
	validateSearch: (
		search: Record<string, unknown>,
	): { duplicate?: string } => ({
		duplicate:
			typeof search.duplicate === "string" && UUID_RE.test(search.duplicate)
				? search.duplicate
				: undefined,
	}),
	loaderDeps: ({ search }) => ({ duplicate: search.duplicate }),
	loader: async ({ deps }) => {
		const [belegnummerRes, basisRes, registers] = await Promise.all([
			orpcClient.protokolle.nextBelegnummer(),
			orpcClient.settings.getUmsatzUstBasis(),
			orpcClient.registers.list(),
		]);

		let initialValues: ProtokollInitialValues | undefined;
		let duplicateBelegnummer: string | undefined;
		if (deps.duplicate) {
			try {
				const src = await orpcClient.protokolle.get({ id: deps.duplicate });
				duplicateBelegnummer = src.protokoll.belegnummer;
				initialValues = {
					kassennummer: src.protokoll.kassennummer || undefined,
					kassenbezeichnung: src.protokoll.kassenbezeichnung || undefined,
					anlass: src.protokoll.anlass || undefined,
					gezaehlt_von: src.protokoll.gezaehlt_von || undefined,
					geprueft_von: src.protokoll.geprueft_von || undefined,
					wechselgeld_cent: src.protokoll.wechselgeld_cent,
					umsatz_ust_basis: src.protokoll.umsatz_ust_basis,
				};
			} catch {
				// duplicate source no longer exists; fall back to a blank form
			}
		}

		return {
			belegnummer: belegnummerRes.belegnummer,
			umsatzUstBasisDefault: basisRes.umsatz_ust_basis,
			registers,
			initialValues,
			duplicateBelegnummer,
		};
	},
	head: () => ({ meta: [{ title: "Neues Protokoll · SVUFO" }] }),
	pendingComponent: NeuSkeleton,
	component: NewProtokollPage,
});

function NewProtokollPage() {
	const {
		belegnummer,
		umsatzUstBasisDefault,
		registers,
		initialValues,
		duplicateBelegnummer,
	} = Route.useLoaderData();

	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Neues Kassenzählprotokoll"
				description={
					<>
						Vorgeschlagene Belegnummer{" "}
						<span className="font-mono font-medium text-foreground">
							{belegnummer}
						</span>
						. Bei Bedarf anpassbar.
					</>
				}
			/>

			{duplicateBelegnummer ? (
				<div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
					<Wallet className="h-5 w-5 shrink-0 text-primary" />
					<div className="space-y-1">
						<p className="text-sm font-medium text-foreground">
							Kopfdaten aus Beleg{" "}
							<span className="font-mono">{duplicateBelegnummer}</span>{" "}
							übernommen
						</p>
						<p className="text-sm text-muted-foreground">
							Kassennummer, Kassenbezeichnung, Anlass, Wechselgeld und Namen
							sind vorausgefüllt. Stückelung, Ausgaben und USt.-Aufteilung bitte
							für diesen Tag neu erfassen.
						</p>
					</div>
				</div>
			) : null}

			{registers.length === 0 ? (
				<div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex gap-3">
						<Wallet className="h-5 w-5 shrink-0 text-muted-foreground" />
						<div className="space-y-1">
							<p className="text-sm font-medium text-foreground">
								Noch keine Kasse hinterlegt
							</p>
							<p className="text-sm text-muted-foreground">
								Lege deine Kassen einmalig an, um Kassennummer, Bezeichnung und
								Wechselgeld künftig mit einem Klick zu übernehmen.
							</p>
						</div>
					</div>
					<Link
						to="/protokolle/einstellungen"
						className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
					>
						<Settings className="h-3.5 w-3.5" />
						Einstellungen öffnen
					</Link>
				</div>
			) : null}

			<ProtokollForm
				belegnummerPreview={belegnummer}
				umsatzUstBasisDefault={umsatzUstBasisDefault}
				registers={registers}
				initialValues={initialValues}
			/>
		</div>
	);
}
