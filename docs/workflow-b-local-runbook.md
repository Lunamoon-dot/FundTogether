# Chạy và nghiệm thu Workflow B local

> 2026-10-09. B-D01–B-D10 đã duyệt cho pilot. Code và kiểm thử tự động không thay
> nghiệm thu MetaMask/người phản biện. Không dùng môi trường này cho tiền thật.

## Mở đúng môi trường

Chạy từ repository root bằng PowerShell:

```powershell
& backend/scripts/workflow-b/start-services.ps1
node frontend/scripts/advance-manual-setup.mjs
```

Nếu cần tài khoản và bản nháp mẫu, chạy thêm
`node backend/scripts/workflow-b/seed-local.cjs`. Bỏ qua bước này khi đã dùng
tài khoản tự đăng ký. Seed không tự liên kết ví hoặc nạp token.

Sau khi đã build backend, có thể dùng `start-services.ps1 -SkipBuild`. Helper
kiểm deployment trước khi dùng listener có sẵn, không mở node thứ hai. Nếu báo
pending hoặc identity mismatch, đọc log/handle hiện tại; không reset hoặc mở
thêm node. Docker Desktop, WSL Ubuntu-24.04, Foundry và dependencies phải có sẵn.

| Thành phần | B | Baseline A được giữ riêng |
|---|---|---|
| Giao diện | http://localhost:5174 | 5173 |
| API / Swagger | http://localhost:3001 /docs | 3000 |
| Chain / RPC | 31338 / http://127.0.0.1:9547 | 31337 /8545 |
| PostgreSQL | 5434 /fundtogether_workflow_b | 5432 |
| MinIO | 9100 /console9101 | 9000 |
| Bucket | fundtogether-workflow-b-private | Bucket A |
| Cookie | ft_workflow_b_session | ft_session |

Dùng origin `localhost:5174` cho đăng nhập/SIWE. Manifest hiện tại nằm trong
`.local/workflow-b/generated/deployment.local.json`; preflight đối chiếu
chain/genesis/anchor/deployment, ABI/policy, API/storage/indexer và manifest FE.
Đọc `.local/workflow-b/manual-preflight.json` để lấy địa chỉ token/contract và
network đúng lượt chạy. Token thử nghiệm có6 decimals.

## Tài khoản và ví

Seed tạo hoặc tái sử dụng **tài khoản synthetic**, quyền và draft G1/G2.
Ví phải được người thao tác chọn rồi liên kết bằng SIWE trên31338:

| Vai trò | Chọn ví | Quyền |
|---|---|---|
| resolver | Đúng địa chỉ resolver trong manifest | RESOLVER, ký quyết định |
| organizer | Ví do người thao tác chọn và liên kết | OWNER của tổ chức pilot |
| donorA | Ví riêng do người thao tác chọn và liên kết | USER, góp/claim theo ví |
| donorB | Ví riêng do người thao tác chọn và liên kết | USER, góp/claim theo ví |
| staff | Không cần ví cho xác minh off-chain | ADMIN, xác minh tổ chức off-chain |

Thông tin đăng nhập do seed tạo nằm trong **file ignored local**
`.local/workflow-b/manual-accounts.json`. Không copy file này vào báo cáo, ảnh,
chat hoặc commit. Tài khoản smoke lịch sử vẫn được giữ; seed không reset mật
khẩu, ký thay hoặc gán lại ví của account khác. Địa chỉ lưu trong seed cũ chỉ
là dữ liệu lịch sử, không xác nhận chủ tài khoản đang dùng ví đó.
Ví thử nghiệm cần được người dùng cấu hình trong extension bằng cơ chế local
Anvil của họ; không đưa private key/seed phrase vào source hoặc báo cáo.

Seed tạo hai **draft chưa freeze** G1/G2; chạy lại giữ account, vai trò, liên kết
đang có và draft. Nạp MockUSDC riêng sau khi xác định ví thật sự được chọn cho
từng tài khoản. Đăng nhập tài khoản độc lập với Connect Wallet: mở Tài khoản,
chọn ví và bấm Liên kết ví ngoài, ký rồi kiểm tra ví xuất hiện trong danh sách.
Organizer chọn tiếp ví đại diện trong tổ chức trước freeze. Trước giao dịch,
xem địa chỉ liên kết, mạng31338 và `required wallet`. ADMIN không tự có quyền resolver.

Ngày2026-10-09 đã sửa lỗi seed giữ các ví Anvil mặc định trong tài khoản giả,
khiến người dùng mới gặp HTTP409 sau khi ký thành công. Năm liên kết seed được
sao lưu rồi gỡ trong B; account, password và lịch sử campaign giữ nguyên.
Không bỏ kiểm tra chữ ký hoặc cho phép chiếm ví của một tài khoản khác.

## Hành trình người dùng cần ghi nhận

Xem [hướng dẫn kiểm thử chi tiết](./workflow-b-manual-test-guide.md) để có thứ tự
từng tài khoản, số dư kỳ vọng, điểm dừng theo deadline và mẫu ghi PASS/FAIL.

