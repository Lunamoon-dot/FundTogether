import { createHash } from "node:crypto";
import type { CreateCampaignDraftInput } from "../schemas/campaign.schema";
import type { CampaignPreparation } from "../schemas/preparation.schema";

export interface CampaignSnapshot {
  commitmentVersion: "campaigns-review-v1";
  config: CreateCampaignDraftInput;
  creator: { userId: string; profileId: string; displayName: string; ipDeclaration: string };
  payoutWallet: { linkId: string; chainId: string; address: string };
  preparation: Omit<CampaignPreparation, "payoutWalletLinkId" | "sampleIds">;
  samples: { id: string; sha256: string; mediaType: string; sizeBytes: number }[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Domain/version included in the bytes. This is a content commitment, not a financial policy hash.
export function campaignCommitment(snapshot: CampaignSnapshot) {
  return `0x${createHash("sha256").update(canonical(snapshot), "utf8").digest("hex")}`;
}
