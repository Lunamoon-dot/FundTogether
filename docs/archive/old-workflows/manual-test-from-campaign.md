# Test từ tạo campaign đến refund

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


Cập nhật: 2026-10-06. Kết quả đã chạy được ghi trong PROJECT_PROGRESS.md;
hướng dẫn trình duyệt dưới đây không tự chứng minh popup/ký MetaMask đã đạt.

## 1. Phạm vi hiện tại và dữ liệu

Sau reset dữ liệu test được người dùng cho phép ngày 2026-10-07, manifest ứng
dụng dùng FundTogetherMvp trên 8545. Tài khoản/tổ chức/quyền/liên kết ví được giữ.
UI có thể kiểm tra tạo/chốt/nộp/duyệt/công bố/đóng góp/hủy/claim và hướng dẫn theo
trạng thái. Contract MVP mới đã nối claimBond, bản bằng chứng công khai, tiếp
nhận, phản đối và quyết định case qua API/storage/indexer/UI. Luồng tích hợp
được kiểm chứng trên chain riêng; nút mới chỉ mở trên deployment MVP đã xác minh.
Tạo campaign mới để thử Case C; campaign prototype cũ đã bị bỏ, không migrate.
Không thêm --redeploy hoặc reset tiếp để vượt một điều kiện workflow.

Không cần xóa DB để bắt đầu. Tạo các campaign mới với tiền tố TEST và dùng
các tài khoản/ví thử riêng. Smoke tạo fixture riêng, mở API tạm và Anvil 9545,
rồi dọn fixture của mình. Chạy lần lượt, không mở Anvil khác trên 9545.
Smoke sử dụng PostgreSQL phát triển từ backend/.env; đây không phải DB tách
riêng. Không dùng các script đó với DB production.

Xóa PostgreSQL không xóa escrow trên chain. Reset chain cũng không xóa metadata
và file trong storage. Nếu muốn reset sạch cả ứng dụng, cần phạm vi rõ: accounts,
membership, wallet links, campaign/draft/evidence, projection, chain state và
storage; backup trước, dừng process liên quan và chuẩn bị deployment mới đồng bộ.
Hướng dẫn này không có lệnh TRUNCATE, xóa volume hoặc reset chain 8545.

## 2. Chạy test tự động trước

Mở PowerShell tại repo root:

```powershell
Set-Location C:\Users\dell\Desktop\FundTogether
wsl.exe -d Ubuntu-24.04 --cd "$((Get-Location).Path)\contracts" -- bash -lc '~/.foundry/bin/forge test --match-contract FundTogetherMvpTest --fuzz-runs 1024 -vv'
wsl.exe -d Ubuntu-24.04 --cd "$((Get-Location).Path)\contracts" -- bash -lc 'FOUNDRY_INVARIANT_RUNS=128 FOUNDRY_INVARIANT_DEPTH=128 FOUNDRY_INVARIANT_FAIL_ON_REVERT=true ~/.foundry/bin/forge test --fuzz-runs 1024 -vv'
```

Foundry tự tạo EVM/fixture cho từng test, không cần chạy Anvil, DB hay MetaMask.
Lệnh đầu chạy 31 case MVP, gồm resolver admission/case, bond credit, chuyển token
false/revert, callback/reentry, claim lần hai, rollback deposit và dust. Lệnh
sau chạy toàn bộ regression và invariant; fuzz/invariant có thể chạy lâu hơn.
Chỉ tiếp tục khi tổng kết không có FAIL. Lưu tên case, seed và trace nếu fail.

Frontend, từ repo root:

```powershell
Push-Location frontend
npm.cmd test
npm.cmd run build
npm.cmd run lint
Pop-Location
```

Backend, cần dependencies đã cài; smoke cần PostgreSQL đã migrate. Sau khi build
contract ở bước trên và đảm bảo 9545 rảnh:

```powershell
Push-Location backend
npm.cmd run build
npm.cmd test -- --runInBand
node --test scripts/local-timeout-worker.test.cjs
node scripts/publish-indexer-smoke.cjs
node scripts/refund-lifecycle-smoke.cjs
node scripts/milestone-lifecycle-smoke.cjs
Pop-Location
```

