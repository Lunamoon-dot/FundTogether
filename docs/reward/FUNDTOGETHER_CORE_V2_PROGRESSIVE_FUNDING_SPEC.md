# FundTogether — Core V2: Progressive Funding & Evidence-Gated Advances

> **Tài liệu:** Decision Register + Business/Technical Design + Test/Acceptance Contract
> 
> **Ngày soạn:** 2026-10-14  
> **Trạng thái:** `DESIGN_PROPOSAL / FINANCIAL_DECISIONS_PENDING` — **KHÔNG phải phê duyệt triển khai tiền**.  
> **Quyết định đã chốt:** Chủ dự án chọn chuyển Core từ không ứng vốn sang **ứng vốn có kiểm soát theo tiến độ, trước NFT V2**.  
> **Căn cứ code:** GitHub `Lunamoon-dot/FundTogether`, nhánh `main`, commit `c14373bf9ae0a47c09a3ea6f2f45dd5d4b889c7b` (đã kiểm tra 2026-10-14). Kiểm tra lại HEAD, nhánh làm việc, thay đổi chưa commit và runtime trước khi triển khai.  
> **Không được suy diễn:** Các con số trần và deadline đề xuất bên dưới **chưa được người dùng phê duyệt**; agent không được lấy chúng làm mặc định thực thi khi chưa chốt bảng F-D.

---

## A. Mục tiêu, ranh giới và lựa chọn chiến lược

### A1. Mục tiêu của Core V2

FundTogether là reward-based crowdfunding. Backer đóng góp USDC vào escrow của campaign. Sau khi campaign đạt mục tiêu và được xác nhận, Creator có thể nộp `FundingRequest` cho các chi phí cần thực hiện **trước khi sản phẩm hoàn thành**. Resolver xem xét yêu cầu, giới hạn rủi ro, công khai lý do và cho phép smart contract giải ngân từng khoản vào **ví Creator đã khóa**. Creator nộp chứng từ và bằng chứng sản xuất; Resolver xét **financial settlement** tách biệt với **product/outcome verification**. Backer có thể xem tình trạng vốn, challenge đúng giai đoạn; campaign được tiếp tục, hoàn tất hoặc wind-down/refund.

**Tuyệt đối không định nghĩa "được chấp nhận hóa đơn" = "sản phẩm đã hoàn tất".** Hệ thống chưa thể tự chứng minh chi tiêu fiat, bản quyền, chất lượng tác phẩm hoặc việc giao sản phẩm ngoài đời.

### A2. Phạm vi dự kiến

- **Giữ Core MVP hẹp để kiểm chứng:** `COMICS_ARTBOOK`, 1 tier `STANDARD`, 1 digital PDF. Thiết kế FundingRequest/evidence có thể dùng lại cho những category khác *về sau*, nhưng **không** mở Indie Games, Software, Board Games hoặc nhiều tier chỉ để xây Core V2.
- One wallet-linked Creator per campaign, one primary + one backup Resolver theo role/chain policy được duyệt; one fixed payment token, **MockUSDC 6 decimals** trên Anvil local cho pilot.
- Funding thành công mới có quyền request advance; **không** pha trộn gọi vốn tiếp trong lúc giải ngân. Overfunding tới deadline vẫn là chính sách V1, trừ khi người dùng quyết định khác.
- Request dự toán, xét duyệt, reserve, disburse, reconciliation, final PDF release, dispute, wind-down, actual return, refund.
- **Không thuộc Core V2:** ERC-721/1155, Activate NFT, marketplace, royalty, physical delivery, VND/USDC, mainnet, AI auto-approval, multi-token, gas sponsorship, multi-chain.
- Giữ nguyên mọi quyền tài chính, refund và digital access của `editions-local-escrow-v1` / deployment V1 và mọi archived campaign. Triển khai **versioned** Core V2; không mutate nghĩa vụ cũ.

### A3. Điểm thực tế đã kiểm tra trong repo

| Hạng mục thực tế | Hiện tại | Hướng V2 |
|---|---|---|
| `contracts/src/reward/FundTogetherEditions.sol` | `State {FUNDING, ACTIVE, RELEASE_REVIEW, RELEASED, REFUNDING, COMPLETED}`, có `payout` **toàn phần** sau approved PDF + challenge; không có advance | Contract mới độc lập có kế toán request và partial payout |
| `docs/reward/EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md` | D02 **NO ADVANCE**, full refund trước payout và 7-day release challenge | V2 khác policy; partial refund là khả năng hiện thực sau advance |
| `backend/src/reward` | Campaign PDF-only, private PDF, resolver review, canonical indexer | Thêm FundingRequest/reconciliation/return/case riêng V2 |
| `docs/PROJECT_PROGRESS.md` | Test tự động V1 đã báo PASS; manual MetaMask/Creator/IP thực tế còn TODO | Không kế thừa PASS của V1 sang V2 |
| `docs/reward/FUNDTOGETHER_CAMPAIGN_CONFIG_MVP.md` | `reward-comic-download-mvp-v1`, single tier, fixed pledge, PDF | Giữ category/delivery như baseline; version hóa phần chính sách tiền |

