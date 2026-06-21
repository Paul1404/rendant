import {
	Document,
	Font,
	Page,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import { PROTOKOLL_TITEL } from "@/lib/constants";
import { formatDateDe, formatDateTimeDe } from "@/lib/date";
import { DENOMINATIONS, type Denomination } from "@/lib/denominations";
import { formatCent } from "@/lib/money";
import { formatUstSatz, groupByUstRate, hasUstBreakdown } from "@/lib/ust";
import {
	type VereinStammdaten,
	vereinAnschriftLine,
	vereinRegisterLine,
} from "@/lib/verein";

Font.registerHyphenationCallback((word) => [word]);

export type AusgabePdf = {
	bezeichnung: string;
	empfaenger: string;
	beleg_nr: string;
	betrag_cent: number;
	ust_basis_punkte: number;
};

export type UmsatzUstPdf = {
	ust_basis_punkte: number;
	betrag_cent: number;
};

export type UmsatzUstBasisPdf = "pre_card" | "post_card";

export type ProtokollPdfData = {
	belegnummer: string;
	vereinsname: string;
	verein: VereinStammdaten;
	erstellt_am: Date;
	anlass_datum: Date;
	kassennummer: string;
	kassenbezeichnung: string;
	anlass: string;
	gezaehlt_von: string;
	geprueft_von: string;
	bemerkung: string;
	counts: Record<string, number>;
	wechselgeld_cent: number;
	kartenzahlung_cent: number;
	gezaehlt_cent: number;
	ausgaben_cent: number;
	bestand_cent: number;
	tageseinnahmen_cent: number;
	ausgaben: AusgabePdf[];
	umsatz_ust: UmsatzUstPdf[];
	umsatz_ust_basis: UmsatzUstBasisPdf;
	pdfHash: string;
	storno?: {
		am: Date;
		grund: string;
	};
};

function formatUstSatzPdf(bp: number): string {
	if (bp === 0) return "—";
	const percent = bp / 100;
	const rounded = Math.round(percent * 10) / 10;
	return Number.isInteger(rounded)
		? `${rounded} %`
		: `${rounded.toString().replace(".", ",")} %`;
}

function computeScale(
	data: ProtokollPdfData,
	showAusgabenUst: boolean,
	showUmsatzUst: boolean,
	umsatzGroupCount: number,
	ausgabenUstGroupCount: number,
): number {
	// Estimated content height in pt at scale = 1.0
	// Calibrated against measured layout: line-height ~14pt, sections ~10pt margin top
	let height = 0;
	height += 70; // header (verein + titel + meta + border + margin)
	if (data.storno) height += 56;
	height += 80; // kopfdaten section (title + 3-4 rows)
	height += 175; // stückelung section (title + 2-col block w/ 8 rows + subtotals + total)
	height += 120; // summary box (5 rows + 1-2 highlights + padding)
	if (data.ausgaben.length > 0) {
		height += 32; // section title + table header
		height += data.ausgaben.length * 15; // row (allow for occasional wrap)
		height += 16; // subtotal row
		if (showAusgabenUst) {
			height += 30; // breakdown title + header
			height += ausgabenUstGroupCount * 13;
			height += 14; // total row
		}
	}
	if (showUmsatzUst) {
		height += 32; // section title + table header
		height += umsatzGroupCount * 13;
		height += 14; // total row
	}
	height += 5 * 8; // section gaps

	// A4 = 842pt. Fixed DIN margins take paddingTop 57 + paddingBottom 70 = 127pt,
	// leaving ~715pt of content height. The narrower DIN text column wraps more
	// than this height model predicts, so we keep a wrap-safety buffer and only
	// start downscaling past ~630pt of estimated content.
	const available = 630;
	if (height <= available) return 1;
	return Math.max(0.55, available / height);
}

function makeStyles(s: number) {
	const f = (n: number) => n * s;
	return StyleSheet.create({
		page: {
			// DIN 5008 Seitenränder (A4, ohne Briefkopf): links 25 mm, rechts 20 mm,
			// oben 20 mm, unten ~25 mm inkl. Fußzeile. Bewusst NICHT mitskaliert,
			// damit die Ränder normgerecht bleiben, egal wie dicht der Inhalt ist.
			paddingTop: 57,
			paddingBottom: 70,
			paddingLeft: 71,
			paddingRight: 57,
			fontSize: f(9),
			fontFamily: "Helvetica",
			color: "#1a1a1a",
			// No page-level lineHeight on purpose: it leaks into the fixed,
			// absolutely positioned footer and collapses its stacked rows to a
			// single line (react-pdf quirk), which hid the address/board lines.
			// Row spacing comes from each section's own paddingVertical instead.
		},
		header: {
			borderBottom: "0.75pt solid #1a1a1a",
			paddingBottom: f(6),
			marginBottom: f(8),
		},
		vereinsname: {
			fontSize: f(8),
			color: "#666666",
			letterSpacing: 1.2,
			textTransform: "uppercase",
		},
		titel: {
			fontSize: f(14),
			fontFamily: "Helvetica-Bold",
			marginTop: f(2),
			letterSpacing: -0.2,
		},
		metaRow: {
			flexDirection: "row",
			justifyContent: "space-between",
			marginTop: f(4),
			fontSize: f(8.5),
			color: "#444444",
		},
		section: { marginTop: f(8) },
		sectionTitle: {
			fontSize: f(7.5),
			fontFamily: "Helvetica-Bold",
			marginBottom: f(4),
			color: "#666666",
			letterSpacing: 1.2,
			textTransform: "uppercase",
		},
		kopfdatenGrid: {
			flexDirection: "row",
			flexWrap: "wrap",
		},
		kopfdatenCell: {
			width: "50%",
			flexDirection: "row",
			paddingVertical: f(1.5),
			paddingRight: f(8),
		},
		kopfdatenCellFull: {
			width: "100%",
			flexDirection: "row",
			paddingVertical: f(1.5),
			paddingRight: f(8),
		},
		kopfdatenLabel: { width: f(96), color: "#666666", paddingRight: f(6) },
		kopfdatenValue: { flex: 1 },
		twoCol: { flexDirection: "row", gap: f(12) },
		twoColLeft: { flex: 1 },
		twoColRight: { flex: 1 },
		stueckRow: {
			flexDirection: "row",
			borderBottom: "0.4pt solid #ececec",
			paddingVertical: f(2),
		},
		stueckHeader: {
			flexDirection: "row",
			borderBottom: "0.6pt solid #1a1a1a",
			paddingVertical: f(2.5),
			fontFamily: "Helvetica-Bold",
			fontSize: f(7.5),
			color: "#444444",
			textTransform: "uppercase",
			letterSpacing: 0.5,
		},
		stueckLabel: { flex: 1.2 },
		stueckAnzahl: { flex: 1, textAlign: "right" },
		stueckBetrag: { flex: 1.4, textAlign: "right" },
		stueckSubtotal: {
			flexDirection: "row",
			paddingVertical: f(2.5),
			borderTop: "0.4pt solid #b3b3b3",
			fontFamily: "Helvetica-Bold",
		},
		stueckTotal: {
			flexDirection: "row",
			paddingVertical: f(3),
			borderTop: "0.75pt solid #1a1a1a",
			borderBottom: "0.75pt solid #1a1a1a",
			fontFamily: "Helvetica-Bold",
			marginTop: f(2),
		},
		ausgabeHeader: {
			flexDirection: "row",
			borderBottom: "0.6pt solid #1a1a1a",
			paddingVertical: f(2.5),
			fontFamily: "Helvetica-Bold",
			fontSize: f(7.5),
			color: "#444444",
			textTransform: "uppercase",
			letterSpacing: 0.5,
		},
		ausgabeRow: {
			flexDirection: "row",
			borderBottom: "0.4pt solid #ececec",
			paddingVertical: f(2),
		},
		ausgabeBezeichnung: { flex: 3 },
		ausgabeEmpfaenger: { flex: 1.9 },
		ausgabeBeleg: { flex: 1.2 },
		ausgabeUst: { flex: 0.9, textAlign: "right" },
		ausgabeBetrag: { flex: 1.6, textAlign: "right" },
		ausgabeSubtotal: {
			flexDirection: "row",
			paddingVertical: f(2.5),
			borderTop: "0.4pt solid #b3b3b3",
			fontFamily: "Helvetica-Bold",
		},
		ustBreakdown: {
			marginTop: f(6),
			borderTop: "0.4pt solid #d4d4d4",
			paddingTop: f(4),
		},
		ustHeader: {
			flexDirection: "row",
			paddingVertical: f(2),
			fontFamily: "Helvetica-Bold",
			fontSize: f(7.5),
			color: "#444444",
			textTransform: "uppercase",
			letterSpacing: 0.5,
			borderBottom: "0.4pt solid #d4d4d4",
		},
		ustRow: {
			flexDirection: "row",
			paddingVertical: f(1.8),
		},
		ustTotal: {
			flexDirection: "row",
			paddingVertical: f(2.5),
			borderTop: "0.4pt solid #999999",
			fontFamily: "Helvetica-Bold",
		},
		ustSatz: { flex: 1.2 },
		ustNetto: { flex: 1.5, textAlign: "right" },
		ustBetrag: { flex: 1.5, textAlign: "right" },
		ustBrutto: { flex: 1.5, textAlign: "right" },
		summary: {
			border: "0.6pt solid #d4d4d4",
			backgroundColor: "#fafafa",
			padding: f(8),
			borderRadius: 3,
		},
		summaryRow: { flexDirection: "row", paddingVertical: f(1.5) },
		summaryLabel: { flex: 2, color: "#444444" },
		summaryValue: { flex: 1, textAlign: "right" },
		summaryHighlight: {
			flexDirection: "row",
			paddingTop: f(4),
			marginTop: f(4),
			borderTop: "0.6pt solid #1a1a1a",
			fontFamily: "Helvetica-Bold",
			fontSize: f(10),
		},
		footer: {
			position: "absolute",
			bottom: 22,
			left: 71,
			right: 57,
			fontSize: 7,
			color: "#888888",
			borderTop: "0.4pt solid #d4d4d4",
			paddingTop: 4,
		},
		footerLegal: {
			color: "#666666",
			marginBottom: 3,
			lineHeight: 1.35,
		},
		footerRow: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "baseline",
			gap: 12,
		},
		footerHash: {
			color: "#999999",
		},
		watermark: {
			position: "absolute",
			top: 280,
			left: 0,
			right: 0,
			textAlign: "center",
			fontSize: 110,
			color: "#cc0000",
			opacity: 0.16,
			transform: "rotate(-18deg)",
			fontFamily: "Helvetica-Bold",
		},
		stornoNotice: {
			marginTop: f(6),
			backgroundColor: "#fde2e2",
			border: "0.6pt solid #cc0000",
			padding: f(6),
			color: "#990000",
			borderRadius: 3,
		},
	});
}

