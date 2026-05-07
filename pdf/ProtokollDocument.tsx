import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { DENOMINATIONS } from "@/lib/denominations";
import { formatCent } from "@/lib/money";
import { formatDateDe, formatDateTimeDe } from "@/lib/date";
import { VEREINSNAME, PROTOKOLL_TITEL } from "@/lib/constants";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  header: {
    borderBottom: "1pt solid #111111",
    paddingBottom: 8,
    marginBottom: 14,
  },
  vereinsname: { fontSize: 12, fontWeight: "bold" },
  titel: { fontSize: 16, fontWeight: "bold", marginTop: 4 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    fontSize: 10,
  },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
    backgroundColor: "#f0f0f0",
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  kopfdatenRow: { flexDirection: "row", marginBottom: 3 },
  kopfdatenLabel: { width: 110, fontWeight: "bold" },
  kopfdatenValue: { flex: 1 },
  table: { display: "flex", flexDirection: "column" },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #cccccc",
    paddingVertical: 3,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1pt solid #111111",
    paddingVertical: 3,
    fontWeight: "bold",
  },
  cellLabel: { flex: 2 },
  cellAnzahl: { flex: 1, textAlign: "right" },
  cellWert: { flex: 1.4, textAlign: "right" },
  cellBetrag: { flex: 1.6, textAlign: "right" },
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderTop: "0.5pt solid #999999",
    fontWeight: "bold",
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderTop: "1pt solid #111111",
    borderBottom: "1pt solid #111111",
    fontWeight: "bold",
    marginTop: 4,
  },
  ausgabeRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #cccccc",
    paddingVertical: 3,
  },
  ausgabeBezeichnung: { flex: 3 },
  ausgabeEmpfaenger: { flex: 2 },
  ausgabeBeleg: { flex: 1.4 },
  ausgabeBetrag: { flex: 1.6, textAlign: "right" },
  summary: {
    marginTop: 14,
    border: "1pt solid #111111",
    padding: 10,
  },
  summaryRow: { flexDirection: "row", paddingVertical: 2 },
  summaryLabel: { flex: 2 },
  summaryValue: { flex: 1, textAlign: "right" },
  summaryHighlight: {
    flexDirection: "row",
    paddingVertical: 5,
    marginTop: 6,
    borderTop: "1pt solid #111111",
    fontWeight: "bold",
    fontSize: 12,
  },
  signatures: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBox: { width: "45%" },
  signatureLine: {
    borderBottom: "0.5pt solid #111111",
    marginBottom: 3,
    height: 30,
  },
  signatureLabel: { fontSize: 9 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 8,
    color: "#666666",
    borderTop: "0.5pt solid #cccccc",
    paddingTop: 6,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  watermark: {
    position: "absolute",
    top: 280,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 110,
    color: "#cc0000",
    opacity: 0.18,
    transform: "rotate(-18deg)",
    fontWeight: "bold",
  },
  stornoNotice: {
    marginTop: 10,
    backgroundColor: "#fde2e2",
    border: "1pt solid #cc0000",
    padding: 8,
    color: "#990000",
  },
});

export type AusgabePdf = {
  bezeichnung: string;
  empfaenger: string;
  beleg_nr: string;
  betrag_cent: number;
};

export type ProtokollPdfData = {
  belegnummer: string;
  erstellt_am: Date;
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
  pdfHash: string;
  storno?: {
    am: Date;
    grund: string;
  };
};

