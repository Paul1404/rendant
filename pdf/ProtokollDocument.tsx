import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { DENOMINATIONS } from "@/lib/denominations";
import { formatCent } from "@/lib/money";
import { formatDateDe, formatDateTimeDe } from "@/lib/date";
import { VEREINSNAME, PROTOKOLL_TITEL } from "@/lib/constants";
import { groupByUstRate, hasUstBreakdown, ustAnteilCent, formatUstSatz } from "@/lib/ust";

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  header: {
    borderBottom: "1pt solid #1a1a1a",
    paddingBottom: 10,
    marginBottom: 16,
  },
  vereinsname: {
    fontSize: 9,
    color: "#666666",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  titel: {
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    fontSize: 9.5,
    color: "#444444",
  },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    color: "#666666",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  kopfdatenRow: { flexDirection: "row", marginBottom: 4 },
  kopfdatenLabel: { width: 100, color: "#666666" },
  kopfdatenValue: { flex: 1 },
  table: { display: "flex", flexDirection: "column" },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #e5e5e5",
    paddingVertical: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "0.75pt solid #1a1a1a",
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#444444",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  cellLabel: { flex: 2 },
  cellAnzahl: { flex: 1, textAlign: "right" },
  cellWert: { flex: 1.4, textAlign: "right" },
  cellBetrag: { flex: 1.6, textAlign: "right" },
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTop: "0.5pt solid #b3b3b3",
    fontFamily: "Helvetica-Bold",
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderTop: "1pt solid #1a1a1a",
    borderBottom: "1pt solid #1a1a1a",
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
  },
  ausgabeRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #e5e5e5",
    paddingVertical: 4,
  },
  ausgabeBezeichnung: { flex: 3 },
  ausgabeEmpfaenger: { flex: 1.9 },
  ausgabeBeleg: { flex: 1.2 },
  ausgabeUst: { flex: 0.9, textAlign: "right" },
  ausgabeBetrag: { flex: 1.6, textAlign: "right" },
  ustBreakdown: {
    marginTop: 10,
    borderTop: "0.5pt solid #d4d4d4",
    paddingTop: 8,
  },
  ustRow: {
    flexDirection: "row",
    paddingVertical: 2.5,
    fontSize: 9.5,
  },
  ustHeader: {
    flexDirection: "row",
    paddingVertical: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#444444",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    borderBottom: "0.5pt solid #d4d4d4",
  },
  ustSatz: { flex: 1.2 },
  ustNetto: { flex: 1.5, textAlign: "right" },
  ustBetrag: { flex: 1.5, textAlign: "right" },
  ustBrutto: { flex: 1.5, textAlign: "right" },
  ustTotal: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTop: "0.5pt solid #999999",
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
  },
  summary: {
    marginTop: 18,
    border: "0.75pt solid #d4d4d4",
    backgroundColor: "#fafafa",
    padding: 12,
    borderRadius: 4,
  },
  summaryRow: { flexDirection: "row", paddingVertical: 2.5 },
  summaryLabel: { flex: 2, color: "#444444" },
  summaryValue: { flex: 1, textAlign: "right" },
  summaryHighlight: {
    flexDirection: "row",
    paddingTop: 8,
    marginTop: 8,
    borderTop: "0.75pt solid #1a1a1a",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 8,
    color: "#888888",
    borderTop: "0.5pt solid #d4d4d4",
    paddingTop: 6,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
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
    marginTop: 10,
    backgroundColor: "#fde2e2",
    border: "0.75pt solid #cc0000",
    padding: 10,
    color: "#990000",
    borderRadius: 4,
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

export type ProtokollPdfData = {
  belegnummer: string;
  erstellt_am: Date;
  kassennummer: string;
  kassenbezeichnung: string;
  anlass: string;
  gezaehlt_von: string;
  geprueft_von: string;
  bemerkung: string;
  counts: Record<string, number>;
  wechselgeld_cent: number;
  gezaehlt_cent: number;
  ausgaben_cent: number;
  bestand_cent: number;
  tageseinnahmen_cent: number;
  ausgaben: AusgabePdf[];
  umsatz_ust: UmsatzUstPdf[];
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
    ? `${rounded} %`
    : `${rounded.toString().replace(".", ",")} %`;
}

export function ProtokollDocument({ data }: { data: ProtokollPdfData }) {
  const sumKind = (kind: "schein" | "muenze") =>
    DENOMINATIONS.filter((d) => d.kind === kind).reduce(
      (s, d) => s + (data.counts[d.key] ?? 0) * d.cent,
      0,
    );
  const sumScheine = sumKind("schein");
  const sumMuenzen = sumKind("muenze");
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

  return (
    <Document
      title={`${PROTOKOLL_TITEL} ${data.belegnummer}`}
      author={VEREINSNAME}
    >
      <Page size="A4" style={styles.page}>
        {data.storno ? (
          <Text fixed style={styles.watermark}>
            STORNIERT
          </Text>
        ) : null}

        <View style={styles.header}>
          <Text style={styles.vereinsname}>{VEREINSNAME}</Text>
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
              {formatDateDe(data.erstellt_am)}
            </Text>
            <Text>
              Storniert am: {formatDateTimeDe(data.storno.am)} Uhr
            </Text>
            <Text>Grund: {data.storno.grund}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kopfdaten</Text>
          {data.kassennummer ? (
            <View style={styles.kopfdatenRow}>
              <Text style={styles.kopfdatenLabel}>Kassennummer</Text>
              <Text style={styles.kopfdatenValue}>{data.kassennummer}</Text>
            </View>
          ) : null}
          {data.kassenbezeichnung ? (
            <View style={styles.kopfdatenRow}>
              <Text style={styles.kopfdatenLabel}>Kassenbezeichnung</Text>
              <Text style={styles.kopfdatenValue}>
                {data.kassenbezeichnung}
              </Text>
            </View>
          ) : null}
          <View style={styles.kopfdatenRow}>
            <Text style={styles.kopfdatenLabel}>Anlass</Text>
            <Text style={styles.kopfdatenValue}>{data.anlass}</Text>
          </View>
          <View style={styles.kopfdatenRow}>
            <Text style={styles.kopfdatenLabel}>Gezählt von</Text>
            <Text style={styles.kopfdatenValue}>{data.gezaehlt_von}</Text>
          </View>
          <View style={styles.kopfdatenRow}>
            <Text style={styles.kopfdatenLabel}>Geprüft von</Text>
            <Text style={styles.kopfdatenValue}>{data.geprueft_von}</Text>
          </View>
          {data.bemerkung ? (
            <View style={styles.kopfdatenRow}>
              <Text style={styles.kopfdatenLabel}>Bemerkung</Text>
              <Text style={styles.kopfdatenValue}>{data.bemerkung}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stückelung</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.cellLabel}>Wert</Text>
            <Text style={styles.cellAnzahl}>Anzahl</Text>
            <Text style={styles.cellWert}>Einzelwert</Text>
            <Text style={styles.cellBetrag}>Teilbetrag</Text>
          </View>
          {DENOMINATIONS.map((d) => {
            const count = data.counts[d.key] ?? 0;
            return (
              <View key={d.key} style={styles.tableRow}>
                <Text style={styles.cellLabel}>{d.label}</Text>
                <Text style={styles.cellAnzahl}>{count}</Text>
                <Text style={styles.cellWert}>{formatCent(d.cent)}</Text>
                <Text style={styles.cellBetrag}>
                  {formatCent(count * d.cent)}
                </Text>
              </View>
            );
          })}
          <View style={styles.subtotalRow}>
            <Text style={styles.cellLabel}>Zwischensumme Scheine</Text>
            <Text style={styles.cellAnzahl}> </Text>
            <Text style={styles.cellWert}> </Text>
            <Text style={styles.cellBetrag}>{formatCent(sumScheine)}</Text>
          </View>
          <View style={styles.subtotalRow}>
            <Text style={styles.cellLabel}>Zwischensumme Münzen</Text>
            <Text style={styles.cellAnzahl}> </Text>
            <Text style={styles.cellWert}> </Text>
            <Text style={styles.cellBetrag}>{formatCent(sumMuenzen)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.cellLabel}>Gezählter Endbestand</Text>
            <Text style={styles.cellAnzahl}> </Text>
            <Text style={styles.cellWert}> </Text>
            <Text style={styles.cellBetrag}>
              {formatCent(data.gezaehlt_cent)}
            </Text>
          </View>
        </View>

        {data.ausgaben.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Betriebliche Ausgaben</Text>
            <View style={styles.tableHeader}>
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
            <View style={styles.subtotalRow}>
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
          <View style={styles.summaryHighlight}>
            <Text style={styles.summaryLabel}>Tageseinnahmen netto</Text>
            <Text style={styles.summaryValue}>
              {formatCent(data.tageseinnahmen_cent)}
            </Text>
          </View>
        </View>

        {showUmsatzBreakdown ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Umsatz-Aufgliederung nach USt.</Text>
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
                <Text style={styles.ustBrutto}>{formatCent(g.brutto_cent)}</Text>
              </View>
            ))}
            <View style={styles.ustTotal}>
              <Text style={styles.ustSatz}>Summe</Text>
              <Text style={styles.ustNetto}>{formatCent(umsatzNettoSumme)}</Text>
              <Text style={styles.ustBetrag}>{formatCent(umsatzUstSumme)}</Text>
              <Text style={styles.ustBrutto}>{formatCent(umsatzBruttoSumme)}</Text>
            </View>
          </View>
        ) : null}

        <View fixed style={styles.footer}>
          <View style={styles.footerRow}>
            <Text>{VEREINSNAME}</Text>
            <Text>Beleg: {data.belegnummer}</Text>
          </View>
          <View style={styles.footerRow}>
            <Text>
              Erfasst: {formatDateTimeDe(data.erstellt_am)} Uhr
            </Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Seite ${pageNumber} von ${totalPages}`
              }
            />
          </View>
          <Text style={{ marginTop: 2 }}>SHA256: {data.pdfHash}</Text>
        </View>
      </Page>
    </Document>
  );
}
