# Goal — Hoàn thiện luồng B của FundTogether

> Cập nhật: 2026-10-09.
> Đây là nội dung mục tiêu để dùng khi khởi chạy goal, không phải cấu hình tự được ứng dụng nạp.
> Việc tạo/sửa file này không tự kích hoạt goal hoặc phê duyệt các quy tắc tài chính còn mở.

## Mục tiêu

Hoàn thiện luồng B của FundTogether theo
[kế hoạch sáu bước](./docs/workflow-b-delivery-plan.md): cấp vốn trước theo đợt,
nghiệm thu thực chất trước cấp tiếp, xử lý phản đối/quá hạn/tiền dư và hoàn tiền.
Mua và trao quà là loại hình campaign đầu tiên; giữ ranh giới để không áp checklist
trao quà lên toàn bộ các loại campaign trong tương lai.

Đọc [định hướng NCKH](./docs/research-direction.md) trước khi suy luận hoặc chốt
quyết định, rồi đọc AGENTS.md, kế hoạch, đặc tả liên quan và source hiện có.
Phân biệt đề xuất, rule đã duyệt, implementation và kết quả đã kiểm chứng.

## Giai đoạn 1 — Hoàn thành mẫu và đặc tả để duyệt

Thực hiện bước 1–2 của kế hoạch:

1. Hoàn thành mẫu G1 một đợt qua đơn vị và G2 nhiều đợt trao trực tiếp: ngân sách,
   task, tiêu chí hoàn thành, checklist, hồ sơ giả và trace số dư thành công/thất bại.
2. Đối chiếu code/baseline A với B; giải quyết các nhánh thiếu bằng chứng, xác nhận
   sai, reviewer vắng mặt, bổ sung, phản đối, timeout và số dư.
3. Viết `docs/workflow-b-spec.md` và `docs/workflow-b-financial-rules.md` thành
   phương án cụ thể có thể review. Lập bảng B-D01–B-D10: đề xuất, lý do, ảnh hưởng
   đến quyền/tiền và quyết định còn cần người dùng chốt.
4. Trình các tài liệu cùng các lựa chọn còn mở trong một lượt review rõ ràng.

### Điểm duyệt bắt buộc

Trước khi sửa quyền hoặc dòng tiền, cần người dùng duyệt đặc tả viết thành file,
đặc biệt: bond, điều kiện cấp đầu/cấp tiếp, quyền xét duyệt, deadline, tiền dư,
khoản trả lại sau snapshot, công thức refund và điều kiện hoàn tất.

Yêu cầu này đến từ AGENTS.md: quyết định ảnh hưởng kiến trúc, bảo mật, tiền hoặc
hành vi không thể đảo ngược phải được chốt. Việc đồng ý dùng goal không tự duyệt
những quy tắc chưa được viết ra. Không biến đề xuất thành APPROVED bằng suy đoán.

Trong lúc chờ review, có thể hoàn thiện mẫu, trace và rà soát đặc tả. Không triển
khai contract hoặc hành vi tài chính phụ thuộc quyết định chưa có. Không hỏi lại
quyết định người dùng đã duyệt; nếu có sửa đổi mới ảnh hưởng tiền/quyền, trình rõ
phần thay đổi và tác động.

## Giai đoạn 2 — Triển khai đặc tả đã duyệt

Sau điểm duyệt, lập task code cụ thể với file, interface, ABI/event, migration
và test. Trình kế hoạch code để review trước thực hiện. Sau khi được duyệt,
triển khai trực tiếp trong chat này; không tự tạo chat khác hoặc giao sub-agent.

Thực hiện theo phụ thuộc:

1. **Contract B:** funding, cấp vốn, hồ sơ/nghiệm thu, case/timeout, return/refund,
   invariant và artifact deployment. Tách cấp tiền khỏi chốt nghiệm thu.
2. **BE/storage/indexer:** dữ liệu/checklist/version, quyền hồ sơ, quyết định,
   projection và replay theo deployment identity.
3. **FE:** hành trình tổ chức/resolver/donor; trạng thái, việc tiếp theo, ví, hạn,
   số tiền và lý do bật/tắt từng hành động.
4. **Tích hợp:** G1 chạy toàn hành trình trước; tiếp tục G2 và các nhánh bổ sung,
   phản đối, dừng, tiền dư và refund.

