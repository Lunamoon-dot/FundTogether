import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 254 }).unique(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const walletLinks = pgTable(
  'wallet_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    chainId: varchar('chain_id', { length: 32 }).notNull(),
    address: varchar('address', { length: 42 }).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('wallet_links_chain_address_idx').on(
      table.chainId,
      table.address,
    ),
  ],
);
