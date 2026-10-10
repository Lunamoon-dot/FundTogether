# Workflow B — thiết kế và task nộp hồ sơ xác thực tổ chức

> 2026-10-10 — cập nhật theo quyết định đơn giản hóa MVP của người dùng:
> request history + audit log + khóa trường quan trọng khi UNDER_REVIEW;
> không xây explicit profile versioning. Người dùng đã yêu cầu tiếp tục goal;
> lifecycle đã triển khai, kiểm thử tự động được ghi ở acceptance; manual còn TODO.
> Điều chỉnh kỹ thuật khi triển khai nằm ở mục8.
> Bản này thay phương án có bảng submissions/version trước đó; B-D01–B-D10 giữ nguyên.
> Nguồn: [định hướng nghiên cứu](./research-direction.md),
> [đặc tả B](./workflow-b-spec.md), [kế hoạch code](./workflow-b-code-plan.md),
> [rà soát hiện trạng](./workflow-b-code-audit-2026-10-10.md).

## 1. Vấn đề và phạm vi

Trước thay đổi, ADMIN ghi VERIFIED/REVOKED trực tiếp và queue liệt kê mọi tổ
chức; organizer chưa có nơi nộp hồ sơ hoặc nhận yêu cầu bổ sung. Bản triển khai
mới thêm lifecycle bên dưới và chặn ghi VERIFIED thiếu request đã gửi.

Mục tiêu bổ sung: organizer thực hiện trọn hành trình từ hồ sơ tổ chức đến
quyết định xác thực có căn cứ, trước khi resolver xét kế hoạch/cấp đầu.
Thao tác hoàn toàn off-chain, dùng account login; liên kết ví vẫn phải qua SIWE.

Không thêm role, smart contract, phí, bond, chữ ký ví cho từng lần gửi hồ sơ,
email notification hoặc hệ thống ticket chung. Hồ sơ xác thực danh tính/thẩm
quyền tổ chức khác với kế hoạch campaign và bằng chứng thực hiện từng đợt.

Lỗi ghi cứng “Chưa xác minh” trên danh sách/hồ sơ đã sửa riêng ngày2026-10-10:
UI đọc verificationStatus từ API, gồm unverified/verified/revoked và trạng thái
không nhận diện. Sửa nhãn này chưa tạo ra form hay lifecycle mô tả bên dưới.
Trường hiện tại là trạng thái bản ghi; không chứng minh bản xác thực còn hạn.

## 2. Luồng MVP đã chọn

```text
Organizer sửa hồ sơ → lưu nháp/tài liệu riêng tư
    → Gửi xác thực → UNDER_REVIEW (chờ ADMIN, khóa trường quan trọng)
        ├─ CHANGES_REQUESTED → organizer sửa → Gửi lại bằng request mới
        ├─ REJECTED → xem lý do; có thể tạo yêu cầu mới
        └─ APPROVED → ghi verification VERIFIED kèm thời hạn/căn cứ
    → Organizer hủy yêu cầu đang chờ → CANCELLED → sửa và gửi request mới
```

| Trạng thái yêu cầu | Ai được làm tiếp | Điều kiện chuyển |
|---|---|---|
| DRAFT | OWNER lưu/sửa/tải hồ sơ và gửi | Đủ trường bắt buộc, file được kiểm tra, đã chọn ví đại diện hợp lệ |
| UNDER_REVIEW | ADMIN đọc và ra quyết định; OWNER có thể hủy yêu cầu | Chỉ quyết định đúng request đang chờ; cấm sửa thông tin/tài liệu xét duyệt |
| CHANGES_REQUESTED | OWNER đọc lý do, sửa hồ sơ hiện tại và gửi lại | Request cũ giữ kết luận; lần gửi lại tạo request mới, không ghi đè lịch sử |
| APPROVED | OWNER xem quyết định; khi cần tạo yêu cầu gia hạn mới | Kết thúc yêu cầu; verification vẫn có hạn và có thể bị thu hồi |
| REJECTED | OWNER xem lý do và tạo yêu cầu khác nếu cần | Kết thúc yêu cầu; không âm thầm biến thành thu hồi bản xác minh cũ |
| CANCELLED | OWNER sửa hồ sơ rồi gửi lại | Giữ dấu vết người/thời điểm hủy; ADMIN không duyệt request đã hủy |

