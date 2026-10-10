# Kế hoạch chi tiết luồng B — FundTogether

> Ngày: 2026-10-09.
> Trạng thái: kế hoạch tổng thể; B-D01–B-D10 đã duyệt cho pilot 2026-10-09.
> [Kế hoạch code cụ thể](./workflow-b-code-plan.md) đã được duyệt; triển khai C→B→F→I.
> Đọc trước: [Định hướng NCKH](./research-direction.md), [đề xuất workflow trao quà](./proposed-gift-workflow.md).
> Baseline Git: `b1881bd2cb3d6a4413605b06741624e86e2323da`.
> Mục tiêu: chuyển từ giải ngân sau nghiệm thu sang cấp vốn trước theo đợt, có xét duyệt thực chất, kiểm soát cấp tiếp và đường xử lý thất bại.

## 1. Phạm vi và cách thực hiện

### Tiến độ thực hiện — 2026-10-09

| Phần | Trạng thái / bằng chứng |
|---|---|
| Mẫu bước 1 | DONE chuẩn bị: [G1](./examples/gift-campaign-institution.md), [G2](./examples/gift-campaign-direct.md), 12 package JSON/SVG synthetic có exact-byte hashes, 8 trace base unit |
| Đặc tả bước 2 | DONE + APPROVED_FOR_LOCAL_PILOT: [workflow-b-spec](./workflow-b-spec.md), [financial rules B](./workflow-b-financial-rules.md); người dùng đã duyệt B-D01–B-D10 |
| Công cụ chuẩn bị | `backend/scripts/workflow-b/`: generator và bigint trace; 14 tests PASS; không có RPC/DB/storage/wallet, không import vào product |
| Code bước 3–5 | [Kế hoạch code](./workflow-b-code-plan.md) đã duyệt; Contract C1–C6, backend B1–B6 và frontend F1–F6 có implementation/test; G1/G2, failure/timeout/refund và recovery tự động PASS trên môi trường riêng |
| Nghiệm thu bước 6 | [Acceptance report](./workflow-b-acceptance.md): backend152 tests, HTTP50 checks, frontend113 tests; G1/G2/failure/waiting receipts PASS; recovery và so sánh contract A/B có bằng chứng. MetaMask/người phản biện chưa nghiệm thu |

Các checklist bên dưới mô tả điều kiện chuyển bước; phê duyệt rule đến từ người
dùng và được ghi ở spec. JSON/SVG offline chưa là upload DTO/PDF/PNG;
fixture key mô tả biến thể của bộ lịch sử chưa dùng được làm blind reviewer
experiment. Corpus v3 với12 mã trung tính/PDF/PNG đã chuẩn bị riêng, chưa có
quyết định thật của reviewer; xem runbook và acceptance.

Người dùng đã chọn hướng B, mua và trao quà là loại hình campaign đầu tiên,
workflow xác minh là trọng tâm. Quyền, hạn và dòng tiền bước 2 đã chốt trong spec B;
chi tiết implementation theo kế hoạch code. Verifier riêng, committee, appeals, slash, reputation,
AI, fiat bridge và mở rộng mạng nằm ngoài đợt này.

Mỗi bước có đầu ra và điều kiện chuyển bước. Bước 1–2 xây dựng nghiệp vụ;
bước 3–5 triển khai theo đặc tả được duyệt; bước 6 nghiệm thu và thực nghiệm.
Test kỹ thuật được xây dựng cùng phần triển khai; bước 6 tập hợp kết quả và
kiểm tra toàn hành trình. Không để lỗi kế toán tới cuối mới phát hiện.

### Cách chia đợt công việc

| Đợt | Công việc | Điều kiện bắt đầu đợt sau |
|---|---|---|
| I | Hai campaign mẫu và bộ quy tắc B | Người dùng duyệt đặc tả quyền, tiền, deadline và outcome |
| II | Contract B, invariant, ABI/event/manifest | Các nhánh tiền và đường thoát có test; ABI/event được chốt |
| III | BE/storage/indexer và FE cho một đợt qua đơn vị | Hành trình một đợt chạy đủ, dữ liệu chain/DB/files đối chiếu được |
| IV | Hoàn thiện nhiều đợt, bổ sung, phản đối, dừng và refund | Cấp tiếp và mọi nhánh bất thường hoạt động xuyên các tầng |
| V | Nghiệm thu ví thật trên local và thực nghiệm | Có báo cáo kết quả, giới hạn và quyết định tiếp theo |

Contract ở đợt II phải kiểm tra đầy đủ nhiều đợt và failure trước. Đợt III/IV
chia nhỏ tích hợp người dùng, không trì hoãn bảo vệ tiền của các nhánh chưa có UI.
Mỗi lát triển khai đi theo test tái hiện → code tối thiểu → kiểm tra → ghi kết quả.

