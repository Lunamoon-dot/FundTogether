# Checklist nghiệm thu MVP bằng trình duyệt

Ngày: 2026-10-06. Các bước dưới đây là hướng dẫn, chưa phải kết quả đã test
MetaMask. Kiểm thử tự động được ghi riêng trong PROJECT_PROGRESS.md.

## Điều kiện trước khi bắt đầu

Ngày 2026-10-07, người dùng cho phép bỏ toàn bộ campaign/chain test, giữ tài
khoản và tổ chức. Ứng dụng đã deploy FundTogetherMvp trên RPC 8545; các campaign
cũ đã bị xóa, không được chuyển quyền hay tiền sang contract mới. Tạo campaign
mới để chạy A/B và C1–C6. Kết quả A/B trên prototype là lịch sử, không chứng minh
deployment mới đã đạt. Kiểm tra MinIO hoạt động trước bước upload bằng chứng.
Nếu UI báo phiên bản chưa hỗ trợ, kiểm tra manifest/RPC; không sửa state DB để vượt điều kiện.

Smoke milestone sở hữu Anvil 9545, tài khoản/API/fixture riêng và dọn sau khi
chạy. PASS của smoke không để lại một môi trường trình duyệt đang chạy.
Một môi trường MVP dùng cho kiểm tra MetaMask cần được chuẩn bị riêng trước.

### Danh tính

| Ký hiệu | Tài khoản | Ví |
|---|---|---|
| O | OWNER của tổ chức | Ví đại diện tổ chức, không phải resolver |
| R | RESOLVER, không thuộc tổ chức và không góp vào campaign | Ví resolver của deployment, liên kết SIWE |
| A | USER/donor | Ví donor A, khác O/R |
| B | USER/donor | Ví donor B, khác O/R/A |

Dùng lại bốn account đã có nếu đúng các điều kiện; không cần tạo mới mỗi case.
Mỗi ví chỉ liên kết một account. Khi đổi account ứng dụng, kiểm tra cả địa chỉ
trong nút kết nối của trang và chain. Không chỉ nhìn account đang mở ở extension.
O/A/B cần đủ MockUSDC của đúng deployment; mọi ví ký cần ETH gas.
Cùng chain ID 31337 chưa đủ: RPC trong ví phải trỏ đúng chain thử và token/
contract phải khớp deployment mà BE/FE đang dùng.

### Mẫu campaign dùng chung

Mỗi nhánh C dùng campaign mới có tên C1/C2/... để không lẫn state:

- Goal 20 MockUSDC; milestone 1 budget 8, milestone 2 budget 12.
- Có tiêu chí nghiệm thu cụ thể, ví dụ "bàn giao 8 bộ dụng cụ, có ảnh và biên bản".
- Bond 12. Funding deadline đủ xa theo thời gian chain để hoàn thành setup.
- O tạo/lưu/chốt hồ sơ, nộp và khóa bond; R duyệt; O công bố.
- A góp 8, B góp 12. Sau receipt và index: FUNDED, tổng 20, đóng góp tiếp bị chặn.
- O kích hoạt milestone 1. Sau index: MILESTONE_ACTIVE.
- O lưu báo cáo và file gốc, đóng băng; viết kết quả công khai từng tiêu chí,
  chọn file đã che thông tin, xác nhận và chốt bản công khai. Xem lại file/hash.
- O ký nộp. Upload/freeze/prepare không phải submission; chỉ sau receipt/index
  mới là EVIDENCE_PENDING. R vào `#/internal/milestones`, kiểm tra bản công khai
  và bản gốc, ghi nhận xét, chọn tiếp nhận. Sau index: IN_REVIEW, review 72 giờ.

Nếu đã hoàn tất bước nào, không ký lại để "cho chắc". Mọi giao dịch phải phân biệt:
chờ ví -> hash đã gửi -> receipt thành công -> event canonical đã index.

## A/B — hồi quy ngắn trên ứng dụng hiện tại

Hai luồng này người dùng đã thử thành công; chỉ cần thử lại nếu muốn kiểm tra
thay đổi giao diện hoặc sau khi chuyển deployment.

### A. Organizer hủy lúc đang FUNDING

Campaign mới goal 20, budgets 8/12; A góp 6, B góp 4. O xác nhận và ký hủy.
Sau index: CANCELLED, refund pool 10; A/B nhận 6/4 về chính ví đã góp, một lần.
Prototype trả bond trong giao dịch hủy; MVP tạo credit để O claim riêng.

### B. Thiếu goal khi hết funding deadline

Campaign khác cùng goal; A/B góp 6/4. Đến hạn theo timestamp chain:
donation phải bị chặn, nhãn giải thích đang chờ chốt thất bại. Ví liên kết đủ
gas ký chốt. Sau index: FUNDING_FAILED, pool 10; A/B claim 6/4, không lặp lại.
Hết hạn thiếu goal không trở thành FUNDED; state không đổi bằng giờ máy đơn thuần.

