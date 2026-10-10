# Workflow B — hướng dẫn nghiệm thu thủ công đến ngày 2026-10-11

> Môi trường: local B, Brave + MetaMask. Tiền trong tài liệu là **MockUSDC thử nghiệm**.
> Người dùng chưa chạy lượt nghiệm thu này; các ca bên dưới mặc định **TODO**.
> Test tự động, smoke bằng Viem và browser giả lập không thay kết quả thao tác thật.
> Goal triển khai đã hoàn tất theo quyết định ngày 2026-10-11. Tài liệu này dành
> cho giai đoạn nghiệm thu sau, vẫn chưa đạt; bạn không cần bắt đầu test ngay.

Tài liệu bao phủ phần hiện đã triển khai: tài khoản/ví, xác thực tổ chức,
campaign G1/G2, cấp vốn, bằng chứng, resolver review, phản đối, quá hạn,
return và refund. Đây là hướng dẫn hoàn tất nghiệm thu F2/I3/OI1, chưa phải
chứng nhận sẵn sàng production.

Nguồn đối chiếu: [kế hoạch code](./workflow-b-code-plan.md),
[nghiệm thu T01–T18](./workflow-b-acceptance.md),
[onboarding O01–O12](./workflow-b-organization-onboarding-plan.md),
[đặc tả B](./workflow-b-spec.md), [quy tắc tiền](./workflow-b-financial-rules.md),
[runbook local](./workflow-b-local-runbook.md) và [tiến độ](./PROJECT_PROGRESS.md).

## 1. Thứ tự nghiệm thu và điểm dừng

| Lượt | Việc bạn làm | Bằng chứng/điểm dừng |
|---|---|---|
| A | Mục 2–4: ví/quyền; OWNER gửi → ADMIN yêu cầu bổ sung → OWNER gửi lại → ADMIN duyệt | Ví đã liên kết, hồ sơ duyệt, thời hạn, lịch sử |
| B | Mục 5–6: G1 đến nhận 2.200, nộp hồ sơ và resolver MET | Hash, số dư; dừng ở CHALLENGE_WINDOW nếu chưa hết hạn |
| C | Đóng G1 đúng hạn rồi chạy G2 ở mục 7 | Hai campaign COMPLETED, số dư đúng, từng đợt chỉ nhận một lần |
| D | Mục 8: bổ sung, case, STOP, unused, refund và return muộn | Campaign riêng cho từng nhánh, đối chiếu tiền |
| E | Mục 4.4, 5, 9–10: cạnh tranh, quyền, deadline, lỗi dịch vụ | Codex chuẩn bị fixture khi cần; bạn quan sát/ký các bước thật |
| F | Mục 11: người thật đọc hồ sơ hư cấu | Quyết định reviewer và thời gian thật |

**Buổi đầu nên hoàn thành lượt A, rồi G1 đến bước 6.7.** Không cần làm hết trong
một buổi. Có thể tiếp tục sửa code khi chờ deadline; chưa đóng nghiệm thu tổng thể.

Cách ghi kết quả:

- **PASS:** đã làm đủ bước, thấy đúng kết quả, có bằng chứng.
- **FAIL:** hành vi sai kỳ vọng; ghi bước đầu tiên sai và thông báo nguyên văn.
- **IN_PROGRESS:** đã làm một phần, chẳng hạn chờ hết challenge window.
- **BLOCKED:** thiếu account, file, gas, dịch vụ hoặc fixture để thử.
- **TODO:** chưa thử. Đọc hướng dẫn không phải PASS.

Bị chặn đúng quyền/deadline/dữ liệu sai là PASS của ca kiểm tra chặn. Lỗi mạng
không rõ nguyên nhân không tự được coi là PASS. Mẫu biên bản ở mục 12.

## 2. Chuẩn bị môi trường, tài khoản và file

### 2.1. Đúng môi trường B

| Thành phần | Giá trị cần kiểm |
|---|---|
| Ứng dụng / tài khoản | `http://localhost:5174` / `http://localhost:5174/#/account` |
| API / health | `http://localhost:3001` / `http://localhost:3001/health` |
| Mạng | FundTogether Workflow B, chain ID **31338** (`0x7a6a`) |
| RPC | `http://127.0.0.1:9547` |
| Token | MockUSDC/mUSDC đúng deployment B, **6 decimals** |
| Hồ sơ tổ chức | `#/organizations/<organizationId>` |
| Campaign của tổ chức | `#/organizations/<organizationId>/workspace/campaigns` |
| ADMIN / resolver | `#/internal/organizations` / `#/internal/campaigns` |

Tên mạng có thể khác; phải khớp chain ID, RPC và deployment. Địa chỉ token,
contract và resolver lấy từ `.local/workflow-b/manual-preflight.json` mới nhất,
không lấy địa chỉ từ ảnh cũ hoặc môi trường A.

Đầu lượt, Codex có thể chạy tại thư mục gốc repository:

```powershell
node frontend/scripts/advance-manual-setup.mjs
```

Script đọc chain/deployment/API/storage/indexer/frontend và ghi báo cáo local;
không ký hoặc chuyển tiền. PASS chỉ nghĩa là sẵn sàng bắt đầu test. Nếu FAIL,
giữ nguyên dữ liệu để xử lý; không mở thêm Anvil, reset, redeploy hay chỉnh giờ.

### 2.2. Account và quyền cần có

| Vai trò | Quyền ứng dụng | Ví và điều kiện |
|---|---|---|
| Organizer | OWNER tổ chức; global USER vẫn hợp lệ | Ví B đã liên kết, chọn làm đại diện và nhận vốn |
| ADMIN | ADMIN, không là OWNER tổ chức được xét | Không cần ký ví để xét hồ sơ tổ chức |
| Resolver | RESOLVER | Đúng ví resolver trong deployment, đã liên kết SIWE mới ký được |
| Donor A | USER | Ví A đã liên kết, nhận refund theo khoản góp của A |
| Donor B | USER | Ví B khác A, quyền góp/refund riêng |

Organizer có thể dùng `huyteenpast10@gmail.com` nếu vẫn là OWNER tổ chức test.
Kiểm quyền thực tại trang Tài khoản; không suy từ tên email hoặc nhãn DonorA
trong MetaMask. ADMIN không tự có quyền resolver; RESOLVER không tự có ADMIN.

Bảng dưới giữ thông tin đã điền từ lượt chuẩn bị trước. Trước lượt thử mới,
đọc lại account, ví, quyền và số dư thực tế, ghi thời điểm; các số trong bảng
không phải kết quả kiểm tra runtime ngày 2026-10-11.

| Vai trò | Account thực dùng | Địa chỉ ví đầy đủ | Quyền thấy trên UI | ETH đầu lượt | MockUSDC đầu lượt |
|---|---|---|---|---:|---:|
| Organizer | huyteenpast10@gmail.com | 0x91b65bd13c160f260bfb7bb017ee081d12670e8e | USER, CAMPAIGN | 1eth | 10000mockUSDC |
| Resolver | resolver@gmail.com | 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 | USER, RESOLVER | 10000eth | 10000mockUSDC |
| Donor A | donorA@gmail.com | 0x90f79bf6eb2c4f870365e785982e1f101e93b906 | USER | 10000eth | 10000mockUSDC |
| Donor B | donorB@gmail.com | 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 | USER | 10000eth | 10000mockUSDC |
| ADMIN | manual-b-staff@workflow-b.invalid | Không bắt buộc | ADMIN | — | — |

**Quyền thấy trên UI** là nhãn quyền ở trang Tài khoản. Quyền quản lý tổ chức
được kiểm riêng bằng membership OWNER; không coi chữ `CAMPAIGN` đã ghi trong
bảng là quyền bắt buộc để tạo/quản lý campaign. **ETH đầu lượt** và **MockUSDC
đầu lượt** là số dư trước khi bắt đầu ca, dùng đối chiếu tăng/giảm sau thao tác.
ADMIN chỉ xét hồ sơ tổ chức nên không cần liên kết ví, ETH hoặc MockUSDC.
Nếu cùng account làm thêm nhiệm vụ resolver/donor thì kiểm điều kiện của vai
trò đó riêng.

Thông tin đăng nhập local đã chuẩn bị, nếu cần, ở
`.local/workflow-b/manual-accounts.json`. Không đưa mật khẩu/private key vào
ảnh hoặc báo cáo. Thiếu ADMIN/sai ví resolver thì để Codex đối chiếu account;
không cấp thêm quyền chỉ để biến một ca kiểm tra chặn thành PASS.

Một profile Brave dùng chung phiên giữa các tab. Đăng xuất/đăng nhập tuần tự
hoặc dùng các profile riêng có MetaMask; bốn tab không tạo bốn phiên độc lập.
Trước mỗi thao tác, kiểm email, ví đang chọn, ví đã liên kết và chain.

