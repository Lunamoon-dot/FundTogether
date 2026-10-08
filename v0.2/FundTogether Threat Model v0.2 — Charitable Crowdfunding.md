# FundTogether Threat Model v0.2

> **Quyết định phạm vi mới nhất (2026-10-04):** MVP dùng resolver được cấp quyền,
> sau các bước kiểm tra hệ thống. Hội đồng 2/3 và ResolverManager để post-MVP.
> Các đoạn chọn 2/3 cho MVP bên dưới thuộc quyết định cũ, đã được thay thế;
> phần cơ chế hội đồng chỉ còn là tài liệu tham khảo cho post-MVP.

## 1. System Definition

> **Bổ sung đánh giá 2026-10-03:** [Verification và dispute theo tầng](./FundTogether_Verification_and_Dispute_Design_2026-10-03.md)
> phân tích verifier có thể kiểm duyệt challenge, phản đối sát hết review, vòng
> resubmit vô hạn, xung đột lợi ích và resolver inactivity. Mỗi stage chờ cần
> timeout/fallback. Hội đồng 2/3 không tự bảo đảm độc lập hoặc ngăn thông đồng.
> Đây là hướng thiết kế được đánh giá, không phải mitigation đã triển khai.

FundTogether là một **blockchain-based charitable crowdfunding protocol** hỗ trợ các chiến dịch từ thiện giải ngân theo từng milestone thay vì chuyển toàn bộ donation cho organizer ngay khi campaign đạt funding goal.

FundTogether tập trung vào bốn thành phần chính:

\[
\boxed{
Milestone\ Escrow
+
Evidence\ Verification
+
Organizer\ Bond
+
Challenge\ Governance
}
\]

Ngoài ra, hệ thống duy trì một **non-financial reputation layer** để ghi nhận lịch sử hoạt động của organizer và donor.

Mục tiêu của FundTogether không phải loại bỏ hoàn toàn trust.

Mục tiêu là:

> Giảm mức độ tin tưởng đơn phương cần đặt vào người tổ chức chiến dịch bằng các cam kết on-chain, kiểm soát giải ngân, bằng chứng có thể audit và lịch sử accountability.

---

# 2. Domain

FundTogether không phải:

```text
Investment crowdfunding
Equity crowdfunding
Token sale
Profit-sharing platform
```

FundTogether là:

```text
Donation-based charitable crowdfunding
```

Donor đóng góp tiền mà không kỳ vọng:

```text
equity
interest
financial return
revenue share
profit token
```

Do đó terminology sử dụng trong hệ thống là:

```text
Creator      → Organizer
Investor     → Donor
Project      → Charity Campaign
Backer       → Donor
```

---

# 3. Main Actors

## 3.1 Organizer

Cá nhân hoặc tổ chức tạo và điều hành chiến dịch từ thiện.

Organizer chịu trách nhiệm:

```text
define campaign
define milestones
estimate budgets
submit evidence
request milestone settlement
report expenses
```

Organizer có thể honest hoặc malicious.

---

## 3.2 Donor

Người đóng góp tài chính cho campaign.

Donor:

```text
donates funds
can inspect evidence
can challenge suspicious milestones
may receive refund of unused funds
```

Donor không nhận lợi nhuận tài chính từ campaign.

---

## 3.3 Beneficiary

Người hoặc tổ chức nhận lợi ích từ hoạt động từ thiện.

Ví dụ:

```text
students
patients
disaster victims
schools
local communities
```

Beneficiary không nhất thiết trực tiếp quản lý campaign.

---

## 3.4 Vendor

Bên cung cấp hàng hóa hoặc dịch vụ.

Ví dụ:

```text
construction contractor
medical supplier
food supplier
transport provider
```

Vendor có thể là nguồn evidence nhưng không mặc định trusted.

---

## 3.5 Verifier

Actor hoặc organization có nhiệm vụ xác nhận một số loại evidence.

Ví dụ:

```text
bank verification
organization verification
beneficiary confirmation
invoice verification
third-party audit
```

Verifier không được mặc định là hoàn toàn trustworthy.

---

## 3.6 Protocol

Smart contracts quản lý:

```text
campaign state
donations
escrow
milestone budgets
bond
refunds
evidence commitments
challenge state
reputation events
```

---

# 4. Core Security Objective

FundTogether cần bảo vệ năm tài sản chính.

### Donation Safety

Donation không được giải ngân ngoài rule đã định trước.

### Organizer Fairness

Organizer không bị mất bond chỉ vì project thất bại ngoài ý muốn.

### Fund Traceability

Các khoản tiền đã giải ngân phải liên kết được với milestone và evidence tương ứng.

### Refund Safety

Donation chưa sử dụng phải có thể hoàn trả khi campaign kết thúc sớm.

### Evidence Integrity

Evidence đã submit không được âm thầm thay thế sau đó.

---

# 5. Trust Model

FundTogether không giả định:

```text
Organizer = honest
Donor = honest
Verifier = honest
Vendor = honest
```

Threat model xét:

\[
MaliciousOrganizer
\]

