# FundTogether — Cơ chế hiện tại và hướng dẫn test tay

Ngày đối chiếu code/runtime: **15/10/2026**. Phạm vi: **MVP local, chain 31339, MockUSDC**.

## 1. MVP đang hoàn thiện đến đâu?

R0–R5 đã triển khai và chuyển runtime chính sang Campaign: một campaign `COMICS_ARTBOOK`, một gói `STANDARD`, một `DIGITAL_DOWNLOAD` dạng PDF. Luồng tạo hồ sơ → review → pledge → sản xuất → duyệt PDF → tải → completion settlement/refund đã có kiểm thử tự động.

**Có thể bắt đầu nghiệm thu tay local. Chưa có kết luận “đã nghiệm thu hoàn toàn” hoặc “sẵn sàng mở công khai”.**

| Bằng chứng hiện có | Kết quả đã ghi nhận |
| --- | --- |
| Campaign backend | 78 test đạt |
| Toàn backend | 195/195 test đạt; 20/20 suite đạt |
| Frontend | 29 test đạt; lint/build đạt |
| Contract | Campaign suite kiểm tra pledge, challenge, completion approval, exact-goal settlement, pro-rata surplus và refund ở sát deadline |
| Browser tự động | 6 checkpoint đạt; dùng ví Anvil được chèn vào browser, Creator verification là fixture |
| Chuyển runtime R5 | Migration 0005 và đối soát lịch sử đã đạt; runtime trước reset được sao lưu đầy đủ, runtime test tay hiện tại dùng DB/storage sạch |
| Đồng hồ runtime hiện tại | Chain 31339 đã tạo lại ở giờ hiện tại; các suite tự động có tua giờ đều snapshot/revert và không đổi chain head |
| MetaMask thủ công, chất lượng PDF, xác minh Creator/IP ngoài đời | Chưa nghiệm thu; phải ghi kết quả riêng |

Hai fixture gỡ ví cũ đã được cập nhật theo truy vấn Campaign. Lỗi cache thật khi đổi tài khoản/đăng xuất cũng đã được sửa: cả dữ liệu Campaign và dữ liệu Creator riêng tư đều bị huỷ; request đang chờ của tài khoản cũ bị abort. Mục 7 vẫn phải được nghiệm thu tay với MetaMask thật.

Runtime cũ có block ở năm 2033 đã được sao lưu tại `.local/fundtogether/reset-backups/2026-10-13-chain-clock-reset`, gồm snapshot chain, dump PostgreSQL, dữ liệu MinIO và manifest. Thư mục này có dữ liệu riêng tư local và phải tiếp tục được ignore. Runtime đang chạy là môi trường test tay mới; tài khoản, role, campaign và file cũ không xuất hiện trong DB/storage hiện tại.

File này là **kịch bản**, không phải biên bản đã PASS. Các ô nghiệm thu bên dưới bắt đầu ở `NOT_RUN`.

## 2. Cơ chế đang chạy

### 2.1. Vai trò và thẩm quyền

| Vai trò | Làm được gì? | Không có quyền gì chỉ nhờ vai trò này? |
| --- | --- | --- |
| Tài khoản thường / Community | Xem cam kết công khai, gửi nhận xét/báo sự cố có tài khoản | Không tự duyệt, khóa tiền, tải PDF của người khác |
| Creator | Xin xác minh hồ sơ/IP, tạo và khóa campaign, gửi request giải ngân kèm file giải thích sử dụng tiền (lần nào cũng bắt buộc), từ lần 2 kèm thêm bằng chứng khoản trước, nộp bằng chứng/PDF, gửi completion dossier, hủy trước completion | Không tự xác minh hồ sơ hoặc tự duyệt campaign/release/completion; không tự chuyển tiền từ escrow |
| ADMIN | Duyệt hồ sơ Creator độc lập qua API/UI | Không mặc nhiên là Resolver hoặc có quyền chuyển token |
| RESOLVER trong DB | Xem hồ sơ/file riêng tư để review, duyệt campaign và đọc phản hồi | Không tự có quyền ký tài chính trên contract |
| Primary Resolver trên contract | Ký duyệt terms chính xác; duyệt sản xuất/PDF, xử lý challenge và quyết định completion | Không đổi ví nhận tiền hay sửa cam kết đã khóa |
| Backup Resolver trên contract | Tiếp quản review sản xuất/PDF/challenge sau 7 ngày chờ của yêu cầu tương ứng | Không ký duyệt phát hành ban đầu thay Primary |
| Backer | Chọn quantity, pledge một hoặc nhiều lần/ví/campaign, nhận quyền PDF, challenge đúng hạn, claim refund hoặc surplus pro-rata | Không chuyển entitlement sang tài khoản khác, claim surplus hai lần hoặc đổi phần của Backer khác |

Creator là hồ sơ `VERIFIED` của tài khoản, không cần tạo tổ chức hoặc cấp role `OWNER`. Với thao tác Resolver qua giao diện, cần **cả role `RESOLVER` của tài khoản lẫn đúng ví được contract cho phép**, đã liên kết bằng chữ ký.

### 2.2. Ba nơi giữ dữ liệu

```text
Browser / ví
  ├─ API → PostgreSQL: tài khoản, hồ sơ, snapshot, review, quyền được index
  ├─ API → MinIO: file mẫu, bằng chứng và PDF riêng tư
  └─ Contract: escrow, pledge, quyết định on-chain, challenge, completion, surplus/refund

Contract → event canonical → indexer → PostgreSQL → UI
```

Hash ràng buộc đúng nội dung đã nộp; hash không chứng minh tác phẩm hay, có bản quyền hoặc đã được đọc. Resolver phải mở file và kiểm tra thực tế.

### 2.3. Trạng thái hồ sơ khác trạng thái tiền

