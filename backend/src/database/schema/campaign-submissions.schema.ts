import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaignMetadata } from './campaigns.schema';

export const campaignSubmissions = pgTable('campaign_submissions', {
  campaignMetadataId: uuid('campaign_metadata_id').primaryKey().references(() => campaignMetadata.id),
  plan: jsonb('plan').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