Một tổ chức chỉ có một yêu cầu đang mở (DRAFT/UNDER_REVIEW). Mỗi lần gửi là một
request riêng, có submittedAt và kết quả cuối. UI có nút “Bổ sung và gửi lại”,
không bắt người dùng tạo/chọn v1/v2/v3. Không thêm SUBMITTED cạnh UNDER_REVIEW
khi MVP không có bước nhận xử lý riêng. Hai ADMIN cạnh tranh được kiểm bằng
request ID/trạng thái và DB transaction; không cần module quản lý phiên bản.

Backend khóa trường tham gia xét duyệt trên mọi đường ghi: tên pháp nhân,
số đăng ký, địa chỉ, căn cứ đại diện, tài liệu và trường hồ sơ gửi ADMIN.
Đổi/xóa file, hoàn tất upload hoặc API sửa profile cũng phải kiểm khóa;
disable input ở frontend chưa đủ. ADMIN chỉ ghi quyết định, không sửa hộ hồ sơ.

Không áp giới hạn ba phiên bản milestone vào số lần gửi hồ sơ tổ chức. Không
tự duyệt khi ADMIN vắng mặt. Hiện lịch sử “đã gửi / yêu cầu bổ sung / gửi lại /
đã duyệt”, người thao tác và thời điểm; không hiển thị hệ thống profile versioning.

## 3. Nội dung hồ sơ và tiêu chí xét duyệt

### Organizer nhập

| Nhóm | Nội dung tối thiểu đề xuất |
|---|---|
| Danh tính/phạm vi tổ chức | Tên hiển thị, tên pháp nhân/số đăng ký nếu có, địa chỉ, loại tổ chức/nhóm và phạm vi hoạt động |
| Đại diện và thẩm quyền | Vai trò người nộp; căn cứ được đại diện tổ chức; tài liệu hoặc nguồn có thể đối chiếu |
| Năng lực thực hiện | Hoạt động đã làm hoặc căn cứ đủ khả năng mua/trao quà; nguồn kiểm tra và giới hạn |
| Kênh liên hệ | Ít nhất một kênh làm việc để ADMIN kiểm tra, lưu riêng tư |
| Ví đại diện | Đọc từ liên kết ví của tổ chức, không cho nhập địa chỉ tùy ý vào form |
| Tài liệu | Loại, tên, mô tả nội dung/căn cứ hỗ trợ; file PDF/JPEG/PNG |
| Cam kết người nộp | Xác nhận có quyền cung cấp hồ sơ và đã đọc nội dung sắp gửi |

Mỗi nhóm thẩm định cần ít nhất một nguồn/tài liệu. Không mặc định mọi nhóm
thiện nguyện đều có giấy đăng ký pháp nhân và không bắt upload giấy tờ định
danh cá nhân hàng loạt. ADMIN đánh giá căn cứ phù hợp với loại tổ chức, có
lý do và giới hạn; nguồn không đủ thì yêu cầu bổ sung hoặc từ chối.

Bản nháp có thể lưu thiếu ví/file; chỉ “Gửi hồ sơ” kiểm đầy đủ. Lưu/tải file
không tự gửi. Tiếp tục dùng giới hạn10MiB/file,20 file/lần gửi và kiểm MIME
bằng bytes như pipeline hiện tại; giữ giới hạn ở một policy có test.

### ADMIN đánh giá

- Đọc snapshot và file thực, đối chiếu danh tính, quyền đại diện, năng lực và
  liên hệ. SIWE chỉ chứng minh kiểm soát ví, không chứng minh thẩm quyền tổ chức.
- APPROVE: nhập kết luận từng nhóm, lý do, sources, scope, limits và validUntil;
  không cho duyệt nếu còn nhóm cần bổ sung hoặc từ chối.
- REQUEST_CHANGES: lưu trạng thái CHANGES_REQUESTED, lý do và mục thiếu để
  organizer trả lời trong lần gửi tiếp; không tạo verification VERIFIED.
- REJECT: lý do và nhóm căn cứ không đạt; không tự gán organization.revoked.
- Thu hồi verification là hành động ADMIN riêng, giữ lý do/lịch sử hiện có.

Các tài liệu là dữ liệu riêng tư; không có bước công khai hoặc tạo bản redacted
trong luồng onboarding này. Badge chỉ có nghĩa “FundTogether đã kiểm tra hồ sơ
tổ chức theo policy xác minh”, trong phạm vi/thời hạn được ghi. Đây là Web2
trust layer, không bảo đảm campaign trung thực hoặc evidence đúng. Quyết định
campaign/milestone/evidence/challenge vẫn đi qua các luồng riêng.

