# FundTogether Editions — Cơ chế hiện tại và hướng dẫn test tay

Ngày đối chiếu code/runtime: **15/10/2026**. Phạm vi: **MVP local, chain 31339, MockUSDC**.

## 1. MVP đang hoàn thiện đến đâu?

R0–R5 đã triển khai và chuyển runtime chính sang Editions: một campaign `COMICS_ARTBOOK`, một gói `STANDARD`, một `DIGITAL_DOWNLOAD` dạng PDF. Luồng tạo hồ sơ → review → pledge → sản xuất → duyệt PDF → tải → payout/refund đã có kiểm thử tự động.

**Có thể bắt đầu nghiệm thu tay local. Chưa có kết luận “đã nghiệm thu hoàn toàn” hoặc “sẵn sàng mở công khai”.**

| Bằng chứng hiện có | Kết quả đã ghi nhận |
| --- | --- |
| Editions backend | 76 test đạt |
| Toàn backend | 195/195 test đạt; 20/20 suite đạt |
| Frontend | 29 test đạt; lint/build đạt |
| Contract | 30 test đạt, gồm 18 test Editions và fuzz; pledge, challenge và payout đã kiểm tra tại một giây trước và đúng deadline |
| Browser tự động | 6 checkpoint đạt; dùng ví Anvil được chèn vào browser, Creator verification là fixture |
| Chuyển runtime R5 | Migration 0005 và đối soát lịch sử đã đạt; runtime trước reset được sao lưu đầy đủ, runtime test tay hiện tại dùng DB/storage sạch |
| Đồng hồ runtime hiện tại | Chain 31339 đã tạo lại ở giờ hiện tại; các suite tự động có tua giờ đều snapshot/revert và không đổi chain head |
| MetaMask thủ công, chất lượng PDF, xác minh Creator/IP ngoài đời | Chưa nghiệm thu; phải ghi kết quả riêng |

Hai fixture gỡ ví cũ đã được cập nhật theo truy vấn Editions. Lỗi cache thật khi đổi tài khoản/đăng xuất cũng đã được sửa: cả dữ liệu `reward-*` và dữ liệu Creator riêng tư `my-reward-*` đều bị huỷ; request đang chờ của tài khoản cũ bị abort. Mục 7 vẫn phải được nghiệm thu tay với MetaMask thật.

Runtime cũ có block ở năm 2033 đã được sao lưu tại `.local/reward/reset-backups/2026-10-13-chain-clock-reset`, gồm snapshot chain, dump PostgreSQL, dữ liệu MinIO và manifest. Thư mục này có dữ liệu riêng tư local và phải tiếp tục được ignore. Runtime đang chạy là môi trường test tay mới; tài khoản, role, campaign và file cũ không xuất hiện trong DB/storage hiện tại.

File này là **kịch bản**, không phải biên bản đã PASS. Các ô nghiệm thu bên dưới bắt đầu ở `NOT_RUN`.

## 2. Cơ chế đang chạy

### 2.1. Vai trò và thẩm quyền

| Vai trò | Làm được gì? | Không có quyền gì chỉ nhờ vai trò này? |
| --- | --- | --- |
| Tài khoản thường / Community | Xem cam kết công khai, gửi nhận xét/báo sự cố có tài khoản | Không tự duyệt, khóa tiền, tải PDF của người khác |
| Creator | Xin xác minh hồ sơ/IP, tạo và khóa campaign, nộp bằng chứng/PDF, hủy trước payout | Không tự xác minh hồ sơ hoặc tự duyệt campaign/release; không rút ứng trước |
| ADMIN | Duyệt hồ sơ Creator độc lập qua API/UI | Không mặc nhiên là Resolver hoặc có quyền chuyển token |
| RESOLVER trong DB | Xem hồ sơ/file riêng tư để review, duyệt campaign và đọc phản hồi | Không tự có quyền ký tài chính trên contract |
| Primary Resolver trên contract | Ký duyệt terms chính xác; duyệt sản xuất/PDF và xử lý challenge | Không đổi ví nhận tiền hay sửa cam kết đã khóa |
| Backup Resolver trên contract | Tiếp quản review sản xuất/PDF/challenge sau 7 ngày chờ của yêu cầu tương ứng | Không ký duyệt phát hành ban đầu thay Primary |
| Backer | Pledge một lần/ví/campaign, nhận quyền PDF, challenge đúng hạn, claim refund đủ điều kiện | Không chuyển entitlement sang tài khoản khác hoặc nhận tiền hai lần |

Creator là hồ sơ `VERIFIED` của tài khoản, không cần tạo tổ chức hoặc cấp role `OWNER`. Với thao tác Resolver qua giao diện, cần **cả role `RESOLVER` của tài khoản lẫn đúng ví được contract cho phép**, đã liên kết bằng chữ ký.

### 2.2. Ba nơi giữ dữ liệu

```text
Browser / ví
  ├─ API → PostgreSQL: tài khoản, hồ sơ, snapshot, review, quyền được index
  ├─ API → MinIO: file mẫu, bằng chứng và PDF riêng tư
  └─ Contract: escrow, pledge, quyết định on-chain, challenge, payout/refund

Contract → event canonical → indexer → PostgreSQL → UI
```

Hash ràng buộc đúng nội dung đã nộp; hash không chứng minh tác phẩm hay, có bản quyền hoặc đã được đọc. Resolver phải mở file và kiểm tra thực tế.

### 2.3. Trạng thái hồ sơ khác trạng thái tiền

```text
Hồ sơ trong DB:
DRAFT → FROZEN → UNDER_REVIEW → APPROVED → ACTIVATION_PENDING → FUNDING
                       ├─ Yêu cầu sửa → DRAFT, giữ lịch sử review
                       └─ Từ chối → STOPPED

Contract Editions:
Primary ký approveCampaign → Creator ký createCampaign
  → FUNDING (0)
  → hết hạn, gọi finalizeFunding
       ├─ đủ goal → ACTIVE (1)
       │    → nộp + duyệt production evidence
       │    → nộp PDF → RELEASE_REVIEW (2)
       │         ├─ từ chối → ACTIVE, được nộp lại PDF
       │         └─ duyệt → RELEASED (3), mở tải và 7 ngày challenge
       │              ├─ đủ điều kiện payout → COMPLETED (5)
       │              └─ challenge được chấp nhận / timeout → REFUNDING (4)
       └─ thiếu goal → REFUNDING (4)

Hủy trước payout / quá hạn release theo policy → REFUNDING (4)
```

