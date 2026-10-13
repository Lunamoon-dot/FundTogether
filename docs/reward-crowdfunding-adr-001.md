# ADR 001: Reward Crowdfunding Financial Invariants & Verification Flows

> Ngày quyết định: 2026-10-12  
> Trạng thái: SUPERSEDED FOR NEW REWARD CAMPAIGNS by `docs/reward/FUNDTOGETHER_CAMPAIGN_CONFIG_MVP.md` (2026-10-13). Retained as the historical physical-fulfilment baseline; it does not authorise new physical reward work.
> Tham chiếu: `docs/FUNDTOGETHER_REWARD_PIVOT_AGENT_SPEC.md`, `contracts/src/reward/FundTogetherReward.sol`

---

## 1. Ngữ cảnh & Động lực

Hệ thống FundTogether chuyển hướng sản phẩm mới sang **Reward Crowdfunding** cho Creator và Backer. Để khắc phục triệt để các lỗ hổng của các nền tảng gọi vốn truyền thống (thiếu minh bạch dòng tiền, thất thoát cọc in ấn, bán khống phần thưởng, quỵt hàng), hệ thống thiết lập các ranh giới tài chính và xác minh chặt chẽ:
- Tiền không được giải ngân một lần toàn bộ mà giải ngân theo định mức cọc in ấn có kiểm soát rủi ro.
- Entitlement (quyền nhận quà) không được sinh tự do qua API mà bắt buộc bắt nguồn từ sự kiện on-chain đã đối chiếu.
- Quyền truy cập nội dung số (Digital Access) chỉ mở khóa sau khi nghiệm thu mẫu in đạt chuẩn (`PRODUCTION_VERIFIED`).
- Dữ liệu định danh và địa chỉ giao hàng của người ủng hộ (PII) phải được mã hóa đối xứng (AES-256-GCM), không lưu plaintext và không công khai lên blockchain.

---

## 2. Bốn Luồng Xác Minh (4 Verification Flows - V1 to V4)

| Luồng | Quyết định thẩm định | Bằng chứng | Thẩm quyền | Hệ quả trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| **V1. Creator Verification** | Ai là tác giả có quyền gọi vốn và ký ví? | CCCD/Hộ chiếu, chữ ký ví, cam kết sở hữu trí tuệ (IP) tác phẩm | Admin | `creatorProfile.status = VERIFIED` mới được tạo và đóng băng chiến dịch |
| **V2. Campaign & Budget Review** | Kế hoạch xuất bản, dự toán in ấn, số lượng quà có khả thi? | Dự toán xưởng in, biểu phí giao hàng, tiến độ vẽ/in, hash cam kết đóng băng | Resolver | Resolver duyệt `APPROVED`, chiến dịch mới được phát hành On-chain |
| **V3. Expenditure & Production** | Cọc in ấn có chi đúng xưởng in? Mẫu in thực tế đạt chuẩn? | Hóa đơn VAT, sao kê chuyển khoản xưởng in, ảnh chụp mẫu in thử (sample proofs) | Resolver + Challenge Backer 3 ngày | `FINANCIALLY_SETTLED` sau 3 ngày; `PRODUCTION_VERIFIED` mở khóa mã đọc số |
| **V4. Fulfillment & Delivery** | Từng độc giả đã nhận đủ quà chưa? Có thất lạc/hỏng hóc? | Vận đơn bưu điện, mã tra cứu, biên bản phát hàng, khiếu nại của Backer | Backer xác nhận, Resolver phân xử tranh chấp | `FULFILLING` $\to$ `DELIVERED` $\to$ `CONFIRMED` hoặc `DISPUTED` $\to$ `REFUND_ELIGIBLE` |

---

## 3. Các Bất Biến Tài Chính & Kế Toán (Financial Invariants)

1. **Bảo toàn Custody tuyệt đối:**
   $$\text{Contributions} + \text{Actual Returns} = \text{Gross Paid} + \text{Refunds Paid} + \text{Escrow Available}$$
   Không có phí ẩn, không có rò rỉ token.

2. **Khóa Trần Cọc In Ấn ($\le 50\%$ Goal):**
   - Khoản giải ngân đầu tiên cho đợt in ấn bị chặn cứng ở mức tối đa $50\%$ mục tiêu gây quỹ (`amount <= goal / 2`).
   - Tiền giải ngân chuyển trực tiếp về `creatorWallet` đã được xác minh.
   - Khoản giải ngân tiếp theo chỉ được mở khi khoản trước đã được quyết toán chi tiêu (`FINANCIALLY_SETTLED`) hoặc hoàn trả tiền thừa (`returnFunds`).

3. **Cơ chế Hoàn Tiền (Refund Rules):**
   - **Thất bại khi gây quỹ (`goal` không đạt khi hết hạn):** Backer được rút lại **100% số tiền đã góp** từ Escrow.
   - **Dừng sản xuất giữa chừng (`startWindDown`):** Số tiền còn lại trong Escrow được chia hoàn trả tỷ lệ chính xác theo tỷ lệ đóng góp của từng Backer:
     $$\text{Refund Entitlement} = \text{Contribution} \times \frac{\text{Escrow Available}}{\text{Total Contributed}}$$
     Backer đã nhận hoàn tiền sẽ chuyển entitlement sang trạng thái `REFUNDED` và không thể yêu cầu giao quà vật lý thêm.

4. **Loại trừ tranh chấp và giao hàng (No Overlap):**
   - Khi entitlement đang ở trạng thái `DISPUTED`, không thể đánh dấu `CONFIRMED`.
   - Nếu Resolver phân xử `RESOLVED_BACKER` (thất lạc/hỏng không thể giao bù), entitlement chuyển thành `REFUND_ELIGIBLE`.

---

## 4. Chính Sách Bảo Vệ Quyền Riêng Tư (PII Protection)

- **Thuật toán mã hóa:** AES-256-GCM với khóa bí mật ứng dụng (`REWARD_PII_ENCRYPTION_KEY`).
- **Phạm vi mã hóa:** Họ và tên, Địa chỉ chi tiết, Số điện thoại của Backer.
- **Kiểm soát truy cập (ACL):**
  - Chỉ duy nhất Backer sở hữu entitlement và Creator của chiến dịch đó mới có quyền giải mã thông tin giao hàng khi xuất xưởng.
  - Quản trị viên, Resolver và công chúng không thể xem plaintext địa chỉ cá nhân của Backer.
