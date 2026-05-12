/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("app_settings", {
    umsatz_ust_basis: {
      type: "text",
      notNull: true,
      default: "post_card",
      check: "umsatz_ust_basis IN ('pre_card', 'post_card')",
    },
  });

  pgm.addColumns("protokolle", {
    umsatz_ust_basis: {
      type: "text",
      notNull: true,
      default: "post_card",
      check: "umsatz_ust_basis IN ('pre_card', 'post_card')",
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("protokolle", ["umsatz_ust_basis"]);
  pgm.dropColumns("app_settings", ["umsatz_ust_basis"]);
};
