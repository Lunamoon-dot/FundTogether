# FundTogether — Reward Crowdfunding Architecture Specification

> **Tài liệu:** Đặc tả kiến trúc và quy tắc vận hành Reward Crowdfunding (Tài trợ dựa trên phần thưởng).  
> **Ngày phê duyệt:** 2026-10-12.  
> **Ngữ cảnh:** Chuyển đổi định hướng sản phẩm chiến dịch mới từ quyên góp từ thiện sang gây quỹ sản xuất sáng tạo nhận phần thưởng (Reward-Based Crowdfunding cho tác giả, họa sĩ và người ủng hộ).  
> **Pilot Vertical:** Xuất bản truyện tranh độc lập (Independent Comics) và Sách nghệ thuật (Artbooks) kèm phần thưởng số (Digital Access) và hiện vật (Physical Merchandise).  
> **Mạng thử nghiệm:** Local Anvil MockUSDC (Chain 31339). Bảo toàn nguyên vẹn dữ liệu và hợp đồng từ thiện lịch sử (Workflow A, B, HED P1).

---

## 1. Bản chất nghiệp vụ & Định vị sản phẩm

### 1.1. So sánh với các mô hình trước đây
| Đặc tính | Quyên góp Từ thiện (HED P1) | Reward Crowdfunding (FundTogether Reward) |
|---|---|---|
| **Người khởi tạo** | Tổ chức thiện nguyện (Organizer) | Tác giả / Đội ngũ sáng tạo (Creator) |
| **Người đóng góp** | Nhà hảo tâm (Donor) | Người ủng hộ nhận thưởng (Backer) |
| **Quyền lợi người đóng góp** | Không nhận lại vật chất (Được đối chiếu sao kê & kết quả) | Nhận quyền lợi phần thưởng cụ thể (Entitlement) theo từng gói (Tier) |
| **Mục tiêu sử dụng vốn** | Cứu trợ, mua quà trao tặng người nghèo | Chi phí in ấn, gia công merchandise, vận chuyển |
| **Cơ chế chống thất thoát** | Trần 25% mỗi request, 50% outcome | Đặt cọc in ấn theo tiến độ xưởng in (lên tới 50%), giữ quỹ hoàn thành (Fulfillment Reserve) |
| **Tiêu chí hoàn tất** | Bàn giao quà cho người thụ hưởng ngoài đời | Backer nhận đúng phần thưởng đã cam kết (Sách in/Tệp số) |

### 1.2. Các bên tham gia (Actors)
1. **Creator (Tác giả / Nhà sáng tạo):** Người sở hữu bản quyền hoặc quyền phát hành tác phẩm, chịu trách nhiệm dự toán ngân sách, quản lý xưởng in, nộp hóa đơn chi tiêu và giao phần thưởng.
2. **Backer (Người ủng hộ):** Người đóng góp MockUSDC vào một Tier phần thưởng cụ thể. Nhận quyền sở hữu Entitlement hợp lệ; có quyền kiểm tra tiến độ, nhận hàng, và mở khiếu nại nếu không nhận được quà.
3. **Resolver (Bên thẩm định & Phân xử):** Kiểm tra tính khả thi của dự án và dự toán in ấn trước khi mở bán; nghiệm thu hóa đơn xưởng in; xác nhận hoàn tất sản xuất (Production Verified) và phân xử tranh chấp giao hàng.
4. **Admin:** Duyệt danh tính tác giả (Creator Identity/KYC), kiểm tra tránh mạo danh bản quyền trí tuệ. Không có quyền can thiệp số dư Escrow.

---

## 2. Chuỗi 4 Luồng Xác Thực (Verification Flows)

```text
Flow 1: Creator Verification (Admin)
  │  (Xác thực danh tính, tư cách pháp nhân / tác quyền)
  ▼
Flow 2: Campaign & Reward Feasibility (Resolver)
  │  (Thẩm định dự toán xưởng in, số lượng in, giá Tier, cam kết giao hàng)
  ▼
  [ Mở Pledge ──► Đủ Goal 100% ──► Escrow khóa toàn bộ vốn ]
  ▼
Flow 3: Production & Expense Verification (Resolver)
  │  (Giải ngân đặt cọc in ấn ──► Đối chiếu hóa đơn VAT/Phiếu thu xưởng in ──► Nghiệm thu sách in thực tế)
  ▼
Flow 4: Reward Fulfillment Verification (Backer + Resolver)
     (Kích hoạt Digital Access ──► Gửi hàng theo đợt ──► Backer xác nhận ──► Phân xử khiếu nại nếu lỗi)
```

### Flow 1 — Creator Verification
- **Người thực hiện:** Admin hệ thống.
- **Mục tiêu:** Đảm bảo tác giả có thật, liên kết ví chính chủ, cam kết quyền sở hữu tác phẩm (IP Ownership declaration).
- **Trạng thái:** `PENDING` $\to$ `VERIFIED` / `REJECTED`.

