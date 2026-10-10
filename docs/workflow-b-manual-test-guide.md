# Workflow B — hướng dẫn kiểm thử thủ công trước bước triển khai tiếp

> Ngày 2026-10-09. Dành cho môi trường local B và Brave + MetaMask.
> Trạng thái: hướng dẫn đã chuẩn bị; các bước dưới đây chưa mặc nhiên PASS.
> Đối chiếu [bảng nghiệm thu T01–T18](./workflow-b-acceptance.md),
> [runbook](./workflow-b-local-runbook.md) và [quy tắc tài chính](./workflow-b-financial-rules.md).

## 1. Thứ tự làm và điểm dừng

1. Hoàn thành tài khoản, ví, số dư và xác thực tổ chức ở mục 2–3.
2. Chạy G1 từ bản nháp đến nộp hồ sơ và xét duyệt ở mục 4. Ghi lại từng giao dịch.
3. Tới cửa sổ phản đối, dừng chờ đúng hạn blockchain hoặc phối hợp một lượt thử
   deadline trong môi trường riêng. Không tự chỉnh giờ chain đang dùng.
4. Hoàn tất G1 rồi chạy G2, sau đó các nhánh bổ sung, phản đối, tiền dư và refund.
5. Kiểm tra lỗi dịch vụ có phối hợp; thu quyết định reviewer riêng với kiểm thử UI.

Không cần chạy hết trong một buổi. Lỗi gặp ở bước nào được sửa và thử lại bước
đó trước khi đi tiếp. Không dùng kết quả tự động để điền PASS cho thao tác MetaMask.

## 2. Chuẩn bị đúng môi trường và tài khoản

### Môi trường

| Kiểm tra | Giá trị cần thấy |
|---|---|
| Trang ứng dụng | `http://localhost:5174` |
| Trang tài khoản | `http://localhost:5174/#/account` |
| Mạng trong ví | FundTogether Workflow B, chain ID **31338** |
| RPC B | `http://127.0.0.1:9547` |
| API B | `http://localhost:3001` |
| Token | MockUSDC của deployment B, **6 chữ số thập phân** |
| Số dư | ETH dùng trả phí; MockUSDC dùng góp/hoàn tiền |

Nếu dịch vụ đang chạy thì dùng ngay, không mở thêm Anvil. Địa chỉ token và
contract lấy từ `.local/workflow-b/manual-preflight.json` của đúng lượt chạy;
không dùng địa chỉ của baseline A/chain31337. Trong local, giá trị USD trong
MetaMask không phải số dư MockUSDC để đối chiếu; xem số lượng token trên ứng dụng.

### Bốn tài khoản thao tác và một tài khoản staff

| Vai trò | Cần chuẩn bị | Kết quả đúng |
|---|---|---|
| Organizer | Tài khoản OWNER của tổ chức, ví đã liên kết | Có workspace của tổ chức; global role USER vẫn hợp lệ |
| Resolver | Global role RESOLVER, liên kết đúng ví resolver trong manifest | Xem hồ sơ; chỉ đúng ví được ký quyết định on-chain |
| Donor A | USER, ví riêng đã liên kết | Góp và claim theo chính ví góp |
| Donor B | USER, ví khác A đã liên kết | Khoản góp và quyền claim độc lập với A |
| Staff | ADMIN | Xác thực tổ chức off-chain; không tự có quyền ký resolver |

Staff synthetic đã có trong `.local/workflow-b/manual-accounts.json`. Mở file
local để lấy thông tin đăng nhập; không đưa mật khẩu, private key hoặc seed
phrase vào ảnh/báo cáo. Các địa chỉ ghi trong seed cũ không chứng minh ví hiện
được liên kết với tài khoản đó.

Một profile Brave dùng chung phiên đăng nhập giữa các tab. Để thử nhiều vai trò,
đăng xuất/đăng nhập lần lượt hoặc dùng các profile riêng đã cấu hình extension.
Mở bốn tab không tạo bốn phiên tài khoản độc lập.