`submit-review` ghi thời điểm bắt đầu và hạn SLA **24 giờ** cho Resolver. Quá hạn
chỉ hiển thị `OVERDUE`; không tự duyệt, từ chối, mở pledge hay chuyển tiền.
`CHANGES_REQUESTED` xóa cửa sổ review hiện tại và trả Creator về `DRAFT`; Creator
có thể sửa, khóa và gửi lại không giới hạn. `APPROVED` chưa có nghĩa đã phát hành
on-chain; chỉ binding canonical có state `FUNDING` mới xuất hiện ở surface nhận pledge.
`RELEASED` nghĩa PDF đã duyệt, **chưa phải Creator đã nhận tiền**. `COMPLETED` mới là đã payout.

### 2.4. Quy tắc tiền

- Một giá PDF cố định; một pledge/ví/campaign, không số lượng, kho hay tier phụ. Ví khác không đồng nghĩa người khác.
- Pledge được vượt goal tới hết hạn. Đủ goal sớm vẫn phải chờ hết hạn để chốt funding.
- Không bond/advance/giải ngân sản xuất trong Editions. Creator tự lo vốn sản xuất; toàn bộ pledge nằm trong escrow.
- Phí nền tảng bằng 0. Sau PDF được duyệt, hết 7 ngày challenge và không còn challenge mở, `payout` chuyển toàn escrow tới ví Creator đã khóa. Người gọi không được đổi người nhận.
- Không đủ goal; Creator hủy trước payout; chưa có PDF được chấp nhận khi tới `releaseDeadline + 7 ngày`; challenge chưa giải quyết khi tới `disputeDeadline` (30 ngày từ challenge đầu): mở refund. Challenge được Resolver chấp nhận cũng mở refund cho cả campaign.
- Mỗi Backer tự claim lại toàn giá pledge đúng một lần, về ví đã pledge. `REFUND_ELIGIBLE` chưa phải đã nhận tiền.
- Giao dịch token thất bại thì trạng thái revert; có thể retry. Không claim/payout thành công hai lần. Sau payout không có refund hợp đồng tự động.
- Hết hạn không tự phát sinh giao dịch: phải bấm nút chuyển trạng thái/claim tương ứng; indexer không ký thay.

Ví dụ goal 20, giá 10 MockUSDC: A và B pledge → `raised=20`, `escrowed=20`. Payout → Creator +20, escrow 0. Nếu refund → A +10, B +10 sau từng lần claim; escrow lần lượt 10 rồi 0. Nếu có C pledge thêm trước deadline, số tiền tương ứng là 30. Phí gas tính bằng ETH test riêng.

### 2.5. PDF, community và challenge

- Trang mẫu và bằng chứng riêng tư; chỉ thông tin/hash được chọn lọc xuất hiện công khai. File tối đa **10 MiB**; PDF cuối phải là PDF thật, không mã hóa, có cấu trúc/trang hợp lệ.
- Upload thành công chỉ lưu file/hash. Creator còn phải ký gửi hash; Resolver còn phải duyệt đúng hash. Duyệt sản xuất chưa mở tải PDF.
- PDF cuối được chấp nhận là bất biến. Việc sửa file rồi giữ nguyên tên không thay được hash đã duyệt.
- Quyền tải gắn tài khoản Backer ban đầu và pledge canonical. Ticket tải hết hạn sau **60 giây theo giờ server**; mỗi GET vẫn cần session đúng tài khoản và kiểm lại quyền. Ticket hết hạn không làm entitlement hết hạn.
- UI hiển thị `DOWNLOAD_ELIGIBLE`; API cấp ticket trả `DOWNLOAD_AVAILABLE`. `PENDING_RELEASE`, `REFUND_ELIGIBLE`, `REFUNDED`, `ORPHANED` không được tải.
- Lượt tải không chứng minh đã đọc. `BACKER_CONFIRMED` là nút xác nhận riêng; không bắt buộc để payout, không chuyển tiền và không thay thế challenge.
- Community đọc cam kết và gửi chi tiết tới Creator/Resolver; người khác chỉ thấy số lượng phản hồi. Nhận xét/báo sự cố không tự mở tranh chấp contract.
- Backer phải ký `challengeRelease` trước deadline để chặn payout. Mỗi ví một challenge/campaign. Resolver bác challenge thì giữ deadline cũ; chấp nhận thì mở refund toàn campaign. Backup chờ 7 ngày từ challenge tương ứng.
- Thiếu/sai file trả lỗi và tạo `FILE_UNAVAILABLE`; không giả vờ đã giao, không tự refund. Sau payout vẫn có báo sự cố nhưng không có cơ chế hoàn tiền tự động.
- Có challenge mở nhưng campaign vẫn `RELEASED` thì Backer đủ quyền vẫn có thể tải; khi chuyển `REFUNDING` thì quyền tải bị chặn ngay, kể cả chưa claim.

## 3. Chuẩn bị môi trường và tài khoản

### 3.1. Chạy/kiểm tra runtime

Mở PowerShell tại repo. Docker Desktop phải đang chạy. Với bản đã build hiện tại:

```powershell
Set-Location 'C:\Users\dell\Desktop\FundTogether'
& .\backend\scripts\reward\start-services.ps1 -SkipBuild
if ($LASTEXITCODE -ne 0) { throw 'Launcher failed' }
Invoke-RestMethod 'http://127.0.0.1:3002/health'
$editionsDeployment = Invoke-RestMethod 'http://127.0.0.1:3002/v1/reward/editions/deployment'
$editionsDeployment | Select-Object protocolKind, chainId, contractAddress, tokenAddress, resolver, backupResolver
```

Kỳ vọng `health.status=ok`, deployment `EDITIONS`, chain `31339`. `/health` vẫn mang protocol `REWARD` và địa chỉ contract lịch sử; phải kiểm thêm endpoint deployment Editions. Launcher dùng lại API đang chạy nếu identity phù hợp; lệnh đó không tự reload code mới vào API cũ.

