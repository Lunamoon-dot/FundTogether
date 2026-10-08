# FundTogether v0.2 — Development Process & MVP Roadmap

> **Điều chỉnh ưu tiên 2026-10-06 — đã được người dùng chốt:** nán lại MVP để
> nghiên cứu nghiệp vụ và củng cố workflow. Roadmap bên dưới giữ giá trị về thứ
> tự phụ thuộc; không yêu cầu lập tức làm reputation, verifier riêng, committee,
> slash, AI hay Arc sau khi test local chạy được. Đọc
> [kế hoạch củng cố và cổng chuyển giai đoạn](../../docs/business-validation-and-mvp-hardening.md)
> và [policy milestone MVP mới nhất](../../docs/mvp-milestone-completion.md).
> Các giả định dòng tiền/bond trong tư liệu phải được đối chiếu với mô hình
> giải ngân sau evidence của code hiện tại trước khi dùng làm kết luận thực tế.

> **Quyết định phạm vi mới nhất (2026-10-04):** MVP dùng resolver được cấp quyền,
> sau các bước kiểm tra hệ thống. Hội đồng 2/3 và ResolverManager để post-MVP.
> Các đoạn chọn 2/3 cho MVP bên dưới thuộc quyết định cũ, đã được thay thế;
> phần cơ chế hội đồng chỉ còn là tài liệu tham khảo cho post-MVP.

> **Goal:** Xây FundTogether theo đúng dependency của hệ thống, ưu tiên protocol correctness và financial safety trước UI.  
> **Project type:** Donation-based charitable crowdfunding  
> **Core model:** Milestone Escrow + Maximum-Exposure Bond + Evidence Verification + Challenge Governance + Refund + Reputation

> **Workflow xác nhận 2026-10-04:** Campaign qua hệ thống kiểm tra hồ sơ/toàn
> vẹn/tiêu chí và sửa trước khi nộp cho resolver/nhân viên có quyền duyệt rồi
> publish. Evidence/challenge có kiểm tra ở cả hai đầu, giải trình và kiểm tra
> lại; chỉ tranh chấp còn chưa giải quyết hoặc đến hạn escalation mới tới
> resolver phân xử. Resolver thuộc MVP; hướng hội đồng 2/3 dành cho phân xử.
> Đối chiếu [workflow cập nhật](../FundTogether_Verification_and_Dispute_Design_2026-10-03.md)
> khi đọc các ví dụ prototype phía dưới.

---

# 0. Nguyên tắc làm dự án

FundTogether không nên phát triển theo kiểu:

```text
Làm frontend trước
→ mock API
→ làm backend
→ cuối cùng mới nhét blockchain vào
```

Cách này dễ dẫn tới việc business logic nằm sai layer và smart contract bị ép phải chạy theo UI đã xây sẵn.

Thứ tự đúng nên là:

```text
Domain Rules
   ↓
Protocol Specification
   ↓
State Machine + Invariants
   ↓
Smart Contract Core
   ↓
Contract Tests / Security
   ↓
Backend + Blockchain Sync
   ↓
Evidence Storage
   ↓
Frontend Integration
   ↓
MVP End-to-End
   ↓
Security / Research Evaluation
```

Một rule quan trọng:

> **Nếu một quyết định làm thay đổi cách tiền được giữ, release, refund hoặc slash thì phải chốt ở protocol trước khi viết UI.**

---

# Mốc 1 — Protocol & MVP Definition

Đây là mốc đầu tiên và quan trọng nhất.

**Chưa cần làm UI hoàn chỉnh. Chưa cần viết nhiều API. Chưa nên bắt đầu bằng campaign page đẹp.**

Mục tiêu của mốc này là biến FundTogether từ:

```text
"một ý tưởng khá rõ"
```

thành:

```text
"một protocol có rule cụ thể và có thể implement/test được"
```

---

## 1.1 Chốt Actor Model

Phải xác định chính xác các actor:

```text
Organizer
Donor
Beneficiary
Verifier
Vendor
Resolver
Protocol Admin
```

Với mỗi actor cần xác định:

```text
Actor được làm gì?
Actor không được làm gì?
Action nào cần wallet?
Action nào chỉ cần Web2 account?
Action nào cần role on-chain?
```

Ví dụ:

```text
Organizer
├── create campaign
├── lock bond
├── submit evidence
└── request milestone settlement

Donor
├── donate
├── inspect evidence
├── challenge
└── claim refund

Verifier
├── review evidence
└── submit attestation
```