**Nguồn cần rà lại khi agent bắt đầu:** `AGENTS.md`, `GOAL.md`, `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md`, `docs/PROJECT_PROGRESS.md`, `docs/reward/WORKFLOWS.md`, `docs/reward/EDITIONS_MANUAL_TEST_GUIDE.md`, schemas/migrations, full ABI/indexer/contract/tests.

---

## B. Decision Register — CHẶN CODE TÀI CHÍNH TRƯỚC KHI CHỐT

**Quy ước:** `CONFIRMED` = người dùng đã chốt trong hội thoại; `RECOMMENDED / PENDING` = phương án cho người dùng duyệt, **không thể tự thực thi**; `DERIVED` = hệ quả an toàn/tính đúng đắn phải bảo đảm. Tất cả hằng số và các lựa chọn F-Dxx phải đi vào `policyVersion`/commitment trước khi nhận tiền.

| ID | Vấn đề cần chốt | Phương án đề xuất cho local pilot (CHƯA DUYỆT) | Vì sao quan trọng | Trạng thái |
|---|---|---|---|---|
| F-D00 | Có chuyển sang progressive advance không? | **Có; ứng trước khi sản phẩm hoàn tất, có xét duyệt** | Sản phẩm cần vốn sản xuất | **CONFIRMED** |
| F-D01 | Đạt bao nhiêu funding mới cho ứng? | Chỉ khi hết kỳ gây quỹ và `raised >= goal`, `finalizeFunding` canonical | Ngăn ứng khi thiếu vốn | RECOMMENDED / PENDING |
| F-D02 | Người nhận / token | Ví Creator đã verified, frozen trong campaign; MockUSDC exact-transfer; không đổi recipient theo request | Tránh redirect tiền | RECOMMENDED / PENDING |
| F-D03 | Kích thước mỗi request | Gợi ý **≤25% `raisedAtFinalize`** (hoặc 20% nếu ưu tiên bảo vệ vốn); không phải tỷ lệ tối ưu được chứng minh | Giới hạn một lần thất thoát | RECOMMENDED / PENDING |
| F-D04 | Trần vốn chưa đối chiếu | Gợi ý `unreconciledExposure <=25% raisedAtFinalize` trên **toàn campaign**, không chỉ theo request | Ngăn mở nhiều request để vượt cap | RECOMMENDED / PENDING |
| F-D05 | Trần chi phí đã chấp nhận nhưng chưa có kết quả đầu ra | Gợi ý `outcomeExposure <=50% raisedAtFinalize`; chỉ giảm khi *deliverable* được review đủ tiêu chí | Ngăn tất cả vốn được "settled" bằng hóa đơn nhưng sản phẩm chưa có | RECOMMENDED / PENDING |
| F-D06 | Số request mở / thứ tự | 1 FundingRequest đang chờ review/reserved/disbursed chưa đối chiếu; request sau chỉ mở khi request trước `FINANCIALLY_SETTLED` hoặc closed-no-spend, đồng thời không vượt F-D05 | Đơn giản hóa sequencing | RECOMMENDED / PENDING |
| F-D07 | Tiền **reserve** hay payout ngay khi Resolver duyệt? | Phê duyệt hash/amount trước; giữ tiền `reserved` trong escrow; chỉ payout theo gate và hết challenge (nếu chọn) | Ngăn double reservation và tranh chấp kịp thời | RECOMMENDED / PENDING |
| F-D08 | Challenge **trước** disbursement | Gợi ý **48 giờ** sau request approval, trừ request bị reject/cancel; donor có thể challenge request với căn cứ; settlement bị giữ khi case mở | Sau payout không thể đảo giao dịch | RECOMMENDED / PENDING |
| F-D09 | Thời hạn nộp chứng từ và đánh giá | Gợi ý Creator nộp reconciliation ≤14 ngày sau payout (tùy loại chi); review primary 7 ngày, backup tiếp quản khi quá hạn; phải có đường wind-down khi cả hai không xử lý | Tránh vô thời hạn | RECOMMENDED / PENDING |
| F-D10 | Bằng chứng tài chính hợp lệ | Budget line / invoice or receipt / bank statement *where applicable* / vendor proof / delivery artifact, có bản redacted công khai; loại bằng chứng thay đổi theo loại chi & jurisdiction | Không giả định mọi chi phí có VAT | RECOMMENDED / PENDING |
| F-D11 | Tiền chưa chi và `returnUnused` | Creator hoặc payer hợp lệ trả **token thực** về contract, ràng buộc request; return không phụ thuộc việc resolver "ghi nhận" bằng database | Không ghi khống tiền hồi lưu | RECOMMENDED / PENDING |
| F-D12 | Partial failure / wind-down | Dừng request mới, bỏ reserve chưa trả, định lượng refund chỉ từ tiền thực còn escrow và future actual returns; không bắt creator trả đủ bằng biến số ảo | Hiện thực tài chính | RECOMMENDED / PENDING |
| F-D13 | Công thức refund thiếu vốn | Tỷ lệ theo **contribution tại funding close**, snapshot base pool, cho phép claim bổ sung từ late return; quy tắc rounding/dust và claim không hết hạn phải chốt | Không thể copy full-refund V1 | RECOMMENDED / PENDING |
| F-D14 | Product/release challenge và payout cuối | Giữ review sản phẩm + cửa sổ challenge 7 ngày làm *đề xuất khởi điểm*; phần escrow còn lại chỉ final payout sau khi giải quyết case và hoàn thành obligation, không bỏ qua refund reserve | Không giả tạo hoàn thành | RECOMMENDED / PENDING |
| F-D15 | Governance/COI & bypass | Resolver có quyền quyết định request/case gắn hash; backup khác người trong khả năng xác minh; creator không self-approve; có escalation khi COI; deadline permissionless để không khóa tiền vô hạn | Một người ký không chứng minh độc lập | RECOMMENDED / PENDING |
| F-D16 | Creator cancellation / không có bằng chứng / quá hạn | Chính sách chặn payout tiếp, khi nào mở wind-down, deadline xử lý và quyền backer challenge, exit route nếu tất cả reviewer biến mất | Liveness | RECOMMENDED / PENDING |
| F-D17 | Overfunding/fee/pledge | Đề xuất giữ V1: overfunding đến funding deadline, 1 pledge/wallet/campaign, fixed price, platform fee 0; cap dùng `raisedAtFinalize` | Ổn định MVP, không mở tier trong Core V2 | RECOMMENDED / PENDING |
| F-D18 | Recovery của thiếu hụt đã ra ví Creator | Không bảo đảm clawback; optional guarantee/bond/reserve bảo hiểm là **post-MVP** và chỉ có tác dụng khi có tài sản thực | Honest risk disclosure | RECOMMENDED / PENDING |
| F-D19 | Tiêu chí `COMPLETED` | Không đánh dấu completed chỉ vì hóa đơn settled; bắt buộc final PDF được review, quyền tải thực sự sẵn sàng, dispute giải quyết, ledger balanced; chính sách claim/refund còn tồn tại phải mô tả | Không nhầm finance/outcome | RECOMMENDED / PENDING |
| F-D20 | Đã mở quyền tải PDF rồi campaign vẫn wind-down? | Chốt rõ backer có thể vừa giữ bản PDF đã tải vừa nhận **partial refund** hay không; không thể kỹ thuật thu hồi bản tải trước; không tự coi DOWNLOAD là đã đồng ý đóng case | Tránh gây tranh chấp/double benefit | RECOMMENDED / PENDING |

