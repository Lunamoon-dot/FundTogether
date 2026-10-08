import { z } from 'zod';

export const milestoneActionSchema = z.enum(['submit', 'admit', 'reject', 'challenge', 'material', 'respond',
  'continue', 'resubmit', 'stop', 'expire', 'timeout', 'settle', 'bond']);
export type MilestoneAction = z.infer<typeof milestoneActionSchema>;
export const recordInputSchema = z.object({
  action: milestoneActionSchema, wallet: z.string().regex(/^0x[\da-fA-F]{40}$/),
  expectedEvidenceHash: z.string().regex(/^0x[\da-fA-F]{64}$/), expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(10).max(8000), acknowledged: z.literal(true),
}).strict();
export interface MilestonePolicyState {
  state: number; timestamp: bigint; evidenceDeadline: bigint; admissionDeadline: bigint; reviewEnd: bigint;
  version: number; resolution: number; responseDeadline: bigint; resolutionDeadline: bigint; responseHash: string;
  bond: bigint; organizer: boolean; reviewer: boolean; donor: boolean; linked: boolean; readable: boolean;
}
export function milestoneActionReason(action: MilestoneAction, s: MilestonePolicyState): string {
  if (!s.linked) return 'Liên kết đúng ví với tài khoản bằng chữ ký trước khi thực hiện.';
  const now = s.timestamp;
  switch (action) {
    case 'submit': return !s.organizer ? 'Cần ví đại diện tổ chức.' : s.state !== 6 ? 'Milestone chưa ở bước nộp bằng chứng.'
      : now >= s.evidenceDeadline ? 'Đã hết hạn nộp bằng chứng.' : s.version >= 3 ? 'Đã hết ba lần nộp.' : '';
    case 'admit': case 'reject': return !s.reviewer ? 'Cần resolver có ví liên kết, không có xung đột lợi ích.'
      : s.state !== 11 ? 'Hồ sơ không còn chờ tiếp nhận.' : now >= s.admissionDeadline ? 'Đã hết hạn tiếp nhận.'
      : action === 'admit' && !s.readable ? 'Chưa đọc và kiểm tra được toàn bộ bản công khai.' : '';
    case 'challenge': return !s.donor ? 'Chỉ ví đã đóng góp vào campaign này được phản đối.' : s.state !== 7 ? 'Chưa trong cửa sổ donor phản đối.'
      : s.resolution !== 0 || s.responseDeadline > 0n ? 'Phiên bản này đã có một case; không mở lại.' : now >= s.reviewEnd ? 'Đã hết hạn phản đối.' : '';
    case 'material': case 'respond': return (action === 'material' ? !s.donor : !s.organizer) ? 'Sai ví thực hiện.'
      : s.state !== 8 || s.resolution !== 0 ? 'Không có case đang chờ xử lý.' : now >= s.responseDeadline ? 'Đã hết hạn giải trình và bổ sung.'
      : action === 'respond' && !/^0x0{64}$/.test(s.responseHash) ? 'Giải trình đã chốt; không thể thay thế.' : '';
    case 'continue': case 'resubmit': case 'stop': return !s.reviewer ? 'Cần resolver có ví liên kết, không có xung đột lợi ích.'
      : s.state !== 8 || s.resolution !== 0 ? 'Không có case đang chờ xử lý.' : now < s.responseDeadline ? 'Đang chờ hết cửa sổ giải trình 7 ngày.'
      : now >= s.resolutionDeadline ? 'Đã hết hạn xử lý; cần chốt timeout.' : action === 'resubmit' && s.version >= 3 ? 'Không được mở lần nộp thứ tư.' : '';
    case 'expire': return s.state !== 11 || now < s.admissionDeadline ? 'Chưa đủ điều kiện chốt quá hạn tiếp nhận.' : '';
    case 'timeout': return s.state !== 8 || s.resolution !== 0 || now < s.resolutionDeadline ? 'Chưa đủ điều kiện chốt quá hạn xử lý.' : '';
    case 'settle': return s.state !== 7 || now < s.reviewEnd ? 'Chỉ giải ngân sau review khi không có case đang giữ tiền.' : '';
    case 'bond': return !s.organizer ? 'Cần ví đại diện tổ chức.' : s.bond === 0n ? 'Không còn bond được nhận.' : '';
  }
}
