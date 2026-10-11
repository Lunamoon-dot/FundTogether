# FundTogether — Hybrid Evidence-Based Disbursement
**Bản đặc tả nghiên cứu v0.1 — Đề xuất, chưa phê duyệt triển khai**

## 1. Mục tiêu

FundTogether là hệ thống gây quỹ thiện nguyện trong đó donor tài trợ cho một **mục đích và phạm vi sử dụng quỹ đã cam kết**, thay vì bắt buộc tài trợ một chuỗi milestone có ngân sách cố định.

Tổ chức thiện nguyện gửi các **Funding Request** khi phát sinh nhu cầu sử dụng vốn. Mỗi yêu cầu được đánh giá trước giải ngân và phải được đối chiếu trách nhiệm sau giải ngân.

Hệ thống ưu tiên thanh toán trực tiếp cho nhà cung cấp, nhưng cho phép các phương thức khác theo chính sách rủi ro.

**Câu hỏi nghiên cứu trung tâm:**

> Cơ chế giải ngân theo yêu cầu, lựa chọn phương thức thanh toán và mức kiểm soát dựa trên rủi ro có thể cải thiện khả năng thực hiện campaign mà không làm gia tăng mức vốn bị mất kiểm soát hay không?

## 2. Ba phương thức giải ngân

| Phương thức | Cách thực hiện | Điều kiện chính |
|---|---|---|
| **P1 — Direct Vendor Payment** | Escrow chuyển tiền đến nhà cung cấp | Xác minh người nhận, căn cứ chi, điều kiện giao hàng |
| **P2 — Controlled Organizer Advance** | Escrow tạm ứng cho tổ chức | Có lý do không thể thanh toán trực tiếp, giới hạn rủi ro và nghĩa vụ đối chiếu |
| **P3 — Reimbursement** | Tổ chức ứng tiền trước, escrow hoàn trả sau | Có bằng chứng chi hợp lệ và được xác nhận |

### P1 — Thanh toán trực tiếp cho nhà cung cấp (mặc định ưu tiên)

Áp dụng khi nhà cung cấp đã được xác định và có thể nhận thanh toán qua phương thức hệ thống hỗ trợ.

Điều kiện tối thiểu:

- Khoản mua thuộc mục đích campaign.
- Có mô tả hàng hóa/dịch vụ, số lượng, đơn giá và tổng giá trị.
- Có báo giá hoặc căn cứ đánh giá chi phí.
- Danh tính nhà cung cấp và địa chỉ nhận tiền đã được kiểm tra.
- Có điều kiện giao hàng, nghiệm thu, hoàn tiền hoặc xử lý vi phạm.
- Không có dấu hiệu trùng lặp với yêu cầu đã được thanh toán.

**Rủi ro còn lại:** nhà cung cấp không giao hàng, giao sai chất lượng, thông đồng hoặc từ chối hoàn tiền.

Nếu nhà cung cấp chỉ nhận tiền ngân hàng, việc chuyển stablecoin cho một đơn vị trung gian thanh toán không được coi là đã thanh toán thành công cho nhà cung cấp. Hệ thống phải đối chiếu thêm giao dịch ngân hàng và nghĩa vụ của đơn vị trung gian.

### P2 — Tạm ứng có kiểm soát cho tổ chức (ngoại lệ)

Chỉ áp dụng khi có lý do nghiệp vụ, ví dụ chi phí vận chuyển tại địa phương, mua hàng từ người bán không hỗ trợ thanh toán trực tiếp hoặc khoản đặt cọc cần tổ chức thực hiện.

Điều kiện bổ sung:

- Ghi rõ lý do không dùng P1.
- Có giới hạn tạm ứng và tổng tiền chưa đối chiếu.
- Có thời hạn cung cấp bằng chứng và hoàn trả tiền dư.
- Yêu cầu mức phê duyệt cao hơn khi rủi ro tăng.
- Không được dùng khoản tạm ứng mới để che lấp khoản cũ chưa giải trình.

Không mặc định yêu cầu organizer bond, để giữ hướng nghiên cứu no-bond của Workflow B.

### P3 — Hoàn ứng

Áp dụng khi tổ chức đã chi bằng nguồn lực của mình và đề nghị hoàn trả.

Cần kiểm tra:

- Khoản chi có nằm trong phạm vi campaign không.
- Chứng từ có hợp lệ và liên quan đến hoạt động thực tế không.
- Khoản này đã được hoàn ứng hoặc thanh toán trước đó chưa.
- Có bằng chứng thực hiện hoặc nhận hàng/dịch vụ tương ứng không.

Phương thức này giảm rủi ro ứng trước từ escrow, nhưng tăng nhu cầu vốn lưu động của tổ chức.

## 3. Funding Request — Đơn vị ra quyết định

