export const editionsDraft = () => ({
  mode: "REWARD_V1" as const,
  policyVersion: "reward-comic-download-mvp-v1" as const,
  category: "COMICS_ARTBOOK" as const,
  title: "Saigon at Dawn — Volume One",
  pitch: "An independent digital comic about life in Saigon.",
  story: "A complete illustrated story with a planned digital PDF release.",
  goal: "1000000000",
  fundingDuration: 2592000,
  tiers: [{
    tierType: "STANDARD" as const,
    title: "Standard PDF edition",
    description: "Access to the complete digital comic PDF.",
    price: "10000000",
    rewardItems: [{
      type: "DIGITAL_DOWNLOAD" as const,
      format: "PDF" as const,
      title: "Saigon at Dawn PDF",
      description: "One complete PDF of the comic.",
    }],
  }],
});