\[
MaliciousDonor
\]

\[
MaliciousVerifier
\]

\[
Organizer + Vendor\ Collusion
\]

\[
Organizer + Verifier\ Collusion
\]

\[
Donor\ Griefing
\]

---

# 6. On-chain Facts vs Off-chain Claims

Đây là trust boundary quan trọng nhất.

## 6.1 On-chain Facts

Smart contract có thể xác minh trực tiếp:

```text
donation amount
campaign balance
milestone budget
bond balance
deadline
wallet address
challenge submitted
refund amount
milestone state
evidence hash
timestamp
```

Ví dụ:

\[
CampaignBalance=500M
\]

là dữ liệu contract có thể kiểm tra.

---

## 6.2 Off-chain Claims

Blockchain không thể tự xác định:

```text
invoice có thật không
hàng hóa có thực sự được giao không
giá hàng hóa có hợp lý không
beneficiary có thực sự nhận hỗ trợ không
vendor có liên quan organizer không
ảnh/video có phản ánh đúng sự kiện không
```

Do đó:

\[
Evidence\ Submitted
\neq
RealWorld\ Truth
\]

FundTogether cung cấp:

\[
EvidenceBackedTransparency
\]

không phải:

\[
PerfectRealWorldVerification
\]

---

# 7. Campaign Model

Một campaign gồm:

```text
Campaign
│
├── organizer
├── beneficiary information
├── fundingGoal
├── fundingDeadline
├── milestones[]
├── organizerBond
├── evidence policy
└── status
```

Campaign parameters cốt lõi phải được commit trước khi campaign bắt đầu.

---

# 8. Milestone Model

Mỗi milestone:

```text
Milestone {
    budget
    deadline

    description
    deliverables
    acceptanceCriteria

    requiredEvidence
    status

    releasedAmount
    remainingAmount
}
```

Ví dụ:

```text
Campaign:
Build classrooms

Goal:
500,000,000 VND

Milestone 1:
Site preparation
Budget: 50M

Milestone 2:
Purchase construction materials
Budget: 120M

Milestone 3:
Structural construction
Budget: 110M

Milestone 4:
Finishing
Budget: 90M

Milestone 5:
Equipment + handover
Budget: 130M
```

---

# 9. Organizer Bond Model

FundTogether không yêu cầu organizer cọc toàn bộ campaign goal.

Nếu:

\[
CampaignGoal=500M
\]

và:

\[
Milestones=
\{50M,120M,110M,90M,130M\}
\]

thì:

\[
MaxMilestone=130M
\]

Với collateral ratio:

\[
\alpha=1
\]

required bond:

\[
Bond=130M
\]

không phải:

\[
Bond=500M
\]

---

# 10. Maximum Exposure Bond

Generalized:

\[
B=\alpha E_{max}
\]

Trong đó:

- \(B\): required organizer bond.
- \(\alpha\): collateral ratio.
- \(E_{max}\): maximum unverified fund exposure.

Nếu toàn bộ milestone fund được pre-funded:

\[
E_{max}=\max(M_1,M_2,...,M_n)
\]

nên:

\[
\boxed{
B=\alpha\max(M_i)
}
\]

Baseline:

\[
\alpha=100\%
\]

Do đó:

\[
\boxed{
Bond=\max(MilestoneBudget)
}
\]

---

# 11. Reusable Bond

Bond không được lock lại cho từng milestone.

Một khoản bond được sử dụng xuyên suốt campaign.

```text
Organizer locks 130M

        ↓

Milestone 1
Exposure = 50M

        ↓ verified

Milestone 2
Exposure = 120M

        ↓ verified

Milestone 3
Exposure = 110M

        ↓

...

Campaign Completed

        ↓

Return bond
```

Do các milestone trước đã được verified, bond chỉ cần cover:

\[
CurrentUnverifiedExposure
\]

không phải tổng số tiền đã được sử dụng từ đầu campaign.

---

# 12. Why Bond Exists

Bond bảo vệ protocol trong khoảng thời gian:

```text
donation leaves secure escrow
              ↓
money is under organizer control
              ↓
milestone has not yet been verified
```

Đây là:

\[
UnverifiedExposureWindow
\]

Nếu organizer nhận:

\[
100M
\]

cho milestone hiện tại nhưng chưa chứng minh được việc sử dụng:

\[
Exposure=100M
\]

Bond tạo collateral để giảm thiệt hại khi organizer vi phạm nghĩa vụ protocol.

---

# 13. Failure ≠ Default ≠ Fraud

FundTogether cần phân biệt ba tình trạng.

## 13.1 Project Failure

Organizer không hoàn thành milestone do nguyên nhân hợp lý.

Ví dụ:

```text
natural disaster
permit rejected
vendor bankruptcy
unexpected safety issue
beneficiary situation changed
```

Outcome:

```text
campaign cancelled
remaining donation refunded
bond returned
```

Không slash organizer chỉ vì project fail.

---

## 13.2 Organizer Default

Organizer vi phạm nghĩa vụ protocol.

Ví dụ:

