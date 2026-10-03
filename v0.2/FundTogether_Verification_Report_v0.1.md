# FundTogether — Verification Report v0.1

> Ngày: 2026-10-03
> Trạng thái: Đặc tả; chưa có pipeline/report API hoạt động.
> Liên quan: [Evidence Schema](./FundTogether_Evidence_Schema_v0.1.md), [Ví dụ](./FundTogether_Evidence_Example_v0.1.md).

## 1. Quyền và đầu ra

Report là kết quả phân tích off-chain, không phải verdict tài chính.
Rules/OCR/AI không giữ VERIFIER_ROLE và không tự gọi accept, slash hoặc settlement.
Assigned verifier đọc bản gốc và report để thực hiện action được phép.
Request more evidence dùng rejectSubmission + reasonHash như flow hiện tại.
Resolver xử lý tranh chấp chưa rõ; đủ checklist không có nghĩa đã chứng minh thật.

## 2. Schema

| Trường | Nội dung |
|---|---|
| schemaVersion | `0.1` |
| reportId, packageId | ID duy nhất; liên kết package cố định |
| evidenceHash | Digest manifest đã đối chiếu, không lấy từ client rồi coi là đã xác minh |
| context | chainId, contractAddress, campaignId, milestoneIndex, submissionVersion, criteriaHash |
| pipelineVersion, checklistVersion | Phiên bản triển khai và tiêu chí áp dụng |
| createdAt, completedAt | UTC; completedAt null nếu chưa xong |
| status | RUNNING / COMPLETE / PARTIAL / FAILED |
| steps[] | name, status, engineVersion, startedAt, completedAt, errorCode |
| findings[] | code, severity, source, description, references[], observedValues, uncertainty |
| extractedFields[] | documentId, field, value, source, references[], confidence |
| summary | Tóm tắt có căn cứ; không tuyên bố hồ sơ thật hoặc giải ngân |
| supersedesReportId | null hoặc report trước; không xóa report trước |

Step status: PENDING / SUCCEEDED / FAILED / SKIPPED.
source: RULE / OCR / AI / MANUAL.
severity: BLOCKER / WARNING / INFO.
references[]: documentId, page (1-based nếu có), criterionId hoặc expenseId.
Nếu không có căn cứ trực tiếp phải ghi thiếu căn cứ, không bịa page/document.
confidence chỉ có khi engine cung cấp và ghi semantics/version; không coi là
xác suất tài liệu thật. observedValues giữ amount/currency dạng có đơn vị.

AI/OCR steps ghi provider/modelIdentifier, modelVersion nếu có, promptVersion
và tham số ảnh hưởng kết quả. Khi provider không công bố revision, ghi unknown;
không hứa reproducibility tuyệt đối. Không lưu secrets hoặc presigned URLs.

## 3. Luồng nâng cấp

```text
Frozen package P1, evidenceHash H1
  -> report R1, pipeline 0.1
  -> report R2, pipeline 0.2 (supersedes R1)
  -> giữ P1/H1 và cả hai report
```

Nâng cấp công cụ không tự đổi checklist/tiêu chí đã cam kết hoặc quyết định
on-chain. Phiên bản checklist thuộc context đã duyệt, không lấy latest toàn hệ
thống rồi áp hồi tố. Phát hiện mới sau admission đi qua challenge/case phù hợp;
report mới không tự chuyển ACCEPTED thành REJECTED.

Chưa cần plugin framework hoặc microservices. Bước đầu có thể là các hàm kiểm
tra tuần tự trong một module backend, ghi report/version rõ ràng. OCR/AI bổ sung
sau qua cùng cấu trúc đầu ra; không thêm quyền tài chính cho engine.

## 4. Lỗi dịch vụ và manual fallback

```text
Integrity + required-file checks đạt
  + AI/OCR timeout
  -> PARTIAL report, failed step và lý do rõ
  -> verifier đọc tài liệu gốc, ghi manual findings
  -> verifier quyết định theo quyền hiện có
```

Không hiển thị COMPLETE nếu bước được yêu cầu bị lỗi. Không tự pass khi AI
im lặng. Chỉ optional analysis được bỏ qua; file an toàn/integrity và tài liệu
bắt buộc chưa đạt thì phải xử lý trước. Manual findings thêm vào report mới
hoặc decision record riêng, không sửa report đã hoàn tất.

AI đọc file như dữ liệu không tin cậy: chỉ dẫn trong hóa đơn không phải lệnh
hệ thống; không cho engine secret, ví ký, công cụ chuyển tiền hoặc quyền admin.
Nội dung AI tạo phải render an toàn và luôn kèm provenance.
Gửi dữ liệu cá nhân cho dịch vụ bên ngoài cần policy phù hợp; không mặc định
đưa toàn bộ bản gốc cho AI provider.

## 5. Decision record và chain projection

Decision record riêng chứa reportIds đã dùng, reviewer, evidenceHash/version,
reason và reasonHash, transaction hash, receipt/confirmation/indexing status.
Verifier quyết định phải đúng package đã assign trên chain; client report mới
không thay được context. Rejected transaction không ghi decision thành công.
Indexer đọc event idempotently; không dùng database verdict để mở escrow.

## 6. Chưa chốt / chưa triển khai

Provider/model, retry/job orchestration, SLA/cost, report retention, quyền tái
phân tích và bộ dữ liệu đánh giá chưa chọn. AI là hướng mở rộng được xem xét,
không phải tính năng đã triển khai hay điều kiện bắt buộc để MVP chạy.
zkVerify/ZK chưa thuộc triển khai trước mắt; không mô tả AI như thay thế proof.

Khi triển khai kiểm tra: reports giữ lịch sử, đúng hash/context; optional timeout
fallback; no currency mixing; warnings không tự slash/reject; replay jobs không
overwrite reports; secrets và restricted documents không lọt public API/log.