## 4. Quyền và ranh giới với cấp vốn

| Chủ thể | Quyền đề xuất |
|---|---|
| OWNER hiện tại | Đọc yêu cầu/file/quyết định của tổ chức mình; sửa bản làm việc và gửi đúng state |
| ADMIN | Queue UNDER_REVIEW, lịch sử đã gửi, đọc file và quyết định; cấm tự duyệt tổ chức mình OWNER hoặc sửa nội dung organizer |
| RESOLVER | Đọc hồ sơ đã gắn với verification record để thẩm định campaign/cấp đầu; không đọc draft hoặc xử lý yêu cầu |
| Donor/khách/tài khoản khác | Không đọc request, file, nguồn liên hệ hoặc quyết định nội bộ |

Backend kiểm quyền hiện tại trên từng request/download, không tin role/address
từ client hoặc chỉ ẩn nút. Thu hồi membership/role có hiệu lực cho lần truy cập
sau; URL tải ngắn hạn không được đưa vào log, snapshot/hash hoặc API công khai.

Hai trục trạng thái phải hiển thị riêng:

```text
Trạng thái yêu cầu: DRAFT / UNDER_REVIEW / CHANGES_REQUESTED / APPROVED / REJECTED / CANCELLED
Trạng thái tổ chức: UNVERIFIED / VERIFIED / EXPIRED / SUSPENDED
```

Lưu verifiedAt và verificationExpiresAt (UTC), gắn với verification record.
APPROVED là kết quả lịch sử của một request; hết hạn không đổi request đó thành
EXPIRED. Tổ chức EXPIRED gửi lại thì request mới UNDER_REVIEW, tổ chức vẫn EXPIRED
đến khi được duyệt. SUSPENDED là đình chỉ chủ động, có người thực hiện/lý do;
không tự biến về VERIFIED hoặc chỉ hết hạn theo đồng hồ.

Hiệu lực dùng verification record/context và cùng chain checkpoint với B3 hiện
có, không suy từ request.APPROVED hoặc enum organization lưu sẵn. Không đọc được
RPC là lỗi tải/kiểm tra hiệu lực, không ghi UNAVAILABLE vào trạng thái nghiệp vụ;
UI báo “Chưa kiểm tra được hiệu lực”, vẫn cho lưu draft và thử lại.

Gửi yêu cầu gia hạn với cùng thông tin hay nhận CHANGES_REQUESTED/REJECTED không
tự hủy bản xác minh trước còn hiệu lực. Với sửa thông tin quan trọng sau duyệt,
xem quy tắc đã triển khai ở mục8; không gán badge của hồ sơ cũ cho dữ liệu mới tùy ý.
Record legacy REVOKED vẫn giữ bytes/hash; đề xuất ánh xạ sang SUSPENDED ở status
tổ chức, không coi là một sự kiện hoặc record mới. Giữ B3 kiểm bản ghi
còn hiệu lực ở approval/first eligibility; không tự sửa trạng thái campaign,
STOP, refund hoặc số dư on-chain từ việc đổi request/verification.

## 5. Dữ liệu và API đã triển khai

### Lưu trữ tối thiểu

| Bảng | Dữ liệu / ràng buộc |
|---|---|
| organizations | Giữ schema hiện tại để không tác động baseline A. Hồ sơ đang chỉnh nằm trong request.content; API tính verifiedAt/verificationExpiresAt/status hiệu lực từ record hiện có và giờ chain |
| organization_verification_requests | id, organizationId, status, revision, content, submittedAt, reviewedAt, reviewedBy, reviewNote, missingItems, snapshotBytes/hash, policyId, verificationRecordId; partial unique một DRAFT/UNDER_REVIEW mỗi tổ chức. Snapshot null trước gửi, cố định sau gửi; kết luận ghi một lần |
| organization_verification_documents | id (private storage object ID), organizationId, requestId, uploadedBy, kind, originalName, mediaType, byteSize, hash, createdAt; request.snapshotBytes giữ metadata tại lúc gửi. Thay file là object mới; không xóa/đổi bytes file request cũ đã tham chiếu |
| organization_verification_audit | id, organizationId, requestId, actorId, action, happenedAt, changedFields; append-only, ghi cùng transaction với thao tác. changedFields là tên trường do server đối chiếu, không tin client và không ghi PII/URL ký vào log |

