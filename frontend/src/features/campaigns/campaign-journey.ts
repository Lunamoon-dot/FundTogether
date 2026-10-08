import type { CampaignRefund, CampaignWorkflow, PublicCampaign } from '../../lib/api/public-campaigns'
import type { RefundAction } from '../../lib/web3/refund-action'

export const campaignStateLabels: Record<string, string> = {
  DRAFT: 'Chờ xét duyệt', APPROVED: 'Đã duyệt · chờ công bố', FUNDING: 'Đang gây quỹ',
  FUNDED: 'Đã đủ vốn · chờ triển khai', FUNDING_FAILED: 'Gây quỹ không đạt', CANCELLED: 'Đã hủy',
  MILESTONE_ACTIVE: 'Đang thực hiện milestone', EVIDENCE_PENDING: 'Chờ kiểm tra bằng chứng',
  IN_REVIEW: 'Đang trong thời gian phản hồi', CHALLENGED: 'Đang có khiếu nại',
  MILESTONE_SETTLED: 'Đã giải ngân milestone', COMPLETED: 'Đã hoàn tất', FAILED: 'Đã dừng triển khai',
}

export function campaignStatusLabel(campaign: PublicCampaign, chainTimestamp?: string) {
  if (campaign.state === 'FUNDING' && chainTimestamp !== undefined && BigInt(chainTimestamp) >= BigInt(campaign.fundingDeadline))
    return 'Đã hết hạn · chờ chốt thất bại'
  return campaignStateLabels[campaign.state] ?? campaign.state
}