1. Staff đăng nhập → nội bộ/tổ chức → ghi xác minh có căn cứ, phạm vi, giới hạn,
   thời hạn. Organizer tự xác minh phải bị chặn.
2. Organizer → tổ chức pilot/workspace → mở G1 → kiểm ngân sách2200,100 suất và
   phạm vi trao qua đơn vị → freeze → ký submit. Chờ receipt và indexed.
3. Resolver → queue → kiểm plan/verification → ký approve; organizer ký publish.
4. DonorA/B mỗi ví góp1100. Approve đúng số tiền là bước riêng; sau receipt
   allowance mới bấm donate. Đóng góp phải có event và indexed.
5. Resolver xác nhận cấp đầu từ xác minh còn hiệu lực. Organizer claim2200 đúng
   một lần. Escrow G1 lúc này0; chưa nghiệm thu hoạt động.
6. Organizer nhập báo cáo/chi phí, upload từng loại hồ sơ và liên kết tiêu chí.
   Freeze hồ sơ; tải bản đã che riêng cho mỗi file gốc, xác nhận công khai; ký
   submitEvidence. Save/upload/freeze chưa là submit chain.
7. Resolver đọc original/public cùng nguồn đối chiếu, đánh giá từng tiêu chí và
   campaignSpent. MET chỉ khi đủ căn cứ; thiếu/chưa rõ dùng bổ sung/INCONCLUSIVE.
8. Donor xem bản công khai; original không được mở. Sau hết cửa sổ phản đối và
   đã thực trả đủ unused, finalize. Không có payout lần hai tại finalize.
9. G2: ba đợt1100,50 suất mỗi đợt. Chỉ claim đợt sau khi đợt trước FINALIZED và
   unused đã trả đủ. Đợt cuối cũng phải nghiệm thu thực chất.
10. Thử STOP sau G2 đợt2, quỹ gốc1100; G1 sau advance toàn bộ có quỹ gốc0.
    Claim hai donor, trả lại muộn, claim phần bổ sung; ghi số tiền từng ví.

Ghi riêng: từ chối popup, popup chờ lâu, reload khi tx pending, đổi account/ví,
mạng sai, tx thay thế/hủy và indexer chậm. Không đánh dấu PASS nếu chỉ có tx hash.
Người dùng tự ký hoặc từ chối extension; agent không ký thay và không suy diễn
PASS từ test Viem. Lưu tx hash/block/event và kết quả UI, không lưu khóa/token.

Mỗi thao tác nghiệm thu có thể ghi vào bản local hoặc gửi trong chat theo mẫu:

```text
Case: Txx / G1 hoặc G2 / bước:
Người thao tác, ngày giờ có múi giờ:
Browser + phiên bản MetaMask:
Account role / địa chỉ ví đang kết nối / chainId:
DeploymentId / campaignId / stage / evidence version:
Trạng thái và số tiền trước thao tác:
Thao tác đã thực hiện (ký / từ chối / reload / đổi ví...):
Kết quả popup và UI thực thấy:
Tx hash (hoặc KHÔNG CÓ HASH):
Receipt status / block hash / event / checkpoint indexed:
Trạng thái và số tiền sau thao tác:
PASS / FAIL / CHƯA KIỂM; lý do và ảnh đã che dữ liệu nhạy cảm:
```

Nếu từ chối popup trước khi gửi, không tự điền receipt/indexed là PASS; ghi
không có giao dịch. Nếu chỉ chưa thấy hash, ghi chưa xác định và kiểm ví/lịch sử
trước khi gửi lại. Agent có thể đối chiếu receipt/indexer sau khi bạn thao tác,
nhưng không tự điền kết quả popup, thời gian người dùng hoặc quyết định reviewer.

Thời hạn dùng **chain timestamp**. Helper không tự đổi giờ RPC9547. Kịch bản
tự động tăng giờ chỉ ở node kiểm thử9548 rồi hủy node đó. Với nghiệm thu ví trên
9547, chờ thời hạn thật hoặc chốt riêng một phiên thử thời gian có phạm vi rõ ràng;
không thay đổi nghĩa vụ các campaign đang tồn tại để làm test nhanh.

## Hồ sơ reviewer và kết quả nghiên cứu

```powershell
python backend/scripts/workflow-b/reviewer-fixtures.py
python backend/scripts/workflow-b/verify-reviewer-fixtures.py
python backend/scripts/workflow-b/reviewer-results.py
```

Dùng Python có reportlab, Pillow, pypdf, pdfplumber, pypdfium2. Đã chạy bằng
runtime Python bundled của Codex. Bộ dùng chính thức cho lượt chuẩn bị này là
`.local/workflow-b/reviewer-corpus-v3/reviewer/`:12 mã trung tính, PDF/PNG và
catalog hash/current deployment. v1/v2 là bản nháp QA cục bộ, không đưa reviewer.

