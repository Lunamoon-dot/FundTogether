import { createHash, randomBytes } from "node:crypto";

const TICKET_TTL_MS = 60_000;

export function hashVNextEvidenceAccessToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Invalid evidence access ticket");
  return createHash("sha256").update(token).digest("hex");
}

export function createVNextEvidenceAccessTicket(now = new Date()) {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashVNextEvidenceAccessToken(token),
    expiresAt: new Date(now.getTime() + TICKET_TTL_MS),
  };
}

export function isVNextEvidenceAccessTicketExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}