**Hai cặp lựa chọn bắt buộc trade-off bằng trace số:**

- **Tài trợ creator vs bảo vệ backer:** F-D03/04/05. 25% per-request không giúp gì nếu 4 request đều settled bằng hóa đơn nhưng không có sản phẩm. Bắt buộc có outcome-exposure gate.
- **Challenge vs vận hành:** F-D08/09/14. Challenge trước payout làm chậm ứng vốn nhưng sau payout quyền thu hồi yếu. Đề xuất hạn định phù hợp loại chi, emergency bypass nếu cần phải có một chính sách riêng được phê duyệt rõ ràng, không trao bypass mặc định cho resolver.

### B1. Mẫu xác nhận chính sách cho người dùng

```yaml
policyVersion: core-v2-progressive-pilot-v1  # tên đề xuất, chưa approved
status: PENDING_USER_APPROVAL
fundingGate: FULLY_FUNDED_AFTER_DEADLINE
recipient: FROZEN_VERIFIED_CREATOR_WALLET
requestCapBps: null           # ví dụ đề xuất 2500 = 25%, CHƯA DUYỆT
unreconciledCapBps: null      # ví dụ đề xuất 2500, CHƯA DUYỆT
outcomeExposureCapBps: null  # ví dụ đề xuất 5000, CHƯA DUYỆT
maxOpenRequests: null        # ví dụ đề xuất 1, CHƯA DUYỆT
preDisbursementChallengeSeconds: null # ví dụ 172800, CHƯA DUYỆT
reconciliationDeadlineSeconds: null  # ví dụ 1209600, CHƯA DUYỆT
resolverReviewTakeoverSeconds: null   # ví dụ 604800, CHƯA DUYỆT
releaseChallengeSeconds: null         # ví dụ 604800, CHƯA DUYỆT
refundAllocationPolicy: null
roundingAndDustPolicy: null
windDownAndLateReturnsPolicy: null
permissionlessExitRules: null
creatorCancellationRules: null
payoutOnFinalCompletion: null
feeBps: null                 # đề xuất 0, CHƯA DUYỆT
```

