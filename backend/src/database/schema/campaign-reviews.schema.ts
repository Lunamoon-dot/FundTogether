import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { campaignMetadata } from './campaigns.schema';

export const platformRoles = pgTable('platform_roles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  roles: jsonb('roles').$type<('ADMIN' | 'RESOLVER')[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// One immutable review of each frozen submission. Approval is an intent;
// CampaignApproved on the canonical chain remains the authority for approval.
export const campaignReviews = pgTable('campaign_reviews', {
  campaignMetadataId: uuid('campaign_metadata_id').primaryKey().references(() => campaignMetadata.id, { onDelete: 'cascade' }),
  decision: varchar('decision', { length: 32 }).$type<'approve' | 'request_changes' | 'reject'>().notNull(),
  reason: text('reason').notNull(),
  reviewerUserId: uuid('reviewer_user_id').notNull().references(() => users.id),
  reviewerWallet: varchar('reviewer_wallet', { length: 42 }).notNull(),
  revision: integer('revision').notNull(),
  dossierHash: varchar('dossier_hash', { length: 66 }).notNull(),
  checkedBlock: varchar('checked_block', { length: 128 }).notNull(),
  checkedBlockHash: varchar('checked_block_hash', { length: 66 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const campaignRevisions = pgTable('campaign_revisions', {
  parentId: uuid('parent_id').primaryKey().references(() => campaignMetadata.id),
  childId: uuid('child_id').notNull().unique().references(() => campaignMetadata.id),
});