### Flow 2 — Campaign & Reward Feasibility Verification
- **Người thực hiện:** Resolver.
- **Mục tiêu:** Thẩm định tính khả thi của dự toán sản xuất (báo giá in ấn từ nhà in, số lượng trang, định lượng giấy, chi phí vận chuyển) và cấu trúc các gói thưởng (Reward Tiers).
- **Hành động on-chain:** Đóng băng `commitmentHash` của chiến dịch và danh mục Tiers.

### Flow 3 — Production & Expense Verification
- **Người thực hiện:** Resolver + Creator.
- **Tiến trình:**
  1. Creator gửi yêu cầu giải ngân đợt 1 (ví dụ 40-50% ngân sách in ấn để xưởng in lên kẽm, mua giấy).
  2. Resolver duyệt $\to$ Smart contract chuyển MockUSDC trực tiếp vào `creatorWallet`.
  3. Creator nộp hóa đơn/hợp đồng in ấn $\to$ Resolver thẩm định $\to$ Mở cửa sổ phản đối (Challenge Window 3 ngày) $\to$ Quyết toán tài chính (`FINANCIALLY_SETTLED`).
  4. Sách in hoàn thành tại xưởng $\to$ Creator nộp biên bản nghiệm thu xưởng in và video/ảnh mẫu sách thật $\to$ Resolver kích hoạt `PRODUCTION_VERIFIED` trên smart contract.

### Flow 4 — Reward Fulfillment Verification
- **Người thực hiện:** Backer + Resolver.
- **Tiến trình:**
  1. **Digital Tiers:** Khi smart contract ghi nhận `PRODUCTION_VERIFIED`, quyền truy cập tệp số (PDF/EPUB) được tự động kích hoạt cho Backer.
  2. **Physical Tiers:** Creator nộp danh sách mã vận đơn theo đợt (Fulfillment Batches); Backer cập nhật địa chỉ giao hàng riêng tư (PII protected).
  3. Khi nhận hàng, Backer bấm xác nhận đã nhận (`CONFIRMED`). Nếu quá hạn cam kết hoặc hàng hư hỏng, Backer mở khiếu nại (`openDispute`) để Resolver phân xử (`RESOLVED_BACKER` $\to$ `REFUND_ELIGIBLE` hoặc `RESOLVED_CREATOR` / `DISMISSED` $\to$ `CONFIRMED`).
  4. **Điều kiện hoàn tất Fulfillment (`FULFILLMENT_COMPLETE`):** Resolver chỉ được xác nhận hoàn tất giao hàng (`attestFulfillmentComplete` kết hợp biên lai on-chain `recordFulfillmentComplete`) khi chiến dịch đang ở trạng thái `PRODUCTION_VERIFIED` **và toàn bộ 100% physical entitlements (`isDigital = false`) đã ở trạng thái `CONFIRMED` hoặc đã được giải quyết khiếu nại/hoàn tiền (`REFUND_ELIGIBLE` / `REFUNDED`)**. Sau khi đạt `FULFILLMENT_COMPLETE`, Creator hoặc Resolver mới được phép đóng chiến dịch (`completeCampaign` $\to$ `COMPLETED`).

---

## 3. Quy tắc Tài chính & Bất biến Smart Contract

### 3.1. Bất biến bảo toàn dòng tiền (Custody Conservation Invariant)
$$
\sum \text{Contributions} + \sum \text{ActualReturns} = \sum \text{Disbursements} + \sum \text{RefundsPaid} + \text{EscrowBalance}
$$

### 3.2. Cấu trúc Reward Tier & Cơ chế Pledge
- Mỗi Tier gồm:
  - `tierId` (uint256)
  - `price` (uint256, MockUSDC base units)
  - `maxQuantity` (uint256, giới hạn nguồn cung)
  - `isDigital` (bool)
- Khi Backer gọi hàm `pledge(campaignId, tierId, quantity)`:
  - Kiểm tra `quantity > 0` và `pledgedQuantity + quantity <= maxQuantity`.
  - Thu đúng `amount = price * quantity` từ ví Backer vào Escrow.
  - Tăng `contributed += amount`, `available += amount`.
  - Sinh sự kiện `RewardPledged(campaignId, backer, tierId, quantity, amount)`.

### 3.3. Quy tắc Đạt mục tiêu (Funding Goal) & Thất bại
- Chiến dịch có `goal` và `fundingDeadline`.
- **Thất bại khi gây quỹ:** Nếu đến hạn mà `contributed < goal`:
  - Trạng thái chuyển sang `FUNDING_FAILED`.
  - Toàn bộ 100% tiền đóng góp của Backer được quyền rút lại qua hàm `claimRefund(campaignId)`.
- **Thành công:** Khi `contributed >= goal` trong thời hạn:
  - Resolver kích hoạt `activateCampaign(campaignId)`.
  - Quỹ chuyển sang trạng thái `ACTIVE`.