Không có bảng organization_verification_submissions, version hoặc parentVersion.
Một bản chụp nhỏ trong request giữ đúng thông tin đã gửi và file tham chiếu;
không tạo hệ thống versioning cho toàn bộ organization. Audit chỉ ghi “đã duyệt”
chưa đủ nếu thông tin hiện tại và file có thể đổi sau đó. Bản chụp và audit bổ
sung nhau: biết ai/lúc nào làm gì và biết admin đã xét nội dung nào.

Tái sử dụng organization_verification_records cho kết quả VERIFIED/REVOKED.
Report mới chứa requestId/snapshotHash và bốn kết luận kiểm tra; request có
verificationRecordId unique. Không viết lại reportBytes/hash lịch sử. Draft
có concurrency token nội bộ để chặn stale writes, không hiển thị “version”.
Submit khóa organization/request, kiểm file đã lưu/hash và chụp dữ liệu cùng
transaction. Gửi hai lần trả cùng kết quả; gửi sau hủy/đã review không mở lại
request cũ. Upload và mọi đường sửa profile dùng cùng khóa org/state.

Quyết định ADMIN nhận đúng requestId và concurrency token đang xem. Transaction
khóa organization/request, kiểm role/OWNER hiện tại và UNDER_REVIEW, ghi kết luận,
reviewedAt/reviewedBy/reviewNote, audit và
append verification khi APPROVE. Lỗi ghi record phải rollback cả APPROVED.
Hai ADMIN hoặc cancel/approve đồng thời chỉ có một kết quả cuối; request lock
và verificationRecordId unique ngăn duplicate approval. Storage không nằm trong
DB transaction; upload lỗi sau ghi file chỉ dọn object vừa tạo. File chưa kiểm
hoặc storage lỗi không được tính là hồ sơ đã gửi.

### API dưới /v1/advance

| Method / route | Tác dụng |
|---|---|
| GET /organizations/:id/verification-requests | OWNER đọc tiến trình/lịch sử, summary hiệu lực + checkedBlock/chainTimestamp |
| POST /organizations/:id/verification-requests | OWNER tạo draft hoặc trả lại yêu cầu đang mở |
| GET /verification-requests/:id | Chi tiết có phân quyền; không lộ draft cho resolver |
| PATCH /verification-requests/:id | Lưu draft và hồ sơ liên quan trong DRAFT; kiểm concurrency token và khóa xét duyệt ở backend |
| POST /verification-requests/:id/files | Multipart qua server; kiểm MIME/bytes, ghi file private + hash/reference; tái sử dụng pipeline hiện có, không cần endpoint complete |
| GET /verification-requests/:id/files/:documentId/download | Kiểm quyền, reference và bytes/hash trước stream private/no-store; không lộ object URL |
| POST /verification-requests/:id/submit | Chụp dữ liệu/file, chuyển UNDER_REVIEW và ghi audit |
| POST /verification-requests/:id/cancel | OWNER hủy request UNDER_REVIEW chưa có kết luận, mở lại khả năng chỉnh hồ sơ |
| GET /internal/verification-requests | ADMIN queue UNDER_REVIEW; filter trạng thái và phân trang, không liệt kê draft |
| POST /internal/verification-requests/:id/decisions | ADMIN APPROVE/REQUEST_CHANGES/REJECT trên nội dung request đã gửi |

DTO/schema server là nguồn; thêm OpenAPI và regenerate client, không copy type
bằng tay. Dùng AuthGuard/BrowserOriginGuard, cookie B và private/no-store hiện có.
401/403 cho auth/quyền;404 khi tài nguyên không thuộc phạm vi đọc;409 stale
revision/state;400 payload thiếu/sai;503 khi storage/RPC cần thiết chưa sẵn sàng.

### Chuyển tiếp từ pilot hiện tại

- Giữ mọi verification cũ và hash; hiển thị “Xác minh trước luồng hồ sơ” khi
  không có request. Không bịa hồ sơ nộp thay người dùng hoặc buộc xác minh lại
  một bản còn hợp lệ chỉ vì vừa thêm lifecycle.
- Khi triển khai xong, luồng ghi VERIFIED mới của ADMIN đi qua quyết định trên
  request. Endpoint cũ POST /internal/organizations/:id/verifications còn
  nhận REVOKED; VERIFIED thiếu request bị từ chối, không có đường duyệt tắt.
