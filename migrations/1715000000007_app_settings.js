/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("app_settings", {
    id: {
      type: "integer",
      primaryKey: true,
      default: 1,
      check: "id = 1",
    },
    belegnummer_min_digits: {
      type: "integer",
      notNull: true,
      default: 2,
      check: "belegnummer_min_digits BETWEEN 1 AND 6",
    },
    belegnummer_prefix: {
      type: "text",
      notNull: true,
      default: "",
    },
    belegnummer_include_year: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    belegnummer_year_format: {
      type: "text",
      notNull: true,
      default: "long",
      check: "belegnummer_year_format IN ('long', 'short')",
    },
    belegnummer_separator: {
      type: "text",
      notNull: true,
      default: "-",
      check: "belegnummer_separator IN ('-', '/', '.', '_')",
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.sql(`INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);
};

exports.down = (pgm) => {
  pgm.dropTable("app_settings");
};