### Những phần hiện có phải đối chiếu

- `contracts/src/modules/FundTogetherMilestones.sol`: activation hiện chưa trả tiền;
  `_settleMilestone` hiện tăng `totalReleased` và chuyển ngân sách cho organizer.
  B phải tách cấp vốn khỏi nghiệm thu, tránh giữ đường trả tiền cũ gây cấp hai lần.
- `contracts/src/FundTogetherMvp.sol`: resolver, bằng chứng theo version, case hữu hạn,
  pull bond và refund accounting là nguồn tham khảo; không mặc định toàn bộ rule phù hợp B.
- BE đã có account/SIWE, tổ chức, campaign draft, evidence freeze/storage và indexer.
- FE đã có tạo/nộp/duyệt/public, donate/refund, milestone/review và trạng thái giao dịch.
- Bản gốc bằng chứng ở object storage; hash/commitment ở chain; DB lưu hồ sơ và projection.
  Ghi DB hoặc upload file không tự tạo quyền cấp vốn.

Giữ baseline A để đối chiếu. B cần contract/deployment mới; không sửa nghĩa vụ
campaign cũ bằng FE hoặc migration. Trong phát triển dùng chain và DB fixture
riêng; không reset môi trường hiện có để thử B khi chưa được yêu cầu.

## 2. Bước 1 — Hai campaign mẫu

### 2.1. Mẫu G1: một đợt qua đơn vị

Toàn bộ tên và số liệu là giả định cho thử nghiệm. MockUSDC không phải giá trị
VND hay dữ liệu chi phí thực tế; chưa có cơ chế quy đổi hoặc thanh toán fiat.

| Thuộc tính | Mẫu G1 |
|---|---|
| Loại hoạt động | Mua và trao quà |
| Đơn vị nhận | Trường Mẫu A; đầu mối có thẩm quyền được đối chiếu |
| Phạm vi hoàn thành | Bàn giao cho trường; không tuyên bố đã tới từng học sinh |
| Kết quả | 100 suất, thành phần tối thiểu được ghi trước trong kế hoạch |
| Ngân sách hàng | 100 × 20 = 2.000 MockUSDC |
| Vận chuyển | 200 MockUSDC |
| Goal/ngân sách đợt | 2.200 MockUSDC; một đợt |
| Task | Mua, kiểm hàng, vận chuyển, bàn giao; dùng chung một lần cấp vốn |

- [ ] Viết kế hoạch, người đại diện/đầu mối, ngân sách chi tiết và điểm hoàn thành.
- [ ] Định nghĩa tiêu chí G1-C1: đủ 100 suất và đúng thành phần; C2: đối chiếu mua
  và chi phí; C3: bàn giao đúng đơn vị, người ký có thẩm quyền; C4: xử lý số dư.
- [ ] Soạn hồ sơ giả: chứng từ mua, bảng kiểm hàng, biên bản bàn giao, ảnh đối chiếu,
  báo cáo ngân sách; có bản gốc riêng tư và bản công khai đã che dữ liệu.
- [ ] Soạn biến thể thiếu chứng từ, đủ chứng từ nhưng sai người ký, chỉ 90 suất,
  ảnh dùng lại, báo cáo chi vượt ngân sách và còn dư 50 MockUSDC.
- [ ] Trace thành công: góp 2.200 → cấp 2.200 → thực hiện → nghiệm thu → đóng.
  Ngay sau cấp, donor escrow bằng 0; xét duyệt sau đó không tự lấy lại tiền.
- [ ] Trace dừng: bằng chứng không đạt sau cấp toàn bộ; pool bảo đảm bằng 0 nếu
  organizer chưa trả lại. Nếu thực sự trả 50 trước snapshot, pool minh họa là 50.

### 2.2. Mẫu G2: ba đợt trao trực tiếp

| Thuộc tính | Mẫu G2 |
|---|---|
| Nhóm nhận | Ba nhóm tại ba lịch trao riêng; danh tính dùng dữ liệu giả |
| Phạm vi hoàn thành | Quà tới người nhận đủ điều kiện; có kiểm tra giao nhận |
| Kết quả mỗi đợt | 50 suất × 20 = 1.000 MockUSDC; vận chuyển 100 |
| Ngân sách mỗi đợt | 1.100 MockUSDC |
| Goal | 3.300 MockUSDC; ba lần thực hiện/nghiệm thu độc lập |
| Quyền cấp tiếp | Đợt trước đã đạt, hết cửa sổ phản đối và case đã xử lý |

