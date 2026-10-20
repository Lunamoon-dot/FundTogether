import { describe, expect, it } from "@jest/globals";
import { canUploadVNextEvidence } from "./vnext-evidence-upload-policy";

const input = (overrides: Partial<Parameters<typeof canUploadVNextEvidence>[0]> = {}) => ({
  enrolledCount: 3n,
  finalized: false,
  existingEvidence: false,
  nowSeconds: 199n,
  commitDeadlineSeconds: 200n,
  ...overrides,
});

describe("VNext evidence upload cutoff", () => {
  it("allows a new canonical upload after Judge enrollment until commit starts", () => {
    expect(canUploadVNextEvidence(input())).toBe(true);
  });

  it("allows an idempotent retry of stored evidence after the cutoff", () => {
    expect(canUploadVNextEvidence(input({ existingEvidence: true, nowSeconds: 300n }))).toBe(true);
  });

  it("rejects a new upload at the commit deadline", () => {
    expect(canUploadVNextEvidence(input({ nowSeconds: 200n }))).toBe(false);
  });

  it("rejects every new upload after the review is finalized", () => {
    expect(canUploadVNextEvidence(input({ finalized: true }))).toBe(false);
  });
});
