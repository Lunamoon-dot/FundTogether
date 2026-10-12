# Kế hoạch tích hợp cơ chế xác thực (Verification-First Integration Plan)

> Ngày ban hành: 2026-10-12  
> Trạng thái: Kế hoạch hành động chính thức (Action Plan)  
> Căn cứ: Quyết định chuyển đổi kiến trúc ngày 2026-10-12 và phản biện chuyên gia về kiểm soát rủi ro phơi nhiễm kép (Dual-Exposure Risk Control).

---

## 1. Đánh giá chiến lược: Có nên tích hợp cơ bản để test MVP ngay?

### 1.1. Kết luận định hướng
**CÓ, NÊN TIẾN HÀNH NGAY.**  
Chúng ta **hoàn toàn thống nhất với nhận định của chuyên gia phản biện**: Phải tập trung toàn lực hoàn thiện kiến trúc **Verification-Centric ở mức cơ bản, vững chắc cho MVP** trước khi nghiên cứu các cơ chế nâng cao.

### 1.2. Lý do chiến lược
1. **Thay đổi cốt lõi mô hình tài chính:** Việc loại bỏ Web3 Vendor và cho phép Organizer nhận trực tiếp tiền giải ngân không chỉ là lược bỏ một tính năng giao diện, mà là tái cấu trúc toàn bộ luồng quản trị tiền và bảo toàn quỹ.
2. **Không phân tán nguồn lực:** Các hướng nghiên cứu nâng cao (như AI phát hiện hóa đơn giả mạo, hội đồng phân xử phi tập trung DAO, cơ chế tài trợ bậc hai Quadratic Funding) chỉ có ý nghĩa khi hệ thống đã có một "khung xương" thẩm định cơ bản hoạt động đúng và đo lường được.
3. **Đóng kín lỗ hổng rút cạn quỹ (The Drain Loophole):** Phản biện đã chỉ ra lỗ hổng chí mạng: nếu chỉ đối chiếu hóa đơn mà giải ngân liên tục, Organizer có thể rút sạch 100% quỹ qua các hóa đơn mua sắm hợp lệ mà không bao giờ thực hiện trao quà. Việc tích hợp cơ chế này vào MVP là bắt buộc để đảm bảo an toàn tài chính.

---

## 2. Hai chỉ số kiểm soát rủi ro phơi nhiễm (Dual-Exposure Metrics)

