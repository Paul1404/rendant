CREATE TABLE "belegnummer_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "belegnummer_sequences_year_check" CHECK ("belegnummer_sequences"."year" >= 2000),
	CONSTRAINT "belegnummer_sequences_next_sequence_check" CHECK ("belegnummer_sequences"."next_sequence" >= 1)
);
