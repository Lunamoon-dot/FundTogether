import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { keccak256, toHex } from "viem";

export interface ShippingDetails {
  fullName: string;
  address: string;
  phone: string;
}

export interface EncryptedShippingResult {
  encrypted: string;
  iv: string;
  tag: string;
}

export interface CanonicalTierCommitment {
  tierIndex: number;
  title: string;
  description: string;
  price: string;
  maxQuantity: number;
  isDigital: boolean;
  rewardItems: string[];
  estimatedDeliveryAt?: string | null;
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
export class RewardCryptoService {
  private readonly encryptionKey: Buffer;

  constructor() {
    const rawKey = process.env.REWARD_PII_ENCRYPTION_KEY || "fundtogether-reward-pii-secret-32b-key!";
    // Normalize to exact 32-byte key for AES-256-GCM
    this.encryptionKey = Buffer.alloc(32);
    Buffer.from(rawKey, "utf-8").copy(this.encryptionKey);
  }

  encryptShipping(data: ShippingDetails): EncryptedShippingResult {
    const iv = randomBytes(12); // 96-bit IV standard for GCM
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const plaintext = JSON.stringify({
      fullName: data.fullName.trim(),
      address: data.address.trim(),
      phone: data.phone.trim(),
    });

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    return {
      encrypted,
      iv: iv.toString("hex"),
      tag,
    };
  }

  decryptShipping(encrypted: string, ivHex: string, tagHex: string): ShippingDetails {
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted) as ShippingDetails;
  }

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
        estimatedDeliveryAt: t.estimatedDeliveryAt || "",
        isDigital: Boolean(t.isDigital),
        maxQuantity: t.maxQuantity,
        price: t.price,
        rewardItems: [...t.rewardItems].sort(),
        tierIndex: t.tierIndex,
        title: t.title.trim(),
      })).sort((a, b) => a.tierIndex - b.tierIndex),
      title: payload.title.trim(),
    };

    const serialized = JSON.stringify(canonical);
    return keccak256(toHex(serialized));
  }
}
