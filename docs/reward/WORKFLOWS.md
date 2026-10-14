# FundTogether Editions — Digital PDF local workflow

Phạm vi: COMICS_ARTBOOK, một DIGITAL_DOWNLOAD PDF, một standard tier.
Chính sách được người dùng chốt: [EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md](EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md).
Chỉ Anvil chain 31339 và MockUSDC; không public chain hoặc tài sản thật.

## 1. Danh tính, cam kết và community

```text
Creator khai báo danh tính/IP → Admin độc lập xác minh
  → draft PDF + ví đã liên kết bằng SIWE + trang mẫu riêng tư
  → đề cương, ngân sách tự sản xuất, evidence plan, cửa sổ phát hành
  → khóa snapshot/hash → gửi thẩm định
  → community kiểm tra nội dung công khai và gửi phản hồi
  → Resolver duyệt / yêu cầu sửa / từ chối đúng hash
```

Creator không tự xác minh hay tự duyệt. Yêu cầu sửa giữ lịch sử snapshot/quyết định.
Khi gửi thẩm định, terms, đề cương, budget/evidence plan và hashes được công khai.
Identity/IP declaration, object keys và file mẫu vẫn riêng tư. Phản hồi có tài khoản
được gửi tới Creator/Resolver; người khác chỉ thấy số lượng. Phản hồi không là bỏ
phiếu, quyền tải hoặc phê duyệt tiền. Retry cùng nội dung không tạo bản trùng;
góp ý bổ sung là bản ghi mới, không sửa nội dung cũ.

### SLA và vòng sửa hồ sơ

Sau `submit-review`, hồ sơ vào `UNDER_REVIEW` và ghi `review_started_at` cùng
`review_deadline_at = review_started_at + 24 giờ`. Đây là SLA tham khảo để Resolver
ưu tiên xử lý, không phải timer tự động: quá hạn chỉ hiện `OVERDUE`; hồ sơ vẫn ở
`UNDER_REVIEW`, không tự `APPROVED`, `STOPPED`, mở pledge hoặc chuyển tiền.

Resolver là người duy nhất quyết định. Nếu `CHANGES_REQUESTED`, hồ sơ trở lại
`DRAFT`, snapshot/hash đang review và cửa sổ SLA được xóa, còn lịch sử quyết định
được giữ lại. Creator có thể sửa → freeze → submit lại không giới hạn cho tới khi
Resolver duyệt hoặc từ chối.

Feed công khai tách ba surface, không trộn trạng thái: `/review` chỉ hiển thị hồ sơ
`UNDER_REVIEW`; `/activation` hiển thị `APPROVED` nhưng chưa có binding on-chain
canonical; `/funding` chỉ hiển thị binding canonical có state `FUNDING (0)`. `APPROVED`
không đồng nghĩa đang nhận pledge.

## 2. Phát hành và pledge

```text
APPROVED → public surface ACTIVATION_PENDING
  → backend kiểm identity/ví/snapshot/review/deployment
  → Primary Resolver ký approveCampaign đúng terms
  → Creator ký createCampaign bằng ví đã khóa
  → successful receipt + canonical indexer → public surface FUNDING
  → Backer approve đúng token và pledge đúng giá standard
  → một entitlement / canonical pledge log
  → hết gây quỹ → bất kỳ ai gọi finalizeFunding
       đạt goal → ACTIVE; không đạt → REFUNDING
```

Một pledge/ví/campaign; không quantity, inventory cap hoặc tier phụ. Được vượt goal
đến deadline. Tiền nằm trong escrow, không ứng trước và phí 0. DB review status và
trạng thái hợp đồng riêng biệt: APPROVED không đồng nghĩa đã phát hành/nhận tiền.

## 3. Sản xuất và PDF cuối

```text
ACTIVE → upload production evidence riêng tư + tóm tắt công khai
  → submitProduction(hash) → Resolver reviewProduction đúng hash
  → EVIDENCE_REVIEWED
  → upload PDF cuối riêng tư + summary
  → server kiểm MIME/bytes/cấu trúc/mã hóa, tối đa 10 MiB
  → release evidence gắn file hash + production hash + commitment + deployment
  → submitRelease(pdfHash, evidenceHash) → RELEASE_REVIEW
  → Resolver kiểm file và community feedback → reviewRelease
  → RELEASED + 7 ngày challenge
```

Parser kiểm cấu trúc/openability, không chứng minh mọi trang hiển thị hoàn hảo hoặc
quyền tác giả. Resolver phải kiểm file. Backup tiếp quản sau 7 ngày chờ từng yêu cầu.
Không thay evidence đang chờ hoặc đã được duyệt; từ chối cho phép nộp lại. PDF được
chấp nhận là bất biến. Production review chưa mở download.

## 4. Download, audit và xác nhận

Canonical pledge chưa refund + đúng account + accepted PDF/hash đúng deployment
→ kiểm file/bytes → DOWNLOAD_AVAILABLE và URL backend có hạn 60 giây.
GET vẫn cần session cùng account và kiểm lại canonical entitlement/release.
Token URL chỉ lưu hash; URL bị che trong log. Trả PDF attachment, private/no-store.
URL hết hạn không làm entitlement hết hạn; reorg/refund chặn cả URL đã cấp.

Lượt tải chỉ ghi requestedAt, không chứng minh đã đọc/đồng ý. BACKER_CONFIRMED là
thao tác riêng gắn đúng release evidence, không tự payout. Không DRM hoặc hosting
vĩnh viễn. File thiếu/sai hash trả lỗi và ghi FILE_UNAVAILABLE cho Resolver; không
tự đánh dấu giao thành công hay tự mở tranh chấp hợp đồng.

