CREATE TABLE "campaign_chain_projection" (
	"stream_id" text NOT NULL,
	"onchain_campaign_id" numeric(78, 0) NOT NULL,
	"metadata_id" uuid,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "campaign_chain_projection_stream_id_onchain_campaign_id_pk" PRIMARY KEY("stream_id","onchain_campaign_id")
);
--> statement-breakpoint
CREATE TABLE "chain_events" (
	"stream_id" text NOT NULL,
	"transaction_hash" varchar(66) NOT NULL,
	"log_index" integer NOT NULL,
	"block_hash" varchar(66) NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"event_name" varchar(100) NOT NULL,
	"args" jsonb NOT NULL,
	"canonical" boolean DEFAULT true NOT NULL,
	CONSTRAINT "chain_events_stream_id_transaction_hash_log_index_block_hash_pk" PRIMARY KEY("stream_id","transaction_hash","log_index","block_hash")
);
--> statement-breakpoint
CREATE TABLE "indexer_streams" (
	"stream_id" text PRIMARY KEY NOT NULL,
	"last_block" numeric(78, 0),
	"last_block_hash" varchar(66),
	"head_block" numeric(78, 0),
	"status" varchar(20) DEFAULT 'syncing' NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_chain_projection" ADD CONSTRAINT "campaign_chain_projection_stream_id_indexer_streams_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."indexer_streams"("stream_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_events" ADD CONSTRAINT "chain_events_stream_id_indexer_streams_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."indexer_streams"("stream_id") ON DELETE no action ON UPDATE no action;