# Đặc tả hệ thống giải ngân lấy xác thực làm trọng tâm (Verification-Centric Disbursement)

> Ngày ghi nhận: 2026-10-12 · Phiên bản: v1.0.
> Căn cứ: Quyết định người dùng ngày 2026-10-12 về việc bỏ thực thể Vendor trong Web3 và tập trung vào các luồng xác thực hệ thống.
> Phạm vi: Đặc tả kiến trúc, luồng xác thực, vai trò thẩm định, máy trạng thái và quy tắc tài chính.

---

## 1. Mục tiêu và Nguyên tắc thiết kế

### 1.1. Bối cảnh điều chỉnh
Hệ thống trước đây đặt giả định mọi khoản chi phải trả trực tiếp cho Vendor (`P1 - Direct Vendor Payment`) qua ví Web3. Tuy nhiên, trong thực tế từ thiện tại Việt Nam, hầu hết tiểu thương, đại lý và dịch vụ vận chuyển chỉ nhận tiền mặt hoặc chuyển khoản VNĐ. Việc ép Vendor tạo ví Web3 và ký giao dịch on-chain là khiên cưỡng, gây tắc nghẽn và làm phức tạp hóa hệ thống một cách không cần thiết.

### 1.2. Quyết định định hướng ngày 2026-10-12
1. **Bỏ hoàn toàn thực thể Vendor trong Web3:** Loại bỏ bảng vendor, ví vendor, luồng vendor ký terms (`terms acknowledgement`), và cơ chế chia cọc/thanh toán cuối cho vendor trên hợp đồng thông minh.
2. **Organizer trực tiếp nhận tiền giải ngân:** Escrow chuyển tiền trực tiếp vào ví đại diện của Tổ chức thiện nguyện (`organizerWallet`) để tổ chức chủ động rút fiat/chuyển khoản chi trả cho hoạt động mua sắm ngoài đời thực.
3. **Trọng tâm là Chuỗi 4 Luồng Xác thực:** Dồn toàn bộ năng lực kiểm soát của hệ thống vào quy trình thẩm định trước chi và đối chiếu sau chi dựa trên bằng chứng minh bạch.
4. **Resolver tạm thời là bên xác thực chấp thuận giải ngân:** Để kịp thời triển khai và kiểm chứng hệ thống, Resolver được giao thẩm quyền thẩm định và phê duyệt giải ngân trước mắt. Ghi nhận đây là luồng xuyên suốt quan trọng và có thể tiếp tục mở rộng mô hình phân quyền (hội đồng, đa chữ ký, cộng đồng) trong giai đoạn tiếp theo.

---

## 2. Các Vai trò và Phân định Trách nhiệm

| Vai trò | Trách nhiệm chính | Ranh giới & Giới hạn thẩm quyền |
|---|---|---|
| **Donor (Người đóng góp)** | Đóng góp quỹ, giám sát tiến độ công khai, mở khiếu nại (Challenge) khi phát hiện bằng chứng gian lận, nhận hoàn tiền (Refund) khi chiến dịch dừng/thất bại. | Không can thiệp sửa đổi kế hoạch hoạt động; không tự rút tiền khi chiến dịch đang `ACTIVE` bình thường. |
| **Organizer (Tổ chức thiện nguyện)** | Xác thực hồ sơ tổ chức, lập chiến dịch, tạo yêu cầu giải ngân kèm dự toán, nhận tiền vào ví tổ chức, đi mua sắm và nộp chứng từ chi tiêu, nộp bằng chứng kết quả trao quà, hoàn trả tiền thừa nếu chi không hết. | Không tự ý rút tiền khi chưa có phê duyệt; không được mở yêu cầu mới khi yêu cầu cũ chưa đối chiếu chứng từ; không sửa hồi tố số tiền đã giải ngân. |
| **Admin (Quản trị viên hệ thống)** | Xác thực hồ sơ pháp nhân của tổ chức (Web2 trust), kiểm tra xung đột lợi ích (COI), bảo trì hệ thống. | Không có quyền tự bấm lệnh giải ngân quỹ; không sửa đổi kết luận nghiệp vụ của Resolver. |
| **Resolver (Người thẩm định & Giải quyết tranh chấp)** | **Thẩm định toàn bộ chuỗi bằng chứng:** (1) Duyệt dự toán Request để kích hoạt giải ngân; (2) Duyệt chứng từ chi tiêu để quyết toán tài chính; (3) Duyệt bằng chứng kết quả để nghiệm thu hoạt động; (4) Phân xử khiếu nại của Donor. | Phải giải trình lý do rõ ràng kèm mã tiêu chí (Rubric); không được là bên có quan hệ lợi ích với Organizer; không tự ý chuyển tiền về ví của mình. |

---