**Trước mỗi giao dịch:** kiểm tra email đang đăng nhập, địa chỉ ví đang chọn,
ví đã liên kết và chain31338. Tên DonorA/DonorB trong MetaMask chỉ là nhãn.

### Chuẩn bị số dư

- Mỗi ví cần ETH test lớn hơn0 để ký giao dịch. Mục tiêu nạp ban đầu là
  10.000 MockUSDC mỗi tài khoản; ghi số dư thực tế trước từng kịch bản.
- Số dư giảm qua các campaign đã test là bình thường. Không cộng thêm tiền vào
  số dư kỳ vọng nếu chưa có giao dịch nạp được xác nhận.
- Tại lần kiểm tra ngày2026-10-09: organizer và donorA đã liên kết và có
  10.000 MockUSDC; resolver/donorB chưa có ví liên kết. Đây là ảnh chụp trạng
  thái tại thời điểm kiểm tra, không phải cam kết tự động nạp sau khi liên kết.
- Hoàn tất liên kết hai ví còn lại rồi xác nhận số dư trước khi bắt đầu góp.

## 3. Kiểm tra tài khoản, ví và quyền trước tiên

| ID | Thao tác | Điều kiện đạt |
|---|---|---|
| M01 | Đăng nhập từng account → Tài khoản → chọn ví → Liên kết ví ngoài → ký thông điệp | Đúng địa chỉ xuất hiện trong danh sách ví đã liên kết; ký liên kết không chuyển token |
| M02 | Tải lại trang, đăng xuất rồi đăng nhập lại | Liên kết và vai trò còn nguyên; số dư thuộc đúng ví |
| M03 | Ở một yêu cầu liên kết mới, từ chối ký trong MetaMask rồi thử lại | Lần từ chối không tạo liên kết; ứng dụng hết trạng thái chờ và cho thử lại |
| M04 | Đổi ví hoặc đổi sang mạng khác | UI cập nhật địa chỉ/mạng và chặn hành động không đủ điều kiện; không hiện số dư cũ như của ví mới |
| M05 | Đăng nhập B nhưng thử liên kết ví đã thuộc A | Bị từ chối rõ ràng; ví vẫn thuộc A. Không gỡ liên kết thật chỉ để ép bài thử thành công |
| M06 | Xem trang resolver bằng donor; xem xác thực tổ chức bằng resolver không có ADMIN | Không đọc/sửa dữ liệu nội bộ ngoài quyền; có thông báo quyền phù hợp |

Nếu ký mà không thấy popup, mở đúng extension MetaMask để kiểm tra yêu cầu
chưa xử lý. Dừng chờ trong ứng dụng không bảo đảm đã hủy yêu cầu trong extension.
Nếu đã xử lý yêu cầu cũ mà vẫn timeout/khóa chờ, ghi FAIL kèm thời điểm và ảnh;
không bấm liên tiếp tạo thêm yêu cầu. Lỗi409 là đúng nếu ví thật sự thuộc account
khác; lỗi409 trên ví mới chưa thuộc account nào cần điều tra.

### Chọn ví đại diện và xác thực tổ chức

Nếu đã liên kết nhầm ví: trên thẻ đúng địa chỉ → **Gỡ liên kết** → nhập mật khẩu
tài khoản → **Xác nhận gỡ liên kết**. Kiểm tra thẻ biến mất sau khi tải lại, rồi
đăng nhập tài khoản đích và ký liên kết mới. Không xóa ví khỏi MetaMask. Ví đại
diện tổ chức hoặc ví đã gắn kế hoạch chốt sẽ bị chặn; tài khoản chỉ đăng nhập
bằng ví chưa dùng được cách gỡ bằng mật khẩu. Các phiên đăng nhập khác sẽ hết
hiệu lực sau khi gỡ thành công; số dư và lịch sử blockchain được giữ.