**Không sử dụng `null` như giá trị cho contract thực tế; mã triển khai PHẢI bị chặn cho đến khi duyệt, validate, freeze policy.**

---

## C. State machines độc lập

### C1. Campaign financial lifecycle (đề xuất)

```text
DRAFT --review/freeze--> APPROVED --create--> FUNDING
FUNDING --deadline, raised < goal--> REFUNDING_BASE
FUNDING --deadline, raised >= goal--> ACTIVE
ACTIVE --request/review/disburse/settle loop--> ACTIVE
ACTIVE --final product reviewed--> FINAL_REVIEW
FINAL_REVIEW --challenge window + zero unresolved cases--> FINANCIALLY_COMPLETE
ACTIVE/FINAL_REVIEW --cancel/failure/timeout/upheld challenge--> WIND_DOWN
WIND_DOWN --snapshot actual escrow as refund pool--> REFUNDING_BASE
REFUNDING_BASE --later real token return--> REFUNDING_SUPPLEMENT
```

- `FINANCIALLY_COMPLETE` **không tự bằng** `REWARD_DELIVERED`: digital delivery, content access, optional feedback được theo dõi riêng. `COMPLETED` (public) phải có định nghĩa người dùng đã phê duyệt tại F-D19.
- Khi `WIND_DOWN`, **không có payout mới**. Nếu pending request có `reserved` nhưng chưa chuyển, release reservation trước khi allocate refund.
- Payment và refund không đồng thời chi cùng một đơn vị `available`. Nếu `FINAL_REVIEW` đang challenge thì phần chưa payout vẫn trong escrow.
- Deadline phải dựa trên block timestamp, nhưng chuyển trạng thái chỉ xảy ra sau giao dịch hợp lệ; permissionless tick/timeout không được ký duyệt thay Resolver.

### C2. FundingRequest

```text
DRAFT
  -> SUBMITTED (frozen request terms/evidence hash)
  -> REVIEWED_APPROVED (approvedAmount bounded, reviewer signature/record)
  -> RESERVED (on-chain locks amount; may await challenge expiry)
  -> DISBURSED (exact ERC20 transfer to frozen Creator wallet)
  -> RECONCILIATION_SUBMITTED (expenses + receipts + unused balance)
  -> FINANCIALLY_SETTLED (acceptedExpense + actualReturned == amountDisbursed)
Alternative:
  -> CHANGES_REQUESTED / REJECTED / CANCELLED_NO_SPEND
  -> DISPUTED / EXPIRED / WIND_DOWN
```

- Một request có thể có nhiều **revisions** ở database trước khi frozen/submitted; on-chain approval phải ràng buộc `(campaignId, requestId, revisionHash, amount, recipient, expiry, policyHash)`.
- `APPROVED`/`RESERVED` không phải token transfer. `DISBURSED` chỉ khi receipt canonical khớp ERC20 balance delta.
- `FINANCIALLY_SETTLED` là đối chiếu **mức sử dụng vốn được resolver chấp nhận**, không phải bảo đảm tiền đã chi ở ngân hàng; case phải lưu căn cứ.
- Chưa xác minh phải giữ trạng thái `UNRECONCILED/OVERDUE`, không tự đóng request bằng timeout.
- Request mới phải không vượt `unreconciledCap` hoặc `outcomeExposureCap`. Chuyển request không được bypass gate qua tx concurrency.

### C3. Production / Outcome

```text
PLANNED -> EVIDENCE_SUBMITTED -> UNDER_REVIEW
  -> VERIFIED (specific deliverable accepted)
  -> CHANGES_REQUESTED / DISPUTED / FAILED
```

- Product deliverables: draft pages, accepted digital proof/chapters, complete PDF, file openability, verified release hash, access availability. Hash chứng minh *tính bất biến*, không chứng minh bản quyền hoặc chất lượng.
- Accept expense does **not** automatically close outcome exposure; only accepted, version-bound deliverable review does.
- Một deliverable không thể được tính twice để giảm outcome exposure nhiều lần; phải có mapping expense-to-deliverable theo định mức được duyệt.

### C4. Refund claims

```text
NOT_ALLOCATED -> BASE_ALLOCATED -> BASE_PARTIALLY_CLAIMED / BASE_CLAIMED
    -> SUPPLEMENT_i_ALLOCATED -> SUPPLEMENT_i_CLAIMED
```

- Late return không thay đổi entitlement đã claim trước đó; chỉ cấp thêm quyền **bổ sung**. Claim lặp hoặc đổi người nhận phải revert.
- Refund recipient là ví đã pledge theo policy được duyệt. Quyền refund không thể bị creator/signer redirect.

