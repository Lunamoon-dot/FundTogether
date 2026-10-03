# FundTogether — Evidence Schema v0.1

> Ngày: 2026-10-03
> Trạng thái: Đặc tả để triển khai; upload/storage/validator chưa được triển khai.
> Liên quan: [Verifier](./FundTogether_Verifier_Specification_v0.1.md), [Report](./FundTogether_Verification_Report_v0.1.md), [Hồ sơ mẫu](./FundTogether_Evidence_Example_v0.1.md).

## 1. Mục đích và ranh giới

Bộ bằng chứng mô tả việc thực hiện một milestone, gồm báo cáo, khoản chi và
tài liệu hỗ trợ. Blockchain giữ commitment và quyết định theo phiên bản;
storage giữ file; backend giữ hồ sơ, báo cáo kiểm tra và projection từ event.
Hồ sơ upload thành công không đồng nghĩa transaction hoặc admission thành công.

Không thêm expense claim, đổi currency hoặc giải ngân một phần vào contract.
Ngân sách và cơ chế release đã chốt vẫn do contract quyết định.

## 2. Cấu trúc hồ sơ

Các trường dưới đây là hợp đồng dữ liệu dự kiến, chưa phải API đã hoạt động.

| Trường | Kiểu / yêu cầu |
|---|---|
| schemaVersion | Chuỗi cố định `0.1` |
| packageId | ID duy nhất do backend tạo; không dùng làm financial truth |
| chainId, contractAddress | Chain ID dạng chuỗi số nguyên; địa chỉ EVM |
| campaignId, milestoneIndex | Chuỗi số nguyên không âm; milestoneIndex bắt đầu từ 0 |
| submissionVersion | Chuỗi số nguyên dương, dự kiến từ latest chain version + 1; chỉ event xác nhận binding cuối cùng |
| organizerAddress | Địa chỉ lấy từ danh tính xác thực và đối chiếu chain; không tin địa chỉ client gửi |
| criteriaHash, checklistVersion | Commitment tiêu chí đã khóa và phiên bản checklist áp dụng |
| parentPackageId | null cho bản đầu; ID bản trước khi sửa |
| report | summary, performedFrom, performedTo, outcomes[] |
| expenses | Danh sách khoản chi; có thể rỗng nếu checklist cho phép |
| documents | Danh sách tài liệu đáp ứng loại evidence đã yêu cầu |
| createdAt | Thời điểm UTC RFC3339 do server ghi |

`outcomes[]`: criterionId, description, documentIds[]. Mỗi mục liên kết kết quả
với tiêu chí trong tài liệu được criteriaHash cam kết. Đây là dữ liệu organizer
khai, không phải kết luận đã hoàn thành.

`expenses[]`: expenseId, description, amountMinor, currency, minorUnit,
incurredAt, vendorName (nếu có), documentIds[], fundingSource.
fundingSource là CAMPAIGN / ORGANIZER / OTHER để tách chi phí tự bù.
amountMinor là chuỗi số nguyên không âm, không dùng float.
Ví dụ VND 25000000 với minorUnit=0; USDC 1000000000 với minorUnit=6.
Backend kiểm tra đơn vị theo registry tiền tệ/token được hỗ trợ; không tin
minorUnit do client khai. Không cộng hoặc so sánh trực tiếp khác currency.
Quy đổi VND/USDC, nguồn tỷ giá và kỳ tỷ giá chưa chốt; không tự đặt.

`documents[]`: documentId, kind, originalName, mediaType, byteSize, sha256,
storageObjectId, visibility, relatesToExpenseIds[], relatesToCriterionIds[].
kind ban đầu: REPORT / INVOICE / RECEIPT / PAYMENT_PROOF / DELIVERY_RECORD /
PHOTO / OTHER. visibility: PUBLIC_REDACTED / RESTRICTED_ORIGINAL.
storageObjectId là ID opaque; không chứa secret hoặc presigned URL.
File name không được dùng như đường dẫn lưu trữ tin cậy.

## 3. Tiêu chí và yêu cầu tài liệu

Loại bằng chứng bắt buộc xuất phát từ acceptance criteria đã duyệt của milestone.
Không bắt mọi campaign có cùng một bộ hóa đơn/ảnh; tài liệu thay thế chỉ hợp lệ
khi checklist đã cho phép. Không thêm tiêu chí hồi tố sau khi campaign được duyệt.

Verifier kiểm tra admissibility/objective checks theo tiêu chí đã khóa.
Vấn đề về thật/giả, giao hàng thực tế hoặc chứng cứ mâu thuẫn phải được ghi rõ
và có đường challenge/resolver; đủ trường không chứng minh nội dung thật.

