CREATE TABLE "hed_campaign_drafts" (
	"campaign_metadata_id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"goal" numeric(78, 0) NOT NULL,
	"funding_duration" integer NOT NULL,
	"commitment_hash" varchar(66),
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_campaign_draft_value_check" CHECK ("hed_campaign_drafts"."goal" > 0 AND "hed_campaign_drafts"."funding_duration" >= 86400 AND "hed_campaign_drafts"."funding_duration" <= 2592000),
	CONSTRAINT "hed_campaign_draft_freeze_check" CHECK (("hed_campaign_drafts"."frozen_at" IS NULL AND "hed_campaign_drafts"."commitment_hash" IS NULL) OR ("hed_campaign_drafts"."frozen_at" IS NOT NULL AND "hed_campaign_drafts"."commitment_hash" ~ '^0x[0-9a-f]{64}$' AND "hed_campaign_drafts"."commitment_hash" !~ '^0x0+$'))
);
--> statement-breakpoint
ALTER TABLE "hed_campaign_drafts" ADD CONSTRAINT "hed_campaign_drafts_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;