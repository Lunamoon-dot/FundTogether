import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaignMetadata } from './campaigns.schema';
import type { SubmissionPlan } from '../../modules/campaigns/submission-plan';

export const campaignSubmissions = pgTable('campaign_submissions', {
  campaignMetadataId: uuid('campaign_metadata_id').primaryKey().references(() => campaignMetadata.id),
  plan: jsonb('plan').$type<SubmissionPlan>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
