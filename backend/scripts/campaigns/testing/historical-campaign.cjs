// Historical fixtures only. Never import this helper from application source.
const { eq } = require('drizzle-orm');

async function seedHistoricalCampaign(db, schema, cryptoService, creatorUserId, input) {
  return db.transaction(async tx => {
    const { tiers, ...campaignInput } = input;
    const [campaign] = await tx.insert(schema.campaigns).values({ ...campaignInput, creatorUserId }).returning();
    const createdTiers = await tx.insert(schema.campaignTiers).values(tiers.map((tier, tierIndex) => ({
      ...tier, campaignId: campaign.id, tierIndex,
    }))).returning();
    const commitmentHash = cryptoService.computeCommitmentHash({ ...input, tiers: createdTiers });
    const [updated] = await tx.update(schema.campaigns).set({ commitmentHash })
      .where(eq(schema.campaigns.id, campaign.id)).returning();
    return { ...updated, tiers: createdTiers };
  });
}

module.exports = { seedHistoricalCampaign };
