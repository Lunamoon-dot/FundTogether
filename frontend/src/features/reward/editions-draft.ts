import type { CreateRewardCampaignInput } from '../../lib/api/reward';

interface EditionsDraftFields {
  title: string;
  pitch: string;
  story: string;
  goal: string;
  durationDays: number;
  price: string;
  rewardTitle: string;
  rewardDescription: string;
}

function mockUsdcUnits(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value) || value.length > 85) {
    throw new Error('Nhập số MockUSDC dương, tối đa 6 chữ số thập phân.');
  }
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (units <= 0n || units > 2n ** 256n - 1n) throw new Error('Số tiền nằm ngoài giới hạn kỹ thuật.');
  return units.toString();
}

export function buildEditionsDraft(fields: EditionsDraftFields): CreateRewardCampaignInput {
  if (!Number.isInteger(fields.durationDays) || fields.durationDays < 1 || fields.durationDays > 60) {
    throw new Error('Thời hạn phải là số nguyên từ 1 đến 60 ngày.');
  }
  return {
    mode: 'REWARD_V1',
    policyVersion: 'reward-comic-download-mvp-v1',
    category: 'COMICS_ARTBOOK',
    title: fields.title,
    pitch: fields.pitch,
    story: fields.story,
    goal: mockUsdcUnits(fields.goal),
    fundingDuration: fields.durationDays * 86400,
    tiers: [{
      tierType: 'STANDARD',
      title: 'Standard PDF',
      description: fields.rewardDescription,
      price: mockUsdcUnits(fields.price),
      rewardItems: [{
        type: 'DIGITAL_DOWNLOAD', format: 'PDF',
        title: fields.rewardTitle, description: fields.rewardDescription,
      }],
    }],
  };
}
