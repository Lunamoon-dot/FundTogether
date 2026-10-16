import type { CreateRewardCampaignInput } from '../../lib/api/reward';

export interface EditionsDraftFields {
  title: string;
  pitch: string;
  story: string;
  goal: string;
  durationDays: number;
  price: string;
  rewardTitle: string;
  rewardDescription: string;
  estimatedDeliveryAt?: string;
}

export type EditionsDraftField = 'title' | 'pitch' | 'story' | 'rewardTitle' | 'rewardDescription' | 'durationDays';
export type EditionsDraftErrors = Partial<Record<EditionsDraftField, string>>;

export function validateEditionsDraft(fields: EditionsDraftFields): EditionsDraftErrors {
  const errors: EditionsDraftErrors = {};
  if (fields.title.trim().length < 5) errors.title = 'Tên dự án phải có ít nhất 5 ký tự.';
  if (fields.pitch.trim().length < 10) errors.pitch = 'Lời giới thiệu phải có ít nhất 10 ký tự.';
  if (fields.story.trim().length < 20) errors.story = 'Cốt truyện & kế hoạch sản xuất phải có ít nhất 20 ký tự.';
  if (fields.rewardTitle.trim().length < 3) errors.rewardTitle = 'Tên ấn phẩm phải có ít nhất 3 ký tự.';
  if (fields.rewardDescription.trim().length < 5) errors.rewardDescription = 'Nội dung PDF phải có ít nhất 5 ký tự.';
  if (!Number.isInteger(fields.durationDays) || fields.durationDays < 1 || fields.durationDays > 60) {
    errors.durationDays = 'Thời hạn phải là số nguyên từ 1 đến 60 ngày.';
  }
  return errors;
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
  const firstError = Object.values(validateEditionsDraft(fields))[0];
  if (firstError) throw new Error(firstError);
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
      ...(fields.estimatedDeliveryAt ? { estimatedDeliveryAt: fields.estimatedDeliveryAt } : {}),
    }],
  };
}
