# Workflow B — Implementation Plan

> Ngày: 2026-10-09. Trạng thái: IN_PROGRESS — CODE_PLAN_APPROVED.
> Người dùng duyệt kế hoạch trong chat: “tôi duyệt mà”. Triển khai trực tiếp,
> không hỏi lại ở từng task; giữ nguyên B-D01–B-D10 đã duyệt.
> **For agentic workers:** dùng `superpowers:executing-plans`, triển khai từng task
> trong chat này. Theo GOAL.md không tạo chat, implementer hoặc reviewer sub-agent.
> B-D01–B-D10 đã được duyệt; không hỏi lại các quyết định đó.

**Goal:** Hoàn thiện Contract B, BE/storage/indexer, FE và T01–T18 theo gói
pilot B đã duyệt, trên môi trường riêng, giữ baseline A.

**Architecture:** Contract B độc lập giữ custody/advance/outcome/refund, không kế
thừa payout A. Một module API/indexer B dùng auth/organization/storage primitives
sẵn có; dữ liệu financial chỉ được chốt từ canonical chain/events. FE dùng cùng
các khu vực campaign/organization/internal, chọn boundary B theo deployment.

**Tech stack:** Solidity0.8.24, OpenZeppelin đang có, Foundry/Anvil1.8.4;
NestJS/TypeScript, PostgreSQL/Drizzle, S3-compatible; React/Vite, Wagmi/Viem,
TanStack Query, Zod. Không thêm framework workflow, oracle hoặc cryptography mới.

**Spec:** [workflow-b-spec](./workflow-b-spec.md) và
[workflow-b-financial-rules](./workflow-b-financial-rules.md).
Kế hoạch sáu bước gốc: [delivery plan](./workflow-b-delivery-plan.md).

**Bổ sung ngày2026-10-10 — thiết kế và triển khai onboarding:**
[onboarding tổ chức](./workflow-b-organization-onboarding-plan.md) định nghĩa
organizer nộp hồ sơ → ADMIN yêu cầu bổ sung/duyệt. Sáu task OB1–OB3, OF1–OF2,
OI1 bổ sung cho kế hoạch gốc. Sau lượt thiết kế, người dùng yêu cầu tiếp tục goal;
OB1–OB3/OF1–OF2 đã triển khai/kiểm thử, OI1 còn nghiệm thu người dùng.
Người dùng sau đó chọn hướng MVP gọn: request history + audit + khóa hồ sơ khi
UNDER_REVIEW, không explicit profile versioning. Thiết kế đã cập nhật theo hướng
này; snapshot mỗi lần gửi đặt trong request, không thêm bảng submissions/version.

## Global constraints

- Baseline HEAD `b1881bd2cb3d6a4413605b06741624e86e2323da` giữ nguyên để diff; không sửa shared payout/bond A.
- B không bond, đúng budget từng đợt, đủ goal, không overfund; token exact-transfer6 decimals.
- C+R=A+F+E; snapshot P0 bất biến; return sau snapshot tăng S; entitlement dùng full precision và floor.
- Base/supplement claim không hết hạn; không sweep/fee/slash, không redirect recipient; return cap theo từng advance.
- Quyền account riêng với SIWE và signer contract; resolver không là organizer/donor; staff dùng ADMIN đang có để xác thực.
- Version tối đa3; một case/version; mọi timestamp/deadline đọc chain, có permissionless timeout.
- Windows + PowerShell; dùng `wsl.exe -d Ubuntu-24.04` cho Foundry. Không đổi clock/reset data A.
- Không tự ký extension, không gọi test tự động là nghiệm thu MetaMask hoặc dữ liệu synthetic là khảo sát.
- RED → implementation tối thiểu → GREEN cho behavior mới; chạy suite phù hợp và ghi bằng chứng mỗi task.
- Lượt lập kế hoạch không tạo commit/push/merge; khi triển khai giữ baseline Git và ledger kiểm chứng theo task.

## Review focus

1. Approve/claim/finalize/case/timeout cạnh tranh ở đúng timestamp boundary → C2/C3/C4.
2. Return sau donor claim hoặc zero pool, round dust thay đổi khi S tăng → C5/C6.
3. Token false/revert/fee/callback làm mất quyền hoặc dùng tiền campaign khác → C2/C5/C6.
4. Reset cùng address/ID và orphaned receipt liên kết sai hồ sơ → B1/B5/F2.
5. Staff/account hợp lệ nhưng sai SIWE wallet, mất public storage hoặc evidence version stale → B3/B4/F3/F4.

## 1. Môi trường và artifact

| Thành phần | Đích B | Bảo vệ A |
|---|---|---|
| Anvil | chain31338, RPC `http://127.0.0.1:9547`; state `.local/workflow-b/anvil/` | Không dùng launcher/reset8545 hoặc smoke9545; check listener/identity trước start, không tạo node trùng |
| PostgreSQL | DB `fundtogether_workflow_b`, service/bind port5434, volume B riêng | Không chạy truncate/drop hoặc migrate nhầm DB `fundtogether`; startup kiểm tên/endpoint |
| Storage | Bucket `fundtogether-workflow-b-private`, MinIO endpoint9100, volume B riêng | Không xóa object/bucket/volume A; originals không anonymous bucket policy |
| Backend / FE | B API3001, FE5174; `WORKFLOW_PROTOCOL=ADVANCE`, `AUTH_CHAIN_ID=31338`, `VITE_API_BASE_URL=http://localhost:3001` | A3000/5173 giữ config; B thiếu manifest/env phải fail closed |
| Account cookie | `AUTH_SESSION_COOKIE_NAME=ft_workflow_b_session` trên B; A mặc định `ft_session` | Cookie localhost không tách theo port; B login/logout chỉ đọc/set/clear cookie B |
| ABI | `backend/src/blockchain/generated/advance/fund-together-advance.abi.json`, token ABI cùng thư mục | Generate từ `contracts/out`; giữ nguyên generated A; FE dùng cùng artifact qua alias, không copy tay |
| Manifest | `.local/workflow-b/generated/deployment.local.json` | `protocolKind=ADVANCE`, chainId, token/contract/resolver, deploymentId, genesis/code hashes, mined anchor, policy/ABI versions, confirmation1 |

Đây là đích sẽ tạo **sau review plan**, chưa xác nhận các service đã chạy. Phiên
bản forge/anvil1.8.4 đã kiểm qua `--version`; chưa chạy Foundry build/test ở lượt
lập kế hoạch. Secrets của B trong ignored env, không ghi source/log/manifest.

## 2. Boundary contract sẽ triển khai

### 2.1. Source và structs

Tạo `contracts/src/FundTogetherAdvance.sol` và `contracts/src/advance/AdvanceTypes.sol`.
Entry point dùng IERC20/SafeERC20/Math/ReentrancyGuard của OpenZeppelin, không
extends FundTogetherBase/Funding/Milestones/Mvp. Chỉ tách thêm helper nếu cần
vì compile/size hoặc đơn vị trách nhiệm; không tạo custody contract thứ hai.

```solidity
constructor(address token, address resolver_, bytes32 instanceId);
// Public immutable: supportedToken, resolver, deploymentId.
// WORKFLOW_POLICY = keccak256("FundTogether.advance.no-bond.v1").

enum CampaignState {
    DRAFT, APPROVED, FUNDING, FIRST_REVIEW, ADVANCE_AVAILABLE,
    EXECUTING, EVIDENCE_REVIEW, SUPPLEMENT_DUE, CHALLENGE_WINDOW,
    CASE_OPEN, COMPLETED, STOPPED
}
enum StageState {
    PENDING, ADVANCED, EVIDENCE_REVIEW, SUPPLEMENT_DUE,
    CHALLENGE_WINDOW, CASE_OPEN, FINALIZED, STOPPED
}
enum ReviewOutcome { MET, NEEDS_INFORMATION, NOT_MET, INCONCLUSIVE }
enum Resolution { PENDING, CONTINUE, RESUBMIT, STOP, TIMEOUT }
enum StopReason {
    CANCELLED, FUNDING_TIMEOUT, FIRST_REVIEW_TIMEOUT, CLAIM_TIMEOUT,
    EVIDENCE_TIMEOUT, REVIEW_TIMEOUT, VERSION_LIMIT, CASE_STOP,
    CASE_TIMEOUT, FINALIZATION_TIMEOUT, HARD_STOP, REVIEW_REJECTED,
    RESOLVER_STOP
}
struct EvidenceRef {
    uint256 campaignId; uint256 stage; uint256 version; bytes32 evidenceHash;
}
```

