# FundTogether — Giải thích Mốc 8: MVP Definition

> Đây là hướng dẫn xác định phạm vi MVP, không phải xác nhận các mục dưới đây đã được implement. Quyết định protocol còn mở vẫn cần được chốt trước khi vận hành tiền thật.

## 1. MVP là gì trong Process?

MVP (Minimum Viable Product) là phiên bản nhỏ nhất có thể hoàn thành một hành trình người dùng đủ thật và giúp đánh giá hệ thống. Nó không đồng nghĩa “có nhiều màn hình”, cũng không phải tất cả ý tưởng v0.2 phải cùng có.

Với FundTogether, định nghĩa Process đặt trọng tâm vào lifecycle campaign và failure path:

```text
Create → Fund → Milestone → Evidence → Review/Challenge
→ Settle → Next Milestone → Complete

Funding Fail/Campaign Cancel → Refund → Bond Settlement
```

Hai đường này phải nối từ UI tới contract/backend/indexer/storage theo mức MVP đã chọn.

## 2. Chia scope thành must-have, later và out of scope

Mỗi feature có ba trạng thái hữu ích:

- **Must-have:** nếu thiếu, journey hoặc safety rule chưa chạy.
- **Later:** có giá trị nhưng chưa cần để kiểm chứng MVP.
- **Out of scope:** chủ động không giải quyết ở bản này; nêu giới hạn.

| Nhóm | Nội dung Process gợi ý |
|---|---|
| Organizer | Tạo campaign, khai báo mốc, khóa bond, nộp evidence, xem status |
| Donor | Xem campaign, donate, xem contribution, evidence public, challenge, claim refund |
| Protocol | Goal/deadline, finalize, sequencing, bond, evidence commitment, review/challenge, settlement, cancellation/refund, bond outcome |
| Backend | User/wallet link, campaign/evidence metadata, file storage, event sync |
| UI | List/detail/create, dashboard hai vai trò, milestone/evidence, refund |
| Có thể để sau | Scoring/badge nâng cao, consensus nhiều verifier, voting, AI fraud, KYC tổ chức nâng cao, nhiều token, cross-chain, DAO, app điện thoại, social/recommendation |

Public evidence trong UI không nghĩa đưa hồ sơ cá nhân thật ra công khai. Dùng dữ liệu demo an toàn hoặc chốt policy riêng trước khi dùng dữ liệu thật.

## 3. Định nghĩa cụ thể bằng use case

Mỗi mục “must-have” cần acceptance criteria có thể quan sát.

**Không đủ:** “Refund page hoạt động.”

**Đủ rõ hơn:** “Khi campaign ở trạng thái refundable, donor đúng ví thấy claimable theo snapshot; gọi claim chuyển không quá entitlement; claim lần hai không chuyển thêm; sau refresh trang thể hiện số đã nhận theo transaction/indexer.”

Ví dụ thêm:

| Use case | Acceptance criteria |
|---|---|
| Create | Organizer tạo draft hợp lệ; config on-chain không lệch bản review |
| Bond | Thiếu bond thì không publish/activate theo rule |
| Donate | Mức raised tăng sau transaction thành công, không sau khi chỉ mở popup |
| Evidence | UI tách uploaded, committed và accepted |
| Challenge | Donor không đủ quyền hoặc ngoài window bị contract/API chặn đúng lớp |
| Complete | Mốc cuối accepted; bond chỉ claim khi đủ điều kiện |
| Funding fail | Không mở milestone; donor có claim đúng entitlement |

## 4. Definition of Done cần phân biệt hai cấp

### Feature Done

Protocol rule, contract/happy-negative tests, event, indexer/API mapping và UI handling đã nối cho feature đang nói; trạng thái pending/success/fail rõ.

### MVP End-to-End Done

Một campaign từ tạo tới kết thúc chạy trên môi trường tích hợp, dữ liệu tồn tại sau reload, hai failure paths được diễn tập, accounting đối chiếu được và các role khác nhau kiểm tra được.

Một contract test pass không chứng minh API sync; một UI demo không chứng minh tiền đã chuyển. Kết quả cần có bằng chứng từ đúng các lớp.

## 5. Các cổng chất lượng trước test người dùng

- Dùng mock/test token và môi trường thử nghiệm đã ghi rõ.
- Không chứa secret/production credentials trong frontend hoặc repo.
- Contract đủ ổn định, test financial/permission quan trọng qua.
- Indexer phục hồi/retry và có trạng thái sync quan sát được.
- Không dùng file/hồ sơ thật nhạy cảm trong public evidence demo.
- Resolver, failure và refund paths đã được team lựa chọn, không dùng default “admin sẽ xử lý sau”.