### 3.4. Giới hạn giải ngân sản xuất (Production Disbursement Caps)
- Trong xuất bản truyện tranh/artbook, xưởng in yêu cầu thanh toán cọc sản xuất.
- Smart contract quy định:
  - Đợt 1 (Cọc in ấn): Tối đa **50% Goal** (`amount <= goal / 2`).
  - Đợt 2 (Phần còn lại sau in): Chỉ được tạo sau khi Đợt 1 đã `FINANCIALLY_SETTLED`.
  - Quỹ còn lại (tối thiểu 10-20% Goal) được bảo lưu trong Escrow làm **Fulfillment Reserve** cho tới khi xác nhận sản xuất hoàn tất.

### 3.5. Dừng chiến dịch & Hoàn tiền theo tỷ lệ (Wind-Down & Proportional Refund)
- Nếu chiến dịch bị hủy hoặc quá thời hạn cam kết sản xuất (Execution Horizon) mà không giao hàng:
  - Kích hoạt `startWindDown(campaignId)`.
  - Toàn bộ số dư còn lại trong Escrow được chốt vào `basePool`.
  - Mỗi Backer được quyền nhận hoàn tiền theo đúng tỷ lệ số tiền mình đã đóng góp trên tổng quỹ huy động:
$$
\text{RefundAmount}_i = \frac{\text{Contribution}_i \times \text{BasePool}}{\text{Contributed}}
$$
- Khoản hoàn tiền cộng dồn (Supplement Pool) được bổ sung nếu Creator tự giác nộp lại tiền thừa qua `returnFunds`.

---

## 4. Mô hình Trạng thái (State Machine)

### 4.1. Campaign Lifecycle
```text
DRAFT ──► FROZEN ──► UNDER_REVIEW ──► APPROVED ──► PUBLISHED (On-Chain FUNDING)
                                                      │
                        ┌─────────────────────────────┴─────────────────────────────┐
                        ▼                                                           ▼
                STOPPED (Funding Failed)                                          ACTIVE
                                                                                    │
                                                    ┌───────────────────────────────┴───────────────────────────────┐
                                                    ▼                                                               ▼
                                          PRODUCTION_VERIFIED                                             STOPPED (Wind-Down)
                                                    │
                                                    ▼
                                          FULFILLMENT_COMPLETE
                                                    │
                                                    ▼
                                                COMPLETED
```

### 4.2. Reward Entitlement Lifecycle
```text
ACTIVE ──► REDEEM_REQUESTED ──► FULFILLING ──► DELIVERED ──► CONFIRMED
  │                                                │
  ▼                                                ▼
REFUND_ELIGIBLE ──► REFUNDED                   DISPUTED ──► CONFIRMED / REFUND_ELIGIBLE
```

---

## 5. Bảo vệ Dữ liệu Riêng tư (Privacy & PII Protection)
- Địa chỉ nhận hàng, số điện thoại, tên thật của Backer **tuyệt đối không lưu on-chain**.
- Dữ liệu vận chuyển được mã hóa AES-256-GCM lưu trữ ở Backend, chỉ Creator và Backer sở hữu Entitlement mới có quyền truy cập.
- Trên Blockchain chỉ lưu trữ mã băm xác thực lô hàng (`batchManifestHash`) và mã băm cam kết (`commitmentHash`).

---

## 6. Đồng bộ Chuỗi chuẩn tắc & Xử lý Reorg (Canonical Indexing & Reorg Reconciliation)
- Mọi trạng thái tài chính và quyền nhận thưởng (`reward_campaigns`, `reward_tiers`, `reward_entitlements`, `reward_campaign_projection`) bắt nguồn từ chuỗi chuẩn tắc: `chain → canonical event → projection`.
- Checkpoint trên `indexer_streams` luôn lưu cặp `(last_block, last_block_hash)` của cùng một khối đích đã xác thực.
- Khi phát hiện reorg (sai lệch `block_hash` tại `last_block` hoặc tại bất kỳ khối nào của sự kiện `canonical = true` trong `chain_events`):
  1. Đánh dấu toàn bộ sự kiện cũ của stream là `canonical = false` và xóa `reward_campaign_projection` của stream.
  2. Quét lại toàn bộ log chuẩn tắc từ khối `0` đến `headBlock`, khôi phục `canonical = true` cho các sự kiện còn nằm trên nhánh chính.
  3. Thu hồi mọi entitlement mồ côi (`RewardPledged` thuộc giao dịch bị reorg), tính lại `pledged_quantity` của từng Tier, thu hồi `digital_access_code` nếu `ProductionVerified` không còn trên nhánh chính, và đồng bộ lại trạng thái chiến dịch cùng `reward_campaign_projection` khớp tuyệt đối với trạng thái hợp đồng trên nhánh chuẩn tắc.