- [ ] Viết tiêu chí xác định người nhận, lịch từng đợt, thành phần suất và phương
  pháp kiểm tra giao nhận. Không bắt mỗi người nhận tạo ví.
- [ ] Soạn checklist chung và bằng chứng riêng từng đợt; hồ sơ đợt 1 không thay
  được bằng chứng đợt 2. Ghi rõ ai kiểm tra, phạm vi và giới hạn kiểm tra mẫu.
- [ ] Trace thành công: custody 3.300 → cấp 1.100 còn 2.200 → nghiệm thu đợt 1
  → cấp đợt 2 còn 1.100 → nghiệm thu → cấp đợt 3 còn 0 → nghiệm thu cuối → đóng.
- [ ] Trace dừng sau cấp đợt 2: 2.200 đã cấp, 1.100 còn escrow; pool có thể chốt
  1.100 nếu không có khoản trả lại. Không hoàn cả 3.300 từ 1.100 còn giữ.
- [ ] Trace thiếu bằng chứng/bổ sung: không cấp lại ngân sách đợt đang xét;
  bản mới liên kết bản cũ, hạn và số lần bổ sung được áp theo policy.

### 2.3. Đầu ra và điều kiện hoàn thành

Tạo `docs/examples/gift-campaign-institution.md` và
`docs/examples/gift-campaign-direct.md`: kế hoạch, checklist, danh mục tài liệu,
nhãn đạt/thiếu/sai và trace kế toán. Khi thực nghiệm cần files giả thật và hash
tính từ bytes; phần mô tả hồ sơ chưa được coi là dataset đã hoàn thành.

Điều kiện chuyển: mỗi tiêu chí chỉ ra nguồn kiểm tra, người kiểm tra và điểm
hoàn thành; mỗi trace chỉ ra vốn ở đâu, ai được chuyển và số dư sau từng bước.

## 3. Bước 2 — Chốt nghiệp vụ trước code

### 3.1. Ma trận quyết định

Ma trận dưới đây là đề xuất đầu tiên của kế hoạch; gói rule cụ thể B-D01–B-D10
trong spec đã được người dùng phê duyệt. Nếu có khác biệt, spec/financial rules
đã duyệt là nguồn để triển khai, không suy thêm rule từ mô tả tổng quát này.

| ID | Cần chốt | Đề xuất để xem xét | Đầu ra bắt buộc |
|---|---|---|---|
| B-D01 | Tổ chức và quyền | Staff xác thực tổ chức; resolver duyệt kế hoạch và nghiệm thu; organizer ký nhận vốn; donor phản đối/claim | Ma trận account role, SIWE wallet, authority chain; cách xử lý xung đột |
| B-D02 | Bond và funding | B không bond; goal bằng tổng budget, không vượt goal, đủ goal mới cấp | Quy tắc mới và cách giữ nguyên nghĩa vụ deployment A |
| B-D03 | Cấp đầu | Kế hoạch/criteria/budget/wallet đã chốt và được resolver duyệt; organizer claim đúng budget đợt đầu | Ai xác nhận còn đủ điều kiện; điều gì có thể thu hồi quyền trước claim; hạn nhận vốn |
| B-D04 | Cấp tiếp | Đạt đợt trước + hết cửa sổ phản đối + không còn case + đủ custody; organizer claim một lần | Thứ tự chuyển trạng thái và chính xác thời điểm mở quyền |
| B-D05 | Xác minh | Hồ sơ đủ chỉ là tiếp nhận; kết luận đạt cần đánh giá từng tiêu chí và lý do | Checklist qua đơn vị/trực tiếp; kết luận đạt/thiếu/không đạt/không thể kết luận |
| B-D06 | Bổ sung và deadline | Version mới, không sửa bytes cũ; giới hạn số lần và hạn tuyệt đối; không kéo dài vô hạn | Số lần, thời lượng, mốc bắt đầu, cách tính khi bổ sung và phản đối |
| B-D07 | Phản đối và reviewer vắng | Donor đã góp mở case theo version; resolver xử lý; timeout dừng phần còn lại, không tự coi là đạt | Quyền nộp material, phản hồi, outcome tiếp tục/bổ sung/dừng; mọi đường hết hạn |
| B-D08 | Tiền dư và khoản trả lại | Không chuyển dư sang đợt khác; khoản thực sự nhận lại có event và kế toán riêng | Ai nộp, số tiền tối đa, trước/sau snapshot và hoàn tiền khi thành công |
| B-D09 | Dừng và refund | Chỉ phần escrow thực có; entitlement theo góp, floor base unit; claim không phụ thuộc vòng lặp donor | Công thức, denominator, finality snapshot, chống claim lại, dust/unclaimed |
| B-D10 | Hoàn tất và công khai | Đợt cuối vẫn nghiệm thu; ghi nhận giải quyết số dư trước đóng | Điều kiện COMPLETED và refund substate; quyền xem hồ sơ từng trạng thái |

