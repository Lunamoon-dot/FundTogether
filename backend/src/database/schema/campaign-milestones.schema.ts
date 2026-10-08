import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { campaignMetadata } from "./campaigns.schema";

export interface DraftAcceptanceCriterion {
  criterionId: string;
  description: string;
}

export const campaignMilestoneDrafts = pgTable(
  "campaign_milestone_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignMetadataId: uuid("campaign_metadata_id")
      .notNull()
      .references(() => campaignMetadata.id),
    milestoneIndex: integer("milestone_index").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    budgetUnits: numeric("budget_units", { precision: 78, scale: 0 }),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<DraftAcceptanceCriterion[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("campaign_milestone_drafts_campaign_milestone_idx").on(
      table.campaignMetadataId,
      table.milestoneIndex,
    ),
    check("campaign_milestone_drafts_budget_positive", sql`${table.budgetUnits} > 0 AND ${table.budgetUnits} <= 115792089237316195423570985008687907853269984665640564039457584007913129639935`),
    check(
      "campaign_milestone_drafts_index_nonnegative",
      sql`${table.milestoneIndex} >= 0`,
    ),
    check(
      "campaign_milestone_drafts_criteria_array",
      sql`jsonb_typeof(${table.acceptanceCriteria}) = 'array'`,
    ),
  ],
);