## C1 — hoàn tất bình thường (ưu tiên đầu tiên trên MVP)

1. Dùng mẫu chung đến IN_REVIEW. Trước reviewEnd: thử giải ngân, nút phải chặn
   với lý do chưa hết review. Không donor nào mở phản đối.
2. Sau reviewEnd theo chain, ví liên kết đủ gas ký giải ngân milestone 1.
3. Sau index: tổ chức nhận đúng 8; totalReleased 8; chuyển sang
   MILESTONE_SETTLED, milestone hiện tại là 2. Không giải ngân milestone 1 lần nữa.
4. O kích hoạt milestone 2. Nộp gói mới theo tiêu chí milestone 2; R tiếp nhận.
5. Sau review của milestone 2, giải ngân đúng 12. Campaign COMPLETED,
   totalReleased 20, donor không có refund.
6. O claim bond riêng 12. Chờ receipt/index và kiểm tra token thực về ví O.
   Bond credit chưa phải token đã nhận; claim lần hai bị chặn.

## C2 — phản đối, resolver cho CONTINUE

1. Campaign C2 mới, theo mẫu đến IN_REVIEW milestone 1.
2. A đọc bằng chứng và ký phản đối trước reviewEnd. Sau index: CHALLENGED.
3. B bổ sung nhận xét/material; deadline không đổi. O chốt một giải trình;
   không được thay response hoặc giải ngân trong lúc case đang giữ tiền.
4. Trước responseDeadline, verdict phải bị chặn. Từ responseDeadline đến
   trước resolutionDeadline, R đối chiếu hồ sơ rồi ký CONTINUE.
5. Sau index: IN_REVIEW, vẫn cùng version/hash/reviewEnd gốc. Nếu review đã hết,
   có thể ký giải ngân bằng giao dịch riêng; CONTINUE tự nó không chuyển token.
6. A/B không mở case thứ hai cho cùng version; không có cửa sổ review mới
   tự cộng thêm 72 giờ. Khoản giải ngân vẫn là budget 8 về O.

## C3 — yêu cầu nộp lại (RESUBMIT)

1. Campaign C3 mới; mở case và qua hạn giải trình như C2.
2. R chọn RESUBMIT. Sau index: MILESTONE_ACTIVE, có 7 ngày sửa, chưa giải ngân.
3. O sửa/lưu báo cáo, chốt package mới và bản công khai mới; xem hash rồi ký
   nộp version 2. Không thay file/nội dung dưới hash của version 1.
4. R tiếp nhận version 2: IN_REVIEW, bắt đầu đầy đủ 72 giờ review mới.
   Donor vẫn xem được bản công khai của version 1 trong lịch sử.
5. Các nút/nhận xét/xác nhận cũ không được áp dụng cho version 2. Giao dịch
   của version cũ bị từ chối nếu bị giữ trong ví rồi mới gửi sau khi version đổi.
6. Tối đa ba versions; không được mở version 4. Không cần test đủ mọi lượt
   bằng tay ngay lượt đầu; giới hạn/replay có contract regression riêng.

## C4 — STOP sau giải ngân một phần (ưu tiên thứ hai)

1. Campaign C4 mới: hoàn tất milestone 1 như C1, O đã nhận 8.
2. Kích hoạt/nộp/tiếp nhận milestone 2; A mở phản đối. Qua hạn giải trình,
   R chọn STOP trước resolutionDeadline.
3. Sau index: FAILED, totalReleased vẫn 8, refund pool 12 = 20 - 8.
   Milestone 2 không trả thêm token; bond không bị slash hoặc cộng vào pool.
4. A claim: 8/20 * 12 = 4.8 MockUSDC. B claim: 12/20 * 12 = 7.2 MockUSDC.
   Tổng donor nhận 12; claim về đúng ví đã góp, không cần approve token.
5. O claim bond riêng 12. Đổi thứ tự O/A/B claim không đổi các entitlement.
6. Reload rồi thử lại: UI ghi đã nhận và không cho claim hai lần. Revert thực
   của lần claim thứ hai cần test contract, không chỉ nhìn nút disabled.

### Biến thể kiểm tra dust

Campaign riêng: budgets 1 + 2, goal 3; A góp 1, B góp 2. Giải ngân 1 rồi
STOP ở milestone 2: pool 2. A nhận 0.666666; B nhận 1.333333 MockUSDC.
Tổng paid 1.999999, dust 0.000001 giữ escrow sau cả hai claim. Trước khi cả hai
claim, phần còn lại vẫn gồm quyền chưa nhận, không được gọi toàn bộ là dust.

## C5 — không ai xử lý case, chốt timeout