```text
received milestone funds
failed to submit required evidence
ignored review/dispute process
failed to account for funds
```

Outcome:

```text
campaign enters dispute
bond temporarily locked
potential partial/full slash
```

---

## 13.3 Fraud

Có evidence mạnh về hành vi gian lận.

Ví dụ:

```text
forged evidence
duplicate expense
unauthorized fund diversion
fabricated beneficiary
fabricated vendor
intentional evidence manipulation
```

Outcome có thể:

```text
campaign terminated
remaining donations refunded
bond slashed
reputation heavily penalized
```

Do đó:

\[
\boxed{
Failure\neq Default\neq Fraud
}
\]

---

# 14. Campaign State Machine

```text
                         CREATED
                            │
                  organizer locks bond
                            │
                            ↓
                         FUNDING
                    /                 \
                   /                   \
          funding goal fail       funding goal reached
                 │                       │
                 ↓                       ↓
             FUNDING_FAILED        MILESTONE_ACTIVE
                 │                       │
          refund donations               │
          return bond                    ↓
                                 FUNDS_AVAILABLE
                                         │
                                         ↓
                                 ORGANIZER_EXECUTES
                                         │
                                         ↓
                                  EVIDENCE_SUBMITTED
                                         │
                                         ↓
                                   REVIEW_WINDOW
                                     /       \
                                    /         \
                           no challenge      challenge
                                │               │
                                ↓               ↓
                            VERIFIED         DISPUTED
                                │              /    \
                                │             /      \
                                │          PASS      FAIL
                                │           │          │
                                ↓           ↓          ↓
                        NEXT MILESTONE   continue    CANCELLED
                                │                      │
                                │               refund remaining
                                │               bond settlement
                                ↓
                           COMPLETED
                                │
                          return bond
                                │
                       update reputation
```

---

# 15. Challenge-Based Governance

FundTogether không bắt donor vote ở mọi milestone.

Voting liên tục gây:

```text
governance fatigue
low turnout
deadlock
gas cost
poor UX
```

Thay vào đó:

```text
Organizer submits milestone evidence
                 ↓
          Review Window
                 ↓
        e.g. 72 hours
            /        \
           /          \
no challenge         challenge
     │                   │
     ↓                   ↓
 verified              review
```

Đây là **challenge-based governance**.

---

# 16. Challenge Principle

Không có challenge:

```text
evidence submitted
       ↓
challenge window expires
       ↓
milestone accepted
```

Có challenge:

```text
donor/verifier detects issue
           ↓
       challenge()
           ↓
        dispute
           ↓
      resolution
```

Điều này giảm governance overhead nhưng vẫn giữ khả năng community intervention.

---

# 17. Threat T01 — Full Fund Exit Scam

### Attack

Campaign đạt:

\[
Goal=500M
\]

và contract chuyển toàn bộ:

\[
500M\rightarrow Organizer
\]

Organizer biến mất.

### Mitigation

FundTogether chỉ mở khóa milestone hiện tại.

```text
500M escrow
 │
 ├── M1
 ├── M2
 ├── M3
 ├── M4
 └── M5
```

Do đó:

\[
MaximumImmediateExposure
\ll CampaignGoal
\]

---

# 18. Threat T02 — Milestone Exit Scam

Organizer nhận tiền milestone:

\[
M_i=120M
\]

sau đó bỏ campaign.

### Mitigation

Bond:

\[
B\ge E_{max}
\]

với baseline:

\[
B=\max(M_i)
\]

Do đó current exposure được collateralize.

### Remaining issue

Bond không tự xác định organizer có gian lận hay không.

Cần dispute/resolution rule.

---

# 19. Threat T03 — Incorrect Bond Slashing

Donor có thể challenge campaign hợp lệ.

Không được:

```text
challenge
   ↓
immediate slash
```

Phải:

```text
challenge
   ↓
DISPUTED
   ↓
evidence review
   ↓
resolution
   ↓
failure/default/fraud classification
```

Bond chỉ slash khi đáp ứng condition định trước.

---

# 20. Threat T04 — Milestone Fragmentation

Organizer có thể cố giảm bond bằng cách chia campaign thành rất nhiều milestone nhỏ.

Ví dụ:

```text
Campaign Goal = 500M

50 milestones × 10M
```

Khi:

\[
Bond=\max(M_i)
\]

thì:

\[
Bond=10M
\]

Trong khi một campaign khác:

```text
2 milestones × 250M
```

cần:

\[
Bond=250M
\]

Organizer có incentive:

\[
MinimizeMilestoneSize
\]

chỉ để giảm collateral.

### Possible mitigation

```text
maximum milestone count
minimum milestone duration
minimum meaningful deliverable
review overhead
milestone justification
```

Ngoài ra future model có thể sử dụng:

\[
Bond=f(
MilestoneExposure,
OrganizerReputation,
CampaignRisk
)
\]

### Research Status

Open design issue.

---

# 21. Threat T05 — Fake Milestone Completion

Organizer submit:

```text
Milestone Completed
```

dù deliverables chưa đạt.

### Mitigation

