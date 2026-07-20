CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"actor_name" text,
	"actor_role" text,
	"subject_type" text,
	"subject_id" text,
	"subject_label" text,
	"request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_audit_events_event_at" ON "audit_events" USING btree ("event_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_category_event_at" ON "audit_events" USING btree ("category","event_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_action_event_at" ON "audit_events" USING btree ("action","event_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_actor_user_id" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_subject" ON "audit_events" USING btree ("subject_type","subject_id");