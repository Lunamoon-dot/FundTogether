ALTER TABLE "campaign_metadata" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_metadata" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_metadata" ADD CONSTRAINT "campaign_metadata_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_metadata" ADD CONSTRAINT "campaign_metadata_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_metadata_organization_idx" ON "campaign_metadata" USING btree ("organization_id");
--> statement-breakpoint
UPDATE "campaign_metadata"
SET "created_by_user_id" = "organizer_user_id"
WHERE "created_by_user_id" IS NULL AND "organizer_user_id" IS NOT NULL;