**B-D08 phải giải quyết tiền về sau snapshot trước khi triển khai.** Hai phương
án cần so sánh: kết thúc cửa sổ trả lại trước snapshot (MVP đơn giản nhưng xử lý
khoản về muộn hạn chế), hoặc pool bổ sung độc lập, không thay entitlement đã chốt
(phức tạp hơn). Chốt một phương án cùng điều kiện cuối; không viết handler đổi
pool âm thầm, và không từ chối nghĩa vụ tài chính chỉ vì UI đã đóng campaign.

Không sao chép thời hạn 72 giờ/7+7 ngày từ A vào B mà coi là đã phù hợp. Đặc tả
phải có giá trị production/pilot được chốt; fixture dùng thời gian ngắn hoặc
time-warp riêng. Mọi hạn tài chính dùng timestamp chain, test đúng sát biên.

Đề xuất mở cửa sổ phản đối khi kết luận đạt theo version được ghi on-chain và
bằng chứng công khai tương ứng có thể truy cập; cần chốt cách xử lý storage hỏng
trong cửa sổ này. Chỉ hash hợp lệ và donor im lặng chưa đủ thay nghiệm thu.
Đề xuất giữ claim không hết hạn, dust ở escrow, không có admin sweep; phần chưa
claim là nghĩa vụ hoàn trả, không phải dust. Các lựa chọn này cũng thuộc B-D09.

### 3.2. Tách trạng thái trước khi thiết kế enum

```text
Campaign: kế hoạch → được duyệt → public/funding → đủ vốn → thực hiện
          → hoàn tất hoặc dừng → xử lý nghĩa vụ tiền còn lại

Đợt: chưa được cấp → được phép nhận → đã cấp/đang làm → đã nộp hồ sơ
     → xét duyệt → kết luận đạt → hết phản đối → chốt đợt
                  ├─ thiếu: bản bổ sung có giới hạn
                  └─ case: tiếp tục / bổ sung / dừng / timeout

Refund: chưa mở → pool đã chốt → ví còn quyền / đã claim
```

Đây là mô hình nghiệp vụ, chưa ấn định tên enum/API. Quyền nhận đợt tiếp và
chốt nghiệm thu tách khỏi giao dịch chuyển tiền. Đợt cuối đạt không tự chuyển
lại ngân sách đã cấp. Campaign hoàn tất vẫn có thể còn nghĩa vụ refund tiền dư.

### 3.3. Đặc tả sáu câu hỏi cho mỗi thao tác chuyển tiền

| Thao tác | Tiền/nguồn | Người được gọi | Điều kiện | Nếu lỗi | Chống kẹt/lặp |
|---|---|---|---|---|---|
| Donate | Ví donor → escrow | Donor | Funding mở, còn hạn và goal | Revert, không ghi contribution thành công | Deadline; không nhận quá goal |
| Claim ngân sách | Escrow → ví organizer đã chốt | Organizer | Đúng đợt, quyền còn hiệu lực, đủ custody | Revert giữ quyền/counters | Một lần/đợt; hạn claim dẫn tới dừng |
| Trả lại | Ví người trả → escrow | Theo B-D08 | Đúng campaign/phạm vi trả, policy đã chốt | Revert, không ghi số tiền đã nhận | Event và accounting; không mở lại advance |
| Claim refund | Escrow → đúng ví donor | Donor | Pool/quyền hợp lệ, chưa claim | Revert giữ quyền | Pull claim; không hết quyền khi transfer fail; không loop |

Tiền trong escrow chịu quy tắc contract; resolver không có quyền tùy ý rút hoặc
chuyển cho ví khác. Sau khi chuyển ra ví organizer, contract không kiểm soát
được cách chi ngoài đời và không tự thu hồi được. Đây là rủi ro chấp nhận cần
ghi trong thông tin donor, không thể loại bỏ chỉ bằng hash hoặc chữ ký.

### 3.4. Sản phẩm đặc tả và điều kiện chuyển bước

- [ ] Viết `docs/workflow-b-spec.md`: actor, action, điều kiện, outcome, deadline,
  sự kiện và ràng buộc commitment; có bảng quyết định B-D01–B-D10.
- [ ] Viết `docs/workflow-b-financial-rules.md`: số dư, cấp vốn, trả lại, refund,
  rounding và các giả định token. Bản A tiếp tục ghi rõ deployment áp dụng.
- [ ] Đối chiếu checklist G1/G2; chạy trace trên giấy cho mọi outcome và tìm state
  không có hành động/timeout thoát.
