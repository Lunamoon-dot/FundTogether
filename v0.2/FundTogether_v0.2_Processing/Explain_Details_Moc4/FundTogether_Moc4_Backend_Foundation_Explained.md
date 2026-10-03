# FundTogether — Giải thích Mốc 4: Backend Foundation

> Stack như NestJS/Drizzle/PostgreSQL/Redis/S3/Viem/Ponder là định hướng trong Tech Stack. Endpoints và schemas dưới đây là ví dụ; chưa khẳng định backend đã có code.

## 1. Backend Foundation làm gì?

Backend là chương trình chạy trên server để xử lý phần Web2 của ứng dụng: đăng nhập, thông tin campaign, metadata evidence, upload, truy vấn, thông báo và kết nối các phần khác.

Backend **không phải contract** và không thay contract làm nguồn quyết định số token đang ở escrow. Nó cũng không tự xuất hiện chỉ vì có React website.

```text
Người dùng → Frontend trên trình duyệt → HTTP API → Backend NestJS
                                                   ├→ PostgreSQL
                                                   ├→ Object storage
                                                   ├→ Redis/worker nếu dùng
                                                   └→ Blockchain qua client/indexer
```

Luồng gọi contract trực tiếp từ ví là một đường riêng; không bắt buộc mọi giao dịch donor đi xuyên backend.

## 2. NestJS là hình thức gì, viết ở đâu?

NestJS là framework TypeScript để tổ chức ứng dụng backend thành module/service/controller. Bạn viết source trong editor; chạy tiến trình dev trên máy bằng terminal; khi triển khai, cùng ứng dụng chạy trên môi trường server được cấu hình.

Một cấu trúc tham khảo từ Tech Stack:

```text
fundtogether-backend/
    src/auth/
    src/users/
    src/campaigns/
    src/milestones/
    src/evidence/
    src/files/
    src/challenges/
    src/verifier/
    src/indexer/
```

Đây là module gợi ý, không cần tạo tất cả từ ngày đầu. Module giúp nhóm code cùng domain; nó chưa chắc tương ứng một server riêng.

## 3. Controller, service, database là gì?

- **Controller/route:** nhận HTTP request và trả HTTP response.
- **DTO/schema:** định hình/kiểm tra dữ liệu vào ra. Ví dụ campaign có title, beneficiary, goal, deadline.
- **Service:** chứa quy trình ứng dụng cần thực hiện.
- **Database/repository:** đọc/ghi metadata trong PostgreSQL.
- **Storage client:** yêu cầu dịch vụ file lưu/đọc object.
- **Worker:** xử lý việc chạy nền/retry nếu có.

Ví dụ request minh họa:

```http
POST /campaigns
Content-Type: application/json
Cookie: <session>

{
  "title": "Lắp hệ thống lọc nước",
  "beneficiary": "Trường A",
  "goal": "10000000000"
}
```

Tên route và schema cần thống nhất thật. `goal` truyền dạng string trong ví dụ để tránh mất độ chính xác khi diễn tả lượng token lớn bằng kiểu floating point của JavaScript.

Backend kiểm tra phiên, validate format, lưu draft metadata, rồi trả ID và trạng thái. Nếu bước publish cần transaction contract, API không nên giả vờ transaction đã thành công chỉ vì đã tạo bản ghi draft.

### Theo một request qua các lớp

Với `POST /campaigns` minh họa:

```text
HTTP request
  → Auth guard đọc session
  → DTO/schema kiểm tra dữ liệu
  → Campaign service áp dụng rule draft
  → Drizzle ghi PostgreSQL
  → Controller trả response/status
```

Controller không nên tự chứa SQL, quyền và blockchain logic trong một hàm. Nếu ví ký transaction trực tiếp, contract vẫn kiểm tra quyền on-chain.

## 3.1 Draft, publish intent và confirmed khác nhau

Ba API minh họa, chưa phải endpoints của dự án:

```http
POST /campaigns/drafts
GET  /campaigns/{id}
POST /campaigns/{id}/publish-intent
```

`publish-intent` có thể trả cấu hình để frontend chuẩn bị transaction; nó chưa có nghĩa campaign đã publish. Database và blockchain không có một transaction ACID chung. Nếu metadata lưu xong nhưng tx fail, giữ draft và cho thử lại; nếu tx success nhưng API timeout, reconcile từ chain/indexer thay vì tạo campaign thứ hai.

## 4. PostgreSQL và Drizzle

PostgreSQL là một tiến trình database quan hệ: dữ liệu được lưu thành bảng, cột, khóa và quan hệ. Drizzle là lớp thư viện TypeScript để định nghĩa schema và truy vấn database.