---

## D. Ledger, exposure và invariants toán học

**D1. Biến kế toán per-campaign (base units, integer, không dùng floating point):**

- `R`: total accepted contributions (frozen khi kết thúc funding).
- `P`: cumulative **gross creator disbursements** on-chain.
- `U`: cumulative **actual returned** exact token on-chain (attributed to requests); không tính lời hứa trả, hóa đơn, hay DB row.
- `E`: tracked escrow token held and attributable to campaign (gồm available, reserved, allocated but unclaimed refund); không lấy toàn bộ `balanceOf(contract)` khi nhiều campaign cùng chia token.
- `F`: cumulative token thực đã trả cho backer theo refund claims.
- `A`: approved accepted expense reconciled (review result; không phải tiền chuyển khoản on-chain).
- `V`: recognized verified outcome value, không thể vượt accepted expense value mapped to deliverables.
- `Q`: reserved but not transferred; `Q <= E_unallocated`.
- `L`: allocated but unclaimed refund pool; `L <= E`.

**D2. Conservation of actual token flow:**

```text
R + U = P + F + E
```

Với tiền phí nếu policy về sau khác 0, cần thêm fee term riêng và số dư token không tương thích phải được mô tả. Mọi biến tính tại cùng một block snapshot/event replay. `P - U` là **net funds outside escrow** nếu mọi returned được attribution đúng. Không thể coi `A` hay `V` là USDC trên chain.

**D3. Custody partition, không cấp trùng:**

```text
E = availableForNewPayout + Q + L + otherExplicitLockedBalance
availableForNewPayout >= 0
Q >= 0; L >= 0
```

Không được đồng thời reserve và allocate refund cùng một số token. `availableForNewPayout` phải được xác định dựa trên actual state sau external transfer, không dựa vào cache DB.

**D4. Request-level reconciliation:**

```text
0 <= returned(request) <= disbursed(request)
0 <= acceptedExpense(request) <= disbursed(request) - returned(request)
unreconciled(request) = disbursed(request) - returned(request) - acceptedExpense(request)
unreconciled(request) >= 0
FINANCIALLY_SETTLED iff unreconciled(request) == 0 AND required review approved
```

Chú ý: nếu có `returned` từ người khác hoặc refund ngoại lệ, phải theo explicit attribution; không cho double-credit một token trả về nhiều request. `acceptedExpense` là claim được reviewer duyệt; reviewer có thể sai/fraud nên F-D05 phải chặn outcome-exposure.

**D5. Exposure gates:**

```text
unreconciledExposure = sum(unreconciled(request))
outcomeExposure = sum(acceptedExpenseLinkedToUnverifiedDeliverables)

unreconciledExposure <= unreconciledCap * R / 10_000
outcomeExposure <= outcomeCap * R / 10_000
request.amount <= perRequestCap * R / 10_000
```

**Tính exposure phải diễn ra atomically khi payout** với snapshot `R`, không chỉ trên frontend. Request financial settlement không được xóa `outcomeExposure`. Nếu một deliverable verified chỉ chiếm phần chi phí nào, giảm outcomeExposure **đúng phần mapped** chứ không tự giảm tất cả. Các giá trị cap phải do người dùng chốt.

**D6. Deadline / authority:**

- Unauthorized caller cannot reserve, approve expense, verify outcome, change recipient, change deadline, reset challenge, or allocate refund.
- Resolver cannot approve own financial request or bypass frozen threshold; separate primary/backup review/COI constraints need governance decision.
- At or after deadline, success/failure path must not cause double spend or indefinite lock; protected actors can trigger transitions without backend admin signing.
- Any external token transfer failing must revert full state; no partial payout with stale ledger.

**D7. Event identity:**

Events use `(chainId, deploymentId, contractAddress, txHash, logIndex)` provenance. Indexer is replay/idempotent/reorg-safe; all displayed paid/refunded amounts derive from canonical events/verified actual balances. Client tx hash ≠ confirmed transfer.

**D8. Future NFT compatibility (NO NFT in Core V2):**

Canonical pledge binds a nontransferable **pre-NFT entitlement**. The NFT V2 activation/transfer policy must not permit transferring open refund claims. Do not issue transferable NFT solely on `FUNDING_SUCCEEDED` or `FINANCIALLY_SETTLED` of one request. The future `claim pass` gate will need final project and financial finality. No change to existing V1 PDF downloads.

---

## E. Refund policy proposal and rounding questions

### E1. The fundamental limit

After any non-refundable creator payout, FundTogether cannot guarantee full refund without **actual returned funds**, external guarantee or bond. Do not implement `returnUnused` by incrementing an in-memory amount without `safeTransferFrom` exact balance delta.

