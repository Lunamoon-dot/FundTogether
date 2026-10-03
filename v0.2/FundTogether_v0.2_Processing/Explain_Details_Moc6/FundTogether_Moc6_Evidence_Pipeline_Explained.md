# FundTogether — Giải thích Mốc 6: Evidence Pipeline

> Mốc này nối upload off-chain với cam kết on-chain. Stack S3 SDK/storage là lựa chọn trong Tech Stack; flow và trường mẫu không phải xác nhận đã có dịch vụ/file thật.

## 1. Pipeline là gì?

> **Cập nhật thiết kế 2026-10-03:** Xem [Verification và dispute theo tầng](../../FundTogether_Verification_and_Dispute_Design_2026-10-03.md).
> Hướng mục tiêu bổ sung admission trước review, screening phản đối, organizer
> response và re-verification. File upload/hash hợp lệ chưa chứng minh công việc
> đã hoàn thành. Evidence thay đổi phải có phiên bản mới và review mới 72 giờ;
> Checkpoint mới: admission/versioning đã được triển khai và kiểm thử trong
> contract; screening challenge và remediation vẫn chưa có. Xem spec bên dưới.
>
> Người dùng đã chốt [Verifier Specification v0.1](../../FundTogether_Verifier_Specification_v0.1.md):
> cùng VERIFIER_ROLE kiểm tra submission/challenge/remediation theo phiên bản,
> không sửa dữ liệu, không trực tiếp chuyển tiền. Khắc phục lỗi khách quan phải
> review lại 72 giờ; tranh chấp còn chưa rõ chuyển resolver.

Pipeline là các bước và ranh giới trạng thái từ lúc Organizer chọn file tới khi người khác thấy một phiên bản evidence đã được commit trên blockchain.

```text
Chọn file → xin quyền upload → lưu object → xác minh file
→ tính hash → ghi metadata → wallet commit → event
→ indexer sync → giao diện xác nhận
```

**Upload thành công** và **on-chain evidence committed** là hai trạng thái khác nhau, đúng như Process nhấn mạnh.

## 2. Chuẩn bị một lần

Trước khi flow chạy cần biết:

- Ai có quyền submit evidence cho milestone.
- Loại file, size limit và loại bằng chứng được hỗ trợ.
- File công khai hay riêng tư.
- Storage provider và object key/version policy.
- Thuật toán hash, manifest format, cách commit lên contract.
- Mốc nào bắt đầu review window.
- Xóa/sửa file trước và sau commit được xử lý ra sao.

Storage là dịch vụ giữ bytes. Database giữ metadata/quan hệ; contract giữ commitment/state; indexer ghi nhận kết quả chain để API truy vấn.

## 3. Bước 1 — Người dùng chọn file trên frontend

Lan mở milestone M2, chọn `invoice.pdf`, khai `INVOICE`. Frontend hiển thị loại và kích thước, có thể từ chối sớm nếu vượt giới hạn đã cấu hình.

Đuôi `.pdf` và `Content-Type` do trình duyệt gửi không chứng minh bytes thật là PDF. Backend hoặc pipeline xử lý phải kiểm tra theo cách đã chốt. Không mở file upload như executable và giới hạn dung lượng để bảo vệ hệ thống.

Không upload dữ liệu nhạy cảm thật vào môi trường demo nếu chưa có quyền truy cập và chính sách phù hợp.

## 4. Bước 2 — Frontend xin quyền upload

Frontend gọi backend với campaignId, milestoneId, tên hiển thị, loại evidence, size và thông tin cần thiết.

Backend:

1. Xác thực phiên người dùng.
2. Kiểm tra quyền Organizer đúng campaign và state cho phép submit.
3. Kiểm tra loại/size nằm trong policy.
4. Tạo object key không đoán được và gắn vào đúng tài khoản/mốc.
5. Cấp upload permission có scope/expiry phù hợp.
6. Tạo hoặc cập nhật bản ghi trạng thái `UPLOADING`.

Không tin `submitter`, `storageKey`, campaign owner do client tự khai rồi ghi thẳng.

## 5. Bước 3 — Lưu object

Frontend có thể gửi file qua backend, hoặc upload thẳng storage bằng presigned URL. Tech Stack đề xuất upload trực tiếp để file lớn không đi vòng qua server.

```text
Browser --xin URL--> NestJS
Browser --PUT bytes--> Object storage
Browser --báo hoàn tất--> NestJS
```