```text
Hồ sơ trong DB:
DRAFT → FROZEN → UNDER_REVIEW_PRIVATE → COMMUNITY_REVIEW → APPROVED → ACTIVATION_PENDING → FUNDING
                       ├─ Yêu cầu sửa → DRAFT, giữ lịch sử review
                       └─ Từ chối → STOPPED

Contract Campaign:
Primary ký approveCampaign → Creator ký createCampaign
  → FUNDING (0)
  → hết hạn, Primary hoặc Backup Resolver gọi finalizeFunding
       ├─ đủ goal → ACTIVE (1)
       │    → request giải ngân lần đầu: form + file giải thích sử dụng tiền
       │    → Resolver duyệt hoặc từ chối; lần sau mới yêu cầu bằng chứng dùng khoản trước
       │    → nộp + duyệt production evidence
       │    → nộp PDF → RELEASE_REVIEW (2)
       │         ├─ từ chối → ACTIVE, được nộp lại PDF
       │         └─ duyệt → RELEASED (3), mở tải và 7 ngày challenge
   │              ├─ Creator requestCompletion → COMPLETION_REQUESTED (5)
   │              │    ├─ Resolver yêu cầu sửa/từ chối → RELEASED (3)
   │              │    └─ Resolver approveCompletion → COMPLETED (6)
   │              │         ├─ goal → frozen Creator wallet
   │              │         └─ surplus → Backer claim pro-rata
       │              └─ challenge được chấp nhận / timeout → REFUNDING (4)
       └─ thiếu goal → REFUNDING (4)

Hủy trước completion / quá hạn release theo policy → REFUNDING (4)
```

`submit-review` ghi thời điểm bắt đầu để audit. Không có hạn SLA cố định, không có
timer tự động và không tự duyệt, từ chối, mở pledge hay chuyển tiền.
`CHANGES_REQUESTED` xóa cửa sổ review hiện tại và trả Creator về `DRAFT`; Creator
có thể sửa, khóa và gửi lại không giới hạn. `APPROVED` chưa có nghĩa đã phát hành
on-chain; chỉ binding canonical có state `FUNDING` mới xuất hiện ở surface nhận pledge.
`RELEASED` nghĩa PDF đã duyệt, **chưa phải Creator đã nhận goal hoặc Backer đã claim surplus**. `COMPLETED` mới là contract đã chốt settlement và mở surplus claims.

### 2.4. Quy tắc tiền

- Một giá PDF cố định; mỗi pledge có quantity nguyên dương và một ví có thể pledge nhiều lần. Không có kho hay tier phụ; ví khác không đồng nghĩa người khác.
- Pledge được vượt goal tới hết hạn. Đủ goal sớm vẫn phải chờ hết hạn để chốt funding.
- Sau khi `ACTIVE`, Creator có thể gửi request giải ngân. Mỗi lần phải có số tiền, mục đích, lý do, breakdown và một file giải thích chi tiết cách sử dụng tiền. Từ lần 2, request phải có thêm file bằng chứng sử dụng khoản trước; hai loại file được lưu và hiển thị riêng. Resolver tự quyết định, không có timer 7 ngày; approval chuyển số tiền vào ví Creator và tính vào `creatorPaid`.
- Phí nền tảng bằng 0. Sau PDF được duyệt, hết challenge window và không còn challenge mở, Creator lập completion dossier gồm tiêu đề/tóm tắt/lý do và file tùy chọn rồi ký `requestCompletion`. Request chỉ chuyển sang `COMPLETION_REQUESTED (5)`; Resolver có thể duyệt, từ chối hoặc yêu cầu sửa bất cứ khi nào, không có timer 7 ngày riêng cho completion.
- Khi `approveCompletion`, contract chỉ chuyển phần còn thiếu `goal - creatorPaid` tới frozen Creator wallet. Nếu `raised > goal`, phần `raised - goal` nằm trong surplus pool; mỗi Backer canonical claim đúng tỷ lệ contribution của mình và chọn nhận về ví hoặc donate cho Creator. Không có Admin destination/split trong MVP.
- Không đủ goal; Creator hủy trước completion; production hoặc Creator confirmation không hoàn tất trong 30 ngày sau funding; chưa có PDF được chấp nhận khi tới `releaseDeadline + 7 ngày`; challenge chưa giải quyết khi tới `disputeDeadline` (30 ngày từ challenge đầu): mở refund. Challenge được Resolver chấp nhận cũng mở refund cho cả campaign.
- Mỗi Backer tự claim lại toàn giá pledge đúng một lần, về ví đã pledge. `REFUND_ELIGIBLE` chưa phải đã nhận tiền.
- Giao dịch token thất bại thì trạng thái revert; có thể retry. Không claim/request/approve completion hoặc claim surplus thành công hai lần. Sau completion không có refund goal tự động; surplus phải được từng Backer claim.
- Hết hạn không tự phát sinh giao dịch: phải bấm nút chuyển trạng thái/claim tương ứng; indexer không ký thay.

Ví dụ goal 20, giá 10 MockUSDC: A pledge 10 và B pledge 20 → `raised=30`, `escrowed=30`. Approve completion → Creator +20, `surplusPool=10`. A claim nhận 3.33 (hoặc phần floor theo contract), B claim nhận phần còn lại 6.67; nếu một Backer donate thì đúng phần của Backer đó chuyển cho Creator. Phí gas tính bằng ETH test riêng.

### 2.5. PDF, community và challenge

