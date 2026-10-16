import { getTableColumns, getTableName } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  editionsCreatorResponseFeedback,
  editionsCreatorResponses,
  editionsReviewEscalations,
  editionsReviewMessages,
  editionsReviewThreads,
} from "./editions.schema";

describe("Editions review conversation schema", () => {
  it("exports the append-only conversation tables with their required columns", () => {
    expect(getTableName(editionsCreatorResponses)).toBe("editions_creator_responses");
    expect(Object.keys(getTableColumns(editionsCreatorResponses))).toEqual(expect.arrayContaining([
      "id", "campaignId", "creatorUserId", "submissionRevision", "commitmentHash", "responseBody", "createdAt",
    ]));

    expect(getTableName(editionsCreatorResponseFeedback)).toBe("editions_creator_response_feedback");
    expect(Object.keys(getTableColumns(editionsCreatorResponseFeedback))).toEqual(expect.arrayContaining([
      "responseId", "feedbackId",
    ]));

    expect(getTableName(editionsReviewThreads)).toBe("editions_review_threads");
    expect(Object.keys(getTableColumns(editionsReviewThreads))).toEqual(expect.arrayContaining([
      "id", "campaignId", "entitlementId", "backerUserId", "creatorUserId", "targetHash", "commitmentHash", "status", "createdAt", "updatedAt",
    ]));

    expect(getTableName(editionsReviewMessages)).toBe("editions_review_messages");
    expect(Object.keys(getTableColumns(editionsReviewMessages))).toEqual(expect.arrayContaining([
      "id", "threadId", "authorUserId", "authorRole", "body", "createdAt",
    ]));

    expect(getTableName(editionsReviewEscalations)).toBe("editions_review_escalations");
    expect(Object.keys(getTableColumns(editionsReviewEscalations))).toEqual(expect.arrayContaining([
      "id", "threadId", "openerUserId", "reason", "status", "resolverUserId", "outcome", "note", "createdAt", "updatedAt", "resolvedAt",
    ]));
  });

  it("defines database constraints for statuses, links and append-only messages", () => {
    const sql = readFileSync(join(process.cwd(), "drizzle", "reward", "0010_editions_review_conversations.sql"), "utf8");

    expect(sql).toContain("PRIMARY KEY (response_id, feedback_id)");
    expect(sql).toContain("CHECK (status IN ('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED'))");
    expect(sql).toContain("CHECK (status IN ('OPEN', 'AWAITING_CREATOR_RESPONSE', 'RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE'))");
    expect(sql).toContain("CHECK (author_role IN ('BACKER', 'CREATOR', 'RESOLVER'))");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).not.toMatch(/UPDATE\s+editions_review_messages/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+editions_review_messages/i);
  });
});