Views trả structs để tránh getter tuple quá dài. `CampaignView`: organizer,
planHash, goal, fundingDuration, state, currentStage, fundingEnd, firstReviewEnd,
claimEnd, contributed, advanced, returned, refunded, custody, refundSnapshotted,
basePool, supplementPool. `StageView`: budget, criteriaHash, state, advanced,
returned, latestVersion, hardStop, submissionEnd, reviewEnd, challengeEnd,
finalizeEnd, acceptedCampaignSpent, declaredUnused, publicHash, reportHash.
`advanced`/`returned` trong StageView là counters uint256 (0/B cho advance),
không boolean. `SubmissionView`: version/evidenceHash, parentVersion, submittedAt, reviewed, outcome,
reportHash/publicHash, immutable history. `CaseView`: opener/reasonHash,
responseHash, responseEnd, resolutionEnd, resolution/resolutionReasonHash, caseUsed.

```solidity
function campaign(uint256 id) external view returns (CampaignView memory);
function stage(uint256 id, uint256 index) external view returns (StageView memory);
function submission(uint256 id, uint256 index, uint256 version) external view returns (SubmissionView memory);
function challengeCase(uint256 id, uint256 index, uint256 version) external view returns (CaseView memory);
function stageCount(uint256 id) external view returns (uint256);
function contributions(uint256 id, address donor) external view returns (uint256);
function campaignForDraft(address organizer, bytes32 draftKey) external view returns (uint256 idPlusOne);
function refundClaimable(uint256 id, address donor) external view returns (uint256 base, uint256 supplement, bool baseConsumed, uint256 supplementPaid);
```

State labels không dùng enum số A. Amount/timestamp ABI uint256, API strings;
event/action signatures dưới đây là agreement để review, chưa là ABI generated.
Tên nghiệp vụ `FUNDED_AWAITING_FIRST_REVIEW` trong spec được mã hóa thành
`FIRST_REVIEW`; `EVIDENCE_PENDING_REVIEW` thành `EVIDENCE_REVIEW`,
`STAGE_FINALIZED` thành StageState `FINALIZED`. Chỉ rút gọn tên, không đổi
điều kiện/quyền hoặc cửa sổ thời gian đã duyệt.

### 2.2. Transactions

```solidity
submitCampaignForDraft(bytes32 draftKey, bytes32 planHash, uint256 fundingDuration,
    uint256[] budgets, bytes32[] criteriaHashes) returns (uint256 campaignId);
approveCampaign(uint256 id, bytes32 expectedPlanHash, bytes32 verificationHash, bytes32 reasonHash);
publishCampaign(uint256 id, bytes32 expectedPlanHash);
cancelCampaign(uint256 id, bytes32 expectedPlanHash);
donate(uint256 id, uint256 amount);
confirmFirstAdvance(uint256 id, bytes32 expectedPlanHash, bytes32 verificationHash, bytes32 reasonHash);
claimAdvance(uint256 id, uint256 index, bytes32 expectedPlanHash);
submitEvidence(uint256 id, uint256 index, uint256 nextVersion, bytes32 evidenceHash);
approveEvidence(EvidenceRef ref, bytes32 publicHash, bytes32 reportHash, uint256 campaignSpent);
requestSupplement(EvidenceRef ref, ReviewOutcome outcome, bytes32 reportHash);
rejectEvidence(EvidenceRef ref, bytes32 reportHash);
openCase(EvidenceRef ref, bytes32 reasonHash);
addCaseMaterial(EvidenceRef ref, bytes32 materialHash);
submitCaseResponse(EvidenceRef ref, bytes32 responseHash);
resolveCase(EvidenceRef ref, Resolution outcome, bytes32 reasonHash);
finalizeStage(EvidenceRef ref);
stopCampaign(uint256 id, bytes32 expectedPlanHash, bytes32 reasonHash);
finalizeTimeout(uint256 id);
returnFunds(uint256 id, uint256 index, uint256 amount);
claimRefund(uint256 id);
```

Các action đều external và state mutations dùng nonReentrant. `cancelCampaign` chỉ
organizer, chưa advance đầu, nonterminal (kể cả đủ funding); snapshot về STOPPED
với reason CANCELLED. `stopCampaign` chỉ resolver, nonterminal, reason nonzero;
không transfer. `finalizeTimeout` anyone chọn đúng deadline theo current state;
ở CHALLENGE_WINDOW hết challengeEnd chỉ mở finalize, timeout tại finalizeEnd.

`requestSupplement` chỉ cho NEEDS_INFORMATION/INCONCLUSIVE; nếu version=3 thì
record outcome và STOP VERSION_LIMIT. MET quyết định U=budget-campaignSpent,
Spent<=budget; không tăng A. `resolveCase(CONTINUE)` giữ original accepted report,
đủ public access theo report và đủ cửa sổ3 ngày mới; case vẫn đã used, không appeal.
Hash là opaque commitment: contract kiểm caller/state/tuple/version, API/reviewer
kiểm exact manifest context; contract không parse JSON hoặc tự biết file là thật.

### 2.3. Event agreement

Mỗi event dưới đây có `campaignId indexed`; stage/version uint256, hashes bytes32,
wallet address. Không chứa nội dung PII, URLs ký hoặc file bytes.

| Event | Payload ngoài campaignId |
|---|---|
| CampaignSubmitted | organizer indexed, draftKey indexed, planHash, goal, fundingDuration |
| StageConfigured | stage indexed, budget, criteriaHash |
| CampaignApproved | resolver, planHash, verificationHash, reasonHash |
| CampaignPublished | fundingEnd |
| DonationReceived | donor indexed, amount, contributed, custody |
| CampaignFunded | firstReviewEnd |
| AdvanceAvailable | stage indexed, claimEnd, verificationHash (first eligibility; zero khi mở stage sau), reasonHash |
| AdvanceClaimed | stage indexed, organizer, budget, advanced, custody, submissionEnd, hardStop |
| EvidenceSubmitted | stage indexed, version indexed, evidenceHash, parentVersion, reviewEnd |
| EvidenceReviewed | stage indexed, version indexed, outcome, evidenceHash, publicHash, reportHash, campaignSpent, unused, submissionEnd, challengeEnd, finalizeEnd |
| CaseOpened | stage indexed, version indexed, opener, evidenceHash, reasonHash, responseEnd, resolutionEnd |
| CaseMaterialAdded / CaseResponseSubmitted | stage indexed, version indexed, actor, materialHash / responseHash |
| CaseResolved | stage indexed, version indexed, actor (resolver hoặc permissionless timeout caller), resolution, reasonHash, submissionEnd, challengeEnd, finalizeEnd |
| StageFinalized | stage indexed, version indexed, evidenceHash, reportHash |
| FundsReturned | stage indexed, organizer, amount, afterSnapshot, returnedStage, returned, supplementPool, custody |
| RefundSnapshotted | basePool, contributed, custody |
| RefundClaimed | donor indexed, baseAmount, supplementAmount, baseConsumed, supplementPaid, refunded, custody |
| CampaignStopped | stage, stopReason, reasonHash |
| CampaignCompleted | finalStage |

Transaction logs theo thứ tự effect: tiền/record → state/deadline → terminal/
snapshot; ghi agreement cố định và test ordering sau khi implementation. B views
được đọc tại end block canonical để replay projection; log vẫn đủ audit tiền.
Timeout không giả reason người ký: reasonHash0 được phép riêng cho timeout.

## 3. C1–C6 — triển khai Contract B theo thứ tự

Mỗi task: test RED vì behavior thiếu (không chỉ import error), code tối thiểu,
test task GREEN rồi suite `forge test`; chỉ broaden khi có thay đổi/failure cần.
Lệnh WSL tại repo root, với absolute path workspace đã kiểm:

```powershell
wsl.exe -d Ubuntu-24.04 --cd C:\Users\dell\Desktop\FundTogether\contracts -- bash -lc '~/.foundry/bin/forge test --match-path "test/unit/Advance/*.t.sol" -vv'
wsl.exe -d Ubuntu-24.04 --cd C:\Users\dell\Desktop\FundTogether\contracts -- bash -lc '~/.foundry/bin/forge test'
```

### C1 — setup/funding, không bond

Files create: `contracts/src/FundTogetherAdvance.sol`, `contracts/src/advance/AdvanceTypes.sol`,
`contracts/test/helpers/AdvanceFixtures.sol`, `contracts/test/unit/Advance/Funding.t.sol`.
Reuse token `contracts/test/mocks/MockUSDC.sol`; không đổi module/test helper A.
Consumes: constructor token/resolver/instanceId, budget/criteriaHash list.
Produces: campaign/stage views, draft-key mapping, transactions setup tới FIRST_REVIEW.

- [x] RED: `test_G1CreateHasGoal2200AndNoTokenMovement`: budget2200000000, C/A/R/F/E0, organizer/token balances không đổi. `test_G2GoalIs3300`, empty/zero/overflow budget, criteria length/zero, zero draft/plan/instance hash, duplicate key.
- [x] RED: funding duration1d và30d accept, dưới/trên reject; publish tính fundingEnd từ tx timestamp; wrong caller/expected planHash/unapproved publish reject; resolver không create/donate vào campaign.
- [x] RED: donor1320000000+880000000 → C2200000000/FIRST_REVIEW, firstReviewEnd=t+259200; zero/overgoal/donate tại deadline reject; cancel trước advance ở mỗi state tạo một P0=C, không token payout và không bond.
- [x] Implement signatures C1, state/deadline/event agreement; dùng checked uint sum; event/read history đủ association draftKey. Criteria và budgets không setter sau create.
- [x] GREEN: `forge test --match-path 'test/unit/Advance/Funding.t.sol' -vv`, sau đó suite; ghi kết quả C1 và commands, chưa deploy B.

### C2 — first eligibility và advance một lần

Files modify entry point; create `contracts/test/unit/Advance/Advance.t.sol` và
`contracts/test/mocks/AdvanceCallbackToken.sol` (callback cấu hình dùng lại C5/C6).
Consumes C1 FIRST_REVIEW/planHash/budgets; produces ADVANCE_AVAILABLE/EXECUTING,
per-stage counters và claim/evidence/hardStop deadlines.

- [x] RED: confirm chỉ resolver, trước firstReviewEnd, verification/reasonHash nonzero; mở claimEnd=t+604800. Wrong caller/hash/state/đúng expiry reject; finalizeTimeout expiry STOP P0=C.
- [x] RED: G1 claim2200000000 một lần; G2 claim1100000000 → E2200000000/A1100000000. Sai organizer/stage/plan, trước confirm/lặp/sau claimEnd reject; claim trước/bằng/sau deadline và cạnh tranh resolver STOP có outcome theo mined order.
- [x] RED: false/revert transfer không đổi state/claimEnd/A/E/balances; callback không claim lại; incoming/outgoing fee delta không được ghi như exact amount. ClaimEnd timeout giữ donor rights theo custody thực có.
- [x] Implement claim cập nhật effects trước transfer, SafeERC20/nonReentrant và exact balance deltas; submissionEnd=t+2592000, hardStop=t+5184000. Không gọi đường settlement A.
- [x] GREEN: targeted `Advance.t.sol` và suite; kiểm từng token balance ở receipt cuối, không gọi simulated trace là test transfer.

### C3 — evidence/version/đánh giá/finalize không payout

Files modify entry/types; create `contracts/test/unit/Advance/Evidence.t.sol`.
Consumes C2 EXECUTING/advance; produces version history, review decisions,
CHALLENGE_WINDOW/finalizeStage/next claim hoặc COMPLETED.

- [x] RED: submit đúng stage và nextVersion1, old/current wrong tuple reject; immutable old version, parentVersion; reviewEnd=min(t+259200,hardStop); upload/hash intent không đổi A/E.
- [x] RED: MET phải resolver và đúng EvidenceRef; public/reportHash nonzero, spent<=budget; U=B-spent, đủ full3d trước hardStop; donor silence chưa MET không finalize. NEEDS_INFORMATION/INCONCLUSIVE mở7d, tối đa3 version; bản3 thiếu → STOP.
- [x] RED: G1 finalize sau MET+challengeEnd không tăng A hoặc chuyển thêm token; U50000000 chưa return không finalize, return đủ mới COMPLETED/P0=50000000; final stage chưa nghiệm thu thì chưa COMPLETED.
- [x] RED: G2 chỉ mở claim stage1 sau finalize stage0, claimEnd=t+604800; pending case/sai version không finalize. challengeEnd-1/=/+1 và finalizeEnd-1/=/+1, hardStop boundary; expired finalize → STOP.
- [x] Implement C3 methods, events và stored histories; finalization permissionless, snapshot chỉ tại terminal; chỉ approval truth qua resolver, không parse hóa đơn.
- [x] GREEN: `Evidence.t.sol` + suite, đo balances trước/sau mọi quyết định/finalization.

### C4 — case/response và mọi timeout

Files modify entry/types; create `contracts/test/unit/Advance/Case.t.sol`,
`contracts/test/unit/Advance/Timeout.t.sol`.
Consumes C3 MET/EvidenceRef; produces case history và CONTINUE/RESUBMIT/STOP/TIMEOUT.

- [x] RED: donor c>0 hoặc resolver mở case trong CHALLENGE_WINDOW, đúng ref; không contributor/sai version/zero reason/at challengeEnd reject; caseUsed ngăn lần hai cùng version kể cả CONTINUE.
- [x] RED: response một lần organizer và material contributor trước responseEnd; resolver chỉ resolve từ responseEnd tới trước resolutionEnd; không tự MET vì organizer vắng; pending case khóa finalize/advance.
- [x] RED: CONTINUE mới3d và finalizeEnd cap; RESUBMIT7d/version limit không cấp lại; STOP refund chỉ E. Resolver absence → permissionless TIMEOUT; report timeout không giả reasonHash/reviewer verdict.
- [x] RED: responseEnd/resolutionEnd clipped tới hardStop, bằng nhau không early resolve; insufficient remaining3d không CONTINUE/MET. FIRST_REVIEW/ADVANCE_AVAILABLE/EXECUTING/EVIDENCE_REVIEW/SUPPLEMENT_DUE/CASE_OPEN/CHALLENGE_WINDOW đều có timeout đúng state; DRAFT/APPROVED/terminal reject.
- [x] Implement `finalizeTimeout` dispatch theo state và hardStop, không tự gia hạn; case material event-only, response/outcome immutable; reason/caller/hash guard trước mọi transition.
- [x] GREEN: `Case.t.sol`, `Timeout.t.sol` và suite; race challenge/finalize/timeouts theo thứ tự tx và đúng timestamp.

### C5 — return/base refund/supplement

Files modify entry/types; create `contracts/test/unit/Advance/Refund.t.sol`.
Consumes C1–C4 custody/snapshot/stage advance; produces return/claim views/events,
P0/S/paid/flags theo financial spec.

- [x] RED: G2 STOP sau claim stage1 → P0=1100000000; donor A/B base660000000/440000000, bất kỳ thứ tự. G1 STOP P0=0; không hứa donor2200000000.
- [x] RED: return theo stage caller organizer, amount>0, <=advance-returned; thực nhận50 trước snapshot → P0=50000000; return110000000 sau snapshot → P0 giữ1100000000/S110000000, ví đã claim base vẫn nhận thêm66000000/44000000.
- [x] RED: C10/A3/P07, weights3/7: base2/4; late return1+2 tạo S3, supplement0/2, dust2 tổng; unclaimed tách retained balance. Zero-C cancel không divide0; giá trị gần uint256 dùng Math.mulDiv không overflow.
- [x] RED: zero entitlement lần đầu tiêu thụ base flag/emits event không ERC20 transfer0; lần hai không quyền mới reject; late entitlement vẫn mở. False/revert/callback claim/return rollback flags/F/R/S/E và retry an toàn; không vòng lặp donor/đổi recipient/sweep.
- [x] Implement exact return, separate cumulative S và supplementPaid, baseClaimed; all token effects trước external call, có event phân bucket. Return sau COMPLETED/STOP không mở lại execution.
- [x] GREEN: `Refund.t.sol` + suite; đối chiếu identity C+R=A+F+E từng action và paid<=entitlement/pool.