Chạy từng lệnh và dừng khi một lệnh fail; không chạy smoke song song. Smoke
publication kiểm tra replay/reorg/reset và rollback indexer. Smoke refund kiểm
tra HTTP/SIWE, quyền donor, transaction/index lag, refund sau giải ngân một phần,
claim lặp, zero payout và dust. Hai smoke đó dùng prototype. Smoke milestone
dùng FundTogetherMvp riêng, kiểm tra HTTP/SIWE/MinIO/receipt/index cho nhiều
milestone, ba verdict, timeout, partial refund, dust, bond, replay và reorg.
MinIO/bucket phải sẵn sàng và migration 0012 phải áp dụng; không trỏ vào DB
production. Smoke HTTP không thay thế kiểm tra popup hoặc thao tác trình duyệt.
Worker unit test kiểm tra chọn timeout theo trạng thái/deadline. Smoke milestone
còn chạy worker thật qua proxy lỗi RPC, giữ intent không có hash, restart và
identity mismatch trên chain riêng. Chưa kiểm chứng keeper chạy liên tục/đa instance.

## 3. Dịch vụ cho test bằng trình duyệt

Giữ PostgreSQL và MinIO đang chạy theo README. Từ repo root, mỗi block dưới đây
là một terminal riêng. Nếu dịch vụ đã chạy, không mở thêm instance cùng cổng;
restart BE/FE trong terminal của mình để nạp source mới.

Terminal Anvil:

```powershell
Set-Location C:\Users\dell\Desktop\FundTogether
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\start-local-chain.ps1
```

Script nạp/lưu .local/anvil/state.json, mine mỗi 5 giây và mine transaction ngay.
Nếu chain cũ chạy bằng lệnh khác không có state, không giả định script mới khôi
phục được nó; kiểm tra deployment trước khi ký.

Nếu Anvil đang chạy đúng deployment, script tái sử dụng và bật interval mining
trên node đó; giao dịch có thể chờ tối đa khoảng 5 giây. Nếu báo clock lệch hơn
một phút, kiểm tra giờ Windows/WSL và thời gian chain trên trang campaign.
Chỉ khi quyết định đồng bộ local về giờ thực, chạy từ repo root:

```powershell
node .\backend\scripts\configure-local-mining.cjs --sync-clock
```

Không sửa deadline hoặc reset dữ liệu. Các deadline đã qua sẽ có hiệu lực;
chain ở tương lai bị từ chối chỉnh lùi. Không dùng lệnh này để tua nhanh test.

Terminal BE:

```powershell
Set-Location C:\Users\dell\Desktop\FundTogether\backend
node scripts/deploy-local.cjs
npm.cmd run start:dev
```

Lệnh deploy xác minh manifest hiện tại hoặc deploy nếu chưa có manifest. Nếu báo
stale deployment/escrow còn token, dừng và đối chiếu, không thêm --redeploy để
bỏ qua. Nest watch đã đủ; không cần nodemon.

Terminal FE:

```powershell
Set-Location C:\Users\dell\Desktop\FundTogether\frontend
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

API: localhost:3000/health; UI: localhost:5173. Ví dùng RPC
http://127.0.0.1:8545, chain 31337. Dùng localhost cho origin của trang.

## 4. Chuẩn bị danh tính

| Người dùng | Tài khoản ứng dụng | Ví |
|---|---|---|
| Organizer O | OWNER của tổ chức test | Ví O, không phải resolver |
| Resolver R | RESOLVER | Đúng địa chỉ resolver trong manifest, SIWE-linked |
| Donor A | USER | Ví A, khác O/R |
| Donor B | USER | Ví B, khác O/R/A |

Có thể dùng lại account đã có nếu role và ví đúng. Khi chuyển account ứng dụng,
kiểm tra đồng thời ví trong nút kết nối của trang; account đang mở trong extension
không đảm bảo trang đã chọn cùng account/provider. Mỗi ví chỉ link một account.
Resolver không donate vào campaign mình duyệt. ADMIN không thay RESOLVER.

Sau khi R đăng ký, cấp role từ backend; thay email bằng email thật của account test:

```powershell
node scripts/staff-role.cjs resolver-test@example.com RESOLVER
```

Cấp MockUSDC từ backend; thay địa chỉ bằng địa chỉ công khai đầy đủ của O/A/B:

```powershell
node scripts/fund-local-wallet.cjs <DIA_CHI_VI_O> 100
node scripts/fund-local-wallet.cjs <DIA_CHI_VI_A> 100
node scripts/fund-local-wallet.cjs <DIA_CHI_VI_B> 100
```

Các dấu <...> là placeholder, không chạy nguyên văn. Script mint đúng token trong
manifest và cấp ETH gas nếu balance thấp. Ví R cũng cần ETH gas. Tiền này chỉ dùng
local, không phải tiền thật. Không gửi private key/seed trong ảnh hoặc chat.

## 5. Case A — tạo, công bố và hủy khi chưa đủ goal

1. O đăng nhập, link ví O ở Tài khoản bằng chữ ký SIWE.
2. Tạo tổ chức test hoặc chọn tổ chức O có quyền quản lý.
3. Tạo campaign TEST-A-CANCEL với hai milestone ngân sách 8 và 12 MockUSDC.
   Mỗi milestone có mô tả/tiêu chí đầy đủ. Tổng goal 20; bond tối đa 12.
4. Lưu rồi reload: campaign ở Nháp, nội dung/milestones còn nguyên. Có thể tạo
   một bản nháp phụ và xóa để kiểm tra nút xóa; không xóa campaign đã nộp.
5. Chọn hạn gây quỹ tương lai theo thời gian chain (ví dụ ngày hôm sau), chốt hồ
   sơ và nộp/khóa bond. Ký approve nếu thiếu allowance, rồi giao dịch submission.
   Từ chối một yêu cầu ví để kiểm tra form hết trạng thái bận và không báo thành công.
6. Chờ receipt và indexer. O giảm 12 token bond, campaign chưa xuất hiện feed.
   Hồ sơ chốt không sửa âm thầm; thiếu gas/token/ví sai phải có lý do cụ thể.
7. R đăng nhập, chọn đúng ví resolver đã link. Vào Resolver/nội bộ, mở TEST-A,
   ghi ý kiến và ký duyệt. Ý kiến đồng ý chưa phải APPROVED; chờ indexer xác nhận.
8. O mở lại campaign và ký công bố. Sau receipt/indexed, feed có TEST-A, state
   FUNDING, goal 20, đã góp 0. Chỉ được duyệt chưa công bố thì feed chưa có là đúng.
9. A link ví A và góp 6. B link ví B và góp 4. Kiểm tra tổng indexed 10, lịch sử
   mỗi ví đúng 6/4; balance giảm tương ứng. Approve token không phải donation.
10. O chọn xác nhận hủy và Ký hủy campaign khi vẫn FUNDING. Sau indexed:
    CANCELLED, pool 10; A có entitlement 6, B có entitlement 4; bond xử lý riêng.
    Trên prototype hiện tại bond được chuyển ngay trong giao dịch hủy; source
    MVP mới ghi credit 12 để O claim riêng. Không tìm nút claimBond trên UI cũ.
11. A claim, rồi B claim: mỗi ví nhận đúng 6/4, không cần approve token; cần ETH.
    Reload/đổi tab không tạo claim thứ hai. UI phải ghi đã nhận và chặn ký lại;
    kiểm tra revert claim lần hai thực sự bằng contract test, không chỉ nút disabled.
12. Tổng donor đã nhận 10, không vượt pool, donor không nhận bond 12. Người ngoài
    không góp không có entitlement. Ghi cả hash và block indexed làm bằng chứng.

Ở mọi giao dịch kiểm tra đủ: chờ ví -> hash đã gửi -> receipt success -> indexed.
Nếu có hash mà indexer chậm, dùng đối chiếu/tải lại; không ký giao dịch mới.

## 6. Case B — hết hạn khi chưa đủ goal

Tạo TEST-B-EXPIRE mới với ngân sách 8 + 12. Chọn hạn đủ thời gian nộp/duyệt/
công bố/góp, ví dụ 30–60 phút phía trước theo chain. A góp 6, B góp 4; không góp
đủ 20. Đến hạn, chờ UI/indexer đọc block timestamp mới; state chưa tự đổi chỉ vì
đồng hồ hết hạn. Bấm Chốt gây quỹ thất bại và mở hoàn tiền bằng ví linked có gas.
Sau indexed: FUNDING_FAILED, pool 10, A/B claim 6/4 như case A. Gọi chốt lần hai
phải bị từ chối. Trước hạn nút chốt phải bị chặn và nêu lý do.

Hết hạn nhưng thiếu goal không chuyển sang FUNDED. Trước giao dịch chốt, state
vẫn FUNDING nhưng đóng góp phải bị chặn khi timestamp block tới hạn. Sau giao
dịch chốt và indexer ghi nhận mới là FUNDING_FAILED và mở quyền claim. Nếu đồng
hồ máy qua hạn mà chain chưa tới, kiểm tra cảnh báo clock và interval mining;
không đổi state trong DB để ép hoàn tiền.

## 7. Case C — đủ goal, kích hoạt và hồ sơ bằng chứng

Checklist riêng cho C1–C6, số tiền kỳ vọng và lỗi ví/quyền:
[manual-mvp-test-cases.md](./manual-mvp-test-cases.md).

Tạo TEST-C-FUNDED mới với goal 20, budgets 8 + 12. A góp 8 và B góp 12:
FUNDED sau indexed, tổng 20, đóng góp tiếp bị chặn. O kích hoạt milestone 1:
chỉ đúng ví organizer, đúng thứ tự. Upload/lưu báo cáo và file, reload/tải về,
chốt hồ sơ sau khi milestone active. Upload/lưu/freeze chưa giải ngân tiền.

Dừng test thủ công nếu UI báo campaign dùng prototype. Trên deployment MVP
mới đã cấu hình đồng bộ, tiếp tục các bước dưới đây; không dùng campaign cũ:

1. O đóng băng bản gốc, viết báo cáo công khai theo từng tiêu chí, tải file đã
   che thông tin và xác nhận. Xem lại file/hash rồi ký nộp; chờ receipt và index.
2. Resolver mở `#/internal/milestones`, dùng đúng ví resolver liên kết SIWE.
   Kiểm tra bản công khai và bản gốc riêng tư, ghi nhận xét rồi ký tiếp nhận.
   Tài khoản tổ chức hoặc donor không được tự tiếp nhận.