### 2.3. Số dư và số tiền nhập

- Trang Tài khoản phải có **Phí giao dịch: … ETH** và **Số dư quyên góp: … MockUSDC**.
  Nhãn “Phí giao dịch” hiện hiển thị số dư ETH để trả gas, không phải phí của
  một giao dịch cụ thể. Phí từng giao dịch xem ở MetaMask/receipt.
- Ký liên kết không tốn gas; giao dịch on-chain cần ETH test lớn hơn 0.
- Mục tiêu chuẩn bị là 10.000 MockUSDC cho mỗi ví trong bốn ví. Phải đọc số dư
  thực tế; tài liệu không xác nhận mọi ví hiện đã được nạp/liên kết.
- Số đã tiêu cho campaign cũ không tự về 10.000. Thiếu gas/token thì để Codex
  nạp đúng ví B và ghi giao dịch nạp trước khi tiếp tục.
- Ô nhập dùng `2200`, `1100`, `0.000001`, không dùng dấu phân cách hàng nghìn.
  Các bảng trong tài liệu dùng `2.200` để viết số hai nghìn hai trăm.
- MetaMask hiện `$0.00` không chứng minh token bằng 0. Kiểm số lượng đúng token;
  ghi phí ETH riêng, không trừ vào MockUSDC kỳ vọng.

Ở trang campaign công khai, mở **Dòng tiền và thông tin mạng** để xem mục tiêu,
đã góp, đã cấp, đã trả về, đã hoàn người ủng hộ và **Còn trong escrow**.
Một số nút trong workspace còn ghi “USDC”; ở môi trường B này chúng thao tác
MockUSDC thử nghiệm của deployment đã kiểm ở mục 2.1.

### 2.4. Dữ liệu thử

Đặt tên `TEST-B <mã ca> <ngày> <lần>`. Dùng tổ chức/campaign phụ cho từ chối,
đình chỉ, sửa hồ sơ quan trọng và STOP để không phá G1/G2 đang chạy.

| Nhóm tài liệu hư cấu, ghi rõ DỮ LIỆU KIỂM THỬ | Nội dung cần khớp |
|---|---|
| Tổ chức: danh tính, đại diện/ủy quyền, căn cứ hoạt động | Tên nhóm, người đại diện, phạm vi, liên hệ, thẩm quyền |
| Campaign: REPORT, PHOTO, INVOICE, PAYMENT_PROOF, DELIVERY_RECORD | Đợt, ngày, số suất, hàng hóa, tiền/nguồn chi, người ký |

PDF/PNG/JPEG hợp lệ; tối đa **10 MiB = 10.485.760 bytes/file**, tối đa 20 tài
liệu được chọn trong hồ sơ tổ chức hoặc 20 bản gốc của hồ sơ thực hiện. Đổi đuôi
`.txt` sang `.pdf` không làm file hợp lệ. Hồ sơ tổ chức luôn riêng tư; hồ sơ
thực hiện cần một bản đã che tương ứng cho từng file gốc để công khai.

Corpus ở `.local/workflow-b/reviewer-corpus-v3/reviewer/`, đọc `README.txt` trước.
Có cả mẫu thiếu/không đạt, không chọn tùy ý rồi ép MET. PLAN/SOURCES là tham
chiếu; server tạo định danh/hash hồ sơ khi chốt. JSON/SVG cũ không thay file upload.

## 3. Tài khoản, ví và quyền — M01–M06

### M01 — đăng nhập, kết nối, liên kết

1. Đăng nhập email/mật khẩu, chụp email và quyền.
2. Kết nối MetaMask, chọn B và đúng ví. Dòng **Ví đang kết nối trên trình duyệt**
   phải đúng; kết nối chưa có nghĩa là đã liên kết account.
3. Nếu chưa liên kết: **Liên kết ví ngoài** → mở MetaMask → ký thông điệp.
4. Chờ thẻ ở **Ví đã liên kết với tài khoản**, nút **Ví đã liên kết**.
5. **Tải lại số dư**, kiểm ETH/MockUSDC. Làm cho cả bốn account.

**Đạt:** đúng account ↔ ví ↔ chain, không chuyển token khi ký liên kết. Nếu đã
liên kết, kiểm trạng thái hiện có; dùng ví test phụ cho ca ký mới, không gỡ ví đại diện.

### M02 — reload, đổi account/ví/mạng

1. Reload, đăng xuất/đăng nhập lại: liên kết/quyền còn đúng.
2. Đổi MetaMask A → B: địa chỉ kết nối đổi, danh sách ví thuộc account không tự đổi chủ.
3. Đăng nhập account B: không còn hồ sơ riêng/quyền claim của A.
4. Đổi mạng rồi trở lại B: chặn tài chính trên mạng sai, kiểm lại quyền khi trở về.

**Đạt:** không lẫn số dư/quyền/thông báo thành công của phiên cũ. Thử cả ở trang campaign.

### M03 — từ chối, timeout, dừng chờ

Dùng ví phụ chưa liên kết. Bấm liên kết rồi từ chối trong MetaMask: không tạo
liên kết, UI hết chờ, lần sau ký hợp lệ có thể thành công.

Ở lượt khác để chờ hoặc bấm **Dừng chờ**: UI giải phóng trạng thái local, không
nhận chữ ký muộn của lượt đã hủy. Mở MetaMask xử lý yêu cầu cũ trước khi thử
lại; dừng chờ trên web không tự đóng yêu cầu extension.

**Đạt:** từ chối/hủy/đổi account không tự liên kết. Nếu đã xử lý yêu cầu cũ mà
vẫn timeout/khóa chờ, ghi FAIL với ảnh, thời điểm, provider và địa chỉ. Không
chữa bằng xóa ví, seed, mật khẩu hoặc dữ liệu chain.

### M04 — provider trên Brave và ví thuộc account khác

- Dòng **Ví kết nối qua MetaMask** phải khớp extension nhận yêu cầu, không gửi
  nhầm sang Brave Wallet khi có nhiều provider.
- Đăng nhập B, thử liên kết ví thuộc A: phải báo thuộc account khác; không ghi đè.
- Quay lại A: liên kết còn nguyên. Nếu mapping không như bạn mong đợi, ghi địa
  chỉ để đối chiếu trước; thông báo xung đột không luôn là bug.

### M05 — quyền ứng dụng khác quyền ký

| Account/điều kiện | Thử | Đạt khi |
|---|---|---|
| Donor/khách | Mở URL resolver/tổ chức khác | Không đọc dữ liệu riêng hoặc duyệt |
| RESOLVER không ADMIN | Mở queue xác thực tổ chức | Báo cần ADMIN |
| ADMIN không RESOLVER | Duyệt campaign | Không tự có authority resolver |
| RESOLVER, ví không đúng deployment | Đọc campaign rồi ký | Đọc theo quyền nhưng chặn ký, chỉ rõ ví cần dùng |
| OWNER có global USER | Mở workspace của mình | Vẫn quản lý theo membership OWNER |

Ẩn nút chưa chứng minh server an toàn. Ca gọi API trực tiếp/thu hồi role ở mục 10.

Kiểm thêm điều hướng ở sidebar và trang Tài khoản:

- USER không có lối vào khu vực nội bộ.
- ADMIN có **Xác thực tổ chức · ADMIN**, mở `#/internal/organizations`;
  ADMIN không RESOLVER mở `#/internal` cũng vào hàng chờ tổ chức.
- RESOLVER không ADMIN có **Resolver / nội bộ**, mở `#/internal/campaigns`.
- Account có cả hai quyền mở xác thực tổ chức từ khu vực người dùng; sidebar
  nội bộ có cả xét tổ chức và xét campaign/milestone. Hai nhiệm vụ vẫn độc lập.

### M06 — gỡ liên kết

Dùng ví phụ không là đại diện/không gắn plan đã chốt:

1. **Gỡ liên kết** → mật khẩu sai: lỗi, liên kết còn.
2. Đúng mật khẩu account → **Xác nhận gỡ liên kết**: thẻ mất sau reload.
3. Phiên account khác bị hết hiệu lực; số dư và lịch sử blockchain giữ nguyên.
4. Account đích liên kết lại bằng chữ ký mới: đúng chủ mới.

Ví đại diện hoặc gắn plan đã chốt phải bị chặn gỡ. Account chỉ đăng nhập bằng
ví không dùng được đường xác nhận bằng mật khẩu này. Thiếu fixture thì ghi
BLOCKED, không tháo liên kết của G1/G2 đang chạy.

## 4. Xác thực hồ sơ tổ chức — O01–O12