Milestone phải có acceptance criteria commit trước.

Ví dụ:

```text
Milestone:
Purchase medical supplies

Requirement:
- 500 units
- supplier identified
- invoice required
- bank transfer required
- beneficiary receipt required
```

Evidence được hash/commit on-chain.

---

# 22. Threat T06 — Fake Expense

Organizer khai:

```text
Expense = 20M
```

và cung cấp invoice giả.

Blockchain không tự xác minh tính thật của invoice.

FundTogether phải phân biệt:

\[
DeclaredExpense
\]

\[
VerifiedExpense
\]

\[
ActualRealWorldExpense
\]

Ba giá trị không mặc định bằng nhau.

---

# 23. Evidence Model

Một expense có thể chứa:

```text
ExpenseRecord {
    milestoneId
    amount
    category

    invoiceHash
    bankProofHash
    evidenceCID

    vendorId
    verifierAttestation

    submittedAt
}
```

Blockchain không nhất thiết lưu toàn bộ document.

Chỉ lưu commitment/hash.

---

# 24. Evidence Levels

FundTogether có thể phân loại evidence.

### Level 0 — Self Declaration

```text
Organizer claim only
```

### Level 1 — Document Evidence

```text
receipt
invoice
```

### Level 2 — Financial Evidence

```text
invoice
+
bank transfer proof
```

### Level 3 — Counterparty Evidence

```text
invoice
+
bank proof
+
vendor verification
```

### Level 4 — Outcome Evidence

```text
invoice
+
bank proof
+
vendor
+
beneficiary/verifier attestation
```

Điều này tạo:

```text
Evidence Strength
```

không phải:

```text
Absolute Truth Score
```

---

# 25. Threat T07 — Fake Vendor

Organizer tạo hoặc kiểm soát vendor.

```text
Organizer
   ↓
related Vendor
   ↓
invoice
   ↓
campaign pays vendor
```

On-chain transaction hợp lệ nhưng economic reality có thể gian lận.

### Mitigation

Possible:

```text
vendor identity verification
related-party disclosure
multiple evidence sources
third-party attestation
challenge mechanism
```

Không thể loại bỏ hoàn toàn nếu không có external verification.

---

# 26. Threat T08 — Duplicate Expense

Organizer có thể dùng cùng một invoice:

```text
Milestone 1
invoice ABC → claim 20M
```

rồi:

```text
Milestone 2
invoice ABC → claim 20M
```

### Mitigation

Hash evidence:

\[
InvoiceID=Hash(Document)
\]

Contract hoặc verification service kiểm tra:

```text
usedEvidenceHash[invoiceHash]
```

Invariant:

\[
OneExpenseEvidence
\rightarrow
AtMostOneClaim
\]

trừ trường hợp evidence được khai báo explicit là shared.

---

# 27. Threat T09 — Evidence Replacement

Không sử dụng URL mutable làm source of truth.

Không:

```text
https://organizer.com/invoice.pdf
```

vì file có thể bị thay.

Thay vào đó:

\[
EvidenceHash=Hash(Content)
\]

Contract lưu:

```text
hash
timestamp
milestone
submissionVersion
```

---

# 28. Threat T10 — Evidence Availability

Hash chứng minh integrity nhưng không đảm bảo availability.

\[
Integrity\neq Availability
\]

Document có thể được lưu:

```text
IPFS
encrypted storage
institutional storage
replicated storage
```

Hệ thống cần persistence strategy.

---

# 29. Threat T11 — Fake Beneficiary

Organizer có thể tạo campaign cho:

```text
beneficiary không tồn tại
```

hoặc giả danh organization.

### Mitigation

Campaign creation có thể yêu cầu:

```text
identity verification
beneficiary attestation
organization registration
supporting documents
```

Không nhất thiết mọi loại charity phải dùng cùng verification requirement.

---

# 30. Threat T12 — Donor Griefing

Donor không có direct financial profit từ việc làm project fail.

Nhưng vẫn có thể:

```text
spam challenge
delay project
harass organizer
politically sabotage campaign
```

### Mitigation

Possible mechanisms:

```text
challenge stake
challenge rate limits
minimum evidence requirement
reputation penalty for abusive challenge
challenge threshold
```

Nếu dùng challenge stake, stake không nên quá cao khiến legitimate donor không thể phản đối.

---

# 31. Threat T13 — Whale Manipulation

Whale problem giảm vì donor không kiếm lợi nhuận từ charity.

Tuy nhiên whale vẫn có thể:

```text
dominate dispute
influence campaign direction
coordinate malicious challenge
```

Do đó FundTogether không mặc định sử dụng:

\[
VotingPower=DonationAmount
\]

cho mọi dispute.

Trong v0.2, exact dispute voting rule vẫn là open design problem.

---

# 32. Threat T14 — Governance Inactivity

Traditional voting:

```text
1000 donors
↓
only 20 vote
↓
milestone stuck
```

Challenge-based governance giảm problem này.

Nếu không có challenge:

```text
milestone progresses automatically
```

sau review window.

