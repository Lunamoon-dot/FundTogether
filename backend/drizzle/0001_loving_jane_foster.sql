CREATE TABLE "campaign_evidence_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_metadata_id" uuid NOT NULL,
	"milestone_index" varchar(128) NOT NULL,
	"organizer_user_id" uuid NOT NULL,
	"evidence_schema_version" varchar(16) DEFAULT '0.1' NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_evidence_drafts" ADD CONSTRAINT "campaign_evidence_drafts_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_evidence_drafts" ADD CONSTRAINT "campaign_evidence_drafts_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_evidence_drafts_campaign_milestone_idx" ON "campaign_evidence_drafts" USING btree ("campaign_metadata_id","milestone_index");