Xác thực danh tính tổ chức/nhóm và quyền đại diện theo policy FundTogether.
Nhóm thiện nguyện không bắt buộc có số đăng ký pháp nhân. Badge không chứng
minh campaign trung thực/hàng đã trao; xét hồ sơ này **không chuyển tiền**.

### 4.1. OWNER tạo tổ chức và lưu nháp — O01

1. **Tổ chức của tôi** → tạo tổ chức test/chọn tổ chức mình sở hữu → **Xem hồ sơ**.
2. **Ví đại diện tổ chức** → chọn ví B đã liên kết → **Xác nhận ví đại diện**.
   Đọc kỹ địa chỉ: UI hiện chưa hỗ trợ đổi ví đại diện sau khi xác nhận.
3. **Xác thực hồ sơ tổ chức** → **Chuẩn bị hồ sơ xác thực**.
4. Chỉ điền tên → **Lưu bản nháp** → reload. Nháp thiếu trường vẫn lưu được.
5. ADMIN xem queue: nháp không xuất hiện như một yêu cầu đã gửi.
6. OWNER điền dữ liệu hư cấu đầy đủ:

| Trường | Ví dụ để test |
|---|---|
| Loại tổ chức | Nhóm thiện nguyện |
| Tên pháp nhân / tên nhóm | TEST-B Nhóm Trao Quà 2026-10-10 |
| Số đăng ký | Trống với nhóm; bắt buộc nếu chọn Tổ chức đã đăng ký, khớp giấy tờ test |
| Địa chỉ hoạt động | Địa điểm thử nghiệm A, không dùng địa chỉ cá nhân thật |
| Phạm vi hoạt động | Mua và bàn giao 100 suất quà cho đơn vị tiếp nhận test |
| Người đại diện / vai trò | Nguyễn Test A / điều phối viên được ủy quyền |
| Căn cứ đại diện | Biên bản TEST-UQ-01, phạm vi gửi hồ sơ và quản lý campaign |
| Nguồn đối chiếu danh tính | Hồ sơ TEST-ID-01 và đầu mối trong tài liệu |
| Hoạt động và căn cứ | Hoạt động mô phỏng TEST-HD-01, nguồn đối chiếu kèm theo |
| Liên hệ | `organizer-test@example.invalid`, ghi rõ là hư cấu |

7. Chọn loại tài liệu → PDF/ảnh → **Tải tài liệu lên**. **Tải tài liệu**, mở và
   so tên/nội dung với bản đã upload.
8. Thử gửi khi thiếu trường, file, ví đại diện hoặc cam kết: phải chặn, không vào queue.

**Đạt:** nháp tồn tại sau reload, riêng tư; upload không tự gửi/tự xác minh.
Thử riêng số đăng ký bắt buộc khi chọn Tổ chức đã đăng ký.

### 4.2. Gửi → yêu cầu bổ sung → gửi lại — O02, O03, O11

1. OWNER hoàn tất, chọn ít nhất một tài liệu, tích cam kết → **Gửi xác thực**.
   Không popup ký ví/gas ở bước này.
   Chọn file trên máy chưa phải tải lên: nếu còn file đang chọn, nút gửi bị khóa
   đến khi bấm **Tải tài liệu lên** thành công hoặc **Bỏ chọn file**. Khi tải lỗi,
   tên file và loại tài liệu vẫn giữ để thử lại, kể cả bản nháp đã lưu trước đó.
2. Request thành **Đang xét duyệt / UNDER_REVIEW**, khóa field/file. Tổ chức
   mới vẫn **Chưa xác minh / UNVERIFIED**.
3. Reload. Khi thử gửi request mới, bấm nhanh hai lần: chỉ một yêu cầu đang
   mở/một item queue. Ca hai tab/mất response ở mục 4.4.
4. ADMIN → **Xác thực tổ chức · ADMIN** ở sidebar hoặc trang Tài khoản
   (`#/internal/organizations`) → lọc **Đang xét duyệt** → đúng tổ chức.
   Bấm **Xem hồ sơ**. Hàng chờ tự cập nhật mỗi 10 giây khi đang mở; có thể bấm
   **Làm mới danh sách** để đọc ngay. Khi lọc lịch sử, liên kết mở đúng lần gửi.
   Đọc trường/tải file; ADMIN không có ô sửa hộ OWNER.
   Đối chiếu tên file, loại tài liệu và dung lượng KiB với hồ sơ OWNER đã gửi;
   mỗi file phải hiện đúng nhóm danh tính/đại diện/hoạt động/khác.
5. Chọn **Yêu cầu bổ sung**, thử bỏ trống nhận xét/mục thiếu: không ghi được.
6. Điền nhận xét “Cần làm rõ quyền đại diện và căn cứ hoạt động”; mỗi mục thiếu
   một dòng: “Biên bản ủy quyền”, “Căn cứ hoạt động” → **Ghi quyết định**.
7. OWNER giữ trang hồ sơ đang xét duyệt mở: trong khoảng 10 giây khi API hoạt
   động, kết luận tự cập nhật thành **Cần bổ sung / CHANGES_REQUESTED**, người/thời gian/nhận xét
   và danh sách thiếu. Bấm **Chỉnh sửa và gửi yêu cầu mới**.
   Bản nháp không cập nhật định kỳ; kiểm tra nội dung đang nhập chưa lưu vẫn giữ nguyên.
8. Sửa/tải tài liệu, điền **Trả lời yêu cầu bổ sung**, lưu rồi gửi lại.
9. ADMIN đọc yêu cầu mới, mở lịch sử cũ: nội dung/file/lý do cũ giữ nguyên.

**Đạt:** request mới xét dữ liệu mới; lịch sử liên tục, không cần UI organization
v1/v2/v3. Bản đã gửi không bị sửa theo nháp mới. Bổ sung tổ chức không chịu giới
hạn ba version của hồ sơ thực hiện campaign.

### 4.3. ADMIN duyệt, dùng tổ chức mới cho G1 — O12

1. ADMIN mở request UNDER_REVIEW, chọn **Duyệt**.
2. Thiếu một trong bốn xác nhận danh tính/đại diện/hoạt động/liên hệ: không
   duyệt được. Chỉ tích sau khi đọc căn cứ.
3. Điền nhận xét, tóm tắt, lý do, nguồn, phạm vi, giới hạn và thời hạn. Nguồn
   dạng `Biên bản ủy quyền test | TEST-UQ-01`, mỗi nguồn một dòng.
4. Giới hạn ghi rõ hồ sơ hư cấu, chỉ nghiệm thu local. Thời hạn phải ở tương
   lai so với checkpoint B, đủ đi hết G1/G2; form nhập giờ địa phương.
5. **Ghi quyết định**, reload OWNER và ADMIN.

**Đạt:** request **Đã duyệt / APPROVED**; tổ chức **Đã xác minh hồ sơ tổ chức /
VERIFIED**, có ngày xác minh/hết hạn. Không duyệt lần hai cùng request. Lịch sử
bổ sung còn nguyên, không chuyển token/tự duyệt campaign. Chạy G1 với chính
organization mới này để kiểm tích hợp, không thay bằng tổ chức seed sẵn.

### 4.4. Các nhánh tổ chức cần thử thêm

Dùng tổ chức phụ cho ca có thể làm mất hiệu lực. “Có phối hợp” nghĩa là Codex
chuẩn bị account/fixture/lỗi kỹ thuật; bạn không cần tự sửa DB.

