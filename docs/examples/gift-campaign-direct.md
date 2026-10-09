# G2 — ba đợt mua quà và trao trực tiếp

> 2026-10-09. SYNTHETIC; [spec B](../workflow-b-spec.md) đã duyệt cho pilot.
> Artifact/hash DRAFT đã freeze giữ nguyên như dữ liệu chuẩn bị lịch sử.
> Khác G1 ở điểm hoàn thành và nguồn bằng chứng; cùng quy tắc accounting B đã duyệt.

## 1. Kế hoạch, ngân sách và lịch

Tổ chức Mẫu A thực hiện ba lịch trao riêng cho ba nhóm thụ hưởng giả. Mỗi đợt
50 suất; mỗi suất 2 kg gạo, 1 lít dầu và 5 gói mì. Eligibility: hộ trong nhóm
mẫu được đánh dấu đủ điều kiện trước funding, một suất/hộ/đợt; không tự dùng
wallet làm bằng chứng eligibility hoặc bắt người nhận tạo ví. Đây là tiêu chí
controlled fixture, việc xác định nhóm cần được kiểm chứng ngoài đời sau này.

**Điểm hoàn thành là trao tới người nhận đủ điều kiện**. Biên bản một đơn vị nhận
kho hàng không đủ. Các nhóm/lịch độc lập, stage 2/3 chỉ mở sau finalized stage
trước. Mỗi stage có 30 ngày thực hiện từ advance, hard stop60 ngày; funding7
ngày. Khoảng thời gian theo policy pilot đã duyệt, chưa có đo đạc nhu cầu thực tế.

| Đợt | Suất × đơn giá | Vận chuyển | Budget | Base unit |
|---|---|---:|---:|---:|
| 0 — nhóm Mẫu1 | 50 × 20 = 1.000 | 100 | 1.100 | 1100000000 |
| 1 — nhóm Mẫu2 | 50 × 20 = 1.000 | 100 | 1.100 | 1100000000 |
| 2 — nhóm Mẫu3 | 50 × 20 = 1.000 | 100 | 1.100 | 1100000000 |
| Goal | 150 suất | 300 | 3.300 | 3300000000 |

Donor A góp1.980/B1.320 (60%/40%). Task mỗi đợt: mua, kiểm hàng, vận chuyển,
trao trực tiếp; task không tự nhận advance. Không dùng unused đợt trước để tăng
budget đợt sau; budget đã được chốt.

## 2. Checklist từng đợt

| Criterion | Điều kiện và nguồn | Reviewer / giới hạn |
|---|---|---|
| G2-C1 | 50 suất đủ thành phần; inventory, delivery, ảnh riêng đúng stage | Resolver kiểm count/content, stage và lịch; file stage0 không chứng minh stage1 |
| G2-C2 | Đơn giá/tổng campaign cost trong 1.100; invoice, payment-proof, budget | Resolver đối chiếu cùng MockUSDC6; nguồn tự bù tách riêng |
| G2-C3 | Danh sách 50 recipient giả đúng eligibility, không duplicate trong stage; record trao và kiểm tra mẫu10/50 | Resolver kiểm record đầy đủ và mẫu đã chốt; không tuyên bố mẫu10 chứng minh mọi50 |
| G2-C4 | Chi+unused = advance; unused cần actual return trước finalize | Resolver xác nhận U theo bằng chứng; contract kiểm R thực nhận, không đọc sự thật hóa đơn |

Phương pháp mẫu fixture: recipient1,6,11,…,46 ở mỗi nhóm; identifier mang prefix
`SYNTHETIC-G2-stage`. Danh sách đầy đủ trong original, bản public chỉ có count,
scope, nguồn và giới hạn. ID là giả, không phải người thật, không có số điện
thoại/tài khoản thực. Phương pháp chọn mẫu này tái lập nhưng có thể dự đoán,
chưa chống organizer lựa chọn dữ liệu để qua mẫu; đánh giá thực địa là TODO.

## 3. Hồ sơ riêng từng đợt và reuse

[Catalog](./fixtures/workflow-b/catalog.json) có `G2-stage-1-pass`,
`G2-stage-2-pass`, `G2-stage-3-pass` (tên hiển thị1–3, stage index0–2).
Mỗi package riêng context/hash cho plan/policy/criteria/stage/version, invoice,
payment-proof, inventory, delivery, contact-check, budget và SVG minh họa riêng.
Original/public có manifest và hash riêng; không mang danh sách recipient vào public.