---

## 1.2 Chốt On-chain vs Off-chain

Đây là decision bắt buộc trước khi code.

### On-chain nên giữ

```text
campaign identity
organizer wallet
goal
deadline

milestone budgets
milestone state

donation balances
bond

released amount
remaining amount

evidence hash / commitment
challenge state

refund entitlement
critical financial events
```

### Off-chain nên giữ

```text
campaign title / long description
images
beneficiary profile

invoice files
bank documents
photos / videos
private evidence

search metadata
comments
notifications

reputation display metadata
```

Rule:

> **Blockchain giữ critical financial truth và immutable commitments. PostgreSQL giữ application/query data.**

---

## 1.3 Chốt State Machine

Trước khi viết contract phải có state machine chính thức.

Baseline:

```text
CREATED
   ↓
FUNDING
  /     \
FAIL    FUNDED
 |         |
REFUND     ↓
       MILESTONE_ACTIVE
             ↓
       EVIDENCE_SUBMITTED
             ↓
         REVIEW_WINDOW
          /        \
         /          \
 VERIFIED         CHALLENGED
    |                 |
    |              DISPUTE
    |              /     \
    |            PASS    FAIL
    |              |       |
    ↓              ↓       ↓
NEXT_MILESTONE ←───┘    CANCELLED
    |
    ↓
COMPLETED
```

Không chỉ vẽ sơ đồ.

Mỗi transition phải có bảng:

| From | Action | Caller | Preconditions | To | Financial Effect |
|---|---|---|---|---|---|
| FUNDING | finalizeFunding | anyone | deadline passed | FUNDED/FAILED | none |
| MILESTONE_ACTIVE | submitEvidence | organizer | milestone active | REVIEW | none |
| REVIEW | challenge | eligible actor | within window | CHALLENGED | challenge recorded |
| REVIEW | settle | anyone | window expired, no challenge | VERIFIED | unlock next state |

---

## 1.4 Chốt Bond Rule

Baseline hiện tại:

\[
RequiredBond = \alpha \times MaximumUnverifiedExposure
\]

MVP có thể dùng:

\[
\alpha = 1
\]

và nếu mỗi milestone được pre-funded toàn bộ:

\[
RequiredBond = \max(MilestoneBudget_i)
\]

Phải chốt thêm:

```text
Bond lock lúc nào?
Bond dùng token nào?
Bond có cùng asset với donation không?
Bond trả khi nào?
Default có slash không?
Fraud có slash không?
Ai có quyền kết luận default/fraud?
```

---

## 1.5 Chốt Refund Rule

MVP cần một rule refund duy nhất, không mơ hồ.

Ví dụ:

```text
Campaign không đạt goal:
→ donor nhận lại 100% contribution

Campaign fail giữa chừng:
→ chỉ refund phần remaining pool

Verified milestones:
→ không reverse

Unused / unreleased amount:
→ được đưa vào refundable pool
```

Nếu refund theo tỷ lệ:

\[
Refund_i
=
RefundPool
\times
\frac{EligibleContribution_i}
{TotalEligibleContribution}
\]

Cần định nghĩa `EligibleContribution`.

---

## 1.6 Chốt Evidence Model

Không cần giải quyết "truth tuyệt đối".

MVP chỉ cần:

```text
EvidenceRecord
├── milestoneId
├── type
├── documentHash
├── storagePointer
├── submittedAt
└── submitter
```

Có thể support evidence type:

```text
INVOICE
BANK_PROOF
PHOTO
VIDEO
VENDOR_DOCUMENT
BENEFICIARY_CONFIRMATION
OTHER
```

Important:

```text
Evidence submitted
≠
Evidence verified
≠
Real-world truth
```

---

## 1.7 Chốt Challenge Model

Đây là một trong các phần chưa nên code vội nếu rule chưa rõ.

MVP cần trả lời:

```text
Ai được challenge?
Challenge có mất phí/stake không?
Một milestone được challenge bao nhiêu lần?
Challenge window kéo dài bao lâu?
Challenge xong ai resolve?
Nếu không resolve thì sao?
Donor có vote không?
Verifier có authority bao nhiêu?
```

MVP có thể bắt đầu bằng một resolver role đơn giản.

Sau này research version mới mở rộng:

```text
multi-verifier
community vote
challenge stake
reputation-weighted dispute
```

