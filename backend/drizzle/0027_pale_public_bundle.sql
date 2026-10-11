ALTER TABLE "hed_evidence_documents" ADD COLUMN "visibility" varchar(16) DEFAULT 'PRIVATE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "hed_evidence_documents" ADD CONSTRAINT "hed_evidence_document_visibility_check" CHECK ("hed_evidence_documents"."visibility" IN ('PRIVATE', 'PUBLIC'));
