CREATE TABLE "hed_request_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_metadata_id" uuid NOT NULL,
	"vendor_verification_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"request_hash" varchar(66),
	"frozen_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_request_draft_value_check" CHECK ("hed_request_drafts"."version" > 0 AND ("hed_request_drafts"."content"->>'amount') ~ '^[1-9][0-9]*$' AND ("hed_request_drafts"."content"->>'deposit') ~ '^(0|[1-9][0-9]*)$' AND (("hed_request_drafts"."content"->>'deposit')::numeric <= ("hed_request_drafts"."content"->>'amount')::numeric)),
	CONSTRAINT "hed_request_draft_freeze_check" CHECK (("hed_request_drafts"."frozen_at" IS NULL AND "hed_request_drafts"."request_hash" IS NULL) OR ("hed_request_drafts"."frozen_at" IS NOT NULL AND "hed_request_drafts"."request_hash" ~ '^0x[0-9a-f]{64}$' AND "hed_request_drafts"."request_hash" !~ '^0x0+$'))
);
--> statement-breakpoint
CREATE TABLE "hed_vendor_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_wallet" varchar(42) NOT NULL,
	"content" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"report_bytes" text NOT NULL,
	"report_hash" varchar(66) NOT NULL,
	"checked_by" uuid NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_vendor_verifications_report_hash_unique" UNIQUE("report_hash"),
	CONSTRAINT "hed_vendor_verification_status_check" CHECK ("hed_vendor_verifications"."status" IN ('VERIFIED', 'REVOKED')),
	CONSTRAINT "hed_vendor_wallet_check" CHECK ("hed_vendor_verifications"."vendor_wallet" ~ '^0x[0-9a-f]{40}$' AND "hed_vendor_verifications"."vendor_wallet" !~ '^0x0+$'),
	CONSTRAINT "hed_vendor_report_hash_check" CHECK ("hed_vendor_verifications"."report_hash" ~ '^0x[0-9a-f]{64}$' AND "hed_vendor_verifications"."report_hash" !~ '^0x0+$')
);
--> statement-breakpoint
ALTER TABLE "hed_request_drafts" ADD CONSTRAINT "hed_request_drafts_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_request_drafts" ADD CONSTRAINT "hed_request_drafts_vendor_verification_id_hed_vendor_verifications_id_fk" FOREIGN KEY ("vendor_verification_id") REFERENCES "public"."hed_vendor_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_request_drafts" ADD CONSTRAINT "hed_request_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_vendor_verifications" ADD CONSTRAINT "hed_vendor_verifications_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hed_request_campaign_idx" ON "hed_request_drafts" USING btree ("campaign_metadata_id","created_at");--> statement-breakpoint
CREATE INDEX "hed_vendor_wallet_history_idx" ON "hed_vendor_verifications" USING btree ("vendor_wallet","created_at");
