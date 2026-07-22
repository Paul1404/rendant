import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { groupByMonth } from "@/lib/dashboard-stats";
import { formatDateDe } from "@/lib/date";
import type { ProtokollRow } from "@/lib/protokoll-types";
import { cn } from "@/lib/utils";

function StatusPill({ storniert }: { storniert: boolean }) {
	if (storniert) {
		return <Badge variant="destructive">storniert</Badge>;
	}
	return (
		<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-success/10 px-2 text-xs font-medium leading-none text-success">
			<span className="h-1.5 w-1.5 rounded-full bg-success" />
			aktiv
		</span>
	);
}

function HeuteBadge() {
	return (
		<Badge
			variant="outline"
			className="h-4 border-primary/30 px-1.5 text-[10px] font-medium text-primary"
		>
			heute
		</Badge>
	);
}

type Props = {
	items: ProtokollRow[];
};

export function ProtokollList({ items }: Props) {
	const groups = groupByMonth(items);
	const today = new Date();
	const todayKey = formatDateDe(today);

	return (
		<>
			<div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm md:block">
				<Table>
					<TableHeader className="bg-muted/40">
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-[140px] text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
								Belegnummer
							</TableHead>
							<TableHead className="w-[120px] text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
								Datum
							</TableHead>
							<TableHead className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
								Veranstaltung
							</TableHead>
							<TableHead className="w-[160px] text-right text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
								Tageseinnahmen
							</TableHead>
							<TableHead className="w-[110px] text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
								Status
							</TableHead>
							<TableHead className="w-[110px]"></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{groups.map((g) => (
							<GroupBlock
								key={g.key}
								groupLabel={g.label}
								count={g.count}
								sumActiveCent={g.sumActiveCent}
								items={g.items}
								todayKey={todayKey}
							/>
						))}
					</TableBody>
				</Table>
			</div>

			<ul className="space-y-5 md:hidden">
				{groups.map((g) => (
					<li key={g.key} className="space-y-2">
						<div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/40 px-3 py-1.5">
							<span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
								{g.label}
							</span>
							<span className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground tabular-nums">
								{g.count} {g.count === 1 ? "Eintrag" : "Einträge"}
								<span className="text-muted-foreground/40">·</span>
								<Money cent={g.sumActiveCent} className="text-foreground" />
							</span>
						</div>
						<ul className="space-y-2">
							{g.items.map((p) => (
								<li key={p.id}>
									<MobileCard
										p={p}
										isToday={formatDateDe(p.anlass_datum) === todayKey}
									/>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</>
	);
}

function GroupBlock({
	groupLabel,
	count,
	sumActiveCent,
	items,
	todayKey,
}: {
	groupLabel: string;
	count: number;
	sumActiveCent: number;
	items: ProtokollRow[];
	todayKey: string;
}) {
	return (
		<>
			<TableRow className="border-t-0 bg-muted/40 hover:bg-muted/40">
				<TableCell
					colSpan={6}
					className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground"
				>
					<div className="flex items-baseline justify-between gap-3">
						<span>{groupLabel}</span>
						<span className="flex items-baseline gap-1.5 tabular-nums">
							{count} {count === 1 ? "Eintrag" : "Einträge"}
							<span className="text-muted-foreground/40">·</span>
							<Money cent={sumActiveCent} className="text-foreground" />
						</span>
					</div>
				</TableCell>
			</TableRow>
			{items.map((p) => {
				const isToday = formatDateDe(p.anlass_datum) === todayKey;
				return (
					<TableRow
						key={p.id}
						className="group transition-colors hover:bg-muted/30"
					>
						<TableCell className="font-mono text-sm font-medium">
							{p.belegnummer}
						</TableCell>
						<TableCell className="text-sm">
							<span className="inline-flex items-center gap-1.5">
								{formatDateDe(p.anlass_datum)}
								{isToday ? <HeuteBadge /> : null}
							</span>
						</TableCell>
						<TableCell className="max-w-[260px] truncate text-sm">
							{p.anlass}
						</TableCell>
						<TableCell className="text-right">
							<Money
								cent={p.tageseinnahmen_cent}
								tone={p.storniert_am ? "muted" : "default"}
								className={cn(p.storniert_am && "line-through")}
							/>
						</TableCell>
						<TableCell>
							<StatusPill storniert={!!p.storniert_am} />
						</TableCell>
						<TableCell className="text-right">
							<Link
								to="/protokolle/$id"
								params={{ id: p.id }}
								className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/10 hover:underline"
							>
								Anzeigen
								<ArrowUpRight className="h-3.5 w-3.5" />
							</Link>
						</TableCell>
					</TableRow>
				);
			})}
		</>
	);
}

function MobileCard({ p, isToday }: { p: ProtokollRow; isToday: boolean }) {
	return (
		<Link
			to="/protokolle/$id"
			params={{ id: p.id }}
			className="block rounded-xl border border-border bg-card/80 p-3.5 shadow-sm ring-1 ring-foreground/5 transition-colors active:bg-muted/50"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-mono text-sm font-medium text-foreground">
							{p.belegnummer}
						</span>
						{isToday ? <HeuteBadge /> : null}
					</div>
					<p className="mt-0.5 truncate text-sm text-foreground">{p.anlass}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{formatDateDe(p.anlass_datum)}
					</p>
				</div>
				<div className="flex flex-col items-end gap-1.5">
					<Money
						cent={p.tageseinnahmen_cent}
						tone={p.storniert_am ? "muted" : "default"}
						emphasis
						className={cn(p.storniert_am && "line-through")}
					/>
					<StatusPill storniert={!!p.storniert_am} />
				</div>
			</div>
		</Link>
	);
}
