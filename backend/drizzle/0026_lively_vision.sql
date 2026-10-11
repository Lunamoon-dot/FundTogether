CREATE TABLE "hed_activity_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_activity_review_outcome_check" CHECK (("hed_activity_reviews"."content"->>'outcome') IN ('MET','NOT_MET','NEEDS_INFO'))
);
--> statement-breakpoint
ALTER TABLE "hed_activity_reviews" ADD CONSTRAINT "hed_activity_reviews_activity_id_hed_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."hed_activities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hed_activity_reviews" ADD CONSTRAINT "hed_activity_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "hed_activity_review_criterion_version_idx" ON "hed_activity_reviews" USING btree ("activity_id",("content"->>'evidenceVersion'),("content"->>'criterionId'));
