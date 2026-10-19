# FundTogether — Digital PDF local workflow

Phạm vi: COMICS_ARTBOOK, một DIGITAL_DOWNLOAD PDF, một standard tier.
Chính sách được người dùng chốt: [FINANCIAL_POLICY_V1.md](FINANCIAL_POLICY_V1.md).
Chỉ Anvil chain 31339 và MockUSDC; không public chain hoặc tài sản thật.

## Ranh giới tin cậy và phi tập trung

Workflow hiện tại là mô hình **Resolver có quyền quyết định + contract thực
thi**. Smart contract giữ escrow và áp dụng các điều kiện tài chính đã mã hóa,
nhưng không tự xác minh sự thật của bằng chứng ngoài chuỗi. Resolver vẫn là bên
được tin cậy để quyết định review, release, completion và dispute; Backup
Resolver chỉ là cơ chế takeover/fallback.

Community Review chỉ cung cấp phản hồi advisory. MVP hiện tại không có reviewer
pool, trả thưởng theo review/vote, staking/slashing, commit–reveal hay quyền
vote cộng đồng để tự phê duyệt giải ngân. Những cơ chế đó là hướng nghiên cứu
để đánh giá sau, không phải hành vi đã triển khai.

## 1. Danh tính, cam kết và community

```text
Creator khai báo danh tínhrIP → Admin độc lập xác minh
  → draft PDF + ví đã liên kết bằng SIWE + trang mẫu riêng tư
  → đề cương, ngân sách tự sản xuất, evidence plan, cửa sổ phát hành
  → khóa snapshotrhash → gửi thẩm định riêng cho Resolver
  → Resolver kiểm tra hồ sơ riêng và chủ động mở community review
  → community kiểm tra nội dung công khai và gửi phản hồi
  → Resolver duyệt r yêu cầu sửa r từ chối đúng hash
```

Creator không tự xác minh hay tự duyệt. Yêu cầu sửa giữ lịch sử snapshotrquyết định.
Sau `submit-review`, hồ sơ ở `UNDER_REVIEW_PRIVATE`; terms, đề cương, budgetrevidence
plan, hashes và file mẫu chỉ Resolver được xem. Resolver gọi `open-community-review`
để chuyển đúng snapshot hiện tại sang `COMMUNITY_REVIEW`; từ thời điểm đó terms,
đề cương, budgetrevidence plan và hashes mới xuất hiện ở public review.
IdentityrIP declaration, object keys và file mẫu vẫn riêng tư. `COMMENT` là nhận xét
công khai, hiển thị ẩn danh cho cộng đồng; `ISSUE` và `FILE_UNAVAILABLE` là góp ý
riêng gửi tới Creator/Resolver. Phản hồi không là bỏ
phiếu, quyền tải hoặc phê duyệt tiền. Retry cùng nội dung không tạo bản trùng;
góp ý bổ sung là bản ghi mới, không sửa nội dung cũ.

### Quy trình thẩm định và vòng sửa hồ sơ

Sau `submit-review`, hồ sơ vào `UNDER_REVIEW_PRIVATE` và ghi `review_started_at` để audit.
Không có deadline cố định, timer hoặc chuyển trạng thái tự động; Resolver đóng hồ
sơ theo checklist và hiệp ướcrpolicy đã thống nhất.

Khi Resolver mở cộng đồng, hồ sơ chuyển sang `COMMUNITY_REVIEW`. Chỉ trạng thái này
mới nhận feedback public và xuất hiện ở `rreview`; `UNDER_REVIEW_PRIVATE` không có
public preview, không nhận feedback và không mở pledge.

Resolver là người duy nhất quyết định. Nếu `CHANGES_REQUESTED`, hồ sơ trở lại
`DRAFT`, snapshotrhash đang review và thời điểm review hiện tại được xóa, còn lịch
sử quyết định được giữ lại. Creator có thể sửa → freeze → submit lại không giới hạn
cho tới khi Resolver duyệt hoặc từ chối.

Feed công khai tách ba surface, không trộn trạng thái: `rreview` chỉ hiển thị hồ sơ
`COMMUNITY_REVIEW`; `ractivation` hiển thị `APPROVED` nhưng chưa có binding on-chain
canonical; `rfunding` chỉ hiển thị binding canonical có state `FUNDING (0)`. `APPROVED`
không đồng nghĩa đang nhận pledge.

## 1.1 Workspace và boundary theo vai trò

Campaign detail không còn dùng một trang chung rồi ẩn/hiện mutation theo role. Mỗi
vai trò có workspace canonical riêng:

```text
Public / Backer  → #/campaigns/:id
Creator          → #/campaigns/creator/:id
Resolver         → #/campaigns/resolver/:id
Admin operations → #/admin/campaigns/:id
```

