import { integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { campaignMetadata } from './campaigns.schema';
import { users } from './users.schema';

export const evidencePackages = pgTable('campaign_evidence_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignMetadataId: uuid('campaign_metadata_id').notNull().references(() => campaignMetadata.id),
  milestoneIndex: varchar('milestone_index', { length: 128 }).notNull(),
  organizerUserId: uuid('organizer_user_id').notNull().references(() => users.id),
  submissionVersion: integer('submission_version').notNull(),
  draftRevision: integer('draft_revision').notNull(),
  manifestBytes: text('manifest_bytes').notNull(),
  evidenceHash: varchar('evidence_hash', { length: 66 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('evidence_packages_draft_version_idx').on(table.campaignMetadataId, table.milestoneIndex, table.draftRevision, table.submissionVersion),
  uniqueIndex('evidence_packages_hash_idx').on(table.evidenceHash),
]);