## 3. Chuỗi 4 Luồng Xác thực (Verification Flows)

Hệ thống vận hành xoay quanh 4 mắt xích xác thực độc lập nhưng liên kết chặt chẽ:

```text
[Chặng 1: Xác thực Tổ chức] 
       ↓ Đạt
[Chặng 2: Thẩm định Chiến dịch & Dự toán] → Đóng băng Cam kết on-chain
       ↓ Gây quỹ đạt 100% Goal
[Chặng 3: Xác thực Chứng từ Chi tiêu] (Lặp lại theo từng Request)
       ↓ Đối chiếu tài chính xong
[Chặng 4: Xác thực Kết quả Thiện nguyện] → Nghiệm thu & Hoàn tất
```

### 3.1. Chặng 1: Xác thực Tổ chức (Organization Identity Verification)
* **Mục tiêu:** Đảm bảo tổ chức có tư cách pháp nhân thực tế, có người đại diện hợp pháp và liên kết đúng ví Web3.
* **Hồ sơ nộp:** Giấy phép thành lập/hoạt động, CCCD người đại diện, quyết định bổ nhiệm, thông tin tài khoản ngân hàng chính thức, cam kết sử dụng ví.
* **Người duyệt:** ADMIN.
* **Kết quả:** Trạng thái tổ chức chuyển thành `VERIFIED` kèm ngày hết hạn. Chỉ tổ chức `VERIFIED` mới được tạo chiến dịch gây quỹ.

### 3.2. Chặng 2: Thẩm định Chiến dịch & Dự toán (Campaign & Budget Validation)
* **Mục tiêu:** Khóa mục đích, ngân sách trần, các danh mục chi được phép và tiêu chí hoàn thành trước khi mở cho cộng đồng đóng góp.
* **Hồ sơ nộp:** Bản mô tả mục đích, kế hoạch hoạt động, bảng dự toán chi tiết (số lượng, đơn giá tham chiếu), tiêu chí đánh giá kết quả (KPI: số suất quà, địa bàn, đối tượng).
* **Người duyệt:** RESOLVER.
* **Đóng băng on-chain:** Toàn bộ nội dung cam kết được băm SHA-256 (`commitmentHash`) và lưu vào smart contract khi chiến dịch được duyệt. Không ai có thể âm thầm sửa đổi mục đích sau khi đã mở gây quỹ.

#### 3.3. Chặng 3: Xác thực Chứng từ Chi tiêu (Post-Disbursement Financial Verification)
* **Mục tiêu:** Kiểm tra từng đồng tiền giải ngân có thực sự được chi đúng danh mục dự toán hay bị chiếm dụng.
* **Nguyên tắc phân loại chứng từ (Evidence Taxonomy):** Không bắt buộc cứng nhắc mọi khoản chi từ thiện đều phải có hóa đơn VAT điện tử, mà phân loại theo thực tế hoạt động:
  * *Hàng hóa quy mô lớn (đại lý/doanh nghiệp):* Hóa đơn điện tử VAT (kèm mã tra cứu) + Ủy nhiệm chi/Sao kê ngân hàng khớp số tiền và bên thụ hưởng.
  * *Nông sản/Hàng hóa mua lẻ tại địa phương:* Bảng kê thu mua hàng hóa dịch vụ không có hóa đơn (Mẫu 01/TNDN) + Ảnh chụp cân hàng/biên nhận viết tay + Sao kê rút tiền mặt/chuyển khoản cho tiểu thương.
  * *Vận chuyển, bốc xếp, lưu kho:* Phiếu thu/Hợp đồng vận chuyển + Ảnh biển số xe chở hàng + Sao kê chuyển khoản nhà xe.
  * *Cứu trợ tiền mặt trực tiếp:* Danh sách ký nhận của từng hộ dân (có xác nhận chính quyền địa phương) + Video/ảnh phát tiền có gắn thời gian GPS.
* **Nguyên tắc bảo vệ dữ liệu nhạy cảm (PII Redaction):**
  * Hồ sơ gốc đầy đủ thông tin (CCCD, số tài khoản, số điện thoại) lưu tại kho lưu trữ bảo mật riêng tư (Private Storage).
  * Hồ sơ công khai đưa mã băm lên on-chain (Public Hash) bắt buộc phải che/làm mờ thông tin định danh cá nhân nhạy cảm để bảo vệ người thụ hưởng và người bán.
