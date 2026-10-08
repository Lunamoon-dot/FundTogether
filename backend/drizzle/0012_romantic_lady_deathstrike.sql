CREATE TABLE "evidence_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_publications" (
	"hash" varchar(66) PRIMARY KEY NOT NULL,
	"package_id" uuid NOT NULL,
	"manifest_bytes" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_publications_package_id_unique" UNIQUE("package_id")
);
--> statement-breakpoint
CREATE TABLE "milestone_records" (
	"hash" varchar(66) PRIMARY KEY NOT NULL,
	"record_bytes" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_access_log" ADD CONSTRAINT "evidence_access_log_package_id_campaign_evidence_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."campaign_evidence_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_access_log" ADD CONSTRAINT "evidence_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_publications" ADD CONSTRAINT "evidence_publications_package_id_campaign_evidence_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."campaign_evidence_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_publications" ADD CONSTRAINT "evidence_publications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_records" ADD CONSTRAINT "milestone_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;