3. A/B tải đúng bằng chứng đã nộp. Trước hạn review, chỉ donor đã góp được
   phản đối. Không phản đối: sau review, bất kỳ ví liên kết đủ gas ký giải ngân.
   Số tiền/người nhận phải đúng budget/ví tổ chức; lặp lại bị chặn.
4. Nhánh phản đối dùng campaign khác: A mở case, B bổ sung, O chốt một giải
   trình. Đủ 7 ngày, resolver chọn CONTINUE / RESUBMIT / STOP trong 7 ngày kế.
   CONTINUE giữ reviewEnd gốc; RESUBMIT cần bản mới và review đủ 72 giờ;
   STOP mở refund cho escrow chưa giải ngân, bond nhận riêng, không slash.
5. Nhánh resolver không xử lý: sau resolutionDeadline, ví khác ký timeout;
   donor tự claim, không cần resolver online. Claim lần hai phải bị chặn.
6. Sau milestone cuối, O ký claim bond. Kiểm tra token về đúng ví, receipt và
   indexed event; không coi bond credit hoặc hash đã gửi là tiền đã nhận.
7. Thử từ chối chữ ký, đổi ví giữa bước, reload sau khi đã có hash và tiếp tục
   đối chiếu. Không gửi lại khi hash chưa rõ kết quả; ghi hash/checkpoint/lỗi.

Những bước dài theo thời gian được smoke tua trên chain riêng để kiểm chứng.
Activation timeout là 7 ngày, evidence 30 ngày, admission/review 72 giờ. Không
đổi giờ Windows hoặc time-warp chain 8545 để thử nhanh; dùng fixture tự động.

## 8. Những lỗi khó không thể chứng minh chỉ bằng click

| Trường hợp | Test phù hợp | Kết quả phải có |
|---|---|---|
| Token trả false/revert khi chuyển bond | MVP blocked-token cases | Snapshot donor vẫn tạo; bond credit không mất |
| Refund bị token từ chối | MVP false/revert cases | Claim flag/counters rollback; donor khác độc lập |
| Callback/reentry | MVP callback case | Guard từ chối, accounting cập nhật trước external call |
| Dust sau giải ngân một phần | MVP fuzz + refund smoke | Floor từng quyền, paid <= pool; remaining chưa chắc là dust |
| Replay/reorg/reset | Publication/refund smoke 9545 | Không duplicate; reset khác deployment bị từ chối |
| Không ai gọi timeout | Worker unit + isolated worker recovery smoke | Hạn không tự giao dịch; caller/worker phải gửi và đủ gas |

Ví dụ base units: C=5, R=2, P=3; donor góp 1/4 có quyền floor(1*3/5)=0 và
floor(4*3/5)=2. Khi cả hai claim, paid=2, final dust=1 base unit (0.000001
MockUSDC). Claim payout 0 vẫn consumes quyền một lần. Trước khi donor cuối claim,
không được gọi toàn bộ remaining là dust.

MockUSDC hiện tại không có UI bật blocklist để gây lỗi. Token giả lập lỗi nằm
trong test contract, không nên chỉnh DB hoặc code live để giả tạo balance.

## 9. Ghi kết quả

Mỗi case ghi: account/ví/chain, campaign metadata ID + on-chain ID, contract,
state trước/sau, deadline/chain timestamp, token balances/entitlement, hash,
receipt status/block và checkpoint indexed. Chụp ảnh có lý do nút bị chặn khi fail.
Không chụp private key, seed, mật khẩu, .env hoặc presigned URL.

Nếu bước fail, dừng case đó và gửi lỗi + bước + public ID/hash. Không xóa dữ liệu
để che lỗi; giữ fixture/log cho đối chiếu. Campaign prototype không thể chạy
Case C mới; thông báo capability không phải kết quả PASS của Case C trình duyệt.
