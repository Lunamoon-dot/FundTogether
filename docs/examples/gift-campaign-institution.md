# G1 — một đợt mua quà và bàn giao qua đơn vị

> 2026-10-09. SYNTHETIC; [spec B](../workflow-b-spec.md) đã duyệt cho pilot.
> Artifact/hash DRAFT đã freeze giữ nguyên như dữ liệu chuẩn bị lịch sử.
> Không phải khảo sát, chi phí thật hoặc quyền cấp tiền đã được duyệt.

## 1. Kế hoạch và điểm hoàn thành

Tổ chức Mẫu A mua, kiểm, vận chuyển và bàn giao 100 suất tới Trường Mẫu A.
Mỗi suất gồm 2 kg gạo, 1 lít dầu và 5 gói mì theo checklist cố định. Đơn vị nhận
có đầu mối giả `Synthetic Authorized Contact A`, được kiểm tra trong registry
giả trước khi resolver duyệt. Đại diện khác không được mặc định có thẩm quyền.

**Điểm hoàn thành là trường nhận đủ hàng**, không tuyên bố từng học sinh đã nhận.
Nếu muốn nghiệm thu tới học sinh, phải chốt phạm vi/chứng từ khác trước funding;
không sửa tiêu chí sau khi donor đã góp. Trong mẫu này người thụ hưởng cuối không
cần ví, người ký trường không có quyền nhận vốn contract hoặc quyết định MET.

| Khoản | MockUSDC hiển thị | Base unit |
|---|---:|---:|
| 100 suất × 20 | 2.000 | 2000000000 |
| Vận chuyển | 200 | 200000000 |
| Một đợt / goal | 2.200 | 2200000000 |
| Donor A / B | 1.320 / 880 | 1320000000 / 880000000 |

Task mua → kiểm hàng → vận chuyển → bàn giao dùng chung một advance 2.200.
Thực hiện trong 30 ngày kể từ advance; nộp lần đầu trước hạn này. Các hạn review,
bổ sung, case/return/finalize theo spec; hard stop 60 ngày. Funding fixture 7 ngày.
Thời gian theo policy pilot đã duyệt; test chạy được không chứng minh phù hợp thực tế.

## 2. Rubric nghiệm thu

| Criterion | Điều kiện đạt | File / nguồn đối chiếu | Người kiểm / giới hạn |
|---|---|---|---|
| G1-C1 | Đủ 100 suất, đúng thành phần tối thiểu | inventory, delivery, ảnh minh họa đối chiếu; nhà cung cấp | Resolver đối chiếu số lượng/đơn vị; ảnh riêng lẻ chưa đủ |
| G1-C2 | Mua và chi trong đúng đơn vị, nguồn campaign; phần tự bù ghi riêng | invoice, payment-proof, budget; đối chiếu đơn giá và tổng | Resolver kiểm số học, nguồn chứng từ; file giả không là giao dịch thật |
| G1-C3 | Trường đúng kế hoạch nhận hàng; người ký có thẩm quyền | delivery và contact-check; registry/đầu mối được kiểm trước | Resolver kiểm nguồn và thẩm quyền, không suy bàn giao trường thành nhận tới học sinh |
| G1-C4 | Báo cáo campaignSpent + unused = advance; unused đã return thực nhận | budget và event return khi triển khai B | Resolver xác định U; contract kiểm received R >= U khi finalize, report chưa phải cash |

Các file gốc ở `original/`; công khai ở `public/`, bỏ contact và danh sách
recipient giả. Repo chỉ có dữ liệu synthetic; tên thư mục không thực thi quyền
truy cập như object storage. Không tải original fixture lên endpoint public.

## 3. Hồ sơ và biến thể có nhãn tham chiếu

Sau chạy generator, xem [catalog](./fixtures/workflow-b/catalog.json).
Mỗi package có invoice, payment-proof, inventory, delivery, contact-check, budget
và SVG stand-in cho ảnh; biến thể thiếu invoice chủ động không có file đó.
SHA-256 của file/manifest tính từ bytes được lưu, UTF-8 không BOM; không có URL ký.

| Package | Nhãn trước thử nghiệm | Điểm reviewer phải phát hiện |
|---|---|---|
| G1-pass | MET | 100 suất/đúng nội dung/đúng trường/người ký; chi 2.200 |
| G1-missing-invoice | NEEDS_INFORMATION | Thiếu nguồn đối chiếu mua, không đủ chỉ vì số lượng đủ |
| G1-wrong-signer | NOT_MET | Đủ file nhưng người ký không có trong registry giả |
| G1-shortage | NOT_MET | Chỉ 90/100 suất; không sửa nhãn để nghiệm thu đạt |
| G1-overspend | NEEDS_INFORMATION | 2.250 khai từ campaign 2.200; cần tách chứng từ nguồn tự bù |
| G1-surplus | MET_CONDITIONAL_RETURN | Chi 2.150, U=50; kết quả đạt nhưng chưa đủ điều kiện finalize tới khi return thực nhận |
| G1-inconclusive | INCONCLUSIVE | Authority/contact không thể xác nhận; không auto MET |
| G1-reused-photo | INCONCLUSIVE | Ảnh từ campaign G2 được dùng cho G1; cần đối chiếu provenance |

