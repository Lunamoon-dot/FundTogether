# FundTogether VNext — Protocol Specification V1

**Tên nghiên cứu:** Stake-Backed Multi-Court Milestone Verification for
Decentralized Crowdfunding
**Trạng thái:** Proposed Research Protocol — chưa phê duyệt triển khai public
chain
**Ngày:** 20/10/2026
**Baseline nghiên cứu:** FundTogether Campaign, financial policy
`campaigns-local-escrow-v6`

> **Repository adoption note:** Đây là bản đặc tả chi tiết được đưa vào repo
> để làm nguồn tham khảo versioned cho hướng thuần phi tập trung. Nó thay thế
> Resolver/Admin làm authority trong target design, nhưng không biến code hiện
> tại thành protocol đã triển khai. Những giá trị ghi là minh họa hoặc “chưa
> chốt” phải được version hóa trong financial policy trước khi viết contract.

## 1. Mục tiêu và phạm vi

FundTogether VNext là giao thức crowdfunding cho phép các địa chỉ ví tạo
campaign, đóng góp vốn và tham gia xác minh milestone thông qua staking.

Tài sản đóng góp được giữ trong smart contract escrow. Creator không có quyền
nhận tiền chỉ vì funding thành công. Quyền payout được tạo ra khi milestone
đáp ứng điều kiện hợp đồng và nhận phán quyết hợp lệ từ decentralized jury.

Mục tiêu của protocol:

- thay thế thẩm quyền quyết định tài chính của Centralized Resolver;
- cho phép cộng đồng tham gia xét duyệt bằng cách khóa stake;
- sử dụng nhiều court, mỗi court gồm ba Judge, và majority hai tầng;
- khuyến khích phán quyết nhất quán bằng reward/slashing có quy tắc công khai;
- hỗ trợ appeal với jury mới, không trùng người xét xử;
- chỉ giải ngân sau milestone verification;
- không tạo nghĩa vụ refund vượt tài sản escrow thực tế;
- có đường kết thúc công khai khi không thể đạt phán quyết.

Giới hạn prototype V1: digital comics/artbooks, một gói STANDARD, PDF,
MockUSDC trên Anvil chain `31339`. Mở rộng loại tài sản, NFT, KYC và public
chain deployment không thuộc phạm vi bắt buộc của V1.

## 2. Các quyết định cơ chế của target protocol

Các nguyên tắc sau là hướng thiết kế được chấp nhận khi chuyển sang pure
decentralized protocol:

| ID | Quy tắc |
| --- | --- |
| P01 | Mọi ví hợp lệ có thể tạo campaign mà không cần Resolver phê duyệt. |
| P02 | Ví góp vốn trở thành Backer của campaign. |
| P03 | Người muốn đánh giá phải tham gia staking. |
| P04 | Protocol có thể sử dụng số court tối đa tạo được từ eligible Judges, subject to gas/batch policy. |
| P05 | Mỗi court có đúng ba Judge. |
| P06 | Judge được phân court bằng quy tắc random được xác minh trên-chain hoặc primitive được policy chấp nhận. |
| P07 | Mỗi Judge có một phiếu; lượng stake không nhân trọng số phiếu. |
| P08 | Court PASS khi có ít nhất hai phiếu PASS; tầng tổng hợp dùng số court. |
| P09 | Minimum stake phụ thuộc giá trị và rủi ro của milestone. |
| P10 | Judge bỏ phiếu trái substantive final ruling chỉ bị slash khi policy đã định nghĩa coherence slashing. |
| P11 | Slash được phân phối theo quy tắc công khai cho Judge cùng phía với final ruling, nếu policy cho phép. |
| P12 | Backer có thể trở thành Judge của campaign đã góp vốn, nếu không bị conflict rule loại. |
| P13 | Creator không được làm Judge bằng chính creator wallet của campaign. |
| P14 | Base Jury Pool và Appeal Jury Pool tách biệt ở cấp review case. |
| P15 | Appeal sử dụng jury mới và có giới hạn số vòng. |
| P16 | Không có phán quyết sau retry tối đa: protocol fail và refund escrow còn lại theo policy. |
| P17 | Creator được sửa và nộp lại milestone trong giới hạn số lần/deadline. |
| P18 | Partial refund dựa trên escrow còn lại, phân phối pro-rata cho Backer. |
| P19 | Không có Admin/Resolver override kết quả vote hoặc chuyển tiền. |
| P20 | Mọi financial transition dựa trên canonical on-chain state. |