Mỗi yêu cầu phải có tối thiểu:

- `requestId`, `campaignId`, người đề nghị.
- Mục đích chi và liên kết đến phạm vi campaign.
- Phương thức P1, P2 hoặc P3.
- Số tiền, loại tài sản, danh mục chi phí.
- Người nhận tiền và thông tin xác minh.
- Hồ sơ chứng minh nhu cầu và tính hợp lý của số tiền.
- Điều kiện giao hàng/thực hiện.
- Thời hạn thực hiện và đối chiếu.
- Liên kết đến yêu cầu khác nếu có phụ thuộc.
- Phiên bản hồ sơ và lịch sử quyết định.

Sau khi giải ngân, không được sửa hồi tố số tiền, người nhận hoặc nghĩa vụ đã được phê duyệt. Thay đổi hợp lệ trong phần công việc chưa thực hiện phải tạo lịch sử và được xét duyệt theo quy tắc riêng.

## 4. Quy trình quyết định giải ngân

1. **Submit:** Tổ chức gửi yêu cầu và hồ sơ.
2. **Validate:** Hệ thống kiểm tra số dư, trạng thái, trùng lặp và giới hạn khách quan.
3. **Assess:** Người xét duyệt đánh giá nhu cầu, bằng chứng, nhà cung cấp và rủi ro.
4. **Decide:** Phê duyệt, yêu cầu bổ sung hoặc từ chối.
5. **Reserve:** Dành riêng số tiền được duyệt trong escrow.
6. **Execute:** Chuyển tiền đúng người nhận, đúng số tiền và điều kiện đã phê duyệt.
7. **Reconcile:** Đối chiếu khoản thanh toán, hàng hóa/dịch vụ và tiền dư.
8. **Verify Outcome:** Xác nhận kết quả hoạt động thiện nguyện liên quan.
9. **Close / Dispute:** Hoàn tất nghĩa vụ hoặc chuyển sang xử lý vấn đề.

**Reserve khác Execute.** Phê duyệt một khoản chi không nhất thiết đồng nghĩa với chuyển tiền ngay.

Yêu cầu đã được duyệt nhưng hết hiệu lực trước khi thanh toán phải được hủy hoặc xét duyệt lại; không tự động chuyển tiền.

## 5. Hai tầng bằng chứng phải tách biệt

### Tầng A — Financial Settlement

Trả lời: tiền đã được sử dụng vào khoản chi được phê duyệt hay chưa?

Ví dụ: thanh toán cho nhà cung cấp, nhận đủ hàng, hóa đơn hợp lệ, tiền dư được hoàn lại.

### Tầng B — Charitable Outcome Verification

Trả lời: hoạt động thiện nguyện đã thực sự tạo ra kết quả cam kết hay chưa?

Ví dụ: 100 suất quà đã được trao đúng nhóm người nhận.

**Mua được 100 suất quà không đồng nghĩa với đã trao được 100 suất quà.**

Một yêu cầu có thể hoàn tất đối chiếu tài chính trong khi nghĩa vụ chứng minh kết quả thiện nguyện vẫn đang mở.

Hai tầng này phải có liên kết truy vết nhưng không được đánh đồng.

## 6. Chính sách kiểm soát rủi ro

| Rủi ro | Điều kiện kiểm soát đề xuất |
|---|---|
| Nhà cung cấp giả mạo hoặc thông đồng | Xác minh danh tính, mối liên hệ với tổ chức, căn cứ mua hàng; xét duyệt tăng cường khi có xung đột lợi ích |
| Thay ví nhận tiền sau phê duyệt | Khóa thông tin người nhận; thay đổi phải hủy phê duyệt cũ và xét lại |
| Xin trùng một khoản chi | Đối chiếu request, hóa đơn, giao dịch và hàng hóa/dịch vụ đã thanh toán |
| Giá bất thường hoặc tăng mạnh | Yêu cầu báo giá đối chiếu, giải trình và cấp phê duyệt tương ứng |
| Trả trước nhưng không nhận hàng | Giới hạn tiền đặt cọc/trả trước, điều kiện giao hàng, thời hạn và mức vốn có rủi ro |
| Tổ chức giữ tiền chưa giải trình | Giới hạn tổng tạm ứng chưa đối chiếu, khóa tạm ứng mới khi vi phạm |
| Bằng chứng giả hoặc không đủ | Người xét duyệt chịu trách nhiệm, kiểm tra chéo, lưu lịch sử và cơ chế tranh chấp |
| Resolver lạm quyền hoặc không phản hồi | Tách người đề nghị/người duyệt, công khai quyết định, thời hạn xử lý và đường dừng an toàn |

Các giới hạn tiền, thời gian, số người duyệt và điều kiện đặt cọc là **tham số nghiên cứu**, chưa chốt giá trị.