`G1-surplus` là frozen version 2 tham chiếu `G1-pass` version 1 để minh họa giữ
bản cũ; không có chain submission/review của version 1 trong fixture. Hai bộ
không phải lịch sử on-chain đã được MET rồi tự sửa thành chi phí khác.
Nhãn do rubric synthetic định trước, nằm riêng trong reference-labels. Các key
fixture có tên mô tả nên có thể gợi nhãn: trước thử reviewer phải tạo bundle mới
với ID trung tính và hash mới, chỉ gửi manifest/documents, evaluator giữ nhãn.
Không gọi đây là nhãn của chuyên gia độc lập. Ảnh là minh họa. Bộ PDF/PNG mã
trung tính hiện đã chuẩn bị riêng tại `.local/workflow-b/reviewer-corpus-v3/`;
quyền original/redacted và pipeline upload đã có test tích hợp. Dataset lịch sử
ở đây giữ nguyên bytes/hash; không đưa key mô tả biến thể cho reviewer.

## 4. Trace thành công/thất bại

| Bước | A đã cấp | R thực nhận | E còn giữ | Ai thực hiện / ý nghĩa |
|---|---:|---:|---:|---|
| Funding đủ 2.200 | 0 | 0 | 2.200 | Donor A/B góp; resolver confirm eligibility đầu |
| Advance đợt 0 | 2.200 | 0 | 0 | Organizer ký; contract chuyển một lần |
| Report/MET/đợi phản đối | 2.200 | 0 | 0 | Organizer nộp, resolver xét; không transfer |
| Final acceptance, không dư | 2.200 | 0 | 0 | Caller finalize; COMPLETED, P0=0 |

Ngay sau advance escrow donor bằng 0. Nếu sai người ký/không làm/quá hạn và
STOP, P0=0 khi chưa có return. Donor không thể đòi 2.200 từ escrow trống.
Nếu organizer thực sự return 50 **trước snapshot**, R=50/E=50/P0=50; donor A
claim30/B20 rồi E=0. Nếu return sau snapshot zero pool, P0 giữ0 và S=50, hai
ví có supplement30/20. Sự thay đổi cash cần tx, không phải dòng report.

Case thành công có dư: kết quả đạt, chi2.150/U50 → chưa finalize → return50
→ hết challenge/case → COMPLETED/P0=50 → donor claim30/20. Thiếu return trước
finalizationEnd dẫn STOP; return muộn vẫn được tiếp nhận theo policy đã duyệt.

Các số trong bảng là giả định hiển thị. [accounting-traces](./fixtures/workflow-b/accounting-traces.json)
lưu base unit và từng action. Trace không kiểm deadline, quyền ký hoặc token.

## 5. Kết quả chuẩn bị

- DONE: plan/checklist, tài liệu synthetic có bytes/hashes, rubric và trace.
- DONE: B-D01–B-D10 được người dùng duyệt cho local pilot.
- DONE: contract/BE/FE B có code/test; G1 qua HTTP/SIWE/files/chain/indexer đã
  COMPLETED, advance2200 một lần và finalize không payout thêm. STOP sau advance
  có base0; thực return50 trước snapshot mở base50; return sau snapshot mở
  supplement50. Case unused50 phải return thật trước COMPLETED đã PASS.
- DONE chuẩn bị: PDF/PNG synthetic mã trung tính, runbook và mẫu CSV reviewer.
- TODO: xác thực/kiểm tra người thật, G1 manual MetaMask và reviewer experiment.

Report kỹ thuật nằm trong `.local/workflow-b/journey-report.json`,
`failure-journey-report.json` và `waiting-journey-report.json`; xem
[acceptance](../workflow-b-acceptance.md) / [runbook](../workflow-b-local-runbook.md).
Các lượt HTTP này dùng donor50/50 (1100 mỗi ví), nên return50 chia25/25. Bảng
ví dụ phía trên giữ donor60/40 (1320/880), tương ứng30/20. Cả hai dùng cùng công
thức entitlement; không lấy số chia của một cấu hình làm bằng chứng cho cấu hình
khác. Receipt của fork được kiểm trước khi dừng node; không là giao dịch MetaMask
hoặc receipt có thể tra lại trên chain B gốc.
