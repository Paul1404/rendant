import { Link } from "@tanstack/react-router";
import {
	type ColumnDef,
	createPaginatedRowModel,
	flexRender,
	type Row,
	rowPaginationFeature,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import {
	groupProtokollEvents,
	type ProtokollEventGroup,
	paginateProtokollEvents,
} from "@/lib/protokoll-groups";
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

const dashboardTableFeatures = tableFeatures({
	rowPaginationFeature,
	paginatedRowModel: createPaginatedRowModel(),
});

export function ProtokollList({ items }: Props) {
	const today = new Date();
	const todayKey = formatDateDe(today);
	const columns = useMemo<
		ColumnDef<typeof dashboardTableFeatures, ProtokollRow>[]
	>(
		() => [
			{
				accessorKey: "belegnummer",
				header: "Belegnummer",
				cell: ({ row }) => (
					<span className="font-mono text-sm font-medium">
						{row.original.belegnummer}
					</span>
				),
			},
			{
				accessorKey: "anlass_datum",
				header: "Datum",
				cell: ({ row }) => {
					const isToday = formatDateDe(row.original.anlass_datum) === todayKey;
					return (
						<span className="inline-flex items-center gap-1.5 text-sm">
							{formatDateDe(row.original.anlass_datum)}
							{isToday ? <HeuteBadge /> : null}
						</span>
					);
				},
			},
			{
				accessorKey: "anlass",
				header: "Veranstaltung",
				cell: ({ row }) => (
					<span className="block max-w-[320px] truncate text-sm">
						{row.original.anlass}
					</span>
				),
			},
			{
				id: "tageseinnahmen",
				header: "Tageseinnahmen",
				cell: ({ row }) => (
					<Money
						cent={row.original.tageseinnahmen_cent}
						tone={row.original.storniert_am ? "muted" : "default"}
						className={cn(row.original.storniert_am && "line-through")}
					/>
				),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<StatusPill storniert={Boolean(row.original.storniert_am)} />
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<Link
						to="/protokolle/$id"
						params={{ id: row.original.id }}
						className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/10 hover:underline"
					>
						Anzeigen
						<ArrowUpRight className="h-3.5 w-3.5" />
					</Link>
				),
			},
		],
		[todayKey],
	);
	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
	const pages = useMemo(
		() =>
			paginateProtokollEvents(
				groupByMonth(items).flatMap((month) =>
					groupProtokollEvents(month.items),
				),
				pagination.pageSize,
			),
		[items, pagination.pageSize],
	);
	// Reset on filter changes, preserve the current page on background refreshes.
	const scopeKey = JSON.stringify(items.map((item) => item.id));
	const [previousScope, setPreviousScope] = useState(scopeKey);
	const pageIndex =
		scopeKey !== previousScope
			? 0
			: Math.min(pagination.pageIndex, Math.max(pages.length - 1, 0));
	if (scopeKey !== previousScope) {
		setPreviousScope(scopeKey);
		setPagination((previous) => ({ ...previous, pageIndex: 0 }));
	}
	const table = useTable({
		features: dashboardTableFeatures,
		data: pages[pageIndex] ?? [],
		columns,
		getRowId: (row) => row.id,
		manualPagination: true,
		pageCount: pages.length,
		state: { pagination: { ...pagination, pageIndex } },
		onPaginationChange: setPagination,
	});
	const pageRows = table.getRowModel().rows;
	const pageItems = pageRows.map((row) => row.original);
	const rowsById = new Map(pageRows.map((row) => [row.id, row]));
	const monthTotals = new Map(
		groupByMonth(items).map((group) => [group.key, group]),
	);
	const groups = groupByMonth(pageItems).map((group) => {
		const total = monthTotals.get(group.key);
		return {
			...group,
			count: total?.count ?? group.count,
			sumActiveCent: total?.sumActiveCent ?? group.sumActiveCent,
		};
	});

	return (
		<>
			<div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm md:block">
				<Table>
					<TableHeader className="bg-muted/40">
						{table.getHeaderGroups().map((group) => (
							<TableRow key={group.id} className="hover:bg-transparent">
								{group.headers.map((header) => (
									<TableHead
										key={header.id}
										className={cn(
											"text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
											header.column.id === "belegnummer" && "w-[140px]",
											header.column.id === "anlass_datum" && "w-[120px]",
											header.column.id === "tageseinnahmen" &&
												"w-[160px] text-right",
											header.column.id === "status" && "w-[110px]",
											header.column.id === "actions" && "w-[110px]",
										)}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{groups.map((group) => (
							<MonthRows
								key={group.key}
								label={group.label}
								count={group.count}
								sumActiveCent={group.sumActiveCent}
								events={groupProtokollEvents(group.items)}
								rowsById={rowsById}
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
						<ul className="space-y-3">
							{groupProtokollEvents(g.items).map((event) => (
								<li
									key={event.key}
									className={cn(
										event.items.length > 1 &&
											"overflow-hidden rounded-xl border border-primary/20 border-l-[3px] border-l-primary/50 bg-card/80",
									)}
								>
									<ul
										className={cn(
											event.items.length > 1
												? "divide-y divide-border/60"
												: "space-y-2",
										)}
									>
										{event.items.map((p) => (
											<li key={p.id}>
												<MobileCard
													p={p}
													grouped={event.items.length > 1}
													isToday={formatDateDe(p.anlass_datum) === todayKey}
												/>
											</li>
										))}
									</ul>
									{event.items.length > 1 ? (
										<div className="border-t border-primary/15 bg-primary/5 px-3.5 py-3">
											<EventSummary event={event} />
										</div>
									) : null}
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>

			{items.length > 10 ? (
				<div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
					<span>
						Seite {table.state.pagination.pageIndex + 1} von{" "}
						{table.getPageCount()}
					</span>
					<div className="flex items-center gap-2">
						<span>Einträge pro Seite (ca.)</span>
						<Select
							value={String(table.state.pagination.pageSize)}
							onValueChange={(value) => {
								table.setPageIndex(0);
								table.setPageSize(Number(value));
							}}
						>
							<SelectTrigger size="sm" aria-label="Einträge pro Seite">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{[10, 25, 50, 100].map((size) => (
									<SelectItem key={size} value={String(size)}>
										{size}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="button"
							size="icon-sm"
							variant="outline"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							<ChevronLeft />
							<span className="sr-only">Vorherige Seite</span>
						</Button>
						<Button
							type="button"
							size="icon-sm"
							variant="outline"
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							<ChevronRight />
							<span className="sr-only">Nächste Seite</span>
						</Button>
					</div>
				</div>
			) : null}
		</>
	);
}

function MonthRows({
	label,
	count,
	sumActiveCent,
	events,
	rowsById,
}: {
	label: string;
	count: number;
	sumActiveCent: number;
	events: ProtokollEventGroup[];
	rowsById: Map<string, Row<typeof dashboardTableFeatures, ProtokollRow>>;
}) {
	return (
		<>
			<TableRow className="border-t-0 bg-muted/40 hover:bg-muted/40">
				<TableCell
					colSpan={6}
					className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground"
				>
					<div className="flex items-baseline justify-between gap-3">
						<span>{label}</span>
						<span className="flex items-baseline gap-1.5 tabular-nums">
							{count} {count === 1 ? "Eintrag" : "Einträge"}
							<span className="text-muted-foreground/40">·</span>
							<Money cent={sumActiveCent} className="text-foreground" />
						</span>
					</div>
				</TableCell>
			</TableRow>
			{events.map((event) => (
				<Fragment key={event.key}>
					{event.items.map((item) => {
						const row = rowsById.get(item.id);
						if (!row) return null;
						return (
							<TableRow
								key={row.id}
								className={cn(
									"group transition-colors hover:bg-muted/30",
									event.items.length > 1 &&
										"bg-primary/[0.025] [&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-primary/50",
								)}
							>
								{row.getAllCells().map((cell) => (
									<TableCell
										key={cell.id}
										className={cn(
											cell.column.id === "tageseinnahmen" && "text-right",
											cell.column.id === "actions" && "text-right",
										)}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						);
					})}
					{event.items.length > 1 ? (
						<TableRow className="bg-primary/5 hover:bg-primary/5">
							<TableCell
								colSpan={6}
								className="border-l-[3px] border-l-primary/50 px-4 py-3"
							>
								<EventSummary event={event} />
							</TableCell>
						</TableRow>
					) : null}
				</Fragment>
			))}
		</>
	);
}

function EventSummary({ event }: { event: ProtokollEventGroup }) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 text-xs">
			<div className="min-w-0 flex-1 whitespace-normal">
				<p className="font-medium text-foreground">{event.label}</p>
				<p className="mt-0.5 text-muted-foreground">
					{event.items.length} Belege ·{" "}
					{formatDateDe(event.items[0].anlass_datum)}
				</p>
			</div>
			<div className="shrink-0 text-right">
				<p className="mb-0.5 text-muted-foreground">
					Summe aktiv{event.hasCardRevenue ? " inkl. Karte" : ""}
				</p>
				<Money cent={event.sumActiveCent} className="font-medium" />
			</div>
		</div>
	);
}

function MobileCard({
	p,
	isToday,
	grouped = false,
}: {
	p: ProtokollRow;
	isToday: boolean;
	grouped?: boolean;
}) {
	return (
		<Link
			to="/protokolle/$id"
			params={{ id: p.id }}
			className={cn(
				"block p-3.5 transition-colors active:bg-muted/50",
				!grouped &&
					"rounded-xl border border-border bg-card/80 shadow-sm ring-1 ring-foreground/5",
			)}
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