| Ca | Cách thử | Kết quả phải thấy | Thực hiện |
|---|---|---|---|
| O04a · hủy | OWNER gửi → Hủy yêu cầu để chỉnh sửa → mở yêu cầu mới | Cũ CANCELLED và giữ snapshot; ADMIN không duyệt được bản đã hủy | Tự thử |
| O04b · cạnh tranh | Hai ADMIN mở cùng request, ghi khác nhau; lặp với OWNER hủy/ADMIN duyệt | Một kết quả cuối, tối đa một record; bên thua đọc lại | Có phối hợp |
| O05 · từ chối | ADMIN Từ chối có lý do → OWNER mở yêu cầu mới | Cũ REJECTED/lý do còn nguyên, không sửa kết luận cũ | Tự thử |
| O02/O11 · hai tab | OWNER mở cùng nháp, A lưu rồi B lưu dữ liệu cũ | Chặn stale revision, không ghi đè âm thầm; tải lại trước thử tiếp | Tự thử cùng account |
| O11 · mất response | Gửi/duyệt bị mất phản hồi sau khi server đã xử lý, tải lại rồi mới retry | Đọc kết quả thật, không nhân đôi request/quyết định | Có phối hợp; offline trước gửi chưa đủ chứng minh |
| O06 · quyền | Donor, OWNER khác, RESOLVER mở URL nháp/đang xét/download; ADMIN là OWNER tự duyệt | Không lộ file/dữ liệu; không tự duyệt; resolver chỉ đọc bộ đã duyệt theo quyền | UI tự thử; API/account nhiều quyền có phối hợp |
| O07 · file/khóa sửa | File >10 MiB, thứ 21, đuôi/MIME giả; sửa/bỏ file lúc UNDER_REVIEW | Từ chối sai, không thay dữ liệu đang xét; lịch sử giữ nguyên | UI tự thử; hash/file khác tổ chức/storage lỗi có phối hợp |
| O08a · sửa sau duyệt | Tổ chức phụ VERIFIED → yêu cầu mới → đổi field quan trọng/danh sách file → lưu | Cần xét duyệt lại, không dùng badge cũ cho dữ liệu mới; record cũ còn đọc được | Tự thử |
| O09 · gia hạn | Yêu cầu mới giữ nguyên field quan trọng/file → gửi; bổ sung/từ chối rồi duyệt bản mới | Xác minh cũ còn hiệu lực đến hạn/thu hồi; duyệt tạo record mới, không rewrite lịch sử | Tự thử khi còn hạn |
| O08b · hết hạn | Đến hạn theo chain, reload tổ chức và request | Tổ chức EXPIRED, request cũ vẫn APPROVED; gửi lại chỉ đổi request mới UNDER_REVIEW | Chờ thật hoặc fixture riêng |
| O08c · đình chỉ | ADMIN → Đình chỉ xác minh, ghi căn cứ; OWNER/resolver reload | SUSPENDED, lý do/lịch sử; thời gian trôi không tự VERIFIED | Tổ chức phụ |
| O08d · RPC lỗi | Làm RPC fixture lỗi rồi đọc hiệu lực | Báo chưa kiểm tra được; không ghi đè trạng thái nghiệp vụ | Có phối hợp |
| O10 · legacy/A | Đọc hồ sơ cũ, so hash/hiệu lực và A trước/sau migration | Nhãn legacy, không dựng request giả, không bypass gửi mới; A giữ nguyên | Codex kiểm kỹ thuật |

Sửa trường quan trọng/file khác với chỉ mở gia hạn hoặc sửa nội dung trả lời.
Hết hạn/đình chỉ không tự STOP campaign hoặc thu hồi tiền; resolver phải xử lý
đúng quyền/trạng thái on-chain.

## 5. Giao dịch và lỗi MetaMask — T04, T16

### 5.1. Các mốc cần phân biệt

| Mốc UI | Ý nghĩa | Chưa được kết luận |
|---|---|---|
| Chờ ký | Chưa gửi tx | Chưa chuyển tiền/đổi trạng thái |
| Có hash / submitted | Đã gửi, chờ receipt | Chưa chắc thành công |
| Receipt success / confirmed | Thành công, còn kiểm event/đồng bộ | Chưa chắc dữ liệu ứng dụng đã cập nhật |
| indexed / Đã xác nhận và đồng bộ thao tác này | Đúng event, indexer theo kịp | Mới đối chiếu trạng thái/số dư nghiệp vụ |
| Revert / failed | Thao tác thất bại | Không mất quyền/counter do tx revert; có thể mất phí ETH |

Donate/return khi thiếu allowance cần hai giao dịch:

1. Bấm thao tác → ký approve → chờ **Allowance đã xác nhận**. Chưa chuyển MockUSDC.
2. Bấm thao tác **một lần nữa** → ký donate/return → chờ receipt và indexed.

Đã đủ allowance thì có thể bỏ bước approve. Nếu đã có hash mà chưa cập nhật,
dùng **Kiểm tra giao dịch đã gửi**; không tạo tx mới chỉ vì chưa thấy tiền/state đổi.

### 5.2. Các ca lỗi cần thao tác thật

| Ca | Thử | Đạt khi |
|---|---|---|
| X01 | Từ chối approve/action rồi thử lại khi còn hạn | Lần từ chối không ghi tiền/quyền; retry được |
| X02 | Ghi hash, reload ngay trước indexed | Khôi phục hash, kiểm tx cũ, không góp/cấp lặp |
| X03 | Đổi account/ví/mạng trong lúc chờ ký | Phiên mới không nhận quyền/thông báo của phiên cũ; giữ hash nếu đã gửi |
| X04 | Bấm nhanh hai lần nhận vốn/chốt, reload | Không cấp hai lần hoặc cộng lặp event |
| X05 | Để popup chờ rồi từ chối/xác nhận, kiểm lại | Không chờ vô hạn/báo chuyển tiền chỉ từ timeout; giữ hash nếu có |
| X06 | Tx pending thật: Speed up/Cancel trong MetaMask | Theo hash thay thế, cancel không thành nghiệp vụ thành công, không tính hai lần |

X06 cần Codex chuẩn bị mining/pending trên môi trường riêng vì Anvil mine rất
nhanh. Không tự tắt automine của chain đang dùng. Không có pending thật thì
ghi TODO/BLOCKED, không lấy test tự động thay PASS thủ công.

Sau một thao tác lặp được đã indexed, nút **Chuẩn bị lượt tiếp theo** cho phép
chuẩn bị donate/return/refund/material mới. Chỉ dùng khi có quyền nghiệp vụ mới;
nút không sinh thêm quyền nhận advance hoặc refund.

## 6. G1 — một đợt, 2.200 MockUSDC, 100 suất — T01

Điều kiện: lượt A hoàn tất, tổ chức còn hiệu lực xác minh, đúng ví đại diện và
resolver. Tạo campaign mới, ghi organization ID, metadata ID, campaign ID và
số dư đầu kỳ; không tiếp tục fixture cũ khi chưa rõ tiền đã chuyển.

### 6.1. Lưu, kiểm dữ liệu, chốt và nộp kế hoạch

1. Organizer → tổ chức → **Quản lý campaign** → **Tạo campaign**.
2. Chọn **G1 · một đợt qua đơn vị**, tên `TEST-B G1 <ngày> <lần>`.
3. Điền mục tiêu, phạm vi nhận, căn cứ đủ điều kiện, công việc. Giữ INSTITUTION,
   ngân sách `2200`, 100 suất, gây quỹ 7 ngày.
4. Hàng hóa mẫu: 2 kg gạo, 1 lít dầu, 5 gói mì mỗi suất; hồ sơ phải khớp sau này.
5. Đọc bốn tiêu chí: số lượng/thành phần; hóa đơn/thanh toán; thẩm quyền nhận;
   chi từ quỹ/tiền dư. Công việc phải gắn tiêu chí và loại chứng từ bắt buộc.
6. **Lưu bản nháp** → reload: dữ liệu giữ nguyên. Thử `0`, `-1`, `1.0000001`
   cho budget, số suất 0, thời gian 0/31 ngày hoặc công việc không gắn tiêu chí:
   phải chặn rõ ràng; sửa lại hợp lệ trước bước tiếp.
7. **Chốt kế hoạch** → ghi plan hash, ví organizer, budget/tiêu chí từng đợt.
   Chốt chỉ đọc, chưa nộp chain/chưa nhận góp.
8. **Nộp kế hoạch on-chain** → ký → chờ indexed: campaign DRAFT trên chain.

**Đạt:** nháp riêng không lộ như campaign công khai; chốt không cho sửa budget,
criteria/ví; sau nộp còn chờ resolver, chưa chuyển vốn.

### 6.2. Resolver đọc hồ sơ tổ chức và duyệt kế hoạch

1. Resolver → `#/internal/campaigns` → đúng campaign.
2. **Lịch sử xác thực tổ chức** → đọc báo cáo ADMIN → **Xem hồ sơ đã được duyệt**.
3. Đối chiếu tên/đại diện/ngày/hạn/file với request ADMIN đã duyệt. **Tải tài
   liệu** rồi mở; không được trỏ nhầm nháp OWNER mới sửa.
4. Đóng/mở phần hồ sơ. Trong lúc kiểm quyền lại có thể thấy **Đang kiểm tra
   quyền đọc hồ sơ đã được duyệt…**; nội dung riêng từ cache phải được ẩn trong
   lúc chờ kiểm. Thu hồi role/503/binding sai kiểm có phối hợp ở mục 10.
5. Màn resolver chỉ đọc, không có sửa hồ sơ hoặc quyết định ADMIN.
6. Chọn **Duyệt kế hoạch**; điền lý do, nguồn `căn cứ | tham chiếu`, phạm vi,
   giới hạn; xác nhận không xung đột lợi ích và đã bỏ dữ liệu nhạy cảm khỏi nội dung công khai.
7. Ký đúng ví resolver → chờ APPROVED được index.

