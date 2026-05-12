/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("cash_registers", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    kassennummer: { type: "text", notNull: true },
    kassenbezeichnung: { type: "text", notNull: true },
    wechselgeld_cent: {
      type: "integer",
      notNull: true,
      default: 16000,
      check: "wechselgeld_cent >= 0",
    },
    reihenfolge: { type: "integer", notNull: true, default: 0 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("cash_registers", "cash_registers_kassennummer_key", {
    unique: ["kassennummer"],
  });

  pgm.createIndex("cash_registers", ["reihenfolge", "kassennummer"], {
    name: "idx_cash_registers_order",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("cash_registers");
};