Tự xử lý lựa chọn kỹ thuật nhỏ, có thể đảo ngược và phù hợp spec; không xin xác
nhận lại ở mỗi task. Không thêm generic workflow engine, loại campaign chưa có
nghiệp vụ hoặc tính năng post-MVP ngoài phạm vi kế hoạch.

## Giai đoạn 3 — Kiểm chứng và nghiệm thu

Khi goal được khởi chạy, phạm vi công việc bao gồm viết và chạy test, build,
kiểm tra tích hợp và sửa lỗi thuộc luồng B. Làm test kỹ thuật cùng từng task;
không chờ build toàn bộ mới kiểm tra tiền/quyền.

- Contract: unit/fuzz/invariant, access/state/version/deadline, double payout,
  entitlement/pool, transfer fail và reentrancy.
- BE/storage/indexer: quyền original/redacted, freeze/hash, migration, retry,
  duplicate/replay/reorg/reset, deployment identity và checkpoint recovery.
- FE: action gating, trạng thái giao dịch, đổi account/ví, reload và lỗi popup/RPC/indexer.
- Tích hợp: đối chiếu balances/counters, receipt/events và projection theo base unit.
- Nghiệm thu T01–T18 và báo cáo `docs/workflow-b-acceptance.md`; ghi dữ liệu/môi
  trường/cách tái lập. Tách correctness kỹ thuật khỏi xét duyệt sai bằng chứng.

Không tự ký thay người dùng qua extension hoặc bịa kết quả MetaMask. Chuẩn bị
hướng dẫn, fixture và công cụ cần thiết trước các bước cần người dùng ký/đánh giá.
Những case chưa được thao tác thực tế phải ghi TODO, không coi test tự động là
nghiệm thu thủ công hoặc dữ liệu giả là bằng chứng khảo sát ngoài đời.

## Ràng buộc môi trường và tài chính

- Giữ baseline Git `b1881bd2cb3d6a4413605b06741624e86e2323da` để diff/đối chiếu.
- Dùng môi trường test chain/DB/storage riêng cho B; kiểm tra đích trước thao tác.
  Không xóa account hoặc reset dữ liệu/chain hiện tại chỉ để chạy test B.
- B dùng deployment mới. Không suy source/FE mới tự nâng cấp nghĩa vụ campaign A.
- Dùng số nguyên/base unit và bigint; không dùng floating point cho tiền.
- Chỉ return thực nhận được tính vào custody. Không hứa thu hồi advance đã rời
  escrow; không thay đổi quyền snapshot âm thầm hoặc sweep khoản donor chưa claim.
- Hash/chữ ký ràng buộc nội dung và người ký; không tự chứng minh sự thật ngoài đời.
- Smart contract → event → indexer → DB; request HTTP/upload/tx hash chưa là thành công.
- Giữ secrets và PII khỏi source, log, artifact công khai và commit.

## Điều kiện hoàn thành goal

- [x] G1/G2, đặc tả và policy được review; không còn quyết định tiền/quyền bỏ ngỏ.
- [x] Contract B và FE/BE build được; test liên quan PASS với bằng chứng môi trường.
- [x] Hai campaign chạy đủ hành trình, gồm nghiệm thu cuối và nghĩa vụ tiền còn lại.
- [x] Cấp một lần/đợt, chỉ cấp tiếp đúng điều kiện; refund không vượt entitlement/pool;
  transfer lỗi giữ quyền; replay không duplicate và không trộn deployment.
- [ ] T01–T18 có kết quả và bằng chứng; mọi lỗi chặn tiền/quyền/state/replay đã xử lý.
- [ ] Nghiệm thu MetaMask/người dùng được thực hiện và ghi nhận; không bỏ qua case
  còn thiếu để đánh dấu goal hoàn thành.
- [x] Có báo cáo kết quả, giới hạn, cách chạy lại và hướng dẫn vận hành local.

Bằng chứng ngày2026-10-09: [acceptance](./docs/workflow-b-acceptance.md),
[progress](./docs/PROJECT_PROGRESS.md), [runbook](./docs/workflow-b-local-runbook.md).
Hai campaign đã chạy bằng HTTP/RPC tự động. Các mục đã kiểm ở trên không thay
nghiệm thu con người còn thiếu.

Build thành công hoặc phần tự động PASS chỉ là mốc tiến độ. Nếu còn chờ quyết
định, thao tác người dùng hoặc điều kiện môi trường, báo đúng phần còn thiếu;
không gọi toàn bộ goal hoàn thành hoặc hệ thống sẵn sàng dùng tiền thật.
