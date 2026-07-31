import {
	Circle,
	Document,
	Ellipse,
	Font,
	G,
	Page,
	Path,
	StyleSheet,
	Svg,
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

const BRAND = {
	forest: "#0F2A22",
	brassDark: "#8A6A28",
	parchment: "#F7F3EA",
	ink: "#12261F",
	inkMuted: "#3C4B44",
	line: "#D7D8D2",
	lineStrong: "#AEB7B2",
	danger: "#8C2F24",
	dangerPale: "#F8EDE9",
} as const;

const GUILLOCHE_ROTATIONS = [
	0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
] as const;

function RendantMark({ size = 28 }: { size?: number }) {
	return (
		<Svg width={size} height={size} viewBox="0 0 96 96">
			<G
				fill="none"
				stroke={BRAND.brassDark}
				strokeWidth={8}
				strokeLinecap="butt"
				strokeLinejoin="miter"
			>
				<Path d="M32 22 V70" />
				<Path d="M32 22 H53 C65 22 65 44 53 44 H32" />
				<Path d="M50 44 L67 70" />
			</G>
			<Path
				d="M22 80 H74"
				fill="none"
				stroke={BRAND.brassDark}
				strokeWidth={4}
			/>
		</Svg>
	);
}

function GuillocheWatermark() {
	return (
		<Svg fixed style={watermarkStyles.guilloche} viewBox="0 0 400 400">
			<G fill="none" stroke={BRAND.forest} strokeWidth={0.6} opacity={0.055}>
				{GUILLOCHE_ROTATIONS.map((rotation) => (
					<Ellipse
						key={rotation}
						cx={200}
						cy={200}
						rx={152}
						ry={58}
						transform={`rotate(${rotation} 200 200)`}
					/>
				))}
				{[0, 45, 90, 135].map((rotation) => (
					<Ellipse
						key={`inner-${rotation}`}
						cx={200}
						cy={200}
						rx={104}
						ry={34}
						transform={`rotate(${rotation} 200 200)`}
					/>
				))}
				<Circle cx={200} cy={200} r={176} />
				<Circle cx={200} cy={200} r={168} />
				<Circle cx={200} cy={200} r={116} />
			</G>
		</Svg>
	);
}

const watermarkStyles = StyleSheet.create({
	guilloche: {
		position: "absolute",
		right: -92,
		bottom: -62,
		width: 310,
		height: 310,
	},
});

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
	if (bp === 0) return "-";
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
	height += 82; // branded header (mark + title + meta + border + margin)
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
			color: BRAND.ink,
			backgroundColor: "#FFFDF8",
			// No page-level lineHeight on purpose: it leaks into the fixed,
			// absolutely positioned footer and collapses its stacked rows to a
			// single line (react-pdf quirk), which hid the address/board lines.
			// Row spacing comes from each section's own paddingVertical instead.
		},
		header: {
			borderBottom: `1.1pt solid ${BRAND.forest}`,
			paddingBottom: f(7),
			marginBottom: f(8),
		},
		brandRow: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			minHeight: f(30),
		},
		brandLockup: {
			flexDirection: "row",
			alignItems: "center",
			gap: f(6),
		},
		brandName: {
			fontSize: f(12),
			fontFamily: "Times-Roman",
			color: BRAND.forest,
			letterSpacing: 1.8,
			textTransform: "uppercase",
		},
		vereinsname: {
			maxWidth: "58%",
			fontSize: f(7.5),
			color: BRAND.inkMuted,
			textAlign: "right",
		},
		titel: {
			fontSize: f(16),
			fontFamily: "Times-Roman",
			color: BRAND.forest,
			marginTop: f(5),
			letterSpacing: 0.1,
		},
		metaRow: {
			flexDirection: "row",
			justifyContent: "space-between",
			marginTop: f(4),
			fontSize: f(8.5),
			color: BRAND.inkMuted,
		},
		section: { marginTop: f(8) },
		sectionTitle: {
			fontSize: f(7.5),
			fontFamily: "Helvetica-Bold",
			marginBottom: f(4),
			color: BRAND.brassDark,
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
		kopfdatenLabel: {
			width: f(96),
			color: BRAND.inkMuted,
			paddingRight: f(6),
		},
		kopfdatenValue: { flex: 1 },
		twoCol: { flexDirection: "row", gap: f(12) },
		twoColLeft: { flex: 1 },
		twoColRight: { flex: 1 },
		stueckRow: {
			flexDirection: "row",
			borderBottom: `0.4pt solid ${BRAND.line}`,
			paddingVertical: f(2),
		},
		stueckHeader: {
			flexDirection: "row",
			borderBottom: `0.6pt solid ${BRAND.forest}`,
			paddingVertical: f(2.5),
			fontFamily: "Helvetica-Bold",
			fontSize: f(7.5),
			color: BRAND.inkMuted,
			textTransform: "uppercase",
			letterSpacing: 0.5,
		},
		stueckLabel: { flex: 1.2 },
		stueckAnzahl: { flex: 1, textAlign: "right" },
		stueckBetrag: { flex: 1.4, textAlign: "right" },
		stueckSubtotal: {
			flexDirection: "row",
			paddingVertical: f(2.5),
			borderTop: `0.4pt solid ${BRAND.lineStrong}`,
			fontFamily: "Helvetica-Bold",
		},
		stueckTotal: {
			flexDirection: "row",
			paddingVertical: f(3),
			borderTop: `0.75pt solid ${BRAND.forest}`,
			borderBottom: `0.75pt solid ${BRAND.forest}`,
			color: BRAND.forest,
			fontFamily: "Helvetica-Bold",
			marginTop: f(2),
		},
		ausgabeHeader: {
			flexDirection: "row",
			borderBottom: `0.6pt solid ${BRAND.forest}`,
			paddingVertical: f(2.5),
			fontFamily: "Helvetica-Bold",
			fontSize: f(7.5),
			color: BRAND.inkMuted,
			textTransform: "uppercase",
			letterSpacing: 0.5,
		},
		ausgabeRow: {
			flexDirection: "row",
			borderBottom: `0.4pt solid ${BRAND.line}`,
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
			borderTop: `0.4pt solid ${BRAND.lineStrong}`,
			fontFamily: "Helvetica-Bold",
		},
		ustBreakdown: {
			marginTop: f(6),
			borderTop: `0.4pt solid ${BRAND.line}`,
			paddingTop: f(4),
		},
		ustHeader: {
			flexDirection: "row",
			paddingVertical: f(2),
			fontFamily: "Helvetica-Bold",
			fontSize: f(7.5),
			color: BRAND.inkMuted,
			textTransform: "uppercase",
			letterSpacing: 0.5,
			borderBottom: `0.4pt solid ${BRAND.line}`,
		},
		ustRow: {
			flexDirection: "row",
			paddingVertical: f(1.8),
		},
		ustTotal: {
			flexDirection: "row",
			paddingVertical: f(2.5),
			borderTop: `0.4pt solid ${BRAND.lineStrong}`,
			fontFamily: "Helvetica-Bold",
		},
		ustSatz: { flex: 1.2 },
		ustNetto: { flex: 1.5, textAlign: "right" },
		ustBetrag: { flex: 1.5, textAlign: "right" },
		ustBrutto: { flex: 1.5, textAlign: "right" },
		summary: {
			border: `0.6pt solid ${BRAND.lineStrong}`,
			backgroundColor: BRAND.parchment,
			padding: f(8),
			borderRadius: 2,
		},
		summaryRow: { flexDirection: "row", paddingVertical: f(1.5) },
		summaryLabel: { flex: 2, color: BRAND.inkMuted },
		summaryValue: { flex: 1, textAlign: "right" },
		summaryHighlight: {
			flexDirection: "row",
			paddingTop: f(4),
			marginTop: f(4),
			borderTop: `0.7pt solid ${BRAND.forest}`,
			fontFamily: "Helvetica-Bold",
			fontSize: f(10),
			color: BRAND.forest,
		},
		footer: {
			position: "absolute",
			bottom: 22,
			left: 71,
			right: 57,
			fontSize: 7,
			color: BRAND.inkMuted,
			borderTop: `0.4pt solid ${BRAND.lineStrong}`,
			paddingTop: 4,
		},
		footerLegal: {
			color: BRAND.inkMuted,
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
			color: BRAND.inkMuted,
			fontFamily: "Courier",
			fontSize: 6.5,
		},
		watermark: {
			position: "absolute",
			top: 280,
			left: 0,
			right: 0,
			textAlign: "center",
			fontSize: 110,
			color: BRAND.danger,
			opacity: 0.16,
			transform: "rotate(-18deg)",
			fontFamily: "Helvetica-Bold",
		},
		stornoNotice: {
			marginTop: f(6),
			backgroundColor: BRAND.dangerPale,
			border: `0.6pt solid ${BRAND.danger}`,
			padding: f(6),
			color: BRAND.danger,
			borderRadius: 2,
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
			subject={`Kassenprotokoll ${data.belegnummer} für ${data.vereinsname}`}
			keywords="Rendant, Kassenprotokoll, Kassenführung, Nachweis"
			creator="Rendant"
			producer="Rendant"
			language="de-DE"
		>
			<Page size="A4" style={styles.page}>
				<GuillocheWatermark />
				{data.storno ? (
					<Text fixed style={styles.watermark}>
						STORNIERT
					</Text>
				) : null}

				<View style={styles.header}>
					<View style={styles.brandRow}>
						<View style={styles.brandLockup}>
							<RendantMark size={28 * scale} />
							<Text style={styles.brandName}>Rendant</Text>
						</View>
						<Text style={styles.vereinsname}>{data.vereinsname}</Text>
					</View>
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
						{data.geprueft_von ? (
							<View style={styles.kopfdatenCell}>
								<Text style={styles.kopfdatenLabel}>Geprüft von</Text>
								<Text style={styles.kopfdatenValue}>{data.geprueft_von}</Text>
							</View>
						) : null}
						<View style={styles.kopfdatenCell}>
							<Text style={styles.kopfdatenLabel}>Datum</Text>
							<Text style={styles.kopfdatenValue}>
								{formatDateDe(data.anlass_datum)}
							</Text>
						</View>
						<View style={styles.kopfdatenCellFull}>
							<Text style={styles.kopfdatenLabel}>Veranstaltung</Text>
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
											{g.ust_cent === 0 ? "-" : formatCent(g.ust_cent)}
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
									{g.ust_cent === 0 ? "-" : formatCent(g.ust_cent)}
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
						<Text style={styles.footerHash}>
							Rendant · SHA256: {data.pdfHash}
						</Text>
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