- [ ] Được người dùng duyệt phần quyền/tiền và đặc tả ghi thành file. Sau đó mới
  viết kế hoạch code từng task với signature, migration, event và test chính xác.

Điều kiện chuyển: không còn quyết định tiền/quyền/deadline bỏ ngỏ; không có state
chờ vô hạn không được giải thích; G1/G2 và trace failure tuân theo cùng đặc tả.

## 4. Bước 3 — Contract B

### 4.1. Phạm vi source dự kiến

Tạo entry point mới `contracts/src/FundTogetherAdvance.sol`, bộ test riêng và
deployment artifact B. Đây là tên làm việc. Sau đặc tả cần quyết định phần nào
tái sử dụng được an toàn; không kế thừa đường settlement trả tiền của A rồi chỉ
override một nút. Không chia custody ra nhiều contract khi chưa cần.

Đối chiếu `FundTogetherBase.sol`, `FundTogetherFunding.sol`,
`FundTogetherEvidence.sol`, `FundTogetherMilestones.sol`, `FundTogetherMvp.sol`
và test hiện có. Nếu sửa shared module, phải chứng minh behavior A vẫn nguyên.

### 4.2. Các task theo phụ thuộc

- [ ] **C1 — Funding/kế hoạch:** token, goal, budgets, organizer/resolver, criteria
  và policy version; duyệt/public/donate; funding thất bại/hủy trước cấp.
- [ ] **C2 — Cấp vốn:** claim đầu và cấp tiếp đúng người/đợt/budget; khóa thứ tự;
  counters cập nhật trước transfer, SafeERC20 và reentrancy guard; revert giữ quyền.
- [ ] **C3 — Hồ sơ/nghiệm thu:** version và hash bound đúng deployment/campaign/đợt;
  tiếp nhận không tự đạt; kết luận đạt, bổ sung và deadline; không trả tiền khi chốt đợt.
- [ ] **C4 — Case/timeout:** challenge đúng version, material/phản hồi/lý do;
  dừng/bổ sung/tiếp tục và giới hạn; mọi trạng thái chờ có đường hết hạn gọi được.
- [ ] **C5 — Tiền dư/refund:** trả lại theo B-D08; snapshot/pool đúng custody;
  claim/dust đúng B-D09; hoàn tất kết quả tách khỏi nghĩa vụ tiền dư.
- [ ] **C6 — Hardening/ABI:** invariant xuyên nhiều campaign, adversarial token,
  event agreement và manifest mới có deployment ID/code hash/policy/ABI version.

Timeout yêu cầu giao dịch. Keeper/worker là bên gọi có thể thử lại, không phải
nguồn quyết định deadline. Nếu worker vắng, người dùng vẫn có thể gọi thao tác
hết hạn được contract cho phép. Không hứa trạng thái chain tự đổi khi không có tx.

### 4.3. Invariant tài chính phải viết trước implementation

Cho mỗi campaign, dùng base unit và phân biệt counters tích lũy với số dư:

```text
C = đóng góp thực nhận
A = tổng vốn đã cấp ra
R = khoản trả lại thực nhận được phân bổ cho campaign
F = tổng refund đã trả
E = custody còn giữ cho campaign

C + R = A + F + E
A <= tổng budget được duyệt
Mỗi đợt được cấp không quá một lần
Refund paid của mỗi pool <= pool đã chốt
Claim mỗi ví không vượt entitlement và không được claim hai lần cho cùng quyền
```

Tiền ERC20 gửi thẳng ngoài API có thể làm balance lớn hơn tổng nghĩa vụ; không
tự gán phần này cho campaign hoặc cho admin rút. Nếu token tính fee/rebase,
counters trên không thể tin amount yêu cầu: MVP phải chốt chỉ hỗ trợ token chuẩn
không fee/rebase, hoặc đặc tả kế toán khác trước implementation.

Với một pool cố định theo góp: `entitlement = floor(contribution × pool / C)`;
xử lý C=0 riêng, và dùng phép toán tránh overflow. Đây chưa giải quyết pool trả
lại muộn; chỉ áp dụng sau khi B-D08 chốt cách phân chia quyền các pool.

### 4.4. Test và điều kiện hoàn thành

Foundry unit/fuzz/invariant: caller sai; đợt sai; claim lặp; hash/version cũ;
deadline trước/bằng/sau; challenge sát hạn; resolver vắng; transfer false/revert;
callback reentrancy; nhiều campaign chung token; refund theo mọi thứ tự; pool=0;
base unit nhỏ; token gửi trực tiếp; hai giao dịch cạnh tranh chốt/claim.

