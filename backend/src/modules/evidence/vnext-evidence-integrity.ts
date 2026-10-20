import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array) {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

export function assertEvidenceMatches(expectedHash: string, bytes: Uint8Array) {
  const normalized = expectedHash.toLowerCase();
  const actual = sha256Hex(bytes);
  if (!/^0x[0-9a-f]{64}$/.test(normalized) || actual !== normalized) {
    throw new Error("Evidence integrity mismatch");
  }
  return actual;
}
