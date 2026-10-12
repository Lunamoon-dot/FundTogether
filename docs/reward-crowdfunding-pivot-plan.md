# FundTogether — Reward Crowdfunding Pivot Implementation Plan

> **Mục tiêu:** Kế hoạch hành động chi tiết từng giai đoạn (Phase 0 đến Phase 6) để chuyển đổi luồng chiến dịch mới của FundTogether sang **Reward Crowdfunding**, đồng thời bảo toàn 100% dữ liệu, hợp đồng và bộ test của các hệ thống từ thiện trước đây (Workflow A, B, HED P1).  
> **Ngày phê duyệt:** 2026-10-12.  
> **Tham chiếu chuẩn:** [`docs/FUNDTOGETHER_REWARD_PIVOT_AGENT_SPEC.md`](file:///c:/Users/dell/Desktop/FundTogether/docs/FUNDTOGETHER_REWARD_PIVOT_AGENT_SPEC.md) và [`docs/reward-crowdfunding-spec.md`](file:///c:/Users/dell/Desktop/FundTogether/docs/reward-crowdfunding-spec.md).

---

## 1. Nguyên tắc Bảo toàn & Cách tiếp cận Cô lập (Isolation Strategy)

Hệ thống FundTogether hiện tại đã trải qua các phiên bản:
1. **Workflow A/B:** Milestone escrow cho từ thiện.
2. **HED P1 (Disbursement):** Cơ chế giải ngân theo yêu cầu lấy xác thực làm trọng tâm (Verification-Centric) cho từ thiện.

**Nguyên tắc cốt lõi của Pivot:**
- **Không ghi đè hoặc xóa bỏ hợp đồng HED P1:** [`FundTogetherDisbursement.sol`](file:///c:/Users/dell/Desktop/FundTogether/contracts/src/FundTogetherDisbursement.sol) và bộ test 22 tests của nó được giữ nguyên vẹn.
- **Không chạy migration phá hủy database:** Bảng `disbursement_campaigns`, `disbursement_requests`, v.v. được bảo lưu toàn bộ.
- **Tạo domain mới riêng biệt cho Reward Crowdfunding:**
  - Hợp đồng mới: `FundTogetherReward.sol` nằm trong namespace riêng `contracts/src/reward/`.
  - Schema mới: `reward.schema.ts` với các bảng có tiền tố `reward_*`.
  - Module Backend mới: `backend/src/reward/` được cô lập.
  - UI mới: Tích hợp vào khu vực khám phá và tạo chiến dịch cho Creator & Backer.

---

## 2. Bảng Quyết định Thiết kế (ADR - Architecture Decision Record)

| Quyết định | Lựa chọn được duyệt | Lý do & Căn cứ thực tế |
|---|---|---|
| **Mô hình góp vốn** | Theo gói phần thưởng (`pledge(tierId, quantity)`) | Sát thực tế xuất bản truyện tranh/artbook; mỗi tier có giá và giới hạn số lượng in ấn cụ thể. |
| **Quyền sở hữu Entitlement** | Gắn với địa chỉ ví & tài khoản Backer; phi tập trung hóa qua Event on-chain, quản lý chi tiết qua DB | MVP không cần phức tạp hóa thành NFT ERC-721/1155; Backer nhận mã chứng thực và link truy cập tệp số hoặc mã vận đơn. |
| **Trần giải ngân sản xuất** | Tối đa **50% Goal** cho đợt cọc đầu tiên | Xưởng in truyện tranh/artbook đòi hỏi cọc 40-50% tiền giấy và kẽm in trước khi bấm máy; trần 25% của từ thiện không phù hợp thực tế in ấn. |
| **Số lượng Request mở** | Một request tài chính chưa quyết toán tại một thời điểm | Giữ an toàn tài chính: chỉ được xin thanh toán phần còn lại sau khi hóa đơn cọc in đã được Resolver nghiệm thu. |
| **Xác thực hoàn tất sản xuất** | `PRODUCTION_VERIFIED` độc lập với thanh toán | Tách biệt rào chắn: tiền đã trả cho xưởng in không đồng nghĩa sách đã in xong; Resolver phải nghiệm thu sách mẫu trước khi cho phép kích hoạt phần thưởng số và gửi hàng. |
| **Chính sách hoàn tiền khi dừng** | Hoàn tiền tỷ lệ thuận trên số dư thực tế còn lại trong Escrow | Đã chi cho xưởng in thì tiền không tự động thu hồi được; Backer được chia hoàn tiền sòng phẳng từ quỹ còn lại trong Escrow. |

---

## 3. Lộ trình 6 Chặng Triển khai (Execution Phases)

```text
Phase 0: Quyết định Kiến trúc & Đặc tả (Hoàn thành)
   │
Phase 1: Smart Contract Reward Escrow & Invariant Tests
   │     (FundTogetherReward.sol + Test unit & fuzz custody 256 runs)
   │
Phase 2: Database Schema & Migration Bổ sung (Additive)
   │     (reward.schema.ts: reward_campaigns, reward_tiers, reward_entitlements, fulfillment)
   │
Phase 3: Backend API, DTO Validation & Event Indexer
   │     (Reward Module: Campaign, Tiers, Pledge, Fulfillment, Reviews)
   │
Phase 4: Frontend UI (Creator & Backer Workspaces)
   │     (Tạo chiến dịch truyện tranh, cấu hình Tiers, Pledge, My Rewards, Dual-Exposure Tracker)
   │
Phase 5: Kiểm chứng Tự động End-to-End (E2E Suite)
   │     (Kịch bản Happy Path, Cháy hàng Tier, Cọc in ấn, Nghiệm thu sản xuất, Tranh chấp, Hoàn tiền)
   │
Phase 6: Cập nhật Báo cáo & Tài liệu Toàn dự án
```

### Phase 1 — Smart Contract Reward Escrow & Tests
- Tạo [`contracts/src/reward/RewardTypes.sol`](file:///c:/Users/dell/Desktop/FundTogether/contracts/src/reward/RewardTypes.sol) và [`contracts/src/reward/FundTogetherReward.sol`](file:///c:/Users/dell/Desktop/FundTogether/contracts/src/reward/FundTogetherReward.sol):
  - Struct `RewardTierView`: `tierId`, `price`, `maxQuantity`, `pledgedQuantity`, `isDigital`.
  - Quản lý chiến dịch: `createCampaign`, `pledge`, `activateCampaign`, `finalizeFundingFailure`.
  - Giải ngân sản xuất: `submitDisbursementRequest`, `approveAndDisburse`, `candidateExpenditure`, `finalizeExpenditure`, `returnFunds`.
  - Nghiệm thu sản xuất: `recordProductionVerified`.
  - Hoàn tiền: `startWindDown`, `claimRefund`.
- Tạo test suite [`contracts/test/unit/Reward/RewardFundingAndFulfillment.t.sol`](file:///c:/Users/dell/Desktop/FundTogether/contracts/test/unit/Reward/RewardFundingAndFulfillment.t.sol):
  - Fuzz kiểm tra bảo toàn số dư Custody.
  - Kiểm tra chặn mua vượt số lượng Tier (`TierSoldOut`).
  - Kiểm tra hoàn tiền 100% khi không đạt Goal.
  - Kiểm tra cọc in ấn $\le 50\%$ Goal và hoàn tiền tỷ lệ thuận khi dự án dừng.

### Phase 2 — Database Schema & Additive Migration
- Tạo [`backend/src/database/schema/reward.schema.ts`](file:///c:/Users/dell/Desktop/FundTogether/backend/src/database/schema/reward.schema.ts):
  - `rewardCampaigns`: thông tin dự án, mục tiêu, thời hạn giao hàng cam kết.
  - `rewardTiers`: tên gói (Digital PDF, Sách in Bìa mềm, Bản Collector giới hạn), đơn giá, số lượng tối đa.
  - `rewardEntitlements`: quyền nhận thưởng của Backer, trạng thái (`PENDING_FUNDING`, `ACTIVE`, `REDEEM_REQUESTED`, `FULFILLING`, `DELIVERED`, `CONFIRMED`).
  - `fulfillmentBatches`: đợt giao hàng, danh sách mã vận đơn đã mã hóa.
  - `rewardDisputes`: khiếu nại giao nhận hàng.
  - `rewardCampaignProjection`: bản sao dữ liệu được index từ Blockchain.
- Xuất các bảng ra [`backend/src/database/schema/index.ts`](file:///c:/Users/dell/Desktop/FundTogether/backend/src/database/schema/index.ts).

### Phase 3 — Backend API, Indexer & Verification Services
- Triển khai `backend/src/reward/`:
  - `reward.module.ts`: cấu hình dependency.
  - `reward-campaign.service.ts` & `controller.ts`: API tạo chiến dịch, tạo tiers, đóng băng commitment.
  - `reward-pledge.service.ts` & `controller.ts`: API đặt trước phần thưởng và đối chiếu thanh toán on-chain.
  - `reward-fulfillment.service.ts` & `controller.ts`: API cập nhật địa chỉ giao hàng và kích hoạt quyền đọc truyện số.
  - `reward-indexer.service.ts`: lắng nghe sự kiện chain và cập nhật projection.
  - Bổ sung unit tests cho backend schema và services.

### Phase 4 — Frontend UI (Creator & Backer Workspaces)
- Tạo component trong `frontend/src/features/reward/`:
  - `RewardPublicCampaign.tsx`: trang chi tiết dự án truyện tranh/artbook, danh sách các gói Tier lựa chọn, nút Pledge kết nối ví MockUSDC.
  - `RewardCreatorCampaigns.tsx`: giao diện tác giả tạo chiến dịch, đặt số lượng in ấn cho từng gói thưởng, nộp hồ sơ xưởng in.
  - `RewardBackerEntitlements.tsx`: giao diện "Phần thưởng của tôi" (My Rewards) để Backer điền địa chỉ giao hàng, tải truyện tranh số (PDF Reader) và bấm xác nhận nhận sách.
  - `RewardRiskMeter.tsx`: thanh đo rủi ro sản xuất và tỷ lệ phần thưởng đã hoàn thành.

### Phase 5 — Kiểm thử Tự động Toàn diện & Nghiệm thu
- Sinh artifact ABI và Manifest cho Reward Protocol.
- Xây dựng kịch bản kiểm thử E2E:
  - Happy Path (Pledge đủ goal $\to$ Cọc in ấn $\to$ Nghiệm thu sách in $\to$ Kích hoạt tệp số $\to$ Giao sách in $\to$ Xác nhận).
  - Kiểm tra các nhánh biên: Hết hàng Tier, thất bại gây quỹ hoàn tiền 100%, hoàn tiền dôi dư, khiếu nại giao hàng, dừng dự án chia hoàn tiền theo tỷ lệ.
- Chạy toàn bộ test suites:
  - Contracts test trong WSL Ubuntu.
  - Backend `test:reward` và `test:hed`.
  - Frontend production build và lint sạch sẽ.

### Phase 6 — Cập nhật Báo cáo & Tài liệu
- Cập nhật [`GOAL.md`](file:///c:/Users/dell/Desktop/FundTogether/GOAL.md).
- Cập nhật [`docs/PROJECT_PROGRESS.md`](file:///c:/Users/dell/Desktop/FundTogether/docs/PROJECT_PROGRESS.md) ghi nhận đầy đủ bằng chứng kiểm thử.