### C6 — invariant/artifact/deployment

Create `contracts/test/invariant/FundTogetherAdvanceInvariant.t.sol`,
`contracts/test/unit/Advance/Adversarial.t.sol`,
`backend/scripts/workflow-b/generate-artifacts.cjs`,
`backend/scripts/workflow-b/deploy-isolated.cjs`, `backend/scripts/workflow-b/start-chain.ps1`;
generated ABI directory như §1. Consume all C transactions/views/events;
produce standalone B ABI/manifest/policy artifact và reproducible local deploy.

- [x] RED: stateful multi-campaign/multi-donor với claim/return/STOP/case/timeout và retained excess; per-campaign custody conservation, sum E<=balance, A[m] chỉ0/B[m], không double advance, F không vượt quyền/pool, histories bất biến.
- [x] RED: adversarial inflow/outflow false/revert/fee/reentrancy, arbitrary direct token transfer không tạo quyền; donor iteration độc lập với claim gas. Fuzz contribution fractions, large mulDiv, return increments và claim permutations.
- [x] RED: generator reads Foundry artifact, ABI drift/missing bytecode fail; manifest reuse phải verify31338/genesis/code hashes/anchor/deploymentId/policy/getter timers; wrong endpoint/address/instance fail closed; không overwrite A manifest.
- [x] Implement artifact generator và local deploy trên9547, unlocked test accounts, receipt success + confirmations trước lưu atomic manifest. Build policy JSON từ getters/constants và hash bytes riêng, không sửa dataset DRAFT đã freeze.
- [x] GREEN: `forge build`, `forge test` (unit/fuzz/invariant A+B), bytecode deployed size trong EVM limit, artifact reproducibility tests. Deploy B mới, đối chiếu manifest/getters/initial balances và nextCampaignId0; không launch9547 nếu listener khác đã chiếm.

Không tiếp tục BE/FE B nếu tiền/access/deadline/fuzz/invariant hoặc ABI agreement
chưa đạt. Compile size/gas failure được sửa trong boundary B, không bỏ case hoặc
đổi rule đã duyệt chỉ để test qua. Record đường thoát và limitations thực tế.

## 4. B1–B6 — BE/storage/indexer

Thêm `backend/src/advance/` cho boundary B; không gọi BlockchainService A hoặc
MilestoneWorkflowService A để quyết định advance. Giữ auth, SIWE, memberships,
storage primitives, schema evidence/checkpoint/log hiện có khi tương thích.
Không dựng engine/registry runtime cho các loại campaign chưa có nghiệp vụ.

### 4.1. Interfaces dùng chung cho B

Tạo `backend/src/advance/advance.types.ts`; amounts/timestamps/IDs uint đều strings.
`Hex`/`Address` lấy từ Viem. Các field sau là contract cho các task sau:

```typescript
type AdvanceContext = {
  protocolKind: 'ADVANCE'; chainId: number; deploymentId: Hex;
  contractAddress: Address; tokenAddress: Address; resolver: Address;
  workflowPolicy: Hex; abiVersion: '1'; confirmations: number;
};
type AdvanceCheckpoint = { blockNumber: string; blockHash: Hex; chainTimestamp: string };
type AdvanceCampaignState = 'DRAFT' | 'APPROVED' | 'FUNDING' | 'FIRST_REVIEW' |
  'ADVANCE_AVAILABLE' | 'EXECUTING' | 'EVIDENCE_REVIEW' | 'SUPPLEMENT_DUE' |
  'CHALLENGE_WINDOW' | 'CASE_OPEN' | 'COMPLETED' | 'STOPPED';
type AdvanceStageState = 'PENDING' | 'ADVANCED' | 'EVIDENCE_REVIEW' |
  'SUPPLEMENT_DUE' | 'CHALLENGE_WINDOW' | 'CASE_OPEN' | 'FINALIZED' | 'STOPPED';
type AdvanceWorkflow = {
  context: AdvanceContext; checkpoint: AdvanceCheckpoint;
  campaignId: string; currentStage: string;
  state: AdvanceCampaignState; stageState: AdvanceStageState;
  goal: string; contributed: string; advanced: string; returned: string;
  refunded: string; custody: string; basePool: string; supplementPool: string;
  deadlines: Record<'fundingEnd' | 'firstReviewEnd' | 'claimEnd' | 'submissionEnd' |
    'reviewEnd' | 'challengeEnd' | 'responseEnd' | 'resolutionEnd' | 'finalizeEnd' | 'hardStop', string>;
};
type AdvanceSubmissionPlan = {
  context: AdvanceContext; draftKey: Hex; organizer: Address;
  planHash: Hex; planBytes: string; fundingDuration: string;
  budgets: string[]; criteriaHashes: Hex[]; expectedRevision: number;
};
type AdvanceActionPreparation = {
  context: AdvanceContext; checkpoint: AdvanceCheckpoint;
  actorWallet: Address; contractAddress: Address; functionName: string;
  args: unknown[]; recordHash: Hex | null; blockedReason: string | null;
};
```

`AdvanceCampaignSnapshot` chứa CampaignView/StageView/SubmissionView/CaseView
ABI chuyển thành API strings, published flag/txHash và metadata association.
`AdvanceEvidencePackage`: packageId/context/campaignId/stage/version,
parentPackageId, criteriaHash/planHash, manifestBytes/evidenceHash.
`AdvanceDecisionRecord`: context/ref/outcome, criterion assessments/source IDs,
campaignSpent/unused, reason, actor account+wallet, conflicts, availability statement,
publicHash và checkpoint; exact bytes stored/hash, không sửa record đã ký.

### B1 — deployment context và B bootstrap

Create `backend/src/advance/advance-deployment.ts`, `advance-blockchain.service.ts`,
`advance.types.ts`, `advance.module.ts`, `advance-app.module.ts`, `advance-main.ts`;
tests `advance-deployment.spec.ts`, `advance-blockchain.service.spec.ts`,
`advance-app.module.spec.ts`. Create
`backend/scripts/workflow-b/guard-environment.cjs`, `guard-environment.test.cjs`;
guard kiểm URL/DB/bucket/port/context trước kết nối hoặc khởi động.
Modify `backend/src/config/env.config.ts`,
`backend/src/modules/auth/auth.guard.ts`, `auth.controller.ts`; create
`backend/src/modules/auth/auth-cookie.ts`, `auth-cookie.spec.ts`, bổ sung
`auth.guard.spec.ts` và controller test cho cookie isolation.
Modify `backend/package.json` thêm lệnh chạy B; env mẫu
`backend/environments/workflow-b/.env.example`. AppModule/main A giữ entry point cũ.
Consumes C6 ABI/manifest; produces `verifyDeployment(): Promise<void>`,
`snapshot(id: bigint, blockNumber: bigint): Promise<AdvanceCampaignSnapshot>`,
`read(functionName: string, args: unknown[], blockNumber?: bigint): Promise<unknown>`.

- [x] RED: manifest B đúng31338/protocol/policy/anchor mới valid; A manifest, chain31337, zero ID, missing ABI, codeHash/token/anchor mismatch → 503/boot fail, không fallback.
- [x] Implement B service dùng generated ABI, immutable deploymentId/policy/getter timing/tokenDecimals=6 check. Bootstrap B dùng port3001, AUTH_CHAIN_ID31338, authOrigin5174, DB/B bucket bắt buộc; không mount controllers/indexer A.
- [x] RED: B module không khởi tạo BlockchainService/IndexerService/MilestoneWorkflowService A hoặc mount controllers A. Đăng ký EvidenceStorageService/EvidenceAccessService trực tiếp tại AdvanceModule với DatabaseModule/ConfigModule/AuthModule; không import EvidenceModule vì module đó kéo theo chain/indexer A. Logger/CORS/BrowserOriginGuard giữ redaction và origin B5174 như A đang có.
- [x] RED: cookie mặc định A vẫn `ft_session`; B chỉ nhận cookie B, cả khi request chứa hai cookie. Login/logout B không revoke token A hoặc clear cookie A trên cùng localhost khác port.
- [x] Implement config `authSessionCookieName` từ AUTH_SESSION_COOKIE_NAME, mặc định `ft_session`; AuthGuard và AuthController dùng cùng helper đọc exact cookie name và cùng config khi set/clear/revoke. B bắt buộc `ft_workflow_b_session`; session DB riêng, frontend HTTP dùng baseURL B và credentials hiện có.
- [x] GREEN: targeted spec rồi `npm.cmd test -- --runInBand`, `npm.cmd run build`; không chạy migration/start server nếu chưa xác nhận đích B.

