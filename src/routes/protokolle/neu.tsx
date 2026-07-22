import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
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
	loader: async ({ context, deps }) => {
		const [belegnummerRes, basisRes, registers, anlassKatalog] =
			await Promise.all([
				orpcClient.protokolle.nextBelegnummer(),
				orpcClient.settings.getUmsatzUstBasis(),
				orpcClient.registers.list(),
				orpcClient.anlassKatalog.list(),
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
					anlass_katalog_id: src.protokoll.anlass_katalog_id ?? null,
					veranstaltungsbezeichnung: (() => {
						const separatorIndex = src.protokoll.anlass.indexOf(" · ");
						return separatorIndex >= 0
							? src.protokoll.anlass.slice(separatorIndex + 3)
							: src.protokoll.anlass;
					})(),
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
			anlassKatalog,
			initialValues,
			duplicateBelegnummer,
			canManageAnlassKatalog: context.user.role === "admin",
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
		anlassKatalog,
		initialValues,
		duplicateBelegnummer,
		canManageAnlassKatalog,
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
							Kassennummer, Kassenbezeichnung, Umsatzgruppe,
							Veranstaltungsbezeichnung, Wechselgeld und Namen sind
							vorausgefüllt. Stückelung, Ausgaben und USt.-Aufteilung bitte für
							diesen Tag neu erfassen.
						</p>
					</div>
				</div>
			) : null}

			<ProtokollForm
				belegnummerPreview={belegnummer}
				umsatzUstBasisDefault={umsatzUstBasisDefault}
				registers={registers}
				anlassKatalog={anlassKatalog}
				canManageAnlassKatalog={canManageAnlassKatalog}
				canManageRegisters={canManageAnlassKatalog}
				initialValues={initialValues}
			/>
		</div>
	);
}