`G2-stage-2-reused-photo` vẫn tự khai stage1 nhưng ảnh có đúng bytes/hash stage0.
Nhãn INCONCLUSIVE: reviewer đối chiếu provenance/các tài liệu khác, không kết
luận gian lận chỉ từ duplicate hash. T06 còn phải thử replay sai technical binding
ở contract sau duyệt; việc hash trùng bytes là bài tập nội dung khác với replay.

Các biến thể thiếu invoice/sai signer/thiếu số lượng/overspend được chuẩn bị ở
G1 theo cùng rubric; áp dụng yêu cầu bổ sung/case cho G2 không được cấp lại budget
đợt đang xét. Một version mới tham chiếu bản trước, mọi hạn vẫn bị hard stop cap.
Fixture chưa mô phỏng tx resubmit hoặc bộ giới hạn version trên chain.

## 4. Trace thành công

| Bước | A tích lũy | E | Điều kiện / actor |
|---|---:|---:|---|
| Funding3.300 | 0 | 3.300 | Donor góp, resolver confirm eligibility đầu |
| Claim stage0 | 1.100 | 2.200 | Organizer, đúng budget/window |
| Finalize stage0 | 1.100 | 2.200 | Đạt + hết phản đối + case đóng + unused return; không transfer |
| Claim stage1 | 2.200 | 1.100 | Organizer, stage0 finalized |
| Finalize stage1 | 2.200 | 1.100 | Nghiệm thu thực chất, không transfer |
| Claim stage2 | 3.300 | 0 | Organizer, stage1 finalized |
| Finalize stage2 | 3.300 | 0 | Nghiệm thu cuối → COMPLETED/P0=0 |

Ảnh/chữ ký/hash không làm giảm cash exposure sau advance. Nếu nghiệm thu sai
lặp lại cả ba đợt, tổng tổn thất có thể bằng3.300; budget1.100/đợt không tự tạo
giới hạn tổn thất tổng1.100. Reviewer experiment cần ghi false accept riêng.

## 5. Trace bổ sung, STOP và return muộn

Đã cấp stage1 nhưng thiếu hồ sơ → NEEDS_INFORMATION → new version trong hạn
→ resolver review lại. A vẫn2.200, E vẫn1.100; không claim budget stage1 lần hai.
Chỉ khi đạt và finalized mới mở stage2. Thiếu quá hạn/NOT_MET/case STOP/reviewer
vắng → STOP, không dùng donor im lặng để mở stage2.

STOP sau cấp stage1, chưa return: C3.300/A2.200/R0/E1.100; P0=1.100. A claim660,
B claim440; E0. Khoản2.200 đã ra organizer không nằm trong refund được bảo đảm.

Nếu organizer return110 của stage1 sau khi cả hai ví claim base: R110/E110,
P0 vẫn1.100, S110. A nhận supplement66/B44 rồi E0; không đổi outcome STOP hoặc
cho nhận stage2. Return muộn tới ví đã claim trước vẫn còn quyền mới theo S.

Files trace chứa action và số dư base unit; trace `accept` giả định finalized
review. Phiên bản/bổ sung/case/deadline cần test contract, chưa được tool số học
mô phỏng. Không gọi trace này là hành trình tích hợp đã PASS.

## 6. Chuẩn bị và giới hạn

- DONE: plan/checklist, hồ sơ/hash riêng từng stage, case reuse và trace số dư.
- DONE: B-D01–B-D10 được người dùng duyệt cho local pilot.
- DONE: contract unit/fuzz/invariant và BE/FE tests; G2 qua HTTP/SIWE/files/
  chain/indexer đã COMPLETED với ba advances1100. NEEDS_INFORMATION→version2
  không cấp lại budget; đợt cuối vẫn cần review/finalize, không payout lần hai.
- DONE: STOP sau đợt2 có A2200/P01100; actual return50+110 sau snapshot không
  đổi P0 và tạo quyền bổ sung cho donor đã claim base. CONTINUE/RESUBMIT/STOP,
  giới hạn version, timeout và replay/recovery có bằng chứng tự động.
- DONE chuẩn bị: PDF/PNG synthetic mã trung tính và mẫu CSV reviewer.
- TODO: nhãn tham chiếu độc lập, reviewer test che nhãn và manual MetaMask.

Xem [acceptance](../workflow-b-acceptance.md) và
[runbook](../workflow-b-local-runbook.md) để tái lập và xem giới hạn. Report HTTP
G2 dùng donor50/50 (1650 mỗi ví): base1100 chia550/550, late return110 chia55/55.
Ví dụ/trace lịch sử ở trên dùng60/40, tương ứng660/440 và66/44; giữ nguyên input
khi đối chiếu entitlement. Hồ sơ HTTP là probe định dạng; corpus reviewer có
nội dung đọc được riêng. Cả hai vẫn synthetic, chưa là nghiệm thu của con người.