Hệ thống bổ sung và chuẩn hóa 2 chỉ số trần toán học trên Smart Contract và Backend:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        TỔNG QUỸ CHIẾN DỊCH (GOAL)                      │
├───────────────────────────────────┬────────────────────────────────────┤
│  OUTCOME EXPOSURE CAP (Tối đa 50%)│         QUỸ DỰ TRỮ CÒN LẠI         │
│  (Tiền đã/đang chi nhưng chưa có  │  (Bảo vệ donor nếu outcome hỏng)   │
│   kết quả trao quà được duyệt)    │                                    │
├─────────────────┬─────────────────┴────────────────────────────────────┤
│ FINANCIAL       │ SETTLED EXPENDITURE                                  │
│ EXPOSURE (≤25%) │ (Đã có hóa đơn duyệt nhưng chưa nghiệm thu outcome)  │
│ (1 đợt in-flight│                                                      │
│  chưa hóa đơn)  │                                                      │
└─────────────────┴──────────────────────────────────────────────────────┘
```

### 2.1. Financial Exposure (Phơi nhiễm tài chính đợt chi)
- **Định nghĩa:** Lượng tiền đã rời Escrow chuyển về ví Organizer nhưng **chưa được đối chiếu chứng từ/hóa đơn chi tiêu**.
- **Quy tắc kiểm soát:**
  1. **Hard Cap mỗi Request:** $\le 25\%$ tổng ngân sách chiến dịch ($\text{amount} \le \text{goal} \times 25\%$).
  2. **Một khoản mở duy nhất (Single In-Flight):** Tại một thời điểm, toàn bộ chiến dịch chỉ được có tối đa 1 Request ở trạng thái chưa quyết toán (`state` $\in$ {`SUBMITTED`, `APPROVED_DISBURSED`, `EXPENDITURE_CANDIDATE`}).
  3. **Trần Financial Exposure:** Luôn $\le 25\%$ Goal.

### 2.2. Outcome Exposure (Phơi nhiễm kết quả thiện nguyện)
- **Định nghĩa:** Tổng lượng tiền đã được đối chiếu hóa đơn hợp lệ (`FINANCIALLY_SETTLED`) cộng với lượng tiền đang giải ngân, nhưng **hoạt động thiện nguyện tương ứng chưa được xác nhận hoàn thành** (`activity.state != VERIFIED`).
- **Quy tắc kiểm soát:**
  $$\text{Outcome Exposure} = \sum_{\text{Activity chưa VERIFIED}} \text{approvedFunds} \le 50\% \times \text{Goal}$$
- **Ý nghĩa:** Ngăn chặn tuyệt đối việc giải ngân tiếp đợt 3, đợt 4 (dù hóa đơn đợt 1, 2 hợp lệ 100%) khi chưa có bất kỳ bằng chứng trao quà/nghiệm thu thực tế nào được xác minh.

---

## 3. Tiêu chuẩn hóa Bằng chứng & Phân loại Danh mục chi

Không áp dụng cứng nhắc một loại chứng từ (như hóa đơn VAT) cho toàn bộ các khoản chi, mà phân loại linh hoạt theo thực tế từ thiện tại Việt Nam:

| Danh mục chi | Loại chứng từ hợp lệ chính | Chứng từ đối chiếu bổ sung | Xử lý dữ liệu nhạy cảm (PII) |
|---|---|---|---|
| **Hàng hóa số lượng lớn** (Gạo, mì tôm, áo phao, thuốc men) | Hóa đơn điện tử VAT (kèm mã tra cứu) hoặc Hóa đơn bán lẻ từ đại lý có MST | Sao kê tài khoản ngân hàng chuyển khoản cho bên bán, phiếu xuất kho | Bản công khai che MST người mua cá nhân, số điện thoại |
| **Hàng hóa/Nông sản mua tại địa phương** | Bảng kê thu mua hàng hóa dịch vụ không có hóa đơn (Mẫu 01/TNDN) hoặc Giấy biên nhận viết tay | Ảnh chụp buổi cân/nhận hàng, chữ ký người bán địa phương, sao kê rút tiền mặt | Bản công khai che CCCD và địa chỉ chi tiết của người bán |
| **Chi phí Vận chuyển / Xăng xe / Bốc xếp** | Phiếu thu cước vận chuyển, hợp đồng thuê xe, hóa đơn xăng | Ảnh biển số xe chở hàng, sao kê chuyển khoản cho nhà xe | Che số CCCD tài xế, che số điện thoại cá nhân |
| **Cứu trợ tiền mặt trực tiếp** | Danh sách ký nhận tiền của các hộ dân (có xác nhận của thôn/xã) | Video/ảnh phát tiền có gắn thời gian GPS, giấy xác nhận của chính quyền | Che 4 số giữa của CCCD, che chữ ký cá nhân người nhận trên bản public |

> **Nguyên tắc bảo vệ PII:** File gốc chứa đầy đủ CCCD/sao kê lưu ở kho lưu trữ bảo mật (Private Storage). File công khai (Public Hash đưa lên on-chain) bắt buộc phải qua bước làm mờ (Redact) thông tin định danh cá nhân trước khi băm SHA-256.

---

## 4. Quản trị rủi ro tập trung Resolver

Resolver là bên phê duyệt trọng yếu trong giai đoạn Pilot, do đó phải thiết lập cơ chế giám sát và giải quyết khiếu nại (Checks & Balances):

1. **Minh bạch căn cứ quyết định (Audit Trail):**
   - Mọi lần Resolver bấm duyệt (`Approve`, `Settle`, `Verify`) đều phải lưu trữ: Mã tiêu chuẩn (Rubric Criterion ID), nội dung giải trình lý do (Rationale), mã băm bằng chứng (Manifest Hash, Public Hash), ID người thẩm định, chữ ký số và nhãn thời gian.
2. **Cửa sổ phản biện của cộng đồng (Donor Challenge Window):**
   - Mọi quyết định của Resolver mở ra cửa sổ 3 ngày (`CHALLENGE_WINDOW = 3 days`) trên on-chain.
   - Bất kỳ Donor nào có đóng góp $> 0$ đều có quyền mở tranh chấp (`openExpenditureCase`, `openOutcomeCase`).
3. **Phân quyền độc lập khi có khiếu nại (Separation of Arbitration):**
   - Nếu quyết định của Primary Resolver bị Donor khiếu nại, Primary Resolver **không được là bên duy nhất tự phân xử**.
   - Hợp đồng thông minh đã tích hợp cơ chế **Backup Resolver**: Nếu Primary Resolver trì hoãn hoặc có xung đột lợi ích, Backup Resolver có quyền tiếp quản (`takeOverExpenditureCase`, `takeOverOutcomeCase`) để đưa ra phán quyết độc lập.

---

## 5. Ranh giới công nghệ & Giới hạn chuyển đổi Fiat (Luận cứ NCKH)

Cần tuyên bố tường minh các ranh giới này trong Báo cáo Nghiên cứu Khoa học và giao diện Donor:
1. **Ranh giới On-chain vs Off-chain:** Blockchain chỉ bảo toàn và ghi nhận số dư token trong Escrow và lệnh chuyển tiền tới ví Organizer. Blockchain không thể tự kiểm tra việc Organizer ra sàn OTC/ngân hàng đổi USDC thành VNĐ ngoài đời thực.
2. **Bằng chứng đối chiếu:** Sao kê ngân hàng và hóa đơn tải lên là căn cứ đối chiếu pháp lý ngoài đời (Legal & Financial Audit Trail), không phải bằng chứng tự động được giải thuật blockchain sinh ra.
3. **Giới hạn hoàn tiền (`returnFunds`):** Hợp đồng thông minh chỉ thu hồi được tiền thừa khi Organizer tự giác nạp lại token vào Escrow. Hệ thống không có thẩm quyền hay khả năng tự trích xuất tiền từ tài khoản ngân hàng của Organizer.

---

## 6. Lộ trình 5 bước triển khai & kiểm chứng MVP (Implementation Roadmap)

```text
Bước 1: Hoàn thiện Đặc tả ──► Bước 2: Bất biến Contract ──► Bước 3: Backend & Indexer
                                                                       │