Public/Backer là nơi đọc trạng thái công khai và thực hiện pledge hoặc hành động
entitlement của chính Backer. Creator là nơi xử lý campaign do mình sở hữu và gửi
evidence, PDF, completion hoặc request nghiệp vụ thuộc Creator. Resolver xem xét hồ
sơ riêng tư, chốt review và các quyết định được contract cho phép. Admin chỉ xem
projection vận hành, publication/indexer và exception; Admin không có quyền Resolver
chỉ vì đã mở được Admin workspace.

Đây là boundary ở UI và HTTP authorization, không phải lớp bảo mật duy nhất. Route
gate chỉ giúp điều hướng đúng; backend vẫn kiểm session, ownership và role, còn
contract vẫn quyết định các chuyển trạng thái tiền. Các URL detail cũ được redirect
về route canonical tương ứng trước khi workspace mới mount.

## 2. Phát hành và pledge

```text
APPROVED → public surface ACTIVATION_PENDING
  → backend kiểm identityrvírsnapshotrreviewrdeployment
  → Primary Resolver ký approveCampaign đúng terms
  → Creator ký createCampaign bằng ví đã khóa
  → successful receipt + canonical indexer → public surface FUNDING
  → Backer approve đúng token cho tổng `price × quantity`
  → pledge một hoặc nhiều package trong một giao dịch
  → một entitlement cho mỗi canonical pledge log, kèm quantity
  → hết gây quỹ → Primary hoặc Backup Resolver gọi finalizeFunding
       đạt goal → ACTIVE; không đạt → REFUNDING
```

Một ví có thể pledge nhiều lần trong cùng campaign; mỗi lần chọn quantity dương,
không inventory cap hoặc tier phụ. Được vượt goal đến deadline. Sau khi `ACTIVE`,
Creator có thể gửi request giải ngân; lần đầu chỉ là form số tiền/mục đích/lý do/
breakdown và file giải thích sử dụng tiền. Resolver duyệt hoặc từ chối không cần chờ timer; lần 2+
mới bắt bằng chứng sử dụng khoản trước. Phí 0. DB review status và
trạng thái hợp đồng riêng biệt: APPROVED không đồng nghĩa đã phát hànhrnhận tiền.

### Quyền ký phát hành on-chain và hướng EIP-712

MVP hiện tại cố ý dùng hai giao dịch on-chain riêng để tách quyền phê duyệt và
quyền tạo campaign:

```text
Primary Resolver → approveCampaign(exact terms)
  → contract ghi approvedTerms[termsHash]
Creator → createCampaign(exact terms)
  → contract kiểm tra và tiêu thụ approval → CampaignCreated
```

`APPROVED` trong PostgreSQL chỉ là quyết định thẩm định off-chain; nó không đồng
nghĩa `approvedTerms` trên contract đã là `true`. Primary Resolver phải ký đúng
commitment, creator wallet, goal, price và duration. Creator chỉ
được tạo campaign sau khi receipt của `approveCampaign` thành công; UI phải đọc
trạng thái approval từ contract và không cho gửi giao dịch sớm. Backend không giữ
private key của Resolver và không tự ký thay Resolver.

**Định hướng post-MVP — chưa triển khai:** có thể thay giao dịch approval riêng
bằng EIP-712 typed-data signature. Resolver vẫn ký bằng ví, nhưng không gửi
transaction; Creator gửi chữ ký cùng một transaction `createCampaignWithApproval`.
Contract sẽ recover chữ ký và kiểm tra đúng Resolver, campaign terms, `chainId`,
`verifyingContract`, nonce và expiry để chống replay. Cơ chế này chỉ là định hướng
giảm ma sát UX, không thay đổi quyền quyết định của Resolver và không được coi là
flow đang chạy của deployment hiện tại.

## 3. Sản xuất và PDF cuối

```text
ACTIVE → requestDisbursement (mọi lần kèm file giải thích; lần sau kèm thêm bằng chứng khoản trước)
  → Resolver approveDisbursement / rejectDisbursement
  → upload production evidence riêng tư + tóm tắt công khai
  → submitProduction(hash) → Resolver reviewProduction đúng hash
  → EVIDENCE_REVIEWED
  → Creator confirmCampaignCompletion(releaseDeadline)
  → upload PDF cuối riêng tư + summary
  → server kiểm MIMErbytesrcấu trúcrmã hóa, tối đa 10 MiB
  → release evidence gắn file hash + production hash + commitment + deployment
  → submitRelease(pdfHash, evidenceHash) → RELEASE_REVIEW
  → Resolver kiểm file và community feedback → reviewRelease
  → RELEASED + 7 ngày challenge
```

Parser kiểm cấu trúcropenability, không chứng minh mọi trang hiển thị hoàn hảo hoặc
quyền tác giả. Resolver phải kiểm file. Backup tiếp quản sau 7 ngày chờ từng yêu cầu.
Không thay evidence đang chờ hoặc đã được duyệt; từ chối cho phép nộp lại. PDF được
chấp nhận là bất biến. Production review chưa mở download.

## 4. Download, audit và xác nhận