Không cần giải tất cả trong MVP.

---

## 1.8 Chốt Protocol Invariants

Đây là phần bắt buộc.

Ví dụ:

### Fund Safety

\[
Released_i \le Budget_i
\]

### Refund Safety

\[
Refunded_i \le RefundEntitlement_i
\]

### Bond Safety

\[
LockedBond \ge RequiredBond
\]

trong active exposure period.

### State Ordering

```text
Milestone i+1
không thể active
nếu milestone i chưa resolve
```

### No Double Settlement

```text
1 milestone
→ tối đa 1 final settlement
```

### Funding Failure

```text
Raised < Goal
sau deadline
→ organizer không thể unlock milestone
```

---

# 1.9 Output của Mốc 1

Mốc 1 chỉ được coi là xong khi team có:

```text
protocol-spec.md
state-machine.md
financial-rules.md
threat-model-v0.2.md
mvp-scope.md
```

Và trả lời được:

```text
Tiền đang ở đâu tại mỗi state?
Ai có thể gọi action tiếp theo?
Action đó làm thay đổi tiền thế nào?
Nếu transaction bị gọi 2 lần thì sao?
Nếu actor không hoạt động thì sao?
Nếu campaign fail thì tiền đi đâu?
```

---

# 1.10 Những câu hỏi team cần chốt trước khi sang Mốc 2

Đây là các câu hỏi hiện tại vẫn có thể làm thay đổi architecture.

## Q1 — Asset

Donation MVP dùng:

```text
MockUSDC / ERC20 stablecoin
```

hay support cả native ETH?

**Khuyến nghị MVP:** chỉ ERC20 / MockUSDC.

---

## Q2 — Bond Asset

Bond có bắt buộc dùng cùng token với donation không?

Ví dụ:

```text
Donation = USDC
Bond = USDC
```

sẽ đơn giản hơn nhiều.

---

## Q3 — Milestone Funding

Khi milestone bắt đầu:

### A

```text
release toàn budget milestone → organizer
```

hay:

### B

```text
milestone vault
→ controlled withdrawals / expense requests
```

Option B an toàn hơn nhưng implementation phức tạp hơn.

---

## Q4 — Resolver

Ai duyệt campaign sau kiểm tra và ai phân xử dispute được chuyển lên trong MVP?

Có thể chọn:

```text
Nhân viên được cấp quyền resolver theo policy
```

cho MVP.

Campaign luôn qua kiểm tra/sửa hồ sơ trước resolver. Dispute qua kiểm tra
challenge, giải trình và re-verification trước escalation. Người verify vụ việc
không phân xử chính vụ đó. Hướng hội đồng 2/3 và các policy chưa chốt xem tài liệu
Dispute Policy; không tự đổi threshold bằng ví dụ một ví của prototype.

---

## Q5 — Challenge Eligibility

Ai được challenge?

```text
Any donor?
Only donors of that campaign?
Any verified account?
```

---

## Q6 — Failure Classification

MVP có cần phân biệt đầy đủ:

```text
FAILURE
DEFAULT
FRAUD
```

hay MVP chỉ cần:

```text
NORMAL_FAILURE
MISCONDUCT
```

để giảm complexity?

---

## Q7 — Refund

Khi campaign fail giữa chừng:

```text
RemainingPool
```

refund theo:

```text
original contribution ratio
```

hay theo:

```text
unconsumed contribution accounting
```

Hai model này khác nhau nếu có partial milestone release.

---

## Q8 — Evidence Privacy

MVP evidence sẽ:

```text
public only
```

hay đã support:

```text
private evidence
+ access-controlled storage
```

Private evidence sẽ kéo thêm auth/storage complexity.

---

# Mốc 2 — Smart Contract Core

Sau khi protocol được khóa, ưu tiên smart contract trước backend/frontend vì contract là nơi chứa critical financial state.

Không viết tất cả contract ngay.

Làm theo vertical core.

---

## 2.1 Contract đầu tiên: Single Campaign Prototype

Không cần bắt đầu bằng:

```text
CampaignFactory
BondManager
EvidenceRegistry
ChallengeManager
10 contracts khác nhau
```

Bắt đầu bằng một contract:

```text
Campaign.sol
```

chứa đủ flow:

```text
create
fund
finalize
activate milestone
submit evidence hash
challenge
resolve
refund
complete
```