* **Quy trình 3 bước:**
  1. **Tạo Request & Nhận tiền:** Organizer tạo `FundingRequest` gồm các dòng chi phí ($\le 25\%$ Goal) $\rightarrow$ Resolver thẩm định dự toán $\rightarrow$ Resolver kích hoạt lệnh giải ngân on-chain $\rightarrow$ Smart contract chuyển 100% số tiền của Request đó về ví `organizerWallet`.
  2. **Chi tiêu & Nộp chứng từ:** Organizer rút tiền/chuyển khoản để mua sắm ngoài đời $\rightarrow$ Nộp **Hồ sơ chứng từ tài chính** theo danh mục quy định ở trên. Nếu chi tiêu ít hơn số tiền đã nhận ($V_{\text{actual}} < Q_{\text{disbursed}}$), nộp kèm giao dịch hoàn tiền thừa vào Escrow (`returnFunds`).
  3. **Thẩm định & Quyết toán:** Resolver kiểm tra tính hợp lệ và đối chiếu số tiền $\rightarrow$ Đạt yêu cầu thì mở cửa sổ 3 ngày phản biện $\rightarrow$ Nếu không có tranh chấp thì chuyển trạng thái thành `FINANCIALLY_SETTLED`.
* **Quy tắc an toàn sống còn:** **Chỉ khi Request hiện tại đã `FINANCIALLY_SETTLED`, Organizer mới được phép tạo hoặc nhận tiền cho Request tiếp theo (Single In-Flight Constraint).**

### 3.4. Chặng 4: Xác thực Kết quả Thiện nguyện (Outcome / Impact Verification)
* **Mục tiêu:** Tách bạch việc "đã mua hàng" với việc "hàng đã đến tay người thụ hưởng". Xác minh chi tiêu không đồng nghĩa xác minh kết quả.
* **Hồ sơ nộp sau khi trao quà:**
  * Biên bản bàn giao/tiếp nhận quà có chữ ký, họ tên và con dấu xác nhận của chính quyền cơ sở (UBND xã, Mặt trận Tổ quốc, Hội chữ thập đỏ hoặc Ban giám hiệu trường học).
  * Danh sách ký nhận của các hộ dân/người thụ hưởng.
  * Ảnh/video buổi trao quà (có siêu dữ liệu ngày giờ, tọa độ GPS).
* **Thẩm định:** Resolver đối chiếu số lượng quà thực trao với KPI đã cam kết ở Chặng 2 $\rightarrow$ Đạt thì chuyển Activity thành `OUTCOME_CANDIDATE` (mở 3 ngày challenge) $\rightarrow$ Hết thời hạn mà không có khiếu nại thì chuyển Activity thành `VERIFIED`.

---

## 4. Máy trạng thái (State Machine)

### 4.1. Trạng thái Chiến dịch (Campaign Lifecycle)
```text
DRAFT → UNDER_REVIEW → APPROVED → FUNDING → ACTIVE → COMPLETED
                                    ↓              ↑ (mọi request & outcome đạt)
                                    └── (thiếu goal) → STOPPED + Refund
```

### 4.2. Trạng thái Yêu cầu giải ngân (Funding Request Lifecycle)
```text
DRAFT → SUBMITTED 
          ├─ REJECTED (từ chối dự toán)
          ├─ NEEDS_INFO (yêu cầu sửa/bổ sung dự toán)
          └─ APPROVED_DISBURSED (tiền chuyển vào ví Organizer)
               ↓ Organizer đi mua sắm và nộp chứng từ
             EXPENDITURE_CANDIDATE (mở 3 ngày Donor challenge)
               ├─ CHALLENGED (Donor khiếu nại) → DISPUTED (Resolver/Backup xử lý)
               └─ FINANCIALLY_SETTLED (đối chiếu tài chính thành công)
```

### 4.3. Trạng thái Hoạt động / Kết quả (Activity Outcome Lifecycle)
```text
OPEN → OUTCOME_CANDIDATE (mở 3 ngày Donor challenge)
         ├─ CHALLENGED (Donor khiếu nại) → DISPUTED (Resolver/Backup xử lý)
         └─ VERIFIED (kết quả thiện nguyện được công nhận hoàn tất)
```

---

## 5. Các Quy tắc Tài chính & Bất biến Escrow (Financial Invariants)

1. **Bảo toàn số dư Escrow (Custody Conservation):**
   $$\text{TotalContributions} + \text{ActualReturns} = \text{GrossDisbursed} + \text{RefundsPaid} + \text{EscrowCustody}$$
2. **Hạn mức mỗi đợt (Request Hard Cap $\le 25\%$):**
   Mỗi yêu cầu giải ngân không vượt quá trần quy định: $\text{amount} \le 25\% \times \text{Goal}$.
3. **Phơi nhiễm tài chính đợt chi (Financial Exposure Cap $\le 25\%$):**
   Tại một thời điểm, toàn bộ chiến dịch chỉ được có tối đa 1 khoản tiền đã giải ngân nhưng chưa đối chiếu chứng từ (Single in-flight unsettled request).