**Đạt:** đúng hồ sơ/kế hoạch, không chuyển tiền. Quyền đọc không thay quyền ví
ký. Hồ sơ legacy có nhãn riêng, không có request mới giả tạo.

### 6.3. Mở gây quỹ, hai donor đóng góp

1. Organizer → **Công bố và mở gây quỹ** → ký → FUNDING. B không có bước nộp
   bond; bond bằng 0. Funding tính từ publish được mine.
2. Donor A đọc campaign công khai, mục tiêu/budget/tiêu chí. Nhập `1100`, approve
   nếu cần rồi bấm/ký donate theo mục 5.1.
3. Chờ indexed, kiểm **Đóng góp của tôi**, reload: A chỉ có contribution 1.100.
4. Khi còn thiếu 1.100, thử `1100.000001`: không được vượt goal. Thử 0/âm/quá
   6 số thập phân: chặn, không âm thầm làm tròn.
5. Donor B góp `1100`. Đủ goal chuyển FIRST_REVIEW ngay, không chờ hết 7 ngày;
   không nhận thêm donation sau khi đủ goal.

| Mốc | A nếu đầu kỳ 10.000 | B nếu đầu kỳ 10.000 | Custody G1 |
|---|---:|---:|---:|
| Trước góp | 10.000 | 10.000 | 0 |
| A chỉ approve | 10.000 | 10.000 | 0 |
| A donate 1.100 | 8.900 | 10.000 | 1.100 |
| B donate 1.100 | 8.900 | 8.900 | 2.200 |

Đầu kỳ khác thì so mức tăng/giảm. Custody là tiền hạch toán **cho G1**, không
phải tổng token balance contract chứa nhiều campaign. Phí ETH ghi riêng.
Resolver không được donate vào campaign do mình xử lý.

### 6.4. Mở quyền cấp đầu và nhận vốn

1. FIRST_REVIEW: organizer thử nhận vốn phải chưa được phép.
2. Resolver đọc lại điều kiện/tổ chức còn hiệu lực → **Xác nhận eligibility cấp
   đầu**, điền căn cứ và ký → ADVANCE_AVAILABLE.
3. Organizer → **Nhận 2200 USDC cho đợt 1** → ký → EXECUTING.
4. Ví đại diện tăng 2.200; tổng advance 2.200; custody G1 về 0.
5. Reload/bấm lặp/dùng ví khác: không nhận lần hai, không đổi người nhận.

**Đạt:** cấp một lần, đúng người/budget. Số dư tăng không chứng minh đã mua/trao
hàng; tiền sau advance không còn trong escrow để tự thu hồi.

### 6.5. Báo cáo và bằng chứng gốc

1. Organizer → **Hồ sơ thực hiện**, đợt 1. Điền thời gian, số suất, phạm vi nhận,
   cách bàn giao/căn cứ người ký, giới hạn kiểm tra.
2. Ghi kết quả từng tiêu chí. Mẫu thành công cần đủ căn cứ 100 suất đúng thành
   phần, đúng đơn vị và người ký có quyền.
3. **Thêm chi phí**: ví dụ `2200`, **Quỹ campaign**, ngày/nội dung khớp hóa đơn
   và thanh toán; nhiều dòng được nhưng tổng vẫn 2.200.
4. Tự tài trợ ghi riêng **Tổ chức tự chi/Nguồn khác**. Campaign 2.150 + tự chi 50
   vẫn dư campaign 50, không ghi thành chi campaign 2.200.
5. **Lưu báo cáo**, reload. Chọn loại chứng từ/file → **Lưu và tải bản gốc**;
   kiểm file gắn đúng tiêu chí/chi phí.
6. Chuẩn bị các loại theo plan: REPORT, PHOTO, INVOICE, PAYMENT_PROOF,
   DELIVERY_RECORD. Đủ số file không tự chứng minh nội dung đạt.
7. Thử file sai/quá giới hạn trên nháp: lỗi rõ, dữ liệu cũ không mất.

**Đạt:** lưu/upload không tự nộp chain/nghiệm thu. File mở lại được, nhất quán
về tiền, số suất, đợt, ngày và người ký.

### 6.6. Chốt phiên bản, bản công khai và nộp chain

1. Đọc lại → **Lưu và chốt phiên bản**. Ghi package ID, version 1, hash.
   Nội dung chỉ đọc, còn **Đã chốt, chưa nộp on-chain**.
2. Chọn bản đã che cho từng file gốc, tóm tắt công khai, tích xác nhận đã che
   dữ liệu nhạy cảm → **Chốt bản công khai**.
3. Ghi hash bản công khai riêng với hash original. Không công khai original
   có dữ liệu riêng chỉ để vượt bước kiểm tra.
4. **Nộp hồ sơ version 1 on-chain** → ký → EVIDENCE_REVIEW đúng version/hash.
5. Donor tải bundle công khai, kiểm đúng đợt và nội dung đã che. Donor/khách
   không tải được original; resolver có quyền đọc original đúng hồ sơ.

**Đạt:** phân biệt upload, freeze, public bundle và submit chain. Không chuyển
vốn ở các bước này. Giữ ảnh trước/sau nộp và hash.

### 6.7. Resolver kết luận, chưa hoàn tất ngay

1. Resolver mở version 1, tải original/public, đối chiếu đủ bốn tiêu chí.
2. Mỗi tiêu chí có outcome, lý do, nguồn, giới hạn và file đã đọc. Không MET
   chỉ vì upload thành công/hash đúng.
3. Dữ liệu thành công không dư: MET tổng hợp, **Chi từ campaign được chấp nhận**
   = `2200`; điền căn cứ và xác nhận công khai/xung đột lợi ích.
4. **Kết luận hồ sơ thực hiện** → ký → CHALLENGE_WINDOW, unused = 0.
5. Organizer chốt ngay phải bị khóa vì còn phản đối. Không nhận thêm 2.200.

**Điểm dừng hợp lệ:** chụp challengeEnd/finalizeEnd, ghi IN_PROGRESS. Pilot là
3 ngày chain; xem mục 9 để phối hợp fixture thời gian riêng. Không tự chỉnh
đồng hồ B để coi G1 đã PASS.

### 6.8. Chốt đợt cuối và đối chiếu

1. Khi `challengeEnd <= thời gian chain < finalizeEnd`, chưa hardStop, không
   case pending, reload/đọc checkpoint mới.
2. **Chốt nghiệm thu đợt cuối** → ký → COMPLETED được index.
3. So ví organizer trước/sau finalize: **không nhận thêm 2.200 token**.
4. Góp 2.200, cấp 2.200, return 0, refund 0, custody 0, base pool 0.
5. Donor xem **Hoàn tiền sau kết thúc**: không token để nhận hiện tại, không
   hứa refund 100%; quyền supplement tương lai còn nếu organizer return muộn.
6. Reload OWNER/resolver/donor: state, hồ sơ và lịch sử nhất quán.

**G1 PASS** khi đủ 6.1–6.8 và có bằng chứng. INSTITUTION nghiệm thu phạm vi bàn
giao cho đơn vị, không tự suy tất cả cá nhân cuối cùng đã nhận.

```text
DRAFT → APPROVED → FUNDING → FIRST_REVIEW → ADVANCE_AVAILABLE
      → EXECUTING → EVIDENCE_REVIEW → CHALLENGE_WINDOW → COMPLETED
```

## 7. G2 — ba đợt, tổng 3.300 MockUSDC — T02

Campaign riêng, mẫu **G2 · ba đợt trao trực tiếp**, mỗi đợt `1100`, 50 suất,
DIRECT. Mỗi donor góp `1650`. Lặp lưu/chốt/nộp/duyệt/publish và first eligibility
như G1; dùng số dư đầu kỳ mới.

1. Nhận đợt 1: organizer tăng 1.100; đợt 2 chưa nhận được.
2. Hồ sơ riêng đợt 1 → MET → hết phản đối → chốt đợt 1.
3. Chốt không chuyển token. Sau đó ký **Nhận 1100 USDC cho đợt 2** riêng.
4. Đợt 2 thử nội dung cần làm rõ → NEEDS_INFORMATION → version 2 → xét lại
   theo mục 8.1. Tổng advance vẫn 2.200, không cấp lại vì bổ sung.
5. Chốt đợt 2 đủ điều kiện rồi nhận đợt 3.
6. Đợt 3 vẫn nộp/xét/hết phản đối/chốt cuối; custody 0 không có nghĩa đã nghiệm thu.