Mục tiêu:

> chứng minh state machine và accounting chạy đúng.

Sau khi rule ổn mới refactor module.

---

## 2.2 Feature Order trong Contract

Ưu tiên:

```text
1. Campaign config
2. Donation
3. Funding goal + deadline
4. Failed funding refund
5. Bond lock
6. Milestones
7. Sequential activation
8. Evidence commitment
9. Review/challenge
10. Settlement
11. Mid-project cancellation
12. Remaining-fund refund
13. Bond return/slash
```

Không làm reputation on-chain trước.

---

## 2.3 Test trước khi thêm feature tiếp

Mỗi feature phải có test.

Ví dụ sau khi làm donation:

```text
donate succeeds
zero donation fails
donation after deadline fails
donation accounting correct
```

Sau milestone:

```text
cannot activate M2 before M1
cannot release above budget
cannot settle twice
```

---

# Mốc 3 — Contract Hardening

Chỉ bắt đầu sau khi happy path chạy hết.

Mục tiêu:

```text
unit tests
fuzz tests
invariant tests
access-control tests
reentrancy tests
edge cases
gas measurements
Slither
```

Important invariants phải được encode thành tests.

Mốc này giúp trả lời:

> Contract chạy được chưa?

khác với:

> Contract có đủ an toàn để làm nền cho phần còn lại không?

---

# Mốc 4 — Backend Foundation

Khi ABI và event model đã tương đối ổn mới xây backend nghiêm túc.

Backend MVP cần:

```text
Auth
Wallet linking / SIWE

Campaign metadata
Milestone metadata
Evidence metadata

File upload
Blockchain event synchronization

Challenge metadata
Basic reputation history
```

Không cần ngay:

```text
advanced analytics
recommendation system
complex admin dashboard
social features
```

---

# Mốc 5 — Blockchain Indexing & Sync

Đây là một mốc riêng, không nên coi là "chi tiết backend".

Phải giải quyết:

```text
Contract Event
     ↓
Indexer
     ↓
PostgreSQL
     ↓
API
     ↓
Frontend
```

Events minh họa theo prototype; danh sách đầy đủ trong docs/protocol-spec.md:

```text
CampaignCreated
DonationReceived
FundingFinalized
BondLocked

MilestoneActivated
EvidenceSubmissionCreated
VerifierAssigned
SubmissionVerified
SubmissionRejected
ChallengeOpened
MilestoneSettled

RefundPoolSnapshotted
RefundClaimed

BondReturned
CampaignCompleted
```

Phải xử lý:

```text
duplicate event
retry
confirmation
reorg awareness
sync checkpoint
idempotency
```

---

# Mốc 6 — Evidence Pipeline

Sau khi backend + contract sync ổn mới làm evidence flow đầy đủ.

MVP:

```text
Organizer selects file
        ↓
Backend issues upload URL
        ↓
File → object storage
        ↓
Calculate hash
        ↓
Evidence metadata → DB
        ↓
Hash commitment → contract
        ↓
Contract event
        ↓
Indexer confirms
```

Frontend phải phân biệt:

```text
UPLOAD SUCCESS
```

và:

```text
ON-CHAIN EVIDENCE COMMITTED
```

Đây là hai state khác nhau.

---

# Mốc 7 — Frontend Vertical MVP

Không làm toàn UI một lần.

Làm theo **end-to-end user journey**.

## Journey 1 — Organizer

```text
Connect/Login
   ↓
Create Campaign
   ↓
Define Milestones
   ↓
Lock Bond
   ↓
Publish
```

## Journey 2 — Donor

```text
View Campaign
   ↓
Connect Wallet
   ↓
Approve Token
   ↓
Donate
   ↓
View Donation
```

## Journey 3 — Milestone

```text
Organizer activates milestone
   ↓
Submit evidence
   ↓
Review window
   ↓
Challenge / no challenge
   ↓
Settlement
```

## Journey 4 — Failure

```text
Campaign fails
   ↓
Refund available
   ↓
Donor claims refund
```

Nếu 4 journey này chạy end-to-end thì đã có MVP thực sự.

---

# Mốc 8 — MVP Definition

MVP FundTogether **không cần mọi feature của v0.2**.

MVP tối thiểu nên có:

## Organizer

```text
create campaign
define milestones
lock required bond
submit evidence
see milestone status
```

## Donor

```text
view campaign
donate
view contribution
inspect public evidence
challenge milestone
claim refund
```