### E2. Suggested base-refund snapshot (UNAPPROVED)

At `WIND_DOWN`, cancel all unspent reservations. Lock **actual escrow available** into refund allocation `B0` at a canonical block. Denominator `R` is frozen accepted contributions. Each backer's contribution `ci` remains fixed.

Mathematically recommended base share:

```text
baseClaim_i = floor(B0 * ci / R)
```

For every actual later return that becomes supplemental pool, define cumulative eligible refund pool `Bt` and *per-backers' cumulative entitlement*: 

```text
cumulativeClaim_i(t) = floor(Bt * ci / R)
incrementalClaim_i(t) = cumulativeClaim_i(t) - alreadyClaimed_i
```

**Not approved yet:** precise dust allocation, caps on rounds, whether creator/third party can return after refund snapshot, how to prove late returns, and how to handle partial claims across rounds. Straight `floor` can leave dust smaller than number of backers in base units; never silently award dust to Creator. Consider keep dust claimable under an explicit deterministic policy, or a bounded rounding rule reviewed for gas and fairness. No per-user loop on-chain.

### E3. Worked example in USDC (illustration, NOT approved percentages)

**Campaign:** `R = 1,000 USDC`. Backer A paid 600, B paid 400. Assume no fees and balances of this campaign are isolated.

| Operation | R | Gross paid P | Returns U | Refunded F | Escrow E | Note |
|---|---:|---:|---:|---:|---:|---|
| Funding finalized | 1,000 | 0 | 0 | 0 | 1,000 | At goal |
| Request #1 paid | 1,000 | 200 | 0 | 0 | 800 | Before production complete |
| Request #1 reconciled: expense 170, unused returned 30 | 1,000 | 200 | 30 | 0 | 830 | Financially settled, outcome still open 170 |
| Request #2 paid | 1,000 | 450 | 30 | 0 | 580 | Gross P includes both payouts |
| Campaign stopped; allocate base refunds | 1,000 | 450 | 30 | 0 | 580 | Cannot promise 1,000 refund |
| A claims 348, B claims 232 | 1,000 | 450 | 30 | 580 | 0 | Base split 60:40 |
| Creator later returns 40 USDC | 1,000 | 450 | 70 | 580 | 40 | Actual return, not declared return |
| A claims supplement 24, B claims 16 | 1,000 | 450 | 70 | 620 | 0 | No double claims |

Check: `R + U = 1,000 + 70 = 1,070`; `P + F + E = 450 + 620 + 0 = 1,070`. Backer A receives **372** (348+24), Backer B **248** (232+16). Net outside escrow `P-U = 380`, exactly the unrecovered shortfall. The 450 includes request #2 still unreconciled at stop; do not mark request #2 financially settled.

**Adversarial trace:** Request #1 paid 250 → reviewer accepts 250 expense but **no deliverable** verified → request #2 paid 250 → reviewer accepts all → next two requests similarly settled → whole `R=1,000` drained. A request cap and 1-request sequencing rule alone do **not** prevent this. F-D05 outcome-exposure bound or stronger deliverable gating is required.

---

## F. Trust boundary and workflow UX

### F1. Roles

- **Backer:** see campaign/request budget, approval rationale, actual on-chain transfers, redacted expense docs, deliverable review; file justified challenge while a specified window is open, claim eligible refunds. Backer comments are not quorum/vote by default.
- **Creator:** propose request and submit evidence; cannot choose arbitrary wallet per request, self-approve, create money, or modify frozen terms.
- **Primary Resolver:** approve/reject exact versions and review expense/outcome, explain decision. **Must not override cap / payouts without recorded policy change**.
- **Backup Resolver:** takes over only under documented deadline/COI conditions; no unlimited emergency payout authority.
- **Admin:** verify identity/IP/roles and account status; does **not** gain token transfer rights just by having an admin flag.
- **Executor:** anyone may call permissionless transitions whose full recipient/amount/guard are already determined by contract; cannot choose arbitrary payout amount.

### F2. Creator UI

`Campaign Overview` should show `Raised`, `Escrow available`, `Reserved`, `Gross disbursed`, `Actually returned`, `Unreconciled`, `Outcome pending`, `Refund allocated`, `Remaining funding capacity` with source/action explanation. FundingRequest wizard: budget line, target output, amount in integer USDC base units, delivery/reconciliation deadline, evidence plan, attached redacted/public and private files; preflight shows blocked reasons from *contract* policy. After payout: upload invoice/receipts, return unused tokens, submit signed reconciliation, see reviewer outcomes/challenge. Never display request `APPROVED` as `PAID`.

### F3. Backer UI

Funding Request history per campaign: immutable purpose, approved amount, voting-independent reviewer decision, challenge window, transaction/explorer link, `FUNDS_SENT_TO_CREATOR` vs `EXPENDITURE_REVIEWED` vs `DELIVERABLE_VERIFIED`. Refund UI must show `Estimated recoverable` and `Claimable now` separately; never advertise 100% refund when funds have left escrow. Show possible delays and recovery limitations prominently before pledge.