Do đó system liveness không phụ thuộc vào active majority turnout ở mọi milestone.

---

# 33. Threat T15 — Malicious Verifier

Verifier có thể approve evidence giả.

### Threat

```text
Organizer
   ↕ collusion
Verifier
```

### Possible mitigation

```text
multi-verifier
random verifier selection
verifier reputation
public evidence review
challenge window
conflict-of-interest disclosure
```

FundTogether không nên tạo một single trusted verifier có absolute authority.

---

# 34. Threat T16 — Organizer + Vendor Collusion

Organizer và vendor có thể inflate price.

Ví dụ:

```text
Real market price = 30M
Invoice = 50M
```

Transaction, invoice và vendor verification đều có thể "hợp lệ".

Đây là limitation của evidence-based systems.

Possible future mitigation:

```text
price benchmark
competitive quotes
procurement rules
community challenge
independent audit
```

---

# 35. Threat T17 — Refund Accounting Error

Giả sử campaign dừng tại M3.

```text
Total raised = 500M
Verified used = 230M
Remaining = 270M
```

Refund donor theo tỷ lệ contribution.

Nếu donor \(i\) đóng:

\[
Contribution_i
\]

thì:

\[
Refund_i=
RemainingPool
\times
\frac{Contribution_i}{TotalEligibleContribution}
\]

Contract phải đảm bảo:

\[
\sum Refund_i
\le RemainingPool
\]

---

# 36. Threat T18 — Double Refund

Invariant:

\[
Refunded_i\le RefundEntitlement_i
\]

Pattern:

```text
read refund
↓
set refund balance = 0
↓
external transfer
```

Không cho donor claim nhiều lần.

---

# 37. Threat T19 — Refund DoS

Không refund toàn bộ donor bằng một loop lớn.

Không:

```text
for every donor:
    send money
```

Dùng:

```text
claimRefund()
```

theo pull-payment model.

---

# 38. Threat T20 — Double Milestone Settlement

Không cho:

```text
verify M2
↓
release fund
↓
call settle again
↓
release again
```

Invariant:

\[
SettlementCount_i\le1
\]

và:

\[
Released_i\le Budget_i
\]

---

# 39. Threat T21 — Unauthorized State Transition

Không cho phép:

```text
FUNDING
↓
COMPLETED
```

hoặc:

```text
DISPUTED
↓
NEXT_MILESTONE
```

trước resolution.

Transitions phải explicit.

---

# 40. Threat T22 — Privacy Leakage

Charity evidence có thể chứa dữ liệu nhạy cảm:

```text
beneficiary name
bank account
address
phone number
medical information
financial information
identity documents
```

Không lưu trực tiếp toàn bộ dữ liệu này trên public blockchain.

Architecture:

```text
Sensitive Document
       ↓
private/encrypted off-chain storage
       ↓
hash / commitment
       ↓
blockchain
```

Blockchain chỉ nên giữ dữ liệu tối thiểu cần thiết.

---

# 41. Reputation Layer

FundTogether loại bỏ cost-saving monetary reward.

Organizer không nhận bonus vì:

```text
spending less
```

Thay vào đó:

```text
accountability
transparency
successful campaigns
verified milestones
```

được ghi vào reputation profile.

---

# 42. Organizer Reputation

Possible public statistics:

```text
Identity Verified
Organization Verified

Campaigns Created
Campaigns Completed

Milestones Verified
Disputes Received
Disputes Upheld

Total Donations Managed

Account Age
```

Không nên dùng một opaque score duy nhất nếu không thể giải thích cách tính.

Ưu tiên:

```text
transparent reputation indicators
```

---

# 43. Organizer Badges

Ví dụ:

```text
First Campaign Completed

5 Campaigns Completed

10 Campaigns Completed

Verified Organizer

Transparent Organizer

Milestone Reliability

Long-term Organizer
```

Badges là:

```text
non-financial
non-transferable
```

và không tạo quyền rút donation.

---

# 44. Donor Reputation

Donor cũng có thể nhận badge:

```text
First Donation

5 Campaigns Supported

Long-term Supporter

Education Supporter

Disaster Relief Supporter
```

Không nên thiết kế quá tập trung vào:

```text
largest amount donated
```

để tránh biến charitable participation thành competition tài chính.

Cho phép:

```text
anonymous donation
```

nếu user muốn.

---

# 45. Bond and Reputation Interaction

Trong future version, bond requirement có thể dựa một phần vào organizer history.

Ví dụ:

\[
BondRequirement
=
f(
MaxExposure,
OrganizerHistory,
CampaignRisk
)
\]

Ví dụ:

```text
New organizer
→ higher bond ratio

Verified long-term organizer
→ lower bond ratio
```

Nhưng v0.2 không cần implement dynamic bond ngay.

Baseline:

\[
Bond=\max(M_i)
\]

đơn giản hơn và dễ evaluate.

---

# 46. Core Protocol Invariants

## INV-01 — Conservation of Funds

\[
TotalDonation
=
Escrow
+
VerifiedReleased
+
Refunded
+
PendingExposure
+
Fees
\]

nếu protocol có fee.

