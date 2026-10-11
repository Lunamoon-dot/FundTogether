CREATE TABLE "hed_evidence_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_metadata_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"request_draft_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"original_name" varchar(200) NOT NULL,
	"media_type" varchar(100) NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(66) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_evidence_document_kind_check" CHECK ("hed_evidence_documents"."kind" IN ('DELIVERY', 'OUTCOME')),
	CONSTRAINT "hed_evidence_document_size_check" CHECK ("hed_evidence_documents"."byte_size" > 0 AND "hed_evidence_documents"."byte_size" <= 10485760),
	CONSTRAINT "hed_evidence_document_hash_check" CHECK ("hed_evidence_documents"."sha256" ~ '^0x[0-9a-f]{64}$' AND "hed_evidence_documents"."sha256" !~ '^0x0+$')
);
--> statement-breakpoint
ALTER TABLE "hed_evidence_packages" ADD COLUMN "campaign_metadata_id" uuid;--> statement-breakpoint
ALTER TABLE "hed_evidence_documents" ADD CONSTRAINT "hed_evidence_documents_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_evidence_documents" ADD CONSTRAINT "hed_evidence_documents_activity_id_hed_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."hed_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_evidence_documents" ADD CONSTRAINT "hed_evidence_documents_request_draft_id_hed_request_drafts_id_fk" FOREIGN KEY ("request_draft_id") REFERENCES "public"."hed_request_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_evidence_documents" ADD CONSTRAINT "hed_evidence_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hed_evidence_document_scope_idx" ON "hed_evidence_documents" USING btree ("campaign_metadata_id","activity_id","created_at");--> statement-breakpoint
ALTER TABLE "hed_evidence_packages" ADD CONSTRAINT "hed_evidence_packages_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;