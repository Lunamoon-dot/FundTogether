import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { campaignMetadata } from "./campaigns.schema";
import { users } from "./users.schema";

export const evidenceDrafts = pgTable(
  "campaign_evidence_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignMetadataId: uuid("campaign_metadata_id")
      .notNull()
      .references(() => campaignMetadata.id),
    milestoneIndex: varchar("milestone_index", { length: 128 }).notNull(),
    organizerUserId: uuid("organizer_user_id")
      .notNull()
      .references(() => users.id),
    evidenceSchemaVersion: varchar("evidence_schema_version", { length: 16 })
      .notNull()
      .default("0.1"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("campaign_evidence_drafts_campaign_milestone_idx").on(
      table.campaignMetadataId,
      table.milestoneIndex,
    ),
  ],
);
