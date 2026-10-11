CREATE TABLE "disbursement_campaign_projection" (
	"stream_id" text NOT NULL,
	"onchain_campaign_id" numeric(78, 0) NOT NULL,
	"metadata_id" uuid,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "disbursement_campaign_projection_stream_id_onchain_campaign_id_pk" PRIMARY KEY("stream_id","onchain_campaign_id"),
	CONSTRAINT "disbursement_projection_id_check" CHECK ("disbursement_campaign_projection"."onchain_campaign_id" >= 0 AND "disbursement_campaign_projection"."onchain_campaign_id" <= 115792089237316195423570985008687907853269984665640564039457584007913129639935)
);
--> statement-breakpoint
ALTER TABLE "disbursement_campaign_projection" ADD CONSTRAINT "disbursement_campaign_projection_stream_id_indexer_streams_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."indexer_streams"("stream_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disbursement_campaign_projection" ADD CONSTRAINT "disbursement_campaign_projection_metadata_id_campaign_metadata_id_fk" FOREIGN KEY ("metadata_id") REFERENCES "public"."campaign_metadata"("id") ON DELETE no action ON UPDATE no action;