Mở **http://localhost:5175/#/reward**. Dùng `localhost` nhất quán trong browser để khớp cookie/origin/SIWE; không đổi qua `127.0.0.1` giữa chừng.

| Mục | Giá trị |
| --- | --- |
| Mạng ví | FundTogether local; RPC `http://127.0.0.1:9548`; chain ID `31339`; native currency `ETH`; không cần explorer |
| Token | MockUSDC, 6 decimals; lấy `tokenAddress` từ deployment trên |
| API / Web | 3002 / 5175 |
| PostgreSQL / MinIO | 5436 / 9202–9203; ứng dụng dùng cấu hình `.local/reward/backend.env` |
| Manifest Editions | `.local/reward/generated/editions-deployment.local.json` |

Địa chỉ đã đối chiếu sau reset ngày 13/10/2026: Editions `0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`, Primary `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`, Backup `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`. Luôn kiểm deployment đang chạy thay vì mặc định các địa chỉ này còn đúng.

### 3.2. Đọc giờ blockchain trước khi chọn ngày

Chain 31339 đã được tạo lại ngày 13/10/2026. Khi xác minh lần cuối, block 4 ở `2026-10-13 16:14:36 UTC`, khớp giờ máy tới giây. Timestamp của block mới nhất có thể đứng yên khi chưa mine block, nên vẫn phải đọc giờ chain trước khi chọn ngày; giao dịch tiếp theo sẽ tạo block mới.

Các suite/script tự động có tua giờ hiện đều yêu cầu Anvil và bọc toàn bộ lần chạy bằng `evm_snapshot`/`evm_revert`. Kiểm chứng sau full backend, legacy 6-scenario và browser Editions cho thấy block hash/timestamp trước–sau không đổi. Lệnh tua giờ thủ công ở mục 9.3 vẫn tác động toàn chain và chỉ đi tới tương lai.

Chạy khối này để khai báo helper đọc RPC và lấy ngày gợi ý. Đây là lệnh đọc, chưa tua giờ:

```powershell
function Invoke-EditionsRpc {
    param([string]$Method, [object[]]$RpcParams = @())
    $request = @{ jsonrpc = '2.0'; id = 1; method = $Method; params = $RpcParams }
    $response = Invoke-RestMethod 'http://127.0.0.1:9548' -Method Post -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 8 -Compress)
    if ($response.error) { throw ($response.error | ConvertTo-Json -Compress) }
    return $response.result
}
if ([Convert]::ToInt64((Invoke-EditionsRpc 'eth_chainId'), 16) -ne 31339) { throw 'Wrong chain' }
$editionBlock = Invoke-EditionsRpc 'eth_getBlockByNumber' @('latest', $false)
$editionClock = [DateTimeOffset]::FromUnixTimeSeconds([Convert]::ToInt64($editionBlock.timestamp, 16))
[pscustomobject]@{
    ChainTimeUTC = $editionClock.ToString('u')
    ReleaseStartUTC = $editionClock.AddDays(30).ToString('yyyy-MM-dd')
    ReleaseEndUTC = $editionClock.AddDays(40).ToString('yyyy-MM-dd')
}
```

Dùng hai ngày gợi ý cho campaign 1 ngày gây quỹ. Chạy lại trước **mỗi campaign mới** nếu đã tua thời gian. Ngày trong form phát hành là UTC; UI hạn on-chain có thể hiển thị theo múi giờ máy. Cửa sổ đầu là kế hoạch, contract không bắt phải chờ tới ngày bắt đầu mới được nộp; hạn cuối cộng grace mới là rào thời gian thực thi.

### 3.3. Các tài khoản test

Tạo tài khoản email/password ở `#/account`. Dùng profile trình duyệt riêng để tránh dùng chung session/ví; nếu dùng một profile, đăng xuất và ngắt ví trước khi đổi actor.

| Mã | Tài khoản | Ví / điều kiện |
| --- | --- | --- |
| C | Creator | Ví test riêng, khác Primary/Backup; hồ sơ cần ADMIN khác duyệt |
| A | Admin | Role `ADMIN`; không cần ký tiền |
| R | Primary Resolver | Role `RESOLVER`, liên kết đúng `deployment.resolver` |
| B1, B2 | Hai Backer | Hai tài khoản và hai ví test khác nhau, đủ ETH gas + MockUSDC |
| U | Community / người không pledge | Tài khoản thường; không cần ví để gửi nhận xét |
| RB | Backup, dùng cho case mở rộng | Role `RESOLVER`, liên kết đúng `deployment.backupResolver` |

Nếu thiếu staff role, operator dùng mục 9.1 sau khi tài khoản đã đăng ký. Đăng xuất/đăng nhập lại để UI nhận role. Không chọn role trên giao diện là tự được cấp quyền.

Trong từng tài khoản cần giao dịch: vào `#/account` → `Connect Wallet` → chọn đúng provider/ví → **Liên kết ví ngoài** → ký SIWE. Kiểm tra ví có trong danh sách “Ví đã liên kết với tài khoản”. Chỉ thấy địa chỉ ở nút Connect chưa đủ.

Primary/Backup phải là ví test mà người test có thể ký và khớp manifest. Nếu không có ví đó, đánh dấu `BLOCKED: thiếu ví Resolver`; ví MetaMask ngẫu nhiên không thay thế được. Không sửa manifest hoặc giả chữ ký để tiếp tục. Không đưa seed/private key vào file hướng dẫn, ảnh hoặc biên bản.

Có thể thêm custom token trong ví bằng `tokenAddress`, 6 decimals để xem số dư. Nạp token/ETH test theo mục 9.2 nếu cần.

### 3.4. Bộ dữ liệu đơn giản

Chuẩn bị bằng tác phẩm/mẫu do bạn có quyền sử dụng:

- Một `sample.pdf` hoặc PNG/JPEG mẫu; một file bằng chứng sản xuất; một PDF cuối có ít nhất một trang, không mật khẩu, dưới 10 MiB. Tạo PDF bằng xuất PDF thông thường, không đổi đuôi `.txt` thành `.pdf`.
- Một `.txt` đổi đuôi `.pdf` để test từ chối; thêm PDF có mật khẩu hoặc file >10 MiB nếu có.
- Tên campaign: `MANUAL-HAPPY-<lần chạy>`; goal **20**, giá PDF **10**, thời hạn **1 ngày**. Hai Backer đủ đạt goal. Dùng campaign riêng cho mỗi nhánh kết thúc.
- Mô tả mẫu: “Truyện tranh ngắn gồm 12 trang, bản PDF màu hoàn chỉnh để đọc trên thiết bị cá nhân.”
- Đề cương: “Ba chương giới thiệu nhân vật, hành trình tìm lại cuốn sổ và kết thúc câu chuyện.”
- Ngân sách: “Tác giả tự chi trả phần vẽ, biên tập và dàn trang; ngân sách dự kiến được giải thích theo từng phần việc.”
- Evidence plan: “Nộp ảnh tiến độ và bản dàn trang; Resolver kiểm nội dung trước khi duyệt bản PDF cuối.”

Tiêu đề ≥5 ký tự, pitch ≥10, story ≥20; đề cương/ngân sách/evidence plan ≥20. Nhận xét review ≥10; tóm tắt evidence ≥20. Không viết lời hứa sách in/quà vật lý; bộ lọc cũng có thể bắt từ khóa trong câu phủ định, nên mô tả tích cực về PDF.

## 4. Kịch bản chính: tạo → pledge → tải → payout

Làm lần lượt; với mỗi giao dịch phải thấy **`ON_CHAIN_CONFIRMED`**, không dừng ở popup ví/tx hash. Lưu UUID campaign từ URL; ID on-chain là số khác, có thể bắt đầu từ 0.

| Bước / actor | Thao tác cụ thể | Kết quả cần quan sát |
| --- | --- | --- |
| H01 — C | `#/reward/creator` → điền tên, bio, cam kết IP → gửi hồ sơ tác giả | `PENDING`; chưa tạo draft được khi chưa `VERIFIED` |
| H02 — A | `#/reward/resolver` → **Flow V1: Duyệt Hồ Sơ Tác Giả** → đọc hồ sơ → **Phê duyệt (VERIFIED)** | C tải lại thấy `VERIFIED`. Đây là quyết định người test; không phải hệ thống tự chứng minh bản quyền |
| H03 — C | Tạo campaign bằng bộ dữ liệu mục 3.4 → **Lưu Bản thảo Chiến dịch** | `DRAFT`; chỉ COMICS_ARTBOOK, một standard PDF; không kho/địa chỉ/tracking |
| H04 — C | **Hồ sơ thẩm định PDF** → chọn ví đã liên kết, điền đề cương/ngân sách/evidence plan, hai ngày theo chain; upload và tick chọn mẫu → **Lưu hồ sơ thẩm định** | Lưu được revision mới; mẫu tải lại đúng file. Mẫu phải được gắn vào hồ sơ, không chỉ upload |
| H05 — C | Kiểm nội dung → **Khóa cam kết PDF đã lưu** → **Gửi Resolver thẩm định** | `FROZEN` rồi `UNDER_REVIEW`; có commitment hash; các terms không còn sửa tự do |
| H05a — U | Mở feed/chi tiết khi `UNDER_REVIEW` | Thấy surface `Đang chờ Resolver thẩm định`, community chỉ góp ý, chưa mở pledge; SLA tham khảo là 24 giờ |
| H06 — U | Mở `#/reward`, vào campaign → chọn cam kết → nhập nhận xét → **Gửi phản hồi có tài khoản** | Gửi được trước khi approved; C/R đọc được chi tiết; người khác không đọc được nội dung U. Chưa có pledge |
| H07 — R | Console → đọc snapshot, tải trang mẫu, xem phản hồi → nhập lý do → **Duyệt hồ sơ PDF** | `APPROVED`. Chưa có campaign on-chain, chưa chuyển tiền |
| H07a — R | Gửi `CHANGES_REQUESTED` | Trạng thái về `DRAFT`, lịch sử review còn; snapshot/hash active và cửa sổ SLA được xóa |
| H07c — U/R | Với một hồ sơ khác, kiểm tra sau hạn 24 giờ | Hiện `OVERDUE`; trạng thái vẫn `UNDER_REVIEW`, không tự duyệt/từ chối hay mở pledge |
| H07b — C | Sửa hồ sơ → **Lưu bản nháp** → **Khóa cam kết** → **Gửi Resolver thẩm định** lần hai | Vòng correction lặp được; tạo commitment mới và không dùng commitment cũ để review |
| H08 — R | **Mở duyệt hợp đồng, sản xuất & PDF local** → **Ký duyệt cam kết local** bằng ví Primary | Receipt và sync thành công. Đây là `approveCampaign`, không phải ERC20 approve; public surface vẫn là `ACTIVATION_PENDING` |
| H09 — C | Studio → **Mở community & phát hành PDF local** → **Tạo campaign local từ cam kết** bằng ví C đã khóa | `ON_CHAIN_CONFIRMED`, ID on-chain, public surface chuyển **Đang gây quỹ**, raised/escrow 0; hạn funding đúng 1 ngày từ block tạo |
| H10 — B1, B2 | Mở link công khai `#/reward/editions/<UUID>` → **Ủng hộ 10 · một PDF** | Khi thiếu allowance, ví có thể hỏi hai giao dịch: ERC20 approve rồi pledge. Sau mỗi pledge, số dư token -10; mỗi tài khoản có một `PENDING_RELEASE`. Sau hai pledge: raised=20, escrow=20; chưa tải PDF |
| H11 — người đăng nhập có ví | Thử **Chốt kết quả khi hết hạn gây quỹ** trước hạn: phải bị chặn. Chờ hết hạn hoặc dùng mục 9.3 → bấm lại | Đủ goal chuyển **Đang sản xuất / ACTIVE**; tiền vẫn escrow=20, C chưa nhận token |
| H12 — C | Ở URL `/creator`, chọn bằng chứng sản xuất và summary → **Lưu file và hash** → **Gửi đúng hash này để Resolver duyệt** | Hai bước riêng: file đã lưu rồi giao dịch đã sync. Chưa productionApproved, chưa quyền tải PDF |
| H13 — R | Ở URL `/resolver` → **Tải file để kiểm tra**, đọc community → **Duyệt bằng chứng sản xuất** | `EVIDENCE_REVIEWED`; `productionApproved=true`; vẫn chưa được tải PDF cuối |
| H14 — C | Upload PDF cuối và summary → **Lưu file và hash** → **Gửi đúng hash này để Resolver duyệt** | **Chờ duyệt PDF / RELEASE_REVIEW**; hiện hash PDF và hash evidence; chưa mở tải |
| H15 — R | Tải đúng PDF, mở kiểm trang/nội dung, đối chiếu cam kết → **Duyệt PDF cuối** | **PDF đã được duyệt / RELEASED**; challengeDeadline = thời điểm duyệt +7 ngày; escrow còn 20 |
| H16 — B1 | Mở **Phần thưởng của tôi** hoặc campaign → **Kiểm tra và tải PDF riêng tư** | `DOWNLOAD_ELIGIBLE`; nhận `edition.pdf`, mở đọc được và đúng hash. Chưa tự có `BACKER_CONFIRMED` |
| H17 — B1 | **Tôi đã kiểm tra và xác nhận PDF** | `BACKER_CONFIRMED`; escrow vẫn 20. B2 không xác nhận vẫn giữ quyền và không chặn payout |
| H18 — người có ví | Thử **Trả Creator khi đủ điều kiện** trước hạn: phải bị chặn. Chờ/tua tới sau challengeDeadline, không mở challenge → bấm lại | **Đã trả Creator / COMPLETED**; C +20 MockUSDC, escrow=0; tải PDF vẫn được. Gọi payout lần nữa không trả thêm |