Đây là tiêu chí triển khai để tránh gọi nhầm prototype thành sản phẩm có thể nhận tài trợ thực.

## 6. MVP scope nằm ở đâu và được dùng thế nào?

Viết `mvp-scope.md` trong nhóm tài liệu protocol, hoặc dùng vị trí repo phù hợp. Mỗi dòng có owner, status (Must/Optional/Later/Out), dependency và acceptance criteria.

Board công việc có thể chứa issue tương ứng, nhưng không thay tài liệu tổng hợp việc gì thuộc MVP.

Khi scope đổi, kiểm tra state machine, financial rules, ABI/events, indexer, API và journey bị ảnh hưởng; đừng chỉ sửa checkbox.

### Ví dụ: chốt scope cho một campaign thử nghiệm

Giả sử nhóm chạy một campaign có hai milestone trên local chain bằng mock token. Ghi một dòng cho từng khả năng:

| Khả năng | Phân loại | Bằng chứng hoàn tất |
|---|---|---|
| Organizer tạo campaign và khóa bond | Must-have | Contract state, receipt và campaign xuất hiện sau reload |
| Donor donate | Must-have | Balance/accounting trong contract khớp số hiển thị sau index |
| Evidence upload rồi commit hash | Must-have | Object/version, hash được tính lại và event commitment khớp |
| Challenge + resolve tối thiểu | Must-have nếu quy trình phụ thuộc dispute | Người đúng quyền gọi được; người sai quyền/ngoài hạn bị chặn |
| Refund khi không đạt funding goal | Must-have cho failure path | Hai donor claim riêng; tổng claim không vượt entitlement |
| Reputation score, nhiều token, cross-chain | Later/Out | Không nằm trong acceptance của lần thử này |

Trước khi code, Product/Protocol owner ghi bảng vào tài liệu scope; developer tạo issue tương ứng; người kiểm thử biến từng tiêu chí thành kịch bản. Ví dụ, “refund hoạt động” được đổi thành: donor A có entitlement 40 token, donor B 60; mỗi người claim một lần; lần claim lặp không chuyển thêm; sau reload tổng dữ liệu vẫn là 40/60. Số này chỉ là fixture minh họa, cần thay bằng rule và test data đã chốt.

Khi chạy, dùng local chain/test token, API/database/storage dev. Lưu tx hash, fixture/config và kết quả test cùng issue. Nếu màn hình hiện “refunded” nhưng receipt chưa thành công, acceptance chưa đạt. Nếu contract đúng mà profile/API chưa cập nhật, ghi nhận là lỗi tích hợp riêng, không đánh dấu toàn journey xong.

## 7. Đầu ra

- Một bảng in-scope/out-of-scope.
- 4 journey với acceptance criteria cụ thể.
- Danh sách giả định môi trường/test asset/dữ liệu.
- Hạn chế MVP hiển thị rõ cho người kiểm thử.
- Không còn feature in-scope dựa vào quyết định protocol chưa được owner chốt.

**MVP hoàn tất khi hai đường success/failure thực sự chạy đầu cuối theo phạm vi đã chọn và accounting có thể kiểm chứng.**

Nguồn: [Process — Mốc 8, những thứ không cần cho MVP, Definition of Done](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md).

## MVP baseline alignment

MVP: milestone tuần tự, donor-only challenge, mandatory admission/versioning, originals hạn chế và public redactions. Committee 2/3 đã chọn nhưng chưa có code. Refund trước FUNDED có snapshot/pull claim; post-FUNDED còn OPEN. Safe, EIP-712, mã hóa end-to-end, cross-chain, nhiều token và reputation nâng cao vẫn hoãn.

## Rà soát mốc và hướng Arc — 2026-10-03

Anvil local; Arc testnet ưu tiên public integration, Arc production candidate ưu tiên. MVP chưa DONE: committee/recovery, auth/storage/API/indexer và FE journey còn thiếu. Chốt production sau runtime/accounting, complete failure paths và fund-safety review. Bank conversion/AI tự phân xử vẫn post-MVP.

Arc testnet là hướng tích hợp ưu tiên, chưa deploy/kiểm chứng runtime. Xem
[bảng rà 10 mốc](../../FundTogether_Milestone_Review_2026-10-03.md) và
[Arc sources và checklist](../../FundTogether_Arc_Evaluation_v0.1.md).
Các yêu cầu Arc ở đây là TODO, không phải kết quả test/deploy.