- Trang mẫu và bằng chứng riêng tư; chỉ thông tin/hash được chọn lọc xuất hiện công khai. File tối đa **10 MiB**; PDF cuối phải là PDF thật, không mã hóa, có cấu trúc/trang hợp lệ.
- Upload thành công chỉ lưu file/hash. Creator còn phải ký gửi hash; Resolver còn phải duyệt đúng hash. Duyệt sản xuất chưa mở tải PDF.
- PDF cuối được chấp nhận là bất biến. Việc sửa file rồi giữ nguyên tên không thay được hash đã duyệt.
- Quyền tải gắn tài khoản Backer ban đầu và pledge canonical. Ticket tải hết hạn sau **60 giây theo giờ server**; mỗi GET vẫn cần session đúng tài khoản và kiểm lại quyền. Ticket hết hạn không làm entitlement hết hạn.
- UI hiển thị `DOWNLOAD_ELIGIBLE`; API cấp ticket trả `DOWNLOAD_AVAILABLE`. `PENDING_RELEASE`, `REFUND_ELIGIBLE`, `REFUNDED`, `ORPHANED` không được tải.
- Lượt tải không chứng minh đã đọc. `BACKER_CONFIRMED` là nút xác nhận riêng; không bắt buộc để completion, không chuyển tiền và không thay thế challenge.
- Community đọc cam kết và gửi `COMMENT` công khai hoặc `ISSUE` riêng tới Creator/Resolver. Backer thấy các nhận xét công khai của cộng đồng và góp ý riêng của chính mình; không thấy issue riêng của người khác. Nhận xét/báo sự cố không tự mở tranh chấp contract.
- Backer phải ký `challengeRelease` trước deadline để chặn completion. Mỗi ví một challenge/campaign. Resolver bác challenge thì giữ deadline cũ; chấp nhận thì mở refund toàn campaign. Backup chờ 7 ngày từ challenge tương ứng.
- Thiếu/sai file trả lỗi và tạo `FILE_UNAVAILABLE`; không giả vờ đã giao, không tự refund. Sau completion vẫn có báo sự cố nhưng không có cơ chế hoàn tiền tự động.
- Có challenge mở nhưng campaign vẫn `RELEASED` thì Backer đủ quyền vẫn có thể tải; khi chuyển `REFUNDING` thì quyền tải bị chặn ngay, kể cả chưa claim.

### 2.6. Góp ý trước funding và review sau funding

Hai luồng này cùng nằm trong campaign nhưng có mục đích và quyền khác nhau:

| Giai đoạn | Người dùng | Hành động | Dữ liệu/quyền cần kiểm |
| --- | --- | --- | --- |
| `COMMUNITY_REVIEW` trước funding | Community/Backer chưa có entitlement | Gửi `COMMENT` công khai hoặc `ISSUE` riêng theo commitment/evidence; Creator và Resolver đọc được cả hai | Comment công khai hiển thị ẩn danh cho community; issue riêng chỉ hiển thị với người gửi, Creator và Resolver; không mở pledge, không đổi review decision |
| Correction trước funding | Creator | Khi gửi lại revision đã sửa, gửi một phản hồi chung; có thể link nhiều feedback cụ thể bằng tag/ID | Chỉ gửi cùng `submit-review`; không phải form tự góp ý và không trả lời từng item bắt buộc |
| Contract state `ACTIVE`, `RELEASE_REVIEW`, `RELEASED`, `COMPLETED` | Backer có entitlement canonical, chưa refund | Mở một thread với Creator theo commitment/production target; Backer và Creator nối tiếp message append-only | Backend kiểm tra publication canonical, chain state và entitlement hiện tại; không tin số tiền do frontend gửi |
| Thread chưa được làm rõ | Backer | Gửi escalation tới Resolver, tối đa một case cho mỗi thread | Tạo case off-chain; không tự mở refund/dispute trên contract |
| Resolver case | Resolver | Đọc full context, yêu cầu Creator làm rõ, ghi outcome | `RESOLVED`, `DISMISSED`, hoặc `FORMAL_DISPUTE` chỉ là outcome conversation; bước tài chính khác phải theo workflow/contract riêng |

Creator không gửi “feedback cho chính mình”. Creator chỉ gửi **phản hồi chung
cho revision correction** và có thể gắn các feedback của Backer làm ngữ cảnh.
Sau khi campaign đã funded, Creator là một bên tham gia thread và có thể trả lời
Backer; Resolver chỉ xuất hiện khi Backer escalation hoặc trong console được cấp
quyền.

Luồng nghiệm thu tối thiểu:

1. U hoặc B1 gửi góp ý ở `COMMUNITY_REVIEW`; kiểm tra Creator thấy nội dung nhưng
   không có form gửi feedback thông thường.
2. R yêu cầu sửa; C sửa hồ sơ, chọn vài feedback liên quan và gửi một response
   chung khi `submit-review`; kiểm tra lịch sử response không làm thay đổi draft
   ngoài revision mới.
3. Sau khi campaign canonical đạt `ACTIVE`, B1 mở thread với target hiện tại;
   C trả lời; cả hai thấy cùng message theo thứ tự append-only.
4. B1 escalation; kiểm tra Resolver Console có case với commitment, chain/indexer
   snapshot, entitlement, feedback liên kết và toàn bộ thread.
5. R yêu cầu C làm rõ rồi ghi outcome; kiểm tra thread/case đổi trạng thái nhưng
   `canonical`, `refunded`, escrow và contract state không đổi.
6. Lặp lại với entitlement `ORPHANED` hoặc `REFUNDED`; API phải từ chối mở thread
   và giao diện không hiện CTA review sau funding.

## 3. Chuẩn bị môi trường và tài khoản

### 3.1. Chạy/kiểm tra runtime

Mở PowerShell tại repo. Docker Desktop phải đang chạy. Với bản đã build hiện tại:

```powershell
Set-Location 'C:\Users\dell\Desktop\FundTogether'
& .\backend\scripts\campaigns\start-services.ps1 -SkipBuild
if ($LASTEXITCODE -ne 0) { throw 'Launcher failed' }
Invoke-RestMethod 'http://127.0.0.1:3002/health'
$deployment = Invoke-RestMethod 'http://127.0.0.1:3002/v1/fundtogether/campaigns/deployment'
$deployment | Select-Object protocolKind, chainId, contractAddress, tokenAddress, resolver, backupResolver
```

Kỳ vọng `health.status=ok`, deployment `CAMPAIGNS`, chain `31339`, và địa chỉ trùng manifest Campaign. Launcher dùng lại API đang chạy nếu identity phù hợp; lệnh đó không tự reload code mới vào API cũ.

Mở **http://localhost:5175/#/campaigns**. Dùng `localhost` nhất quán trong browser để khớp cookie/origin/SIWE; không đổi qua `127.0.0.1` giữa chừng.

