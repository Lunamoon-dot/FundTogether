CREATE TABLE "hed_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_metadata_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"commitment_hash" varchar(66),
	"onchain_activity_id" numeric(78, 0),
	"frozen_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_activity_ceiling_check" CHECK (("hed_activities"."content"->>'ceiling') ~ '^[1-9][0-9]*$'),
	CONSTRAINT "hed_activity_freeze_check" CHECK (("hed_activities"."frozen_at" IS NULL AND "hed_activities"."commitment_hash" IS NULL) OR ("hed_activities"."frozen_at" IS NOT NULL AND "hed_activities"."commitment_hash" ~ '^0x[0-9a-f]{64}$' AND "hed_activities"."commitment_hash" !~ '^0x0+$'))
);
--> statement-breakpoint
ALTER TABLE "hed_request_drafts" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "hed_activities" ADD CONSTRAINT "hed_activities_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_activities" ADD CONSTRAINT "hed_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hed_activity_chain_identity_idx" ON "hed_activities" USING btree ("campaign_metadata_id","onchain_activity_id");--> statement-breakpoint
ALTER TABLE "hed_request_drafts" ADD CONSTRAINT "hed_request_drafts_activity_id_hed_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."hed_activities"("id") ON DELETE no action ON UPDATE no action;