| Mốc | Tổng đã cấp | Custody nếu chưa return/refund | Cần kiểm |
|---|---:|---:|---|
| Đủ goal | 0 | 3.300 | Không tự cấp |
| Nhận đợt 1 | 1.100 | 2.200 | Không nhận đợt 2 ngay |
| Chốt đợt 1 | 1.100 | 2.200 | Chỉ mở quyền đợt tiếp |
| Nhận đợt 2 | 2.200 | 1.100 | Bổ sung không cấp lại |
| Chốt đợt 2 rồi nhận đợt 3 | 3.300 | 0 | Đúng thứ tự, không gộp |
| Chốt đợt 3 | 3.300 | 0 | COMPLETED, không có lần cấp thứ tư |

**Đạt:** mỗi đợt đúng 1.100, chỉ cấp tiếp sau finalized acceptance và đủ return
unused. File/version cũ còn đọc được. DIRECT kiểm trao đúng đối tượng trong
phạm vi cam kết. Lưu bằng chứng từng mốc, không chỉ ảnh COMPLETED.

### 7.1. Liên kết xét duyệt phải đúng đợt — T04

Dùng tài khoản RESOLVER và metadata ID của G2 lấy từ URL hồ sơ nội bộ
`#/internal/campaigns/<metadataId>`; không thay bằng campaign ID trên chain.

1. Khi G2 đang ở đợt 2, mở `#/internal/milestones/<metadataId>/0`.
   Chỉ số URL bắt đầu từ 0 nên đây là liên kết đợt 1.
2. Phải thấy **Đợt trong đường dẫn không phải đợt hiện tại**, không hiện biểu
   mẫu quyết định cho đợt 2 dưới liên kết cũ. Bấm **Mở hồ sơ hiện tại** mới
   chuyển sang hồ sơ campaign đang xét.
3. Mở `#/internal/milestones/<metadataId>/99`: phải thấy **Không tìm thấy đợt**,
   không hiện biểu mẫu quyết định.
4. Mở chỉ số đúng đợt hiện tại (đợt 2 là `/1`): đọc đúng đợt/version; quyền ký
   vẫn phụ thuộc trạng thái, hạn và ví resolver. Nếu đợt thay đổi khi trang
   cập nhật, liên kết cũ phải ngừng hiện biểu mẫu cho đợt khác.

**Đạt:** không âm thầm xét nhầm đợt; không cần ký giao dịch để kiểm các liên kết sai.

## 8. Nhánh nghiệp vụ trên campaign riêng

Các số dưới đây dùng hai donor góp **50%/50%**. Nếu dùng trọng số khác phải
tính lại; không lấy trace 60%/40% ở tài liệu khác để so lượt này.

### 8.1. Thiếu hồ sơ và bổ sung — T05, T06, T10

1. Nhận vốn, nộp hồ sơ cần làm rõ: căn cứ hóa đơn thiếu, chỉ 90/100 suất,
   người ký chưa rõ thẩm quyền hoặc ảnh có dấu hiệu dùng lại.
2. Nếu validation chặn trước submit, ghi guard đó. Để thử reviewer, dùng hồ sơ
   hợp lệ cấu trúc nhưng thiếu căn cứ nội dung, không sửa DB để vượt guard.
3. Resolver ghi tiêu chí thiếu, chọn NEEDS_INFORMATION khi còn có thể bổ sung;
   không MET cho hồ sơ chưa đủ căn cứ.
4. Indexed → SUPPLEMENT_DUE, hạn bổ sung trên chain; chưa mở cấp tiếp.
5. OWNER chốt/nộp version 2. Bản 1, hash/review/liên kết bản trước giữ nguyên;
   không sửa bytes cũ, không nhận thêm ngân sách.
6. Resolver xét version 2; đủ căn cứ mới MET, chưa đủ thì kết luận phù hợp.
7. Campaign phụ thử hết version 1 → 2 → 3. Không có version 4; quá hạn/hết khả
   năng bổ sung phải STOP/timeout, không tự đạt.

**Đạt:** tối đa ba bản/đợt, gồm hai lần bổ sung. Hash bảo vệ bytes/định danh,
không tự phát hiện mọi nội dung giả. Ảnh dùng lại cần reviewer đối chiếu và ghi
kết luận; không kỳ vọng hệ thống tự phát hiện bằng AI.

### 8.2. Phản đối và ba kết quả case — T08

Dùng ba campaign/fixture độc lập cho CONTINUE, RESUBMIT và STOP. Bắt đầu ở
CHALLENGE_WINDOW sau MET; A/B đã góp.

1. A → **Phản đối theo hồ sơ hiện tại**, ghi lý do/nguồn/giới hạn, tích xác
   nhận công khai → **Mở case**, ký trước challengeEnd.
2. Chờ CASE_OPEN: không chốt nghiệm thu/nhận đợt tiếp.
3. B **Nộp thông tin bổ sung** trước responseEnd. Người chưa góp không có quyền
   này; resolver có thể mở case kỹ thuật theo quyền riêng.
4. Organizer → **Phản hồi của tổ chức** → căn cứ → **Nộp phản hồi** trước
   responseEnd; chỉ một phản hồi on-chain, không nộp lần hai.
5. Resolver đọc case/material/response. Trước responseEnd chưa được kết luận;
   sau responseEnd và trước resolutionEnd mới **Xử lý case**.
6. Ghi lý do/nguồn/phạm vi/giới hạn và ký:

| Kết quả | Tiếp theo | Đạt khi |
|---|---|---|
| CONTINUE | Đọc original/public đúng hash đang truy cập được; chờ cửa sổ mới rồi finalize | Giữ MET, đủ 3 ngày đọc lại trong hardStop, không cấp lại tiền, không case thứ hai cùng version |
| RESUBMIT | OWNER nộp version kế đúng hạn, resolver xét lại | Giữ lịch sử case/bản cũ, không mở cấp tiếp hoặc vượt version 3 |
| STOP | Donor xem refund | Snapshot đúng custody, ngừng cấp mới; return/refund vẫn hoạt động |

Không phản hồi không tự chứng minh gian lận/đạt. Không có appeal/case thứ hai
cùng version sau CONTINUE. Vấn đề mới cần resolver xem xét STOP trước finalize;
ghi nhận giới hạn này. Ca sát/bằng/sau deadline làm trên fixture riêng ở mục 9–10.

### 8.3. G1 dư 50, return trước khi chốt — T01, T13

1. Đã nhận 2.200; hồ sơ ghi chi campaign `2150`, unused 50, chứng từ khớp.
2. Resolver MET chi được chấp nhận 2.150. Hết phản đối nhưng chưa return:
   **Chốt nghiệm thu đợt cuối** phải bị chặn.
3. Organizer → **Trả tiền vào escrow**, đợt 1, nhập `50`.
4. Ký approve nếu cần rồi bấm/ký return. Token về thật mới R = 50, E = 50.
5. Chốt đúng hạn → COMPLETED, P0 = 50, S = 0.
6. A/B → **Hoàn tiền sau kết thúc** → đúng ví góp, mỗi người nhận `25`.
7. Sau cả hai: F = 50, E = 0; claim lại khi chưa có quyền mới bị chặn.

**Đạt:** khai unused không tự tăng escrow; finalize không cấp thêm advance.
Có thể thử trả 20 trước: còn thiếu 30 vẫn không chốt được. Trong G2, thiếu
return cũng chặn cấp tiếp nhưng không đổi budget đợt tiếp.

### 8.4. STOP sau cấp đợt 2 G2, refund và return muộn — T11, T13

1. G2 đủ 3.300, đợt 1 đã nghiệm thu, đã nhận đợt 2: advance 2.200, E = 1.100,
   chưa return.
2. Resolver **Dừng campaign**, có lý do, ký → STOPPED.
3. P0 = 1.100, S = 0; không nhận đợt 3. Mỗi donor có base 550.
4. A nhận 550: B còn quyền 550, E = 550. B nhận xong: E = 0.
5. Organizer chọn đợt đã advance còn trong cap, return `50` sau snapshot:
   P0 vẫn 1.100, S = 50, E = 50; mỗi người có thêm 25 dù đã nhận base.
6. A/B nhận supplement 25. Return tiếp `110`: S **tích lũy = 160**, mỗi người
   tổng supplement 80, đã nhận 25, còn nhận thêm **55**.
7. A/B nhận thêm 55: R = 160, F = 1.260, E = 0; campaign vẫn STOPPED.

Đối chiếu: `3.300 + 160 = 2.200 + 1.260 + 0`.
Không refund phần 2.200 đã cấp nếu organizer chưa trả thật; không reset base
hoặc coi S chỉ bằng lần return mới nhất.

### 8.5. G1 STOP với custody 0 — T12

1. G1 đã nhận hết 2.200; resolver STOP trước hoàn tất, chưa return.
2. P0 = 0, claimable = 0; không hứa refund đủ contribution.
3. Nếu có **Ghi nhận quyền base bằng 0**, thử bằng một donor: tốn gas, không
   nhận token, vẫn còn quyền supplement tương lai.
