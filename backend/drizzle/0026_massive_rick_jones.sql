CREATE TABLE "reward_creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(150) NOT NULL,
	"bio" text NOT NULL,
	"ip_declaration" text NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_creator_profile_status_check" CHECK ("reward_creator_profiles"."status" IN ('PENDING', 'VERIFIED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "reward_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"organization_id" uuid,
	"title" varchar(200) NOT NULL,
	"pitch" varchar(500) NOT NULL,
	"story" text NOT NULL,
	"category" varchar(50) DEFAULT 'COMICS' NOT NULL,
	"commitment_hash" varchar(66),
	"goal" numeric(78, 0) NOT NULL,
	"funding_duration" integer DEFAULT 2592000 NOT NULL,
	"policy_hash" varchar(66) NOT NULL,
	"onchain_campaign_id" numeric(78, 0),
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_campaign_goal_check" CHECK ("reward_campaigns"."goal" > 0),
	CONSTRAINT "reward_campaign_status_check" CHECK ("reward_campaigns"."status" IN ('DRAFT', 'FROZEN', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'COMPLETED', 'STOPPED'))
);
--> statement-breakpoint
CREATE TABLE "reward_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"resolver_user_id" uuid NOT NULL,
	"outcome" varchar(32) NOT NULL,
	"decision_reason" text NOT NULL,
	"commitment_hash" varchar(66) NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_review_outcome_check" CHECK ("reward_reviews"."outcome" IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "reward_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"tier_index" integer NOT NULL,
	"title" varchar(150) NOT NULL,
	"description" text NOT NULL,
	"price" numeric(78, 0) NOT NULL,
	"max_quantity" integer NOT NULL,
	"pledged_quantity" integer DEFAULT 0 NOT NULL,
	"is_digital" boolean DEFAULT false NOT NULL,
	"reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_tier_price_check" CHECK ("reward_tiers"."price" > 0),
	CONSTRAINT "reward_tier_qty_check" CHECK ("reward_tiers"."max_quantity" > 0 AND "reward_tiers"."pledged_quantity" >= 0 AND "reward_tiers"."pledged_quantity" <= "reward_tiers"."max_quantity")
);
--> statement-breakpoint
CREATE TABLE "reward_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"onchain_tier_index" integer,
	"backer_user_id" uuid NOT NULL,
	"backer_wallet" varchar(42) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount_paid" numeric(78, 0) NOT NULL,
	"tx_hash" varchar(66),
	"log_index" integer,
	"status" varchar(32) DEFAULT 'PENDING_FUNDING' NOT NULL,
	"digital_access_code" varchar(100),
	"shipping_encrypted" text,
	"shipping_iv" varchar(64),
	"shipping_tag" varchar(64),
	"shipping_updated_at" timestamp with time zone,
	"shipping_full_name" varchar(150),
	"shipping_address" text,
	"shipping_phone" varchar(50),
	"carrier_tracking_code" varchar(100),
	"delivered_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_entitlement_status_check" CHECK ("reward_entitlements"."status" IN ('PENDING_FUNDING', 'ACTIVE', 'REDEEM_REQUESTED', 'FULFILLING', 'DELIVERED', 'CONFIRMED', 'DISPUTED', 'REFUND_ELIGIBLE', 'REFUNDED'))
);
--> statement-breakpoint
CREATE TABLE "reward_fulfillment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"batch_number" integer NOT NULL,
	"title" varchar(150) NOT NULL,
	"carrier" varchar(100) NOT NULL,
	"manifest_hash" varchar(66) NOT NULL,
	"shipped_item_count" integer NOT NULL,
	"shipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_batch_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"carrier_tracking_code" varchar(100) NOT NULL,
	"shipped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"backer_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence_hash" varchar(66),
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_dispute_status_check" CHECK ("reward_disputes"."status" IN ('OPEN', 'RESOLVED_CREATOR', 'RESOLVED_BACKER', 'DISMISSED'))
);
--> statement-breakpoint
CREATE TABLE "reward_campaign_projection" (
	"stream_id" text NOT NULL,
	"onchain_campaign_id" numeric(78, 0) NOT NULL,
	"campaign_metadata_id" uuid,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "reward_campaign_projection_stream_id_onchain_campaign_id_pk" PRIMARY KEY("stream_id","onchain_campaign_id")
);
--> statement-breakpoint
ALTER TABLE "reward_creator_profiles" ADD CONSTRAINT "reward_creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_creator_profiles" ADD CONSTRAINT "reward_creator_profiles_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_campaigns" ADD CONSTRAINT "reward_campaigns_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_campaigns" ADD CONSTRAINT "reward_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_reviews" ADD CONSTRAINT "reward_reviews_campaign_id_reward_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."reward_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_reviews" ADD CONSTRAINT "reward_reviews_resolver_user_id_users_id_fk" FOREIGN KEY ("resolver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_tiers" ADD CONSTRAINT "reward_tiers_campaign_id_reward_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."reward_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entitlements" ADD CONSTRAINT "reward_entitlements_campaign_id_reward_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."reward_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entitlements" ADD CONSTRAINT "reward_entitlements_tier_id_reward_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."reward_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entitlements" ADD CONSTRAINT "reward_entitlements_backer_user_id_users_id_fk" FOREIGN KEY ("backer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_fulfillment_batches" ADD CONSTRAINT "reward_fulfillment_batches_campaign_id_reward_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."reward_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_batch_entitlements" ADD CONSTRAINT "reward_batch_entitlements_batch_id_reward_fulfillment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."reward_fulfillment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_batch_entitlements" ADD CONSTRAINT "reward_batch_entitlements_entitlement_id_reward_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."reward_entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_disputes" ADD CONSTRAINT "reward_disputes_entitlement_id_reward_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."reward_entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_disputes" ADD CONSTRAINT "reward_disputes_backer_user_id_users_id_fk" FOREIGN KEY ("backer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_disputes" ADD CONSTRAINT "reward_disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_campaign_projection" ADD CONSTRAINT "reward_campaign_projection_stream_id_indexer_streams_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."indexer_streams"("stream_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_campaign_projection" ADD CONSTRAINT "reward_campaign_projection_campaign_metadata_id_reward_campaigns_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."reward_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_creator_profile_user_idx" ON "reward_creator_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reward_campaign_creator_idx" ON "reward_campaigns" USING btree ("creator_user_id");--> statement-breakpoint
CREATE INDEX "reward_campaign_status_idx" ON "reward_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reward_review_campaign_idx" ON "reward_reviews" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_tier_campaign_index_idx" ON "reward_tiers" USING btree ("campaign_id","tier_index");--> statement-breakpoint
CREATE INDEX "reward_entitlement_campaign_idx" ON "reward_entitlements" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "reward_entitlement_backer_idx" ON "reward_entitlements" USING btree ("backer_user_id");--> statement-breakpoint
CREATE INDEX "reward_entitlement_tx_hash_idx" ON "reward_entitlements" USING btree ("tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_batch_campaign_idx" ON "reward_fulfillment_batches" USING btree ("campaign_id","batch_number");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_batch_entitlement_unique_idx" ON "reward_batch_entitlements" USING btree ("batch_id","entitlement_id");--> statement-breakpoint
CREATE INDEX "reward_dispute_entitlement_idx" ON "reward_disputes" USING btree ("entitlement_id");