1. Organizer → **Hồ sơ & ví đại diện** trên sidebar → **Ví đại diện tổ chức**.
   Hoặc **Tổ chức của tôi** → **Xem hồ sơ** của tổ chức. URL hồ sơ là
   `#/organizations/<id>`; `#/organizations/<id>/workspace/campaigns` là trang campaign.
2. Chọn ví đã liên kết thuộc mình → **Xác nhận ví đại diện**. Kiểm địa chỉ trước
   khi lưu: giao diện hiện chưa hỗ trợ đổi ví đại diện sau bước này.
3. Staff ADMIN đăng nhập → `#/internal/organizations` → mở đúng tổ chức.
4. Nhập căn cứ, nguồn, phạm vi, giới hạn và thời hạn xác thực; chọn VERIFIED →
   **Lưu hồ sơ xác thực off-chain**. Nguồn nhập theo dạng `căn cứ | tham chiếu`.
5. Tải lại: hồ sơ xác thực được giữ, còn hiệu lực. Organizer không được tự xác
   thực; RESOLVER không được coi là ADMIN. Xác thực không chuyển tiền.

Chỉ tiếp tục G1 khi tổ chức có ví đại diện và xác thực còn hiệu lực. Bản nháp
synthetic của tổ chức khác không phải bản nháp của organizer đang test.

## 4. G1 — một đợt thành công, 2.200 MockUSDC / 100 suất

Tạo campaign mới với tên dễ tìm, ví dụ `G1 manual 2026-10-09 lần 1`.
Ghi campaign ID, metadata ID và số dư đầu kỳ để không nhầm với fixture cũ.

### 4.1. Tạo bản nháp, chốt và nộp kế hoạch

1. Organizer → tổ chức → workspace campaign → **Tạo campaign**.
2. Chọn **G1 · một đợt qua đơn vị**: tổng ngân sách2.200, một đợt,100 suất,
   kênh INSTITUTION; dùng thời gian gây quỹ7 ngày cho hành trình này.
3. Điền tên, mục tiêu, phạm vi người nhận, căn cứ đủ điều kiện và công việc.
   Đọc lại bốn tiêu chí: số lượng/thành phần; hóa đơn/thanh toán; người nhận và
   thẩm quyền ký; chi từ quỹ cùng tiền dư.
4. Lưu → tải lại trang. Nội dung giữ nguyên. Thử ngân sách0, số âm hoặc quá6
   chữ số thập phân: phải bị chặn, không âm thầm đổi giá trị.
5. **Chốt kế hoạch** → kiểm hash, ngân sách, tiêu chí và ví đại diện đã cố định.
   Chốt off-chain chưa tạo campaign trên blockchain.
6. **Nộp kế hoạch on-chain** → ký → đợi receipt thành công và indexer cập nhật.
   Kết quả là campaign DRAFT trên chain, chưa mở nhận đóng góp.

Bản nháp riêng chưa nộp không được xuất hiện công khai hoặc trong queue resolver
như một campaign đã công bố. Sau freeze, sửa nội dung đã chốt phải bị ngăn.

### 4.2. Duyệt kế hoạch và mở gây quỹ

1. Resolver → **Resolver / nội bộ** → `#/internal/campaigns` → mở campaign.
2. Đọc kế hoạch và xác thực tổ chức, ghi lý do/nguồn/giới hạn và ký duyệt.
   Chờ APPROVED được index. Sai ví resolver phải bị chặn ký.
3. Organizer quay lại → **Công bố và mở gây quỹ** → ký.
4. Chờ FUNDING. Không trừ bond trong luồng B. Việc duyệt kế hoạch hoặc publish
   không tự chuyển ngân sách cho organizer.

### 4.3. Hai donor góp, mỗi người1.100