4. Organizer return `50`: S = 50; mỗi donor nhận 25, kể cả người đã xử lý base
   0. Nhận xong không claim lặp khi không có quyền mới.

**Đạt:** UI giải thích tiền không còn trong escrow. STOP không lấy tiền ví
organizer; return muộn mở quyền refund, không khôi phục execution.

### 8.6. Funding thiếu, hủy trước cấp và ví không góp — T03, T14

- Mục tiêu 2.200, chỉ A góp 1.100. Trước fundingEnd chưa timeout được; sau hạn
  gọi **Xử lý trạng thái quá hạn** → STOPPED, P0 = 1.100. A nhận 1.100; B không
  góp nên không có quyền claim.
- Campaign riêng có tiền nhưng chưa advance: OWNER **Hủy trước lần cấp vốn đầu**,
  snapshot custody, donor nhận đúng tỷ lệ. Sau advance không dùng hủy để giả
  lập thu hồi; phải qua resolver STOP/timeout.
- Campaign không donor bị hủy: pool 0, không chia 0 hoặc hứa refund.
- Dùng ví khác nhận refund: bị chặn; recipient luôn là chính ví góp.

### 8.7. Return sai và làm tròn — T13, T14

Trên campaign phụ, thử return 0/âm/quá 6 chữ số thập phân, đợt chưa advance,
hoặc vượt `advance đợt - đã return đợt`: chặn, counters không đổi. Không chuyển
ERC20 trực tiếp tới contract để thay **Trả tiền vào escrow**; chuyển trực tiếp
không tạo return hạch toán cho campaign.

Codex chuẩn bị fixture units nhỏ: C = 10, A/B góp 3/7, đã cấp 3, P0 = 7.
Base A/B = 2/4, dư làm tròn 1 unit. Return muộn tổng 3 units tạo supplement A/B
= 0/2; sau nhận đủ quyền hiện tại, F = 8, E = 2 units.
**1 unit = 0,000001 MockUSDC**. Nếu B chưa claim, quyền của B là nghĩa vụ chưa
trả, không phải dust. Không sweep cho ADMIN/organizer.

## 9. Deadline và timeout — T03, T08–T10

Dùng timestamp/checkpoint blockchain, không dùng giờ máy hoặc thời gian lưu
nháp/upload để mở quyền. Ghi deadline cùng checkpoint khi test.

| Hạn | Mốc bắt đầu | Pilot | Nếu bỏ lỡ |
|---|---|---|---|
| Funding | Publish mined | 1–30 ngày theo plan; mẫu 7 ngày | Thiếu goal → timeout, snapshot custody |
| Eligibility đầu | Đạt goal | 3 ngày | Resolver vắng → timeout STOP |
| Claim advance | Eligibility đầu / finalized đợt trước | 7 ngày | Không claim → timeout STOP |
| Hồ sơ đầu | Advance mined | 30 ngày | Không nộp → timeout STOP |
| Review version | Submit mined | 3 ngày | Không review → STOP, không tự MET |
| Bổ sung | NEEDS_INFORMATION/RESUBMIT mined | 7 ngày, tối đa hai lần | Không kéo vòng vô hạn |
| Phản đối/đọc lại | MET + availability statement / CONTINUE mined | 3 ngày | Hết cửa sổ mới xét finalize |
| Material/response | Open case mined | 3 ngày | Không nhận phản hồi mới sau hạn |
| Resolve case | Hết response window | Thêm 3 ngày | Quá hạn → timeout STOP |
| Finalize/return unused | Hết challenge window | Thêm 7 ngày | Không chốt/trả đủ → timeout STOP |
| Hard stop đợt | Advance mined | 60 ngày | Chỉ timeout, không tiếp tục đợt |

Hạn của đợt được cap tại hardStop. MET/CONTINUE không được mở cửa sổ ngắn hơn
3 ngày để né hardStop. Thao tác thường `now < deadline`, timeout `now >= deadline`;
finalize `challengeEnd <= now < finalizeEnd`, không case pending. Đúng hardStop
không được finalize để vượt hạn.

Cách nghiệm thu mỗi nhánh không hoạt động:

1. Campaign phụ ở đúng state; ghi counter tiền/deadline.
2. Actor không làm tiếp; trước hạn, timeout chưa được phép.
3. Đến hạn, reload/check checkpoint → **Xử lý trạng thái quá hạn**.
4. Ký, chờ STOPPED; P0 bằng custody, không tự bù advance đã ra.
5. Không cấp mới, return/refund tiếp tục đúng.

Hết giờ không tự ghi STOP lên chain: cần giao dịch xử lý. Muốn test chính xác
trước/bằng/sau một giây hoặc không chờ nhiều ngày, Codex chuẩn bị fixture/fork
riêng và nêu môi trường. Ghi đúng phạm vi quan sát; không chỉnh giờ chain B
đang có campaign để rút ngắn nghiệm thu.

## 10. Ca kỹ thuật cần phối hợp

Các ca có kiểm tra tự động được ghi riêng trong tiến độ; phần quan sát/nghiệm
thu thật vẫn cần bằng chứng riêng. Bạn gửi mã ca, Codex chuẩn bị fixture và
hướng dẫn thao tác cần thiết. Không yêu cầu bạn sửa DB, reset chain, xóa
storage hoặc cài token lỗi vào deployment B đang dùng.

| Ca | Codex chuẩn bị/kiểm | Bạn quan sát | Đạt khi |
|---|---|---|---|
| K01 · quyền O06 | Gọi API request/list/download ngoài quyền; thu hồi role sau khi đã đọc | Đóng/mở hồ sơ, tải tiếp | Từ chối đúng quyền, không tái dùng cache riêng hoặc lộ file |
| K02 · cache dossier | Phản hồi chậm, 403/503, binding/hash sai trên môi trường thử | Xem hồ sơ đã được duyệt → đóng/mở → Tải lại hồ sơ | Chờ kiểm quyền thì ẩn nội dung cũ; lỗi không giữ nút tải file cũ; phục hồi đọc đúng request |
| K03 · cạnh tranh O04 | Hai ADMIN/cancel–approve, lỗi transaction DB | Reload OWNER/ADMIN | Một kết luận, không APPROVED thiếu record/audit hoặc duyệt hai lần |
| K04 · file O07 | MIME/bytes/hash sai, file tổ chức khác, storage lỗi, API sửa UNDER_REVIEW | Lỗi, file/lịch sử giữ nguyên | Server chặn, upload lỗi không thành nộp thành công |
| K05 · lỗi dịch vụ T18 | Ngắt từng RPC/storage/indexer trên fixture riêng rồi phục hồi | Phân biệt lỗi tầng; receipt đã success nhưng indexer chưa theo kịp | Giữ hash, đọc lại được, không gửi lặp, số dư/quyền/file nhất quán |
| K06 · replay/reorg T17 | Replay, reorg, chain/deployment identity sai ở chain riêng | Báo cần đối chiếu khi không canonical | Không nhân đôi góp/advance/return/refund; sai identity không ký tiếp |
| K07 · token T15 | Token false/revert/callback trên deployment test | Tx fail, quyền còn nếu còn hạn | Rollback counter/quyền, không reentrancy lấy thêm; gas có thể mất |
| K08 · deadline | Trước/bằng/sau deadline/hardStop; case và finalize cạnh tranh | Nút/lý do/state khớp chain | Không mở sớm/bỏ response hoặc challenge window |
| K09 · dust T14 | Fixture units nhỏ mục 8.7 | Claimable/supplement/custody | Tổng claim không vượt pool; không nhầm unclaimed với dust |
| K10 · replaced T16 | Mining chậm, tx thay thế | Thao tác X06 bằng MetaMask | Theo hash cuối, cancel/sai event không thành nghiệp vụ thành công |
| K11 · legacy/A O10 | Migration/API cũ/baseline A | Đọc legacy nếu cần | Không mất hồ sơ/đổi nghĩa vụ A/bypass request mới |

Public bundle lỗi trước MET phải chặn kết luận đạt. Bundle hỏng trong cửa sổ
phản đối cần donor/resolver mở case kỹ thuật **on-chain trước hạn**; HTTP 503
không tự dừng đồng hồ contract. Khôi phục đúng bytes mới CONTINUE. Nếu UI hứa
tự khóa tiền chỉ vì storage lỗi, ghi FAIL.

## 11. Người xét hồ sơ và số liệu nghiên cứu — T07, I3

Tách việc đo quyết định người thật khỏi test nút/kế toán G1/G2. Hash/chữ ký hợp
lệ vẫn có thể chứa kết luận sai; contract PASS không chứng minh phát hiện được
gian lận ngoài đời.