P01–P20 mô tả hướng protocol. Chúng không tự chốt các giá trị trong mục 19,
không chứng minh contract hiện tại đã đáp ứng, và không biến stake thành bằng
chứng về sự thật của evidence.

## 3. Actors và trust boundaries

### 3.1. Creator

Creator có thể:

- tạo và công bố campaign với commitment được khóa;
- xác định milestone và payout allocation trước funding;
- nộp evidence và yêu cầu jury review;
- appeal phán quyết bất lợi khi đủ điều kiện;
- nộp lại milestone khi còn quyền correction;
- claim payout sau khi contract xác nhận đủ điều kiện.

Creator không thể sửa acceptance criteria của milestone đã được tài trợ, chọn
Judge, thay thế final ruling hoặc rút tiền trực tiếp khỏi escrow.

### 3.2. Backer

Backer có thể:

- góp vốn trong funding period;
- theo dõi milestone, evidence và phán quyết;
- tham gia staking để xét xử, kể cả campaign đã đóng góp, nếu đủ điều kiện;
- mở appeal trong thời hạn và khi đáp ứng appeal bond/fee policy;
- claim phần refund có thể thanh toán.

Quyền refund phải dựa trên contribution canonical on-chain, không phụ thuộc
danh sách người dùng do backend tự tạo.

### 3.3. Judge

Judge có thể:

- stake vào Base Pool hoặc Appeal Pool;
- opt-in cho review case;
- được snapshot, chọn và phân court;
- commit/reveal vote;
- nhận reward hoặc chịu slash theo policy;
- rút stake sau khi nghĩa vụ liên quan kết thúc.

Judge không được xuất hiện hai lần trong một review round hoặc đồng thời tham
gia Base và Appeal của cùng một case.

### 3.4. Backend và Admin

Backend cung cấp đọc, lưu trữ, tìm kiếm, hiển thị, transaction relay/recovery
và index projection. Admin có thể vận hành Web2 infrastructure.

Không backend, Admin, database row hay private operator key nào được quyền
quyết định kết quả financial transition. Campaign vẫn tồn tại on-chain kể cả
khi website không hiển thị nó. Không được yêu cầu backend approval để gọi
payout/refund đã hợp lệ theo contract.

## 4. Campaign commitment và milestone model

Trước khi funding mở, Creator phải khóa:

- địa chỉ ví nhận payout;
- supported asset, funding goal và funding deadline;
- điều kiện thành công/thất bại;
- danh sách milestone theo thứ tự;
- mục tiêu và acceptance evidence của từng milestone;
- payout amount và deadline từng milestone;
- policy review, appeal, correction và refund;
- protocol version và parameter set.

Mỗi milestone có tối thiểu:

```text
Milestone
- milestoneId
- campaignId
- commitmentHash
- acceptanceCriteriaHash
- evidenceHash
- payoutAmount
- submissionDeadline
- revisionCount
- reviewCaseId
- status
- amountReleased
```

Ví dụ campaign goal 1.000 MockUSDC:

| Milestone | Deliverable | Payout |
| --- | --- | ---: |
| M1 | Storyboard đã cam kết | 200 |
| M2 | Bộ trang minh họa hoàn thiện | 300 |
| M3 | Final PDF và quyền nhận sản phẩm | 500 |

Tổng payout không vượt funding goal. Nếu overfunding được giữ lại, surplus
phải có accounting riêng và không được tự động vượt milestone budget.

Acceptance criteria không được sửa sau funding để hợp thức hóa evidence không
đạt. Mọi evidence revision phải tham chiếu commitment ban đầu và có hash/revision
identity riêng.

## 5. Judge eligibility và dynamic staking

### 5.1. Registry và enrollment

Judge có thể stake bất cứ lúc nào. Staking toàn cục không mặc nhiên bắt buộc
ví đó review mọi campaign. Judge phải chủ động đăng ký trong enrollment window,
khóa đủ case stake và chấp nhận nghĩa vụ vote.

```text
Eligible(j,m,r) =
  Registered
  AND OptedIn
  AND S_j >= S_min(m)
  AND ConflictCheck
  AND Available
```

`ConflictCheck` dựa trên địa chỉ và lịch sử tham gia có thể xác minh on-chain;
nó không phải chứng minh một ví đại diện cho một con người.