function StueckelungColumn({
	styles,
	rows,
	counts,
	subtotalLabel,
	subtotalCent,
}: {
	styles: ReturnType<typeof makeStyles>;
	rows: readonly Denomination[];
	counts: Record<string, number>;
	subtotalLabel: string;
	subtotalCent: number;
}) {
	return (
		<View>
			<View style={styles.stueckHeader}>
				<Text style={styles.stueckLabel}>Wert</Text>
				<Text style={styles.stueckAnzahl}>Anzahl</Text>
				<Text style={styles.stueckBetrag}>Betrag</Text>
			</View>
			{rows.map((d) => {
				const count = counts[d.key] ?? 0;
				return (
					<View key={d.key} style={styles.stueckRow}>
						<Text style={styles.stueckLabel}>{d.label}</Text>
						<Text style={styles.stueckAnzahl}>{count}</Text>
						<Text style={styles.stueckBetrag}>
							{formatCent(count * d.cent)}
						</Text>
					</View>
				);
			})}
			<View style={styles.stueckSubtotal}>
				<Text style={styles.stueckLabel}>{subtotalLabel}</Text>
				<Text style={styles.stueckAnzahl}> </Text>
				<Text style={styles.stueckBetrag}>{formatCent(subtotalCent)}</Text>
			</View>
		</View>
	);
}