| Mục | Giá trị |
| --- | --- |
| Mạng ví | FundTogether local; RPC `http://127.0.0.1:9548`; chain ID `31339`; native currency `ETH`; không cần explorer |
| Token | MockUSDC, 6 decimals; lấy `tokenAddress` từ deployment trên |
| API / Web | 3002 / 5175 |
| PostgreSQL / MinIO | 5436 / 9202–9203; ứng dụng dùng cấu hình `.local/fundtogether/backend.env` |
| Manifest Campaign | `.local/fundtogether/generated/campaigns-deployment.local.json` |

Địa chỉ đã đối chiếu sau reset ngày 13/10/2026: Campaign `0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`, Primary `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`, Backup `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`. Luôn kiểm deployment đang chạy thay vì mặc định các địa chỉ này còn đúng.

### 3.2. Đọc giờ blockchain trước khi chọn ngày

Chain 31339 đã được tạo lại ngày 13/10/2026. Khi xác minh lần cuối, block 4 ở `2026-10-13 16:14:36 UTC`, khớp giờ máy tới giây. Timestamp của block mới nhất có thể đứng yên khi chưa mine block, nên vẫn phải đọc giờ chain trước khi chọn ngày; giao dịch tiếp theo sẽ tạo block mới.

Các suite/script tự động có tua giờ hiện đều yêu cầu Anvil và bọc toàn bộ lần chạy bằng `evm_snapshot`/`evm_revert`. Kiểm chứng sau full backend, historical 6-scenario và browser Campaign cho thấy block hash/timestamp trước–sau không đổi. Lệnh tua giờ thủ công ở mục 9.3 vẫn tác động toàn chain và chỉ đi tới tương lai.

Chạy khối này để khai báo helper đọc RPC và lấy ngày gợi ý. Đây là lệnh đọc, chưa tua giờ:

```powershell
function Invoke-CampaignRpc {
    param([string]$Method, [object[]]$RpcParams = @())
    $request = @{ jsonrpc = '2.0'; id = 1; method = $Method; params = $RpcParams }
    $response = Invoke-RestMethod 'http://127.0.0.1:9548' -Method Post -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 8 -Compress)
    if ($response.error) { throw ($response.error | ConvertTo-Json -Compress) }
    return $response.result
}
if ([Convert]::ToInt64((Invoke-CampaignRpc 'eth_chainId'), 16) -ne 31339) { throw 'Wrong chain' }
$latestBlock = Invoke-CampaignRpc 'eth_getBlockByNumber' @('latest', $false)
$chainClock = [DateTimeOffset]::FromUnixTimeSeconds([Convert]::ToInt64($latestBlock.timestamp, 16))
[pscustomobject]@{
    ChainTimeUTC = $chainClock.ToString('u')
    ReleaseStartUTC = $chainClock.AddDays(30).ToString('yyyy-MM-dd')
    ReleaseEndUTC = $chainClock.AddDays(40).ToString('yyyy-MM-dd')
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

## 4. Kịch bản chính: tạo → pledge → tải → completion settlement

Làm lần lượt; với mỗi giao dịch phải thấy **`ON_CHAIN_CONFIRMED`**, không dừng ở popup ví/tx hash. Lưu UUID campaign từ URL; ID on-chain là số khác, có thể bắt đầu từ 0.

| Bước / actor | Thao tác cụ thể | Kết quả cần quan sát |
| --- | --- | --- |
| H01 — C | `#/campaigns/creator` → điền tên, bio, cam kết IP → gửi hồ sơ tác giả | `PENDING`; chưa tạo draft được khi chưa `VERIFIED` |
| H02 — A | `#/campaigns/resolver` → **Flow V1: Duyệt Hồ Sơ Tác Giả** → đọc hồ sơ → **Phê duyệt (VERIFIED)** | C tải lại thấy `VERIFIED`. Đây là quyết định người test; không phải hệ thống tự chứng minh bản quyền |
| H03 — C | Tạo campaign bằng bộ dữ liệu mục 3.4 → **Lưu Bản thảo Chiến dịch** | `DRAFT`; chỉ COMICS_ARTBOOK, một standard PDF; không kho/địa chỉ/tracking |
| H04 — C | **Hồ sơ thẩm định PDF** → chọn ví đã liên kết, điền đề cương/ngân sách/evidence plan, hai ngày theo chain; upload và tick chọn mẫu → **Lưu hồ sơ thẩm định** | Lưu được revision mới; mẫu tải lại đúng file. Mẫu phải được gắn vào hồ sơ, không chỉ upload |
| H05 — C | Kiểm nội dung → **Khóa cam kết PDF đã lưu** → **Gửi Resolver thẩm định** | `FROZEN` rồi `UNDER_REVIEW_PRIVATE`; có commitment hash; terms chưa public và không sửa tự do |
| H05a — R | Resolver Console → đọc snapshot riêng tư, tải trang mẫu → **Mở community review** | `COMMUNITY_REVIEW`; hồ sơ mới xuất hiện ở `/review`, chưa mở pledge |
| H06 — U | Mở `#/campaigns`, vào campaign → chọn cam kết → nhập `COMMENT` → **Gửi phản hồi có tài khoản** | Chỉ gửi được khi `COMMUNITY_REVIEW`; comment hiển thị ẩn danh cho community, C/R đọc được chi tiết; nếu gửi `ISSUE` thì chỉ U, C và R thấy. Chưa có pledge |
| H07 — R | Console → đọc snapshot, tải trang mẫu, xem phản hồi → nhập lý do → **Duyệt hồ sơ PDF** | `APPROVED`. Chưa có campaign on-chain, chưa chuyển tiền |
| H07a — R | Gửi `CHANGES_REQUESTED` | Trạng thái về `DRAFT`, lịch sử review còn; snapshot/hash active và thời điểm review hiện tại được xóa |
| H07b — C | Sửa hồ sơ → **Lưu bản nháp** → **Khóa cam kết** → **Gửi Resolver thẩm định** lần hai | Vòng correction lặp được; tạo commitment mới và không dùng commitment cũ để review |
| H08 — R | **Mở duyệt hợp đồng, sản xuất & PDF local** → **Ký duyệt cam kết local** bằng ví Primary | Receipt và sync thành công. Đây là `approveCampaign`, không phải ERC20 approve; public surface vẫn là `ACTIVATION_PENDING` |
| H09 — C | Studio → **Mở community & phát hành PDF local** → **Tạo campaign local từ cam kết** bằng ví C đã khóa | `ON_CHAIN_CONFIRMED`, ID on-chain, public surface chuyển **Đang gây quỹ**, raised/escrow 0; hạn funding đúng 1 ngày từ block tạo |
| H10 — B1, B2 | Mở link công khai `#/campaigns/<UUID>` → chọn quantity 2 → **Ủng hộ 20 · 2 gói**; sau đó pledge thêm quantity 1 | Khi thiếu allowance, ví có thể hỏi hai giao dịch: ERC20 approve rồi pledge. Một pledge quantity 2 tạo `amount=20`; pledge thêm quantity 1 tạo log/entitlement riêng. Raised và escrow tăng đúng `price × quantity`; chưa tải PDF |
| H11 — người đăng nhập có ví | Thử **Chốt kết quả khi hết hạn gây quỹ** trước hạn: phải bị chặn. Chờ hết hạn hoặc dùng mục 9.3 → bấm lại | Đủ goal chuyển **Đang sản xuất / ACTIVE**; tiền vẫn escrow=20, C chưa nhận token |
| H12 — C | Ở URL `/creator`, chọn bằng chứng sản xuất và summary → **Lưu file và hash** → **Gửi đúng hash này để Resolver duyệt** | Hai bước riêng: file đã lưu rồi giao dịch đã sync. Chưa productionApproved, chưa quyền tải PDF |
| H13 — R | Ở URL `/resolver` → **Tải file để kiểm tra**, đọc community → **Duyệt bằng chứng sản xuất** | `EVIDENCE_REVIEWED`; `productionApproved=true`; vẫn chưa được tải PDF cuối |
| H14 — C | Upload PDF cuối và summary → **Lưu file và hash** → **Gửi đúng hash này để Resolver duyệt** | **Chờ duyệt PDF / RELEASE_REVIEW**; hiện hash PDF và hash evidence; chưa mở tải |
| H15 — R | Tải đúng PDF, mở kiểm trang/nội dung, đối chiếu cam kết → **Duyệt PDF cuối** | **PDF đã được duyệt / RELEASED**; challengeDeadline = thời điểm duyệt +7 ngày; escrow còn 20 |
| H16 — B1 | Mở **Phần thưởng của tôi** hoặc campaign → **Kiểm tra và tải PDF riêng tư** | `DOWNLOAD_ELIGIBLE`; nhận `campaign.pdf`, mở đọc được và đúng hash. Chưa tự có `BACKER_CONFIRMED` |
| H17 — B1 | **Tôi đã kiểm tra và xác nhận PDF** | `BACKER_CONFIRMED`; escrow vẫn 20. B2 không xác nhận vẫn giữ quyền và không chặn completion |
| H18 — C | Trước challenge window hoặc còn dispute: kiểm tra form completion bị chặn. Sau challenge window, không mở challenge → Creator điền tiêu đề/tóm tắt/lý do, upload file tùy chọn → ký `requestCompletion` | `COMPLETION_REQUESTED (5)`, chưa đổi escrow và chưa tăng số dư C; Backer/Resolver đọc được dossier. Không có amount/destination trong form |
| H19 — R | Resolver đọc dossier và phản hồi Backer → chuẩn bị decision → ký `approveCompletion` | `CompletionApproved` canonical → **COMPLETED (6)**; C nhận đúng goal 20, surplus pool giữ phần vượt goal; mỗi Backer thấy đúng claimable pro-rata |
| H20 — R/C | Tạo revision bị từ chối/yêu cầu sửa, sau đó Creator gửi request mới | Request cũ giữ immutable reason/hash; campaign về `RELEASED (3)`; revision mới có requestHash mới và chỉ Resolver mới quyết định |

