CREATE TABLE "advance_campaign_plans" (
	"campaign_metadata_id" uuid PRIMARY KEY NOT NULL,
	"deployment_id" varchar(66) NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" varchar(42) NOT NULL,
	"gift_config" jsonb NOT NULL,
	"funding_duration" numeric(78, 0) NOT NULL,
	"organizer_wallet" varchar(42),
	"draft_key" varchar(66),
	"frozen_plan_bytes" text,
	"plan_hash" varchar(66),
	"frozen_at" timestamp with time zone,
	CONSTRAINT "advance_plan_context_check" CHECK ("advance_campaign_plans"."chain_id" = 31338 AND "advance_campaign_plans"."deployment_id" ~ '^0x[0-9a-f]{64}$' AND "advance_campaign_plans"."deployment_id" !~ '^0x0+$' AND "advance_campaign_plans"."contract_address" ~ '^0x[0-9a-f]{40}$' AND "advance_campaign_plans"."contract_address" !~ '^0x0+$'),
	CONSTRAINT "advance_plan_duration_check" CHECK ("advance_campaign_plans"."funding_duration" >= 86400 AND "advance_campaign_plans"."funding_duration" <= 2592000),
	CONSTRAINT "advance_plan_gift_check" CHECK (("advance_campaign_plans"."gift_config"->>'activityType' = 'GIFT_DISTRIBUTION' AND "advance_campaign_plans"."gift_config"->>'channel' IN ('DIRECT', 'INSTITUTION') AND "advance_campaign_plans"."gift_config"->>'checklistVersion' = 'gift.v1' AND jsonb_typeof("advance_campaign_plans"."gift_config"->'stages') = 'array' AND jsonb_array_length("advance_campaign_plans"."gift_config"->'stages') > 0) IS TRUE),
	CONSTRAINT "advance_plan_freeze_check" CHECK (("advance_campaign_plans"."frozen_at" IS NULL AND "advance_campaign_plans"."plan_hash" IS NULL AND "advance_campaign_plans"."frozen_plan_bytes" IS NULL AND "advance_campaign_plans"."draft_key" IS NULL AND "advance_campaign_plans"."organizer_wallet" IS NULL) OR ("advance_campaign_plans"."frozen_at" IS NOT NULL AND "advance_campaign_plans"."plan_hash" IS NOT NULL AND "advance_campaign_plans"."plan_hash" ~ '^0x[0-9a-f]{64}$' AND "advance_campaign_plans"."plan_hash" !~ '^0x0+$' AND "advance_campaign_plans"."frozen_plan_bytes" IS NOT NULL AND "advance_campaign_plans"."draft_key" IS NOT NULL AND "advance_campaign_plans"."draft_key" ~ '^0x[0-9a-f]{64}$' AND "advance_campaign_plans"."draft_key" !~ '^0x0+$' AND "advance_campaign_plans"."organizer_wallet" IS NOT NULL AND "advance_campaign_plans"."organizer_wallet" ~ '^0x[0-9a-f]{40}$' AND "advance_campaign_plans"."organizer_wallet" !~ '^0x0+$'))
);
--> statement-breakpoint
CREATE TABLE "advance_campaign_projection" (
	"stream_id" text NOT NULL,
	"onchain_campaign_id" numeric(78, 0) NOT NULL,
	"metadata_id" uuid,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "advance_campaign_projection_stream_id_onchain_campaign_id_pk" PRIMARY KEY("stream_id","onchain_campaign_id"),
	CONSTRAINT "advance_projection_id_check" CHECK ("advance_campaign_projection"."onchain_campaign_id" >= 0 AND "advance_campaign_projection"."onchain_campaign_id" <= 115792089237316195423570985008687907853269984665640564039457584007913129639935)
);
--> statement-breakpoint
CREATE TABLE "organization_verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"report_bytes" text NOT NULL,
	"hash" varchar(66) NOT NULL,
	"checked_by" uuid NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_verification_records_hash_unique" UNIQUE("hash"),
	CONSTRAINT "organization_verification_status_check" CHECK ("organization_verification_records"."status" IN ('VERIFIED', 'REVOKED')),
	CONSTRAINT "organization_verification_hash_check" CHECK ("organization_verification_records"."hash" ~ '^0x[0-9a-f]{64}$' AND "organization_verification_records"."hash" !~ '^0x0+$')
);
--> statement-breakpoint
ALTER TABLE "advance_campaign_plans" ADD CONSTRAINT "advance_campaign_plans_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_campaign_projection" ADD CONSTRAINT "advance_campaign_projection_stream_id_indexer_streams_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."indexer_streams"("stream_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_campaign_projection" ADD CONSTRAINT "advance_campaign_projection_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_records" ADD CONSTRAINT "organization_verification_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_records" ADD CONSTRAINT "organization_verification_records_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advance_plan_draft_key_idx" ON "advance_campaign_plans" USING btree ("deployment_id","organizer_wallet","draft_key");