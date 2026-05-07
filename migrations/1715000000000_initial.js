/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

const DENOMINATION_KEYS = [
  "anzahl_500_eur",
  "anzahl_200_eur",
  "anzahl_100_eur",
  "anzahl_50_eur",
  "anzahl_20_eur",
  "anzahl_10_eur",
  "anzahl_5_eur",
  "anzahl_2_eur",
  "anzahl_1_eur",
  "anzahl_50_cent",
  "anzahl_20_cent",
  "anzahl_10_cent",
  "anzahl_5_cent",
  "anzahl_2_cent",
  "anzahl_1_cent",
];

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  const denominationColumns = {};
  for (const key of DENOMINATION_KEYS) {
    denominationColumns[key] = {
      type: "integer",
      notNull: true,
      default: 0,
      check: `${key} >= 0`,
    };
  }

  pgm.createTable("protokolle", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    belegnummer: { type: "text", notNull: true, unique: true },
    erstellt_am: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    anlass: { type: "text", notNull: true },
    gezaehlt_von: { type: "text", notNull: true },
    geprueft_von: { type: "text", notNull: true },
    bemerkung: { type: "text", notNull: true, default: "" },
    ...denominationColumns,
    wechselgeld_cent: {
      type: "integer",
      notNull: true,
      check: "wechselgeld_cent >= 0",
    },
    gezaehlt_cent: {
      type: "integer",
      notNull: true,
      check: "gezaehlt_cent >= 0",
    },
    ausgaben_cent: {
      type: "integer",
      notNull: true,
      check: "ausgaben_cent >= 0",
    },
    bestand_cent: {
      type: "integer",
      notNull: true,
      check: "bestand_cent >= 0",
    },
    tageseinnahmen_cent: { type: "integer", notNull: true },
    pdf_s3_key: { type: "text" },
    pdf_sha256: { type: "text" },
    storniert_am: { type: "timestamptz" },
    storno_grund: { type: "text" },
    storno_pdf_s3_key: { type: "text" },
    storno_pdf_sha256: { type: "text" },
  });

  pgm.createIndex("protokolle", "erstellt_am", {
    name: "idx_protokolle_erstellt_am",
    method: "btree",
  });
  pgm.createIndex("protokolle", "storniert_am", {
    name: "idx_protokolle_storniert_am",
  });

  pgm.createTable("ausgaben", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    protokoll_id: {
      type: "uuid",
      notNull: true,
      references: "protokolle(id)",
      onDelete: "CASCADE",
    },
    bezeichnung: { type: "text", notNull: true },
    empfaenger: { type: "text", notNull: true, default: "" },
    beleg_nr: { type: "text", notNull: true, default: "" },
    betrag_cent: {
      type: "integer",
      notNull: true,
      check: "betrag_cent >= 0",
    },
    reihenfolge: { type: "integer", notNull: true, default: 0 },
  });

  pgm.createIndex("ausgaben", "protokoll_id", {
    name: "idx_ausgaben_protokoll_id",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("ausgaben");
  pgm.dropTable("protokolle");
};