Trong H15 phải thực sự mở PDF: xem đủ trang, font/ảnh, nội dung và việc đáp ứng cam kết. Parser không thay phần kiểm tra này.

Ghi baseline số dư ngay trước pledge/completion/refund/surplus claim; allowance không phải token đã chi. Nếu ví từ chối ký thì campaign/entitlement/settlement không được ghi thành công.

## 5. Các nhánh kết thúc: campaign riêng cho từng case

Không tua thời gian qua deadline của campaign khác đang test. Hoàn tất một case, đọc lại chain clock, rồi mới tạo campaign tiếp theo.

| Case | Chuẩn bị / thao tác | Kỳ vọng |
| --- | --- | --- |
| F01 — Thiếu goal | Goal20/giá10, chỉ B1 pledge; qua fundingDeadline, chốt kết quả | `REFUNDING`, B1 `REFUND_ELIGIBLE`; bấm **Nhận hoàn tiền vào ví đã pledge** → token +10, `REFUNDED`, escrow0; không claim lại |
| F02 — Creator hủy | Có pledge, chưa completion; C vào `/creator` → **Hủy campaign và mở hoàn tiền toàn bộ** | Refund toàn giá từng pledge; chỉ C có quyền hủy; không có nút ứng tiền |
| F03 — Challenge được chấp nhận | Đi tới H15; B1 nhập lý do ≥10 ký tự → **Gửi báo cáo và challenge bằng ví đã pledge** | Có chi tiết riêng tư và giao dịch challenge riêng; openDisputes tăng, completion bị chặn |
| F03 tiếp — R | Nhập lý do quyết định → **Chấp nhận: mở hoàn tiền toàn campaign** | Tất cả Backer chuyển `REFUND_ELIGIBLE`, kể cả B2 không challenge; không tải được ngay từ `REFUNDING`; từng người claim đầy đủ |
| F04 — Bác challenge | Campaign khác tới H15; B1 challenge; R nhập lý do → **Bác khiếu nại** | Challenge resolved, openDisputes giảm; challengeDeadline không kéo dài; hết hạn và không còn dispute thì completion được |
| F05 — Không có PDF được duyệt | Creator xác nhận hoàn thành để chốt `releaseDeadline`, nhưng campaign chưa `RELEASED`; tới releaseDeadline+7 ngày → **Mở hoàn tiền khi quá hạn policy** | `REFUNDING`; trước mốc này không được tự mở refund chỉ vì chưa có file |
| F05b — Creator chưa xác nhận hoàn thành | Campaign đã `ACTIVE`, production evidence đã được Resolver duyệt nhưng Creator chưa gọi `confirmCampaignCompletion`; tới fundingDeadline+30 ngày → **Mở hoàn tiền khi quá hạn policy** | `REFUNDING`; Resolver không được tự chốt deadline thay Creator |
| F06 — Resolver không xử lý challenge | Mở challenge, không giải quyết; tới disputeDeadline → nút mở hoàn tiền | `REFUNDING`; 30 ngày tính từ challenge đầu, không cộng lại theo mỗi phản hồi |
| F07 — Backup | Có production/PDF review hoặc challenge đang chờ; RB dùng đúng ví Backup | Trước requestedAt/openedAt+7 ngày bị chặn; sau mốc được review. Không dùng RB cho H08 |
| F08 — Yêu cầu sửa | Ở H07, R bấm **Yêu cầu sửa** | Trở về `DRAFT`; lý do/lịch sử giữ lại. C sửa terms, lưu/khóa/gửi lại; commitment mới khác khi terms đổi |
| F09 — Từ chối evidence/PDF | R **Từ chối bằng chứng sản xuất** hoặc **Từ chối PDF cuối** | Cho C nộp lại đúng giai đoạn; PDF từ chối không mở tải, không completion; production đã duyệt không bị coi là final PDF |
| F10 — Vượt goal | Backer A pledge10 và Backer B pledge20 trước deadline với goal20 | Raised/escrow30; approve completion → Creator nhận20, surplus10; A/B claim theo đúng tỷ lệ contribution, không chia đều và không chọn lọc Backer |
| F11 — Surplus refund | Sau F10, A chọn **Nhận về ví của tôi** | A nhận đúng phần pro-rata của A; claim idempotent, không thể claim lần hai |
| F12 — Surplus donation | Sau F10, B chọn **Gửi cho Creator** | Đúng phần pro-rata của B chuyển tới frozen Creator wallet; không có Admin destination/split |
| F13 — Exact goal | Raised đúng goal rồi approve completion | Creator nhận goal; surplus pool bằng 0; Backer không thấy claim surplus |
| F14 — Completion bị từ chối | Resolver reject hoặc yêu cầu sửa request | Campaign về `RELEASED`; escrow không đổi; Creator gửi dossier revision mới, không có timer bắt buộc |

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
| P07 | Xem public API bằng U/khách | Không lộ identity declaration, object key, file mẫu, PDF hoặc issue riêng của người khác; comment công khai không lộ danh tính tác giả |
| P08 | B1 tải nhiều lần nhưng không bấm xác nhận | Không tự thành `BACKER_CONFIRMED`; không tự completion hoặc settlement |
| P09 — môi trường kiểm thử riêng | File đã duyệt bị thiếu/hỏng ở storage | Lỗi file + báo cáo `FILE_UNAVAILABLE`, không thông báo tải thành công; không tự đổi hash/refund |