- Vì đây là thay đổi API B, phải cập nhật cùng lúc UI ADMIN, seed/smoke và tài
  liệu; smoke tạo hồ sơ synthetic theo luồng mới, không sửa dữ liệu thật.
- Migration additive trên DB B sau guard; A không đổi schema hành vi hoặc dữ
  liệu. Test nâng cấp với verification cũ và campaign đang funding/executing.

## 6. Task bổ sung và thứ tự triển khai sau review

Các task tách khỏi21 task gốc C1–I3. Ngày2026-10-10, OB1–OB3/OF1–OF2 đã
**DONE** về implementation và kiểm thử tự động; OI1 **IN_PROGRESS** vì còn
nghiệm thu người dùng. Bằng chứng cụ thể ở [acceptance](./workflow-b-acceptance.md).

| ID | Phạm vi/file dự kiến | Phụ thuộc | Bằng chứng hoàn thành |
|---|---|---|---|
| OB1 | backend/src/database/schema/organization-verification-requests.schema.ts; schema barrel; migration B; advance/organization-request.schema.ts + specs | Chốt chi tiết mục8 | Migration giữ account/wallet/verification cũ; một request mở/org; snapshot trong request và audit; không có bảng version/submissions |
| OB2 | advance/organization-request.service.ts/controller.ts; tái sử dụng evidence storage/validation primitives; specs và HTTP smoke | OB1, auth/storage B | Draft → upload → submit → bổ sung/hủy → gửi request mới; khóa mọi đường ghi khi UNDER_REVIEW, ACL/storage failure và request cũ không thay |
| OB3 | organization-verification.service.ts/controller.ts; request decision service; advance.module.ts; advance-openapi.ts; HTTP smoke | OB2 | ADMIN quyết định đúng snapshot; self-review/conflict/revocation; transaction atomicity/idempotency; latest verification hợp lệ cho B3 |
| OF1 | frontend/src/features/organizations/OrganizationVerificationRequest.tsx; OrganizationProfile.tsx/OrganizationsPage.tsx; generated API; tests | OB2/OB3 | Form hiện tại, gửi/bổ sung/hủy, timeline audit; không v1/v2/v3; khóa field/retry/reload đúng state |
| OF2 | frontend/src/features/review/AdvanceOrganizationVerification.tsx; generated API; tests | OB3 | ADMIN queue yêu cầu thật, đọc file/snapshot, ba quyết định; history/expiry/revocation hiển thị đúng và không tự verify |
| OI1 | backend/scripts/workflow-b/organization-onboarding-smoke.cjs; frontend tests; acceptance/runbook/manual guide | OF1/OF2 | HTTP/DB/storage end-to-end + nghiệm thu UI của OWNER/ADMIN; G1 tiếp tục từ verification được tạo theo request |

Lát triển khai: OB1 → OB2 → OB3 → OF1 → OF2 → OI1. Viết test tái hiện từng
boundary trước implementation, chạy build/test phù hợp, lưu báo cáo B. Không
deploy migration hay mở gate mới chỉ vì tài liệu này đã được tạo.

Dùng organization/verification/storage boundaries sẵn có; audit chỉ cần bảng
và thao tác append trong transaction của service. Chưa tách thành năm module
organizations/organization-verification/admin-review/files/audit-log chỉ vì tên
nghiệp vụ khác nhau; không thêm abstraction trước khi có nhu cầu thực tế.

## 7. Tiêu chí nghiệm thu bổ sung