Với mỗi donor: đăng nhập đúng account → chọn đúng ví → mở trang campaign → nhập
1.100 → duyệt token nếu allowance chưa đủ → đợi receipt → ký đóng góp → đợi
receipt và cập nhật đóng góp. Nếu allowance đã đủ, có thể không cần giao dịch approve.

| Mốc | MockUSDC donor A | MockUSDC donor B | Tiền trong escrow của G1 |
|---|---:|---:|---:|
| Đầu kỳ nếu mỗi ví có10.000 | 10.000 | 10.000 | 0 |
| A chỉ approve | 10.000 | 10.000 | 0 |
| A góp1.100 thành công | 8.900 | 10.000 | 1.100 |
| B góp1.100 thành công | 8.900 | 8.900 | 2.200 |

ETH giảm do phí được tính riêng. Nếu số dư đầu kỳ khác10.000, đối chiếu mức
giảm1.100 thay vì dùng số dư tuyệt đối trong bảng. Xem **Đóng góp của tôi**,
tải lại trang và kiểm không có khoản góp trùng. Đạt đủ mục tiêu chuyển sang
FIRST_REVIEW, không cần đợi hết7 ngày gây quỹ.

### 4.4. Xác nhận cấp đầu và nhận vốn

1. Trước khi resolver xác nhận đủ điều kiện cấp đầu, organizer phải chưa nhận
   được vốn. Duyệt kế hoạch trước đó không thay cho quyết định này.
2. Resolver kiểm điều kiện và hồ sơ tổ chức còn hiệu lực → ký quyết định cấp đầu.
3. Organizer thấy ADVANCE_AVAILABLE → **Nhận 2200 USDC cho đợt 1** → ký.
4. Đợi EXECUTING: ví đại diện tăng2.200, tổng đã cấp tăng2.200, custody của G1
   về0. Nếu organizer bắt đầu10.000 và chưa có token transaction khác thì lúc
   này có12.200 MockUSDC.
5. Tải lại và thử nhận lần nữa: không có lần cấp thứ hai. Ví khác không được
   đổi người nhận hoặc nhận thay.

Số dư ví organizer không chứng minh hàng đã được mua/trao. Hệ thống cần báo cáo,
hồ sơ và xét duyệt riêng; tiền đã ra khỏi escrow không tự bị thu hồi khi STOP.

### 4.5. Báo cáo và bằng chứng

1. Organizer mở **Hồ sơ thực hiện**, chọn đợt1. Nhập kết quả, thời gian, số suất,
   phạm vi người nhận, bàn giao và giới hạn xác minh.
2. Nhập chi phí theo nguồn: CAMPAIGN là tiền từ quỹ; ORGANIZER/OTHER là nguồn
   khác. Đừng cộng khoản tự tài trợ vào chi phí được công nhận của quỹ.
3. Tải các bản gốc PDF/JPEG/PNG, mỗi file tối đa10MiB, tối đa20 bản gốc;
   gắn file vào đúng tiêu chí. G1 đủ hồ sơ thường cần REPORT, PHOTO, INVOICE,
   PAYMENT_PROOF, DELIVERY_RECORD.
4. **Lưu báo cáo** rồi tải lại: dữ liệu và file còn nguyên nhưng chưa nộp chain.
5. **Lưu và chốt phiên bản**: kiểm version1, hash và nội dung chỉ đọc.
6. Chuẩn bị bản công khai đã che cho từng file gốc, ghi mô tả và xác nhận công
   khai. Kiểm bản xem trước không lộ dữ liệu cần che.
7. Ký nộp hồ sơ on-chain → đợi EVIDENCE_REVIEW và đúng version/hash được index.
8. Donor xem được bản công khai đúng file; thử truy cập bản gốc phải bị chặn.
   Organizer/resolver có quyền phù hợp mới được đọc bản gốc.