### 5.2. Risk-adjusted minimum stake

Thiết kế thử nghiệm:

```text
S_min(m) = max(S_0, alpha_risk(m) * B_m)
```

Trong đó `S_0` là stake floor, `B_m` là milestone payout và `alpha_risk` là
risk coefficient được xác định trước enrollment. Ví dụ minh họa: payout 1.000,
floor 10, coefficient 5%, minimum case stake 50 USDC/Judge.

Các giá trị ví dụ chưa phải production parameter. Risk classification phải dựa
trên tiêu chí công bố trước; Creator không được tự giảm risk bằng một field
không được kiểm chứng.

Stake dư không làm tăng số phiếu, xác suất chọn hoặc tỷ lệ slash/reward.

### 5.3. Stake accounting

```text
Deposited_j = Available_j + Locked_j
Withdrawable_j <= Available_j
```

Stake và reviewer fee accounting tách khỏi contribution escrow. Không dùng cùng
một stake collateral cho nhiều case nếu tổng reservation vượt deposited balance.

## 6. Court formation

### 6.1. Eligibility snapshot

Khi enrollment kết thúc, protocol đóng băng:

- eligible wallet list;
- case stake đã khóa;
- pool và case identity;
- snapshot block/timestamp;
- randomness request/seed identifier.

Ví đến sau snapshot không tham gia round đó.

### 6.2. Số court

Với `N` eligible Judges:

```text
K = floor(N / 3)
```

Protocol sử dụng `3K` Judges để tạo `K` court. Nếu không đủ ba Judge thì
không tạo court và không được tạo PASS.

| Eligible Judges | Courts | Assigned | Not assigned |
| ---: | ---: | ---: | ---: |
| 2 | 0 | 0 | 2 |
| 4 | 1 | 3 | 1 |
| 8 | 2 | 6 | 2 |
| 9 | 3 | 9 | 0 |
| 30 | 10 | 30 | 0 |
| 300 | 100 | 300 | 0 |

Judge không được chọn không bị slash. Khi cần thay trước commit, chỉ dùng
quy tắc replacement đã khóa; không thay Judge sau reveal, mà xử lý invalid/retry.

Multi-court phải hỗ trợ batch hoặc pull-claim settlement; không được phụ thuộc
vòng lặp không giới hạn trong một transaction.

### 6.3. Randomness

Seed phải được xác định sau eligibility snapshot và không do backend đơn phương
chọn. Prototype có thể dùng deterministic mock randomness trong Foundry; public
deployment phải đánh giá primitive tương thích network.

Contract hoặc verifier phải kiểm tra uniqueness, eligibility, court size và
thuật toán phân nhóm. Danh sách backend gửi lên không tự động là assignment
đáng tin cậy.

### 6.4. Không đủ Judge

Nếu `N < 3`, review chuyển `RETRY_PENDING` nếu còn retry; hết retry chuyển
`PROTOCOL_FAIL`. Deadline và retry count được freeze trong case policy; backend
không được tùy ý gia hạn.

## 7. Commit–reveal voting

Mỗi Judge commit hash ràng buộc:

```text
chainId
protocolVersion
campaignId
milestoneId
evidenceRevision
reviewCaseId
roundId
courtId
judgeAddress
vote
salt
```

`vote` chỉ là `PASS` hoặc `FAIL`. Commit phase không nhận plaintext vote.
Judge reveal vote và salt trước deadline.

Contract phải ngăn:

- commit nhiều lần nếu policy không cho replacement;
- reveal khác commitment;
- reveal thay Judge khác;
- reuse commitment giữa các round;
- vote từ address không được assignment.

### 7.1. Court validity

Quy tắc V1 đề xuất: cả ba Judge phải reveal đúng hạn để court hợp lệ. Court
thiếu reveal là `INVALID`; review round chứa court invalid chuyển retry, không
tự giảm mẫu số để loại bỏ court bất lợi.

Đây là trade-off nghiên cứu: bảo toàn cấu trúc ba phiếu nhưng tăng liveness
risk. Quorum 2/3 là biến thể cần được đánh giá riêng, không tự động coi là
quy tắc V1.

### 7.2. Court và multi-court aggregation

Court hợp lệ:

```text
PASS/PASS/FAIL -> PASS
PASS/FAIL/FAIL -> FAIL
PASS/PASS/PASS -> PASS
FAIL/FAIL/FAIL -> FAIL
```

Tầng tổng hợp theo số court:

```text
FinalPass  iff PassCourts > K / 2
FinalFail  iff FailCourts > K / 2
Tie        iff PassCourts = FailCourts
```

`TIED` không phải substantive FAIL. Protocol retry theo policy. Kết quả court
là đơn vị biểu quyết tầng hai; không được đổi sang đếm tổng Judge vote mà không
đổi `policyVersion`.

## 8. Base review, appeal và final ruling

```text
EVIDENCE_SUBMITTED
        ↓
BASE_ENROLLMENT
        ↓
JURY_ASSIGNED
        ↓
COMMIT → REVEAL → AGGREGATE
                       ↓
                 PROVISIONAL_RULING
                       ↓
                   APPEAL_WINDOW
                    /          \
          Appeal hợp lệ      Hết hạn
                 ↓              ↓
          APPEAL_REVIEW     FINAL_RULING
```

Appeal chỉ mở khi requester có quyền, appeal bond/review fee đủ, còn appeal
round, đủ điều kiện tạo jury mới và chưa hết thời hạn.

Base Pool và Appeal Pool là hai tập Judge tách biệt trong cùng case. Judge đã
ở Base không được xét Appeal; Judge đã ở một Appeal không được xét Appeal round
tiếp theo của cùng case. Appeal round mới dùng eligible Judge chưa từng tham gia
case tại snapshot mới.

Một accepted appeal không tự động đảo verdict; jury mới phải hoàn tất vote.
Không hình thành hoặc không hoàn tất appeal sau retry tối đa thì `PROTOCOL_FAIL`.

Phải phân biệt:

| Kết quả | Ý nghĩa |
| --- | --- |
| `FINAL_PASS` | Substantive PASS đã hết khả năng appeal. |
| `VERDICT_FAIL` | Substantive FAIL đã hết khả năng appeal. |
| `PROTOCOL_FAIL` | Không tạo được phán quyết hợp lệ sau retry/timeout. |

`PROTOCOL_FAIL` là failure của khả năng vận hành, không phải bằng chứng Creator
làm sai hay Judge vote sai. Nó không tự kích hoạt minority slashing.

## 9. Slashing và reward distribution

### 9.1. Minority slash

Chỉ coherence-slash khi final ruling có substantive value `PASS` hoặc `FAIL`:

```text
Slash_j = floor(lambda * S_locked,j)  if Vote_j != FinalRuling
           0                           otherwise
```

`lambda` phải được freeze trước enrollment và chỉ áp dụng trên case stake bị
khóa, không phải toàn bộ tài sản Judge gửi vào registry.

Minority vote không tự chứng minh misconduct. Slashing chỉ được thực thi khi
đúng điều kiện policy và không vượt locked stake.

### 9.2. Redistribution và fees

Gọi `L` là tổng slash, `W` là số Judge có valid vote cùng final ruling:

```text
RewardSlash_j = floor(L / W)
```

Dust phải theo quy tắc cố định, không để Admin tùy ý chiếm dụng.

Tách ba dòng accounting:

1. reviewer service fee cho review hợp lệ;
2. slash redistribution từ Judge bị slash sang nhóm nhất quán;
3. appeal bond cho chi phí/rủi ro appeal.

Creator phải tài trợ base review budget tách khỏi Backer escrow. Appeal requester
tài trợ appeal theo policy. Snapshot phải khóa trước khi tính tổng phí; nếu fee
budget không đủ thì không mở voting.

### 9.3. Non-reveal

Non-reveal có thể mất participation fee. Nếu có substantive final ruling,
penalty có thể phân phối cho phía final ruling. Nếu chỉ có `PROTOCOL_FAIL`, không
minority slash; cash penalty cho no-show phải có policy riêng trước triển khai.

## 10. Milestone correction

Creator được resubmit khi final ruling là `VERDICT_FAIL` nếu chưa vượt correction
limit/deadline, milestone chưa payout, và không đổi payout amount hoặc acceptance
criteria. Mỗi revision có evidence hash và case identity mới để chống replay.

Một FAIL không mặc nhiên kết thúc campaign nếu còn correction allowance. Hết
allowance/deadline thì campaign terminal failure và mở refund escrow còn lại.
`PROTOCOL_FAIL` đi theo terminal failure fail-closed, không tạo quyền sửa vô hạn.