| ID | Trường hợp bắt buộc | Kết quả cần chứng minh |
|---|---|---|
| O01 | OWNER lưu draft thiếu trường, tải lại | Giữ draft riêng tư; gửi bị chặn với trường cụ thể; không hiện trong queue |
| O02 | Hồ sơ đầy đủ, double click/retry/hai tab | Một request gửi, một queue item; snapshot đúng dữ liệu; stale write409; không tự VERIFIED |
| O03 | ADMIN yêu cầu bổ sung, OWNER sửa/gửi lại | Request cũ giữ nội dung/lý do; request mới xét dữ liệu mới; timeline liên tục, không hiển thị phiên bản |
| O04 | Hai ADMIN hoặc cancel/approve đồng thời | Một kết quả cuối và tối đa một record/request; failure rollback cả audit/request/record; không duyệt sau cancel |
| O05 | ADMIN từ chối, OWNER tạo yêu cầu mới | Lý do/lịch sử còn nguyên; không sửa kết luận cũ; không tự thu hồi verification trước |
| O06 | Donor/OWNER khác/RESOLVER dò ID/file; ADMIN là OWNER | Chặn đúng quyền kể cả gọi API trực tiếp; không lộ draft/file qua list/cache/URL |
| O07 | Sai MIME/hash, file tổ chức khác, storage lỗi; sửa/xóa/complete upload khi UNDER_REVIEW | Backend chặn mọi đường sửa hồ sơ đang xét; admin không sửa hộ; request/file lịch sử giữ nguyên |
| O08 | Hết hạn/đình chỉ; RPC lỗi; sửa field cốt lõi sau duyệt | Org/request có status độc lập; RPC lỗi không ghi đè status; badge gắn đúng hồ sơ đã duyệt theo rule mục8, không tự đổi tiền/state campaign |
| O09 | Gia hạn khi verification cũ còn hạn | Chờ duyệt/bổ sung/từ chối không tự hủy bản cũ; APPROVE thêm record, không rewrite hash |
| O10 | Migration + API cũ + baseline A | Hồ sơ cũ còn đọc/hợp lệ; VERIFIED mới không bypass request; REVOKED legacy không rewrite; A và nghĩa vụ campaign giữ nguyên |
| O11 | Browser OWNER/ADMIN, reload, lỗi mạng sau submit | Trạng thái khớp API; đọc lại kết quả trước retry; không nhầm upload/gửi/đã duyệt |
| O12 | G1 từ organization mới | Request APPROVED → resolver duyệt kế hoạch/cấp đầu đúng quyền; còn phải ký giao dịch tài chính như hiện tại |

O01–O12 là phần bổ sung onboarding, không thay T01–T18 hoặc tự đóng I3.
Test tự động và thao tác người dùng có cột bằng chứng riêng.

## 8. Quyết định và điều chỉnh khi triển khai

**Đã chọn cho MVP:** không explicit profile versioning; lịch sử các lần gửi,
audit log và khóa field/tài liệu quan trọng lúc UNDER_REVIEW; ADMIN quyết định
hoặc yêu cầu organizer sửa, không chỉnh hộ. Tách status organization/request,
có verifiedAt/verificationExpiresAt; badge chỉ nói hồ sơ đã được kiểm theo policy.

**Chi tiết kỹ thuật đã dùng:** snapshot nhỏ nằm ngay trong request (không bảng
submissions), file tham chiếu bất biến, audit append-only, concurrency token
nội bộ và cancel/approve atomic. Đây là cách giữ đúng nội dung từng lần duyệt
mà không buộc người dùng hiểu hoặc quản lý version.

**Hai quy tắc của thiết kế được dùng khi tiếp tục goal:**

1. Sửa field cốt lõi sau APPROVED: hiển thị “Cần xác minh lại” cho thông
   tin đã thay đổi và không dùng verification cũ để qua gate hồ sơ hiện tại.
   Quyết định cũ vẫn giữ lịch sử; không tự STOP campaign hoặc đổi nghĩa vụ đã có.
   Gia hạn không đổi field cốt lõi vẫn dùng bản cũ tới khi hết hạn/đình chỉ.
2. SUSPENDED: thể hiện đình chỉ chủ động bằng record REVOKED hiện có,
   muốn VERIFIED lại phải có xét duyệt mới; không tự phục hồi theo thời gian.
   Không rewrite record lịch sử.

Ngày2026-10-10, sau thiết kế đơn giản hóa, người dùng yêu cầu tiếp tục goal.
OB1–OB3/OF1–OF2 đã triển khai; OI1 còn nghiệm thu con người. Form dùng policy
local-pilot-v1; kiểm thử kỹ thuật không chứng minh tính đầy đủ của hồ sơ pháp
lý ngoài đời. ADMIN xác nhận bốn nhóm, kèm lý do/nguồn/phạm vi/giới hạn chung;
thiếu căn cứ phải bổ sung hoặc từ chối. Không đổi B-D01–B-D10.

Điều chỉnh kỹ thuật: không thêm field vào bảng organizations dùng chung với A;
giữ profile trong request.content, snapshot trong request, dates từ immutable
record. Dùng server multipart sẵn có thay presign/complete, không tách thêm
files service. Migration0014 thêm ba bảng/triggers;0015 siết NOT NULL trong
CHECK cho snapshotHash/reviewNote. Cả hai đã áp dụng trên DB B qua guard.