P09 và reorg không nên mô phỏng bằng xóa object/reset chain đang giữ dữ liệu chính. Hai nhánh này đã có integration test; nếu chưa có môi trường dùng riêng để phá lỗi thì ghi `NOT_RUN` cho test tay, không ghi PASS thay bằng kết quả tự động.

Có thể lấy ticket mà chưa download bằng DevTools Console **trong tab localhost:5175 của B1**:

```javascript
const manualRightsResponse = await fetch('http://localhost:3002/v1/fundtogether/campaigns/entitlements', { credentials: 'include' });
if (!manualRightsResponse.ok) throw new Error(`HTTP ${manualRightsResponse.status}`);
const manualRights = await manualRightsResponse.json();
const manualRight = manualRights.find(item => item.campaignId === 'THAY_BANG_UUID_CAMPAIGN');
if (!manualRight) throw new Error('Không có entitlement của campaign này');
const manualTicketResponse = await fetch(`http://localhost:3002/v1/fundtogether/campaigns/entitlements/${manualRight.id}/download`, {
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
| N01 | Trong request tạo draft hợp lệ, đổi category hoặc benefit type/format; thêm tier thứ hai, `shippingAddress`, tracking hoặc inventory | Server trả 400; không tạo draft. Phải gửi tới server, không chỉ kiểm form bị ẩn |
| N02 | Nhập lời hứa “tặng sách in”, “shipping”, “merchandise” vào terms | Bị chặn bởi kiểm phạm vi; đổi về mô tả PDF |
| N03 | Goal/giá bằng0, âm, hơn6 số thập phân; duration0/61 | Bị từ chối. Giá lớn hơn goal không được phát hành theo policy |
| N04 | C2 đăng nhập rồi gọi sửa/khóa/upload campaign của C | 403 hoặc không thấy tài nguyên; không có thay đổi |
| N05 | Creator tự duyệt profile/campaign; U truy cập route ADMIN/Resolver | Bị từ chối; đổi menu/URL không tăng quyền |
| N06 | R đúng role nhưng nối ví khác; hoặc đúng ví nhưng sai chain | Không được gửi thao tác tài chính hợp lệ |
| N07 | Nhập quantity 0/âm/thập phân; từ chối popup token approve/pledge; thử pledge lần hai cùng ví | Quantity không hợp lệ bị chặn; giao dịch thất bại không tạo entitlement/token chi mới; pledge hợp lệ lần hai được phép và idempotent theo tx/log |
| N08 | Đăng xuất B1, đăng nhập U/B2 trong cùng browser | Không thấy cache quyền/file riêng của B1. Ví nối cũ không tự được liên kết vào tài khoản mới |
| N09 | Đổi account/mạng trong extension khi yêu cầu ký đang mở | Phải bị chặn hoặc yêu cầu làm lại đúng actor; không hoàn tất nhầm người |
| N10 | C thử gỡ ví nhận tiền khi cam kết đã khóa/approved | Không được âm thầm phá liên kết nghĩa vụ; lưu lỗi và dừng nếu ứng dụng cho qua |
| N11 | Gửi lại cùng tx hash qua sync API | Không tăng số quyền, raised hoặc escrow lần nữa |
| N12 | Gọi API shipping/batches/delivered/confirm giao hàng đã gỡ | 404; không sinh dữ liệu physical mới |