## Protocol

```text
goal
deadline
funding finalization

milestone sequencing
maximum-exposure bond

evidence hash commitment
review window
challenge

milestone settlement

campaign cancellation
remaining-fund refund

bond return / misconduct settlement
```

## Backend

```text
user account
wallet linking

campaign metadata
evidence metadata
file storage

contract event indexing
```

## UI

```text
campaign list
campaign detail
campaign creation flow
organizer dashboard
donor dashboard
milestone/evidence page
refund page
```

---

# Những thứ KHÔNG cần cho MVP

Có thể làm sau:

```text
dynamic reputation scoring
complex badge system

multi-verifier consensus
community voting

AI fraud detection

private evidence encryption system hoàn chỉnh

advanced organization KYC

multiple stablecoins

cross-chain

DAO governance

mobile app

social feed

recommendation engine
```

---

# Mốc 9 — Reputation Layer

Sau MVP.

Lúc này mới bổ sung:

```text
campaigns completed
milestones verified
disputes
upheld challenges
total funds managed
account age
badges
```

Không nên để reputation block MVP.

Reputation cần dữ liệu lịch sử; làm trước khi protocol chạy ổn không mang nhiều giá trị.

---

# Mốc 10 — Research / Experiment Layer

Sau khi system behavior ổn mới xây experiment.

Có thể nghiên cứu:

```text
milestone granularity
vs
bond requirement

bond ratio
vs
financial exposure

challenge governance
vs
mandatory voting

review-window duration
vs
liveness / risk

evidence strength
vs
false acceptance
```

Metrics:

```text
Maximum Exposure Ratio

Collateral Efficiency

False Acceptance Rate

False Rejection Rate

Governance Overhead

Gas Cost

Refund Accuracy

Campaign Liveness
```

---

# Dependency Graph

```text
             THREAT MODEL
                  │
                  ↓
          PROTOCOL SPECIFICATION
                  │
        ┌─────────┼──────────┐
        │         │          │
        ↓         ↓          ↓
 State Machine  Accounting  Evidence Rules
        │         │          │
        └─────────┼──────────┘
                  ↓
           SMART CONTRACT
                  │
                  ↓
        CONTRACT TEST / SECURITY
                  │
             ABI + EVENTS
             /         \
            /           \
           ↓             ↓
       BACKEND        FRONTEND WEB3
           │             │
           ↓             │
       INDEXER           │
           │             │
           ↓             │
      POSTGRESQL         │
           │             │
           └──────┬──────┘
                  ↓
             FRONTEND MVP
                  │
                  ↓
             END-TO-END MVP
                  │
                  ↓
        RESEARCH / EXPERIMENT
```

---

# Priority Rule

Khi phân vân "feature nào làm trước?", dùng rule:

### P0 — Financial correctness

```text
escrow
bond
refund
milestone release
accounting
```

Làm trước tất cả.

### P1 — Protocol liveness

```text
deadline
finalize
challenge timeout
settlement
failure path
```

### P2 — Evidence integrity

```text
hash
version
storage
metadata
```

### P3 — Web2 reliability

```text
auth
indexing
sync
retry
DB
```

### P4 — User experience

```text
dashboard
notifications
search
polish
```

### P5 — Reputation / advanced features

Làm sau MVP.

---

# Definition of Done cho một Feature

Một feature FundTogether không được coi là xong chỉ vì UI chạy.

Ví dụ `Refund` chỉ DONE khi:

```text
[ ] Protocol rule documented
[ ] Contract implemented
[ ] Happy-path test
[ ] Failure-path test
[ ] Double-call test
[ ] Fuzz/invariant impact checked
[ ] Event emitted
[ ] Indexer sync
[ ] Backend exposes data
[ ] Frontend handles pending/success/failure
```

Đây nên là definition-of-done chung của project.

---

# Recommended First Concrete Work

Không bắt đầu bằng toàn bộ hệ thống.

Work item đầu tiên nên là:

> **FundTogether Protocol Specification v0.3**

Nó phải chứa:

```text
1. Actors
2. Campaign fields
3. Milestone fields
4. States
5. State transitions
6. Bond formula
7. Refund formula
8. Challenge rule
9. Failure/default/fraud rule
10. On-chain/off-chain ownership
11. Contract invariants
12. Event list
```

Sau khi spec này ổn:

> Viết `Campaign.sol` prototype + Foundry tests.

Đó là điểm bắt đầu implementation thực sự.

---

# Các quyết định cần team trả lời trước implementation

Trước khi khóa Protocol Specification, cần chốt ít nhất:

1. **MVP chỉ dùng ERC20/MockUSDC hay support ETH?**
2. **Bond có dùng cùng token với donation không?**
3. **Milestone release full budget trước hay controlled withdrawal?**
4. **Ai resolve dispute trong MVP?**
5. **Ai được challenge milestone?**
6. **Challenge có stake/fee không?**
7. **Failure classification MVP cần 2 hay 3 trạng thái?**
8. **Mid-project refund accounting theo rule nào?**
9. **MVP evidence public-only hay có private evidence ngay?**
10. **Verifier là optional evidence source hay mandatory?**

Các câu trả lời này nên được chốt trước khi contract architecture được freeze.

---

# Final Development Order

```text
1. Protocol Specification
      ↓
2. State Machine + Financial Invariants
      ↓
3. Single Campaign Contract Prototype
      ↓
4. Foundry Unit / Fuzz / Invariant Tests
      ↓
5. Contract Refactor + Events / ABI Freeze
      ↓
6. Backend Foundation
      ↓
7. Blockchain Indexer + DB Sync
      ↓
8. Evidence Storage Pipeline
      ↓
9. Frontend Vertical Journeys
      ↓
10. End-to-End MVP
      ↓
11. Security Hardening
      ↓
12. Reputation
      ↓
13. Research Experiments
```

> **MVP không phải là "có nhiều màn hình".**
>
> MVP của FundTogether là một vòng đời campaign hoàn chỉnh:
>
> `Create → Fund → Reach Goal → Milestone → Evidence → Review/Challenge → Settle → Next Milestone → Complete`
>
> và đồng thời phải có failure path:
>
> `Funding Fail / Campaign Cancel → Refund → Bond Settlement`

Khi hai đường này chạy đúng end-to-end, FundTogether mới thực sự có một MVP đáng tin cậy.

---

# MVP Decision Baseline — cập nhật 2026-10-03

Baseline cũ đã được đối chiếu code và các quyết định mới. Các phương án học ở
phần trên không ghi đè bảng này. Backend metadata/schema/auth và FE nền có thể
chuẩn bị song song; journey tài chính chỉ tích hợp slice đã thống nhất.

| Nội dung | Baseline hiện tại | Bằng chứng / giới hạn |
|---|---|---|
| Mạng | Anvil local; Arc testnet ưu tiên; Arc production candidate | Chưa deploy Arc |
| Token | Local MockUSDC; Arc trial dự kiến ERC20 USDC precompile | Native gas cùng balance, khác đơn vị |
| Goal/bond | Goal = tổng budgets; bond = budget lớn nhất | Có code |
| Milestone | Tuần tự; activate không release, settle mới release | Có code nhánh không challenge |
| Funding | Đạt goal sớm vào FUNDED; cancel chỉ trước FUNDED | Có code |
| Verifier | Mandatory admission, version/hash, assignment | AccessControl có code; không optional |
| Review | 72 giờ từ verifier accept | Có code; admin duration chưa hỗ trợ |
| Resolver | Prototype deployer approval; target arbitration 2/3 | Committee đã chọn, chưa có code |
| Evidence | Restricted originals + public redactions | Parser nền có; upload/report chưa có |
| Refund | Pre-FUNDED full snapshot/pull claims | Post-FUNDED/slash OPEN |
| Failure/timeout | DEFAULT không tự đồng nghĩa MISCONDUCT | Taxonomy, appeals, no-quorum/recovery OPEN |
| Indexer | Protocol events, checkpoint/idempotency, Arc finality | Chưa chạy |
| Reputation/research | Sau MVP | Chưa triển khai |

Safe execution, EIP-712, mã hóa end-to-end, bank conversion, cross-chain và nhiều
token vẫn hoãn. Committee 2/3 không phải Safe và đã chuyển sang post-MVP.

Đọc [bảng rà 10 mốc](../FundTogether_Milestone_Review_2026-10-03.md) và
[Arc evaluation](../FundTogether_Arc_Evaluation_v0.1.md). Trạng thái triển khai
được ghi ở docs/PROJECT_PROGRESS.md; kế hoạch trong tài liệu này không phải
bằng chứng tính năng đã hoàn tất.