## 11. Payout và escrow solvency

### 11.1. Payout conditions

Milestone chỉ payout khi đồng thời:

- funding thành công;
- commitment/evidence revision khớp;
- có `FINAL_PASS`;
- không còn appeal hợp lệ hoặc đang xử lý;
- milestone chưa payout;
- payout không vượt budget đã khóa;
- campaign chưa terminal/refunding;
- escrow đủ số tiền.

Ví nhận payout là Creator wallet đã khóa trong commitment; không đổi ví tại thời
điểm payout.

### 11.2. Financial conservation

Đặt:

```text
R = tổng contribution nhận được
P = tổng payout thành công
F = tổng refund thành công
E = contribution còn trong escrow
```

Bất biến:

```text
R = P + F + E
P <= Goal
sum(MilestonePaid) <= Goal
```

Nếu overfunding:

```text
Surplus = max(0, R - Goal)
```

Surplus không tự động là ngân sách thưởng thêm cho Creator; policy phải định rõ
accounting và claim.

### 11.3. Partial refund

Khi terminal sau partial payout, contract chụp refund snapshot. Với contribution
`c_i` và total contribution `R`:

```text
RefundPool = R - P
Refund_i   = floor(RefundPool * c_i / R)
```

Quyền refund tính theo snapshot cố định, không phụ thuộc thứ tự claim. Rounding
dust phải có quy tắc deterministic; tổng quyền refund không vượt pool.

### 11.4. Funding failure

Nếu goal chưa đạt và chưa payout:

```text
P = 0
RefundPool = R
```

Mỗi Backer nhận đủ contribution đã xác nhận on-chain. Không áp dụng partial-loss
policy khi chưa có payout.

## 12. State machines

### Campaign

```text
CREATED
   ↓
FUNDING
   ├── GOAL_FAILED → REFUNDING → REFUND_SETTLED
   └── FUNDED
          ↓
     MILESTONES_RUNNING
       ├── ALL_MILESTONES_PAID → COMPLETED
       └── TERMINAL_FAILURE → REFUNDING_REMAINDER
```

### Milestone

```text
PENDING → SUBMITTED → REVIEW_ENROLLMENT → BASE_REVIEW
                                      ├── INVALID/TIE → RETRY_PENDING
                                      └── PROVISIONAL_PASS/FAIL
                                                ↓
                                           APPEAL_WINDOW
                                                ↓
                                           FINAL_RULING
                                         /       |        \
                                      PASS      FAIL    PROTOCOL_FAIL
                                       ↓         ↓           ↓
                                    PAYABLE  CORRECTION   TERMINAL
                                       ↓         /   \
                                      PAID  RESUBMIT  TERMINAL
```

### Judge participation

```text
AVAILABLE_STAKE → CASE_LOCKED → ASSIGNED → COMMITTED → REVEALED
                                                     ↓
                                           FINAL_SETTLEMENT
                                             ↓       ↓
                                          REWARD   SLASH/UNLOCK
```

Mỗi transition phải có actor, guard, deadline, event và failure behavior. Không
được để hai transition cùng chi tiêu escrow amount hoặc settle cùng Judge
position hai lần.

## 13. Smart contract architecture

### `CampaignEscrowVNext.sol`

Phụ trách permissionless campaign creation, frozen commitments, contribution
ledger, funding finalization, evidence references, payout theo final review,
terminal failure, pro-rata refund và surplus settlement.

### `JuryRegistry.sol`

Phụ trách Base/Appeal pool registration, stake deposit/reservation/withdrawal,
eligibility snapshot, conflict rules, slash accounting và claimable rewards.

### `JuryReview.sol`

Phụ trách review case/revision, assignment, voting windows, commit/reveal,
court/multi-court aggregation, appeal, retry/timeout và final result.

Các contract phải giới hạn quyền gọi lẫn nhau. `CampaignEscrowVNext` chỉ nhận
review authorization từ JuryReview instance đã được cấu hình/verify, không tin
địa chỉ contract tùy ý. Aggregation/settlement phải batch hoặc pull-based để
tránh unbounded loop.

Đây là decomposition thiết kế, không phải tuyên bố các contract này đã tồn tại
trong checkout.

## 14. Canonical events tối thiểu