Không được tự động hạ chuẩn nghiệm thu chỉ vì tổ chức đã từng hoạt động tốt.

## 7. Bất biến tài chính

Với giả định chưa có phí và nguồn thu khác:

**C + R = G + F + E**

Trong đó:

- `C`: tổng donor contribution.
- `R`: tiền thực sự được hoàn về escrow từ các khoản đã giải ngân.
- `G`: tổng tiền đã chuyển ra cho nhà cung cấp hoặc tổ chức.
- `F`: tổng tiền đã hoàn trả cho donor.
- `E`: tiền còn trong escrow.

Tiền `E` phải được phân loại thành:

- **Available:** có thể phân bổ cho yêu cầu mới.
- **Reserved:** đã dành riêng cho yêu cầu được duyệt.
- **Refund Liability:** đang giữ để thực hiện nghĩa vụ hoàn tiền, chưa được donor nhận.

Với từng yêu cầu đã giải ngân:

**Gross Paid = Accepted Expenditure + Returned + Unreconciled**

Trong đó `Accepted Expenditure` là khoản được quy trình xét duyệt chấp nhận, không phải bằng chứng toán học rằng sự việc ngoài đời chắc chắn đúng.

Các quy tắc bắt buộc:

- Không phê duyệt vượt `Available`.
- Không cấp hai lần từ cùng một khoản `Reserved`.
- Không coi tiền đã chuyển cho nhà cung cấp là tiền còn trong escrow.
- Không tính tiền hoàn trả dự kiến như tiền đã thu hồi.
- Khi campaign STOP, chỉ tiền thực tế trong custody mới có thể được phân bổ hoàn trả ngay.
- Quyền hoàn tiền của từng donor phải được xác định riêng; cân bằng tổng tiền không chứng minh phân bổ đúng người.

## 8. Giới hạn rủi ro thay vì khóa cứng một yêu cầu

Không mặc định chỉ cho phép một yêu cầu đang thực hiện.

Ví dụ, tổ chức có thể cần mua quà và thuê xe vận chuyển trước khi hoàn tất toàn bộ việc trao quà. Khóa mọi yêu cầu tiếp theo đến khi xác minh kết quả cuối cùng có thể gây bế tắc.

Thay vào đó, nghiên cứu hai giới hạn:

- **Financial Exposure Limit:** giới hạn tổng tiền đã giải ngân nhưng chưa đối chiếu tài chính.
- **Outcome Exposure Limit:** giới hạn giá trị các khoản chi đã được chấp nhận về tài chính nhưng kết quả thiện nguyện vẫn chưa xác minh.

Cho phép một số yêu cầu song song khi có quan hệ phụ thuộc hợp lệ và không vượt giới hạn rủi ro.

Không cộng hai loại exposure một cách máy móc nếu cùng một khoản tiền xuất hiện trong cả hai; cần quy tắc phân loại và chống đếm trùng.

## 9. Phạm vi phiên bản thử nghiệm

Giữ các giới hạn để cô lập vấn đề nghiên cứu:

- Campaign có mục đích và trần ngân sách cố định.
- Chỉ bắt đầu giải ngân sau khi đạt điều kiện huy động vốn đã công bố; giai đoạn đầu có thể giữ điều kiện full funding để so sánh với Workflow B.
- Không bắt buộc khai báo ngân sách từng milestone từ đầu.
- Không hỗ trợ thay đổi mục đích cốt lõi.
- Không triển khai donor exit tùy ý.
- Không tự động tin bằng chứng ngoài đời chỉ vì có hash.
- Không giả định contract có thể thu hồi tiền đã chuyển.
- Không triển khai bond, oracle hoặc arbitration phức tạp ở vòng đầu.

## 10. Phương pháp đánh giá NCKH

So sánh:

- **B0:** Workflow B — fixed milestone.
- **B1:** Request-based escrow — chính sách phê duyệt cố định.
- **B2:** Hybrid risk-adaptive request escrow — lựa chọn phương thức và mức kiểm soát theo rủi ro.

Đo lường:

- Tỷ lệ nhu cầu chi hợp lệ được đáp ứng.
- Tỷ lệ yêu cầu không hợp lệ bị phát hiện hoặc ngăn chặn.
- Thời gian từ yêu cầu đến giải ngân.
- Mức vốn chưa đối chiếu và mức vốn không thể thu hồi trong các tình huống thất bại.
- Chi phí xét duyệt và giao dịch.
- Tỷ lệ campaign có thể tiếp tục khi phát sinh thay đổi thực tế.
- Khả năng hoàn thành và chứng minh kết quả thiện nguyện.

Kết quả cần dựa trên bộ tình huống, thử nghiệm và dữ liệu thực tế khi có; không khẳng định trước rằng B2 an toàn hoặc hiệu quả hơn.