Dùng dữ liệu hư cấu nhất quán cho hành trình thành công. Corpus đọc được có
trong `.local/workflow-b/reviewer-corpus-v3/reviewer/`; đọc README.txt trước.
Không mặc định một mã corpus là đạt và không ép reviewer chọn MET để đi tiếp.
Các file JSON/SVG cũ trong docs/examples không phải file PDF/ảnh hợp lệ để upload.

### 4.6. Nghiệm thu và hoàn tất

1. Resolver mở đúng hồ sơ/phiên bản; đọc bản gốc, bản công khai và nguồn đối chiếu.
2. Đánh giá từng tiêu chí với lý do, nguồn và giới hạn. MET chỉ khi đủ căn cứ;
   dùng NEEDS_INFORMATION, NOT_MET hoặc INCONCLUSIVE đúng tình huống.
3. Với G1 thành công không dư: chi từ quỹ được công nhận2.200, unused0.
   Ký đánh giá → chờ CHALLENGE_WINDOW.
4. Trong cửa sổ phản đối, nút chốt phải bị khóa với lý do. Không gọi đây là
   COMPLETED và không kỳ vọng nhận thêm2.200.
5. Khi hết challengeEnd trên chain, không có case và trước finalizeEnd/hardStop,
   organizer → **Chốt nghiệm thu đợt cuối** → ký → đợi COMPLETED.
6. Kết quả: đã góp2.200, đã cấp2.200, đã trả0, escrow0; finalize không chuyển
   thêm token. Hồ sơ, quyết định, đóng góp còn đúng sau reload/đăng nhập lại.

Luồng trạng thái chính sau khi nộp kế hoạch:

```text
DRAFT → APPROVED → FUNDING → FIRST_REVIEW → ADVANCE_AVAILABLE
      → EXECUTING → EVIDENCE_REVIEW → CHALLENGE_WINDOW → COMPLETED
```

## 5. G2 — ba đợt, tổng3.300, mỗi đợt1.100

Tạo campaign riêng, chọn **G2 · ba đợt trao trực tiếp**. Mỗi đợt50 suất,
kênh DIRECT; hai donor góp1.650/người. Làm lại các bước kế hoạch/phê duyệt/
publish/cấp đầu như G1; số dư tính từ đầu kỳ mới.

| Mốc | Tổng đã cấp | Custody nếu không có return/refund | Việc phải kiểm |
|---|---:|---:|---|
| Gây quỹ đủ | 0 | 3.300 | Chưa tự chuyển cho organizer |
| Nhận đợt1 | 1.100 | 2.200 | Không nhận đợt2 ngay |
| Chốt đợt1 rồi nhận đợt2 | 2.200 | 1.100 | Chốt không payout; nhận đợt2 là giao dịch riêng |
| Chốt đợt2 rồi nhận đợt3 | 3.300 | 0 | Đúng thứ tự và đúng1.100 |
| Chốt đợt3 | 3.300 | 0 | COMPLETED, không cấp lần4 |

Ở đợt2, thử một lượt NEEDS_INFORMATION: organizer sửa bằng phiên bản2, giữ
phiên bản1 và parent/hash; resolver xét lại. Bổ sung hồ sơ không cấp thêm1.100.
Khi hồ sơ đang bổ sung, bị phản đối hoặc chưa trả đủ unused, đợt tiếp chưa được mở.
Đợt cuối vẫn phải nộp bằng chứng, review và hết cửa sổ phản đối.

## 6. Các nhánh phải thử trên campaign riêng

Không dùng cùng campaign cho cả đường thành công và STOP. Ghi ID riêng cho
mỗi nhánh; phép thử bị chặn đúng rule là PASS, không phải lỗi nút.