## 5. Challenge, refund và payout

```text
RELEASED → Backer gửi chi tiết + challengeRelease trước deadline
  → openDisputes chặn payout → Primary / Backup hợp lệ resolveChallenge
       upheld → REFUNDING toàn campaign chưa payout
       dismissed → giữ deadline và các challenge khác
RELEASED + hết 7 ngày + zero openDisputes → payout tới ví Creator đã khóa → COMPLETED
```

Không đạt goal, Creator hủy trước payout, chưa có accepted PDF sau deadline+7 ngày,
hoặc challenge chưa giải quyết sau 30 ngày tính từ challenge đầu → REFUNDING.
Từng ví Backer claimRefund toàn giá pledge một lần. Transfer thất bại revert trạng
thái và cho phép retry. Không advance, supplement pool hoặc proportional refund.
Sau payout không có refund tự động; quyền tải và báo lỗi vẫn riêng biệt.

## 6. Synchronization và kiểm chứng

Wallet request → submitted → successful receipt → canonical log → indexer → DB/UI.
Log identity: (chainId, contractAddress, txHash, logIndex). Xác minh genesis/bytecode,
block hash, receipt và exact log; sync lặp không tạo quyền trùng. Reorg giữ lịch sử
noncanonical nhưng loại quyền truy cập phát sinh từ log đó.

`npm run test:editions`, Foundry, frontend tests và
`node scripts/reward/editions-browser-e2e.cjs` kiểm hành vi local. Browser runner dùng
auth/SIWE thật với provider Anvil thử nghiệm; Creator verification là fixture,
không là xác minh ngoài đời hoặc nghiệm thu MetaMask thủ công. Kết quả cụ thể ở
`docs/PROJECT_PROGRESS.md`.

Các suite/script dùng chain 31339 chung và có tua giờ phải snapshot toàn lần chạy,
revert trong cleanup và fail nếu RPC không phải Anvil. Full backend, legacy scenario
và browser acceptance đã được kiểm tra giữ nguyên exact block hash/timestamp sau khi
chạy. Tua giờ thủ công vẫn là thao tác toàn chain và không được tự quay lùi.

## 7. R5 và quyền lợi lịch sử

Trang chính/thư viện mới dùng Editions. Các trang /reward/history và
/reward/history/my-rewards giữ lịch sử với đúng deployment. Trang campaign cũ không
nhận pledge mới. Đường nhập/đọc địa chỉ, batch, tracking và xác nhận giao hàng đã
bị gỡ khỏi mã API/UI. Contract/ABI/indexer/refund lịch sử vẫn được giữ; hash cam kết
cũ không bị đổi cấu trúc.

Audit đã xác minh 8 physical entitlement thuộc 8 deployment test riêng, trong 24
campaign và 32 entitlement do bộ HTTP test cũ để lại. Hợp đồng Reward chính có 0
campaign. Cả 8 receipt là canonical theo deployment riêng. DB ghi REFUND_ELIGIBLE
nhưng contract đã COMPLETED, không có refund snapshot và claimRefund đều revert.
Đó không phải bằng chứng đã hoàn tiền. Bộ HTTP test nay dùng DB riêng và dọn sau test.
Kết quả đối soát cùng chain/DB/storage trước reset được lưu trong backup local; runtime
test tay hiện tại là môi trường sạch và không chứa các dòng lịch sử này.

Migration 0005 chỉ nhận các dòng đã được audit và còn nguyên fingerprint. Nó giữ
nguyên dữ liệu tài chính, lưu ciphertext/địa chỉ/tracking và các lô vào schema
reward_archive, giữ bản chụp lịch sử campaign/dispute, rồi bỏ các cột vận chuyển
khỏi schema đang dùng. Archive chặn INSERT/UPDATE/DELETE/TRUNCATE thông thường.
Retention hiện tại: giữ vô thời hạn, không có cron xóa; truy cập bởi người vận hành
DB, không có endpoint giải mã/public export. Khóa mã hóa cũ được giữ trong cấu hình
local để phục hồi, không còn được ứng dụng yêu cầu hoặc sử dụng.

Đã thử trên DB fresh/upgrade, bản sao DB thực và áp dụng DB chính ngày 2026-10-13:
đủ 8 entitlement, 8 batch, 8 batch-item và 8 lịch sử campaign được lưu lại; cả 32
dòng quyền lợi tài chính và số dư contract lịch sử giữ nguyên. Người dùng đã dừng
API cũ; audit và SQL backup mới được tạo trước migration 0005. Backend mới build
và khởi động thành công. 19 kiểm tra HTTP đạt, gồm API Editions, xác thực và 12
lượt kiểm tra đường physical trả 404; frontend 5175 trả 200. Hai deployment sản
phẩm vẫn chưa có campaign. R5 hoàn tất cho MVP local.

Quy trình chuyển DB đã dùng bên dưới yêu cầu API cũ dừng trước khi áp dụng 0005
lần đầu; migration tự chặn nếu cổng 3002 đang có listener. Lệnh migration chạy lại
không áp dụng DDL lần nữa. Không reset Anvil hoặc đổi manifest.

```powershell
node backend/scripts/reward/audit-editions-retirement.cjs --approve-fixture-archive
node backend/scripts/reward/migrate-isolated.cjs
& .\backend\scripts\reward\start-services.ps1 -SkipBuild
```

Báo cáo audit không chứa giá trị PII; SQL backup cục bộ có dữ liệu riêng tư và nằm
trong .local bị Git bỏ qua. Không xóa archive hoặc thay đổi escrow khi chuyển runtime.