Trong H15 phải thực sự mở PDF: xem đủ trang, font/ảnh, nội dung và việc đáp ứng cam kết. Parser không thay phần kiểm tra này.

Ghi baseline số dư ngay trước pledge/payout/refund; allowance không phải token đã chi. Nếu ví từ chối ký thì campaign/entitlement không được ghi thành công.

## 5. Các nhánh kết thúc: campaign riêng cho từng case

Không tua thời gian qua deadline của campaign khác đang test. Hoàn tất một case, đọc lại chain clock, rồi mới tạo campaign tiếp theo.

| Case | Chuẩn bị / thao tác | Kỳ vọng |
| --- | --- | --- |
| F01 — Thiếu goal | Goal20/giá10, chỉ B1 pledge; qua fundingDeadline, chốt kết quả | `REFUNDING`, B1 `REFUND_ELIGIBLE`; bấm **Nhận hoàn tiền vào ví đã pledge** → token +10, `REFUNDED`, escrow0; không claim lại |
| F02 — Creator hủy | Có pledge, chưa payout; C vào `/creator` → **Hủy campaign và mở hoàn tiền toàn bộ** | Refund toàn giá từng pledge; chỉ C có quyền hủy; không có nút ứng tiền |
| F03 — Challenge được chấp nhận | Đi tới H15; B1 nhập lý do ≥10 ký tự → **Gửi báo cáo và challenge bằng ví đã pledge** | Có chi tiết riêng tư và giao dịch challenge riêng; openDisputes tăng, payout bị chặn |
| F03 tiếp — R | Nhập lý do quyết định → **Chấp nhận: mở hoàn tiền toàn campaign** | Tất cả Backer chuyển `REFUND_ELIGIBLE`, kể cả B2 không challenge; không tải được ngay từ `REFUNDING`; từng người claim đầy đủ |
| F04 — Bác challenge | Campaign khác tới H15; B1 challenge; R nhập lý do → **Bác khiếu nại** | Challenge resolved, openDisputes giảm; challengeDeadline không kéo dài; hết hạn và không còn dispute thì payout được |
| F05 — Không có PDF được duyệt | Campaign có tiền, chưa `RELEASED`; tới releaseDeadline+7 ngày → **Mở hoàn tiền khi quá hạn policy** | `REFUNDING`; trước mốc này không được tự mở refund chỉ vì chưa có file |
| F06 — Resolver không xử lý challenge | Mở challenge, không giải quyết; tới disputeDeadline → nút mở hoàn tiền | `REFUNDING`; 30 ngày tính từ challenge đầu, không cộng lại theo mỗi phản hồi |
| F07 — Backup | Có production/PDF review hoặc challenge đang chờ; RB dùng đúng ví Backup | Trước requestedAt/openedAt+7 ngày bị chặn; sau mốc được review. Không dùng RB cho H08 |
| F08 — Yêu cầu sửa | Ở H07, R bấm **Yêu cầu sửa** | Trở về `DRAFT`; lý do/lịch sử giữ lại. C sửa terms, lưu/khóa/gửi lại; commitment mới khác khi terms đổi |
| F09 — Từ chối evidence/PDF | R **Từ chối bằng chứng sản xuất** hoặc **Từ chối PDF cuối** | Cho C nộp lại đúng giai đoạn; PDF từ chối không mở tải, không payout; production đã duyệt không bị coi là final PDF |
| F10 — Vượt goal | Ba ví/tài khoản pledge10 trước deadline với goal20 | Raised/escrow30, không chặn do “hết kho”; nếu payout hợp lệ C nhận30; nếu refund mỗi ví nhận10 |

F03 và F04 phải thử sau khi gửi giao dịch challenge thành công; một comment `ISSUE` đơn thuần không đủ điều kiện.

## 6. Kiểm tra file và quyền riêng tư