Chỉ giao thư mục `reviewer/` và mẫu `reviewer-decisions.csv` cho người đánh giá;
giữ `evaluator-reference.json` ngoài gói giao. Mẫu CSV chưa có quyết định.
Ảnh là **minh họa synthetic**, không phải ảnh hiện trường. Bảng nhãn do tác giả
fixture định trước và chưa được đánh giá độc lập. Việc đánh giá là kiểm tính nhất
quán của tình huống giả, không đo khả năng xác minh hoạt động ngoài đời.

Các file là input để upload; server mới tạo package schema0.2 với campaign,
stage/version/planHash hiện tại khi freeze. Không đưa hash catalog input lên
contract thay cho hash package. PLAN/SOURCES là tài liệu tham chiếu; REPORT,
INVOICE, PAYMENT_PROOF, DELIVERY_RECORD và PHOTO upload theo loại tương ứng.

Sau khi người đánh giá hoàn thành, ghi mã reviewer, outcome/lý do/nguồn/giới hạn
cho từng criterion, thời gian bắt đầu/kết thúc và tính độc lập. Mẫu thiếu không
được tính là dự đoán đúng/sai. Báo cáo false acceptance tách khỏi contract
correctness; một quyết định sai ngoài đời vẫn có thể là giao dịch chain hợp lệ.

Sau khi điền CSV, chạy `reviewer-results.py` để ghi ignored `reviewer-results.json`.
Có thể truyền `--decisions <path>` cho bản người đánh giá gửi lại. Mỗi quan sát
cần C1–C4 và OVERALL có outcome/reason/sources/limits, giờ ISO có múi giờ và
`independent_reviewer=true|false`. Dòng thiếu được ghi partial, không vào mẫu số;
trùng reviewer/sample/criterion bị từ chối. Kết quả chỉ đối chiếu nhãn synthetic
của tác giả, không tự trở thành nhãn thật được xác nhận độc lập.

## Chạy lại kiểm thử tự động

Không chạy nhiều smoke cùng môi trường B đồng thời:

```powershell
node backend/scripts/workflow-b/journey-smoke.cjs
node backend/scripts/workflow-b/journey-smoke.cjs --failures
node backend/scripts/workflow-b/journey-smoke.cjs --waiting
node backend/scripts/workflow-b/recovery-smoke.cjs
node backend/scripts/workflow-b/comparison-smoke.cjs
node frontend/scripts/advance-wallet-rpc-smoke.mjs
node backend/scripts/workflow-b/acceptance-report.cjs
```

Journey tạo **fork9548**, inject client đó vào Nest test app ở cổng ngẫu nhiên,
dùng transaction DB rollback và dọn đúng file test đã upload. Report receipt
của fork không truy vấn lại trên9547 sau khi fork đã dừng. Test so calldata,
actor/events/checkpoint, balance và projection trong lúc fork còn sống.
Sender unlocked dùng estimate gas +20%; luôn kiểm receipt và ghi gasUsed,
không retry một giao dịch chưa rõ kết quả. `--waiting` kiểm nhánh hết hạn/version
và return tiền dư trước đóng. Comparison triển khai A/B mới trong cùng lab,
không gọi môi trường A; số gas/giả định ở acceptance.

Recovery copy snapshot B đã ghi atomic, `pg_dump` B rồi restore vào **database
mới có tên riêng**, bucket riêng và Anvil9548 riêng. Kiểm cả cold restore,
reset trống cùng chain ID, giữ checkpoint, restart/RPC lag và file mất/khôi phục.
Chỉ dọn DB/bucket/node do chính lượt test tạo; backup giữ trong ignored
`.local/workflow-b/recovery/run-*/`. Backup chứa dữ liệu tài khoản/private files;
không publish hoặc commit. Không dùng `down -v`, prune hay restore đè B/A.

## Snapshot và xử lý sự cố

State chain B gốc nằm trong WSL:
`~/.local/state/fundtogether/workflow-b/anvil/state.json`; backup Windows:
`.local/workflow-b/anvil/state.json`. Supervisor ghi pending, kiểm cấu trúc,
promote atomic và giữ previous. Không xóa snapshot hỏng; giữ để phân tích và
đối chiếu genesis/code/anchor/deployment trước phục hồi.

Log API/web/chain và handle service ở `.local/workflow-b/`. Không dừng theo tên
`node`/`anvil` chung. Nếu cần dừng service đã tạo, đối chiếu PID, start time và
command line của handle đó trước; process có sẵn được reuse không thuộc helper.
Health ready chứng minh tầng kỹ thuật đang khớp, không chứng minh hồ sơ là thật.

## Tiến độ và phần chưa nghiệm thu

[Acceptance](./workflow-b-acceptance.md) và [progress](./PROJECT_PROGRESS.md)
ghi evidence cụ thể. G1/G2 và các nhánh refund/case đã có kiểm thử HTTP/fork;
recovery và so sánh contract A/B có kiểm soát đã PASS. Manual MetaMask, kết quả
reviewer và các phần T01–T18 chưa có evidence vẫn cần hoàn thành trước khi đóng GOAL.