```text
CampaignCreated
ContributionReceived
FundingFinalized
MilestoneEvidenceSubmitted
JudgeStakeDeposited
JudgeEnrolled
JurySnapshotFinalized
CourtAssigned
VoteCommitted
VoteRevealed
CourtFinalized
ReviewRoundFinalized
AppealOpened
AppealRoundFinalized
FinalRulingEstablished
JudgeSlashed
JudgeRewardClaimed
MilestoneRevisionSubmitted
MilestonePaid
CampaignRefundsOpened
BackerRefundClaimed
CampaignCompleted
```

Review event phải có campaign, milestone, evidence revision, case, round và
court identifiers. Indexer xử lý canonical events idempotently; không suy luận
payout từ số vote nằm trong PostgreSQL.

## 15. Edge cases và failure conditions

| ID | Tình huống | Kết quả yêu cầu |
| --- | --- | --- |
| E01 | Chỉ có 1–2 Judge | Không tạo court; retry rồi protocol fail. |
| E02 | Có 4–5 Judge | Random chọn 3; Judge dư không bị slash. |
| E03 | Có 6 Judge, hai court trái kết quả | `TIED`, không payout. |
| E04 | Có 300 Judge | 100 court; batch để tránh vượt gas. |
| E05 | Judge không commit | Invalid/retry theo policy. |
| E06 | Commit nhưng không reveal | Không đếm vote; xử lý no-show và invalid. |
| E07 | Reveal sai salt | Revert, không tính vote. |
| E08 | Judge có hai assignment | Assignment invalid. |
| E09 | Creator vote bằng creator wallet | Không đủ điều kiện case đó. |
| E10 | Creator dùng ví khác | Protocol không phát hiện chắc chắn Sybil. |
| E11 | Backer vừa góp vốn vừa vote | Được phép nếu đủ stake/conflict policy. |
| E12 | Base và Appeal trùng Judge | Không được phép. |
| E13 | Appeal đảo verdict | Settlement theo final substantive ruling. |
| E14 | Appeal thiếu Judge/quorum | Retry; quá giới hạn thành `PROTOCOL_FAIL`. |
| E15 | Minority đúng thực tế nhưng thua majority | Có thể bị slash; đây là limitation. |
| E16 | Không có substantive ruling | Không minority slash. |
| E17 | Resubmit cùng evidence revision | Không tạo payout mới. |
| E18 | Hai payout transaction cạnh tranh | Tối đa một giao dịch thành công. |
| E19 | Milestone sau fail khi milestone trước paid | Chỉ refund escrow còn lại. |
| E20 | Backer claim refund hai lần | Claim thứ hai revert. |
| E21 | Evidence sai hash/không truy cập được | Không tuyên bố hợp lệ; timeout/retry. |
| E22 | Randomness provider không phản hồi | Timeout rồi fail-closed. |
| E23 | Review fee không đủ khi snapshot đóng | Không mở vote; timeout/refund. |
| E24 | ERC20 transfer thất bại | Revert toàn bộ financial transition. |

## 16. Threat model và giới hạn đã biết

- **Sybil:** uniform wallet selection không phải uniform human selection; một
  tác nhân có vốn có thể chia nhiều ví.
- **Collusion:** nhóm kiểm soát đủ ghế có thể tạo verdict sai; staking không
  tự chứng minh collusion resistance.
- **Bribery:** commit–reveal che vote trước reveal nhưng không loại bỏ bribery
  hoặc khả năng chứng minh vote sau reveal.
- **Liveness:** Judge không reveal hoặc appeal thiếu người có thể trì hoãn;
  retry hữu hạn tạo terminal path nhưng không bảo đảm payout đúng sự thật.
- **Evidence availability:** SHA-256 chứng minh bytes khớp commitment, không
  chứng minh authorship, quality, delivery hay truth. Private backend storage
  vẫn có thể gây cản trở availability.
- **Economic attacks:** stake concentration có thể thao túng court distribution,
  review cost và appeal pressure.

Review fee, minimum stake và slashing phải được đánh giá cùng nhau. Không suy ra
an toàn toàn hệ thống từ một tham số riêng lẻ.

## 17. Protocol invariants

**I1 — Conservation**

```text
Raised = CreatorPaid + Refunded + Escrowed
```

**I2 — Milestone payout uniqueness:** mỗi milestone payout tối đa một lần.