export function campaignNextStep(campaign: PublicCampaign, workflow: CampaignWorkflow) {
  const now = BigInt(workflow.chainTimestamp)
  const workspace = `#/organizations/${campaign.organization.id}/workspace`
  const index = Number(workflow.currentMilestoneIndex)
  let actor = 'Chưa xác định', action = 'Chưa có hướng dẫn cho trạng thái này.'
  let wallet = 'Chưa xác định', deadline = '0', deadlineLabel = 'Hạn xử lý'
  let href = '', link = ''
  switch (campaign.state) {
    case 'FUNDING':
      deadline = String(campaign.fundingDeadline); deadlineLabel = 'Hạn gây quỹ'
      if (now >= BigInt(deadline)) {
        actor = 'Bất kỳ người dùng nào'; wallet = 'Bất kỳ ví đã liên kết nào, có ETH trả phí'
        action = 'Ký chốt gây quỹ thất bại để mở hoàn tiền. Hết hạn chưa tự mở quyền nhận.'
        href = '#refund-title'; link = 'Đến bước mở hoàn tiền'
      } else {
        actor = 'Người đóng góp'; wallet = 'Ví donor đã liên kết với tài khoản'
        action = 'Đóng góp vào phần mục tiêu còn thiếu. Tổ chức có thể hủy trước khi đủ vốn.'
        href = '#donation-title'; link = 'Đến bước đóng góp'
      }
      break
    case 'FUNDED':
    case 'MILESTONE_SETTLED':
      deadline = workflow.activationDeadline; deadlineLabel = 'Hạn kích hoạt milestone'
      actor = 'Tổ chức'; wallet = campaign.organizer
      action = `Kích hoạt milestone ${index + 1}. Bước này bắt đầu hạn nộp bằng chứng, chưa giải ngân.`
      href = `${workspace}/campaigns/${campaign.id}`; link = 'Mở bước kích hoạt của tổ chức'
      if (BigInt(deadline) > 0n && now >= BigInt(deadline)) {
        actor = 'Bất kỳ người dùng nào'; wallet = 'Bất kỳ ví đã liên kết nào, có ETH trả phí'
        action = 'Milestone đã quá hạn kích hoạt. Ký chốt thất bại để mở hoàn tiền từ phần chưa giải ngân.'
        href = '#refund-title'; link = 'Đến bước mở hoàn tiền'
      }
      break
    case 'MILESTONE_ACTIVE':
      deadline = workflow.evidenceDeadline; deadlineLabel = 'Hạn nộp bằng chứng'
      actor = 'Tổ chức'; wallet = campaign.organizer
      action = workflow.milestoneMvp ? 'Chốt hồ sơ gốc, xác nhận bản công khai donor đọc được, rồi ký nộp bằng chứng.'
        : 'Chuẩn bị và chốt hồ sơ bằng chứng. Luồng ký nộp/xét bằng chứng riêng chưa mở trên contract của campaign này.'
      href = `${workspace}/evidence/${campaign.id}`; link = 'Mở hồ sơ bằng chứng'
      if (BigInt(deadline) > 0n && now >= BigInt(deadline)) {
        actor = 'Bất kỳ người dùng nào'; wallet = 'Bất kỳ ví đã liên kết nào, có ETH trả phí'
        action = 'Đã quá hạn nộp bằng chứng. Ký chốt thất bại để mở hoàn tiền từ phần chưa giải ngân.'
        href = '#refund-title'; link = 'Đến bước mở hoàn tiền'
      }
      break
    case 'EVIDENCE_PENDING':
      actor = workflow.milestoneMvp ? 'Resolver' : 'Người được phân công kiểm tra bằng chứng'
      wallet = workflow.caseDeadlines?.resolver ?? 'Ví có quyền và được phân công trên contract'
      deadline = workflow.admissionDeadline; deadlineLabel = 'Hạn tiếp nhận bằng chứng'
      action = workflow.milestoneMvp ? 'Resolver kiểm tra bản gốc và bản công khai, ký tiếp nhận để bắt đầu 72 giờ donor phản đối hoặc yêu cầu sửa.'
        : 'Đang chờ kiểm tra bằng chứng. Campaign này chưa dùng đường tiếp nhận của resolver MVP.'
      if (BigInt(deadline) > 0n && now >= BigInt(deadline)) {
        actor = 'Bất kỳ người dùng nào'; wallet = 'Bất kỳ ví đã liên kết nào, có ETH trả phí'
        action = workflow.milestoneMvp ? 'Ký chốt quá hạn tiếp nhận. Có thể nộp lại nếu chưa hết ba lượt; hết lượt sẽ mở hoàn tiền.'
          : 'Đã quá hạn tiếp nhận bằng chứng. Chưa mở luồng ký mới trên contract của campaign này.'
      }
      break
    case 'IN_REVIEW':
      actor = 'Người đóng góp'; wallet = 'Ví đã đóng góp vào campaign'
      deadline = workflow.reviewDeadline; deadlineLabel = 'Hết thời gian phản hồi'
      action = workflow.milestoneMvp ? now < BigInt(deadline) ? 'Đọc bản bằng chứng công khai đúng phiên bản và ký phản đối nếu có căn cứ. Chưa giải ngân trong thời gian review.'
        : 'Ký giải ngân đúng ngân sách milestone về ví tổ chức nếu không có case giữ tiền.'
        : now < BigInt(deadline) ? 'Đang trong thời gian phản hồi bằng chứng; chưa được giải ngân. Campaign này chưa mở giao diện khiếu nại.'
          : 'Đã hết thời gian phản hồi. Contract cho phép chốt milestone nếu không có khiếu nại; giao diện ký chốt chưa mở tại đây.'
      if (now >= BigInt(deadline)) { actor = 'Người thực hiện chốt milestone'; wallet = 'Bất kỳ ví có thể gửi giao dịch' }
      break
    case 'CHALLENGED':
      actor = 'Bên xử lý khiếu nại'; wallet = 'MVP mới dùng ví resolver được contract chỉ định'
      action = 'Đang có khiếu nại. MVP đã chốt resolver xử lý và hoàn phần chưa giải ngân khi dừng/quá hạn. Deployment prototype này chưa có đường thoát khiếu nại; chưa thể dùng luồng mới tại đây.'
      if (workflow.milestoneMvp && workflow.caseDeadlines) {
        const c = workflow.caseDeadlines
        if (now < BigInt(c.responseDeadline)) {
          actor = 'Tổ chức và donor đã đóng góp'; wallet = `${campaign.organizer} hoặc chính ví donor`
          deadline = c.responseDeadline; deadlineLabel = 'Hạn giải trình và bổ sung'
          action = 'Tổ chức chốt giải trình một lần; donor bổ sung vào case đã mở. Thời hạn không được reset.'
        } else if (now < BigInt(c.resolutionDeadline)) {
          actor = 'Resolver'; wallet = c.resolver; deadline = c.resolutionDeadline; deadlineLabel = 'Hạn xử lý case'
          action = 'Đối chiếu hồ sơ và giải trình, chọn tiếp tục, nộp lại hoặc dừng. Không slash bond và không có kháng nghị trong MVP.'
        } else {
          actor = 'Bất kỳ người dùng nào'; wallet = 'Bất kỳ ví đã liên kết nào, có ETH trả phí'
          deadline = c.resolutionDeadline; deadlineLabel = 'Hạn xử lý case'
          action = 'Ký chốt quá hạn để mở hoàn tiền từ phần chưa giải ngân. Bond trả riêng cho tổ chức.'
        }
      }
      break
    case 'CANCELLED': case 'FUNDING_FAILED': case 'FAILED':
      actor = workflow.refundSnapshotted ? 'Từng người đóng góp' : 'Indexer / đối chiếu trạng thái'
      wallet = 'Chính ví đã đóng góp và đã liên kết với tài khoản'
      action = workflow.refundSnapshotted ? 'Mỗi ví ký nhận quyền hoàn tiền của mình một lần. Không có hạn cuối để nhận.'
        : 'Chưa xác nhận được quỹ hoàn tiền. Không ký nhận trước khi có snapshot hợp lệ.'
      href = '#refund-title'; link = 'Xem quyền nhận hoàn tiền'
      break
    case 'COMPLETED':
      actor = 'Không còn bước xử lý'; wallet = 'Không yêu cầu ví'
      action = 'Campaign đã hoàn tất. Không còn nhận đóng góp hoặc mở hoàn tiền theo luồng này.'
      if (workflow.milestoneMvp) { actor = 'Tổ chức'; wallet = campaign.organizer; action += ' Kiểm tra và ký nhận bond còn được trả ở mục milestone; bond không ảnh hưởng tiền đã giải ngân.' }
      break
  }
  return { actor, action, wallet, deadline, deadlineLabel, href, link }
}

