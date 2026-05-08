/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.renameColumn("ausgaben", "mwst_basis_punkte", "ust_basis_punkte");
  pgm.sql(
    "ALTER TABLE ausgaben DROP CONSTRAINT IF EXISTS ausgaben_mwst_basis_punkte_check",
  );
  pgm.addConstraint("ausgaben", "ausgaben_ust_basis_punkte_check", {
    check: "ust_basis_punkte >= 0 AND ust_basis_punkte <= 10000",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("ausgaben", "ausgaben_ust_basis_punkte_check");
  pgm.renameColumn("ausgaben", "ust_basis_punkte", "mwst_basis_punkte");
  pgm.addConstraint("ausgaben", "ausgaben_mwst_basis_punkte_check", {
    check: "mwst_basis_punkte >= 0 AND mwst_basis_punkte <= 10000",
  });
};