export function ProtokollDocument({ data }: { data: ProtokollPdfData }) {
	const sumKind = (kind: "schein" | "muenze") =>
		DENOMINATIONS.filter((d) => d.kind === kind).reduce(
			(s, d) => s + (data.counts[d.key] ?? 0) * d.cent,
			0,
		);
	const sumScheine = sumKind("schein");
	const sumMuenzen = sumKind("muenze");
	const scheine = DENOMINATIONS.filter((d) => d.kind === "schein");
	const muenzen = DENOMINATIONS.filter((d) => d.kind === "muenze");

	const ustGroups = groupByUstRate(data.ausgaben);
	const ustSummeCent = ustGroups.reduce((s, g) => s + g.ust_cent, 0);
	const showUstBreakdown = hasUstBreakdown(ustGroups);
	const umsatzGroups = groupByUstRate(
		data.umsatz_ust.map((u) => ({
			betrag_cent: u.betrag_cent,
			ust_basis_punkte: u.ust_basis_punkte,
		})),
	);
	const umsatzUstSumme = umsatzGroups.reduce((s, g) => s + g.ust_cent, 0);
	const umsatzNettoSumme = umsatzGroups.reduce((s, g) => s + g.netto_cent, 0);
	const umsatzBruttoSumme = umsatzGroups.reduce((s, g) => s + g.brutto_cent, 0);
	const showUmsatzBreakdown = data.umsatz_ust.length > 0;

	const scale = computeScale(
		data,
		showUstBreakdown,
		showUmsatzBreakdown,
		umsatzGroups.length,
		ustGroups.length,
	);
	const styles = makeStyles(scale);

	const anschrift = vereinAnschriftLine(data.verein);
	const register = vereinRegisterLine(data.verein);
	// The club name is already in the header, so the footer carries only the
	// remaining legal details (address, register) to avoid duplicating it.
	const legalLine = [anschrift, register ? `Registergericht: ${register}` : ""]
		.filter(Boolean)
		.join("  ·  ");
	const vorstand = data.verein.vorstand.trim();

	return (
		<Document
			title={`${PROTOKOLL_TITEL} ${data.belegnummer}`}
			author={data.vereinsname}
		>
			<Page size="A4" style={styles.page}>
				{data.storno ? (
					<Text fixed style={styles.watermark}>
						STORNIERT
					</Text>
				) : null}

				<View style={styles.header}>
					<Text style={styles.vereinsname}>{data.vereinsname}</Text>
					<Text style={styles.titel}>{PROTOKOLL_TITEL}</Text>
					<View style={styles.metaRow}>
						<Text>Belegnummer: {data.belegnummer}</Text>
						<Text>Erfasst: {formatDateTimeDe(data.erstellt_am)} Uhr</Text>
					</View>
				</View>

				{data.storno ? (
					<View style={styles.stornoNotice}>
						<Text style={{ fontFamily: "Helvetica-Bold" }}>
							Stornobeleg zu Beleg-Nr. {data.belegnummer} vom{" "}
							{formatDateDe(data.anlass_datum)}
						</Text>
						<Text>Storniert am: {formatDateTimeDe(data.storno.am)} Uhr</Text>
						<Text>Grund: {data.storno.grund}</Text>
					</View>
				) : null}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Kopfdaten</Text>
					<View style={styles.kopfdatenGrid}>
						{data.kassennummer ? (
							<View style={styles.kopfdatenCell}>
								<Text style={styles.kopfdatenLabel}>Kassennummer</Text>
								<Text style={styles.kopfdatenValue}>{data.kassennummer}</Text>
							</View>
						) : null}
						{data.kassenbezeichnung ? (
							<View style={styles.kopfdatenCell}>
								<Text style={styles.kopfdatenLabel}>Kassenbezeichnung</Text>
								<Text style={styles.kopfdatenValue}>
									{data.kassenbezeichnung}
								</Text>
							</View>
						) : null}
						<View style={styles.kopfdatenCell}>
							<Text style={styles.kopfdatenLabel}>Gezählt von</Text>
							<Text style={styles.kopfdatenValue}>{data.gezaehlt_von}</Text>
						</View>
						<View style={styles.kopfdatenCell}>
							<Text style={styles.kopfdatenLabel}>Geprüft von</Text>
							<Text style={styles.kopfdatenValue}>{data.geprueft_von}</Text>
						</View>
						<View style={styles.kopfdatenCell}>
							<Text style={styles.kopfdatenLabel}>Datum</Text>
							<Text style={styles.kopfdatenValue}>
								{formatDateDe(data.anlass_datum)}
							</Text>
						</View>
						<View style={styles.kopfdatenCellFull}>
							<Text style={styles.kopfdatenLabel}>Anlass</Text>
							<Text style={styles.kopfdatenValue}>{data.anlass}</Text>
						</View>
						{data.bemerkung ? (
							<View style={styles.kopfdatenCellFull}>
								<Text style={styles.kopfdatenLabel}>Bemerkung</Text>
								<Text style={styles.kopfdatenValue}>{data.bemerkung}</Text>
							</View>
						) : null}
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Stückelung</Text>
					<View style={styles.twoCol}>
						<View style={styles.twoColLeft}>
							<StueckelungColumn
								styles={styles}
								rows={scheine}
								counts={data.counts}
								subtotalLabel="Zwischensumme Scheine"
								subtotalCent={sumScheine}
							/>
						</View>
						<View style={styles.twoColRight}>
							<StueckelungColumn
								styles={styles}
								rows={muenzen}
								counts={data.counts}
								subtotalLabel="Zwischensumme Münzen"
								subtotalCent={sumMuenzen}
							/>
						</View>
					</View>
					<View style={styles.stueckTotal}>
						<Text style={styles.stueckLabel}>Gezählter Endbestand</Text>
						<Text style={styles.stueckAnzahl}> </Text>
						<Text style={styles.stueckAnzahl}> </Text>
						<Text style={styles.stueckBetrag}>
							{formatCent(data.gezaehlt_cent)}
						</Text>
					</View>
				</View>

				{data.ausgaben.length > 0 ? (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Betriebliche Ausgaben</Text>
						<View style={styles.ausgabeHeader}>
							<Text style={styles.ausgabeBezeichnung}>Bezeichnung</Text>
							<Text style={styles.ausgabeEmpfaenger}>Empfänger</Text>
							<Text style={styles.ausgabeBeleg}>Beleg-Nr.</Text>
							<Text style={styles.ausgabeUst}>USt.</Text>
							<Text style={styles.ausgabeBetrag}>Betrag</Text>
						</View>
						{data.ausgaben.map((a, i) => (
							<View key={i} style={styles.ausgabeRow}>
								<Text style={styles.ausgabeBezeichnung}>{a.bezeichnung}</Text>
								<Text style={styles.ausgabeEmpfaenger}>
									{a.empfaenger || " "}
								</Text>
								<Text style={styles.ausgabeBeleg}>{a.beleg_nr || " "}</Text>
								<Text style={styles.ausgabeUst}>
									{formatUstSatzPdf(a.ust_basis_punkte ?? 0)}
								</Text>
								<Text style={styles.ausgabeBetrag}>
									{formatCent(a.betrag_cent)}
								</Text>
							</View>
						))}
						<View style={styles.ausgabeSubtotal}>
							<Text style={styles.ausgabeBezeichnung}>Summe Ausgaben</Text>
							<Text style={styles.ausgabeEmpfaenger}> </Text>
							<Text style={styles.ausgabeBeleg}> </Text>
							<Text style={styles.ausgabeUst}> </Text>
							<Text style={styles.ausgabeBetrag}>
								{formatCent(data.ausgaben_cent)}
							</Text>
						</View>
						{showUstBreakdown ? (
							<View style={styles.ustBreakdown}>
								<Text style={styles.sectionTitle}>USt.-Aufgliederung</Text>
								<View style={styles.ustHeader}>
									<Text style={styles.ustSatz}>Satz</Text>
									<Text style={styles.ustNetto}>Netto</Text>
									<Text style={styles.ustBetrag}>USt.</Text>
									<Text style={styles.ustBrutto}>Brutto</Text>
								</View>
								{ustGroups.map((g) => (
									<View key={g.bp} style={styles.ustRow}>
										<Text style={styles.ustSatz}>{formatUstSatz(g.bp)}</Text>
										<Text style={styles.ustNetto}>
											{formatCent(g.netto_cent)}
										</Text>
										<Text style={styles.ustBetrag}>
											{g.ust_cent === 0 ? "—" : formatCent(g.ust_cent)}
										</Text>
										<Text style={styles.ustBrutto}>
											{formatCent(g.brutto_cent)}
										</Text>
									</View>
								))}
								<View style={styles.ustTotal}>
									<Text style={styles.ustSatz}>Summe</Text>
									<Text style={styles.ustNetto}>
										{formatCent(
											ustGroups.reduce((s, g) => s + g.netto_cent, 0),
										)}
									</Text>
									<Text style={styles.ustBetrag}>
										{formatCent(ustSummeCent)}
									</Text>
									<Text style={styles.ustBrutto}>
										{formatCent(data.ausgaben_cent)}
									</Text>
								</View>
							</View>
						) : null}
					</View>
				) : null}

				<View style={styles.section}>
					<View style={styles.summary}>
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>
								Anfangsbestand (Wechselgeld)
							</Text>
							<Text style={styles.summaryValue}>
								{formatCent(data.wechselgeld_cent)}
							</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>Gezählter Endbestand</Text>
							<Text style={styles.summaryValue}>
								{formatCent(data.gezaehlt_cent)}
							</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>Betriebliche Ausgaben</Text>
							<Text style={styles.summaryValue}>
								{formatCent(data.ausgaben_cent)}
							</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>
								Kassenbestand brutto (Gezählt + Ausgaben)
							</Text>
							<Text style={styles.summaryValue}>
								{formatCent(data.bestand_cent)}
							</Text>
						</View>
						{data.kartenzahlung_cent > 0 ? (
							<View style={styles.summaryRow}>
								<Text style={styles.summaryLabel}>Kartenzahlung</Text>
								<Text style={styles.summaryValue}>
									{formatCent(data.kartenzahlung_cent)}
								</Text>
							</View>
						) : null}
						{data.kartenzahlung_cent > 0 ? (
							<>
								<View style={styles.summaryHighlight}>
									<Text style={styles.summaryLabel}>
										Tageseinnahmen netto (ohne Kartenzahlung)
									</Text>
									<Text style={styles.summaryValue}>
										{formatCent(data.tageseinnahmen_cent)}
									</Text>
								</View>
								<View style={styles.summaryHighlight}>
									<Text style={styles.summaryLabel}>
										Tageseinnahmen netto (mit Kartenzahlung)
									</Text>
									<Text style={styles.summaryValue}>
										{formatCent(
											data.tageseinnahmen_cent + data.kartenzahlung_cent,
										)}
									</Text>
								</View>
							</>
						) : (
							<View style={styles.summaryHighlight}>
								<Text style={styles.summaryLabel}>Tageseinnahmen netto</Text>
								<Text style={styles.summaryValue}>
									{formatCent(data.tageseinnahmen_cent)}
								</Text>
							</View>
						)}
					</View>
				</View>

				{showUmsatzBreakdown ? (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>
							Umsatz-Aufgliederung nach USt.
							{data.kartenzahlung_cent > 0
								? data.umsatz_ust_basis === "pre_card"
									? " (ohne Kartenzahlung)"
									: " (inkl. Kartenzahlung)"
								: ""}
						</Text>
						<View style={styles.ustHeader}>
							<Text style={styles.ustSatz}>Satz</Text>
							<Text style={styles.ustNetto}>Netto</Text>
							<Text style={styles.ustBetrag}>USt.</Text>
							<Text style={styles.ustBrutto}>Brutto</Text>
						</View>
						{umsatzGroups.map((g) => (
							<View key={g.bp} style={styles.ustRow}>
								<Text style={styles.ustSatz}>{formatUstSatz(g.bp)}</Text>
								<Text style={styles.ustNetto}>{formatCent(g.netto_cent)}</Text>
								<Text style={styles.ustBetrag}>
									{g.ust_cent === 0 ? "—" : formatCent(g.ust_cent)}
								</Text>
								<Text style={styles.ustBrutto}>
									{formatCent(g.brutto_cent)}
								</Text>
							</View>
						))}
						<View style={styles.ustTotal}>
							<Text style={styles.ustSatz}>Summe</Text>
							<Text style={styles.ustNetto}>
								{formatCent(umsatzNettoSumme)}
							</Text>
							<Text style={styles.ustBetrag}>{formatCent(umsatzUstSumme)}</Text>
							<Text style={styles.ustBrutto}>
								{formatCent(umsatzBruttoSumme)}
							</Text>
						</View>
					</View>
				) : null}

				<View fixed style={styles.footer}>
					{legalLine || vorstand ? (
						<View style={styles.footerLegal}>
							{legalLine ? <Text>{legalLine}</Text> : null}
							{vorstand ? <Text>Vorstand: {vorstand}</Text> : null}
						</View>
					) : null}
					<View style={styles.footerRow}>
						<Text style={styles.footerHash}>SHA256: {data.pdfHash}</Text>
						<Text
							render={({ pageNumber, totalPages }) =>
								`Seite ${pageNumber} von ${totalPages}`
							}
						/>
					</View>
				</View>
			</Page>
		</Document>
	);
}