Lệnh dự kiến trên WSL: `forge test` tại `contracts/`. Chạy test B riêng khi làm
mỗi task và regression A khi sửa boundary chung. Không deploy/push ABI B vào
môi trường hiện tại trước khi test và event agreement đạt.

Điều kiện chuyển: C1–C6 PASS với báo cáo môi trường; mọi tx có event đủ cho replay;
không còn đường nghiệm thu cấp tiền lại; build/ABI/manifest có thể tái tạo từ source.

## 5. Bước 4 — Backend, storage và indexer

### 5.1. Các task

Bổ sung thiết kế ngày2026-10-10: [onboarding tổ chức](./workflow-b-organization-onboarding-plan.md)
đưa organizer nộp hồ sơ và ADMIN yêu cầu bổ sung/duyệt thành task OB1–OB3,
OF1–OF2, OI1 riêng. Sau yêu cầu tiếp tục goal, OB1–OB3/OF1–OF2 đã có code và
kiểm thử; OI1 còn nghiệm thu người dùng. Xem acceptance/code plan cho bằng
chứng, không suy lifecycle mới từ các checkbox gốc.

- [ ] **B1 — Context B:** mở rộng typed blockchain boundary và metadata để không
  nhầm enum/policy A/B; dùng artifact generate, không copy ABI tay. Giữ chain ID,
  deployment ID, contract, token, campaign/đợt/version trong mọi tài nguyên liên quan.
- [ ] **B2 — Kế hoạch/checklist:** dữ liệu loại gift, kênh tiếp nhận và đợt/task;
  thêm migration tối thiểu sau khi schema được chốt. Lưu tiêu chí version gắn
  hồ sơ; không sửa âm thầm kế hoạch đã commit.
- [ ] **B3 — Xác thực/quyết định:** staff kiểm tra tổ chức; resolver đọc checklist,
  kết luận/lý do/xung đột. Off-chain ghi ý kiến; chain event xác nhận quyền tài chính.
  Account role không tự tạo authority và địa chỉ client không chứng minh quyền ví.
- [ ] **B4 — Hồ sơ/files:** original riêng tư; redacted public tách object; kiểm MIME,
  size/hash khi freeze; mỗi tiêu chí liên kết tài liệu. Không thêm presigned URL vào
  manifest hash, log hoặc record công khai. Lỗi storage không giả báo hồ sơ đã chốt.
- [ ] **B5 — Projection/replay:** xử lý event cấp vốn, quyết định, case, return/refund;
  checkpoint và projection trong transaction; duplicate/reorg/reset không nhân tiền.
- [ ] **B6 — API hành trình:** trả trạng thái, việc tiếp theo, actor/ví, deadline chain,
  budget đã cấp/còn escrow/refund cùng thời điểm/block dữ liệu được đối chiếu.

### 5.2. File cần đối chiếu khi viết kế hoạch code

| Boundary | File hiện có |
|---|---|
| Chain/artifact | `backend/src/blockchain/blockchain.service.ts`, `backend/scripts/deploy-local.cjs`, `backend/src/blockchain/generated/` |
| Tổ chức/campaign | `backend/src/modules/organizations/organizations.service.ts`, `backend/src/modules/campaigns/campaign-submission.service.ts`, `campaign-review.service.ts` |
| Evidence/review | `backend/src/modules/evidence/evidence-drafts.service.ts`, `evidence-packages.service.ts`, `evidence-access.service.ts`, `milestone-workflow.service.ts` |
| Schema/projection | `backend/src/database/schema/`, `backend/src/modules/campaigns/campaign-projection.service.ts` |
| Replay | `backend/src/indexer/indexer.service.ts`, `backend/src/database/schema/indexer.schema.ts` |

Đường dẫn viết tắt trong một ô thuộc cùng thư mục module đó. Tên bảng/endpoint
mới chỉ ấn định sau event/spec chốt; không tạo lớp workflow engine cho các loại chưa có.

### 5.3. Data flow và điều kiện hoàn thành

```text
Account/SIWE → API phân quyền → DB hồ sơ → storage bản gốc/redacted
                                      ↓ freeze/version/hash
Frontend wallet → RPC → contract B → event → indexer → DB projection → API → FE
```

API có thể chuẩn bị tx; không tự đánh dấu đã cấp/đạt/refund từ request HTTP.
Event cần block/hash/log context; identity deployment thay đổi phải fail closed,
tách projection cũ và replay đúng deployment. Không gắn metadata campaign cũ
vào campaign mới chỉ vì contract address và numeric ID trùng nhau sau reset.

Test quyền original, sai owner/version, signed URL hết hạn, manifest bytes,
storage unavailable, API retry, duplicate log, process chết giữa batch, reorg,
chain reset cùng ID và indexer lag. So sánh projection sau replay với đọc chain.