export function ProtokollDocument({ data }: { data: ProtokollPdfData }) {
  const sumKind = (kind: "schein" | "muenze") =>
    DENOMINATIONS.filter((d) => d.kind === kind).reduce(
      (s, d) => s + (data.counts[d.key] ?? 0) * d.cent,
      0,
    );
  const sumScheine = sumKind("schein");
  const sumMuenzen = sumKind("muenze");

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
            <Text>Datum: {formatDateDe(data.erstellt_am)}</Text>
          </View>
        </View>

        {data.storno ? (
          <View style={styles.stornoNotice}>
            <Text>
              Dieser Beleg wurde am {formatDateTimeDe(data.storno.am)}{" "}
              storniert.
            </Text>
            <Text>Grund: {data.storno.grund}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kopfdaten</Text>
          <View style={styles.kopfdatenRow}>
            <Text style={styles.kopfdatenLabel}>Anlass:</Text>
            <Text style={styles.kopfdatenValue}>{data.anlass}</Text>
          </View>
          <View style={styles.kopfdatenRow}>
            <Text style={styles.kopfdatenLabel}>Gezaehlt von:</Text>
            <Text style={styles.kopfdatenValue}>{data.gezaehlt_von}</Text>
          </View>
          <View style={styles.kopfdatenRow}>
            <Text style={styles.kopfdatenLabel}>Geprueft von:</Text>
            <Text style={styles.kopfdatenValue}>{data.geprueft_von}</Text>
          </View>
          {data.bemerkung ? (
            <View style={styles.kopfdatenRow}>
              <Text style={styles.kopfdatenLabel}>Bemerkung:</Text>
              <Text style={styles.kopfdatenValue}>{data.bemerkung}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stueckelung</Text>
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
            <Text style={styles.cellLabel}>Zwischensumme Muenzen</Text>
            <Text style={styles.cellAnzahl}> </Text>
            <Text style={styles.cellWert}> </Text>
            <Text style={styles.cellBetrag}>{formatCent(sumMuenzen)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.cellLabel}>Gezaehlter Endbestand</Text>
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
              <Text style={styles.ausgabeEmpfaenger}>Empfaenger</Text>
              <Text style={styles.ausgabeBeleg}>Beleg-Nr.</Text>
              <Text style={styles.ausgabeBetrag}>Betrag</Text>
            </View>
            {data.ausgaben.map((a, i) => (
              <View key={i} style={styles.ausgabeRow}>
                <Text style={styles.ausgabeBezeichnung}>{a.bezeichnung}</Text>
                <Text style={styles.ausgabeEmpfaenger}>
                  {a.empfaenger || " "}
                </Text>
                <Text style={styles.ausgabeBeleg}>{a.beleg_nr || " "}</Text>
                <Text style={styles.ausgabeBetrag}>
                  {formatCent(a.betrag_cent)}
                </Text>
              </View>
            ))}
            <View style={styles.subtotalRow}>
              <Text style={styles.ausgabeBezeichnung}>Summe Ausgaben</Text>
              <Text style={styles.ausgabeEmpfaenger}> </Text>
              <Text style={styles.ausgabeBeleg}> </Text>
              <Text style={styles.ausgabeBetrag}>
                {formatCent(data.ausgaben_cent)}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Anfangsbestand (Wechselgeld)</Text>
            <Text style={styles.summaryValue}>
              {formatCent(data.wechselgeld_cent)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gezaehlter Endbestand</Text>
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
              Kassenbestand brutto (Gezaehlt + Ausgaben)
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

        <View style={styles.signatures}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>
              Gezaehlt von: {data.gezaehlt_von}
            </Text>
            <Text style={styles.signatureLabel}>
              Datum: {formatDateDe(data.erstellt_am)}
            </Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>
              Geprueft von: {data.geprueft_von}
            </Text>
            <Text style={styles.signatureLabel}>
              Datum: {formatDateDe(data.erstellt_am)}
            </Text>
          </View>
        </View>

        <View fixed style={styles.footer}>
          <View style={styles.footerRow}>
            <Text>{VEREINSNAME}</Text>
            <Text>Beleg: {data.belegnummer}</Text>
          </View>
          <View style={styles.footerRow}>
            <Text>Erstellt: {formatDateTimeDe(data.erstellt_am)}</Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Seite ${pageNumber} von ${totalPages}`
              }
            />
          </View>
          <Text>SHA256: {data.pdfHash}</Text>
        </View>
      </Page>
    </Document>
  );
}
