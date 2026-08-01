WITH "protokoll_mapping" AS (
	SELECT
		"protokolle"."id",
		CASE
			WHEN "anlass_katalog"."name" IN ('Biergarten', 'Donnerstag (Wirtschaftsdienst)')
				THEN 'wirtschaftsbetrieb'
			WHEN "anlass_katalog"."name" IN ('Bürgerversammlung', 'Frauenbund', 'Haxenabend', 'Public Viewing', 'Sommerfest')
				THEN 'veranstaltungen'
			WHEN "anlass_katalog"."name" = 'Seniorennachmittag'
				THEN 'seniorennachmittag'
			WHEN "anlass_katalog"."name" = 'Heimspiel (Fußball)'
				AND lower(trim("protokolle"."kassenbezeichnung")) = 'sportplatz'
				THEN 'eintrittsgelder'
			WHEN "anlass_katalog"."name" IN ('Heimspiel (Fußball)', 'Korbball')
				THEN 'verkauf_spielfeld'
			WHEN "anlass_katalog"."name" = 'Tischtennisabteilung'
				THEN 'sonstiges'
			ELSE NULL
		END AS "umsatzbereich"
	FROM "protokolle"
	LEFT JOIN "anlass_katalog"
		ON "anlass_katalog"."id" = "protokolle"."anlass_katalog_id"
	WHERE "protokolle"."umsatzbereich" IS NULL
),
"updated_protokolle" AS (
	UPDATE "protokolle"
	SET "umsatzbereich" = "protokoll_mapping"."umsatzbereich"
	FROM "protokoll_mapping"
	WHERE "protokolle"."id" = "protokoll_mapping"."id"
		AND "protokoll_mapping"."umsatzbereich" IS NOT NULL
	RETURNING "protokolle"."umsatzbereich"
),
"historical_mapping" AS (
	SELECT
		"historical_revenues"."id",
		CASE
			WHEN "anlass_katalog"."name" IN ('Biergarten', 'Donnerstag (Wirtschaftsdienst)')
				THEN 'wirtschaftsbetrieb'
			WHEN "anlass_katalog"."name" IN ('Bürgerversammlung', 'Frauenbund', 'Haxenabend', 'Public Viewing', 'Sommerfest')
				THEN 'veranstaltungen'
			WHEN "anlass_katalog"."name" = 'Seniorennachmittag'
				THEN 'seniorennachmittag'
			ELSE NULL
		END AS "umsatzbereich"
	FROM "historical_revenues"
	LEFT JOIN "anlass_katalog"
		ON "anlass_katalog"."id" = "historical_revenues"."anlass_katalog_id"
	WHERE "historical_revenues"."umsatzbereich" IS NULL
),
"updated_historical" AS (
	UPDATE "historical_revenues"
	SET "umsatzbereich" = "historical_mapping"."umsatzbereich"
	FROM "historical_mapping"
	WHERE "historical_revenues"."id" = "historical_mapping"."id"
		AND "historical_mapping"."umsatzbereich" IS NOT NULL
	RETURNING "historical_revenues"."umsatzbereich"
)
INSERT INTO "audit_events" (
	"category",
	"action",
	"success",
	"subject_type",
	"subject_id",
	"subject_label",
	"metadata"
)
VALUES (
	'umsaetze',
	'umsaetze.areas_backfilled',
	true,
	'migration',
	'0015_backfill_revenue_areas',
	'Umsatzbereiche bestehender Datensätze zugeordnet',
	jsonb_build_object(
		'protokolle', COALESCE(
			(
				SELECT jsonb_object_agg("umsatzbereich", "anzahl")
				FROM (
					SELECT "umsatzbereich", count(*) AS "anzahl"
					FROM "updated_protokolle"
					GROUP BY "umsatzbereich"
				) AS "protokoll_counts"
			),
			'{}'::jsonb
		),
		'historical_revenues', COALESCE(
			(
				SELECT jsonb_object_agg("umsatzbereich", "anzahl")
				FROM (
					SELECT "umsatzbereich", count(*) AS "anzahl"
					FROM "updated_historical"
					GROUP BY "umsatzbereich"
				) AS "historical_counts"
			),
			'{}'::jsonb
		)
	)
);
