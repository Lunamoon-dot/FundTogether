CREATE TABLE "hed_evidence_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hed_evidence_package_kind_check" CHECK (("hed_evidence_packages"."content"->>'kind') IN ('DELIVERY','OUTCOME'))
);
--> statement-breakpoint
ALTER TABLE "hed_evidence_packages" ADD CONSTRAINT "hed_evidence_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hed_evidence_package_manifest_idx" ON "hed_evidence_packages" USING btree (("content"->>'manifestHash'));