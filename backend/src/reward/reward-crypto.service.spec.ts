import { RewardCryptoService } from "./reward-crypto.service";

describe("RewardCryptoService", () => {
  const service = new RewardCryptoService();

  describe("Deterministic computeCommitmentHash", () => {
    it("produces identical 32-byte hash for identical payloads regardless of item ordering", () => {
      const payload1 = {
        title: "Cyberpunk Artbook",
        pitch: "An epic 100-page artbook",
        story: "Full illustrations and concept sketches from the futuristic city",
        category: "ARTBOOK",
        goal: "5000000000",
        fundingDuration: 2592000,
        tiers: [
          {
            tierIndex: 0,
            title: "Digital Artbook",
            description: "PDF format",
            price: "25000000",
            maxQuantity: 500,
            isDigital: true,
            rewardItems: ["Stickers", "Digital PDF", "Wallpapers"],
          },
        ],
        ipDeclaration: "Original artwork created by Studio Neon",
      };

      const payload2 = {
        ...payload1,
        tiers: [
          {
            ...payload1.tiers[0],
            rewardItems: ["Wallpapers", "Stickers", "Digital PDF"], // Different order
          },
        ],
      };

      const hash1 = service.computeCommitmentHash(payload1);
      const hash2 = service.computeCommitmentHash(payload2);

      expect(hash1).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(hash1).toBe(hash2);
    });

    it("produces different hash if content is changed", () => {
      const basePayload = {
        title: "Cyberpunk Artbook",
        pitch: "An epic 100-page artbook",
        story: "Full illustrations and concept sketches",
        category: "ARTBOOK",
        goal: "5000000000",
        fundingDuration: 2592000,
        tiers: [
          {
            tierIndex: 0,
            title: "Digital Artbook",
            description: "PDF format",
            price: "25000000",
            maxQuantity: 500,
            isDigital: true,
            rewardItems: ["Digital PDF"],
          },
        ],
      };

      const modifiedPayload = {
        ...basePayload,
        goal: "6000000000",
      };

      const hash1 = service.computeCommitmentHash(basePayload);
      const hash2 = service.computeCommitmentHash(modifiedPayload);

      expect(hash1).not.toBe(hash2);
    });
  });
});
