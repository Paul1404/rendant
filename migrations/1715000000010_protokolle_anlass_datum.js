/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("protokolle", {
    anlass_datum: { type: "date" },
  });
  pgm.sql(
    "UPDATE protokolle SET anlass_datum = (erstellt_am AT TIME ZONE 'Europe/Berlin')::date WHERE anlass_datum IS NULL",
  );
  pgm.alterColumn("protokolle", "anlass_datum", { notNull: true });
  pgm.createIndex("protokolle", ["anlass_datum"], {
    name: "idx_protokolle_anlass_datum",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("protokolle", ["anlass_datum"], {
    name: "idx_protokolle_anlass_datum",
  });
  pgm.dropColumn("protokolle", "anlass_datum");
};
