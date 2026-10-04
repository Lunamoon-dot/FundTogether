import {
  integer,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const campaignMetadata = pgTable('campaign_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizerUserId: uuid('organizer_user_id').references(() => users.id),
  organizationId: uuid('organization_id').references(() => organizations.id),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 32 }).default('draft').notNull(),
  revision: integer('revision').default(1).notNull(),
  chainId: varchar('chain_id', { length: 32 }),
  contractAddress: varchar('contract_address', { length: 42 }),
  onchainCampaignId: varchar('onchain_campaign_id', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [index('campaign_metadata_organization_idx').on(table.organizationId)]);

import { users } from './users.schema';
import { organizations } from './organizations.schema';
