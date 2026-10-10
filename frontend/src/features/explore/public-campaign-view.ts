export const publicState: Record<string, { title: string; next: string; actor: string }> = {
  FUNDING: { title: 'Đang gây quỹ', next: 'Theo dõi số tiền đã góp và thời hạn gây quỹ.', actor: 'Người ủng hộ' },
  FIRST_REVIEW: { title: 'Chờ xác nhận điều kiện', next: 'Resolver cần xác nhận chiến dịch đủ điều kiện trước khi cấp vốn.', actor: 'Resolver' },
  ADVANCE_AVAILABLE: { title: 'Sẵn sàng cấp đợt', next: 'Tổ chức cần nhận khoản cấp của đợt hiện tại.', actor: 'Tổ chức' },
  EXECUTING: { title: 'Đang thực hiện', next: 'Tổ chức thực hiện kế hoạch và nộp bằng chứng.', actor: 'Tổ chức' },
  EVIDENCE_REVIEW: { title: 'Đang xét bằng chứng', next: 'Resolver đang kiểm tra bằng chứng của đợt.', actor: 'Resolver' },
  SUPPLEMENT_DUE: { title: 'Cần bổ sung bằng chứng', next: 'Tổ chức cần bổ sung hồ sơ để tiếp tục xét duyệt.', actor: 'Tổ chức' },
  CHALLENGE_WINDOW: { title: 'Đang mở phản đối', next: 'Người ủng hộ có thể xem bằng chứng và phản đối trước hạn chốt.', actor: 'Người ủng hộ' },
  CASE_OPEN: { title: 'Đang xử lý phản đối', next: 'Quyền cấp đợt tiếp theo đang khóa đến khi resolver chốt case.', actor: 'Resolver' },
  COMPLETED: { title: 'Đã hoàn tất', next: 'Các đợt đã kết thúc; kiểm tra lịch sử và khoản hoàn nếu có.', actor: 'Đã kết thúc' },
  STOPPED: { title: 'Đã dừng', next: 'Kiểm tra số dư escrow và khoản hoàn tiền còn khả dụng.', actor: 'Đã dừng' },
}

export const publicStateGroups: Record<string, string[]> = {
  FUNDING: ['FUNDING'],
  EXECUTION: ['FIRST_REVIEW', 'ADVANCE_AVAILABLE', 'EXECUTING', 'EVIDENCE_REVIEW', 'SUPPLEMENT_DUE', 'CHALLENGE_WINDOW', 'CASE_OPEN'],
  COMPLETED: ['COMPLETED'],
  STOPPED: ['STOPPED'],
}

export function fundingPercent(contributed: string, goal: string) {
  const target = BigInt(goal)
  if (target <= 0n) return 0
  const basisPoints = (BigInt(contributed) * 10000n) / target
  return Number(basisPoints > 10000n ? 10000n : basisPoints) / 100
}

export function formatMockUsdc(baseUnits: string) {
  const units = BigInt(baseUnits), scale = 1_000_000n
  const whole = new Intl.NumberFormat('vi-VN').format(units / scale)
  const fraction = (units % scale).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole},${fraction}` : whole
}
