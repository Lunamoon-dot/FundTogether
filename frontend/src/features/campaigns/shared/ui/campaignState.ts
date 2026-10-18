export type CampaignUiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type CampaignUiActor = 'creator' | 'resolver' | 'backer' | 'system' | 'none';

export const CAMPAIGN_CHAIN_STATE = {
  FUNDING: 0,
  ACTIVE: 1,
  RELEASE_REVIEW: 2,
  RELEASED: 3,
  REFUNDING: 4,
  COMPLETION_REQUESTED: 5,
  COMPLETED: 6,
} as const;

export interface CampaignUiState {
  label: string;
  tone: CampaignUiTone;
  summary: string;
  actor: CampaignUiActor;
  nextAction?: string;
  technicalCode?: string;
}

export interface CampaignUiStateInput {
  status?: string | null;
  chainState?: number | null;
  publicationStatus?: 'NOT_PUBLISHED' | 'ORPHANED' | 'ON_CHAIN_CONFIRMED' | null;
  access?: string | null;
  role?: 'public' | 'creator' | 'resolver' | 'backer';
}

export function getProjectedChainState(projection?: Record<string, unknown> | null): number | null {
  const value = projection?.state;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

export function getCampaignUiState(input: CampaignUiStateInput): CampaignUiState {
  const { status, chainState, publicationStatus, access, role } = input;

  // 1. Personal Backer entitlement access takes precedence if provided
  if (access) {
    switch (access) {
      case 'REFUND_ELIGIBLE':
        return {
          label: 'Có thể nhận hoàn tiền',
          tone: 'warning',
          summary: 'Campaign không đạt mục tiêu hoặc đã mở hoàn tiền · Backer cần claim',
          actor: 'backer',
          nextAction: 'Nhận hoàn tiền về ví',
          technicalCode: 'REFUND_ELIGIBLE',
        };
      case 'REFUNDED':
        return {
          label: 'Đã hoàn tiền',
          tone: 'neutral',
          summary: 'Khoản pledge đã được trả lại về ví đã dùng để ủng hộ',
          actor: 'none',
          technicalCode: 'REFUNDED',
        };
      case 'DOWNLOAD_ELIGIBLE':
        return {
          label: 'PDF đã sẵn sàng',
          tone: 'success',
          summary: 'Bản PDF cuối đã được duyệt · Có thể tải riêng tư',
          actor: 'backer',
          nextAction: 'Tải PDF riêng tư',
          technicalCode: 'DOWNLOAD_ELIGIBLE',
        };
      case 'DELIVERY_UNAVAILABLE':
        return {
          label: 'PDF cần kiểm tra',
          tone: 'danger',
          summary: 'Contract đã duyệt bản phát hành nhưng máy chủ chưa có đúng PDF đã cam kết',
          actor: 'resolver',
          nextAction: 'Kiểm tra file phát hành',
          technicalCode: 'DELIVERY_UNAVAILABLE',
        };
      case 'PENDING_RELEASE':
        return {
          label: 'Đang chờ PDF',
          tone: 'info',
          summary: 'Pledge đã ghi nhận · Chờ Creator cập nhật bằng chứng và Resolver duyệt PDF',
          actor: 'creator',
          nextAction: 'Theo dõi tiến độ',
          technicalCode: 'PENDING_RELEASE',
        };
      case 'ORPHANED':
        return {
          label: 'Không còn hợp lệ',
          tone: 'danger',
          summary: 'Giao dịch không còn thuộc deployment canonical hiện tại',
          actor: 'none',
          technicalCode: 'ORPHANED',
        };
    }
  }

  // 2. Publication status is distinct from the contract lifecycle.
  if (publicationStatus === 'ORPHANED') {
    return {
      label: 'Cần đối chiếu giao dịch',
      tone: 'danger',
      summary: 'Có dấu vết phát hành nhưng chưa có binding canonical hợp lệ · Chưa mở pledge',
      actor: role === 'resolver' ? 'resolver' : 'system',
      nextAction: role === 'resolver' ? 'Đối chiếu receipt và indexer' : 'Chờ hệ thống đối chiếu',
      technicalCode: 'ORPHANED',
    };
  }
  if ((status === 'APPROVED' || status === 'PUBLISHED') && publicationStatus === 'NOT_PUBLISHED') {
    return {
      label: 'Chờ kích hoạt',
      tone: 'warning',
      summary: 'Hồ sơ đã duyệt · Chưa có campaign canonical trên contract · Chưa mở pledge',
      actor: role === 'resolver' ? 'resolver' : 'creator',
      nextAction: role === 'resolver' ? 'Ký commitment' : 'Chờ Resolver ký hoặc tạo campaign',
      technicalCode: 'NOT_PUBLISHED',
    };
  }
  if (status === 'APPROVED' && publicationStatus === 'ON_CHAIN_CONFIRMED' && chainState == null) {
    return {
      label: 'Đang đồng bộ campaign',
      tone: 'info',
      summary: 'Binding đã canonical nhưng chưa đọc được trạng thái contract · Chưa mở pledge',
      actor: 'system',
      nextAction: 'Kiểm tra lại trạng thái',
      technicalCode: 'ON_CHAIN_CONFIRMED',
    };
  }

  // 3. Canonical on-chain state if available
  if (chainState !== undefined && chainState !== null) {
    switch (chainState) {
      case 0: // FUNDING
        return {
          label: 'Đang gây quỹ',
          tone: 'success',
          summary: 'Đang gây quỹ · Backer có thể ủng hộ',
          actor: 'backer',
          nextAction: 'Ủng hộ campaign',
          technicalCode: 'FUNDING',
        };
      case 1: // PRODUCTION
        return {
          label: 'Đang sản xuất',
          tone: 'info',
          summary: 'Gây quỹ thành công · Creator đang sản xuất',
          actor: 'creator',
          nextAction: role === 'creator' ? 'Cập nhật tiến độ' : 'Theo dõi tiến độ',
          technicalCode: 'PRODUCTION',
        };
      case 2: // EVIDENCE_SUBMITTED / PENDING_RESOLVER
        return {
          label: 'Chờ duyệt PDF',
          tone: 'info',
          summary: 'Bằng chứng đã gửi · Chờ Resolver thẩm định bản PDF',
          actor: 'resolver',
          nextAction: role === 'resolver' ? 'Thẩm định bản PDF' : 'Chờ Resolver thẩm định',
          technicalCode: 'EVIDENCE_SUBMITTED',
        };
      case 3: // ACCEPTED / EVIDENCE_REVIEWED
        return {
          label: 'PDF đã được duyệt',
          tone: 'success',
          summary: 'Bản PDF đã được chấp nhận · Đang mở tải cho backer',
          actor: 'backer',
          nextAction: 'Tải PDF',
          technicalCode: 'RELEASE_ACCEPTED',
        };
      case 4: // REFUNDING
        return {
          label: 'Thất bại · hoàn tiền',
          tone: 'warning',
          summary: role === 'creator'
            ? 'Campaign không đạt mục tiêu · Backer tự claim hoàn tiền, Creator không cần thao tác'
            : 'Campaign không đạt mục tiêu · Backer có thể claim lại khoản pledge',
          actor: 'backer',
          nextAction: role === 'creator' ? undefined : 'Nhận hoàn tiền',
          technicalCode: 'REFUNDING',
        };
      case 5: // COMPLETION_REQUESTED
        return {
          label: 'Chờ Resolver chốt hoàn thành',
          tone: 'warning',
          summary: 'Creator đã gửi hồ sơ hoàn thành · Chờ Resolver duyệt hoặc yêu cầu sửa',
          actor: 'resolver',
          nextAction: role === 'resolver' ? 'Thẩm định hồ sơ hoàn thành' : 'Theo dõi quyết định hoàn thành',
          technicalCode: 'COMPLETION_REQUESTED',
        };
      case 6: // COMPLETED
        return {
          label: 'Đã hoàn thành · chờ quyết toán surplus',
          tone: 'neutral',
          summary: 'Creator đã nhận đúng goal; Backer tự chọn nhận hoặc gửi phần surplus của mình',
          actor: 'none',
          technicalCode: 'COMPLETED',
        };
    }
  }

  // 3. Application / draft review lifecycle status
  switch (status) {
    case 'DRAFT':
      return {
        label: 'Bản nháp',
        tone: 'neutral',
        summary: 'Bản nháp · Creator cần hoàn thiện hồ sơ',
        actor: 'creator',
        nextAction: 'Tiếp tục hoàn thiện hồ sơ',
        technicalCode: 'DRAFT',
      };
    case 'FROZEN':
      return {
        label: 'Đã khóa hồ sơ',
        tone: 'info',
        summary: 'Đã khóa hồ sơ · Chờ gửi thẩm định',
        actor: 'creator',
        nextAction: 'Gửi thẩm định',
        technicalCode: 'FROZEN',
      };
    case 'UNDER_REVIEW_PRIVATE':
      return {
        label: 'Đang thẩm định riêng',
        tone: 'info',
        summary: 'Resolver đang thẩm định riêng · Chưa mở góp ý cộng đồng',
        actor: 'resolver',
        nextAction: role === 'resolver' ? 'Thẩm định hồ sơ' : 'Chờ Resolver đánh giá',
        technicalCode: 'UNDER_REVIEW_PRIVATE',
      };
    case 'COMMUNITY_REVIEW':
      return {
        label: 'Community Review',
        tone: 'info',
        summary: 'Đang mở góp ý cộng đồng · Chưa mở pledge',
        actor: role === 'resolver' ? 'resolver' : 'backer',
        nextAction: role === 'resolver' ? 'Chốt quyết định duyệt' : 'Gửi ý kiến đóng góp',
        technicalCode: 'COMMUNITY_REVIEW',
      };
    case 'CHANGES_REQUESTED':
      return {
        label: 'Cần bổ sung',
        tone: 'warning',
        summary: 'Cần bổ sung · Creator cần cập nhật hồ sơ',
        actor: 'creator',
        nextAction: 'Cập nhật hồ sơ theo yêu cầu',
        technicalCode: 'CHANGES_REQUESTED',
      };
    case 'REJECTED':
      return {
        label: 'Đã từ chối',
        tone: 'danger',
        summary: 'Hồ sơ không được phê duyệt',
        actor: 'none',
        technicalCode: 'REJECTED',
      };
    case 'APPROVED':
    case 'PUBLISHED':
      return {
        label: 'Chờ kích hoạt',
        tone: 'warning',
        summary: 'Đã duyệt · Chờ kích hoạt campaign trên contract',
        actor: 'creator',
        nextAction: role === 'creator' || role === 'resolver' ? 'Kích hoạt on-chain' : 'Chờ mở gây quỹ',
        technicalCode: 'APPROVED',
      };
    case 'FUNDING':
      return {
        label: 'Đang gây quỹ',
        tone: 'success',
        summary: 'Đang gây quỹ · Backer có thể ủng hộ',
        actor: 'backer',
        nextAction: 'Ủng hộ campaign',
        technicalCode: 'FUNDING',
      };
    case 'REFUND_ELIGIBLE':
      return {
        label: 'Có thể nhận hoàn tiền',
        tone: 'warning',
        summary: 'Có thể nhận hoàn tiền · Backer cần claim',
        actor: 'backer',
        nextAction: 'Nhận hoàn tiền',
        technicalCode: 'REFUND_ELIGIBLE',
      };
    case 'REFUNDED':
      return {
        label: 'Đã hoàn tiền',
        tone: 'neutral',
        summary: 'Đã hoàn tiền',
        actor: 'none',
        technicalCode: 'REFUNDED',
      };
    default:
      return {
        label: status || 'Không xác định',
        tone: 'neutral',
        summary: 'Trạng thái hiện tại',
        actor: 'none',
        technicalCode: status || undefined,
      };
  }
}