Lệnh dự kiến: `npm.cmd test -- --runInBand`, `npm.cmd run build` tại `backend/`;
smoke B tạo fixture trên chain/DB riêng. Điều kiện chuyển: migration chạy được
trên DB fixture giữ identity; G1/G2 có dữ liệu xuyên các tầng và replay không duplicate.

## 6. Bước 5 — Frontend theo hành trình

### 6.1. Các màn và task

| Task | Hành trình cần có | Điều kiện/UX |
|---|---|---|
| F1 | Tạo campaign gift | Loại hoạt động, qua đơn vị/trực tiếp, đợt và task; tiêu chí/ngân sách gắn version |
| F2 | Tổ chức nhận vốn | Budget đúng đợt, custody, ví phải ký và điều kiện còn thiếu; không có nút claim lặp |
| F3 | Tổ chức báo cáo | Kết quả từng tiêu chí, file/nguồn xác nhận, chi và dư; phân biệt lưu/upload/freeze/nộp chain |
| F4 | Resolver xét hồ sơ | Queue cho hồ sơ chờ; xem từng tiêu chí, private/redacted; lý do, bổ sung/đạt/case rõ |
| F5 | Donor theo dõi/phản đối | Đã cấp bao nhiêu/còn giữ bao nhiêu, hạn phản đối, hồ sơ công khai và phạm vi kết luận |
| F6 | Dừng/đóng/refund | Tiền đã chuyển không tự hoàn; pool/quyền theo ví; tiền dư và nghĩa vụ còn lại hiện rõ |

Ưu tiên từ màn G1 hoàn chỉnh tới G2 và failure. Dùng campaign dashboard hợp
nhất hiện có; phân biệt draft/chốt/public, không tạo thêm một dashboard tổ chức.

Đối chiếu `CampaignWizard.tsx`, `MilestoneWorkflow.tsx`, `CampaignJourney.tsx`,
`campaign-journey.ts`, `CampaignWalletAction.tsx`, `TransactionSteps.tsx`,
`OrganizationEvidence.tsx`, `MilestoneReview.tsx`, `DonatePanel.tsx`,
`RefundPanel.tsx` và typed API/web3 helpers hiện có.

### 6.2. Nội dung bắt buộc ở trang campaign

- Ai đang phải làm gì; hạn theo chain và mốc đối chiếu; ví/chain cần dùng.
- Goal, đã góp, đã cấp, còn escrow, đã trả lại, số tiền ví có thể nhận/refund.
- Một nút hành động chính phù hợp trạng thái; nút tắt có lý do cạnh nút và đường xử lý.
- Phân biệt kế hoạch được duyệt, hồ sơ tiếp nhận, kết quả đạt và case đang xử lý.
- Local clock/RPC/indexer lag có lỗi cụ thể; không dùng giờ máy tự mở quyền tài chính.

```text
Chờ ví → đã gửi/hash → receipt thành công hoặc revert
       → đủ confirmation theo mạng → đã index
```

Reload/đổi account/đổi wallet phải đối chiếu lại tx và quyền. Tx replaced/cancelled,
popup không phản hồi hoặc request timeout không tự thành thất bại chain; có đường
xem lại trước khi gửi tiếp, tránh double action. Original không lộ từ link public.

Test action gating + build qua `npm.cmd test` và `npm.cmd run build` tại
`frontend/`; manual local với MetaMask là lớp kiểm tra riêng. Điều kiện chuyển:
G1/G2 không cần DB/terminal để hiểu bước tiếp theo; các hành động lỗi có cách phục hồi.

## 7. Bước 6 — Nghiệm thu và thực nghiệm

### 7.1. Ma trận case tối thiểu

