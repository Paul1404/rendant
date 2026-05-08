/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("protokolle", {
    kassennummer: { type: "text", notNull: true, default: "" },
    kassenbezeichnung: { type: "text", notNull: true, default: "" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("protokolle", ["kassennummer", "kassenbezeichnung"]);
};
