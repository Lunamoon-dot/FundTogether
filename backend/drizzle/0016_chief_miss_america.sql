CREATE TABLE "disbursement_campaigns" (
	"campaign_metadata_id" uuid PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"deployment_id" varchar(66) NOT NULL,
	"contract_address" varchar(42) NOT NULL,
	"onchain_campaign_id" numeric(78, 0),
	"commitment_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disbursement_campaign_identity_check" CHECK ("disbursement_campaigns"."chain_id" > 0 AND "disbursement_campaigns"."deployment_id" ~ '^0x[0-9a-f]{64}$' AND "disbursement_campaigns"."contract_address" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "disbursement_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_metadata_id" uuid NOT NULL,
	"onchain_request_id" numeric(78, 0),
	"request_version" integer NOT NULL,
	"request_hash" varchar(66) NOT NULL,
	"vendor_wallet" varchar(42) NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"deposit" numeric(78, 0) NOT NULL,
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disbursement_request_values_check" CHECK ("disbursement_requests"."request_version" > 0 AND "disbursement_requests"."amount" > 0 AND "disbursement_requests"."deposit" >= 0 AND "disbursement_requests"."deposit" <= "disbursement_requests"."amount")
);
--> statement-breakpoint
CREATE TABLE "disbursement_review_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"evidence_version" integer NOT NULL,
	"criterion_id" varchar(32) NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"reason_code" varchar(64) NOT NULL,
	"reason" text NOT NULL,
	"manifest_hash" varchar(66) NOT NULL,
	"public_hash" varchar(66),
	"reviewed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disbursement_review_outcome_check" CHECK ("disbursement_review_records"."outcome" IN ('MET', 'NOT_MET', 'NEEDS_INFO') AND "disbursement_review_records"."evidence_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "disbursement_campaigns" ADD CONSTRAINT "disbursement_campaigns_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disbursement_requests" ADD CONSTRAINT "disbursement_requests_campaign_metadata_id_disbursement_campaigns_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."disbursement_campaigns"("campaign_metadata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disbursement_review_records" ADD CONSTRAINT "disbursement_review_records_request_id_disbursement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."disbursement_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disbursement_review_records" ADD CONSTRAINT "disbursement_review_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disbursement_campaign_identity_idx" ON "disbursement_campaigns" USING btree ("chain_id","deployment_id","contract_address","onchain_campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disbursement_request_version_idx" ON "disbursement_requests" USING btree ("campaign_metadata_id","onchain_request_id","request_version");--> statement-breakpoint
CREATE UNIQUE INDEX "disbursement_review_criterion_version_idx" ON "disbursement_review_records" USING btree ("request_id","evidence_version","criterion_id");