Để N01 có ý nghĩa: lấy payload tạo draft hợp lệ trong tab Network, dùng “Copy as fetch”, đổi **một trường sai mỗi lần** và giữ `credentials: 'include'`. Dùng C đã `VERIFIED`; response 401 do hết session không chứng minh scope validation. Với PATCH, dùng campaign `DRAFT` và revision mới nhất.

Đường physical tiêu biểu đã gỡ: `/v1/fundtogether/backer/entitlements/<UUID>/shipping`, `/v1/fundtogether/creator/campaigns/<UUID>/batches`. Endpoint Campaign `/v1/fundtogether/campaigns/entitlements/<UUID>/confirm` vẫn tồn tại vì đó là xác nhận PDF, không phải nhận hàng.

Nếu N08–N10 thất bại: ghi FAIL, lưu actor/URL/giờ/thao tác và dừng các giao dịch còn lại của phiên. Không dùng việc đăng nhập lại thành công để xóa kết quả lỗi ban đầu.

## 8. Ghi nhận kết quả và lỗi thường gặp

### 8.1. Biên bản mỗi lần test

Sao chép bảng này vào ghi chú riêng. Dùng `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`; không tích hoàn tất nếu chỉ đọc hướng dẫn.

| Trường | Ghi nhận |
| --- | --- |
| Ngày/người test, phiên bản browser/ví | … |
| Branch/SHA và working tree có thay đổi | … |
| Chain ID, genesis, Campaign address | … |
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
| Không thấy campaign ở feed | Kiểm tra đúng surface: `/review` chỉ cho `COMMUNITY_REVIEW`, `/activation` cho `APPROVED` chưa có binding canonical, `/funding` chỉ cho binding canonical state FUNDING. `UNDER_REVIEW_PRIVATE` chỉ nằm trong Resolver Console; draft nằm trong Studio; reload trang sau khi đổi trạng thái |
| Hồ sơ ghi “Publish và nhận pledge chưa mở” | Đây là chữ cũ trong panel chuẩn bị. Với hồ sơ APPROVED, mở link Campaign `/creator` hoặc `/resolver` để chạy H08–H09; chỉ `ON_CHAIN_CONFIRMED` mới là phát hành xong |
| Console có “V1–V4”, cọc/in ấn hoặc nút hợp đồng cũ | Đó là nhãn/phần lịch sử; dùng đúng card COMICS_ARTBOOK và link quản lý Campaign. Không dùng thao tác advance của campaign lịch sử để test policy mới |
| Không thấy hồ sơ chờ / không duyệt được | Kiểm role ADMIN/RESOLVER của **tài khoản**, rồi ví ký theo manifest; không suy ra từ tên account |
| `Release deadline must be after...` | Đọc giờ chain mục3.2; tạo/sửa draft với ngày tương lai theo chain, rồi freeze/review lại. Đã approved thì cần hồ sơ mới nếu terms không còn hợp lệ |
| `TooEarly`, `WrongState`, `Unauthorized` | Đối chiếu state, deadline và đúng ví. Nút xuất hiện không bảo đảm đã đủ điều kiện; simulation/contract vẫn chặn |
| MockUSDC không hiện trong ví | Thêm đúng token từ manifest, decimals6; native ETH chỉ trả gas |
| Ví ký treo | Mở đúng extension/provider, xử lý yêu cầu đang chờ, kiểm ví/mạng. Ngắt nối rồi kết nối lại; không bỏ qua chữ ký SIWE |
| Có receipt success nhưng UI chưa cập nhật | Ghi tx hash; bấm **Tải lại trạng thái canonical**/reload, kiểm API/indexer. Không pledge lại chỉ vì giao diện chưa cập nhật |
| PDF tải lỗi | Kiểm account/quyền/state/ticket; xin ticket mới. Nếu `FILE_UNAVAILABLE`, gửi Resolver kiểm. Không thay file/hash đã duyệt để che lỗi |

Log local ở `.local/fundtogether/runtime/api.log`, `api-error.log`, `web.log`, `web-error.log`. Ghi lỗi cụ thể; không chia sẻ cookie, mật khẩu, seed, `.env`, URL tải riêng tư hoặc bản sao DB.

## 9. Lệnh hỗ trợ của operator cho môi trường local

Các lệnh bên dưới dùng để chuẩn bị/test, **chưa được chạy khi tạo tài liệu này**. Chạy tại repo root. Chúng không phải bước người dùng sản phẩm phải làm hàng ngày. Không chạy test tự động có reorg/tua giờ đồng thời với nghiệm thu tay.

### 9.1. Cấp một staff role cho tài khoản test đã đăng ký

Chỉ operator DB thực hiện. Script thêm đúng một role, giữ các role đang có; không xác minh Creator thay ADMIN và không cấp quyền ví trên contract.

```powershell
$env:CAMPAIGN_TEST_EMAIL = Read-Host 'Email tai khoan test da dang ky'
$env:CAMPAIGN_TEST_ROLE = Read-Host 'Role can them: ADMIN hoac RESOLVER'
@'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('./backend/node_modules/pg');
const env = require('./backend/node_modules/dotenv').parse(fs.readFileSync('.local/fundtogether/backend.env'));
const target = new URL(env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.port === '5436' && target.pathname === '/fundtogether');
const email = process.env.CAMPAIGN_TEST_EMAIL.trim().toLowerCase();
const role = process.env.CAMPAIGN_TEST_ROLE.trim().toUpperCase();
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
Remove-Item Env:CAMPAIGN_TEST_EMAIL, Env:CAMPAIGN_TEST_ROLE
```

