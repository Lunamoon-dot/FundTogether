import { Injectable } from "@nestjs/common";
import { keccak256, toHex } from "viem";

export interface CanonicalTierCommitment {
  tierIndex: number;
  title: string;
  description: string;
  price: string;
  maxQuantity: number;
  isDigital: boolean;
  benefitItems: string[];
}

export interface CanonicalCampaignCommitment {
  title: string;
  pitch: string;
  story: string;
  category: string;
  goal: string;
  fundingDuration: number;
  tiers: CanonicalTierCommitment[];
  shippingPolicy?: string;
  ipDeclaration?: string;
}

@Injectable()
export class CommitmentService {
  computeCommitmentHash(payload: CanonicalCampaignCommitment): `0x${string}` {
    // Canonical sort & formatting to guarantee deterministic byte representation
    const canonical = {
      category: payload.category,
      fundingDuration: payload.fundingDuration,
      goal: payload.goal,
      ipDeclaration: payload.ipDeclaration || "",
      pitch: payload.pitch.trim(),
      shippingPolicy: payload.shippingPolicy || "",
      story: payload.story.trim(),
      tiers: payload.tiers.map(t => ({
        description: t.description.trim(),
        isDigital: Boolean(t.isDigital),
        maxQuantity: t.maxQuantity,
        price: t.price,
        benefitItems: [...t.benefitItems].sort(),
        tierIndex: t.tierIndex,
        title: t.title.trim(),
      })).sort((a, b) => a.tierIndex - b.tierIndex),
      title: payload.title.trim(),
    };

    const serialized = JSON.stringify(canonical);
    return keccak256(toHex(serialized));
  }
}
