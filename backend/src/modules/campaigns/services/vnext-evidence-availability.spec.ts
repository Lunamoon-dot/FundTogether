import { describe, expect, it } from "@jest/globals";
import {
  resolveVNextEvidenceAvailability,
  type VNextEvidenceAvailabilityInput,
} from "./vnext-evidence-availability";

const input = (overrides: Partial<VNextEvidenceAvailabilityInput> = {}) => ({
  objectState: "AVAILABLE" as const,
  reviewPhase: "VOTING" as const,
  nowSeconds: 200n,
  timeoutAtSeconds: 300n,
  ...overrides,
});

describe("VNext evidence availability policy", () => {
  it("allows review only when canonical bytes are available", () => {
    expect(resolveVNextEvidenceAvailability(input())).toEqual({
      status: "READY",
      timeoutAtSeconds: 300n,
    });
  });

  it("waits for missing bytes before the review timeout", () => {
    expect(resolveVNextEvidenceAvailability(input({ objectState: "MISSING" }))).toEqual({
      status: "WAITING_FOR_EVIDENCE",
      timeoutAtSeconds: 300n,
    });
  });

  it("exposes the protocol retry path only after the timeout", () => {
    expect(resolveVNextEvidenceAvailability(input({ objectState: "UNAVAILABLE", nowSeconds: 300n }))).toEqual({
      status: "TIMEOUT_RETRY_ELIGIBLE",
      timeoutAtSeconds: 300n,
    });
  });

  it("does not claim that a missing canonical event is reviewable", () => {
    expect(resolveVNextEvidenceAvailability(input({ objectState: "NOT_INDEXED" }))).toEqual({
      status: "WAITING_FOR_INDEXER",
      timeoutAtSeconds: null,
    });
  });

  it("does not reopen a finalized case because storage is unavailable", () => {
    expect(resolveVNextEvidenceAvailability(input({ objectState: "MISSING", reviewPhase: "FINALIZED" }))).toEqual({
      status: "REVIEW_CLOSED",
      timeoutAtSeconds: null,
    });
  });
});
