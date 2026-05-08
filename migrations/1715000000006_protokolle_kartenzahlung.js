/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("protokolle", {
    kartenzahlung_cent: {
      type: "integer",
      notNull: true,
      default: 0,
      check: "kartenzahlung_cent >= 0",
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("protokolle", ["kartenzahlung_cent"]);
};
