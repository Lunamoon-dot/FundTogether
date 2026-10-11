CREATE TABLE "hed_request_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_draft_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_request_review_outcome_check" CHECK (("hed_request_reviews"."content"->>'outcome') IN ('MET','NOT_MET','NEEDS_INFO'))
);
--> statement-breakpoint
ALTER TABLE "hed_request_reviews" ADD CONSTRAINT "hed_request_reviews_request_draft_id_hed_request_drafts_id_fk" FOREIGN KEY ("request_draft_id") REFERENCES "public"."hed_request_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hed_request_reviews" ADD CONSTRAINT "hed_request_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hed_request_review_criterion_version_idx" ON "hed_request_reviews" USING btree ("request_draft_id",("content"->>'evidenceVersion'),("content"->>'criterionId'));