### F4. Access control and evidence

Private identity documents, bank statements, sensitive invoices and licensing data remain private with redacted public views. Off-chain originals/metadata hashed, immutable per review version. Approval must bind hash rather than client-controlled fields. Server-side permission checks on read and write; don't expose private file URLs to unauthorized users. Financial decisions signed by authorized on-chain account, not trusted API JSON.

### F5. Notification/out-of-band monitoring

Review needed, advance challenge closing, reconciliation overdue, evidence submitted, case unresolved, refund eligible: at minimum in-app reminders during pilot; operational dashboards detect missing indexer and stale RPC. Never run automated payout from a notification or job without approved smart-contract guards.

---

## G. Contract/API/DB interfaces — PROPOSED, no implementation authorized yet

### G1. Version boundaries

- Keep `FundTogetherEditions.sol` (V1) unchanged, with old ABI/manifest/indexer/read/refund paths accessible for valid existing obligations.
- Develop a **separate V2 contract** e.g. `FundTogetherProgressiveEscrow.sol` and new `core-v2-progressive-*` policy hash. Use isolated Anvil deployment and disposable test DB; do not reuse chain identifiers alone as deployment identity.
- All active API/list/read/write routes must be bound to `(protocolKind, policyVersion, chainId, contractAddress, deploymentBlockHash)`.

### G2. Illustrative contract API (not final Solidity signatures)

```text
approveCampaignV2(frozenCampaignTerms)         # only authorized resolver
createCampaignV2(frozenTermsHash)             # creator consumes valid approval
pledgeV2(campaignId)                          # fixed-price canonical pledge
finalizeFundingV2(campaignId)                # permissionless after deadline
submitFundingRequest(campaignId, requestHash, amount, expiry)
reviewFundingRequest(campaignId, requestId, expectedHash, approve)
reserveFunds(campaignId, requestId)          # or atomic with review, per F-D07
challengeFundingRequest(campaignId, requestId, evidenceHash)
resolveFundingChallenge(campaignId, requestId, decisionHash, outcome)
disburseApprovedRequest(campaignId, requestId)
returnUnused(campaignId, requestId, amount)
submitReconciliation(campaignId, requestId, reconciliationHash)
reviewReconciliation(campaignId, requestId, expectedHash, acceptedExpense)
submitDeliverable / reviewDeliverable        # mapping expense -> outcome
submitFinalRelease / reviewFinalRelease
challengeRelease / resolveReleaseChallenge
startWindDown / finalizeRefundSnapshot / claimRefund / claimSupplement
finalizeSuccessfulCampaign / payoutRemainder
```

- A request is bound to frozen campaign, exact amount and Creator recipient. Role and proof checks must be backed by contract state. API names can differ but behavior/test coverage cannot.
- **Do not add all signatures blindly:** first approve F-D decisions, draw complete transition/permission matrix, audit reentrancy, double-counting and circular dependencies.

### G3. Database projection (names illustrative)

`campaign_policy_versions`, `funding_requests`, `funding_request_reviews`, `funding_request_evidence`, `disbursements`, `financial_reconciliations`, `outcome_deliverables`, `outcome_reviews`, `campaign_exposures`, `refund_allocations`, `refund_claims`, `refund_supplement_events`, `chain_event_projections`, `review_cases`. Add migration only; never delete applied migration.

**Source of truth:** contract for money and rights, DB for text/evidence/review intent and event projection. Indexed views are reorg-aware. Store exact integer base units as strings/NUMERIC, not JS float.

---

## H. Tests and formal acceptance required before marking Core V2 DONE

### H1. Foundry invariant / fuzz suite

1. `R+U=P+F+E` after arbitrary interleaving of funding, request approvals/reserve/disburse, returns, refunds; per campaign and global custody check.
2. `Q+L <= E`, payout cannot consume allocated refund or double-reserved funds.
3. No payout before funding deadline + success (if F-D01 approved).
4. Per-request, unreconciled and outcome-exposure caps hold on *every payout transition*, including two requests in same block, malicious review ordering and repeated calls.
5. One settlement cannot erase outcome exposure; forged approval and stale request hash cannot pass.
6. Unauthorized signer/creator/admin cannot approve, redirect recipient, alter amount, reset deadlines, call refund for another wallet.
7. Exact-balance-delta safe token transfers; failed transfer reverts all state, retry works.
8. Idempotency: approval/request ID cannot be replayed; request payout, return attribution and refund claim cannot count twice.
9. Challenge just before/at deadline, primary/backup takeover, unresolved reviewer/timeouts and permissionless wind-down.
10. Refund proportional invariant with mixed pledge amounts and late actual returns; total claimed <= actual allocated; dust rule verified and no unbounded array iteration.
11. Incomplete or fabricated evidence accepted in review does not enable completion if outcome not verified.
12. Release download eligibility never implies a payout, release approval never implies bank-spend verification; NFT mint is not introduced.
13. Mixed V1 + V2 deployments do not leak financial identity or access rights; V1 refund claims remain valid.