### B2 — gift draft, freeze plan và migration

Create `backend/src/database/schema/advance.schema.ts`,
`backend/src/advance/advance-campaign.schema.ts`, `advance-campaign.service.ts`,
`advance-campaign.controller.ts`, `advance-campaign.service.spec.ts`,
`advance-campaign.schema.spec.ts`. Modify schema barrel `index.ts`.
Generate migration `backend/drizzle/0013_workflow_b_context.sql` cùng journal/snapshot;
số tiếp theo hiện0013 (journal cuối0012), kiểm lại lúc làm để không trùng migration mới.
Create `backend/drizzle.workflow-b.config.ts`,
`backend/scripts/workflow-b/migrate-isolated.cjs`, `migrate-isolated.test.cjs`;
thêm lệnh `db:migrate:workflow-b` vào package.json. Config B yêu cầu DATABASE_URL
explicit và guard trước đọc journal/kết nối; không gọi lệnh `db:migrate` chung
có default DB A. Wrapper chạy Drizzle bằng config B, giữ exit code và lỗi thật.

Ba bảng B mới:

| Bảng | Columns / constraints chính |
|---|---|
| `advance_campaign_plans` | campaignMetadataId PK/FK; deploymentId/chainId/contract; giftConfig JSON(channel/tasks/checklistVersion); fundingDuration; organizerWallet/draftKey/frozenPlanBytes/planHash nullable trước freeze; frozenAt. Revision dùng metadata.revision; unique(deploymentId,organizerWallet,draftKey); FK metadata giữ tổ chức/OWNER và milestone IDs |
| `organization_verification_records` | UUID PK, organizationId FK, status VERIFIED/REVOKED, immutable reportBytes/hash, checkedBy user FK, validUntil, createdAt. Append audit, không overwrite verification history |
| `advance_campaign_projection` | PK(streamId,onchainCampaignId), metadataId nullable, typed B snapshot JSON; stream FK và identity; không dùng CampaignSnapshot A |

Các bảng metadata/milestone/evidence/publication/milestone_records/indexer_streams/
chain_events hiện có được tái sử dụng qua context B. Không đổi schema/bond/rights
campaign A; không đưa B submission vào `campaign_submissions` A rồi cho mapper A đọc.
Metadata association B dựa draftKey + organizer + full identity + planHash/budgets/criteria.

- [x] RED: G1 một stage và G2 ba stage/tasks/checklist hợp lệ, goal derived2200/3300; wrong channel/activity, duplicate criterion IDs, zero/float/overflow amounts, stale revision, wrong organization/milestone ID reject.
- [x] Implement create/update OWNER-authorized; `prepareSubmission(id,userId,revision): Promise<AdvanceSubmissionPlan>` freeze trong transaction, canonical field order/exact UTF-8 SHA-256 bytes, immutable budget/criteria/wallet/policy context. Frozen plan sửa phải confirmed cancel trước advance và tạo draft thay thế với key/ID mới, không unfreeze record cũ.
- [x] RED/GREEN migration trên DB fixture: account/membership hashes trước/sau unchanged, constraints/FKs reject malformed context, apply/restart thành công; database guard từ chối DB A trước bất kỳ migration/seed nào.
- [x] RED: thiếu DATABASE_URL, tên DB A, port5432 hoặc endpoint ngoài B local bị từ chối trước khi spawn migration/connect. Dùng URL parser đối chiếu hostname local/port5434/path `fundtogether_workflow_b`; không ghi URL/credential vào lỗi. Cùng guard dùng bởi migration, seed và B bootstrap, không chỉ dựa vào guard lúc Nest startup.
- [x] Run targeted schema/service specs, backend suite/build và migration verification script; không chỉ `db:generate` rồi gọi schema đã chạy.

### B3 — xác thực tổ chức, conflict và quyết định

Phạm vi B3 đã làm là ADMIN ghi xác thực trực tiếp, chưa bao gồm request do
organizer gửi. Lifecycle mới nằm ở OB1–OB3 bên dưới, không được suy từ các tick B3.

Create `backend/src/advance/organization-verification.service.ts`,
`organization-verification.controller.ts`, `advance-review.service.ts`,
`advance-review.schema.ts`, `advance-review.controller.ts` và corresponding `.spec.ts`.
Consumes B1/B2 + AuthGuard/OWNER/SIWE/platformRoles; produces immutable verification
reports và `prepareReview(id,userId,input): Promise<AdvanceActionPreparation>`.

- [x] RED: ADMIN đang có mới ghi xác thực, không tự xác thực organization mình OWNER; audit đầy đủ report/reason/source/validUntil, append REVOKED giữ lịch sử. Account RESOLVER không tự có quyền ADMIN, không role mới hoặc grant trên DB A.
- [x] RED: resolver account + SIWE-linked configured resolver wallet đúng31338 mới prepare on-chain review; staff role thu hồi hoặc wrong wallet/owner/contributor/conflict/current version reject; đọc original theo quyền campaign, không leak bởi hash guessing.
- [x] Implement reviewer checklist từng criterion, nguồn/giới hạn/rationale/conflict declaration, availability, campaignSpent/unused; MET cần mọi criterion đạt và numeric valid, INCONCLUSIVE không map MET. Freeze/hash report trong `milestone_records` với B context; authority chỉ từ event, HTTP record là intent.
- [x] Implement first eligibility recheck tổ chức còn VERIFIED và report validity tại chain checkpoint; revocation/expiry sau funding tạo yêu cầu resolver STOP, không ghi DB là đã khóa contract. Chọn validUntil theo hồ sơ staff, không tự thêm chain deadline ngoài spec.
- [x] GREEN targeted permissions/review specs + suite/build; audit reviewer sai chữ ký hợp lệ vẫn có thể MET trong T07, không làm fake oracle xác minh sự thật.

### B4 — original/redacted/evidence version

Create `backend/src/advance/advance-evidence.schema.ts`, `advance-evidence.service.ts`,
`advance-evidence.controller.ts`, `advance-evidence.service.spec.ts`;
create shared `backend/src/modules/evidence/evidence-file-validation.ts` nếu cần tái
sử dụng MIME/size logic A/B; change `evidence-files.service.ts` chỉ delegate cùng
validation và giữ tests A. Reuse EvidenceStorageService và existing evidence tables,
EvidenceAccessService membership logic; không import freeze/query logic chain A.
Consumes B plan/stage/context, files; produces AdvanceEvidencePackage/publicHash.
EvidenceDraftContent hiện có gồm report/expenses/documents, không có literal
schemaVersion trong JSON content. B giữ các field đó và thêm context/gift report
theo schema B; khi đọc row phải parse bằng advance-evidence.schema, không cast
row A thành B. DB evidenceSchemaVersion ghi0.2 explicit, không dùng default0.1.
Giữ types và behavior A; chỉ bổ sung shared type khi compile thực sự yêu cầu.

- [x] RED: original chỉ OWNER/resolver đủ quyền; donor/public chỉ redacted; wrong owner/stage/identity/version, MIME spoof, >10MiB/file, >20 files, wrong stored bytes/hash/reference reject. Private bucket policy chưa sẵn sàng → lỗi, không freeze success.
- [x] Implement schema B0.2 thêm deploymentId/planHash/policy/channel/context, parent package immutable, exact manifests và original↔public hash reference. Public redaction confirmation, separate objects; no signed URL/PII trong public bytes/log/chain.
- [x] RED: simultaneous freeze/version/reorder/revision race không gắn sai stage; expired signed access không cấp lại sai quyền; storage offline trong prepare MET không tạo approval intent; outage sau MET có bước prepare case đúng version.
- [x] Implement `freeze(id,stage,userId,expectedRevision)` / `publishRedacted(packageId,userId,input,files)` / `original` / `publicBundle`; ghi package/publication/record ở existing tables bằng B context; quyền cấp URL/download kiểm lại.
- [x] GREEN targeted tests + suite/build, object-storage integration trên bucket B. Chuyển lab JSON/SVG thành PDF/PNG synthetic có nhãn, format sniff/hash, neutral IDs nếu dùng reviewer trial; giữ fixture lịch sử.