---

## INV-02 — Milestone Budget Safety

\[
Released_i\le Budget_i
\]

---

## INV-03 — Refund Safety

\[
Refunded_i\le RefundEntitlement_i
\]

---

## INV-04 — Bond Requirement

Trong active exposure window:

\[
LockedBond\ge RequiredBond
\]

---

## INV-05 — Evidence Immutability

Một evidence submission đã active review không được sửa.

Resubmit phải tạo:

```text
new version
```

---

## INV-06 — No Double Evidence Claim

Một evidence identifier không được sử dụng cho nhiều expense claim trái rule.

---

## INV-07 — Sequential Milestones

Không activate:

\[
M_{i+1}
\]

trước khi \(M_i\) được resolve.

---

## INV-08 — Funding Failure

Nếu:

\[
Raised<Goal
\]

sau funding deadline:

```text
no milestone activation
donors refund
organizer bond returned
```

---

## INV-09 — Honest Failure

Campaign failure đơn thuần không tự động:

\[
SlashBond
\]

---

## INV-10 — No Automatic Slash on Challenge

\[
Challenge
\neq
FraudProof
\]

Challenge chỉ mở dispute.

---

# 47. Threat Priority v0.2

| ID | Threat | Severity | Type |
|---|---|---:|---|
| T01 | Full-fund exit scam | Critical | Engineering |
| T02 | Milestone exit scam | Critical | Core protocol |
| T03 | Incorrect bond slashing | High | Mechanism design |
| T04 | Milestone fragmentation | Medium | Research/design |
| T05 | Fake milestone completion | High | Core research |
| T06 | Fake expense | High | Core research |
| T07 | Fake vendor | High | Research/limitation |
| T08 | Duplicate expense | High | Engineering |
| T09 | Evidence replacement | High | Engineering |
| T10 | Evidence unavailable | Medium | System design |
| T11 | Fake beneficiary | Critical | Verification |
| T12 | Donor griefing | Medium | Governance |
| T13 | Whale manipulation | Medium | Governance |
| T14 | Governance inactivity | High | Governance |
| T15 | Malicious verifier | High | Research |
| T16 | Vendor collusion | High | Research/limitation |
| T17 | Refund accounting | Critical | Engineering |
| T18 | Double refund | Critical | Engineering |
| T19 | Refund DoS | High | Engineering |
| T20 | Double settlement | Critical | Engineering |
| T21 | Invalid state transition | Critical | Engineering |
| T22 | Privacy leakage | Critical | System design |

---

# 48. Threats Reduced by Charity Pivot

Các vấn đề sau giảm importance so với v0.1:

```text
whale profit attack
bond-stealing incentive
cost-saving bonus gaming
quadratic voting
token governance
financial incentive optimization
```

Nguyên nhân:

Donor không nhận:

\[
Profit
\]

khi campaign thất bại.

Refund chỉ đại diện cho phần donation:

\[
Unused
\]

của chính donor.

---

# 49. Problems Removed from v0.1

FundTogether v0.2 bỏ:

```text
90/10 creator reward
financial creator bonus
quadratic voting as core
profit-based voter incentives
token rewards
```

Những phần này không phù hợp với charity-focused protocol.

---

# 50. Core Architecture v0.2

```text
                    FUND TOGETHER
                          │
         ┌────────────────┴────────────────┐
         │                                 │
     Organizer                           Donors
         │                                 │
      Bond                            Donations
         │                                 │
         └──────────────┬──────────────────┘
                        ↓
                 Campaign Escrow
                        │
                Goal + Deadline
                  /            \
                 /              \
              FAILED          FUNDED
                │                │
           donor refund          ↓
           return bond     MilestoneManager
                                 │
                                 ↓
                          Milestone Vault
                                 │
                      controlled disbursement
                                 │
                                 ↓
                         Organizer executes
                                 │
                                 ↓
                          Evidence Registry
                                 │
                                 ↓
                           Review Window
                             /       \
                            /         \
                    no challenge    challenge
                         │              │
                         ↓              ↓
                      VERIFIED       DISPUTE
                         │            /     \
                         │         pass     fail
                         │          │        │
                         ↓          │        ↓
                  next milestone ←──┘    CANCEL
                         │                  │
                         │          refund remaining
                         │          bond settlement
                         ↓
                     COMPLETED
                         │
                    return bond
                         │
                  Reputation update
```

---

# 51. Core Smart Contract Modules

```text
CampaignFactory
│
├── CampaignEscrow
├── MilestoneManager
├── MilestoneVault
├── BondManager
├── EvidenceRegistry
├── ChallengeManager
├── RefundManager
└── ReputationRegistry
```

---

# 52. CampaignFactory

Responsibilities:

```text
create campaign
register organizer
register milestones
calculate required bond
deploy campaign instance
```

Required bond baseline:

\[
Bond=\max(MilestoneBudget_i)
\]

---

# 53. CampaignEscrow

Responsibilities:

```text
accept donation
track donor contribution
check funding goal
prevent premature withdrawal
refund failed campaign
```

---

