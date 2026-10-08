import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { evidencePackages } from './evidence-packages.schema';
import { users } from './users.schema';

// Exact UTF-8 bytes are immutable commitments, not editable projection state.
export const evidencePublications = pgTable('evidence_publications', {
  hash: varchar('hash', { length: 66 }).primaryKey(),
  packageId: uuid('package_id').notNull().unique().references(() => evidencePackages.id),
  manifestBytes: text('manifest_bytes').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const milestoneRecords = pgTable('milestone_records', {
  hash: varchar('hash', { length: 66 }).primaryKey(),
  recordBytes: text('record_bytes').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const evidenceAccessLog = pgTable('evidence_access_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  packageId: uuid('package_id').notNull().references(() => evidencePackages.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  documentId: uuid('document_id'),
  accessedAt: timestamp('accessed_at', { withTimezone: true }).defaultNow().notNull(),
});
