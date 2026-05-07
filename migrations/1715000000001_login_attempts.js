/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("login_attempts", {
    id: { type: "bigserial", primaryKey: true },
    ip: { type: "text", notNull: true },
    versucht_am: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    erfolgreich: { type: "boolean", notNull: true },
  });

  pgm.createIndex("login_attempts", ["ip", "versucht_am"], {
    name: "idx_login_attempts_ip_versucht_am",
    method: "btree",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("login_attempts");
};
