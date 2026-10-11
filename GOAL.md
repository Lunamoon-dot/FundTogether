# Goal — Triển khai MVP P1 giải ngân theo yêu cầu

> Cập nhật: 2026-10-11 · Trạng thái triển khai local: DONE.
> File định nghĩa mục tiêu; không tự khởi chạy goal trong ứng dụng.
> Viết goal không chứng minh tính năng đã triển khai/nghiệm thu, không tự cho phép deploy tiền thật hoặc thay đổi nghĩa vụ cũ.

## 1. Kết quả cần đạt

Chuyển luồng tạo campaign mới từ milestone cấp vốn cố định sang yêu cầu thanh toán có căn cứ theo thiết kế MVP P1. Hoàn thiện xuyên tầng contract → event/indexer → API/storage → UI:

```text
Xác thực tổ chức/vendor → duyệt campaign → gây đủ quỹ
→ tạo activity → duyệt yêu cầu mua → vendor xác nhận terms
→ cọc nếu có → xét giao hàng/challenge → thanh toán phần còn lại
→ thuê vận chuyển nếu cần → xác minh kết quả trao quà
→ hoàn tất hoặc wind-down → hoàn quỹ còn đủ điều kiện
```

Bàn giao triển khai local có bằng chứng kiểm chứng kỹ thuật. Nghiệm thu Brave/MetaMask và đánh giá hồ sơ bởi người thật theo dõi riêng, chưa làm thì giữ TODO; không dùng kết quả tự động thay nghiệm thu con người.

## 2. Nguồn và cách sử dụng

1. Đọc [định hướng nghiên cứu](./docs/research-direction.md), AGENTS.md và skills/AGENTSKILLS.md trước.
2. Dùng [thiết kế MVP](./docs/hed-mvp-design.md) cho phạm vi và phương án HED-MVP-1, gồm 12 OPEN và MVP-13.
3. Dùng [kế hoạch chuyển đổi](./docs/superpowers/plans/2026-10-11-funding-requests-cleanup.md) để rà giữ/sửa/xóa. Nếu khác hướng tiền mới, ghi rõ delta theo thiết kế MVP.
4. [Post-MVP](./docs/hed-post-mvp-design.md) nằm ngoài goal. [Kế hoạch request trước](./docs/funding-request-plan.md) là lịch sử lựa chọn; không trộn partial funding/P2 vào P1.
5. Kiểm source và [progress](./docs/PROJECT_PROGRESS.md) trước kết luận triển khai. [Goal B đã lưu](./docs/goals/workflow-b-completed-2026-10-11.md) chỉ mô tả baseline cũ; không chuyển dấu DONE sang MVP này.

Tỷ lệ/thời hạn trong thiết kế là phương án thử nghiệm local, chưa phải policy production. H0 phải làm rõ mâu thuẫn hoặc quyết định còn thiếu trước khi code phần tiền phụ thuộc; không âm thầm đổi quyền, recipient, cap hoặc công thức refund. Không hỏi lại quyết định người dùng đã chốt; tự giải quyết lựa chọn kỹ thuật nhỏ từ repo.

## 3. Phạm vi

- P1 trả trực tiếp vendor, MockUSDC local; đủ goal trước tạo nghĩa vụ/giải ngân.
- Một request tài chính và một activity outcome đang mở; hỗ trợ mua rồi vận chuyển tuần tự trong cùng activity.
- Reserve toàn Q; tối đa một cọc và một final payment chính xác; vendor ký terms trước thực hiện.
- Kiểm nhu cầu mua, giao hàng và kết quả thiện nguyện riêng; bằng chứng gốc riêng tư, bản công khai được che dữ liệu.
- Primary/backup resolver, challenge, timeout, partial delivery, recovery, wind-down và refund base/supplement theo thiết kế.
- Giữ auth, liên kết ví, organization verification và storage dùng chung. ADMIN xác thực tổ chức/vendor; RESOLVER quyết định nghiệp vụ đúng thẩm quyền.
- Không P2/P3, partial funding, request song song, nhiều installment, fiat, adaptive policy, voting/bond hoặc AI tự xét.

## 4. Các chặng thực hiện

Mỗi chặng dưới đây đã có artifact và bằng chứng HED local trong `docs/hed-implementation-status.md`; manual acceptance ở mục 7 vẫn TODO. Goal này không thay implementation plan.

