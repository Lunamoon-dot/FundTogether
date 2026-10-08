CREATE TABLE "campaign_reviews" (
	"campaign_metadata_id" uuid PRIMARY KEY NOT NULL,
	"decision" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"reviewer_wallet" varchar(42) NOT NULL,
	"revision" integer NOT NULL,
	"dossier_hash" varchar(66) NOT NULL,
	"checked_block" varchar(128) NOT NULL,
	"checked_block_hash" varchar(66) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_revisions" (
	"parent_id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	CONSTRAINT "campaign_revisions_child_id_unique" UNIQUE("child_id")
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"roles" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_reviews" ADD CONSTRAINT "campaign_reviews_campaign_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("campaign_metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_reviews" ADD CONSTRAINT "campaign_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_revisions" ADD CONSTRAINT "campaign_revisions_parent_id_campaign_metadata_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_revisions" ADD CONSTRAINT "campaign_revisions_child_id_campaign_metadata_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;