| Case | Thao tác | Kỳ vọng |
| --- | --- | --- |
| P01 | U không pledge mở campaign đã `RELEASED` | Không có quyền tải final PDF; đoán entitlement ID của B1 cũng bị từ chối |
| P02 | B1 có pledge nhưng mới duyệt production | `PENDING_RELEASE`; không được cấp ticket PDF cuối |
| P03 | C thử upload `.txt` đổi tên `.pdf`, PDF mật khẩu hoặc >10 MiB | Bị từ chối; không tạo release thành công |
| P04 | B1 cấp ticket, dùng URL đó trong browser U/đăng xuất | Không nhận bytes PDF; URL không phải quyền bearer độc lập |
| P05 | B1 giữ ticket quá 60 giây thực rồi tải | Ticket bị từ chối; xin ticket mới vẫn được nếu entitlement còn hợp lệ. Tua Anvil không làm ticket hết hạn vì hai đồng hồ khác nhau |
| P06 | B1 đã được cấp ticket, campaign chuyển refund trước khi GET | Không tải được bằng ticket cũ; không cần chờ claim thành công |
| P07 | Xem public API bằng U/khách | Không lộ identity declaration, object key, file mẫu, PDF hoặc chi tiết feedback của người khác |
| P08 | B1 tải nhiều lần nhưng không bấm xác nhận | Không tự thành `BACKER_CONFIRMED`; không tự payout |
| P09 — môi trường kiểm thử riêng | File đã duyệt bị thiếu/hỏng ở storage | Lỗi file + báo cáo `FILE_UNAVAILABLE`, không thông báo tải thành công; không tự đổi hash/refund |

P09 và reorg không nên mô phỏng bằng xóa object/reset chain đang giữ dữ liệu chính. Hai nhánh này đã có integration test; nếu chưa có môi trường dùng riêng để phá lỗi thì ghi `NOT_RUN` cho test tay, không ghi PASS thay bằng kết quả tự động.

Có thể lấy ticket mà chưa download bằng DevTools Console **trong tab localhost:5175 của B1**:

