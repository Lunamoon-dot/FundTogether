import { getTableColumns, getTableName } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  creatorResponseFeedback,
  creatorResponses,
  reviewEscalations,
  reviewMessages,
  reviewThreads,
} from "./campaigns.schema";

describe("Campaign review conversation schema", () => {
  it("exports the append-only conversation tables with their required columns", () => {
    expect(getTableName(creatorResponses)).toBe("campaigns_creator_responses");
    expect(Object.keys(getTableColumns(creatorResponses))).toEqual(expect.arrayContaining([
      "id", "campaignId", "creatorUserId", "submissionRevision", "commitmentHash", "responseBody", "createdAt",
    ]));

    expect(getTableName(creatorResponseFeedback)).toBe("campaigns_creator_response_feedback");
    expect(Object.keys(getTableColumns(creatorResponseFeedback))).toEqual(expect.arrayContaining([
      "responseId", "feedbackId",
    ]));

    expect(getTableName(reviewThreads)).toBe("campaigns_review_threads");
    expect(Object.keys(getTableColumns(reviewThreads))).toEqual(expect.arrayContaining([
      "id", "campaignId", "entitlementId", "backerUserId", "creatorUserId", "targetHash", "commitmentHash", "status", "createdAt", "updatedAt",
    ]));

    expect(getTableName(reviewMessages)).toBe("campaigns_review_messages");
    expect(Object.keys(getTableColumns(reviewMessages))).toEqual(expect.arrayContaining([
      "id", "threadId", "authorUserId", "authorRole", "body", "createdAt",
    ]));

    expect(getTableName(reviewEscalations)).toBe("campaigns_review_escalations");
    expect(Object.keys(getTableColumns(reviewEscalations))).toEqual(expect.arrayContaining([
      "id", "threadId", "openerUserId", "reason", "status", "resolverUserId", "outcome", "note", "createdAt", "updatedAt", "resolvedAt",
    ]));
  });

  it("defines database constraints for statuses, links and append-only messages", () => {
    const sql = readFileSync(join(process.cwd(), "drizzle", "fundtogether", "0000_fundtogether_baseline.sql"), "utf8");

    expect(sql).toContain("PRIMARY KEY (response_id, feedback_id)");
    expect(sql).toContain("CHECK (status IN ('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED'))");
    expect(sql).toContain("CHECK (status IN ('OPEN', 'AWAITING_CREATOR_RESPONSE', 'RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE'))");
    expect(sql).toContain("CHECK (author_role IN ('BACKER', 'CREATOR', 'RESOLVER'))");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).not.toMatch(/UPDATE\s+campaigns_review_messages/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+campaigns_review_messages/i);
  });
});