**I3 — Payout authorization:** không payout nếu thiếu `FINAL_PASS` của đúng
evidence revision.

**I4 — Stake coverage:** tổng case stake bị khóa của Judge không vượt deposited
stake khả dụng.

**I5 — Judge uniqueness:** một Judge không có hai ghế trong round và không tham
gia Base lẫn Appeal trong cùng case.

**I6 — Court integrity:** mỗi court có chính xác ba Judge duy nhất; court invalid
không được tính như có verdict.

**I7 — Slashing bound:** tổng slash không vượt locked stake; một position không
bị slash nhiều lần.

**I8 — Finality:** Creator, Admin và backend không chỉnh sửa final ruling.

**I9 — Refund solvency:** tổng refund quyền chưa claim không vượt refund pool
snapshot.

**I10 — Terminal liveness:** sau retry/deadline tối đa, bất kỳ caller nào cũng
có thể kích hoạt terminal transition theo policy đã khóa.

## 18. Experimental design

### Baselines

- B0: immediate payout crowdfunding;
- B1: centralized Resolver;
- B2: flat-majority jury cùng số Judge;
- B3: multi-court hierarchical majority;
- B4: multi-court với coherence-based slashing;
- B5: multi-court với appeal và risk-adjusted stake.

### Independent variables

Eligible Judge count, wallet concentration, minimum stake, slash rate, Judge
accuracy, Judge correlation, non-reveal rate, appeal rounds và milestone payout
size.

### Metrics

False PASS/FAIL, attack success probability, review completion, finality
latency, gas per review, cost per case, capital locked per payout, reward
inequality, refundable proportion và invariant violation count.

### Hypotheses

- H1: multi-court và flat-majority có xác suất verdict khác nhau khi cùng số
  Judge;
- H2: wallet selection nhạy cảm với Sybil concentration;
- H3: coherence slashing có thể tăng vote conformity nhưng không nhất thiết
  tăng truth accuracy;
- H4: milestone-gated escrow giảm tiền Creator nhận trước nghiệm thu;
- H5: appeal có thể sửa verdict sai nhưng tăng cost và liveness risk.

Đây là giả thuyết cần kiểm chứng, không phải kết luận an toàn.

## 19. Parameter registry — chưa chốt

| Parameter | Giá trị minh họa |
| --- | --- |
| Judge enrollment window | 48 giờ |
| Commit window | 24 giờ |
| Reveal window | 24 giờ |
| Appeal window | 48 giờ |
| Maximum appeal rounds | 2 |
| Maximum retries mỗi cấp | 2 |
| Maximum milestone correction | 1 |
| Minimum stake floor | 10 MockUSDC |
| Risk multiplier | 1–5% milestone payout |
| Minority slash rate | 5% case stake |
| Review service fee | Chưa xác định |
| Appeal bond | Chưa xác định |
| Protocol fee | Chưa xác định |

Toàn bộ giá trị trên là input mô phỏng. Trước implementation phải chốt stake
asset, fee funding, randomness, quorum/no-show, correction, appeal, surplus,
evidence availability và multi-court aggregation trong một policy versioned;
phải chạy sensitivity analysis.

## 20. Acceptance criteria trước implementation

Specification chỉ sẵn sàng chuyển sang contract design khi:

- mọi financial transition có precondition và postcondition;
- không có payout và refund cùng chi tiêu một nguồn tiền;
- eligibility snapshot và court assignment có thể xác minh;
- có finality/timeout không phụ thuộc Admin;
- appeal pool định nghĩa chính xác không trùng Judge;
- coherence slashing không chạy trước substantive finality;
- cash penalty khi chỉ có `PROTOCOL_FAIL` đã được chốt;
- reviewer fee funding khi court count không giới hạn đã được chốt;
- evidence availability requirements đã được chốt;
- Foundry invariant tests kiểm chứng I1–I10;
- simulation so sánh multi-court/flat-majority có và không có slashing.

## Kết luận

FundTogether VNext V1 là specification của permissionless, stake-backed,
multi-court milestone escrow protocol. Thiết kế ưu tiên quy tắc công khai và
phi tập trung trong quyết định tài chính, nhưng chưa có bằng chứng chống Sybil,
collusion, bribery hoặc bảo đảm chất lượng verdict. Những đặc tính đó là đối
tượng thực nghiệm; chúng không được mô tả như tiền đề đã được chứng minh.