| Nhánh / T tương ứng | Cách thử | Kết quả cần đối chiếu |
|---|---|---|
| T04/T16: hủy hoặc lặp thao tác | Từ chối approve/donate/claim ở popup; tải lại sau khi có tx hash; thử bấm lại | Không giả báo thành công, không gửi trùng; nếu tx đã mine thì hiển thị lại đúng kết quả |
| T05/T06: hồ sơ không đủ | Thiếu hóa đơn, giao90/100 suất, người ký không có căn cứ thẩm quyền, ảnh dùng lại | Reviewer ghi đúng thiếu/sai/chưa rõ và nguồn; hash đúng không tự biến chứng cứ thành đúng |
| T06/T10: bổ sung | NEEDS_INFORMATION → v2; nhánh riêng đi tới giới hạn3 phiên bản | Không ghi đè bản cũ, không cấp thêm; lần4 bị chặn, xử lý dừng/quá hạn đúng trạng thái |
| T08: phản đối | Donor đã góp mở case trong cửa sổ; organizer phản hồi; resolver xử lý CONTINUE/RESUBMIT/STOP ở các campaign khác nhau | Người không đủ quyền bị chặn; một case/phiên bản, organizer phản hồi một lần; case mở không cho cấp tiếp. CONTINUE không cấp tiền; RESUBMIT giữ lịch sử |
| T01/T13: dư50 | G1 nhận2.200, chi được công nhận2.150, unused50 | Chưa thực trả50 thì không finalize; approve rồi Trả tiền vào escrow → nhận đủ50 mới tính return; cuối kỳ mỗi donor góp50% có quyền nhận25 |
| T11: G2 STOP sau nhận đợt2 | Nhận tổng2.200, dừng khi custody1.100; hai donor góp bằng nhau | Base cố định1.100, mỗi donor claim550. Trả muộn50 → mỗi người thêm25; trả tiếp110 → mỗi người thêm55 |
| T12: G1 STOP sau cấp toàn bộ | Dừng sau khi đã cấp2.200, chưa có return | Base0, không hứa hoàn2.200; return muộn50 tạo quyền25/người. Không phải góp bao nhiêu luôn lấy lại được bấy nhiêu |
| T13: return trước/sau snapshot | Hai nhánh riêng có return50 trước hoặc sau lúc dừng | Trước snapshot vào base; sau snapshot vào supplement, base cũ không thay đổi; người đã claim vẫn nhận phần mới |
| T03: gây quỹ thiếu | G1 chỉ góp1.100 rồi tới fundingEnd | Trước hạn không timeout; sau hạn không góp mới, xử lý timeout rồi hoàn đúng1.100 thực góp |
| T09/T10: không thao tác đúng hạn | Không xác nhận cấp đầu, không claim, không nộp, reviewer/case không xử lý | Trước hạn bị chặn timeout; tới hạn cho xử lý đúng rule, không tự thu hồi advance đã ra khỏi escrow |
| T14/T15 | Số base unit rất nhỏ, nhiều donor, token transfer lỗi/callback | Chạy cùng bộ kiểm thử kỹ thuật riêng: làm tròn xuống, không vượt entitlement/pool, transfer fail giữ quyền để retry |
| T17/T18 | Reorg, indexer chậm, RPC/storage gián đoạn | Kiểm có phối hợp trong môi trường riêng: phân biệt tx thành công với chờ index, không nhân đôi dữ liệu/tiền, báo thiếu file/RPC rõ và phục hồi được |

Đối chiếu refund bằng biến động token thực nhận, trạng thái quyền và receipt.
Claim lại khi chưa có quyền mới phải bị chặn. Tổng custody toàn contract có
thể chứa nhiều campaign: dùng số liệu campaign đang thử, không lấy tổng balance
contract làm escrow riêng của G1/G2.

## 7. Deadline: dùng giờ blockchain