Canonical pledge chưa refund + đúng account + accepted PDFrhash đúng deployment
→ kiểm filerbytes → DOWNLOAD_AVAILABLE và URL backend có hạn 60 giây.
GET vẫn cần session cùng account và kiểm lại canonical entitlementrrelease.
Token URL chỉ lưu hash; URL bị che trong log. Trả PDF attachment, privaterno-store.
URL hết hạn không làm entitlement hết hạn; reorgrrefund chặn cả URL đã cấp.

Lượt tải chỉ ghi requestedAt, không chứng minh đã đọcrđồng ý. BACKER_CONFIRMED là
thao tác riêng gắn đúng release evidence, không tự tạo payment/settlement. Không DRM hoặc hosting
vĩnh viễn. File thiếursai hash trả lỗi và ghi FILE_UNAVAILABLE cho Resolver; không
tự đánh dấu giao thành công hay tự mở tranh chấp hợp đồng.

## 5. Challenge, refund và completion settlement

```text
RELEASED → Backer gửi chi tiết + challengeRelease trước deadline
  → openDisputes chặn completion → Primary / Backup hợp lệ resolveChallenge
       upheld → REFUNDING toàn campaign chưa completion
       dismissed → giữ deadline và các challenge khác
RELEASED + hết 7 ngày + zero openDisputes
  → Creator lập completion dossier, có thể upload tài liệu và ký requestCompletion
  → COMPLETION_REQUESTED
  → Resolver xem dossier + phản hồi Backer
       yêu cầu sửa/từ chối → RELEASED, giữ lịch sử revision
       duyệt đúng requestHash → approveCompletion → COMPLETED
       goal → ví Creator đã khóa; raised - goal → surplus pool
       từng Backer → refund phần pro-rata hoặc donate phần pro-rata cho Creator
```

Không đạt goal, Creator hủy trước completion, chưa có accepted PDF sau deadline+7 ngày,
hoặc challenge chưa giải quyết sau 30 ngày tính từ challenge đầu → REFUNDING.
Từng ví Backer claimRefund toàn bộ tổng giá trị đã pledge một lần. Transfer thất bại revert trạng
thái và cho phép retry. Completion không nhận amount/destination từ Creator.
Resolver quyết định duyệt hoặc yêu cầu sửa/từ chối; không có timer 7 ngày cho completion.
Approve trả đúng goal cho Creator, không tự rút phần surplus. Mọi canonical Backer được
phân phần surplus theo `contribution / completionRaised` và claim đúng một lần: nhận về
ví mình hoặc gửi cho Creator. Không có Admin destination hay split trong MVP.

## 6. Synchronization và kiểm chứng

Wallet request → submitted → successful receipt → canonical log → indexer → DBrUI.
Log identity: (chainId, contractAddress, txHash, logIndex). Xác minh genesisrbytecode,
block hash, receipt và exact log; sync lặp không tạo quyền trùng. Reorg giữ lịch sử
noncanonical nhưng loại quyền truy cập phát sinh từ log đó.

`npm run test:campaigns`, Foundry, frontend tests và
`node scripts/campaigns/campaign-browser-e2e.cjs` kiểm hành vi local. Browser runner dùng
SIWE với provider Anvil thử nghiệm; Creator verification là fixture, không là xác minh
ngoài đời hoặc nghiệm thu MetaMask thủ công. Kết quả cụ thể ở `docs/PROJECT_PROGRESS.md`.

Các suite/script dùng chain 31339 chung và có tua giờ phải snapshot toàn lần chạy,
revert trong cleanup và fail nếu RPC không phải Anvil. Tua giờ thủ công vẫn là thao tác
toàn chain và không được tự quay lùi.

## 7. Dữ liệu lịch sử và ranh giới hiện hành

Trang chính và các wire route `/v1/fundtogether/campaigns` chỉ dùng Campaign hiện hành.
Dữ liệu/ABI/indexer lịch sử được đặt dưới namespace `historical`, chỉ đọc và không nhận
pledge mới. Chúng không được trộn vào Feed, manifest hoặc state machine Campaign.

Schema hiện hành dùng các bảng `campaigns`, `campaigns_tiers`, `campaigns_entitlements`
và `historical_*` cho dữ liệu cần giữ lại để đối soát. Không còn tên bảng theo namespace
cũ, bảng organization hoặc route giao hàng vật lý trong runtime Campaign.

Runtime test hiện tại dùng `.local/fundtogether/`, manifest
`.local/fundtogether/generated/campaigns-deployment.local.json` và baseline
`backend/drizzle/fundtogether/0000_fundtogether_baseline.sql`. Dữ liệu local là disposable;
khi reset phải dừng API/indexer, backup state nếu cần, deploy lại Campaign + MockUSDC,
chạy migration rồi mới start API/web.

```powershell
node backend/scripts/campaigns/migrate-isolated.cjs
& .\backend\scripts\campaigns\start-services.ps1 -SkipBuild
```

Backup local có thể chứa PII, seed hoặc dữ liệu riêng tư và phải nằm trong `.local` bị
Git bỏ qua. Không chia sẻ chúng và không dùng tài liệu archive để nghiệm thu flow mới.
