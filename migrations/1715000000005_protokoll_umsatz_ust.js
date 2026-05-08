/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("protokoll_umsatz_ust", {
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
    ust_basis_punkte: {
      type: "integer",
      notNull: true,
      check: "ust_basis_punkte >= 0 AND ust_basis_punkte <= 10000",
    },
    betrag_cent: {
      type: "integer",
      notNull: true,
      check: "betrag_cent >= 0",
    },
    reihenfolge: { type: "integer", notNull: true, default: 0 },
  });

  pgm.createIndex("protokoll_umsatz_ust", "protokoll_id", {
    name: "idx_protokoll_umsatz_ust_protokoll_id",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("protokoll_umsatz_ust");
};