### B5 — indexer/projection/replay

Create `backend/src/advance/advance-indexer.service.ts`, `advance-indexer.service.spec.ts`,
`backend/scripts/workflow-b/indexer-smoke.cjs`. Reuse durable streams/events tables;
advance projection/schema B2. Consume C6 event agreement and B1 snapshot;
produce `runOnce(): Promise<void>`, canonical projection và checkpoint.

- [x] RED: duplicate identical log không duplicate financial record; events+snapshot+checkpoint cùng transaction; crash sau insert hoặc sai end-block hash rollback cả batch, retry cùng handle giữ quyền/counters.
- [x] RED: process restart/reorg rewinds B stream, giữ orphan history, replay ra cùng C/A/R/F/E/P0/S/versions/cases; reset same chain31338/same address nhưng khác deploymentId/genesis/anchor fail closed, không ghép metadata cũ numeric ID.
- [x] Implement streamKey có protocol+chain/address/deploymentId/genesis/anchor; advisory lock, strict decoded logs sorted block/tx/log; touched campaign snapshot tại canonical end block; identity verify trước/sau batch; funded deadline updates đọc chain, không chỉ chờ event timeout.
- [x] GREEN real chain/DB B replay smoke so sánh full event history, snapshot API và on-chain getter at checkpoint; backend suite/build. Không gọi mock unit PASS là reorg/reset đã chạy thật.

### B6 — versioned API và action preparation

Create `backend/src/advance/advance-workflow.service.ts`, `advance-public.controller.ts`,
`advance-workflow.service.spec.ts`, `advance-health.controller.ts`,
`backend/scripts/workflow-b/export-openapi.cjs`; OpenAPI output
`backend/src/advance/generated/openapi.json`. Consume B1–B5; produces validated
AdvanceWorkflow, per-wallet refund rights và AdvanceActionPreparation.

| Route prefix `/v1/advance` | Input / response |
|---|---|
| `/organizations/:id/campaigns` POST/GET | GiftDraft (title/channel/stages/tasks/criteria/budget/fundingDuration), expectedRevision khi update; metadata ID và draft |
| `/campaigns/:id` GET/PATCH | OWNER draft/frozen plan + workflow; public metadata chỉ ở public route |
| `/campaigns/:id/submission` POST/GET | revision → AdvanceSubmissionPlan; on-chain key association sau index |
| `/campaigns/:id/actions/prepare` POST | action enum/matched wallet/context/ref/reason/report/package/amount theo action → tx preparation hoặc blocking reason |
| `/campaigns/:id/stages/:stage/evidence` | draft/upload/freeze/redacted/original theo B4; auth trước file load, exact package version |
| `/internal/organizations/:id/verifications` POST | ADMIN verification/revocation record, căn cứ/reason/validUntil |
| `/internal/reviews` GET / `/:id/prepare` POST | queue + criterion decision/first eligibility/case context |
| `/public/campaigns` và `/:id` GET | public redacted B metadata/workflow, checkpoint, counters và next actor/action |
| `/refunds` và `/:id` GET | account-linked31338 wallets; baseConsumed/base claimable/supplement claimable/paid/S hiện tại; no PII/public entitlement leak |
| `/health` GET (B entry point) | protocol/deployment identity, RPC/storage/indexer states, lag/canonical timestamp; không secrets |

Action enum gồm các transactions §2.2; backend chỉ chuẩn bị, không ký private
key hoặc gửi thay account. Caller permissionless không bị biến thành resolver-
only bởi UI/API; có link trực tiếp thao tác timeout bằng ví linked để trả gas.

- [x] RED: wrong/stale account/wallet/deployment/ref/checkpoint blocked; indexer lag/RPC storage error distinct, HTTP/tx hash chưa granted financial state; reload trả current S và claimable kể cả COMPLETED/P0=0.
- [x] Implement API state/actions tại canonical checkpoint, deadlines/custody/report link đầy đủ; refresh chain guard lúc prepare, record không thay projection trước events. OpenAPI version0.2 cho B, schema/type generation nhất quán với JSON bigint strings.
- [x] GREEN schema+HTTP auth integration và backend suite/build; exported OpenAPI clients compile, response matches signature/types, original/public cache headers đúng.

## 5. F1–F6 — frontend cùng các khu vực hiện có

Giữ account login và wallet linking riêng; giữ organization workspace/internal/
public campaign dashboard, không tạo dashboard tổ chức thứ hai. B routes/data
typed theo `protocolKind=ADVANCE`, không gán số enum B vào journey labels A.

### F1 — chọn context/mạng, tạo gift plan

Create `frontend/src/lib/web3/deployment-context.ts`,
`frontend/src/lib/api/generated/advance.ts` (generate OpenAPI, không sửa tay),
`frontend/src/features/campaigns/advance/AdvanceCampaignWizard.tsx`,
`frontend/scripts/advance-context.test.mjs`, `advance-plan.test.mjs`.
Modify `frontend/vite.config.ts`, `frontend/tsconfig.app.json`, `AppProviders.tsx`,
`OrganizationWorkspace.tsx`, `CampaignWizard.tsx`, `frontend/package.json`.
Replace direct manifest imports trong `features/auth/AccountAccess.tsx`,
`features/explore/PublicCampaigns.tsx`, `MyContributions.tsx`, `DonatePanel.tsx`,
`RefundPanel.tsx`, `features/campaigns/CampaignJourney.tsx`,
`CampaignMilestoneActivation.tsx`, `CampaignSubmission.tsx` và những direct imports
còn lại tìm bằng rg, bằng boundary context A mặc
định và B explicit khi mode workflow-b; ABI A action giữ nguyên, B render component
riêng. Context/ABI alias trỏ generated source đã có, B thiếu artifact → build error.
Consumes B1/B2/B6 schema; produces typed draft/criteria/task UI và prepared plan.

