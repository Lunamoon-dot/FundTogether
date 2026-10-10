import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.schema";
import { users } from "./users.schema";
import { organizationVerificationRecords } from "./advance.schema";
import type { OrganizationRequestContent } from "../../advance/organization-request.schema";

export const organizationVerificationRequests = pgTable("organization_verification_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  revision: integer("revision").notNull().default(1),
  content: jsonb("content").$type<OrganizationRequestContent>().notNull(),
  policyId: varchar("policy_id", { length: 100 }).notNull(),
  snapshotBytes: text("snapshot_bytes"), snapshotHash: varchar("snapshot_hash", { length: 66 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNote: text("review_note"), missingItems: jsonb("missing_items").$type<string[]>().notNull().default([]),
  verificationRecordId: uuid("verification_record_id").unique().references(() => organizationVerificationRecords.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  index("organization_requests_history_idx").on(t.organizationId, t.createdAt),
  uniqueIndex("organization_requests_one_open_idx").on(t.organizationId).where(sql`${t.status} IN ('DRAFT', 'UNDER_REVIEW')`),
  check("organization_requests_status_check", sql`${t.status} IN ('DRAFT','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED')`),
  check("organization_requests_revision_check", sql`${t.revision} > 0`),
  check("organization_requests_submission_check", sql`(${t.status} = 'DRAFT' AND ${t.submittedAt} IS NULL AND ${t.snapshotBytes} IS NULL AND ${t.snapshotHash} IS NULL) OR (${t.status} <> 'DRAFT' AND ${t.submittedAt} IS NOT NULL AND ${t.snapshotBytes} IS NOT NULL AND ${t.snapshotHash} IS NOT NULL AND ${t.snapshotHash} ~ '^0x[0-9a-f]{64}$')`),
  check("organization_requests_decision_check", sql`(${t.status} IN ('APPROVED','CHANGES_REQUESTED','REJECTED') AND ${t.reviewedAt} IS NOT NULL AND ${t.reviewedBy} IS NOT NULL AND ${t.reviewNote} IS NOT NULL AND length(${t.reviewNote}) > 0) OR (${t.status} NOT IN ('APPROVED','CHANGES_REQUESTED','REJECTED') AND ${t.reviewedAt} IS NULL AND ${t.reviewedBy} IS NULL AND ${t.reviewNote} IS NULL)`),
  check("organization_requests_approval_check", sql`(${t.status} = 'APPROVED') = (${t.verificationRecordId} IS NOT NULL)`),
]);

export const organizationVerificationDocuments = pgTable("organization_verification_documents", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  requestId: uuid("request_id").notNull().references(() => organizationVerificationRequests.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  kind: varchar("kind", { length: 24 }).notNull(), originalName: varchar("original_name", { length: 200 }).notNull(),
  mediaType: varchar("media_type", { length: 100 }).notNull(), byteSize: integer("byte_size").notNull(),
  hash: varchar("hash", { length: 66 }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("organization_documents_org_idx").on(t.organizationId),
  check("organization_documents_kind_check", sql`${t.kind} IN ('IDENTITY','REPRESENTATION','ACTIVITY','OTHER')`),
  check("organization_documents_size_check", sql`${t.byteSize} > 0 AND ${t.byteSize} <= 10485760`),
  check("organization_documents_hash_check", sql`${t.hash} ~ '^0x[0-9a-f]{64}$'`),
]);

export const organizationVerificationAudit = pgTable("organization_verification_audit", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  requestId: uuid("request_id").notNull().references(() => organizationVerificationRequests.id),
  actorId: uuid("actor_id").notNull().references(() => users.id), action: varchar("action", { length: 32 }).notNull(),
  changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
  happenedAt: timestamp("happened_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("organization_verification_audit_org_idx").on(t.organizationId, t.happenedAt),
  check("organization_verification_audit_action_check", sql`${t.action} IN ('CREATED','SAVED','DOCUMENT_ADDED','SUBMITTED','CANCELLED','APPROVED','CHANGES_REQUESTED','REJECTED')`),
]);
