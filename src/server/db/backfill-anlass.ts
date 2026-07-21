import { eq, inArray, isNull, sql } from "drizzle-orm";
import { type AnlassTyp, anlassKey } from "@/lib/anlass";
import { db, pool } from "@/server/db";
import {
	anlassAliase,
	anlassKatalog,
	historicalRevenues,
	protokolle,
} from "@/server/db/schema";

// One-off, reviewed backfill for the Anlass catalog (plans/007). Seeds the
// catalog + aliases from the observed data, then assigns anlass_katalog_id to
// existing rows by matching the normalized free-text anlass against the aliases.
//
// DEFAULT IS A DRY RUN. Pass --write to persist. Idempotent (only fills NULLs),
// reversible (UPDATE ... SET anlass_katalog_id = NULL), and never modifies the
// original `anlass` / `vergleichsgruppe` text.
//
//   dry run:  DATABASE_URL=... bun run src/server/db/backfill-anlass.ts
//   write:    DATABASE_URL=... bun run src/server/db/backfill-anlass.ts --write

type Seed = { name: string; typ: AnlassTyp; aliases: string[] };

// Derived from production data and confirmed with the club (Heimspiel = Fußball;
// Korbball separate; Public Viewing recurs only in tournament years).
const SEED: Seed[] = [
	{
		name: "Biergarten",
		typ: "wiederkehrend",
		aliases: ["Biergarten", "Sonntag Biergarten", "Biergarten Sonntag"],
	},
	{
		name: "Donnerstag (Wirtschaftsdienst)",
		typ: "wiederkehrend",
		aliases: [
			"Wirtschatsdienst Donnerstag Abend",
			"Wirtschaftsbetrieb: Donnerstag",
			"Donnerstagabend",
			"Biergarten Donnerstag abend",
		],
	},
	{
		name: "Heimspiel (Fußball)",
		typ: "wiederkehrend",
		aliases: ["Sonntag Heimspiel Steinsfeld/Grettstadt", "Heimspiel"],
	},
	{
		name: "Korbball",
		typ: "wiederkehrend",
		aliases: ["Korbball", "Korbball Heimspiel"],
	},
	{
		name: "Seniorennachmittag",
		typ: "wiederkehrend",
		aliases: ["Seniorennachmittag"],
	},
	{ name: "Public Viewing", typ: "wiederkehrend", aliases: ["Public Viewing"] },
	{ name: "Sommerfest", typ: "einmalig", aliases: ["SVU Sommerfest"] },
	{ name: "Haxenabend", typ: "einmalig", aliases: ["Haxenabend"] },
	{
		name: "Bürgerversammlung",
		typ: "einmalig",
		aliases: ["Bürgerversammlung"],
	},
	{ name: "Frauenbund", typ: "einmalig", aliases: ["Frauenbund"] },
	{
		name: "Tischtennisabteilung",
		typ: "einmalig",
		aliases: ["Tischtennisabteilung"],
	},
];

// aliasNorm -> catalog name
const aliasToName = new Map<string, string>();
for (const s of SEED) {
	for (const a of s.aliases) aliasToName.set(anlassKey(a), s.name);
}

function resolve(anlass: string): string | null {
	return aliasToName.get(anlassKey(anlass)) ?? null;
}

async function reportTable(
	label: string,
	rows: { anlass: string; n: number }[],
) {
	console.log(`\n=== ${label} ===`);
	let matched = 0;
	let unmatched = 0;
	for (const r of rows.sort((a, b) => b.n - a.n)) {
		const name = resolve(r.anlass);
		if (name) matched += r.n;
		else unmatched += r.n;
		const arrow = name ? `-> ${name}` : "-> NICHT ZUGEORDNET";
		console.log(
			`  ${String(r.n).padStart(3)}  ${r.anlass.padEnd(42)} ${arrow}`,
		);
	}
	console.log(`  --- ${matched} zugeordnet, ${unmatched} offen ---`);
	return { matched, unmatched };
}

async function distinctAnlass(
	table: typeof protokolle | typeof historicalRevenues,
): Promise<{ anlass: string; n: number }[]> {
	const rows = await db
		.select({ anlass: table.anlass, n: sql<number>`count(*)` })
		.from(table)
		.groupBy(table.anlass);
	return rows.map((r) => ({ anlass: r.anlass, n: Number(r.n) }));
}

async function assign(
	table: typeof protokolle | typeof historicalRevenues,
	nameToId: Map<string, string>,
): Promise<number> {
	const rows = await db
		.select({ id: table.id, anlass: table.anlass })
		.from(table)
		.where(isNull(table.anlass_katalog_id));
	const idsByCatalog = new Map<string, string[]>();
	for (const r of rows) {
		const name = resolve(r.anlass);
		if (!name) continue;
		const cid = nameToId.get(name);
		if (!cid) continue;
		const list = idsByCatalog.get(cid) ?? [];
		list.push(r.id);
		idsByCatalog.set(cid, list);
	}
	let updated = 0;
	for (const [cid, ids] of idsByCatalog) {
		if (ids.length === 0) continue;
		await db
			.update(table)
			.set({ anlass_katalog_id: cid })
			.where(inArray(table.id, ids));
		updated += ids.length;
	}
	return updated;
}

async function main() {
	const write = process.argv.includes("--write");
	console.log(
		write
			? ">>> WRITE MODE"
			: ">>> DRY RUN (no writes) — pass --write to persist",
	);

	const [proto, hist] = await Promise.all([
		distinctAnlass(protokolle),
		distinctAnlass(historicalRevenues),
	]);

	await reportTable("Protokolle", proto);
	if (hist.length > 0) await reportTable("Historische Umsätze", hist);
	else console.log("\n=== Historische Umsätze === (leer)");

	if (!write) {
		console.log("\nDry run fertig. Nichts geschrieben.");
		await pool.end();
		return;
	}

	// 1. Seed catalog (idempotent on unique name) and collect name -> id.
	const nameToId = new Map<string, string>();
	for (let i = 0; i < SEED.length; i++) {
		const s = SEED[i];
		await db
			.insert(anlassKatalog)
			.values({ name: s.name, typ: s.typ, aktiv: true, reihenfolge: i })
			.onConflictDoNothing({ target: anlassKatalog.name });
		const row = await db
			.select({ id: anlassKatalog.id })
			.from(anlassKatalog)
			.where(eq(anlassKatalog.name, s.name))
			.limit(1);
		if (row[0]) nameToId.set(s.name, row[0].id);
	}

	// 2. Seed aliases (idempotent on unique alias_norm).
	for (const s of SEED) {
		const cid = nameToId.get(s.name);
		if (!cid) continue;
		for (const a of s.aliases) {
			await db
				.insert(anlassAliase)
				.values({ alias_norm: anlassKey(a), anlass_katalog_id: cid })
				.onConflictDoNothing({ target: anlassAliase.alias_norm });
		}
	}

	// 3. Assign existing rows (only where NULL).
	const p = await assign(protokolle, nameToId);
	const h = await assign(historicalRevenues, nameToId);
	console.log(
		`\nGeschrieben: ${p} Protokolle, ${h} historische Umsätze zugeordnet.`,
	);
	console.log("Der originale Anlass-Text wurde nicht verändert.");

	await pool.end();
}

main().catch((err) => {
	console.error("Backfill fehlgeschlagen:", err);
	process.exitCode = 1;
	pool.end().finally(() => process.exit(1));
});
