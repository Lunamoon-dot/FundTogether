CREATE TABLE "campaign_submissions" (
	"campaign_metadata_id" uuid PRIMARY KEY NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_submissions" ADD CONSTRAINT "campaign_submissions_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;