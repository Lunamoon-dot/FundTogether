CREATE TABLE "hed_request_evidence_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_draft_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"original_name" varchar(200) NOT NULL,
	"media_type" varchar(100) NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(66) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_request_evidence_kind_check" CHECK ("hed_request_evidence_documents"."kind" IN ('QUOTE', 'NEED', 'TERMS', 'OTHER')),
	CONSTRAINT "hed_request_evidence_size_check" CHECK ("hed_request_evidence_documents"."byte_size" > 0 AND "hed_request_evidence_documents"."byte_size" <= 10485760),
	CONSTRAINT "hed_request_evidence_hash_check" CHECK ("hed_request_evidence_documents"."sha256" ~ '^0x[0-9a-f]{64}$' AND "hed_request_evidence_documents"."sha256" !~ '^0x0+$')
);
--> statement-breakpoint
ALTER TABLE "hed_request_evidence_documents" ADD CONSTRAINT "hed_request_evidence_documents_request_draft_id_hed_request_drafts_id_fk" FOREIGN KEY ("request_draft_id") REFERENCES "public"."hed_request_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_request_evidence_documents" ADD CONSTRAINT "hed_request_evidence_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hed_request_evidence_idx" ON "hed_request_evidence_documents" USING btree ("request_draft_id","created_at");