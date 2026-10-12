import { RewardCryptoService } from "./reward-crypto.service";

describe("RewardCryptoService", () => {
  const validKey = "test_reward_pii_encryption_key_32bytes_safe!!";
  let service: RewardCryptoService;
  const originalEnv = process.env.REWARD_PII_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.REWARD_PII_ENCRYPTION_KEY = validKey;
    service = new RewardCryptoService();
  });

  afterAll(() => {
    process.env.REWARD_PII_ENCRYPTION_KEY = originalEnv;
  });

  describe("Constructor key validation", () => {
    it("fails fast if REWARD_PII_ENCRYPTION_KEY is missing", () => {
      delete process.env.REWARD_PII_ENCRYPTION_KEY;
      expect(() => new RewardCryptoService()).toThrow(
        "REWARD_PII_ENCRYPTION_KEY environment variable is required and must be at least 32 bytes"
      );
    });

    it("fails fast if REWARD_PII_ENCRYPTION_KEY is shorter than 32 bytes", () => {
      process.env.REWARD_PII_ENCRYPTION_KEY = "short_key_16byte";
      expect(() => new RewardCryptoService()).toThrow(
        "REWARD_PII_ENCRYPTION_KEY environment variable is required and must be at least 32 bytes"
      );
    });
  });

  describe("AES-256-GCM Shipping PII Encryption", () => {
    it("successfully encrypts and decrypts shipping details", () => {
      const shipping = {
        fullName: "Nguyen Van A",
        address: "Số 456 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
        phone: "+84901234567",
      };

      const result = service.encryptShipping(shipping);
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toHaveLength(24); // 12 bytes = 24 hex chars
      expect(result.tag).toHaveLength(32); // 16 bytes = 32 hex chars

      // Must not contain plaintext
      expect(result.encrypted).not.toContain("Nguyen Van A");
      expect(result.encrypted).not.toContain("0901234567");

      const decrypted = service.decryptShipping(result.encrypted, result.iv, result.tag);
      expect(decrypted).toEqual(shipping);
    });

    it("fails decryption if ciphertext or tag is tampered", () => {
      const shipping = {
        fullName: "Tran Thi B",
        address: "789 Le Duan, Da Nang",
        phone: "+84988776655",
      };

      const result = service.encryptShipping(shipping);
      // Tamper tag
      const tamperedTag = (result.tag[0] === "a" ? "b" : "a") + result.tag.slice(1);

      expect(() => {
        service.decryptShipping(result.encrypted, result.iv, tamperedTag);
      }).toThrow();
    });
  });

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