Backend vẫn kiểm soát việc cấp URL và metadata. Presigned URL là capability: ai cầm nó có thể thực hiện action đã ký trong giới hạn/tới hết hạn. Cần bảo vệ và không log toàn bộ URL. [Amazon S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

Object key ví dụ:

```text
campaign/<campaign-id>/milestone/<milestone-id>/<random-id>
```

Tên thực tế nên tránh lộ dữ liệu cá nhân; ID đoán được không thay thế authorization.

## 6. Bước 4 — Kiểm tra file đã lưu

Backend/worker xác minh object thật tồn tại và số bytes đúng. Đọc lại bytes/version đã lưu để tính hash hoặc kiểm tra checksum theo kiến trúc.

Tránh tình huống:

```text
hash file A → người upload ghi đè thành file B → commit hash A
```

Cách hạn chế: key mới mỗi version, upload vào khu vực tạm, xác minh xong copy sang final object không cho client ghi đè, hoặc dùng versioning và commit chính xác object version. Chọn một cách có thể truy xuất lại.

Kiểm tra actual file type bằng bytes, không chỉ extension hoặc `Content-Type`. Quét malware có thể thêm về sau theo threat model; nếu MVP chưa có, nêu giới hạn.

## 7. Bước 5 — Hash và metadata

Hash được tính trên **bytes cụ thể** đã lưu. Hash của multipart container/compressed bytes có thể khác hash của file gốc nếu frontend/backend xử lý khác nhau.

Metadata minh họa:

```text
evidenceId
campaignId + chainId + campaignContract
milestoneId + version
type
objectKey + immutable storage version
hashAlgorithm + file hash
uploader + uploadedAt
uploadStatus + chainCommitStatus
```

Tách `uploadedAt` và `committedAt`. Một file có thể upload lúc 09:00 nhưng ví commit lúc 09:07. Nếu commitment đại diện một bộ evidence, tạo manifest phiên bản và hash manifest theo quy tắc serialization đã thống nhất.

Không lưu URL tạm như định danh vĩnh viễn. Lưu object key/version hoặc CID đã xác định theo policy.

## 8. Bước 6 — Yêu cầu ký/commit

Backend trả dữ liệu commitment cho frontend. UI cho Lan biết campaign, milestone, version và hash/bộ evidence đang ký.

Lan dùng ví gửi transaction. Backend không nên tự ký bằng khóa Organizer trừ khi protocol/account model đặc biệt cho phép.

Contract kiểm tra caller, state, version/replay policy rồi ghi commitment và event. File có thể tải lên thành công nhưng transaction bị từ chối vì deadline hoặc mạng sai.

## 9. Bước 7 — Receipt, confirmation và indexer

Frontend có transaction hash thì hiển thị “đang xác nhận”. Khi receipt báo execution thành công, chưa nhất thiết indexer đã ghi DB. Chờ confirmation policy, event indexer và projection cập nhật.

Giao dịch revert: hiển thị nguyên nhân nếu có, giữ file ở trạng thái uploaded/uncommitted theo retention policy; cho user retry phù hợp. Không xóa evidence draft chỉ vì user đóng modal.

Giao dịch thành công nhưng backend sync lỗi: contract vẫn có commitment. UI phải cho đối chiếu transaction và retry sync, không khuyến khích gửi commitment khác cho cùng version.

## 10. Trạng thái cần hiển thị

```text
DRAFT
  → UPLOADING
  → UPLOADED
  → CONTENT_VERIFIED
  → AWAITING_WALLET
  → TRANSACTION_PENDING
  → COMMITTED_ONCHAIN
```

Nhánh lỗi: `UPLOAD_FAILED`, `CONTENT_REJECTED`, `USER_REJECTED_SIGNATURE`, `TRANSACTION_REVERTED`, `SYNC_PENDING`. Đây là tên ví dụ để mô tả, không phải enum đã chọn.

Chỉ `COMMITTED_ONCHAIN` cho biết contract đã ghi commitment. Nó vẫn chưa đồng nghĩa verified/accepted.

## 11. Public và private khi triển khai

Public evidence: storage/content có thể đọc công khai. Chỉ commit/publish dữ liệu định cho phép công khai; hash không ẩn nội dung và metadata có thể làm lộ quan hệ.

Private evidence: backend kiểm tra phiên, role và policy, rồi cấp link ngắn hạn; object không public. Nếu có mã hóa, xác định ai giữ key và Resolver đọc thế nào. URL ngắn hạn có thể bị chia sẻ trong thời gian hiệu lực; người tải có thể giữ bản sao.

Baseline hiện tại dùng restricted originals/manifests và public redacted derivatives với hash/access riêng. Mã hóa end-to-end còn hoãn. Dùng dữ liệu giả cho demo.

## 12. Làm sao thao tác và biết từng bước đã xong?

| Bước | Chỗ xem |
|---|---|
| Request quyền upload | Network panel trên browser + API logs |
| Object lưu đúng | Storage console/API bằng quyền dev |
| Bytes/hash đúng | Lấy đúng object version rồi tính lại cùng thuật toán |
| Metadata đúng mốc | API/DB dev kiểm tra campaignId/milestoneId/version |
| Commit thành công | Receipt, event, state contract |
| Indexer đồng bộ | Log/checkpoint + bản ghi projection |
| Giao diện cuối | Trang evidence cho đúng role/version |

## 13. Test luồng quan trọng

- Người không phải Organizer xin URL upload: bị từ chối.
- Upload timeout hoặc URL hết hạn: retry không tạo commitment giả.
- Gửi sai file type/size: bị từ chối theo policy.
- Object bị thay sau hashing: final version/hash phải phát hiện mismatch.
- Wallet hủy ký: UI không báo committed.
- Transaction revert hoặc wrong chain: người dùng thấy trạng thái và bước xử lý.
- On-chain commit xong, indexer dừng: retry sync không gửi lại commit.
- Evidence của version 1 không thể âm thầm thay bằng bytes khác.

## 14. Done của Mốc 6

Người dùng có thể tải file, nhận kết quả từng bước đúng, backend xác minh nội dung đã lưu, hash khớp phiên bản immutable, contract ghi commitment đúng milestone, indexer đồng bộ event, và người xem thấy rõ uploaded/committed/reviewed khác nhau.

Nguồn: [Process — Mốc 6](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Tech Stack — AWS S3 SDK/File Type](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md), [1.6 — Evidence Model](../Explain_Details_Moc1/FundTogether_Moc1_Protocol_MVP_Explained.md#moc-1-6).

## MVP baseline alignment

Baseline cũ dùng public demo evidence. Đặc tả cập nhật bên dưới phân biệt tài liệu
công khai đã che dữ liệu và bản gốc có quyền truy cập; không công khai thông tin
cá nhân thật. File/metadata nằm ngoài chain, hash/version commitment trên chain.
Upload success, commitment success và review/settlement vẫn là trạng thái riêng.
EIP-712 verifier signature chưa được chọn; prototype dùng role và giao dịch on-chain.

## Đặc tả cập nhật — 2026-10-03

- [Evidence Schema v0.1](../../FundTogether_Evidence_Schema_v0.1.md): trường dữ liệu,
  đơn vị tiền, quyền xem, freeze và manifest hash.
- [Verification Report v0.1](../../FundTogether_Verification_Report_v0.1.md):
  pipeline version, provenance, warnings và manual fallback.
- [Hồ sơ mẫu](../../FundTogether_Evidence_Example_v0.1.md): dữ liệu giả và các nhánh
  kiểm thử cần triển khai; không phải test đã chạy.

Admission/versioning đã có trong contract; review 72 giờ bắt đầu khi assigned
verifier accept. Backend đã có schema parser/metadata ownership service; upload/checklist/report, SIWE, on-chain ownership và giao diện chưa triển khai.
OCR/AI có thể bổ sung sau mà không đổi evidenceHash hoặc quyền tài chính.

## Rà soát mốc và hướng Arc — 2026-10-03

Parser/schema nền đã có; uploads, freeze/hash/report và auth/chain ownership checks còn TODO. Commitment hiện là SHA-256 exact UTF-8 frozen manifest bytes; report version không đổi evidenceHash. Arc finality/indexed/verified không đồng nghĩa; optional OCR/AI không cấp quyền tài chính.

Arc testnet là hướng tích hợp ưu tiên, chưa deploy/kiểm chứng runtime. Xem
[bảng rà 10 mốc](../../FundTogether_Milestone_Review_2026-10-03.md) và
[Arc sources và checklist](../../FundTogether_Arc_Evaluation_v0.1.md).
Các yêu cầu Arc ở đây là TODO, không phải kết quả test/deploy.