- [x] RED: context A31337 chọn ABI A; B31338 chọn ABI B/RPC9547; kind/chain/code-policy mismatch reject. G1 one-stage INSTITUTION100 suất, G2 DIRECT three stages50; invalid amounts/channel/criteria/duplicate IDs block và server kiểm lại.
- [x] Implement chain31338 qua defineChain/Wagmi từ manifest, SIWE đúng B authChainId; wizard budget/tasks/checklist/channel rõ; frozen plan readonly; expectedRevision conflict reload, không silently sửa commitment.
- [x] GREEN context/wizard/action unit tests, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint` tại frontend. A default vẫn build và render cùng routes/actions theo tests hiện có.

### F2 — nhận vốn và transaction lifecycle

Create `frontend/src/lib/web3/advance-action.ts`,
`frontend/src/features/campaigns/advance/AdvanceWalletAction.tsx`,
`frontend/scripts/advance-action.test.mjs`; reuse wallet-proof/confirmation,
submission receipt/transaction-state/TransactionSteps primitives khi phù hợp.
Consumes AdvanceActionPreparation/C6 ABI; produces receipt-verified and indexed
action status, tx tracking key user+wallet+chain+deployment+campaign+stage+action.

- [x] RED: wrong account/linked wallet/chain/stage/plan/version/no eligibility/no custody/deadline/current case → disabled với lý do; wallet client RPC code/deploymentId mismatch cũng reject trước sign, không chỉ tin API RPC. Function/args phải đúng allowlisted action/ref/amount/recipient đang hiển thị, không nhận arbitrary calldata từ response.
- [x] RED: hash alone chưa success; receipt revert không completed; success cần matching B event/tuple/amount và confirmation rồi indexed canonical projection. Một advance/đợt, reload pending/tx replacement/cancel, popup timeout no-hash không tự gửi lặp hoặc giả thất bại chain.
- [x] Implement primary CTA nhận đúng budget đợt, tách last acceptance/next claim; fixed recipient, chain timestamp/deadline/checkpoint display; lưu public tx state và sync/recovery. Đổi account/ví/network clear quyền và query cache theo context trước hiển thị CTA.
- [x] Donate/return cần allowance riêng cho đúng configured token/contract/amount; approve receipt success rồi gửi donate/return, approve token chưa là contribution/return. Không bật unlimited approval theo mặc định, lỗi/replaced approve không tự gửi bước tiền tiếp.
- [ ] GREEN targeted và suite/build/lint; manual popup/sign/replacement chỉ ghi PASS sau thao tác người dùng.

### F3 — báo cáo và evidence

Create `frontend/src/features/campaigns/advance/AdvanceEvidence.tsx`,
`frontend/scripts/advance-evidence.test.mjs`; modify `OrganizationEvidence.tsx`
chọn workflowB view trong workspace hiện có. Consume B4 exact package/publicHash
và B6 action prepare; produces stage report/expenses/unused/submission/ref version.

- [x] RED: task completion không là advance mới; save/upload/freeze không là chain submission; stale version/package/criteria/stage block; amount đơn vị nhất quán, nguồn ORGANIZER tách excess và unused không tự thành return.
- [x] Implement từng criterion/document reference, original/redacted upload confirmation, version parent/history, remaining submission attempts/deadline; returnFunds CTA theo stage cùng panel evidence, actual receipt/indexed counters mới hiện đã trả.
- [x] GREEN UI helper/action test + suite/build/lint; failure storage/MIME/revision/version có lý do và reload/retry kiểm soát.

### F4 — staff/resolver workflow

Form organizer gửi/bổ sung hồ sơ và queue theo request chưa nằm trong F4 gốc;
xem OF1–OF2. Nhãn trạng thái tổ chức dùng chung đã sửa ngày2026-10-10 theo API,
có test list/profile; sửa nhãn không đồng nghĩa lifecycle mới đã có.

Create `frontend/src/features/review/AdvanceOrganizationVerification.tsx`,
`frontend/src/features/review/AdvanceReview.tsx`,
`frontend/scripts/advance-review.test.mjs`; modify `InternalArea.tsx` và
`MilestoneReview.tsx` chọn B view. Consume B3/B4/B6 queues/roles/ref;
produces verification/review/first eligibility/case intent và wallet actions F2.

- [x] RED: ADMIN verif có reason/source/validity, không tự OWNER verif; RESOLVER account sai SIWE wallet thấy queue nhưng không ký; conflict/current version/all criteria chưa MET chặn approve; INCONCLUSIVE không thành MET.
- [x] Implement review sources/private-public side-by-side, scope/limits, campaignSpent/unused, role và required wallet visible; MET/bổ sung/STOP rõ outcome; deadline case/material/response, CONTINUE không appeal hoặc cấp ngân sách lại.
- [x] GREEN helper/gating tests + suite/build/lint; chưa gọi reviewer experiment PASS từ form/gating tests.

### F5 — donor nhìn tiền/bằng chứng/phản đối

Create `frontend/src/features/explore/AdvanceCampaignDetail.tsx`,
`frontend/src/features/campaigns/advance/advance-journey.ts`,
`frontend/scripts/advance-journey.test.mjs`; modify `PublicArea.tsx`,
`CampaignJourney.tsx`, `MilestoneWorkflow.tsx` chọn B detail/journey cùng routes.
Consumes public B6 workflow/public bundles + contributor/ref checks;
produces public financial/timeline view và challenge/material actions qua F2.

- [x] RED: G1 sau advance hiển thị escrow0, G2 sau đợt2 escrow1100; total advanced không mislabeled nghiệm thu. Donor chưa góp/sai version/at challengeEnd không open case; active case khóa next claim; case already resolved không hiện appeal CTA.
- [x] Implement goal/C/A/R/F/E và current stage, ai phải làm gì, required wallet, chain deadlines/checkpoint/lag; public sanitized manifest/criteria/report/source và disclaimer scope gift. Ảnh/hash có thể đúng bytes nhưng sai nội dung, không gán proof of truth.
- [x] GREEN tests + suite/build/lint; anonymous chỉ đọc redacted public route tương ứng canonical publicHash, original endpoint yêu cầu auth/role. T18 outage nói rõ lỗi tầng và đường case/STOP theo version còn hiệu lực.

### F6 — terminal/refund/return muộn

Create `frontend/src/features/explore/AdvanceRefundPanel.tsx`,
`frontend/scripts/advance-refund.test.mjs`; modify `RefundPanel.tsx`,
`MyContributions.tsx` chọn B account-linked claim view. Consume B6 claimable,
P0/S/paid/baseConsumed và F2 receipts; produces refund/late-return history và CTA.

- [x] RED: G1 STOP P00 không hứa2200; G2 STOP pool1100; ví đã claim base không bị coi hết quyền khi S tăng; tiny units/dust không hiển thị toàn E là dust; last donor không nhận rounding của người khác.
- [x] Implement separate base+supplement rights, claimed amounts và retained obligations, terminal outcome tách refund state; zero current claimable hiển thị có thể đổi nếu return thêm; no expiry/sweep button; token/RPC error giữ retry semantics.
- [x] GREEN tests + suite/build/lint; donor account/wallet switch không hiển thị claim của người cũ, return/new indexed S tự refetch.

## 6. I1–I3 — tích hợp, failure và manual/research

### I1 — môi trường B và G1 xuyên các tầng

Create `infra/workflow-b/compose.yaml`, `backend/scripts/workflow-b/start-services.ps1`,
`backend/scripts/workflow-b/seed-local.cjs`, `journey-smoke.cjs`,
`frontend/scripts/advance-manual-setup.mjs`, `docs/workflow-b-local-runbook.md`.
Thư mục ignored `.local/workflow-b/` lưu env/state/receipts/test outputs; fixture
PDF/PNG mới có schema/current identity/hashes, giữ draft dataset lịch sử.
Consume C6/B1–B6/F1–F6; produce G1 local journey và operating instructions.

- [x] Start helpers kiểm exact resolved target/path, port listener và manifest identity; Anvil state native Linux riêng `~/.local/state/fundtogether/workflow-b/anvil`, backup Windows `.local/workflow-b/anvil/`; atomic save và validate identity sau restart. Chỉ stop process handle do B helper tạo.
- [x] Compose B volume/port/DB/bucket riêng, không prune/delete/migrate A; seed tài khoản synthetic ADMIN/resolver/organizer/two donors và draft. Sau lỗi manual ngày2026-10-09, seed không tự SIWE-link ví Anvil hoặc mint: người dùng chọn/liên kết ví trước, nạp riêng đúng địa chỉ. Không private key/password trong artifact công khai.
- [x] G1 flow: organization verify → draft/freeze → resolver approve → public/donate → fresh first eligibility → claim2200 → files/freeze/public/submission → criterion MET → challenge window/finalize → COMPLETED. Đối chiếu every receipt/log/checkpoint/token balances, không settlement payout lần hai.
- [x] GREEN contract+backend+frontend relevant suites/build; automated G1 record concrete environment/evidence trong acceptance, manual T chưa tự PASS.

### I2 — G2 và T03–T18 bất thường

Extend `journey-smoke.cjs`, `indexer-smoke.cjs`; create
`backend/scripts/workflow-b/recovery-smoke.cjs`, `acceptance-report.cjs`.
Không chạy nhiều smoke chung env B song song. Consume G1 stack;
produce G2/failure/return/refund/replay/storage recovery receipts và reproducible report.

- [x] G2 budgets1100/1100/1100, one advance mỗi stage; missing→version2 không cấp lại; MET/CONTINUE/RESUBMIT/STOP/timeout; G2 dừng sau đợt2 P01100 và G1 dừng sau full advance P00; final stage vẫn substantive review.
- [x] Test return50 trước/sau snapshot; return110 sau A/B đã claim base; tiny base units/refund permutations, failed token-transfer retry; inspect actual C+R=A+F+E và per-pool entitlement/custody.
- [x] Real replay/duplicate/reorg/reset, crash checkpoint, storage unavailable/freeze failure/MIME/hash/PII auth, RPC/indexer lag/recover; chain/DB/file backups restore cùng identity và checkpoints. Record handles + state trước/sau, không restart node vì chỉ poll timeout.
- [x] GREEN từng automated case khi có receipt/event/balance/projection/file evidence. Nếu thiếu môi trường hoặc fail phải ghi FAIL/TODO + nguyên nhân, không thay nhãn/giảm case để goal DONE.

### I3 — MetaMask và thực nghiệm reviewer

Update `docs/workflow-b-acceptance.md`, G1/G2 examples và progress/runbook.
Consume runnable B stack, neutral-ID fixtures/reference mapping, T01–T18 definitions;
produce actual user acceptance và research outcomes với nguồn/giới hạn.

- [ ] Chuẩn bị network31338/RPC9547, tài khoản/role/fixture/runbook và màn action gating trước khi yêu cầu thao tác người dùng; wallet extension ký do người dùng làm. Cần G1/G2/STOP/refund với organizer/resolver/hai donor và popup/decline/reload/account switch.
- [ ] Reviewer nhận neutral-ID bundles với nhãn tách riêng; record actual decision và criterion reason; tham chiếu nhãn độc lập nếu có người đánh giá, ghi số mẫu/nguồn/tính độc lập. T07 wrong acceptance vẫn có thể là chain transaction valid; không sửa label cho đẹp tỷ lệ.
- [ ] Record gas/tx count, exposure trước nghiệm thu, organizer working capital, human/chain/indexer timings, correctness và false acceptance riêng. So sánh A/B trên assumptions chung, không dùng vài local PASS để gọi B tối ưu.
- [ ] Audit từng deliverable GOAL và T01–T18 từ receipt/block/log/chain balances/DB replay/files/UI/manual artifacts; chỉ goal DONE khi không còn required item thiếu hoặc chưa chứng minh. Code build/automated PASS không tự là manual/production approval.

## 7. Task onboarding bổ sung — triển khai từ 2026-10-10

Thiết kế, dữ liệu/API, quyền, migration và O01–O12 nằm trong
[kế hoạch onboarding](./workflow-b-organization-onboarding-plan.md).
Sau lượt bổ sung thiết kế/task, người dùng yêu cầu “thế tiếp tục goal thôi”.
Đã triển khai OB1–OB3/OF1–OF2 và kiểm thử tự động; OI1 còn nghiệm thu người dùng.

- [x] **OB1 — Schema/migration/history:** additive DB B, một yêu cầu mở/org, snapshot trong request + audit append-only; tách org/request status và timestamps; không bảng profile version/submissions; test dữ liệu cũ và constraints.
- [x] **OB2 — Organizer request/files:** draft/save/upload/submit/cancel/gửi lại bằng request mới; OWNER ACL; backend khóa mọi đường sửa field/file khi UNDER_REVIEW; giữ nội dung lịch sử; test retry/storage failure.
- [x] **OB3 — ADMIN decisions/API:** APPROVE/REQUEST_CHANGES/REJECT, không sửa hộ/tự duyệt; atomic audit/verification, cancel-review concurrency/idempotency; OpenAPI/HTTP tests.
- [x] **OF1 — Organizer UI:** form hiện tại, timeline audit, bổ sung/hủy/gửi lại; không v1/v2/v3; hiển thị riêng trạng thái yêu cầu và hiệu lực xác minh; test reload/error/submit gating.
- [x] **OF2 — ADMIN UI:** queue request đã gửi, đọc snapshot/file, ba kết luận và audit; test quyền/request đang xét/expiry.
- [ ] **OI1 — Onboarding integration/manual:** O01–O12 và G1 dùng verification sinh từ request; tách tự động khỏi thao tác OWNER/ADMIN thật.

OB1–OB3/OF1–OF2 có bằng chứng trong acceptance: migration0014/0015 giữ dữ liệu
cũ, HTTP/storage/concurrency và component/browser tests. OI1 IN_PROGRESS:
G1/G2 dùng request-bound verification đã PASS; thao tác OWNER/ADMIN của người
dùng và I3 MetaMask/reviewer vẫn TODO.

Thứ tự: review thiết kế → OB1 → OB2 → OB3 → OF1 → OF2 → OI1.
Giữ I3/F2 chưa hoàn thành; không đổi các tick gốc để che phần thiếu onboarding.

## 8. Review và tiến độ

### Chốt goal triển khai — 2026-10-11

Người dùng chọn “Hoàn tất goal triển khai; giữ nghiệm thu thành giai đoạn sau,
chưa đạt.” Phần triển khai đã duyệt hoàn tất; goal triển khai DONE theo GOAL.md.
Các ô F2/I3/OI1 còn mở giữ nguyên để theo dõi phần nghiệm thu con người, không
chặn đóng phạm vi triển khai và không được hiểu là đã PASS. Điều kiện audit
gộp cả nghiệm thu ở mục I3 áp dụng cho giai đoạn nghiệm thu toàn hệ thống sau.
Kiểm chứng bàn giao: frontend157/157, backend166/166, contract281/281,
frontend B build/lint PASS; trình duyệt F4–F6 API giả lập33 kiểm tra PASS.

### Điều phối và sửa lỗi sau thao tác thử — 2026-10-10

Cập nhật 2026-10-11: người dùng yêu cầu “bỏ qua block”. Manual/reviewer chuyển
sang nghiệm thu sau, giữ TODO; không dùng việc thiếu kết quả này để chặn đợt
hoàn thiện kỹ thuật đang tiếp tục. Không thay điều kiện tiền/quyền trong sản phẩm.

Người dùng hoãn nghiệm thu thủ công để tiếp tục hoàn thiện triển khai. F2/I3/OI1
giữ phần manual TODO; không dùng chúng để chặn công việc kỹ thuật đã được duyệt.

- [x] ADMIN-only vào `/internal` mở hàng chờ xác thực tổ chức; điều hướng chỉ đánh dấu trang hiện tại.
- [x] Hàng chờ có nút “Xem hồ sơ”, bộ lọc rõ ràng và làm mới chủ động; giải thích bản nháp chưa vào hàng chờ.
- [x] Hàng chờ tự cập nhật mỗi 10 giây khi đang mở; hồ sơ UNDER_REVIEW tự đọc kết luận mới. Bản nháp không cập nhật định kỳ để giữ nội dung chưa lưu; lỗi đọc dừng tự thử lại. Regression và trình duyệt API giả lập đã kiểm tra việc nhận kết luận và giữ bản nháp.
- [x] Liên kết mang organizationId và requestId để mở đúng lần gửi, kể cả khi lọc lịch sử; ID không tồn tại không quay về hồ sơ mới nhất. Không hiện quyết định duyệt cho yêu cầu lịch sử.
- Bằng chứng: frontend 155/155, onboarding 18/18, build B/lint PASS; trình duyệt API giả lập 5 kiểm tra PASS, không ghi tài khoản hoặc blockchain thật. Đây không phải nghiệm thu người dùng.

Quy tắc pilot B-D01–B-D10 và kế hoạch code đã được người dùng duyệt theo
GOAL.md: triển khai thứ tự C1→C6→B1→B6→F1→F6→I1→I3; các lựa chọn
kỹ thuật nhỏ thực hiện tự chủ, không hỏi tiếp ở mỗi task. Nếu review phát hiện
đổi quyền/tiền thì trình rõ delta thay vì âm thầm đổi spec.

Contract C1–C6 đã kiểm regression/invariant/artifact/deployment. Backend B1–B6
và F1–F6 đã có code/test; G1/G2, failure/waiting/refund HTTP journey, recovery
và so sánh contract A/B trên fork riêng đã PASS. I3 manual/reviewer còn thiếu.
Các task kỹ thuật đã đối chiếu với ledger được đánh dấu; bullet F2 gộp kiểm tra
manual và I3 vẫn để mở cho phần chưa có bằng chứng. Xem ledger trong PROJECT_PROGRESS
cho command/output và trạng thái mới nhất; không dùng ghi chú lúc lập kế hoạch
để suy ra trạng thái runtime. Baseline dataset14 tests dùng để kiểm số học,
không thay thế contract/integration/manual verification. Ghi ledger trong PROJECT_PROGRESS và
acceptance sau từng task; không tự commit/push hoặc đánh dấu bước chưa làm DONE.
