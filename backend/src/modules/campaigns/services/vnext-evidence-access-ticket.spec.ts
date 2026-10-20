import { describe, expect, it, jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import { vnextEvidenceAccessTickets } from "../../../database/schema";
import { VNextEvidenceService } from "./vnext-evidence.service";
import {
  createVNextEvidenceAccessTicket,
  hashVNextEvidenceAccessToken,
  isVNextEvidenceAccessTicketExpired,
} from "./vnext-evidence-access-ticket";

describe("VNext evidence access tickets", () => {
  it("creates a private token with a hashed lookup key and one-minute expiry", () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    const ticket = createVNextEvidenceAccessTicket(now);

    expect(ticket.token).toMatch(/^[0-9a-f]{64}$/);
    expect(ticket.tokenHash).toBe(hashVNextEvidenceAccessToken(ticket.token));
    expect(ticket.expiresAt).toEqual(new Date("2026-10-20T12:01:00.000Z"));
  });

  it("rejects malformed or expired tokens without exposing a file", () => {
    expect(() => hashVNextEvidenceAccessToken("not-a-ticket")).toThrow("Invalid evidence access ticket");
    expect(isVNextEvidenceAccessTicketExpired(new Date("2026-10-20T12:01:00.000Z"), new Date("2026-10-20T12:01:00.000Z"))).toBe(true);
    expect(isVNextEvidenceAccessTicketExpired(new Date("2026-10-20T12:01:00.000Z"), new Date("2026-10-20T12:00:59.999Z"))).toBe(false);
  });

  it("does not read storage for an expired private ticket", async () => {
    const token = "a".repeat(64);
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: async () => table === vnextEvidenceAccessTickets ? [{
            tokenHash: hashVNextEvidenceAccessToken(token),
            userId: "user-1",
            expiresAt: new Date("2026-10-20T11:59:00.000Z"),
          }] : [],
        }),
      }),
    };
    const storage = { get: jest.fn() };
    const service = new VNextEvidenceService(db as any, storage as any, null);

    await expect(service.downloadTicket(token, { userId: "user-1", wallets: [] } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.get).not.toHaveBeenCalled();
  });
});