export function deadlineRemaining(deadline: string, chainTimestamp: string) {
  const seconds = BigInt(deadline) - BigInt(chainTimestamp)
  if (seconds <= 0n) return 'Đã đến hoặc quá hạn theo thời gian chain'
  const days = seconds / 86400n, hours = seconds % 86400n / 3600n, minutes = seconds % 3600n / 60n
  return `Còn ${days > 0n ? `${days} ngày ` : ''}${hours} giờ ${minutes} phút${seconds < 60n ? ` ${seconds} giây` : ''} theo chain`
}

export function walletActionReason(input: {
  sessionLoading: boolean; signedIn: boolean; address?: string; linked: boolean
  chainId?: number; requiredChainId: number; walletReady: boolean
}) {
  if (input.sessionLoading) return 'Đang kiểm tra tài khoản đăng nhập.'
  if (!input.signedIn) return 'Đăng nhập tài khoản trước khi ký giao dịch.'
  if (!input.address) return 'Kết nối ví cần dùng bằng nút chọn ví ở trên.'
  if (!input.linked) return 'Ví đang chọn chưa liên kết với tài khoản này. Mở Tài khoản để ký liên kết.'
  if (input.chainId !== input.requiredChainId) return `Dùng nút mạng trong bộ chọn ví để chuyển sang Foundry (${input.requiredChainId}).`
  if (!input.walletReady) return 'Đang chờ kết nối ví sẵn sàng. Kiểm tra extension nếu chờ lâu.'
  return ''
}

export function refundEligibilityReason(action: RefundAction, refund: CampaignRefund, address?: string, confirmCancel = false) {
  const donor = refund.wallets.find(item => item.donor.toLowerCase() === address?.toLowerCase())
  if (action === 'claimRefund') {
    if (!refund.snapshotted) return 'Chưa mở hoàn tiền; cần giao dịch chốt thất bại hoặc hủy thành công.'
    if (!donor || BigInt(donor.contributionUnits) === 0n) return 'Ví đang chọn không đóng góp vào campaign này. Chọn đúng ví donor.'
    if (donor.claimed) return 'Ví đã nhận và được indexer ghi nhận; không thể nhận lần hai.'
  }
  if (action === 'finalizeFundingFailure' && !refund.canFinalizeFunding) return 'Chỉ mở khi hết hạn theo thời gian chain và campaign chưa đạt mục tiêu.'
  if (action === 'finalizeMilestoneTimeout' && !refund.canFinalizeMilestone) return 'Milestone hiện tại chưa đến hạn chốt thất bại theo thời gian chain.'
  if (action === 'cancelCampaign') {
    if (refund.campaign.state !== 'FUNDING') return 'Chỉ hủy trong thời gian gây quỹ, trước khi đủ vốn.'
    if (address?.toLowerCase() !== refund.campaign.organizer.toLowerCase()) return `Chọn ví đại diện tổ chức: ${refund.campaign.organizer}.`
    if (!confirmCancel) return 'Đánh dấu xác nhận hủy trước khi ký. Hành động không thể hoàn tác.'
  }
  return ''
}