# 54. MilestoneManager

Responsibilities:

```text
activate milestone
track milestone states
enforce sequencing
submit completion
start review window
settle outcome
```

---

# 55. MilestoneVault

Responsibilities:

```text
hold milestone budget
control release
track remaining funds
prevent over-spending
```

Invariant:

\[
Released_i+Remaining_i=Allocated_i
\]

---

# 56. BondManager

Responsibilities:

```text
lock organizer bond
verify bond requirement
prevent withdrawal while active exposure exists
return bond
execute authorized slash
```

Bond lifecycle:

```text
LOCKED
   ↓
ACTIVE
   ↓
┌───────────────┬───────────────┐
│               │               │
COMPLETED     FAILURE        DEFAULT/FRAUD
│               │               │
RETURN         RETURN       DISPUTE/SLASH
```

---

# 57. EvidenceRegistry

Responsibilities:

```text
register evidence hash
associate evidence with milestone
track evidence version
prevent duplicate claim
store verifier attestation
```

Sensitive documents remain off-chain.

---

# 58. ChallengeManager

Responsibilities:

```text
open challenge window
register challenge
enter dispute state
resolve dispute
```

Challenge itself không có quyền slash bond.

---

# 59. ReputationRegistry

Responsibilities:

```text
record completed campaigns
record verified milestones
record upheld disputes
issue reputation badges
```

Reputation là:

```text
non-transferable
non-financial
```

---

# 60. Main Research Problem

FundTogether không nghiên cứu:

> Có thể dùng blockchain để làm website từ thiện hay không?

Research problem mạnh hơn là:

> Làm thế nào để thiết kế một protocol giải ngân từ thiện theo milestone có thể tăng accountability và fund traceability mà không yêu cầu donor tham gia governance liên tục?

---

# 61. Main Research Question

> **How can an evidence-backed, milestone-based charitable crowdfunding protocol use escrow, organizer collateral, and challenge-based governance to improve donation accountability while preserving system usability and campaign liveness?**

---

# 62. RQ2 — Bond Effectiveness

> How effectively can a maximum-exposure organizer bond limit donor loss without requiring collateral equal to the entire campaign goal?

So sánh:

\[
Bond=0
\]

\[
Bond=0.5\max(M_i)
\]

\[
Bond=\max(M_i)
\]

\[
Bond=1.5\max(M_i)
\]

---

# 63. RQ3 — Milestone Design

> How does milestone granularity affect risk exposure, bond requirements, operational overhead, and campaign completion?

Experiment:

```text
2 milestones
5 milestones
10 milestones
20 milestones
```

Đo:

```text
maximum exposure
bond size
review count
gas
completion delay
```

Đây trực tiếp nghiên cứu Milestone Fragmentation trade-off.

---

# 64. RQ4 — Challenge Governance

> Can challenge-based milestone verification reduce governance overhead compared with mandatory donor voting while preserving the ability to detect suspicious milestone claims?

So sánh:

```text
Mandatory Voting
vs
Optimistic / Challenge-based Review
```

Metrics:

```text
required interactions
decision latency
gas cost
false acceptance
false rejection
deadlock rate
```

---

# 65. RQ5 — Evidence Strength

> How does evidence richness affect the ability of the protocol/community to distinguish valid and suspicious milestone claims?

Evidence configurations:

```text
self-declaration

invoice only

invoice + transaction

invoice + transaction + vendor

invoice + transaction + vendor + beneficiary/verifier
```

---

# 66. Experimental Metrics

## Donor Loss Exposure

\[
DLE=
\frac{AtRiskDonation}
{TotalDonation}
\]

---

## Collateral Efficiency

\[
CE=
\frac{RequiredBond}
{CampaignGoal}
\]

Ví dụ:

\[
Bond=120M
\]

\[
Goal=500M
\]

thì:

\[
CE=24\%
\]

---

## Maximum Exposure Ratio

\[
MER=
\frac{MaximumUnverifiedExposure}
{CampaignGoal}
\]

---

## False Acceptance Rate

\[
FAR=
\frac{FraudulentMilestonesAccepted}
{FraudulentMilestoneAttempts}
\]

---

## False Rejection Rate

\[
FRR=
\frac{LegitimateMilestonesRejected}
{LegitimateMilestoneSubmissions}
\]

---

## Governance Overhead

Có thể đo bằng:

```text
number of required donor interactions
number of on-chain transactions
gas consumed
review latency
```

---

## Campaign Liveness

\[
CLR=
\frac{CampaignsProgressingWithoutDeadlock}
{TotalCampaigns}
\]

---

## Refund Accuracy

\[
RA=
1-
\frac{|ExpectedRefund-ActualRefund|}
{ExpectedRefund}
\]

---

# 67. Research Contribution

FundTogether có thể claim contribution ở mức:

> FundTogether proposes a charitable crowdfunding protocol that limits donation exposure through milestone-based escrow, protects active milestone funds using reusable maximum-exposure organizer collateral, links disbursement to auditable evidence, and replaces continuous donor voting with challenge-based milestone governance.