Bảng minh họa:

```text
users
  id, created_at

wallet_links
  user_id, chain_id, address, linked_at

campaign_metadata
  id, chain_id, contract_address, onchain_campaign_id
  title, description, beneficiary_profile

evidence_metadata
  id, campaign_id, milestone_id, version
  storage_key, hash_algorithm, content_hash, upload_status
```

Các field trên cần thiết kế thật, không copy nguyên vào migration mà chưa chốt. Đặc biệt địa chỉ Ethereum phải normalize/validate thống nhất và campaign phải được định danh cùng chain + contract.

Không duplicate contribution state rồi cho API chỉnh sửa tự do. Bản sao chain-derived nên có metadata như block/event cuối đã sync để dễ lần dấu nguồn.

### Migration là gì?

Migration là thay đổi schema có phiên bản, ví dụ tạo `campaign_metadata` hoặc thêm index. Bạn viết migration trong backend repo, chạy trên PostgreSQL dev, review rồi mới áp dụng theo quy trình triển khai.

Không chỉnh production bằng SQL thủ công rồi quên migration; môi trường khác sẽ không tái tạo được schema. Amount token cần kiểu biểu diễn chính xác, không dùng floating-point.

## 5. Auth: tài khoản, phiên và wallet linking

**Authentication** trả lời “request thuộc ai?”. **Authorization** trả lời “người đó được phép thao tác gì?”. Đăng nhập thành công chưa đồng nghĩa có quyền sửa campaign.

Tech Stack đề xuất SIWE để chứng minh kiểm soát ví:

```text
Frontend → xin nonce → backend trả nonce
Wallet ký SIWE message
Frontend gửi message + signature
Backend kiểm tra domain/nonce/thời hạn/signature
Backend tạo session hoặc JWT theo thiết kế
```

Không chỉ nhận `{ "wallet": "0x..." }` từ browser rồi tin rằng caller sở hữu ví. Nonce phải chống replay và được tiêu thụ theo luồng xác thực.

Argon2 chỉ có ích nếu có password; SIWE và mật khẩu là các lựa chọn xác thực riêng. Không thêm password chỉ vì stack có argon2 nếu MVP đăng nhập bằng ví.

### Wallet linking khi đã có account

1. Người dùng đăng nhập account Web2.
2. Backend tạo nonce/challenge mới gắn với session và domain.
3. Ví ký thông điệp nêu rõ mục đích link.
4. Backend xác minh signature, nonce chưa dùng, domain và thời hạn.
5. Backend liên kết address với user theo unique policy.
6. Backend trả kết quả và ghi audit metadata vừa đủ.

Nếu không xác thực account trước, ví có thể bị link nhầm vào hồ sơ khác. Nếu nonce không one-time, chữ ký cũ có thể bị replay.

## 6. Campaign metadata là gì?

Metadata là nội dung ứng dụng không trực tiếp định đoạt token transfer: tiêu đề, mô tả, ảnh, trang giới thiệu beneficiary, thẻ tìm kiếm.

Nên phân biệt:

```text
Draft trong database
    ↓ validate/review
Thông tin đã publish
    ↓ tham chiếu tới chain campaign
```

Nếu mục tiêu, deadline hoặc milestone acceptance criteria có ảnh hưởng quyền và dòng tiền, không được coi chúng là text có thể tự sửa. Cần commit/version chúng theo protocol đã chọn.

## 7. Evidence metadata và upload API

Backend lưu metadata và cấp quyền thao tác storage. Luồng cụ thể nằm ở [Mốc 6 — Evidence Pipeline](../Explain_Details_Moc6/FundTogether_Moc6_Evidence_Pipeline_Explained.md).

Trong Mốc 4, trước hết cần API boundary và data ownership:

```text
POST upload request → kiểm tra tài khoản/role → tạo key + upload permission
GET evidence list  → kiểm tra quyền xem     → trả metadata phù hợp
```

Đây là ví dụ đường đi, không phải endpoint đã tồn tại. Mỗi request vẫn cần validate input, authorization theo campaign và policy public/private.

## 8. Challenge metadata

Database có thể lưu reason dài, tài liệu đính kèm và trao đổi phục vụ điều phối. Contract ghi nhận việc challenge có hiệu lực on-chain và state tương ứng theo protocol.

Backend không được xóa/đổi kết quả on-chain chỉ vì staff sửa bản ghi ứng dụng. Cần có ID liên kết với chain, tx/log đã ghi nhận, và phiên bản metadata đang được trưng ra cho Resolver.

