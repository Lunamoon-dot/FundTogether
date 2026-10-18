# Milestone lifecycle trong MVP

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


Cập nhật: 2026-10-06. Policy đã được người dùng chọn A: resolver hiện có,
không verifier riêng, không appeal/committee/slash. Source và kiểm thử tích hợp
dùng FundTogetherMvp. Cập nhật 2026-10-07: sau reset test được người dùng cho
phép, ứng dụng 8545 đã deploy FundTogetherMvp; campaign prototype cũ đã bị bỏ.
Nghiệm thu luồng bằng MetaMask trên deployment mới vẫn cần thực hiện.

## 1. Quyền và nguồn dữ liệu

```text
FE -> API/session + SIWE links + quan hệ tài khoản -> kế hoạch ký
FE -> ví -> FundTogetherMvp -> receipt
Contract -> events -> canonical indexer -> DB -> FE xác nhận hoàn tất
API -> MinIO riêng tư -> bytes được kiểm tra SHA-256 -> người được đọc
```

| Thao tác | Ai ký | Điều kiện chính |
|---|---|---|
| Chốt bản công khai và nộp | Organizer/OWNER, đúng ví đại diện liên kết | Milestone ACTIVE, còn hạn/lượt; phiên bản tiếp theo và hash bất biến |
| Tiếp nhận hoặc yêu cầu sửa | Tài khoản RESOLVER, đúng ví resolver liên kết | EVIDENCE_PENDING, đúng version/hash, chưa hết hạn tiếp nhận |
| Mở phản đối | Chính ví donor đã góp | IN_REVIEW, trước reviewEnd, version chưa có case |
| Bổ sung case | Ví donor đã góp | Case chưa xử lý, trước responseDeadline |
| Giải trình | Organizer/OWNER, đúng ví đại diện | Một response bất biến, trước responseDeadline |
| CONTINUE / RESUBMIT / STOP | Resolver hợp lệ | Từ responseDeadline đến trước resolutionDeadline |
| Chốt hết hạn tiếp nhận/xử lý | Bất kỳ ví liên kết đủ gas | Đúng state/version và thời gian chain đã tới hạn |
| Giải ngân | Bất kỳ ví liên kết đủ gas | Review kết thúc, không có case giữ tiền; đúng version/hash |
| Claim bond | Đúng organizer/OWNER và ví đại diện | Có claimableBond; claim riêng, không phải donor refund |

Backend chặn resolver là creator/organizer, thành viên tổ chức hoặc có ví liên
kết đã góp. Contract chặn ví resolver là organizer hoặc donor. Role trong DB
không tự tạo quyền ký; việc kiểm tra hai lớp không phát hiện mọi liên hệ ngoài đời
và không ngăn một resolver tin cậy tự gọi contract ngoài ứng dụng.

## 2. Đường hoàn tất và dừng

```text
MILESTONE_ACTIVE -> nộp -> EVIDENCE_PENDING
  -> tiếp nhận -> IN_REVIEW (72 giờ)
    -> hết review, không case -> giải ngân budget cố định
      -> milestone tiếp / COMPLETED + credit bond
    -> donor phản đối -> CHALLENGED
      -> 7 ngày giải trình + 7 ngày resolver xử lý
        -> CONTINUE: reviewEnd gốc; giải ngân là giao dịch riêng
        -> RESUBMIT: 7 ngày sửa; version mới + review mới đủ 72 giờ
        -> STOP / timeout: FAILED + refund snapshot + credit bond
```

Một case/quyết định cuối cho mỗi version; bổ sung không reset deadline.
Tối đa ba versions. Yêu cầu sửa/hết hạn tiếp nhận dùng giới hạn này; hết lượt
không được mở version thứ tư. Các mốc `<` và `>=` dùng block.timestamp.
Đến hạn không tự gửi giao dịch; caller hoặc worker có ETH vẫn cần thực thi.

Giao dịch UI dùng `submitEvidenceForVersion`, `challengeEvidenceForVersion`
và `settleMilestoneForVersion`. Version/hash nằm trong calldata và contract
kiểm tra lại khi mined: một chữ ký chờ lâu không được dùng cho hồ sơ đã đổi.
Các entrypoint cũ giữ tương thích; ứng dụng MVP không dùng chúng cho ba thao tác
này. Admission/rejection/resolution cũng khóa version/hash trên contract.

Donor sở hữu nghĩa vụ hoàn phần chưa giải ngân:
`floor(contribution * (totalContributed - totalReleased) / totalContributed)`.
Không loop donor, claim về chính ví đã góp, một lần; tổng paid không vượt pool.
Bond thuộc organizer, không cộng vào pool. Dust giữ escrow vô thời hạn, không
sweep; tiền chưa claim chưa được coi là dust. False/revert của token giữ nguyên
quyền/counter; bond credit không gọi token nên không chặn donor snapshot.

## 3. Bằng chứng, quyền đọc và tính bất biến

- Bản gốc/frozen manifest hiện có giữ riêng tư. Resolver độc lập đã liên kết
  đúng ví được đọc bản gốc của version đã nộp; mỗi lần đọc có audit.
- Organizer viết báo cáo công khai từng tiêu chí, chọn file đã che thông tin,
  xem lại và xác nhận rõ. Không tự sao chép tài liệu gốc thành bản công khai.