1. Campaign C5 mới, mở case ở milestone 1; R không ra verdict.
2. Trước resolutionDeadline: timeout bị chặn. Tại/sau resolutionDeadline,
   A/B hoặc ví khác liên kết đủ gas ký chốt timeout.
3. Sau index: FAILED, pool 20 vì chưa giải ngân. A/B claim 8/12; bond O
   claim riêng 12. Không cần R online, không có phí/thưởng cho người chốt.
4. Chốt timeout hoặc claim lần hai bị từ chối. Hết hạn không tự giao dịch
   nếu không có caller/worker chạy; màn hình phải nêu rõ người cần thực hiện.

## C6 — hồ sơ bị yêu cầu sửa hoặc quá hạn tiếp nhận

1. Campaign C6 mới, dừng tại EVIDENCE_PENDING thay vì tiếp nhận.
2. R chọn yêu cầu sửa: ACTIVE + hạn sửa 7 ngày, chưa giải ngân. O nộp bản
   mới; bản cũ được giữ trong lịch sử, không ghi đè.
3. Dùng campaign khác cho nhánh R vắng mặt: sau admissionDeadline 72 giờ,
   ví liên kết ký chốt quá hạn tiếp nhận. Lượt nộp đã hết hạn vẫn tính.
4. Nếu chưa hết ba lượt, cho sửa theo hạn mới. Hết lượt thì FAILED và mở
   refund, không tạo version 4. Timeout/chốt lặp không thay entitlement.

## U — ví, quyền, storage và giao diện (thử xen kẽ)

| Thao tác thử | Kết quả phải thấy |
|---|---|
| Chọn ví chưa liên kết hoặc sai chain | Nêu đúng blocker; chưa gọi giao dịch |
| Đăng nhập R nhưng chọn ví A/O | Không được ký tiếp nhận/verdict bằng role DB đơn thuần |
| Organizer/donor mở màn resolver | Không được tự xét campaign có xung đột lợi ích |
| Người chưa góp thử phản đối hoặc claim | Không có quyền của donor |
| Donor tải bản gốc | Bị chặn; donor chỉ đọc bản công khai đã nộp |
| R đọc bản gốc | Được khi đủ quyền; có access audit |
| Từ chối popup ký | Không báo thành công, thoát trạng thái bận; có thể đối chiếu/thử lại |
| Ví không trả lời, timeout hoặc dừng chờ | Không gửi yêu cầu ký trùng trong lúc extension còn xử lý |
| Đổi account/ví giữa lúc chuẩn bị | Dừng trước bước ký nếu danh tính đã đổi |
| Reload sau hash, trước indexed | Giữ hash, tiếp tục đối chiếu; không donate/claim/settle lại |
| Receipt revert hoặc cancel | Không báo indexed; quyền/counter không bị mất |
| Indexer/RPC lỗi | Báo lỗi hoặc chờ đối chiếu; không dùng dữ liệu cũ để mở thao tác mới |

Không phá MinIO/DB/chain đang có campaign của người dùng để gây lỗi. File hỏng,
token false/revert/reentry, replay/reorg/reset và worker outage dùng các test
tự động có fixture riêng.

## Thời gian và test tự động

Review/admission 72 giờ; phản đối có 7 ngày giải trình + 7 ngày xử lý. Dùng
thời gian chain trên panel, không đồng hồ Windows. Không phải ngồi chờ nhiều
ngày để kiểm tra logic: smoke tua thời gian trên chain riêng do nó sở hữu.
Tua cho phiên trình duyệt cũng cần môi trường riêng đã chuẩn bị; chưa có
thì không chạy time-warp trên 8545 để vượt hạn.

Sau khi PostgreSQL/MinIO đã chạy, migrations đã áp dụng và Foundry artifact đã
build, chạy lần lượt từ backend, cổng 9545 phải rảnh:

```powershell
Set-Location C:\Users\dell\Desktop\FundTogether\backend
npm.cmd run build
node scripts/publish-indexer-smoke.cjs
node scripts/refund-lifecycle-smoke.cjs
node scripts/milestone-lifecycle-smoke.cjs
```

Mỗi script cần PASS; dừng nếu fail. Build backend phải chạy trước vì smoke đọc
dist. Hướng dẫn build contract, khởi động dịch vụ và unit tests nằm ở
[manual-test-from-campaign.md](./manual-test-from-campaign.md).

## Ghi nhận kết quả

Ghi tên case, account/ví, chain/deployment, metadata/on-chain campaign ID,
version/hash, state trước/sau, deadline/chain timestamp, số tiền, transaction
hash, receipt block và checkpoint index. Đánh dấu PASS chỉ sau kết quả cuối.
Nếu lỗi, giữ hash/campaign và ảnh thông báo để đối chiếu; không xóa dữ liệu hoặc
gửi lại khi giao dịch chưa rõ kết quả. Không đưa private key/seed vào ảnh/chat.