## 8.1 Data contract giữa backend và consumer

Với mỗi API, ghi rõ request/response, auth, authorization, error statuses, pagination/filter và nguồn dữ liệu có thẩm quyền.

Metadata evidence nên trả riêng `uploadStatus`, `chainCommitStatus`, `reviewStatus`. Một boolean `verified` không cho biết file đã upload, commit hay được accepted.

Với dữ liệu chain-derived, có thể trả mốc block sync để frontend giải thích trạng thái cache. Không coi projection là giá trị chain mới nhất khi chưa đối chiếu.

## 9. API và frontend phối hợp thế nào?

Luồng gợi ý trong Tech Stack:

```text
NestJS DTO → OpenAPI → Orval tạo TypeScript client/types → Frontend
```

OpenAPI mô tả API; Orval có thể tạo client để hai phía dùng schema gần nhau. Cần generate sau khi backend contract đổi, review diff và tránh sửa trực tiếp code generated.

HTTP API có status code và error shape rõ. Frontend cần phân biệt 401 chưa đăng nhập, 403 không đủ quyền, 404 không tồn tại, 409 state conflict và lỗi server/network theo cách backend thực sự chọn.

## 10. Logging và job nền

Pino có thể ghi log có cấu trúc như campaignId, milestoneId, txHash và action. Không log private key, session token, presigned URL đầy đủ hoặc dữ liệu cá nhân không cần thiết.

BullMQ + Redis có thể điều phối retry/indexing/notification khi cần. Queue là hệ thống giao việc; PostgreSQL vẫn là nơi lưu dữ liệu domain theo thiết kế. Đừng thêm Redis trước khi có job cần chạy nền.

Job phải idempotent vì có thể chạy lại. Ví dụ gửi email lặp thường khó chịu; cộng donation lặp lại là lỗi accounting nghiêm trọng.

Nếu API đẩy công việc vào queue, trả trạng thái pending/job ID rõ. Với transaction, không retry mù sau timeout nếu chưa biết giao dịch trước đã broadcast hay chưa; tra tx hash/chain state theo thiết kế.

## 11. Kiểm tra backend local

Khi project đã tồn tại:

1. Cài dependencies theo lockfile, đọc `.env.example`/README và schema hiện có.
2. Khởi chạy PostgreSQL dev, cấu hình connection string local.
3. Chạy migration trên database dev, không trực tiếp sửa production.
4. Chạy backend dev server và kiểm tra health endpoint nếu repo có.
5. Gọi API bằng Swagger/UI hoặc công cụ HTTP; quan sát status/body.
6. Xem bản ghi trong PostgreSQL và log request.
7. Test sai phiên, ví sai campaign và dữ liệu thiếu.

Không đưa `.env`/secret lên Git. Tên biến môi trường thực tế phải theo code hiện hữu; không bịa `DATABASE_URL` rồi giả vờ dự án đã dùng nếu chưa đọc cấu hình.

### Ba ca kiểm tra API

| Request | Kỳ vọng |
|---|---|
| Thiếu session | 401/unauthenticated theo API contract |
| User đăng nhập nhưng không phải Organizer campaign | 403; database không đổi |
| JSON sai kiểu hoặc thiếu trường bắt buộc | Validation error; không tạo bản ghi nửa chừng |

Sau request bị từ chối, kiểm tra database để chắc không có side effect. Ẩn nút trên UI không chứng minh backend có authorization.

## 12. Phạm vi MVP và Done

Mốc 4 cần Auth, wallet linking/SIWE, campaign/milestone/evidence metadata, upload, sync integration, challenge metadata và lịch sử reputation cơ bản theo Process.

“Basic reputation history” có thể là hiển thị dữ liệu lịch sử đã có nguồn; không đồng nghĩa xây scoring nâng cao/on-chain. Không cần recommendation, social feed hoặc dashboard phức tạp ở giai đoạn này.

Feature backend xong khi input được validate, quyền được kiểm tra server-side, dữ liệu ghi đúng nơi, lỗi có trạng thái rõ và test các trường hợp từ chối quan trọng. Dữ liệu blockchain vẫn phải được đối chiếu qua indexer/chain; backend CRUD không thay thế contract.

Nguồn: [Process — Mốc 4](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Tech Stack — Backend, Auth, Storage, API Integration](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md).

## MVP baseline alignment

Backend MVP dùng SIWE, PostgreSQL/Drizzle cho metadata và projection, OpenAPI làm API contract. Campaign nên đi qua draft và publish intent; backend không coi metadata đã lưu hoặc transaction đã submit là campaign on-chain thành công.
