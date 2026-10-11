ALTER TABLE "hed_request_drafts" ALTER COLUMN "activity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "disbursement_requests" ADD COLUMN "request_draft_id" uuid;--> statement-breakpoint
ALTER TABLE "disbursement_requests" ADD CONSTRAINT "disbursement_requests_request_draft_id_hed_request_drafts_id_fk" FOREIGN KEY ("request_draft_id") REFERENCES "public"."hed_request_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disbursement_request_draft_identity_idx" ON "disbursement_requests" USING btree ("request_draft_id");