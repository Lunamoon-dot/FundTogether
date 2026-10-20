import { createHash } from "node:crypto";

export function vnextEvidenceSha256(bytes: Uint8Array): `0x${string}` {
  return `0x${createHash("sha256").update(bytes).digest("hex")}` as `0x${string}`;
}

export function matchesVNextEvidenceHash(bytes: Uint8Array, expectedHash: string): boolean {
  return vnextEvidenceSha256(bytes).toLowerCase() === expectedHash.toLowerCase();
}