Điểm đáng chú ý nhất:

\[
CampaignGoal
\neq
RequiredBond
\]

mà:

\[
\boxed{
RequiredBond
=
MaximumUnverifiedExposure
}
\]

ở baseline:

\[
\boxed{
RequiredBond
=
\max(MilestoneBudget_i)
}
\]

Điều này cho phép collateral được tái sử dụng qua toàn bộ campaign.

---

# 68. Scientific Positioning

FundTogether không claim:

```text
blockchain proves charity is honest
```

Không claim:

```text
invoice proves money was used correctly
```

Không claim:

```text
decentralization removes fraud
```

FundTogether claim:

```text
fund release conditions are enforceable

campaign commitments are auditable

fund movement is traceable

evidence history is tamper-evident

unused donation remains controllable

financial exposure is bounded by milestones

organizer accountability is strengthened through collateral

community intervention remains possible without requiring constant voting
```

---

# 69. Scope for 5–6 Months

## Must Have

```text
Campaign creation
Donation escrow
Goal + deadline
Milestone budgets
Maximum-milestone bond
Sequential milestone release
Evidence submission
Evidence hashing
Challenge window
Dispute state
Refund
Bond return/slash flow
Reputation/badges
Smart contract tests
Security testing
Experimental simulation
```

---

## Nice to Have

```text
verified organization profiles
bank-proof integration prototype
vendor verification
encrypted evidence storage
multi-verifier attestation
dynamic bond ratio
```

---

## Out of Scope

```text
AI fraud detection
cross-chain
zero-knowledge identity
custom cryptocurrency
financial rewards
full DAO
quadratic voting
NFT speculation
automated real-world truth verification
decentralized court
```

---

# 70. Final FundTogether v0.2 Model

\[
\boxed{
Charitable\ Campaign
}
\]

\[
\downarrow
\]

\[
\boxed{
Donation\ Escrow
}
\]

\[
\downarrow
\]

\[
\boxed{
Milestone\ Controlled\ Disbursement
}
\]

\[
+
\]

\[
\boxed{
Reusable\ MaximumExposure\ Bond
}
\]

\[
\downarrow
\]

\[
\boxed{
Evidence\ Submission
}
\]

\[
\downarrow
\]

\[
\boxed{
Challenge\ Window
}
\]

\[
\downarrow
\]

\[
\boxed{
Verified\ Milestone
\;or\;
Dispute
}
\]

\[
\downarrow
\]

\[
\boxed{
Progress\ /\ Refund\ /\ Bond\ Settlement
}
\]

\[
\downarrow
\]

\[
\boxed{
Reputation
}
\]

FundTogether v0.2 vì vậy không còn là một crowdfunding contract đơn giản.

Nó trở thành một:

> **Evidence-backed charitable fund-disbursement and accountability protocol with bounded financial exposure.**

---

# MVP Boundary Clarification

Trong MVP, blockchain được dùng cho các quyết định có tác động trực tiếp đến tiền và quyền claim:

```text
donation / escrow
milestone state
organizer bond
challenge result
refund entitlement
```

Các nội dung cần đánh giá ngoài đời vẫn nằm ngoài blockchain:

```text
file và metadata evidence
tính xác thực của hóa đơn/ảnh
đánh giá beneficiary
quyết định của resolver
reputation projection
```

Hash chỉ chứng minh tính toàn vẹn của nội dung đã cam kết; hash không chứng minh nội dung đó là sự thật. MVP dùng trusted resolver để giới hạn độ phức tạp, nhưng đây là giả định tin cậy phải được ghi rõ khi đánh giá threat model.

EIP-712 verifier signature và multisig resolver là hướng hardening sau prototype. Timeout cần được thiết kế ngay trong state machine theo nguyên tắc permissionless execution: khi đủ điều kiện, bất kỳ bên nào cũng có thể gửi transaction kết thúc; contract vẫn tự kiểm tra guard và không tự chạy nếu không có transaction.


## Arc-specific review — 2026-10-03 (mitigations TODO)

- Shared USDC gas/token: fee reserve, đúng đơn vị; không suy donation từ net balance.
- Token blocklist/failed payouts có thể giữ tiền lâu. Recovery chưa có; không tự
  cấp admin quyền rút escrow/bond. Kiểm tra rollback atomically khi transfer fail.
- Native inflows/SELFDESTRUCT không tạo donor rights. Surplus/dust vẫn cần policy,
  không tăng raised từ raw balance.
- Native/ERC20 logs có thể đếm tiền hai lần; chọn source/emitter, protocol events.
- Arc consensus finality khác indexer readiness và evidence truth; ghi giả định
  permissioned validators/issuer controls trong trust model.
- Fee-floor drop không receipt cần reconcile; included revert vẫn có thể tốn gas.
- CHALLENGED exit, timeout/no-quorum và post-funded recovery vẫn chưa triển khai.

Nguồn/checklist: [Arc evaluation](./FundTogether_Arc_Evaluation_v0.1.md).
Trạng thái: [milestone review](./FundTogether_Milestone_Review_2026-10-03.md).