## 4. Kiểm tra chặn và cảnh báo

| Chặn hoàn tất bộ hồ sơ | Ghi cảnh báo / cần người xem |
|---|---|
| Thiếu trường hoặc loại tài liệu bắt buộc | Hash/hóa đơn xuất hiện ở hồ sơ khác |
| Sai quyền organizer, campaign hoặc milestone | Nội dung có vẻ không liên quan |
| File không đọc được, MIME không được phép hoặc sai hash | OCR đọc số khác organizer khai |
| Tài liệu tham chiếu không tồn tại trong package | Tổng chi gồm phần tự bù vượt ngân sách |
| File vượt giới hạn đã công bố | Nghi vấn ảnh tái sử dụng hoặc sửa tài liệu |

Một check dựa trên dữ liệu OCR không tự trở thành hard failure.
Duplicate hash không tự chứng minh gian lận. Tổng khoản chi chỉ cộng trong
cùng currency/minorUnit và cùng phạm vi; kiểm tra arithmetic trên dữ liệu đã
xác định, không dùng AI cộng tiền hoặc tự suy ra payout.

Định dạng ban đầu dự kiến PDF/JPEG/PNG. Dung lượng mỗi file, tổng package và số
file phải được công bố trước khi upload API hoạt động; chưa chọn con số trong
đặc tả này. Kiểm tra MIME thực tế, đường dẫn an toàn và chặn file nguy hiểm là
bước bắt buộc; AI timeout không được bỏ qua các bước này.

## 5. Draft, freeze và commitment

```text
DRAFT (sửa được)
  -> kiểm tra bắt buộc
  -> FROZEN (manifest + file bytes cố định)
  -> wallet submission
  -> mined success -> confirmed -> indexed binding
```

Một frozen package không được overwrite. Thay file, thông tin khoản chi hoặc
báo cáo organizer tạo package/version mới. Transaction revert không tạo
submission on-chain; giữ package để retry có kiểm soát. Nếu version trên chain
đã đổi, phải đối chiếu trước khi retry, không gắn package vào version tùy ý.

Chọn SHA-256 cho file và exact frozen manifest bytes, UTF-8 không BOM.
evidenceHash là digest manifest 32 bytes, biểu diễn `0x` + 64 hex; contract hiện
coi đây là opaque bytes32, không tự kiểm tra file hoặc thuật toán hash.
Manifest không chứa chính evidenceHash, presigned URL hoặc dữ liệu phân tích.
Manifest chứa định danh chain/contract/campaign/milestone, version, criteria,
toàn bộ dữ liệu organizer và file hashes/object IDs.
Storage phải lưu đúng bytes đã hash; đọc lại rồi kiểm tra, không serialize JSON
lại để suy ra cùng hash. Hash chứng minh sự khớp bytes, không chứng minh sự thật.

Báo cáo pipeline tham chiếu evidenceHash nhưng nằm ngoài manifest, vì chạy lại
phân tích không được thay commitment organizer. Bản công khai đã che dữ liệu
là file riêng với hash riêng, liên kết rõ tới bản gốc; không thay thế bytes gốc.
Người xem không có quyền xem bản gốc không thể tự xác minh toàn bộ manifest:
UI phải nói rõ giới hạn này.

## 6. Truy cập và lưu trữ

Mặc định bảo vệ bản gốc có thông tin cá nhân; donor xem báo cáo và tài liệu
đã che dữ liệu phù hợp. Organizer và assigned verifier được xem bản gốc; resolver
được cấp quyền theo case. Public evidence không có nghĩa công khai PII.

Authorization áp dụng cả API lẫn cấp URL tải file; URL hết hạn và không được
ghi vào report/log/Git. Auth wallet phải qua signature verification.
Storage S3-compatible là hướng hiện có; chưa chốt nhà cung cấp, retention,
backup hoặc cơ chế redaction thực thi. Không chuyển file riêng tư lên public IPFS.

## 7. Điều còn cần trước production

Deadline/fallback và số vòng resubmit; retention/xóa dữ liệu; redaction approval;
currency conversion nếu cần; giới hạn upload; danh mục checklist mẫu theo mô hình
từ thiện. Những mục này không được backend tự mã hóa thành quy tắc tài chính.

## 8. Kiểm tra khi triển khai

- Sai role/context/hash/reference bị từ chối; public API không lộ bản gốc.
- Frozen package không sửa được; sửa tạo version mới và giữ lịch sử.
- Report chạy lại không đổi evidenceHash hoặc quyết định on-chain.
- OCR/AI thất bại vẫn cho phép manual review khi integrity/mandatory checks đạt.
- Transaction success, confirmation và indexed state được hiển thị riêng.