### H2. Backend/indexer/HTTP/browser

- Zod strict validation, draft edits/revision races, frozen exact hash checks, reviewer/auth/COI restrictions, evidence ACL/redaction.
- Real transfer receipts canonical only, duplicate and reorg resilience, restart/cold replay; simulation via wrong-chain/contract/event rejected.
- UI after wallet rejection, pending transaction, successful receipt before index, chain reorg, late return, denied payout, failed download, resolver timeout.
- Migration fresh+upgrade+rollback compatibility with current identity; untouched V1 token balances/terms/claim paths.
- Integration scenario with real MockUSDC transfers matches example E3 at **base units**, including 40-USDC late return after earlier refunds.
- Manual MetaMask/Creator/Resolver/Backer acceptance; independent reviewers inspect evidence; test results are not claims of real-world expense truth.

### H3. Research benchmarks

Compare V1 no-advance vs Core V2 progressive funding (and optional legacy milestone baseline where available), under the *same controlled dataset*: working capital needed, amount lost at failure, unresolved financial exposure, outcome exposure, time from funding to first spend, gas and reviewer effort, detection rate for adversarial invoices, indexer recovery. Report trade-offs and confidence intervals where possible; no unmeasured "more secure" claims.

---

## I. Delivery plan & AGENT STOP POINTS

**H0 — Analysis/spec only (NOW):** Reinspect HEAD/working tree/runtime, reconcile V1 obligations and proposed V2. Present F-D00–F-D20 decision sheet with examples, map review/timeout/refund/invariants, confirm no contradictions. Produce approved `CORE_V2_FINANCIAL_POLICY.md` only after user signs off. **No contract/schema migration/redeploy/reset.**

**H1 — Contract isolation, after approval:** Versioned new contract, financial ledger and Foundry invariants; keep V1 intact. Run on isolated Anvil deployment, no real token.

**H2 — Backend & data:** Additive schema, signed request/hash/evidence/reviews, refunds and indexer projections, epoch/deployment-based identities, replay/reorg tests.

**H3 — Creator/Backer/Resolver UX:** Creator request and reconciliation, community/backer review, separate finance/outcome dashboards, partial refund and loss disclosure, notifications.

**H4 — End-to-end validation:** Happy path and stress/failure cases, manual MetaMask, restore from backup, full integration tests, evidence manifest & report.

**H5 — Core V2 release gate:** Review legal/financial risk before any external USDC testnet; don't treat local PASS as production-ready. **Only after H4 gate** start NFT V2 integration as a *separately versioned* component with Activate NFT/transfer-lock semantics.

### Agent hard constraints

1. Do **not** modify financial smart contracts, deploy, migrate active DB, reset Anvil/WSL, or move funds merely from this proposal.
2. Do **not** reclassify V1 entitlement or amend its refund/production rules retroactively; do not remove archive/recovery metadata.
3. Do **not** quietly pick cap percentages, challenge windows, refund math or recipient permissions. Request explicit sign-off in F-D register.
4. Do **not** equate an approved invoice, file hash, transaction hash, UI success or PDF upload with a real-world expense or completed payout.
5. Do **not** build NFT/marketplace or VND/USDC in Core V2. Preserve integration contracts but defer implementation.
6. Do **not** announce DONE on the basis of test fixtures for identity, copyright or reviewer independence.

---

## J. Compact approval sheet — return to user before implementation

| Group | IDs | Expected user decision |
|---|---|---|
| Funding boundary | F-D01, F-D02, F-D17 | Full goal? frozen recipient? fee/overfunding/pledge behavior? |
| Advance policy | F-D03–F-D07 | Size/total caps, number/concurrency and reserved vs immediate payout |
| Review / timing | F-D08–F-D10, F-D14–F-D16 | Challenge windows, reconciliation time, evidence and escalation |
| Recovery / loss | F-D11–F-D13, F-D18 | ReturnUnused, partial refunds, dust, late returns and unrecoverable loss |
| Definition of successful delivery | F-D19–F-D20 | How to treat financially settled vs delivered vs completed and post-download wind-down |

**Mandatory outcome:** approval record must contain exact caps and deadlines, formula, rounding/dust, a time-ordered financial trace, and the actor+action+guard matrix. Any decision not approved remains `OPEN` and is a hard stop for financial code. If user prefers, first approve the minimal pilot subset, mark all more complex cases disabled through a fail-closed versioned policy; no implicit fallback to V1 full refund.