| ID | Công việc và đầu ra | Kiểm chứng trước DONE |
|---|---|---|
| H0 — DONE | Rà source/dependency; lập implementation plan, bảng state/action/actor/guard; đối chiếu policy, deadline, accounting và migration | Mỗi yêu cầu có task/test; trace thành công/wind-down khớp sổ; quyết định ảnh hưởng tiền/quyền không còn mâu thuẫn |
| H1 — DONE | Tách phần dùng chung khỏi advance theo dependency thực tế; giữ organization/account/wallet/file ACL | Regression onboarding, OWNER/ADMIN, liên kết ví và private/public files; không mất dữ liệu |
| H2 — DONE | Contract P1: funding, reserve/ack/cọc/final, delivery/outcome/case, takeover, stop/return/refund; ABI/events sinh từ nguồn | Unit/fuzz/invariant với ledger độc lập; MVP-T01–T11, quyền/replay; double payment và transfer fail không phá sổ |
| H3 — DONE | Migration additive, API/vendor/request/evidence/report, indexer/projections theo deployment identity | Validation/ACL, frozen version/hash, duplicate/reorg/replay/restart; DB không tự cấp quyền chi |
| H4 — DONE | UI OWNER/ADMIN/RESOLVER/vendor/donor: danh sách, chi tiết, hành động, lý do khóa, trạng thái tx và reload | UI journeys; stale version/account/chain, pending/revert/indexer lag; MVP-T12–T15 ở tầng phù hợp |
| H5 — DONE | Deployment local HED riêng, fixtures và integration; mua → vận chuyển → trao quà; các nhánh thất bại | Actual balances + receipt/events + projections khớp; trace mục 10 thiết kế, recovery/replay; mock UI không thay chain evidence |
| H6 — DONE | Chuyển luồng tạo mới sang HED; dọn milestone không còn dùng sau dependency check; giữ đường đọc/xử lý nghĩa vụ A/B | Không route/import/API chết; không xóa lịch sử/migration đã áp dụng; đường xử lý nghĩa vụ cũ còn cần hoạt động |
| H7 — DONE | Báo cáo kết quả, runbook, hướng dẫn nghiệm thu HED và cập nhật overview/progress | Bằng chứng gắn commit/deployment/commands tái lập; giới hạn/manual TODO rõ; đủ checklist bên dưới |

H2/H3 thống nhất ABI/event trước tích hợp. Kiểm thử trong từng chặng, không chờ H5 mới kiểm tiền/quyền. Không đưa post-MVP vào để xử lý giới hạn đã được chấp nhận trong thiết kế.

## 5. Ràng buộc thực hiện

- Làm trên codebase/nhánh hiện tại; không tự tạo nhánh, chat khác hoặc sub-agent.
- Không tự push, tạo PR, public deploy hoặc chuyển tiền thật. Test dùng tài khoản/token local dành cho thử nghiệm.
- Không reset/xóa chain, DB, ví, tài khoản, tài liệu hoặc runtime cũ để làm test xanh. Tách deployment/data thử nghiệm; bảo toàn nghĩa vụ và bằng chứng cũ.
- Không xóa migration đã áp dụng hoặc diễn giải snapshot A/B thành HED. Dọn code sau dependency check và kiểm chứng luồng thay thế.
- Contract là nguồn trạng thái tài chính; event → indexer → DB. Upload/API success hoặc tx hash không phải payout confirmed/indexed.
- Reserve/quarantine không đồng thời chia refund. Chỉ return thực nhận mới tăng custody; không hứa thu hồi token đã trả vendor.
- Timeout không tự phê duyệt/xóa nghĩa vụ vendor. Mất hai resolver có thể khóa phần nghĩa vụ; công bố rõ và vẫn cho claim phần refund đã allocated.
- Không tin địa chỉ client thay chữ ký; không lộ khóa, credential, PII hoặc URL riêng trong log/artifact/commit.

## 6. Điều kiện hoàn thành triển khai

- [x] H0–H7 DONE với bằng chứng HED, không kế thừa PASS Workflow B.
- [x] Contract/backend/frontend build, test liên quan và lint/check của dự án đạt.
- [x] MVP-T01–T15 ánh xạ tới test hoặc giới hạn human review được nêu rõ; guard kỹ thuật có test thực thi.
- [x] Mua → vận chuyển → trao quà → hoàn tất chạy xuyên tầng local.
- [x] Kiểm các nhánh thiếu goal, partial delivery, dispute, thiếu reviewer, loss, wind-down, return/refund.
- [x] Sổ campaign/request khớp actual balances; claim lặp, transfer fail, late return, rounding/dust không phá quyền vendor/donor.
- [x] Có bằng chứng indexer replay/restart/reorg; UI không trộn deployment hoặc báo thành công sớm.
- [x] Luồng tạo mới dùng HED; dữ liệu/nghĩa vụ A/B được giữ; auth/org/wallet/storage không regression.
- [x] Có runbook, fixtures, hướng dẫn nghiệm thu, báo cáo và giới hạn HED; không ghi đè báo cáo B thành HED.

Chỉ đánh dấu goal triển khai DONE khi các mục trên đạt. Manual chưa test không chặn công việc kỹ thuật độc lập; hoãn manual không có nghĩa bỏ test tài chính tự động.

## 7. Nghiệm thu con người — giai đoạn sau, TODO

- [ ] Brave/MetaMask thật: đổi account/chain, ký terms, cọc/final, pending/reload và claim.
- [ ] OWNER, ADMIN, primary/backup resolver, vendor, donor thao tác đúng vai; hiểu khoản giữ, đã trả, được hoàn.
- [ ] Reviewer xét hồ sơ đủ/thiếu/mâu thuẫn và outcome sai; lưu kết luận, không coi hash là chứng minh sự thật.
- [ ] Ghi nhận vendor có chấp nhận cọc/thời gian chờ và hoạt động có phù hợp cap MVP.

Giữ nghiệm thu chưa đạt tới khi có bằng chứng. Hoàn tất triển khai local không đồng nghĩa sẵn sàng dùng tiền thật.
