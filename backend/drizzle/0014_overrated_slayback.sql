CREATE TABLE "organization_verification_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_verification_audit_action_check" CHECK ("organization_verification_audit"."action" IN ('CREATED','SAVED','DOCUMENT_ADDED','SUBMITTED','CANCELLED','APPROVED','CHANGES_REQUESTED','REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "organization_verification_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"original_name" varchar(200) NOT NULL,
	"media_type" varchar(100) NOT NULL,
	"byte_size" integer NOT NULL,
	"hash" varchar(66) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_documents_kind_check" CHECK ("organization_verification_documents"."kind" IN ('IDENTITY','REPRESENTATION','ACTIVITY','OTHER')),
	CONSTRAINT "organization_documents_size_check" CHECK ("organization_verification_documents"."byte_size" > 0 AND "organization_verification_documents"."byte_size" <= 10485760),
	CONSTRAINT "organization_documents_hash_check" CHECK ("organization_verification_documents"."hash" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "organization_verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"policy_id" varchar(100) NOT NULL,
	"snapshot_bytes" text,
	"snapshot_hash" varchar(66),
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_note" text,
	"missing_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_record_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_verification_requests_verification_record_id_unique" UNIQUE("verification_record_id"),
	CONSTRAINT "organization_requests_status_check" CHECK ("organization_verification_requests"."status" IN ('DRAFT','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED')),
	CONSTRAINT "organization_requests_revision_check" CHECK ("organization_verification_requests"."revision" > 0),
	CONSTRAINT "organization_requests_submission_check" CHECK (("organization_verification_requests"."status" = 'DRAFT' AND "organization_verification_requests"."submitted_at" IS NULL AND "organization_verification_requests"."snapshot_bytes" IS NULL AND "organization_verification_requests"."snapshot_hash" IS NULL) OR ("organization_verification_requests"."status" <> 'DRAFT' AND "organization_verification_requests"."submitted_at" IS NOT NULL AND "organization_verification_requests"."snapshot_bytes" IS NOT NULL AND "organization_verification_requests"."snapshot_hash" ~ '^0x[0-9a-f]{64}$')),
	CONSTRAINT "organization_requests_decision_check" CHECK (("organization_verification_requests"."status" IN ('APPROVED','CHANGES_REQUESTED','REJECTED') AND "organization_verification_requests"."reviewed_at" IS NOT NULL AND "organization_verification_requests"."reviewed_by" IS NOT NULL AND length("organization_verification_requests"."review_note") > 0) OR ("organization_verification_requests"."status" NOT IN ('APPROVED','CHANGES_REQUESTED','REJECTED') AND "organization_verification_requests"."reviewed_at" IS NULL AND "organization_verification_requests"."reviewed_by" IS NULL AND "organization_verification_requests"."review_note" IS NULL)),
	CONSTRAINT "organization_requests_approval_check" CHECK (("organization_verification_requests"."status" = 'APPROVED') = ("organization_verification_requests"."verification_record_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "organization_verification_audit" ADD CONSTRAINT "organization_verification_audit_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_audit" ADD CONSTRAINT "organization_verification_audit_request_id_organization_verification_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."organization_verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_audit" ADD CONSTRAINT "organization_verification_audit_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_documents" ADD CONSTRAINT "organization_verification_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_documents" ADD CONSTRAINT "organization_verification_documents_request_id_organization_verification_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."organization_verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_documents" ADD CONSTRAINT "organization_verification_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_requests" ADD CONSTRAINT "organization_verification_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_requests" ADD CONSTRAINT "organization_verification_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_requests" ADD CONSTRAINT "organization_verification_requests_verification_record_id_organization_verification_records_id_fk" FOREIGN KEY ("verification_record_id") REFERENCES "public"."organization_verification_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verification_requests" ADD CONSTRAINT "organization_verification_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_verification_audit_org_idx" ON "organization_verification_audit" USING btree ("organization_id","happened_at");--> statement-breakpoint
CREATE INDEX "organization_documents_org_idx" ON "organization_verification_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_requests_history_idx" ON "organization_verification_requests" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_requests_one_open_idx" ON "organization_verification_requests" USING btree ("organization_id") WHERE "organization_verification_requests"."status" IN ('DRAFT', 'UNDER_REVIEW');
--> statement-breakpoint
CREATE FUNCTION protect_organization_verification_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME <> 'organization_verification_requests' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Organization verification history is immutable';
  END IF;
  IF OLD.status <> 'DRAFT' AND (NEW.content IS DISTINCT FROM OLD.content
    OR NEW.snapshot_bytes IS DISTINCT FROM OLD.snapshot_bytes OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.policy_id IS DISTINCT FROM OLD.policy_id) THEN
    RAISE EXCEPTION 'Submitted organization verification content is immutable';
  END IF;
  IF OLD.status NOT IN ('DRAFT', 'UNDER_REVIEW') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Organization verification decision is final';
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.created_by <> OLD.created_by OR NEW.id <> OLD.id
    OR NEW.created_at <> OLD.created_at OR (OLD.status = 'UNDER_REVIEW' AND NEW.status = 'DRAFT') THEN
    RAISE EXCEPTION 'Organization verification identity/state cannot be rewritten';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organization_requests_preserve_history BEFORE UPDATE OR DELETE ON organization_verification_requests
FOR EACH ROW EXECUTE FUNCTION protect_organization_verification_history();
--> statement-breakpoint
CREATE TRIGGER organization_documents_preserve_history BEFORE UPDATE OR DELETE ON organization_verification_documents
FOR EACH ROW EXECUTE FUNCTION protect_organization_verification_history();
--> statement-breakpoint
CREATE TRIGGER organization_audit_preserve_history BEFORE UPDATE OR DELETE ON organization_verification_audit
FOR EACH ROW EXECUTE FUNCTION protect_organization_verification_history();