| Cửa sổ | Policy hiện tại |
|---|---|
| Gây quỹ | Chọn1–30 ngày; mẫu7 ngày |
| Xác nhận cấp đầu | 3 ngày |
| Nhận vốn | 7 ngày |
| Nộp bằng chứng ban đầu | 30 ngày |
| Reviewer xét hồ sơ | 3 ngày |
| Bổ sung | 7 ngày, tối đa3 phiên bản |
| Phản đối | 3 ngày |
| Chốt sau cửa sổ phản đối | 7 ngày, có thể bị giới hạn bởi hardStop |
| Phản hồi case / xử lý case | Mỗi cửa sổ3 ngày; xem hạn cụ thể trên UI |
| Giới hạn cứng của đợt | 60 ngày |

Lấy deadline thực của campaign làm chuẩn; nhiều cửa sổ bị chặn bởi hardStop.
Giờ block local có thể lệch đồng hồ máy. Không chỉnh ngày Windows, reset Anvil
hoặc tự tăng giờ B để bỏ chờ. Khi tới bước này, ghi campaign ID + trạng thái +
deadline để phối hợp; các thử nghiệm tăng giờ chỉ thực hiện trên môi trường
riêng hoặc sau quyết định rõ ràng về ảnh hưởng tới campaign đang tồn tại.

## 8. Phần reviewer phục vụ nghiên cứu

Thao tác một người luân phiên các account giúp kiểm UI và quyền, nhưng chưa
phải đánh giá độc lập chất lượng bằng chứng.

- Đưa reviewer thư mục `.local/workflow-b/reviewer-corpus-v3/reviewer/` với12
  mã trung tính; không đưa file đáp án của người tạo tình huống trước khi chấm.
- Đọc cả hồ sơ/nguồn, ghi C1–C4 và OVERALL trong
  `.local/workflow-b/reviewer-corpus-v3/reviewer-decisions.csv`: quyết định,
  lý do, nguồn, giới hạn và thời gian theo cột của mẫu.
- Không ép các mẫu thành MET để có đường chạy thành công. Đối chiếu nhãn tham
  chiếu sau khi chấm; ghi bất đồng và căn cứ thay vì coi nhãn tác giả là sự thật.
- Tài liệu là giả lập và ảnh minh họa; không báo cáo thành khảo sát/trao quà thật.
  Số PDF/trang không phải số reviewer hay số quan sát độc lập.

## 9. Ghi kết quả và điều kiện đi tiếp

Mỗi lượt dùng mẫu ngắn này; chỉ ghi PASS sau khi quan sát thực tế:

```text
Case: M01 / T01 bước4.3 / T11 ...
Thời điểm + trình duyệt:
Account/vai trò; địa chỉ ví công khai; chain ID:
Campaign ID / metadata ID / đợt / phiên bản:
Trạng thái và số dư trước:
Thao tác:
Kỳ vọng:
Thực tế + số dư sau:
Tx hash; receipt thành công/revert; đã indexed/chưa indexed:
Kết quả: PASS / FAIL / TODO
Ảnh, thông báo lỗi và cách tái lập:
```

Không gửi mật khẩu/private key/seed phrase, cookie hoặc URL tải file có token.
Với lỗi tiền, ngừng thao tác trên campaign đó và ghi số dư/tx; đừng nạp thêm,
gỡ ví hoặc reset dữ liệu để che mất dấu vết.

**Trước khi mở rộng tính năng:** tài khoản/ví/quyền ổn định; G1 hoàn tất qua UI;
G2 đúng thứ tự; ít nhất một nhánh bổ sung, phản đối, tiền dư và refund/return
muộn được người dùng kiểm; không còn lỗi chặn tiền, quyền hoặc trạng thái.

**Để hoàn tất I3:** T01–T18 có bằng chứng cho phần yêu cầu tương ứng, các phần
UI/MetaMask còn thiếu được thao tác thực; có quyết định reviewer được ghi nhận.
Các bài reorg/token lỗi/fuzz giữ bằng chứng kỹ thuật riêng, không buộc người
dùng tự phá môi trường chính. PASS local không tự là sẵn sàng dùng tiền thật.