4. **Phơi nhiễm kết quả thiện nguyện (Outcome Exposure Cap $\le 50\%$):**
   $$\text{Outcome Exposure} = \sum_{\text{Activity chưa VERIFIED}} \text{approvedFunds} \le 50\% \times \text{Goal}$$
   Không được phép giải ngân tiếp khi tổng chi tiêu tích lũy chưa có kết quả trao quà đạt $50\%$ ngân sách chiến dịch. Muốn mở tiếp hạn mức, Organizer bắt buộc phải hoàn thành và được nghiệm thu ít nhất một hoạt động thiện nguyện (`activity.state == VERIFIED`).
5. **Cơ chế hoàn trả tiền thừa (`returnFunds`):**
   Nếu số tiền thực tế mua sắm $V_{\text{actual}} < Q_{\text{disbursed}}$, Organizer gọi hàm `returnFunds` nộp lại token thừa vào hợp đồng. Số tiền này tự động cộng lại vào `availablePool` (hoặc `supplementPool` nếu chiến dịch đã wind-down).
6. **Cửa sổ phản biện (Donor Challenge Window = 3 ngày):**
   Khi Resolver chấp thuận chứng từ chi tiêu hoặc kết quả thiện nguyện, hệ thống mở thời hạn 3 ngày on-chain. Donor đã góp quỹ có quyền nộp hash lý do để đóng băng tiến trình nếu có dấu hiệu gian lận.

---

## 6. Quản trị Rủi ro Resolver & Ranh giới Chuyển đổi Fiat

### 6.1. Giám sát và Giải quyết Khiếu nại Resolver
* **Minh bạch căn cứ:** Mọi quyết định phê duyệt của Resolver phải ghi nhận Rubric ID, lý do giải trình, hash chứng từ, nhãn thời gian và danh tính người duyệt.
* **Cơ chế Backup Resolver:** Tránh để Primary Resolver là bên phán quyết duy nhất khi bị Donor khiếu nại. Nếu Primary Resolver quá hạn thẩm định (`PRIMARY_REVIEW_WINDOW`) hoặc có tranh chấp, Backup Resolver được quyền tiếp quản để đưa ra quyết định độc lập.

### 6.2. Ranh giới Thế giới thực & Off-ramp Fiat (Luận cứ NCKH)
* **Giới hạn Blockchain:** Smart contract chỉ giám sát dòng tiền token trên chuỗi (từ Escrow sang ví Organizer). Việc chuyển đổi USDC sang VNĐ và chi tiêu qua ngân hàng thương mại là giao dịch ngoài chuỗi.
* **Tính chất của bằng chứng:** Hóa đơn và sao kê ngân hàng là căn cứ đối chiếu pháp lý ngoài chuỗi (Audit Trail), không phải bằng chứng tự sinh từ thuật toán blockchain.
* **Giới hạn thu hồi quỹ:** Hợp đồng chỉ thu hồi được token khi Organizer nộp lại vào Escrow; hệ thống không thể tự trích tiền từ tài khoản ngân hàng của Organizer. Điểm này cần tuyên bố minh bạch trong tài liệu nghiên cứu và giao diện người dùng.

---

## 7. Kế hoạch Dọn dẹp Mã nguồn (Code Cleanup Scope)

1. **Smart Contracts (`contracts/`):**
   * Trong `FundTogetherDisbursement.sol`:
     * Bỏ tham số `vendor`, bỏ hàm `acknowledgeVendor`, bỏ trạng thái `VENDOR_COMMITTED`.
     * Cập nhật hàm `disburse`: Chuyển tiền thẳng tới `campaign.organizerWallet`.
     * Tinh gọn thành 2 bước nghiệm thu: `candidateExpenditure` / `finalizeExpenditure` (chứng từ chi) và `candidateOutcome` / `verifyOutcome` (kết quả trao quà).
     * Bỏ chia tách cọc/final; giải ngân đúng số tiền được phê duyệt của Request.
2. **Backend (`backend/`):**
   * Xóa các controller/service không còn dùng: `HedVendorVerificationController`, `HedVendorController`, `HedCampaignVendorController`.
   * Cập nhật schema: Bỏ bảng `hed_vendor_verifications`, bỏ cột `vendor_wallet` trong bảng `disbursement_requests`.
   * Cập nhật `HedRequestDraftService` và `HedReviewService`: Bỏ ràng buộc kiểm tra vendor, tập trung vào rubric dự toán và chứng từ tài chính.
3. **Frontend (`frontend/`):**
   * Xóa route và trang `#/vendor` (`HedVendorRequests.tsx`).
   * Cập nhật form tạo Request: Không yêu cầu chọn vendor hay nhập ví vendor.
   * Xóa tab quản lý vendor trong không gian làm việc của Admin.
   * Hiển thị rõ tiến trình 4 chặng xác thực cho Donor và Organizer.