Bước 5: Kiểm chứng E2E    ◄── Bước 4: Frontend Gating   ◄──────────────┘
```

### Bước 1 — Hoàn thiện Đặc tả (Spec Hardening)
- Cập nhật [`docs/verification-first-disbursement-spec.md`](file:///c:/Users/dell/Desktop/FundTogether/docs/verification-first-disbursement-spec.md) đầy đủ:
  - Công thức tính Financial Exposure ($\le 25\%$) và Outcome Exposure ($\le 50\%$).
  - Bảng danh mục chứng từ & quy tắc che PII.
  - Quy trình Backup Resolver phân xử khiếu nại.

### Bước 2 — Thắt chặt Bất biến trên Smart Contract & Viết Test
- Cập nhật hợp đồng [`FundTogetherDisbursement.sol`](file:///c:/Users/dell/Desktop/FundTogether/contracts/src/FundTogetherDisbursement.sol):
  - Ràng buộc trần cứng: `amount <= c.goal * 25 / 100` trong `submitRequest`.
  - Khóa tạo request vượt trần Outcome Exposure: `a.ceiling <= c.goal / 2` (đã có) và đảm bảo không cho phép tạo Activity thứ 2 khi Activity 1 chưa `VERIFIED`.
- Viết thêm test trong [`FundingAndReservation.t.sol`](file:///c:/Users/dell/Desktop/FundTogether/contracts/test/unit/Disbursement/FundingAndReservation.t.sol):
  - `test_revertWhenRequestExceeds25PercentHardCap()`
  - `test_revertWhenDisbursementExceedsOutcomeExposureBeforeOutcomeVerification()`
  - `test_outcomeVerificationUnlocksSubsequentDisbursements()`

### Bước 3 — Cập nhật Backend, Drizzle Schema & Indexer
- Cập nhật DTO validation trong backend: Kiểm tra trần 25% khi tạo bản nháp request.
- Thêm trường theo dõi `financialExposure` và `outcomeExposure` trong projection indexer.
- Lưu trữ nhật ký thẩm định (audit trail): Căn cứ, người duyệt, thời gian, hash tài liệu.

### Bước 4 — Cập nhật Giao diện (Frontend Gating & Visualization)
- Hiển thị thanh đo rủi ro (Risk Meter):
  - Thanh **Financial Exposure**: Hiển thị số tiền đợt hiện tại đang chờ hóa đơn.
  - Thanh **Outcome Exposure**: Hiển thị tổng tiền đã chi/đối chiếu hóa đơn nhưng chờ trao quà (tối đa 50%).
- Hiển thị thông báo trạng thái rõ ràng: Nếu đã chi hết 50% trần Activity, hệ thống khóa nút tạo Request mới và yêu cầu Organizer: *"Vui lòng nộp bằng chứng trao quà để nghiệm thu Activity trước khi xin giải ngân đợt tiếp theo"*.

### Bước 5 — Bộ kịch bản kiểm chứng End-to-End (MVP Verification Suite)
Chạy tự động và ghi nhận nhật ký cho 6 kịch bản thử nghiệm:
1. **Kịch bản chuẩn (Happy Path):** Tạo campaign $\rightarrow$ Góp đủ 100% $\rightarrow$ Tạo Request 1 (Mua hàng: 25%) $\rightarrow$ Giải ngân $\rightarrow$ Nộp hóa đơn $\rightarrow$ Chờ 3 ngày challenge $\rightarrow$ Settle $\rightarrow$ Tạo Request 2 (Vận chuyển: 25%) $\rightarrow$ Settle $\rightarrow$ Trao quà $\rightarrow$ Nộp biên bản $\rightarrow$ Chờ 3 ngày challenge $\rightarrow$ Verify Outcome.
2. **Kịch bản chặn vượt trần 25%:** Request xin 30% bị revert ngay từ lúc submit.
3. **Kịch bản chặn phơi nhiễm Outcome:** Sau khi Request 1 & 2 đã tiêu hết 50% quỹ, cố tình submit Request 3 khi Activity chưa `VERIFIED` $\rightarrow$ Bị chặn.
4. **Kịch bản chi tiêu thừa tiền (Return Unused):** Giải ngân 250 USDC, thực chi 200 USDC $\rightarrow$ Organizer hoàn trả 50 USDC về Escrow $\rightarrow$ Tiền cộng lại vào Available Pool.
5. **Kịch bản Donor khiếu nại hóa đơn:** Donor nộp bằng chứng hóa đơn khống trong 3 ngày $\rightarrow$ Trạng thái chuyển sang `DISPUTED` $\rightarrow$ Chặn quyết toán $\rightarrow$ Resolver/Backup phân xử.
6. **Kịch bản thất bại & Hoàn tiền (Refund):** Sau thời hạn cam kết không hoàn thành hoạt động $\rightarrow$ Kích hoạt Wind-down $\rightarrow$ Toàn bộ số dư còn lại trong Escrow được chia hoàn tiền sòng phẳng cho Donor theo tỷ lệ đóng góp.