```javascript
const manualRightsResponse = await fetch('http://localhost:3002/v1/reward/editions/entitlements', { credentials: 'include' });
if (!manualRightsResponse.ok) throw new Error(`HTTP ${manualRightsResponse.status}`);
const manualRights = await manualRightsResponse.json();
const manualRight = manualRights.find(item => item.campaignId === 'THAY_BANG_UUID_CAMPAIGN');
if (!manualRight) throw new Error('Không có entitlement của campaign này');
const manualTicketResponse = await fetch(`http://localhost:3002/v1/reward/editions/entitlements/${manualRight.id}/download`, {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
});
if (!manualTicketResponse.ok) throw new Error(`HTTP ${manualTicketResponse.status}`);
const manualTicket = await manualTicketResponse.json();
// Sau khi chờ 61 giây thực hoặc sau khi campaign chuyển REFUNDING, chạy hai dòng sau:
const manualDownload = await fetch(`http://localhost:3002${manualTicket.url}`, { credentials: 'include' });
console.log('HTTP tải:', manualDownload.status);
```

Chạy riêng phần GET sau khi đã chờ/thay đổi trạng thái, không dán cả khối rồi kỳ vọng ticket tự hết hạn. Ticket URL chỉ dùng cục bộ; không chụp/copy vào biên bản. Nếu khai báo lại biến `const`, reload tab rồi làm lại.

## 7. Kiểm tra từ chối sai phạm vi và sai tài khoản

| Case | Thao tác | Kỳ vọng |
| --- | --- | --- |
| N01 | Trong request tạo draft hợp lệ, đổi category hoặc reward type/format; thêm tier thứ hai, `shippingAddress`, tracking hoặc inventory | Server trả 400; không tạo draft. Phải gửi tới server, không chỉ kiểm form bị ẩn |
| N02 | Nhập lời hứa “tặng sách in”, “shipping”, “merchandise” vào terms | Bị chặn bởi kiểm phạm vi; đổi về mô tả PDF |
| N03 | Goal/giá bằng0, âm, hơn6 số thập phân; duration0/61 | Bị từ chối. Giá lớn hơn goal không được phát hành theo policy |
| N04 | C2 đăng nhập rồi gọi sửa/khóa/upload campaign của C | 403 hoặc không thấy tài nguyên; không có thay đổi |
| N05 | Creator tự duyệt profile/campaign; U truy cập route ADMIN/Resolver | Bị từ chối; đổi menu/URL không tăng quyền |
| N06 | R đúng role nhưng nối ví khác; hoặc đúng ví nhưng sai chain | Không được gửi thao tác tài chính hợp lệ |
| N07 | Từ chối popup token approve/pledge; thử pledge lần hai cùng ví | Không có entitlement/token chi mới cho giao dịch không thành công; mỗi canonical pledge chỉ một quyền |
| N08 | Đăng xuất B1, đăng nhập U/B2 trong cùng browser | Không thấy cache quyền/file riêng của B1. Ví nối cũ không tự được liên kết vào tài khoản mới |
| N09 | Đổi account/mạng trong extension khi yêu cầu ký đang mở | Phải bị chặn hoặc yêu cầu làm lại đúng actor; không hoàn tất nhầm người |
| N10 | C thử gỡ ví nhận tiền khi cam kết đã khóa/approved | Không được âm thầm phá liên kết nghĩa vụ; lưu lỗi và dừng nếu ứng dụng cho qua |
| N11 | Gửi lại cùng tx hash qua sync API | Không tăng số quyền, raised hoặc escrow lần nữa |
| N12 | Gọi API shipping/batches/delivered/confirm giao hàng đã gỡ | 404; không sinh dữ liệu physical mới |

Để N01 có ý nghĩa: lấy payload tạo draft hợp lệ trong tab Network, dùng “Copy as fetch”, đổi **một trường sai mỗi lần** và giữ `credentials: 'include'`. Dùng C đã `VERIFIED`; response 401 do hết session không chứng minh scope validation. Với PATCH, dùng campaign `DRAFT` và revision mới nhất.

Đường physical tiêu biểu đã gỡ: `/v1/reward/backer/entitlements/<UUID>/shipping`, `/v1/reward/creator/campaigns/<UUID>/batches`. Endpoint Editions `/v1/reward/editions/entitlements/<UUID>/confirm` vẫn tồn tại vì đó là xác nhận PDF, không phải nhận hàng.

Nếu N08–N10 thất bại: ghi FAIL, lưu actor/URL/giờ/thao tác và dừng các giao dịch còn lại của phiên. Không dùng việc đăng nhập lại thành công để xóa kết quả lỗi ban đầu.

## 8. Ghi nhận kết quả và lỗi thường gặp

### 8.1. Biên bản mỗi lần test

Sao chép bảng này vào ghi chú riêng. Dùng `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`; không tích hoàn tất nếu chỉ đọc hướng dẫn.

| Trường | Ghi nhận |
| --- | --- |
| Ngày/người test, phiên bản browser/ví | … |
| Branch/SHA và working tree có thay đổi | … |
| Chain ID, genesis, Editions address | … |
| Giờ máy / giờ block đầu và cuối | … |
| Case; UUID / ID on-chain | … |
| Actor, wallet public, role | … |
| Kết quả mong đợi / thực tế | … |
| Tx hash + receipt status + trạng thái indexed | … |
| Số dư token trước/sau, escrow, file hash | … |
| Ảnh/log đã bỏ dữ liệu riêng tư; kết luận | … |

Để chốt nghiệm thu tay: H01–H18, F01–F04 và kiểm quyền P01/P02/P04/P05/P06, N01/N04/N06–N12 phải có bằng chứng. Case timeout/backup/overfunding còn lại ghi riêng mức đã chạy; lỗi chưa xử lý giữ trong danh sách tồn đọng. Không gọi đã nghiệm thu toàn bộ nếu còn case bắt buộc FAIL/BLOCKED/NOT_RUN.

### 8.2. Xử lý vướng mắc theo dấu hiệu

| Dấu hiệu | Kiểm tra trước |
| --- | --- |
| Không thấy campaign ở feed | Kiểm tra đúng surface: `/review` cho UNDER_REVIEW, `/activation` cho APPROVED chưa có binding canonical, `/funding` chỉ cho binding canonical state FUNDING. Draft nằm trong Studio; reload trang sau khi đổi trạng thái |
| Hồ sơ ghi “Publish và nhận pledge chưa mở” | Đây là chữ cũ trong panel chuẩn bị. Với hồ sơ APPROVED, mở link Editions `/creator` hoặc `/resolver` để chạy H08–H09; chỉ `ON_CHAIN_CONFIRMED` mới là phát hành xong |
| Console có “V1–V4”, cọc/in ấn hoặc nút hợp đồng cũ | Đó là nhãn/phần lịch sử; dùng đúng card COMICS_ARTBOOK và link quản lý Editions. Không dùng thao tác advance của campaign lịch sử để test policy mới |
| Không thấy hồ sơ chờ / không duyệt được | Kiểm role ADMIN/RESOLVER của **tài khoản**, rồi ví ký theo manifest; không suy ra từ tên account |
| `Release deadline must be after...` | Đọc giờ chain mục3.2; tạo/sửa draft với ngày tương lai theo chain, rồi freeze/review lại. Đã approved thì cần hồ sơ mới nếu terms không còn hợp lệ |
| `TooEarly`, `WrongState`, `Unauthorized` | Đối chiếu state, deadline và đúng ví. Nút xuất hiện không bảo đảm đã đủ điều kiện; simulation/contract vẫn chặn |
| MockUSDC không hiện trong ví | Thêm đúng token từ manifest, decimals6; native ETH chỉ trả gas |
| Ví ký treo | Mở đúng extension/provider, xử lý yêu cầu đang chờ, kiểm ví/mạng. Ngắt nối rồi kết nối lại; không bỏ qua chữ ký SIWE |
| Có receipt success nhưng UI chưa cập nhật | Ghi tx hash; bấm **Tải lại trạng thái canonical**/reload, kiểm API/indexer. Không pledge lại chỉ vì giao diện chưa cập nhật |
| PDF tải lỗi | Kiểm account/quyền/state/ticket; xin ticket mới. Nếu `FILE_UNAVAILABLE`, gửi Resolver kiểm. Không thay file/hash đã duyệt để che lỗi |

Log local ở `.local/reward/runtime/api.log`, `api-error.log`, `web.log`, `web-error.log`. Ghi lỗi cụ thể; không chia sẻ cookie, mật khẩu, seed, `.env`, URL tải riêng tư hoặc bản sao DB.

## 9. Lệnh hỗ trợ của operator cho môi trường local

Các lệnh bên dưới dùng để chuẩn bị/test, **chưa được chạy khi tạo tài liệu này**. Chạy tại repo root. Chúng không phải bước người dùng sản phẩm phải làm hàng ngày. Không chạy test tự động có reorg/tua giờ đồng thời với nghiệm thu tay.

### 9.1. Cấp một staff role cho tài khoản test đã đăng ký

Chỉ operator DB thực hiện. Script thêm đúng một role, giữ các role đang có; không xác minh Creator thay ADMIN và không cấp quyền ví trên contract.

```powershell
$env:EDITIONS_TEST_EMAIL = Read-Host 'Email tai khoan test da dang ky'
$env:EDITIONS_TEST_ROLE = Read-Host 'Role can them: ADMIN hoac RESOLVER'
@'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('./backend/node_modules/pg');
const env = require('./backend/node_modules/dotenv').parse(fs.readFileSync('.local/reward/backend.env'));
const target = new URL(env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.port === '5436' && target.pathname === '/fundtogether_reward');
const email = process.env.EDITIONS_TEST_EMAIL.trim().toLowerCase();
const role = process.env.EDITIONS_TEST_ROLE.trim().toUpperCase();
assert.ok(email.includes('@') && ['ADMIN', 'RESOLVER'].includes(role));
(async () => {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  try {
    const users = await db.query('SELECT id FROM users WHERE lower(email)=$1', [email]);
    assert.equal(users.rowCount, 1, 'Email must identify exactly one registered account');
    const result = await db.query(`INSERT INTO platform_roles(user_id, roles) VALUES($1, $2::jsonb)
      ON CONFLICT(user_id) DO UPDATE SET roles=(SELECT jsonb_agg(DISTINCT value)
        FROM jsonb_array_elements(platform_roles.roles || EXCLUDED.roles)), updated_at=now()
      RETURNING roles`, [users.rows[0].id, JSON.stringify([role])]);
    console.log('Roles:', result.rows[0].roles);
  } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
'@ | node
Remove-Item Env:EDITIONS_TEST_EMAIL, Env:EDITIONS_TEST_ROLE
```

Sau đó đăng nhập lại. ADMIN duyệt profile C qua H02; không tự đặt profile `VERIFIED` trong DB để thay bước nghiệm thu này.

### 9.2. Cộng 1 ETH test và mint 100 MockUSDC cho một ví test

Chạy một lần cho mỗi ví cần dùng. Script chỉ dùng Anvil local31339, kiểm deployment hiện tại, dùng signer mở khóa của Anvil để mint token giả; không yêu cầu private key. Đây là chuẩn bị fixture, không phải bằng chứng MetaMask đã ký thành công.

```powershell
$env:EDITIONS_TEST_WALLET = Read-Host 'Dia chi vi test 0x...'
@'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createPublicClient, createWalletClient, defineChain, http, isAddress, toHex, formatUnits } = require('./backend/node_modules/viem');
const { parseEditionsDeployment, verifyEditionsDeployment } = require('./backend/dist/src/blockchain/editions-deployment.js');
const manifest = parseEditionsDeployment(JSON.parse(fs.readFileSync('.local/reward/generated/editions-deployment.local.json')));
const token = JSON.parse(fs.readFileSync('contracts/out/MockUSDC.sol/MockUSDC.json'));
const recipient = process.env.EDITIONS_TEST_WALLET.trim();
assert.ok(isAddress(recipient));
assert.ok(['http://127.0.0.1:9548', 'http://localhost:9548'].includes(manifest.rpcUrl));
const chain = defineChain({ id: 31339, name: 'Editions local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
(async () => {
  const client = createPublicClient({ chain, transport: http(manifest.rpcUrl) });
  assert.equal(await client.getChainId(), 31339);
  assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i);
  await verifyEditionsDeployment(client, manifest);
  const accounts = await client.request({ method: 'eth_accounts' });
  assert.ok(accounts.length > 0);
  const native = await client.getBalance({ address: recipient });
  await client.request({ method: 'anvil_setBalance', params: [recipient, toHex(native + 10n ** 18n)] });
  const wallet = createWalletClient({ account: accounts[0], chain, transport: http(manifest.rpcUrl) });
  const txHash = await wallet.writeContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'mint', args: [recipient, 100000000n] });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  assert.equal(receipt.status, 'success');
  const balance = await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [recipient] });
  console.log({ txHash, mockUSDCBalance: formatUnits(balance, 6) });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
'@ | node
Remove-Item Env:EDITIONS_TEST_WALLET
```

### 9.3. Tua thời gian đúng mốc của một campaign local

**Ảnh hưởng toàn bộ chain31339**, không chỉ campaign đang xem. Không chạy khi người khác đang test/đang ký hoặc có campaign cần giữ cửa sổ challenge. Không `anvil_reset`, không sửa timestamp DB và không quay ngược chain.

Khai báo `Invoke-EditionsRpc` ở mục3.2 trước, rồi:

```powershell
function Move-EditionsClockTo {
    param([long]$UnixSeconds)
    if ([Convert]::ToInt64((Invoke-EditionsRpc 'eth_chainId'), 16) -ne 31339) { throw 'Wrong chain' }
    if ((Invoke-EditionsRpc 'web3_clientVersion') -notmatch 'anvil') { throw 'Anvil only' }
    $block = Invoke-EditionsRpc 'eth_getBlockByNumber' @('latest', $false)
    $current = [Convert]::ToInt64($block.timestamp, 16)
    if ($UnixSeconds -le $current) { throw 'Target must be later than current chain time' }
    Invoke-EditionsRpc 'evm_setNextBlockTimestamp' @($UnixSeconds) | Out-Null
    Invoke-EditionsRpc 'evm_mine' | Out-Null
    [DateTimeOffset]::FromUnixTimeSeconds($UnixSeconds).ToString('u')
}
$manualCampaignId = Read-Host 'UUID campaign trong URL, khong phai ID on-chain'
if ($manualCampaignId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Expected campaign UUID' }
$manualChain = Invoke-RestMethod "http://127.0.0.1:3002/v1/reward/editions/campaigns/$manualCampaignId/chain"
if ($manualChain.status -ne 'ON_CHAIN_CONFIRMED') { throw 'Campaign is not canonical' }
# CHI CHON MOT moc phu hop, bo dau # o dong can chay:
# Move-EditionsClockTo ([long]$manualChain.snapshot.fundingDeadline + 1)
# Move-EditionsClockTo ([long]$manualChain.snapshot.challengeDeadline + 1)
# Move-EditionsClockTo ([long]$manualChain.snapshot.releaseDeadline + 7 * 86400 + 1)
# Move-EditionsClockTo ([long]$manualChain.snapshot.disputeDeadline + 1)
# Backup production/PDF: Move-EditionsClockTo ([long]$manualChain.snapshot.reviewRequestedAt + 7 * 86400 + 1)
```

Không dùng `challengeDeadline`/`disputeDeadline` bằng0 khi chưa có release/challenge. Với Backup xử lý challenge, mốc là block timestamp của **challenge của Backer đó** +7 ngày; không lấy `reviewRequestedAt` của PDF. Sau tua, bấm nút chuyển trạng thái tương ứng trong UI; tua giờ không tự finalize/payout/refund.

## 10. Tài liệu và mã nguồn đối chiếu

- [Phạm vi MVP](FUNDTOGETHER_CAMPAIGN_CONFIG_MVP.md), [policy local được duyệt](EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md), [workflow](WORKFLOWS.md), [kết quả kiểm chứng](../PROJECT_PROGRESS.md).
- [Contract Editions](../../contracts/src/reward/FundTogetherEditions.sol), [màn hình campaign](../../frontend/src/features/reward/EditionsCampaign.tsx), [freeze/review](../../frontend/src/features/reward/EditionsReview.tsx), [ranh giới ký và sync](../../frontend/src/features/reward/useEditionsTransaction.ts).
- [Delivery/ACL/ticket](../../backend/src/reward/reward-editions-delivery.service.ts), [preflight publish](../../backend/src/reward/reward-editions-publication.service.ts), [schema scope](../../backend/src/reward/reward-campaign.schema.ts).

Các hướng dẫn charity/A/B cũ ở ngoài `docs/reward` có thể dùng cổng, role hoặc quy tắc tiền khác; không dùng chúng để nghiệm thu Editions. Khu vực `#/reward/history` chỉ giữ lịch sử, không phải campaign mới để chạy test này.