Sau đó đăng nhập lại. ADMIN duyệt profile C qua H02; không tự đặt profile `VERIFIED` trong DB để thay bước nghiệm thu này.

### 9.2. Cộng 1 ETH test và mint 100 MockUSDC cho một ví test

Chạy một lần cho mỗi ví cần dùng. Script chỉ dùng Anvil local31339, kiểm deployment hiện tại, dùng signer mở khóa của Anvil để mint token giả; không yêu cầu private key. Đây là chuẩn bị fixture, không phải bằng chứng MetaMask đã ký thành công.

```powershell
$env:CAMPAIGN_TEST_WALLET = Read-Host 'Dia chi vi test 0x...'
@'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createPublicClient, createWalletClient, defineChain, http, isAddress, toHex, formatUnits } = require('./backend/node_modules/viem');
const { parseDeploymentManifest, verifyDeploymentManifest } = require('./backend/dist/src/blockchain/deployment.js');
const manifest = parseDeploymentManifest(JSON.parse(fs.readFileSync('.local/fundtogether/generated/campaigns-deployment.local.json')));
const token = JSON.parse(fs.readFileSync('contracts/out/MockUSDC.sol/MockUSDC.json'));
const recipient = process.env.CAMPAIGN_TEST_WALLET.trim();
assert.ok(isAddress(recipient));
assert.ok(['http://127.0.0.1:9548', 'http://localhost:9548'].includes(manifest.rpcUrl));
const chain = defineChain({ id: 31339, name: 'Campaign local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
(async () => {
  const client = createPublicClient({ chain, transport: http(manifest.rpcUrl) });
  assert.equal(await client.getChainId(), 31339);
  assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i);
  await verifyDeploymentManifest(client, manifest);
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
Remove-Item Env:CAMPAIGN_TEST_WALLET
```

### 9.3. Tua thời gian đúng mốc của một campaign local

**Ảnh hưởng toàn bộ chain31339**, không chỉ campaign đang xem. Không chạy khi người khác đang test/đang ký hoặc có campaign cần giữ cửa sổ challenge. Không `anvil_reset`, không sửa timestamp DB và không quay ngược chain.

Khai báo `Invoke-CampaignRpc` ở mục3.2 trước, rồi:

```powershell
function Move-CampaignClockTo {
    param([long]$UnixSeconds)
    if ([Convert]::ToInt64((Invoke-CampaignRpc 'eth_chainId'), 16) -ne 31339) { throw 'Wrong chain' }
    if ((Invoke-CampaignRpc 'web3_clientVersion') -notmatch 'anvil') { throw 'Anvil only' }
    $block = Invoke-CampaignRpc 'eth_getBlockByNumber' @('latest', $false)
    $current = [Convert]::ToInt64($block.timestamp, 16)
    if ($UnixSeconds -le $current) { throw 'Target must be later than current chain time' }
    Invoke-CampaignRpc 'evm_setNextBlockTimestamp' @($UnixSeconds) | Out-Null
    Invoke-CampaignRpc 'evm_mine' | Out-Null
    [DateTimeOffset]::FromUnixTimeSeconds($UnixSeconds).ToString('u')
}
$manualCampaignId = Read-Host 'UUID campaign trong URL, khong phai ID on-chain'
if ($manualCampaignId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Expected campaign UUID' }
$manualChain = Invoke-RestMethod "http://127.0.0.1:3002/v1/fundtogether/campaigns/campaigns/$manualCampaignId/chain"
if ($manualChain.status -ne 'ON_CHAIN_CONFIRMED') { throw 'Campaign is not canonical' }
# CHI CHON MOT moc phu hop, bo dau # o dong can chay:
# Move-CampaignClockTo ([long]$manualChain.snapshot.fundingDeadline + 1)
# Move-CampaignClockTo ([long]$manualChain.snapshot.challengeDeadline + 1)
# Move-CampaignClockTo ([long]$manualChain.snapshot.releaseDeadline + 7 * 86400 + 1)
# Move-CampaignClockTo ([long]$manualChain.snapshot.disputeDeadline + 1)
# Backup production/PDF: Move-CampaignClockTo ([long]$manualChain.snapshot.reviewRequestedAt + 7 * 86400 + 1)
```

Không dùng `challengeDeadline`/`disputeDeadline` bằng0 khi chưa có release/challenge. Với Backup xử lý challenge, mốc là block timestamp của **challenge của Backer đó** +7 ngày; không lấy `reviewRequestedAt` của PDF. Sau tua, bấm nút chuyển trạng thái tương ứng trong UI; tua giờ không tự finalize/completion/refund.

## 10. Tài liệu và mã nguồn đối chiếu

- [Phạm vi MVP](SCOPE.md), [policy local được duyệt](FINANCIAL_POLICY_V1.md), [workflow](WORKFLOWS.md), [kết quả kiểm chứng](../PROJECT_PROGRESS.md).
- [Contract Campaign](../../contracts/src/campaigns/FundTogetherCampaign.sol), [màn hình campaign](../../frontend/src/features/campaigns/public/Page.tsx), [form freeze/preparation](../../frontend/src/features/campaigns/creator/PreparationForm.tsx), [Resolver review](../../frontend/src/features/campaigns/resolver/ReviewPanel.tsx), [ranh giới ký và sync](../../frontend/src/features/campaigns/transactions/useTransaction.ts).
- [Delivery/ACL/ticket](../../backend/src/modules/delivery/services/delivery.service.ts), [preflight publish](../../backend/src/modules/campaigns/services/publication.service.ts), [schema campaign](../../backend/src/modules/campaigns/schemas/campaign.schema.ts).

Các hướng dẫn charity/A/B trong `docs/archive` có thể dùng cổng, role hoặc quy tắc tiền khác; không dùng chúng để nghiệm thu Campaign. Khu vực `#/campaigns/history` chỉ giữ lịch sử, không phải campaign mới để chạy test này.