- Manifest công khai chứa deployment stream/campaign/index/version,
  private commitment và SHA-256/size/type từng file. Tên công khai trung tính,
  không chứa tên file riêng tư, storage path hoặc presigned URL.
- Một frozen package có một publication bất biến. Có thể chốt package khác
  trước lần nộp tiếp và chọn đúng hash; bản cũ không bị ghi đè.
- Tài khoản đăng nhập đọc các publication có submission event canonical,
  kể cả version đã nộp trước đó. Bản chuẩn bị chưa nộp chỉ organizer được đọc.
  Đây là bản donor đọc được trong ứng dụng, chưa phải endpoint tải anonymous.
- Manifest được kiểm tra hash khi đọc; file được kiểm tra SHA/size khi tải,
  trước nộp và trước tiếp nhận. FE kiểm tra SHA bản công khai đã tải thêm lần nữa.
  File/manifest hỏng hoặc storage outage báo lỗi; không cấp admission mới.
- Nhận xét/phản đối/giải trình/verdict được lưu bytes bất biến và hash; chỉ
  hiển thị như hành động đã thực hiện khi có event canonical tham chiếu hash.
  Lưu record/prepare/upload không chứng minh giao dịch đã thành công.

Khả năng đọc dữ liệu sau admission vẫn phụ thuộc vận hành storage/backend.
Mất dữ liệu trong review là lý do mở case, không tự gia hạn bằng giờ backend.
MVP chưa có cam kết data availability phi tập trung hoặc bằng chứng sự thật.

## 4. API, schema và trải nghiệm

Authenticated API tại `/milestone-workflows`:

| Route | Mục đích |
|---|---|
| GET `/review-queue` | Hàng chờ resolver hiện có; bỏ qua plan của deployment khác |
| GET `/:campaignId/:index` | Chain facts, quyền, deadlines, publication/history, records và events tại checkpoint |
| POST `/:campaignId/:index/publication` | Chốt báo cáo/file công khai với xác nhận che thông tin |
| POST `/:campaignId/:index/prepare` | Kiểm tra state, SIWE, quyền, version/hash và kế hoạch giao dịch hữu hạn |
| GET `/:campaignId/:index/manifests/:hash` | Nguyên bytes manifest bất biến |
| GET `/:campaignId/:index/documents/:hash/:documentId` | Tài liệu công khai khớp commitment |
| GET `/:campaignId/:index/original[/documentId]` | Bản gốc cho resolver đủ quyền; audit |

Migration 0012 thêm `evidence_publications`, `milestone_records` và
`evidence_access_log`, không sửa/xóa campaign cũ. Đã áp dụng vào DB phát triển.
ABI MVP sinh từ artifact Foundry và dùng chung BE/FE; deployment được xác minh
chain/genesis/code, mined anchor, MILESTONE_POLICY, RECOVERY_POLICY và instance ID.
Lỗi RPC/identity/indexer chặn giao dịch, không tự chuyển state trong DB.

FE giữ một khu resolver tại `#/internal/milestones`; public campaign và workspace
có panel theo state, ví cần dùng, deadline chain, budget/bond và blocker cụ thể.
Giao dịch tách chờ ví, hash đã gửi, receipt hợp lệ và canonical indexed event.
Challenge kiểm tra cả case/version/hash và event donor/reason cùng transaction.
Hash pending lưu theo deployment/account/campaign/milestone; reload/replacement
có đường đối chiếu. Revert/cancel không hoàn tất; hash chưa rõ không gửi lại.
Nếu version đổi, nhận xét/xác nhận cũ và bản gốc đã xem không được dùng cho bản mới.

## 5. Kiểm chứng và bước còn lại

- Foundry: 200 test đạt, gồm 31 MVP; fuzz 1024 và invariant 128 x 128,
  conservation, proportional refund, repeat claim, failed transfer/reentry và
  transaction chờ xác nhận khi version/hash đã đổi.
- Backend: 96 test đạt; frontend: 88 test đạt, build/typecheck và oxlint đạt.
- `milestone-lifecycle-smoke.cjs`: HTTP/session/SIWE/PostgreSQL/MinIO/EVM thật
  trên Anvil 9545, nhiều milestone, CONTINUE/RESUBMIT/STOP/timeout, partial
  refund/dust, bond, file/manifest hỏng, privacy/access, replay/reorg và worker
  mất RPC/unknown send/restart/identity mismatch. Fixture được dọn theo ID riêng.
- Hồi quy prototype: publication/indexer và refund smoke; chain 8545 không reset
  hoặc nhận giao dịch thử từ các smoke này.

Chưa xác nhận thao tác popup MetaMask, đổi ví/reload qua giao diện thật hoặc
vận hành keeper liên tục/đa instance. Worker thử riêng không chứng minh production
HA; token/storage/RPC vẫn có giới hạn vận hành. Chưa triển khai Arc/tiền thật.

Bước tiếp theo sau reset test được cho phép ngày 2026-10-07 là tạo campaign mới
và nghiệm thu Case C bằng trình duyệt theo [hướng dẫn](../old-workflows/manual-test-from-campaign.md).
Campaign prototype cũ đã bị bỏ theo yêu cầu; không tự chuyển quyền hay tiền.
