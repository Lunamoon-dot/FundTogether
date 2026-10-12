# Goal — Triển khai cơ chế giải ngân lấy xác thực làm trọng tâm (Verification-Centric)

> Cập nhật: 2026-10-12 · Trạng thái: IN_PROGRESS (Chuyển đổi từ HED P1 sang Verification-Centric).
> Căn cứ: Quyết định người dùng ngày 2026-10-12: bỏ thực thể Vendor Web3, Organizer nhận tiền giải ngân trực tiếp, xoay quanh 4 luồng xác thực (Tổ chức, Dự toán chiến dịch, Chứng từ chi tiêu, và Kết quả thiện nguyện), Resolver tạm thời là bên xác thực chấp thuận giải ngân.
> File định nghĩa mục tiêu; không tự khởi chạy goal trong ứng dụng.

## 1. Kết quả cần đạt

Chuyển đổi luồng giải ngân từ cơ chế phụ thuộc Vendor (HED P1) sang **Cơ chế giải ngân lấy xác thực làm trọng tâm** ([đặc tả chi tiết](./docs/verification-first-disbursement-spec.md)). Hoàn thiện xuyên tầng contract → indexer → API → UI:

```text
Xác thực tổ chức (Admin) 
  → Thẩm định chiến dịch & dự toán (Resolver) → Đóng băng cam kết on-chain
  → Gây đủ 100% quỹ 
  → Tạo yêu cầu giải ngân (Dự toán chi) 
  → Resolver duyệt dự toán & kích hoạt giải ngân on-chain (tiền về ví Organizer)
  → Organizer mua sắm & nộp chứng từ chi tiêu (hóa đơn, sao kê, return unused nếu dôi dư)
  → Resolver nghiệm thu tài chính (Financially Settled)
  → Organizer trao quà & nộp bằng chứng kết quả (biên bản bàn giao, danh sách ký nhận, ảnh)
  → Cửa sổ phản biện Donor Challenge (3 ngày) → Resolver nghiệm thu kết quả (Outcome Verified)
  → Hoàn tất chiến dịch hoặc wind-down/refund quỹ còn lại
```

Bàn giao triển khai local có bằng chứng kiểm chứng kỹ thuật. Dọn sạch các thành phần phụ thuộc Vendor không còn dùng (vendor wallet, terms ack, cọc vendor, vendor verification).

## 2. Nguồn và cách sử dụng

1. Đọc [định hướng nghiên cứu](./docs/research-direction.md), [đặc tả giải ngân xác thực](./docs/verification-first-disbursement-spec.md) và AGENTS.md trước.
2. Dùng [đặc tả giải ngân lấy xác thực làm trọng tâm](./docs/verification-first-disbursement-spec.md) làm căn cứ chuẩn cho các trạng thái, quyền hạn và hạch toán dòng tiền mới.
3. Kế thừa các nền tảng dùng chung đã kiểm chứng: Auth/SIWE, liên kết ví, xác thực tổ chức (Onboarding), storage private/public, và hạ tầng indexer idempotent.
4. Kiểm source và [progress](./docs/PROJECT_PROGRESS.md) trước khi kết luận triển khai.

## 3. Phạm vi

- Bỏ hoàn toàn thực thể Vendor trong Web3; tiền giải ngân chuyển thẳng vào `campaign.organizerWallet`.
- Một yêu cầu tài chính chưa đối chiếu tại một thời điểm (`single in-flight unsettled request`).
- Resolver tạm thời là bên xác thực duyệt giải ngân on-chain và đối chiếu sau chi.
- Bắt buộc đủ 100% goal trước khi bắt đầu giải ngân.
- Hai khâu nghiệm thu tách biệt: (1) Nghiệm thu tài chính (hóa đơn, chứng từ) và (2) Nghiệm thu kết quả thiện nguyện (biên bản trao quà).
- Hỗ trợ hoàn trả tiền thừa (`returnUnused`) từ Organizer về Escrow.
- Giữ cửa sổ phản biện Donor Challenge (3 ngày), timeout và cơ chế hoàn tiền (Refund) khi chiến dịch dừng/thất bại.

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
