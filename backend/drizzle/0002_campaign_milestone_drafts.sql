CREATE TABLE "campaign_milestone_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_metadata_id" uuid NOT NULL,
	"milestone_index" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_milestone_drafts_index_nonnegative" CHECK ("campaign_milestone_drafts"."milestone_index" >= 0),
	CONSTRAINT "campaign_milestone_drafts_criteria_array" CHECK (jsonb_typeof("campaign_milestone_drafts"."acceptance_criteria") = 'array')
);
--> statement-breakpoint
ALTER TABLE "campaign_metadata" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_milestone_drafts" ADD CONSTRAINT "campaign_milestone_drafts_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_milestone_drafts_campaign_milestone_idx" ON "campaign_milestone_drafts" USING btree ("campaign_metadata_id","milestone_index");