### 11.1. Cách làm

1. Đọc `.local/workflow-b/reviewer-corpus-v3/reviewer/README.txt`.
   Hiện có 12 mã mẫu trung tính, mỗi mẫu cần C1, C2, C3, C4 và OVERALL.
2. Không đọc `evaluator-reference.json` trước khi chốt quyết định. Đó là nhãn
   người tạo mẫu, chưa là sự thật được xác minh độc lập.
3. Ghi giờ bắt đầu, đọc PLAN/REPORT/chứng từ/nguồn/ảnh, đối chiếu từng tiêu chí.
   PHOTO là minh họa hư cấu, không phải ảnh thực địa.
4. Chọn MET / NEEDS_INFORMATION / NOT_MET / INCONCLUSIVE theo căn cứ; ghi
   reason/sources/limits cho từng tiêu chí và tổng thể, ghi giờ kết thúc thật.
5. Điền `.local/workflow-b/reviewer-corpus-v3/reviewer-decisions.csv`.
   Nếu nhiều reviewer, mỗi người có ID riêng, đủ năm dòng/mẫu mình xét.
6. Người tạo mẫu không tự nhận là reviewer độc lập. Không tự điền MET để đủ
   dòng; không dùng thời gian chạy script làm thời gian đọc hồ sơ.

### 11.2. Cột CSV

| Cột | Cách điền |
|---|---|
| reviewer_id | Mã người xét, ví dụ RV01; không cần tên thật |
| sample_id | Đúng mã thư mục, không đổi theo kết luận |
| criterion_id | C1 / C2 / C3 / C4 / OVERALL |
| outcome | MET / NEEDS_INFORMATION / NOT_MET / INCONCLUSIVE |
| reason | Lý do từ hồ sơ, không chỉ lặp outcome |
| sources | File/trang/chi tiết đối chiếu |
| limits | Điều chưa kiểm được, cả giới hạn dữ liệu hư cấu |
| started_at / finished_at | ISO có múi giờ, ví dụ `2026-10-10T09:00:00+07:00`; giờ thật |
| independent_reviewer | `true`/`false` đúng vai trò thực |

Mọi cột đều cần dữ liệu; dòng OVERALL ghi thời gian cả mẫu. Khi sửa bằng text
editor, quote ô có dấu phẩy và giữ UTF-8 để không vỡ cột.

Sau khi bạn điền, Codex tổng hợp tại gốc repo:

```powershell
wsl.exe python3 backend/scripts/workflow-b/reviewer-results.py
```

Kết quả ở `.local/workflow-b/reviewer-results.json`. Tại mốc soạn hướng dẫn,
CSV có 60 dòng mẫu, **0 kết luận đã nhập**. Chưa có dữ liệu thì tỷ lệ false
acceptance/rejection chưa xác định, không phải 0%. Khi có kết quả cần ghi mẫu
số, phần chưa đủ dữ liệu và giới hạn nhãn tham chiếu hư cấu.

## 12. Bằng chứng và điều kiện hoàn tất

### 12.1. Mẫu biên bản từng ca

Lưu local, ví dụ `.local/workflow-b/manual-results/<ngay>-<lan>/`. Copy mẫu:

```text
Mã ca / bước: G1-6.4 hoặc O03 / X02 / T11...
Trạng thái: TODO | IN_PROGRESS | BLOCKED | PASS | FAIL
Ngày giờ + múi giờ:
Brave / MetaMask phiên bản:
URL / chain ID / deployment ID:
Account + quyền:
Ví đang kết nối / ví bắt buộc:
Organization ID / request ID:
Metadata ID / campaign ID / đợt / evidence version:
Checkpoint block / chain timestamp / deadline:
Điều kiện, số dư/counters trước:
Các bước + dữ liệu nhập:
Kết quả mong đợi:
Kết quả thực tế:
Tx hash approve (nếu có):
Tx hash nghiệp vụ / hash thay thế (nếu có):
Receipt: chưa có | success | revert
Indexer: chưa đồng bộ | đã đồng bộ tại block...
Số dư/counters sau:
File/ảnh bằng chứng + thông báo lỗi nguyên văn:
Phần chưa thử / bước tiếp:
```

Off-chain ghi tx/receipt “không áp dụng”, dùng request ID, state và lịch sử.
Không đòi hash ví cho lưu nháp hay ADMIN duyệt tổ chức.

Báo lỗi vào chat tối thiểu: **mã bước + URL + account/ví + ảnh/thông báo + tx
hash nếu có**. Không gửi seed/private key, mật khẩu, cookie/token phiên hoặc
URL có chữ ký truy cập file. HAR/log thô có thể chứa thông tin này.

### 12.2. Đối chiếu phạm vi, không bỏ sót

Ghi kết quả kỹ thuật và thủ công ở hai cột riêng trong biên bản. Không thay
PASS của người thao tác bằng PASS tự động.

| Phạm vi | Mục cần làm | Bằng chứng chính |
|---|---|---|
| M01–M06 | 3 | Account/ví/mạng, số dư, từ chối/timeout, quyền/gỡ có bảo vệ |
| O01–O03 | 4.1–4.2 | Nháp riêng, một request gửi, bổ sung và lịch sử |
| O04–O07 | 4.4, K01/K03/K04 | Hủy/cạnh tranh/từ chối, quyền API/file, khóa sửa |
| O08–O10 | 4.4, K05/K11 | Hết hạn/đình chỉ/sửa/gia hạn, legacy/A |
| O11–O12 | 4.2–4.4 và G1 | Reload/mất response, G1 từ tổ chức mới được duyệt |
| T01 | 6, 8.3 | G1 hoàn tất, finalize không cấp hai lần |
| T02 | 7 | Ba đợt đúng thứ tự, nghiệm thu đợt cuối |
| T03 | 8.6, 9 | Funding thiếu/quá hạn/refund |
| T04 | 5, 6.4, 7–7.1 | Sai ví/trước phép/sai đợt/lặp không nhận vốn; URL không xét nhầm đợt |
| T05–T06 | 6.5–6.6, 8.1 | Thiếu/sai nội dung, file/hash/version, lịch sử |
| T07 | 11 | Quyết định reviewer, thời gian/nguồn/giới hạn thật |
| T08 | 8.2, 9, K08 | Case/material/response, ba kết quả, biên thời gian |
| T09–T10 | 8.1, 9 | Không làm/nộp/review/hết lượt, timeout |
| T11 | 8.4 | STOP G2 P0 1.100, mỗi người 550 với góp bằng nhau |
| T12 | 8.5 | STOP G1 P0 0, return muộn mở quyền |
| T13 | 8.3–8.5, 8.7 | Return thực nhận, base cố định, supplement tích lũy |
| T14 | 8.6–8.7, K09 | Đúng ví/không lặp, rounding/unclaimed |
| T15 | K07 | Transfer fail/callback rollback, bằng chứng kỹ thuật |
| T16 | 3, 5, K10 | Brave popup/reload/đổi ví/pending/replaced/cancel |
| T17–T18 | K05/K06 và public bundle | Replay/reorg/identity, dịch vụ lỗi/phục hồi |

### 12.3. Điều kiện đóng nghiệm thu hiện tại

Các điều kiện này áp dụng cho giai đoạn nghiệm thu sau; goal triển khai đã đóng
theo phạm vi người dùng chọn ngày 2026-10-11. Chưa đạt các điều kiện dưới đây
không làm mất mốc bàn giao triển khai, nhưng vẫn chưa được gọi là nghiệm thu đạt.

- Tài khoản/ví và onboarding có thao tác thật; resolver đọc được đúng hồ sơ đã
  duyệt, quyền/lịch sử đúng, không chỉ có ảnh badge VERIFIED.
- G1/G2 hết hành trình đến COMPLETED, có tx/receipt/indexed và số dư từng mốc.
- Bổ sung/case/STOP/refund/return muộn có kết quả/đối chiếu. Deadline/dịch vụ
  cần fixture có bằng chứng riêng, không bỏ trống.
- T01–T18 và O01–O12 được đối chiếu cả kỹ thuật/thủ công. FAIL sửa rồi thử lại;
  phần BLOCKED/TODO vẫn liệt kê trung thực, chưa đóng I3/OI1 nếu còn thiếu.
- Có quyết định/thời gian người xét thật để tổng hợp nghiên cứu. Chưa có dữ
  liệu thì phần này chưa hoàn thành.

Codex cập nhật acceptance/progress từ biên bản và báo cáo. Local pilot hoàn tất
không tự xác minh tổ chức ngoài đời, bảo đảm mọi evidence đều đúng hoặc cho
phép tự triển khai lên mạng công khai.
