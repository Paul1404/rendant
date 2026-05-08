/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("ausgaben", {
    mwst_basis_punkte: {
      type: "integer",
      notNull: true,
      default: 0,
      check: "mwst_basis_punkte >= 0 AND mwst_basis_punkte <= 10000",
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("ausgaben", "mwst_basis_punkte");
};