| ID | Kịch bản | Kết quả cần đối chiếu |
|---|---|---|
| T01 | G1 thành công | Một advance; nghiệm thu cuối không chuyển lần hai; đóng đúng phạm vi bàn giao |
| T02 | G2 ba đợt thành công | Chỉ cấp tiếp sau đạt/hết phản đối; lần cuối vẫn phải nghiệm thu |
| T03 | Funding thiếu/quá hạn | Donate bị chặn đúng chain boundary; tx finalize mở refund đúng góp |
| T04 | Claim trước phép/sai ví/sai đợt/lặp | Revert; balances/counters/quyền không đổi |
| T05 | Thiếu hồ sơ/số lượng hoặc sai người ký | Yêu cầu bổ sung/không đạt theo policy; không cấp tiếp |
| T06 | Hồ sơ/version/ảnh dùng lại | Technical binding sai bị chặn; nội dung dùng lại được reviewer đối chiếu |
| T07 | Reviewer xác nhận sai bộ hồ sơ giả | Ghi false acceptance; chain có thể thực thi chữ ký hợp lệ dù kết luận sai |
| T08 | Donor phản đối sát hạn/case | Case khóa cấp tiếp; kết quả và deadline nhất quán ở contract/FE/DB |
| T09 | Organizer không làm/không nộp | Timeout dừng; pool chỉ có phần escrow còn lại |
| T10 | Resolver vắng/bổ sung quá giới hạn | Có đường timeout; không tự đạt; không kéo vòng vô hạn |
| T11 | STOP sau cấp đợt 2 của G2 | Pool 1.100 nếu chưa trả lại; không claim phần 2.200 đã cấp |
| T12 | G1 thất bại sau cấp toàn bộ | Pool=0 khi chưa có return; UI không hứa hoàn toàn bộ |
| T13 | Dư/return trước và sau snapshot | Áp đúng B-D08; không đổi quyền đã chốt hoặc bỏ nghĩa vụ tiền về muộn |
| T14 | Refund nhiều donor, base unit nhỏ | Claim không vượt entitlement/pool; lần hai fail; dust và unclaimed phân biệt |
| T15 | Token false/revert/callback | Không mất quyền; counters rollback; không tái nhập lấy thêm tiền |
| T16 | Reload, đổi ví, popup timeout/replaced tx | Không hiển thị sai người/quyền, không gửi lặp do chưa thấy hash |
| T17 | Replay/reorg/chain reset | Không duplicate advance/contribution/return/refund; identity sai dừng an toàn |
| T18 | Storage/RPC/indexer down rồi phục hồi | Báo đúng tầng lỗi; lịch sử/manifest/quyền vẫn nhất quán sau phục hồi |

### 7.2. Cách tổ chức dữ liệu và đo

- [ ] Hồ sơ giả có nhãn trước: đạt, thiếu, mâu thuẫn, sai nguồn, không thể kết luận;
  ghi nguồn nhãn và rubric. Không dùng kết luận của chính hệ thống làm đáp án.
- [ ] Với đánh giá reviewer, che nhãn khỏi người thử; dùng rubric và người đánh giá
  tham chiếu độc lập khi có thể. Nếu chỉ một người hoặc quá ít hồ sơ, ghi giới hạn.
- [ ] Ghi trace tx/receipt/block/event/checkpoint, balance theo base unit và quyết
  định/version; dữ liệu công khai không có private key, PII hay signed URL.
- [ ] Tách correctness kỹ thuật khỏi false accept/reject trong nghiệp vụ. Hồ sơ
  chưa thể kết luận không tự tính là đúng hoặc sai; mẫu/mẫu số phải được báo cáo.
- [ ] Đo thời gian chờ người và thời gian chain/indexer riêng; gas/giao dịch mỗi
  hành trình; vốn organizer phải ứng và vốn đã rời escrow nhưng chưa nghiệm thu.
- [ ] So sánh A/B chỉ trên kịch bản và giả định chung; ghi A có bond và trả sau,
  B cấp trước/no-bond nếu duyệt. Không gọi B tối ưu từ một vài case local PASS.
- [ ] Làm lượt manual G1, G2 và STOP/refund với ví organizer/resolver/hai donor;
  thử popup, đổi ví, reload và từ chối ký. Test tự động không thay bằng chứng này.

Đầu ra: `docs/workflow-b-acceptance.md`, dữ liệu fixture/scripts tái lập và
báo cáo thực nghiệm có kết quả PASS/FAIL, số mẫu, môi trường và giới hạn.

Điều kiện hoàn thành: invariant tiền đạt; T01–T18 có kết quả và bằng chứng;
không còn lỗi mức chặn ở custody/quyền/state/replay; manual journeys đạt.
Kết quả reviewer sai phải được ghi nhận và đánh giá rủi ro, không được sửa nhãn
để làm đẹp tỷ lệ. Local acceptance không phải production hoặc real-fund approval.

## 8. Việc tiếp theo cụ thể

1. Hoàn thành G1/G2 và biến thể hồ sơ ở bước 1; đối chiếu nhu cầu vốn/điểm hoàn thành.
2. Dùng hai mẫu để chốt B-D01–B-D10, nhất là cấp đầu, reviewer, tiền dư/return muộn.
3. Viết và duyệt spec B; sau đó lập task code C1–C6 với ABI/event và test chính xác.
4. Thực hiện contract, tích hợp BE/FE theo từng lát và nghiệm thu xuyên các tầng.

Lượt lập kế hoạch này chỉ đọc source/docs và tạo tài liệu. Chưa sửa product code,
DB, deployment, số dư, quyền ký; chưa chạy test suites hoặc push kế hoạch lên GitHub.
