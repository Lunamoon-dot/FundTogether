CREATE TABLE "campaign_evidence_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_metadata_id" uuid NOT NULL,
	"milestone_index" varchar(128) NOT NULL,
	"organizer_user_id" uuid NOT NULL,
	"submission_version" integer NOT NULL,
	"draft_revision" integer NOT NULL,
	"manifest_bytes" text NOT NULL,
	"evidence_hash" varchar(66) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_evidence_packages" ADD CONSTRAINT "campaign_evidence_packages_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_evidence_packages" ADD CONSTRAINT "campaign_evidence_packages_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_packages_draft_version_idx" ON "campaign_evidence_packages" USING btree ("campaign_metadata_id","milestone_index","draft_revision","submission_version");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_packages_hash_idx" ON "campaign_evidence_packages" USING btree ("evidence_hash");