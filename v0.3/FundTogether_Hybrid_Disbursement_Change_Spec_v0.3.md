# FundTogether — Đặc tả sửa đổi hệ thống sang Hybrid Evidence-Based Disbursement

**Mã tài liệu:** FT-HED-CHANGE-001  
**Phiên bản:** v0.3 — DESIGN REVIEW / NOT IMPLEMENTED  
**Ngày:** 11/10/2026  
**Repository:** https://github.com/Lunamoon-dot/FundTogether  
**Baseline được đọc:** `main` tại commit `022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf` (11/10/2026, thời điểm truy xuất)  
**Mục đích:** Một file yêu cầu sửa đổi, đặc tả nghiệp vụ, phân rã kỹ thuật và tiêu chí kiểm chứng cho hệ thống FundTogether; có thể đặt ở `docs/hybrid-disbursement-change-spec.md` sau khi được duyệt.  
**Mức độ bảo đảm:** Phương án kiến trúc có đối chiếu source; **không** phải audit bảo mật, không chứng minh tương thích production, không phải hợp đồng pháp lý.

> **QUAN TRỌNG — KHÔNG THỰC HIỆN DI CHUYỂN TIỀN HAY REWRITE KHI CHƯA DUYỆT.** Lựa chọn chiến lược đã được người dùng chốt là: tập trung NCKH vào cơ chế **giải ngân theo yêu cầu sử dụng vốn**, ưu tiên **chuyển trực tiếp cho nhà cung cấp**, cho phép **đặt cọc/trả trước có giới hạn**, phần còn lại chỉ trả sau bằng chứng giao hàng được chấp nhận. Các ngưỡng tiền, thời hạn, fallback xử lý tranh chấp và quyền ký chi tiết trong tài liệu này là **đề xuất để duyệt và kiểm chứng**, không tự biến thành quy tắc tài chính đang áp dụng cho Workflow B.

---

## 0. Executive decision / các lựa chọn đã và chưa được chốt

### Đã thống nhất qua cuộc trao đổi

1. Vấn đề nghiên cứu trung tâm là **điều kiện ra quyết định giải ngân**, không phải buộc mọi campaign thành các milestone bất biến.
2. Campaign cam kết **mục đích, phạm vi, quyền donor và ngân sách trần**; organizer được gửi `FundingRequest` phát sinh theo nhu cầu thay vì khai sẵn budget mỗi stage.
3. Mô hình **Hybrid:** `P1 Direct Vendor Payment` là hướng ưu tiên; `P2 Controlled Organizer Advance` và `P3 Reimbursement` là các đường nghiệp vụ khác nhau, **chưa tự động bật trong MVP P1**.
4. Với P1, cho phép một **limited deposit** sau phê duyệt và kiểm tra exposure; **không cho phép thanh toán phần còn lại chỉ dựa vào báo giá hoặc im lặng**.
5. Bằng chứng **financial settlement** và **charitable outcome** khác nhau. Nhà cung cấp giao đủ hàng chưa chứng minh donor-funded gift đã trao đến đúng người thụ hưởng.
6. Giữ **Workflow A và Workflow B làm baseline/đối chứng**. Không sửa contract cũ, không tự di chuyển campaign hoặc quyền refund.
7. Không thêm QV, MDP, AI tự quyết, slash, bond hay bridge VND–USDC để làm điều kiện tiên quyết.

### Chưa được người dùng phê duyệt ở mức protocol

`OPEN-01` ngưỡng đặt cọc theo loại hoạt động/vendor, `OPEN-02` tổng exposure và trần tổn thất lũy kế, `OPEN-03` thời hạn review/challenge/delivery/wind-down, `OPEN-04` cơ chế dự phòng khi resolver mất khả năng thực thi, `OPEN-05` xử lý nghĩa vụ nhà cung cấp khi STOP, `OPEN-06` quyền donor mở case và chống spam, `OPEN-07` một hay nhiều request đồng thời, `OPEN-08` chính sách partial delivery và hủy hợp đồng với nhà cung cấp, `OPEN-09` khi nào một campaign đã hoàn tất outcome, `OPEN-10` chính sách phê duyệt vendor có xung đột lợi ích, `OPEN-11` refund dust/late recovery và trường hợp C=0, `OPEN-12` chi phí vận hành và mô hình thanh toán P2/P3. Xem **Mục 15**.

**Quy tắc change control:** không suy từ lựa chọn thiết kế chiến lược thành quyền mới đối với tiền. Với mọi OPEN ảnh hưởng tiền, quyền hoặc liveness: viết trace, chứng minh invariant, nêu actor và điều kiện chấp nhận, sau đó mới đánh dấu APPROVED.

---

## 1. Đối chiếu repository thực tế (không phỏng đoán)

### 1.1 Source of truth / tài liệu hiện hành

| Đường dẫn | Thực tế đang tồn tại | Tác động của hướng mới |
|---|---|---|
| [`docs/research-direction.md`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/docs/research-direction.md) | Ưu tiên NCKH, mua/trao quà làm loại campaign đầu, bằng chứng và donor protection; B-D01–B-D10 cho pilot | Cần **ADR cập nhật hướng nghiên cứu** sau duyệt; không xóa lịch sử quyết định B |
| [`GOAL.md`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/GOAL.md) | Goal hiện tại là **hoàn thiện B**; yêu cầu duyệt protocol trước thay quyền/tiền | Không viết đè bằng hướng mới khi B chưa nghiệm thu; lập roadmap riêng |
| [`docs/workflow-b-spec.md`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/docs/workflow-b-spec.md) | B-D01–B-D10, 1 resolver, no-bond, full funding, claim 100% budget từng stage, return, case, refund | Baseline B **không đổi**; HED là protocol cạnh tranh để nghiên cứu |
| [`docs/workflow-b-financial-rules.md`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/docs/workflow-b-financial-rules.md) | `C + R = A + F + E`, snapshot base + late supplement; MockUSDC 6 decimals | Thừa kế ý tưởng kế toán và refund, **không copy nguyên** logic stage advance |
| [`docs/workflow-b-code-audit-2026-10-10.md`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/docs/workflow-b-code-audit-2026-10-10.md) | Kết quả kiểm tra B trước đó; manual popup/reviewer và organizer verification request còn việc | Test lịch sử không chứng minh HED; không gắn nhãn production-ready |
| [`README.md`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/README.md) | Kiến trúc FE React+Vite, BE NestJS/Drizzle/Postgres, MinIO, Foundry/Anvil, viem/wagmi, indexer | Giữ công nghệ và ranh giới nguồn sự thật, bổ sung HED riêng |

### 1.2 Đối chiếu smart contract và accounting

- [`contracts/src/FundTogetherAdvance.sol`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/contracts/src/FundTogetherAdvance.sol) chứa `submitCampaignForDraft`, `approveCampaign`, `publishCampaign`, `donate`, `confirmFirstAdvance`, `claimAdvance`, review evidence/case, `returnFunds`, `claimRefund`, `_snapshot`, `_refundAmounts`, `_receiveExact`, `_sendExact`.
- [`contracts/src/advance/AdvanceTypes.sol`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/contracts/src/advance/AdvanceTypes.sol) có `CampaignState`, `StageState`, `StageView` với `budget`, `advanced`, `returned`, `acceptedCampaignSpent` và `declaredUnused`. **Không có** `FundingRequest`, `Vendor`, `Deposit`, `Reservation` hay kiểm chứng giao hàng riêng cho P1.
- Contract B cố định một `resolver` trong constructor; `claimAdvance` dành cho organizer và chuyển **full stage budget**; reviewer không có quyền redirect recipient.
- `_snapshot` của B chốt `basePool = custody` vì B không có nghĩa vụ vendor còn dang dở. **Tuyệt đối không copy nguyên vào HED** khi còn `Reserved` hoặc khoản vendor đang tranh chấp.
- `_refundAmounts` của B tính base và supplement theo `contributions[id][wallet] / contributed`. Đây là nền tham khảo, không phải chứng minh refund model có vendor commitments đã đúng.
- Current contract dùng SafeERC20, ReentrancyGuard và exact sender/recipient balance-delta. HED có thể tái sử dụng **cách kiểm tra**, nhưng phải kiểm thử lại trên contract mới.

### 1.3 Backend / storage / indexer / frontend thực tế

- [`backend/src/database/schema/advance.schema.ts`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/src/database/schema/advance.schema.ts): `advance_campaign_plans`, `organization_verification_records`, `advance_campaign_projection`; `giftConfig` yêu cầu `stages[]`, `goal` từ tổng budget.
- [`backend/src/advance/advance-plan.ts`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/src/advance/advance-plan.ts): `freezeGiftPlan` tạo canonical plan với `stage` và `criteriaHashes`, gắn deployment identity. HED phải tạo **format commitment mới**, không âm thầm thay `advance.plan.v1`.
- [`backend/src/advance/advance-workflow.service.ts`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/src/advance/advance-workflow.service.ts) cùng [`advance-action-policy.ts`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/src/advance/advance-action-policy.ts): chuẩn bị contract call từ snapshot, checkpoint, state, SIWE-linked wallet. `CLAIM_ADVANCE` chỉ có trong B, không dùng như `payDeposit` của HED.
- [`backend/src/advance/advance-evidence.service.ts`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/src/advance/advance-evidence.service.ts): original/private + redacted/public và đóng băng commitment; nên **tách domain package** theo request/delivery/outcome khi tái sử dụng storage.
- [`backend/src/advance/advance-review.service.ts`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/src/advance/advance-review.service.ts): review theo version/criterion và tạo report có hash; HED thêm vendor verification và delivery acceptance riêng.
- [`backend/src/advance/advance-indexer.service.ts`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/src/advance/advance-indexer.service.ts): stream identity và replay/reorg. HED cần stream mới để không lẫn projection/event B.
- [`frontend/src/features/campaigns/advance/`](https://github.com/Lunamoon-dot/FundTogether/tree/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/frontend/src/features/campaigns/advance), [`frontend/src/features/review/AdvanceReview.tsx`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/frontend/src/features/review/AdvanceReview.tsx), [`frontend/src/features/explore/AdvanceCampaignDetail.tsx`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/frontend/src/features/explore/AdvanceCampaignDetail.tsx): UI hiện theo stage; HED cần journey theo `requestId`.
- [`backend/drizzle/0013_workflow_b_context.sql`](https://github.com/Lunamoon-dot/FundTogether/blob/022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf/backend/drizzle/0013_workflow_b_context.sql), `backend/drizzle.workflow-b.config.ts`, `backend/scripts/workflow-b/`, `contracts/test/unit/Advance/` và `contracts/test/invariant/FundTogetherAdvanceInvariant.t.sol` là ranh giới pilot B cần giữ nguyên.

**Kết luận source review:** B đã có nhiều luồng và test; nhưng HED/P1 là **thay đổi mô hình quyền nhận tiền và nghĩa vụ thanh toán**, không thể đạt được bằng sửa label trên UI hay thêm route CRUD.

---

## 2. Problem statement và giả thuyết nghiên cứu

**Vấn đề:** Milestone với ngân sách và thứ tự cố định khó phản ứng với việc hết hàng, tăng chi phí, đổi nhà cung cấp và điều kiện giao hàng; đồng thời giải ngân trước toàn bộ stage cho organizer làm tăng vốn rời escrow trước khi có bằng chứng thực hiện. Ngược lại, yêu cầu tự ứng toàn bộ kinh phí có thể loại bỏ tổ chức thiếu vốn.

**Câu hỏi:** Một cơ chế `FundingRequest` có thể giải ngân đúng nhu cầu tại thời điểm phát sinh, với thanh toán trực tiếp vendor có đặt cọc giới hạn và nghiệm thu phần còn lại, liệu có cải thiện tính linh hoạt **mà vẫn bảo vệ vốn và quyền donor** so với B không?

**Giả thuyết phải kiểm nghiệm, KHÔNG coi là kết quả:**

- H1: Request-based P1 xử lý được nhiều tình huống thay đổi nhà cung cấp/giá/đơn hàng hơn B khi cùng cam kết mục đích.
- H2: Trần đặt cọc và khóa thanh toán sau nghiệm thu làm giảm **maximum pre-delivery funds at risk** so với giải ngân stage toàn bộ cho organizer, trong cùng kịch bản và hạn mức vốn.
- H3: Risk-tiered review giảm false approval ở tình huống rủi ro nhưng có thể làm tăng latency/chi phí/false rejection.
- H4: Direct vendor P1 có thể tăng phụ thuộc vào việc vendor hỗ trợ token, giao hàng đúng và chất lượng reviewer; nó **không tất yếu** tốt hơn cho mọi mô hình từ thiện.

**Đối chứng:** B0 = Workflow B fixed milestone advance; B1 = request-based P1 với quy trình duyệt cố định; B2 = P1 risk-adaptive (điều kiện duyệt và deposit limit theo rủi ro) và về sau B3 = hybrid P1/P2/P3. Tách các biến khi thử nghiệm để nhận diện tác động của từng thay đổi.

**Scope vòng đầu:** `GIFT_DISTRIBUTION`, MockUSDC local (6 decimals), 1 chain, một tổ chức OWNER + wallet, một resolver theo mô hình B làm điểm khởi đầu, full funding trước payout, no bond, một yêu cầu có exposure trước giao hàng tại một thời điểm, một lần đặt cọc và tối đa một lần final payout cho request; không phát sinh ngân sách/tài sản giữa chain/fiat. Các điểm chưa duyệt vẫn là đề xuất phải ký quyết định trước implementation.

**Non-goals:** hứa thu hồi được token đã trả vendor; tự động xác nhận hàng thật bằng AI/hash; chấp nhận donor im lặng là bằng chứng; giải ngân VND/bridge; hỗ trợ nhiều token có fee/rebase; cho donor exit tùy ý; thay đổi mục tiêu cốt lõi; implement QV/MDP; upgrade contract A/B đang triển khai.

---

## 3. Domain model đề xuất

| Entity | Thuộc tính tối thiểu | Nguồn thẩm quyền |
|---|---|---|
| `CampaignCommitment` | `campaignId`, `organizerWallet`, `goal`, `purposeHash`, `recipientScopeHash`, `spendingPolicyHash`, `outcomeCriteriaHash`, `fundingEnd`, `deploymentId`, `version` | Contract khóa commitment + off-chain original/redacted |
| `FundingRequest` | `requestId`, `campaignId`, `sequence`, `purposeReference`, `lineItems`, `maxPayable`, `paymentMode=P1`, `vendorRef`, `vendorWallet`, `termsHash`, `status`, `policyVersion` | Backend tạo hồ sơ; contract tạo quyền tài chính sau phê duyệt |
| `VendorVerification` | danh tính, bằng chứng người nhận, địa chỉ ví, chủ sở hữu, liên hệ với organizer, conflict declaration, thời hạn hợp lệ | Staff kiểm tra; record hashed/signed, không PII on-chain |
| `RequestApproval` | `requestId`, `documentHash`, `approvalVersion`, `reviewer`, `reasonHash`, `maxGrossPayout`, `depositCap`, `deliveryDeadline`, `challengeWindow` | Quyết định có thẩm quyền và contract kiểm tra |
| `ReservationLedger` | `amountReserved`, `amountReleased`, `amountPaidGross`, `amountReturned` | Contract, phản ánh từ event |
| `DepositPayment` | amount, recipient, decision hash, Tx hash, execution timestamp | Contract / chain receipt |
| `DeliveryAcceptance` | evidence hash/version, accepted quantity/value, reviewer, reason, public evidence hash, challenge status | Reviewer quyết định; contract khóa reference/value sau finalization |
| `Settlement` | accepted financial spend, outstanding, refunded/recovered, loss recognized, residual reserve released | Contract/counters + quyết định người xét duyệt |
| `OutcomeVerification` | activity-specific checklist (mua/trao quà), outcome report, recipient verification, pending/disputed/final | Reviewer và challenge process; dữ liệu cá nhân private |
| `Dispute` | object (`request`, `delivery`, `outcome`), opener, evidence version, deadlines, status, decision | Contract ghi authority/state + hồ sơ off-chain |
| `RefundLedger` | donor contributions, base pool, supplement pool, paid per donor, blocked obligations, residual dust | Contract quyết định quyền token |

**Không nhầm lẫn:** `vendorWallet` là địa chỉ nhận token; `vendorVerification` không chứng minh giao hàng; `acceptedDeliveryValue` là quyết định nghiệm thu có thể sai; `OutcomeVerification` chứng minh mục tiêu từ thiện theo chuẩn đã cam kết, không phải chỉ chứng từ kế toán.

### 3.1 Campaign commitment không gắn hard-code vào stage

Bản canonical đầu nên ghi `purpose`, `recipientScope`, `allowedExpenseCategories`, `maxFunding`, `fundingDuration`, `requiredOutcomeEvidence`, `payoutPolicyVersion`, `refundPolicyVersion`, `organizerWallet`, `deploymentIdentity`. Giá mua từng lô, vendor và thời điểm đặt cọc được gắn ở request, không khóa tất cả từ ngày tạo campaign.

Những thay đổi supplier/timeline/quantity ở request chưa trả tiền có thể đề nghị lại; **sửa mục tiêu/thụ hưởng/chuẩn bằng chứng cốt lõi** không được coi là cập nhật vận hành. Sau payment, mọi amendment giữ nguyên lịch sử và nghĩa vụ cũ; nếu tác động đến số tiền/recipient phải có quy trình riêng hoặc tạo request mới sau xử lý trách nhiệm đã phát sinh.

### 3.2 Phân biệt request, request version và payment authorization

- `requestId` không thay đổi khi nộp bổ sung chứng từ, nhưng `requestVersion` tăng.
- Mỗi `Approval` gắn đúng `(deploymentId, chainId, contractAddress, campaignId, requestId, requestVersion, termsHash, vendorWallet, maxGrossPayout, depositCap)`; thay các trường đó -> phê duyệt cũ mất hiệu lực.
- `DepositAuthorization` và `FinalPaymentAuthorization` là **hai quyết định khác nhau**, không dùng chữ ký duyệt request để tự giải ngân tất cả.
- Công khai lý do/chứng cứ đã che PII, không công khai hóa đơn có tài khoản ngân hàng, số điện thoại hoặc danh sách người nhận nguyên bản.

---

## 4. Vai trò, separation of duties và threat model

| Actor | Có thể | Không thể |
|---|---|---|
| Donor | Donate, xem audit trail, gửi challenge khi đủ điều kiện, claim refund cho chính ví góp | Chỉ định arbitrary payout address, tự chứng nhận giao hàng, rút tiền tùy ý |
| Organizer OWNER | Tạo campaign, đề nghị mua hàng, đề xuất vendor, cung cấp evidence, kích hoạt thao tác đã được contract cho phép | Tự phê duyệt tiền, tự giảm chuẩn nghiệm thu, tăng payout cap sau approval |
| Staff verification | Kiểm tra danh tính/vendor và xung đột lợi ích, quản lý hồ sơ riêng tư | Tự cấp tiền nếu không phải signer có authority on-chain |
| Resolver / reviewer | Quyết định eligibility, deposit, delivery acceptance, tranh chấp trong phạm vi quyền đã cấp | Chuyển tiền cho ví tùy ý, đổi vendor sau approval, tự hồi tố accepted value |
| Executor | Submit transaction `payDeposit` / `payFinal` khi contract đã xác minh điều kiện; permissionless nếu policy cho phép | Được quyền thay amount/ví/terms hoặc bỏ qua challenge |
| Vendor | Nhận đúng khoản được duyệt, gửi giao hàng, hoàn tiền khi có nghĩa vụ | Tự phê duyệt evidence, rút `Reserved` còn lại, thay đổi điều khoản một chiều |

**Chính sách xung đột tối thiểu:** organizer và reviewer phải khác người/ví; reviewer không được là vendor hoặc người có lợi ích trong giao dịch được duyệt; vendor tự khai liên hệ với organizer; staff thẩm định và lưu lý do. Các kiểm tra khác ví **không đủ** chống thông đồng/đa ví. Khi phát hiện COI -> `PAUSED_FOR_REASSIGNMENT` hoặc `STOP/WIND_DOWN` theo đặc tả, không tự chuyển quyền cho admin.

**Threat cases ưu tiên:** vendor giả/đa ví, organizer–vendor collusion, invoice replay, đơn giá bất thường, split request để né cap, giao hàng kém, từ chối refund, thay recipient sau khi ký, claim lặp, reviewer false positive, challenge spam, im lặng kéo dài, provider mất khóa, transaction bị reorg, indexer lệch, token callback/reentrancy, direct token transfer không định danh, campaign STOP với hợp đồng vendor đang hiệu lực, dữ liệu PII bị công khai.

---
## 5. Quy tắc P1: Vendor payment với deposit giới hạn

### 5.1 Điều kiện từ `Submitted` đến `Approved & Reserved`

1. Campaign đã đủ `goal` theo policy đã công bố và đã vượt qua eligibility check trước lần giải ngân đầu; không còn trạng thái STOP hoặc review/case chặn thanh toán.
2. Request tham chiếu đúng `purpose/expense category` trong commitment, số lượng/giá trị/mô tả hàng hóa có căn cứ; không thay scope donor.
3. Vendor được staff xác minh; wallet nhận token/contract chain đúng; xác nhận vendor có khả năng **nhận MockUSDC** ở pilot.
4. Có báo giá, điều kiện giao hàng, chứng từ đặt cọc, điều kiện hoàn tiền và bằng chứng dự kiến. Nếu giá tăng bất thường, giải trình và review theo tier.
5. Request không trùng hóa đơn/line item/đơn hàng đã trả hoặc đang reserve (identity, file fingerprint, normalized invoice number, vendor, period, product, approximate duplicate).
6. `ApprovedAmount > 0`, `depositCap` và `deliveryDeadline` rõ ràng; review có lý do và `termsHash` khóa. Tất cả dựa trên số nguyên base-unit.
7. `Available >= ApprovedAmount` và không vi phạm campaign caps. **Approval phải reserve cả tối đa nghĩa vụ được phép thanh toán**, không chỉ phần cọc.
8. Người ra quyết định không phải người đề nghị hoặc chủ/vendor của khoản đó.

Việc qua bước trên chỉ chứng minh request có đủ điều kiện chấp thuận ở **thời điểm xem xét**. Không khẳng định vendor chắc chắn giao hàng hay dữ liệu off-chain đúng tuyệt đối.

### 5.2 Deposit authorization (quyết định trả trước)

Với request `i`, đặt `Q_i=ApprovedAmount_i`, `D_i=depositAmount_i`, `α_i` là hệ số theo tier, `A_i` là hạn mức tuyệt đối theo khoản, `H_campaign` là room exposure:

```text
0 <= D_i <= min(Q_i * α_i, A_i, H_campaign)
AggregatePreDeliveryExposureAfter <= CampaignExposureCap
LifetimeLossRecognized <= CampaignLossStopThreshold (nếu đã vượt: chặn payout mới/STOP theo policy)
```

- `α_i`, `A_i`, cap campaign và ngưỡng tổn thất **chưa chốt**; mọi giá trị 10/20/30% nếu xuất hiện trong thử nghiệm đều phải gắn `simulation_parameter`, không gắn mặc định vào nghiệp vụ.
- Nếu vendor không cần đặt cọc, `D_i=0`, ưu tiên thanh toán sau nghiệm thu.
- Chỉ một sự kiện `DepositPaid`/request ở bản V1; amount cố định khi duyệt. Cắt giao dịch thành nhiều lần để lách trần bị cấm.
- Trước `payDeposit`, contract kiểm tra lại chain state, còn hạn, `Reserved`, version, vendor, risk room, số dư và deadline; kiểm tra **ngay tại execution** để tránh TOCTOU.
- Event và balance-delta thành công mới có thể đánh dấu tiền rời quỹ. API preparation/tx hash pending không phải thanh toán.
- Deposit sau khi đã chuyển ra là **actual outgoing**, không phải `Reserved` và không thể thu hồi bằng một thao tác `STOP`.

### 5.3 Delivery acceptance và final payment

- Vendor/organizer nộp **DeliveryEvidence**: danh mục, số lượng nhận, xác nhận giao hàng, hóa đơn/giao dịch, người kiểm nhận, thời điểm, mô tả sai lệch, bản gốc riêng tư và public redacted.
- Reviewer kiểm điều kiện giao hàng/quality **đã được phê duyệt trước**; kết quả `MET`, `PARTIAL`, `NEEDS_INFORMATION`, `NOT_MET`, `INCONCLUSIVE` cần phân biệt, không dùng `MET` của stage B khi semantics khác.
- Đợt cuối của request phải kết thúc `challengeWindow`; nếu có case hợp lệ thì **khóa** final payment cho đến khi giải quyết; im lặng không tự chứng minh giao hàng đúng.
- `AcceptedDeliveryValue_i` = tổng giá trị **đã nghiệm thu cuối cùng và chưa bị treo tranh chấp** theo payment terms; reviewer phải cung cấp reason/report hash và số nguyên token. Điều kiện chất lượng/khối lượng không được tự động suy từ ảnh hoặc hash.
- Final payment V1 là một lần, trên cùng `vendorWallet`, do contract kiểm tra trên trạng thái sau challenge.

**Giới hạn an toàn tại thời điểm final payout:**

```text
NetPaid_i = GrossPaid_i - ActualReturned_i
PayableByAcceptedDelivery = max(0, AcceptedDeliveryValue_i - NetPaid_i)
PayableByGrossCap = ApprovedAmount_i - GrossPaid_i
PayableNow <= min(PayableByAcceptedDelivery, PayableByGrossCap, Reserved_i)
```

Bên cạnh bất đẳng thức: `DeliveryAcceptance` đúng version, challenge hết hạn, không tồn tại blocking dispute, account authority hợp lệ, campaign state cho phép payment, vendor terms chưa hủy.

Nếu `GrossPaid_i` đã đạt cap, vendor trả lại một phần **không tự mở lại quyền trả thêm**. Reimbursement/return chỉ ghi nhận tiền trở lại; muốn thay chính sách thanh toán phải đề nghị request mới sau khi xử lý nghĩa vụ trước đó.

Ví dụ V1: Q=1.000, D=200, accepted delivery=700; final payout tối đa `min(700-200, 1000-200, 800)=500`; 300 còn reserve được release **chỉ khi** phần đơn hàng còn lại được hủy/đóng nghĩa vụ hợp lệ. Nếu accepted delivery=100, không trả thêm; phần cọc vượt giá trị nghiệm thu 100 được chuyển `Unresolved` để thu hồi hoặc xử lý tranh chấp (không tự biến thành loss ngay).

### 5.4 `Reserved` được giải phóng vào lúc nào?

**Không giải phóng phần chưa trả chỉ vì giao hàng chưa đủ hoặc hết thời gian.** Phải có một trong các căn cứ được chấp thuận:

- Hợp đồng mua hàng/đề nghị chi đã được **hủy trước khi vendor có quyền được trả**.
- Hai bên xác nhận dừng phần chưa cung cấp, quyền vendor đối với residual đã được giải quyết.
- Reviewer/arbiter xử lý tranh chấp theo chính sách đã chốt, xác định chính xác nghĩa vụ còn lại.
- Claim deadline/hard stop đã hết **và** điều khoản ban đầu công bố rằng quyền nhận của vendor không còn tồn tại sau mốc đó; không tự suy luật này với giao dịch đời thực.

Trong wind-down, `Reserved` cho nghĩa vụ thực sự có thể thanh toán được giữ thành `ObligationLocked`; chỉ khoản `Available` hay reserve được giải phóng mới tạo entitlement refund. Đây là thay đổi quan trọng nhất so với `_snapshot` của B.

### 5.5 Partial delivery / supplier thất bại

V1 hỗ trợ **một lần delivery acceptance cuối**, gồm `FULL`, `PARTIAL`, `NONE`; không hỗ trợ lịch giao nhiều đợt với vô số lần final payout. Khi partial:

- Giá trị đã nhận/đã nghiệm thu được ghi riêng.
- Phần chưa nhận: thỏa thuận giao bổ sung khi còn hạn hoặc hủy/đưa vào case.
- Nghĩa vụ vendor còn lại và quyền hoàn cọc phải được xác định trước khi release residual.
- Không được nâng accepted value để hợp thức hóa hàng kém/thiếu đã phát hiện.

Muốn hỗ trợ nhiều delivery installments trong V2, phải đặc tả `accepted cumulative value`, `paid gross cumulative`, `returns`, `reversal`, `nonce` và double-payment invariants trước.

### 5.6 Chuyển ví vendor và phương thức thanh toán

V1 **không đổi ví nhận tiền trên request đã duyệt**. Khi chưa chuyển tiền: hủy request, release reservation, tạo proposal mới có xác thực lại. Khi đã đặt cọc: chỉ tạo request khác sau khi chốt nghĩa vụ/tổn thất với vendor trước, không thay dữ liệu cũ.

Một ví trung gian/off-ramp nhận stablecoin **không** được coi là vendor giao hàng/đã nhận VND. Thanh toán ngân hàng, cash payment và bridge là một nghiên cứu riêng về reconciliation, counterparties, thời điểm hoàn thành và nghĩa vụ pháp lý.

---

## 6. State machine chuẩn hóa — không dùng một enum cho mọi chiều

### 6.1 Campaign lifecycle

```text
DRAFT -> UNDER_REVIEW -> APPROVED -> FUNDING
  -> FUNDED -> ELIGIBILITY_CHECK -> ACTIVE
  -> WIND_DOWN -> COMPLETED or STOPPED

Funding not met / invalid approval -> STOPPED -> refund
ACTIVE --purpose completed + all request obligations resolved--> COMPLETED
ACTIVE --serious violation / deadline / issuer issue--> WIND_DOWN
WIND_DOWN --obligations resolved and refund rights snapshotted--> STOPPED
```

- `ACTIVE` nghĩa là có thể xét request, **không** nghĩa là tự động phát tiền.
- `WIND_DOWN` đóng tạo request/đặt cọc mới; chỉ cho phép giải quyết nghĩa vụ hợp lệ, refund unencumbered, return/recovery và hoạt động khắc phục theo policy.
- Không tự giả định `WIND_DOWN` luôn kết thúc hữu hạn: cần deadline, khả năng escalation, và trạng thái minh bạch khi tài sản bị khóa vì tranh chấp chưa thể phân xử; liveness là OPEN cần duyệt.
- `COMPLETED` là đạt tiêu chí outcome và các nghĩa vụ tài chính được quyết toán; trạng thái này không cấm vendor return muộn có cap hợp lệ hoặc supplementary refund theo chính sách.

### 6.2 FundingRequest lifecycle (financial authorization)

```text
DRAFT -> SUBMITTED -> NEEDS_INFORMATION -> RESUBMITTED
                \-> REJECTED
       SUBMITTED -> APPROVED_RESERVED
           -> DEPOSIT_READY -> DEPOSIT_PAID
           -> AWAITING_DELIVERY -> DELIVERY_UNDER_REVIEW
           -> ACCEPTED_PENDING_CHALLENGE
             -> [case? DISPUTED -> RESOLVED -> (ACCEPTED/REWORK/CANCEL)]
           -> FINAL_PAYMENT_READY -> FINAL_PAID
           -> FINANCIAL_RECONCILIATION
           -> FINANCIALLY_SETTLED
           -> (OUTCOME_PENDING | OUTCOME_VERIFIED)

Before any transfer: APPROVED_RESERVED -> CANCELLED -> RELEASED
After transfer: cannot 'CANCEL' monetary history; use DISPUTED / RECOVERY / LOSS / SETTLED
```

Để hạn chế bùng nổ state, implementation nên dùng ba dimension với guard nhất quán:

| Dimension | Enum đề xuất | Ý nghĩa |
|---|---|---|
| `reviewStatus` | `SUBMITTED/NEEDS_INFO/APPROVED/REJECTED` | Quyền đề nghị/đánh giá |
| `paymentStatus` | `UNRESERVED/RESERVED/DEPOSIT_PAID/FINAL_READY/FINAL_PAID/RECONCILING/SETTLED/DISPUTED` | Điều kiện và quyền chuyển tiền |
| `outcomeStatus` | `NOT_STARTED/PENDING/VERIFIED/FAILED/DISPUTED` | Hoàn thành mục tiêu từ thiện |

**Một nguồn sự thật on-chain cho payment state**, còn DB giữ bản đọc và report; không được xây hai state machine có thể bất đồng mà đều tự ra quyết định thanh toán. UI sử dụng snapshot có `checkpoint`, thời gian chain và `indexed/confirmed` status.

### 6.3 Transition authorization matrix

| Hành động | Caller hợp lệ | Preconditions phải kiểm trên chain | Tác động custody |
|---|---|---|---|
| `approveRequest` | Resolver | Campaign active, correct request/version/terms, no conflict, đủ unreserved cash, caps | `Available -= Q`, `Reserved += Q` |
| `payDeposit` | Authorized executor hoặc permissionless sau approval | Ready, đúng vendor, chưa trả cọc, chưa hết hạn, exposure room đủ | `Reserved -= D`, `GrossOut += D`, `E -= D` |
| `submitDelivery` | Organizer hoặc vendor được ràng buộc | Đúng request và evidenceVersion; còn hạn, có package | Không chuyển tiền |
| `acceptDelivery` | Reviewer | `DeliveryEvidence` đúng terms/version, lý do/report, không tự duyệt | Ghi accepted candidate; chưa trả tiền |
| `challengeDelivery` | Donor đủ điều kiện hoặc resolver | Đúng evidence version, trong cửa sổ, case chưa lặp | Khóa final payout |
| `finalizeDelivery` | Permissionless sau challenge hoặc resolver theo policy | Hết window, no blocking case, value có authority | Ghi accepted final; chưa trả tiền |
| `payFinal` | Executor được phép | Delivery finalized; cap/remaining/reserve/recipient/challenge | `Reserved -= P`, `GrossOut += P`, `E -= P` |
| `returnForRequest` | Vendor (hoặc nguồn đã verified/provenance) | Amount positive, exact transfer, đúng request, tổng return <= gross paid | `R += amount`, `E += amount`, chuyển vào Quarantined/Refund theo trạng thái |
| `settleRequest` | Resolver + đủ checkpoint | Paid/returned/accepted/unresolved đúng và nghĩa vụ residual resolved | Release `Reserved` chưa cần -> `Available` hoặc refund |
| `stopCampaign` | Resolver, hoặc timeout caller đúng policy | Chốt lý do; khóa request mới/advance mới | Chuyển sang wind-down, không claw back |
| `allocateRefund` | Contract sau resolution | Pool bằng **cash free of vendor obligations**, snapshot đúng thời điểm | E không đổi, di chuyển từ Available sang RefundAllocated |
| `claimRefund` | Donor theo ví góp | Entitlement > 0 và chưa nhận phần đó, nonReentrant | `RefundAllocated -= claim`, `F += claim`, `E -= claim` |

**Lưu ý sự kiện:** deadline elapsed không tự chạy transition. Worker/caller phải gửi transaction để nhận receipt; timeout callback không được mở quyền giải ngân sai. Khi resolver biến mất, chính sách tối thiểu phải giữ funds trong escrow và có đường STOP được quy định, không dùng tự động duyệt để giải bế tắc.

---

## 7. Hai vòng bằng chứng độc lập

### 7.1 Financial delivery evidence (`requestId`-scoped)

Bằng chứng tối thiểu cho `GIFT_DISTRIBUTION` mua hàng: purchase order/terms (trước trả), báo giá đối chiếu, thông tin vendor hợp lệ, chứng từ đặt cọc thực tế (sau trả), hóa đơn giao dịch, danh mục và số lượng hàng nhận, người kiểm nhận, ảnh giao hàng nếu phù hợp, phần thiếu/không đạt, mô tả giá trị được chấp nhận, bản public redacted và original private.

Reviewer cần đánh giá **tính liên quan, hợp lệ, nhất quán và mức độ xác minh được**; `hash` chỉ chứng minh tính toàn vẹn của bytes được cung cấp, không chứng minh vendor thực tồn tại hoặc hàng đã được giao.

### 7.2 Charitable outcome evidence (`campaignId`/`activity`-scoped)

Khi hàng được mua nhưng chưa trao, `FinancialSettlement=SETTLED` **không** tự chuyển `Outcome=VERIFIED`. Cần checklist bàn giao, số lượng thực trao, đúng người/cơ sở thụ hưởng, nguồn độc lập xác nhận khi khả thi, phân loại `PASS/FAIL/INCONCLUSIVE` và cơ chế challenge. PII chỉ lưu ở original, bản công khai phải che danh tính khi cần.

Request vận chuyển có thể cần mở **sau** khi request mua hàng đã đối chiếu tài chính, **trước** khi outcome cuối cùng được xác minh. Không khóa mọi hoạt động đến khi đã phát quà xong vì như vậy tạo deadlock. Thay vào đó, hệ thống giới hạn số tiền ở những nghĩa vụ outcome còn mở và dependency giữa purchase -> transport -> handover; policy V1 có thể duyệt vận chuyển khi request mua `FINANCIALLY_SETTLED` và tồn kho/nhận hàng đã chứng minh.

### 7.3 Evidence version / source integrity

- `originalHash` và `publicHash` riêng; phiên bản cũ giữ nguyên bất biến và tra cứu được.
- Một reviewer report phải tham chiếu `evidenceHash`, version, `termsHash`, accepted value, checklist outcome, reason, conflict declaration, deadline/checkpoint; không chỉ một boolean duyệt.
- Nếu redacted bundle không thể truy cập, không tự bắt đầu challenge window; fail safe như policy B.
- Upload/freeze không tự phát transaction; backend phải trình signer xem nội dung, contract đúng chain và phiên bản, sau đó index receipt.
- Không lưu PII hoặc presigned URL trên blockchain/public events.

---

## 8. Kế toán và bất biến tài chính — chuẩn để viết Foundry invariant

**Giả định model V1:** ERC-20 exact transfer MockUSDC 6 decimals; không fee/rebase, không thanh toán fiat, không phí trừ donation; tất cả tính theo integer base units (`uint256` / TypeScript `bigint`). Một campaign có một escrow accounting ledger; contract nhiều campaign phải còn kiểm bảo đảm global custody.

### 8.1 Định nghĩa counters tuyệt đối (không reset bởi refund/snapshot)

| Biến | Nghĩa |
|---|---|
| `C` | Tổng token thực nhận qua donate, donor weights cố định sau fundraising |
| `G` | **Gross outgoing** thực sự chuyển khỏi escrow cho vendor / organizer / reimbursement (V1 P1 chỉ vendor) |
| `R` | Token thực sự quay lại contract được ghi nhận qua `returnForRequest`, không gồm hứa hoàn hay invoice credit |
| `F` | Tổng token đã refund thành công tới donor |
| `E` | Accounting custody của campaign hiện ở escrow, không tính tiền đã rời contract |
| `Available` | Custody chưa cam kết với request/vendor/refund |
| `Reserved` | Custody đã dành cho payment request nhưng chưa rời contract |
| `RefundAllocated` | Custody đã được gán nghĩa vụ refund, có thể chưa được claim |
| `Quarantined` | Custody đã nhận nhưng đang cần phân loại hoặc bị khóa vì tranh chấp/chưa xác định entitlement |
| `GrossPaid_i`, `Returned_i` | Outgoing và actual recovery của request i, cộng dồn không âm |
| `AcceptedSpent_i` | Giá trị hàng/dịch vụ được nghiệm thu và đối chiếu với **net funds** của request i |
| `Unresolved_i` | Net funds đã ra nhưng chưa được giải trình hợp lệ hoặc đang tranh chấp/đòi hoàn |
| `RealizedLoss_i` | Tổn thất thuần đã ghi nhận nhưng **chưa được thu hồi**; khi có late recovery có thể giảm bằng một bút toán tái phân loại có dấu vết |

**INV-01 Conservation:**

```text
C + R = G + F + E
E = Available + Reserved + RefundAllocated + Quarantined
G = sum_i GrossPaid_i
R = sum_i Returned_i
For every i: 0 <= Returned_i <= GrossPaid_i
```

Trong trường hợp token gửi trực tiếp vào contract **ngoài** các hàm đã định danh, phần đó là excess unassigned, không cộng vào `C` hoặc `R`; invariant liên hệ token balance như `token.balanceOf(contract) >= sum(E across campaigns)`. Không được tự ghi donation cho người gửi hoặc tự lấy excess để trả payout. Đặc tả vận hành phải có chính sách riêng để xử lý excess, tránh mở withdrawal tùy tiện.

**INV-02 No double reservation:**

```text
For every request i:
   Approved_i = GrossPaid_i + Reserved_i + ReleasedUnused_i
   Approved_i > 0
   GrossPaid_i <= Approved_i
   ReleasedUnused_i >= 0
   Reserved_i >= 0
sum(Reserved_i) = Reserved
All reserve-to-payout moves are atomic
```

Phương trình trên dùng `Approved_i` như gross cap khóa tại approval; **return vendor không restore gross cap**. Không được reset `GrossPaid_i` khi có recovery. Nếu một request chưa được duyệt thì `Approved_i=0` và không có reserve hay payout.

**INV-03 Request paid conservation/classification:**

```text
NetPaid_i = GrossPaid_i - Returned_i
NetPaid_i = AcceptedSpent_i + Unresolved_i + RealizedLoss_i
All terms >= 0
```

Đây là sổ phân loại **net token outflow**, không phải sổ định giá hàng hóa nếu value của hàng đổi theo tỷ giá hay thị trường. `AcceptedSpent_i` chỉ là khoản đối chiếu từ token đã chuyển. Việc ghi `Loss` không làm `E` tăng và không tạo quyền refund mới. Khi vendor trả tiền **sau khi đã ghi loss**, `R` và `E` chỉ tăng theo actual receipt; `RealizedLoss_i` (tổn thất thuần chưa thu hồi) được giảm theo đúng request bằng sự kiện phân loại, trong khi **`LifetimeLossRecognized` là bộ đếm lịch sử chỉ tăng**, không xóa các lần mất tiền trước đó. Khi phát hiện evidence nghiệm thu sai, phải có transition/decision có dấu vết để reclassify, không sửa thầm counter lịch sử.

**INV-04 Deposit and final guard:**

```text
Deposit_i <= min(Approved_i, Approved_i * alpha_i, AbsoluteDepositCap_i)
GrossPaid_i cannot exceed Approved_i
FinalPayout_i <= max(0, FinalAcceptedDeliveryValue_i - NetPaid_i)
FinalPayout_i <= Reserved_i
GrossPaid_i + FinalPayout_i <= Approved_i
No final payout before finalized delivery/challenge + zero blocking disputes
```

**INV-05 Exposure + cumulative loss control:**

```text
OutstandingExposure = sum_i Unresolved_i
OutstandingExposure <= CampaignExposureCap, whenever creating new exposure
CurrentNetLoss = sum_i RealizedLoss_i
LifetimeLossRecognized >= CurrentNetLoss
LifetimeLossRecognized never decreases after recovery/reclassification
Any lifetime-loss threshold violation -> freeze new payout / WIND_DOWN per approved policy
```

Sau reclassification một khoản từ `Unresolved` sang `Loss`, outstanding exposure có thể giảm nhưng **không** được cấp request mới nếu tổn thất lịch sử lũy kế đã vượt ngưỡng. Late recovery giảm **net loss** chứ không reset `LifetimeLossRecognized`. Không thể bảo đảm tổng thiệt hại chỉ bằng cap exposure cho từng lúc nếu campaign chạy nhiều request nối tiếp.

**INV-06 Refund solvency / entitlement:**

```text
BasePool + SupplementPool >= TotalRefundPaid
Each donor's paid <= their cumulative entitlement
All actual refund transfers reduce E and RefundAllocated atomically
Available and Reserved never count as RefundAllocated simultaneously
```

Cần test cross-request/cross-campaign và các trường hợp rounding, multiple late recoveries, claim trước/sau bổ sung. **Chỉ có conservation không đủ chứng minh refund đúng người.**

**INV-07 No retroactive authorization:** một khi token đã chuyển, không thể tăng accepted amount, thay vendor hoặc chỉnh deadline/challenge để làm cho lệnh chuyển tiền sai trở nên hợp lệ hồi tố. Approval/evidence/report history immutable ở mức commitment và event.

**INV-08 Correct recipient:** contract chỉ chuyển cho `vendorWallet` đã khóa trong request/phê duyệt hoặc donor chính ví đã góp; backend/client không tự cung cấp arbitrary payout recipient khi execute.

### 8.2 Trace kiểm tra ví dụ P1 (không có phí)

**Khởi đầu:** `C=2000, R=0, G=0, F=0, E=2000`, request được duyệt `Q=1000`:

| Bước | Available | Reserved | Gross Out G | Recovery R | Custody E |
|---|---:|---:|---:|---:|---:|
| Donate đủ mục tiêu | 2000 | 0 | 0 | 0 | 2000 |
| Approve/Reserve | 1000 | 1000 | 0 | 0 | 2000 |
| Pay deposit 200 | 1000 | 800 | 200 | 0 | 1800 |
| Giao hàng được chấp nhận 700, trả thêm 500 | 1000 | 300 | 700 | 0 | 1300 |
| Hủy phần chưa giao, giải phóng reserve 300 | 1300 | 0 | 700 | 0 | 1300 |

Tại mọi thời điểm `C+R=G+F+E`, request gross cap 1000 không tự động bị tăng. `AcceptedSpent=700`, `Unresolved=0`, `RealizedLoss=0` sau financial close, nhưng **outcome từ thiện vẫn có thể pending**.

**Vendor thất bại:** cọc 200, không giao hàng, hoàn thật 50, phần 800 reserve được hủy **sau xác nhận quyền vendor chấm dứt**:

```text
C=2000, G=200, R=50, F=0, E=1850
Available=1850, Reserved=0
NetPaid=150 = AcceptedSpent(0) + Unresolved(0) + RealizedLoss(150)
```

Nếu vendor chưa thực sự hoàn 50, phải giữ `R=0`, `E=1800`, `Unresolved=200` cho đến khi xử lý. Không coi khoản dự kiến hoàn hoặc phán quyết thu hồi là token đã về escrow.

**Trường hợp nhận thiếu 100 sau cọc 200:** trước khi đánh dấu loss: `NetPaid=200 = AcceptedSpent(100) + Unresolved(100) + Loss(0)`; final payout=0. Nếu vendor còn nghĩa vụ giao bổ sung, không được tự release toàn bộ reserve. Nếu hợp đồng hủy hợp lệ và vendor không trả lại dư thì sau xử lý mới ghi `Loss(100)`.

---

## 9. STOP, refund, late return và quyền donor: vấn đề ưu tiên cao

### 9.1 Không copy `_snapshot` của B nguyên trạng

B hiện snapshot `basePool=custody`. Trong HED, giả sử custody 1.800 USDC nhưng 800 đang reserve cho vendor đã đặt cọc và phát sinh nghĩa vụ giao hàng. Nếu dùng B snapshot 1.800 cho donor và vendor cùng có quyền đòi 800, contract có thể hứa quá số tiền có thể thanh toán.

**Quy tắc HED:** `STOP` chuyển `ACTIVE -> WIND_DOWN`, đóng khoản đặt cọc/yêu cầu mới, xác định obligation còn tồn tại theo terms đã được duyệt; chỉ **cash không bị ràng buộc bởi nghĩa vụ vendor hợp lệ** được chuyển sang quyền refund. Giao dịch refund không bao giờ rút từ `Reserved`/`Quarantined` bị khóa.

**Các dòng tiền sau STOP:**

1. `Available` đủ điều kiện -> `RefundAllocated` trong base snapshot khi mở refund.
2. `Reserved` release sau final settlement/cancellation -> `RefundAllocated` supplement bằng **internal accounting reallocation**, không tăng `R` hay `E` (tiền vốn đã nằm trong custody).
3. Vendor hoàn tiền thực nhận sau STOP -> `R += actualAmount`, `E += actualAmount`, đồng thời được allocation vào supplement theo policy; không tạo quyền mới từ khoản hứa trả.
4. `Quarantined` chỉ giải phóng theo một quyết định rõ nguồn và quyền, không tự trả vendor/donor.
5. Không bao giờ dùng tiền campaign khác hoặc donation đến sau funding để bù cho request đã thất bại.

**Liveness:** Đơn hàng tranh chấp có thể làm một phần vốn bị giữ; phải định nghĩa đường xử lý có hạn và người chịu trách nhiệm trước khi triển khai. Nếu pháp lý/off-chain không có căn cứ đóng nghĩa vụ, UI phải ghi `locked/unresolved` thay vì báo donor sắp được hoàn toàn bộ.

### 9.2 Entitlement theo donor — đề xuất nhất quán với B nhưng kiểm lại trong HED

Không có donor exit ở v0.3. Đóng góp `c_i` cố định, `C=sum(c_i)`; sau snapshot:

```text
base_i = floor(c_i * BasePool / C)          (chỉ còn nếu chưa claim base)
supplement_due_i = floor(c_i * SupplementPool / C) - supplementPaid_i
claimable_i = base_unclaimed_i + supplement_due_i
```

`SupplementPool` là **pool entitlement tích lũy**, không phải số dư ngân hàng tại thời điểm xem. Không decrement pool vì có claim; chỉ tăng paid counter/giảm custody. Các khoản `Reserved` được giải phóng sau snapshot chỉ bổ sung đúng một lần khi event chuyển sang `RefundAllocated`; recovery sau snapshot cũng bổ sung đúng một lần khi actual transfer vào contract.

**C=0:** không cho tạo positive refund pool do donor, cần riêng logic đối với khoản token ngoại lai (đề xuất fail-closed). **Rounding:** dùng floor; dust giữ custody không sweep và không trộn với unclaimed entitlement; test không overpay. **Không expiry:** giữ hướng pilot B để không lén thay quyền donor. **Transfer failed:** rollback cả trạng thái claim/counters, cho retry. **Late return:** donor đã claim base/supplement có thể claim increment sau. **Donor wallet:** trả về đúng ví đã góp, không tự động chuyển tới ví mới chỉ vì thay account link.

**Không thêm donor exit** vào công thức này; nếu nghiên cứu exit sau này phải xác định riêng quyền trên tiền chưa cấp, quyền đối với recoveries trước/sau exit và nhiều amendment. Không được xóa contribution rồi nghĩ đó là thiết kế refund.

### 9.3 Terminal `COMPLETED` với tiền dư

`COMPLETED` yêu cầu outcome đã đạt, các request đã `FINANCIALLY_SETTLED` hoặc `LOSS_RESOLVED`, không còn obligation vendor hợp lệ cần reserve, những khoản thừa đã được release và refund allocation nếu chính sách donor yêu cầu. Không ép donor claim hết mới completed; donor vẫn có quyền refund/bổ sung nếu còn entitlement.

---
## 10. Ranh giới kiến trúc mới — triển khai song song, không đè B

```text
React/Vite (organizer / staff / resolver / donor)
        |       wallet signing: wagmi + viem
        |       HTTP typed client: OpenAPI
        v
NestJS API /v1/disbursement
   | Auth/SIWE / organization verification / access
   | CampaignCommitment / FundingRequest / VendorVerification
   | Evidence private+public / DeliveryReview / OutcomeReview
   | PolicyEvaluator / tx-preparation (NOT custody)
   v
PostgreSQL + Drizzle (metadata, encrypted/restricted evidence refs, projections)
MinIO / S3-compatible (private original, public redacted)
   ^
   | indexed events, reorg rollback, checkpoint
   |
HED Indexer <----- RPC <----- FundTogetherDisbursement.sol
    ^                                |
    |                                +--> USDC escrow / reserved ledger
    |                                +--> payDeposit() / payFinal() -> vendor wallet
    |                                +--> returnForRequest() <- vendor wallet
    |                                +--> claimRefund() -> contributor wallet
    +--- ABI + chainId + deploymentId + codeHash + policyHash
```

**Tiếp tục giữ** source A/B, data, chain và deployment hiện tại. New `protocolKind` (tạm `DISBURSEMENT`, tên chính thức OPEN) và `workflowPolicy` riêng phải tách biệt để FE/BE từ chối giao dịch tới sai chain/contract/ABI.

### 10.1 Danh sách file đề xuất tạo mới

| Ưu tiên | File/directory đề xuất | Mục đích, phạm vi bắt buộc |
|---|---|---|
| P0 | `docs/hybrid-disbursement-change-spec.md` | **Chính file này** sau review/approve; giữ nguồn/changelog/decision log |
| P0 | `docs/hybrid-disbursement-financial-rules.md` | Tách từ mục 8–9 thành formal spec, chỉ sau khi OPEN đã được chốt |
| P0 | `contracts/src/FundTogetherDisbursement.sol` | New contract thay vì upgrade `FundTogetherAdvance.sol` |
| P0 | `contracts/src/disbursement/DisbursementTypes.sol` | Domain types, states, decision refs, limits và event types; giữ nhỏ |
| P0 | `contracts/test/unit/Disbursement/*.t.sol` | Funding, approve/reserve, deposit, delivery, final payout, return, STOP/refund, failures |
| P0 | `contracts/test/invariant/FundTogetherDisbursementInvariant.t.sol` | INV-01..08, handler fuzz và multi-request interleavings |
| P1 | `backend/src/disbursement/` | Module NestJS theo pattern hiện hữu: campaign, requests, vendor verification, evidence, review, tx preparation, projections |
| P1 | `backend/src/database/schema/disbursement.schema.ts` | Tables mới; không đổi `advance.schema.ts` vì B vẫn cần chạy |
| P1 | `backend/drizzle/..._disbursement.sql` | Drizzle migration append-only, chạy riêng trên DB/pilot HED nếu cần |
| P1 | `backend/src/blockchain/generated/disbursement/` | ABI/policy từ Foundry artifact, không viết tay |
| P1 | `backend/scripts/disbursement/` | deploy/context/seed/smoke/fixtures/replay, tách B |
| P1 | `frontend/src/features/campaigns/disbursement/` | Create Request, vendor, approvals, tx progress, delivery, settlement |
| P1 | `frontend/src/features/review/DisbursementReview.tsx` | Queues approve deposit / review delivery / disputes với conflict/reason |
| P1 | `frontend/src/features/explore/DisbursementCampaignDetail.tsx` | Donor timeline và cơ chế challenge/refund mới |
| P1 | `frontend/src/lib/web3/disbursement-action.ts` | Call preparation, context verification, wallet chain, receipts, pending/retry |
| P1 | `frontend/src/lib/api/generated/disbursement.ts` | OpenAPI generated, không copy DTO thủ công |
| P2 | `docs/hybrid-disbursement-experiments.md` | Protocol evaluation B0/B1/B2, scripts, metrics, reviewer references |

**Không** khởi tạo 10 service trừ khi có nhu cầu code thật: có thể bắt đầu một `DisbursementModule` với vài services theo domain. Danh sách trên là **boundary map**, không phải yêu cầu sinh scaffold rỗng.

### 10.2 Contract interfaces (pseudocode, CHƯA compile)

```solidity
// Chỉ là các entrypoint đề xuất: tên, tham số, guard cần được review.
// Không dùng đoạn này để deploy/giữ tiền.

submitCampaign(commitmentHash, goal, fundingDuration, organizerWallet);
approveCampaign(campaignId, commitmentHash, eligibilityHash);
publishCampaign(campaignId);
donate(campaignId, amount);
confirmCampaignEligibility(campaignId, eligibilityHash);

// APPROVAL reserves the WHOLE approved amount in escrow.
approveRequest(campaignId, requestId, version, termsHash,
               vendorWallet, approvedGross, depositAmount,
               deliveryDeadline, evidencePolicyHash);
payDeposit(campaignId, requestId);

submitDeliveryEvidence(campaignId, requestId, evidenceVersion, evidenceHash);
recordDeliveryDecision(campaignId, requestId, evidenceVersion,
                       acceptedValue, publicHash, reportHash);
openDeliveryCase(campaignId, requestId, evidenceVersion, reasonHash);
resolveDeliveryCase(campaignId, requestId, evidenceVersion, resolution, reasonHash);
finalizeDelivery(campaignId, requestId, evidenceVersion);
payFinal(campaignId, requestId);

returnForRequest(campaignId, requestId, amount);
releaseUnusedReservation(campaignId, requestId, releaseAmount, reasonHash);
settleRequest(campaignId, requestId, settlementHash);

startWindDown(campaignId, reasonHash);
finalizeRefundAllocation(campaignId, refundDecisionHash);
claimRefund(campaignId);
```

Thiết kế entrypoint phải phân biệt hành động **được phép bởi bất kỳ caller** với hành động chỉ resolver hoặc organizer được gọi. Với mọi external payment: validate -> effects -> `nonReentrant` + safe exact-transfer; event phát sau chuyển thành công; revert toàn state nếu transfer fail. Phê duyệt có nonce/version chống replay và phải xác nhận expected state ngay trong contract, không chỉ backend.

### 10.3 Contract storage tối thiểu — đề xuất

```text
Campaign {
   immutable-like commitmentHash, organizer, goal, contributed,
   cumulativeGrossPaid, cumulativeReturned, cumulativeRefunded, custody,
   available, totalReserved, refundAllocated, quarantined,
   state, fundingEnd, protocolPolicyId, refundBasePool, refundSupplementPool,
   outstandingExposure, currentNetLoss, lifetimeLossRecognized
}
Request {
   campaignId, requestId, version, vendorWallet, termsHash,
   approvedAmount, depositAmount, grossPaid, actualReturned,
   reserved, releasedUnused, acceptedDeliveryValue,
   acceptedSpent, unresolved, currentNetLoss,
   evidenceHash, evidenceVersion, publicHash, reportHash,
   challengeEnd, deliveryDeadline, requestState, finalPaymentConsumed
}
DonorLedger { contribution, baseClaimed, supplementPaid }
```

Không lưu toàn bộ hóa đơn, ảnh hoặc dữ liệu người nhận trên chain. Với số lượng requests lớn, cần thử gas khi lưu mapping và emitted events. V1 không yêu cầu proxy upgradeability; deployment mới là đường ranh giới quyền tiền mới.

### 10.4 Các event tối thiểu để replay ledger

```text
CampaignCommitted, CampaignApproved, CampaignPublished, DonationReceived,
CampaignFunded, RequestSubmittedReference, RequestReserved,
VendorVerificationReferenced, DepositPaid, DeliveryEvidenceCommitted,
DeliveryReviewed, DeliveryChallengeOpened, DeliveryChallengeResolved,
DeliveryFinalized, FinalPaymentPaid, VendorFundsReturned,
ReservationReleased, RequestSettlementRecorded, ExposureReclassified,
WindDownStarted, RefundAllocated, RecoveryAllocated,
RefundClaimed, CampaignCompleted, CampaignStopped
```

Event `RequestReserved`, `DepositPaid`, `FinalPaymentPaid`, `VendorFundsReturned`, `ReservationReleased`, `RefundAllocated` phải có amount, request/campaign ID, frozen version/reference phù hợp. Không dùng sự kiện off-chain để tăng custody/paid trên indexer khi thiếu on-chain receipt.

### 10.5 Backend schema (PostgreSQL/Drizzle)

Tối thiểu:

- `disbursement_campaign_commitments`: metadata ID, deployment identity, immutable frozen canonical bytes/hash, goal/funding duration, `activityType`, commitment policy ID.
- `disbursement_requests`: campaign ID, per-campaign request key, version, vendor ID, request kind, amount base-unit (numeric(78,0) hoặc DB integer-safe), business status, off-chain packet hashes, timestamps.
- `disbursement_request_items`: currency unit, quantity, unit amount, goods/service, justification, category, evidence refs.
- `disbursement_vendor_records`: organization/vendor legal metadata, wallet verification evidence, conflict declaration, validUntil; **PII restricted**.
- `disbursement_review_decisions`: reviewer, evidence/version, reasonBytes/hash, decision/acceptedValue, policy version, signed/on-chain record reference, immutable.
- `disbursement_evidence_packages`: original references (private), public redacted references, freeze/version, storage hashes, request/outcome discriminator.
- `disbursement_request_projection`: indexer stream, chain campaign+request ID, canonical snapshot, chain block hash and indexed block.
- `disbursement_request_events` nếu event store hiện hành không thể tái dùng theo stream ID; ưu tiên tái dùng `chainEvents`/`indexerStreams` nếu identity/canonicality đủ.
- `disbursement_recovery_records`: actual token receipt reference, vendor/source, request ID, classification và reviewer decision; **không dùng records này thay on-chain custody**.

**SQL concurrency:** unique `(deploymentId, campaignId, requestId, requestVersion)`; unique applicable invoice fingerprint per relevant scope (có đường override giải trình, không tự coi hash trùng = gian lận); foreign keys đủ để không gán evidence/request khác campaign; optimistic `expectedRevision` trước freeze; transaction isolate khi reserve metadata/review. Nhưng chống double spend **quyết định cuối trên chain**, không dựa vào Postgres lock.

### 10.6 API route sơ bộ (không tự coi đã triển khai)

| Endpoint đề xuất | Authorization | Nội dung |
|---|---|---|
| `POST /v1/disbursement/campaigns/:id/requests` | Organizer OWNER | Tạo yêu cầu chi, line items, vendor, payment mode P1 |
| `GET /v1/disbursement/campaigns/:id/requests` | Role-based; public redacted subset | List requests với chain-derived balances/status |
| `PATCH /v1/disbursement/requests/:id` | Organizer trước freeze | Sửa draft `expectedRevision`, không đổi approval sau freeze |
| `POST /v1/disbursement/requests/:id/freeze` | Organizer | Canonical hash + immutable snapshot |
| `POST /v1/disbursement/internal/vendors/:id/verify` | Staff authorized | Vendor status/expiry/COI record |
| `POST /v1/disbursement/internal/requests/:id/review` | Resolver | Decision reason + on-chain action preparation, không chuyển tiền từ API |
| `POST /v1/disbursement/requests/:id/actions/prepare` | Actor + SIWE wallet | Build viem call, expected block/state/nonce/policy |
| `POST /v1/disbursement/requests/:id/delivery` | Organizer/vendor policy | Submit original/private + publication request |
| `POST /v1/disbursement/internal/requests/:id/delivery-review` | Reviewer | Accepted value + checklist + report |
| `POST /v1/disbursement/requests/:id/disputes` | Eligible donor/resolver | Evidence-specific challenge, deadline guard |
| `GET /v1/disbursement/public/campaigns/:id/ledger` | Public | Amounts in escrow, reserved, paid, recovered, refunds, risk states |
| `GET /v1/disbursement/refunds/:id` | Auth + linked contributor wallet | Per-wallet entitlement + original contributor address |

API phải trả `state` + `pending next action` + blocker reason + `checkpoint` + `chain timestamp`. Cấu trúc prepare transaction nên theo chuẩn `advance-workflow.service.ts` nhưng có `protocolKind` mới. **API không giữ private key hoặc tự ký thay user** trừ khi sau này có thiết kế custody/relayer được duyệt riêng.

### 10.7 FE journeys cần thay đổi

**Organizer:** tạo campaign commitment -> xin duyệt/publish/fund -> tạo request -> upload báo giá/vendor -> chờ duyệt -> wallet xác nhận deposit -> theo dõi giao hàng -> gửi evidence -> nhận decision -> đối chiếu khoản dư/outcome.

**Resolver/staff:** xác minh vendor (gồm sở hữu ví/xung đột lợi ích) -> kiểm request/giá/tính cần thiết -> duyệt lượng cọc -> kiểm delivery evidence -> công khai report đủ redaction -> xử lý challenge và settlement.

**Donor:** xem campaign purpose, số tiền đang Available/Reserved/GrossPaid/Recovered, danh sách vendor đã được che thông tin nhạy cảm, loại quyết định và lý do -> challenge theo version -> STOP/refund có thể nhận -> late supplement.

**UX bắt buộc:** phân biệt `Approved`/`Reserved`/`Deposit paid`/`Final paid`/`Financially settled`/`Outcome verified`; không thông báo "đã chi cho người thụ hưởng" chỉ vì chuyển cho vendor; hiển thị **số tiền rủi ro hiện tại** và **tổng tổn thất đã ghi nhận**. Pending wallet signature, submitted hash, reverted tx, confirmed receipt và indexed projection phải là các trạng thái khác nhau; reload không gửi tx lặp.

---

## 11. Danh mục threat cases và guard bắt buộc

| ID | Kịch bản đối kháng / thất bại | Guard tối thiểu | Rủi ro còn lại |
|---|---|---|---|
| SEC-01 | Organizer đề nghị vendor giả/quen biết | Vendor verification, COI declaration, auditor trace, bounded deposit | Collusion không được loại bỏ tuyệt đối |
| SEC-02 | Duyệt 2 request cùng dùng 1 số dư | Atomic reservation on-chain, sum ledger equality, reentrancy protection | Indexer lag gây UI stale nhưng contract phải revert |
| SEC-03 | Tách 1 đơn hàng thành 10 yêu cầu để né cap | Campaign-wide exposure, vendor cumulative caps, invoice/order matching | Organizer có thể tạo nhiều vendor giả nếu review yếu |
| SEC-04 | Đổi ví vendor giữa approve/pay | Bind vendorWallet/termsHash/nonce/version; mismatch revert | Ví thật bị chiếm quyền kiểm soát sau verification |
| SEC-05 | Reuse invoice/file của request trước | Duplicate-check + original/private verification + decision log | Invoice có thể được làm giả với nội dung mới |
| SEC-06 | Reviewer nhầm/nhận hối lộ, khai `acceptedValue` sai | Conflict disclosure, decision transparency, donor challenge, threshold high-risk optional | Resolver collusion vẫn là trust assumption |
| SEC-07 | Donor phản đối spam nhằm trì hoãn | Eligibility by contribution snapshot, 1 case/version, bounded window & response | DoS liveness trong cửa sổ vẫn có thể xảy ra |
| SEC-08 | Provider chưa giao hàng, deposit đã paid | `payFinal` disabled, exposure cap, delivery deadline, recovery workflow | Tiền deposit có thể mất hết |
| SEC-09 | Vendor gửi "promised refund" nhưng chưa trả | Chỉ ghi `R` từ actual exact token inflow | Refund có thể không bao giờ về |
| SEC-10 | STOP khi vendor còn quyền thanh toán | WIND_DOWN, reserve obligation, chỉ refund unencumbered | Tiền bị khóa nếu nghĩa vụ không thể giải quyết |
| SEC-11 | Resolver mất khóa/biến mất | Expirable reviews, fail-closed, STOP escalation theo approved policy | Không giải quyết được mọi off-chain dispute tự động |
| SEC-12 | Token fee/rebase/blacklist/callback | MockUSDC exact transfer, SafeERC20 + before/after balance, nonReentrant | Token ngoài chính sách có thể khiến luồng mắc kẹt |
| SEC-13 | API/indexer báo thanh toán thành công quá sớm | Chain receipt + confirmations + canonical replay, no optimistic cash grant | Reorg, RPC outage, UI latency |
| SEC-14 | Public bundle rò rỉ danh tính người nhận | Private original + explicit redact + access logs + tests | Người nhập có thể upload nhầm thông tin nhạy cảm |
| SEC-15 | Gửi ERC-20 trực tiếp vào escrow | Unassigned excess, không tự tăng donations/refund entitlement | Cần quy trình phân loại tài sản ngoài giao thức |
| SEC-16 | Mua hàng xong nhưng không trao quà | Outcome verification độc lập, outcome exposure/stop rules | Bằng chứng ngoài đời có thể vẫn bị giả |
| SEC-17 | Replay approval trên chain/deployment khác | chainId, contract, deploymentId, policyHash, requestVersion + nonce | Chữ ký/khóa bị compromise |
| SEC-18 | Claim refund 2 lần giữa nhiều recovery | cumulative entitlement, per-wallet paid, nonReentrant, exact transfer, fuzz | Dust/unclaimed và issuer freeze cần policy riêng |

---

## 12. Phương pháp kiểm chứng NCKH có đối chứng

### 12.1 Thiết kế thực nghiệm

- **B0 (reference):** `FundTogetherAdvance.sol` Workflow B, fixed stage budgets, organizer nhận full advance mỗi stage. Chạy riêng environment đã cô lập.
- **B1 (request-based fixed):** các request vendor, same deposit cap cố định, một quy trình review cố định, không adaptive tiers.
- **B2 (risk-adaptive):** request giống B1 nhưng reviewer burden/deposit/approval rules thay đổi **dựa trên chính sách minh bạch**, không AI/MDP/QV.
- **P2/P3 hybrid expansion:** có thể thêm variant B3 sau khi P1 đủ chặt; đừng trộn vào kết luận B0/B1/B2 ban đầu.

**Kiểm soát biến:** cùng số donor/goal, đơn giá/kịch bản hàng hóa, reviewer error model, chain/local RPC, simulated timestamps, token, mức độ bất lợi vendor, thời gian evidence, cách chấm điểm, gas cost; nếu mô hình có nhiều hành động, giải thích rõ tại sao khác và chuẩn hóa thước đo.

**Đừng chỉ so sánh tỷ lệ thành công campaign** khi một model được cung cấp căn cứ/vendor đẹp hơn model khác. Lợi ích phải kiểm được bằng cùng event trace hoặc paired scenario seeds.

### 12.2 Bộ kịch bản mẫu để viết fixture và review labels

| Case | Tình huống | Kỳ vọng bản v1 |
|---|---|---|
| H01 | Vendor uy tín, không cần đặt cọc, giao đủ | Chỉ final payout sau delivery accepted/challenge |
| H02 | Deposit hợp lệ, giao đủ | Cọc trong cap, final đúng phần còn lại |
| H03 | Deposit đã trả, hết hàng, đổi vendor | Không redirect deposit; dispute/hủy nghĩa vụ cũ trước request mới |
| H04 | Giao thiếu 70/100 suất quà | Không trả tiền cho 30 suất chưa giao, settlement rõ |
| H05 | Tăng phí giao hàng sau khi request được duyệt | Không tự tăng Q; proposal mới trong purpose cap và available |
| H06 | Hóa đơn thanh toán lặp ở 2 requests | Block hoặc escalated manual review có bằng chứng |
| H07 | Hai approval cạnh tranh một escrow | Một giao dịch thắng, giao dịch kia revert khi insufficient Available |
| H08 | Vendor đổi ví sau khi cọc | Chặn; review hợp đồng và nghĩa vụ cũ |
| H09 | Vendor không giao và chỉ hoàn 1/4 cọc | STOP/challenge, R chỉ ghi actual, loss minh bạch |
| H10 | Reviewer sai chấp nhận hàng kém | Đo false acceptance và donor challenge, không coi hashing là verification |
| H11 | Reviewer offline hoặc hết hạn | Không tự chuyển tiền; watchdog đúng trạng thái và STOP fallback |
| H12 | Campaign STOP trong lúc order đang có nghĩa vụ | Refund free custody, reserve giữ nghĩa vụ, không overpromise |
| H13 | Vendor hoàn sau khi donor đã claim refund | Supplement entitlement đúng từng ví, không double claim |
| H14 | Organizer mua quà rồi cần thuê xe trước khi phát | Không deadlock vì outcome chưa verified; financial settlement vs outcome riêng |
| H15 | Gift distribution thật không hỗ trợ USDC vendor | Nhận diện applicability limit, không giả lập fiat payment như đã giải quyết |
| H16 | Evidence private/public hash không khớp | Không mở payment/challenge bằng bundle lỗi |
| H17 | Reorg sau tx `DepositPaid` | Indexer rollback, state/UI không giữ payout confirmed giả |
| H18 | 100 donors, rounding dust & late returns | Per-wallet entitlement ≤ balance, không loop payout, dust không sweep |

**Nguồn dữ liệu:** fixture giả có nhãn để test correctness, phỏng vấn organizer/reviewer/donor và chứng từ thật đã được cho phép sử dụng để đánh giá mức phù hợp. Phân biệt simulated labels với dữ liệu thực tế/đánh giá độc lập. Hiện các survey và reviewer acceptance thực tế chưa được báo cáo hoàn tất trong repo checkpoint.

### 12.3 Metrics và cách tính

| Chỉ số | Định nghĩa | Lưu ý |
|---|---|---|
| Valid Request Approval Rate | yêu cầu hợp lệ được duyệt / tổng yêu cầu hợp lệ trong bộ nhãn | Cần nhãn ground truth có nguồn |
| False Approval Rate | yêu cầu không hợp lệ được duyệt / tổng yêu cầu không hợp lệ | Phân tách từ false rejection |
| Availability/Completion | campaign có thể tiếp tục và đạt target hợp lệ / campaign thuộc kịch bản | Không coi hoàn thành thanh toán là outcome |
| Time to Funds | thời gian tạo request -> token receipt confirmed | Có thể bổ sung delay làm bằng chứng |
| Reviewer Burden | số lần review, thời gian review, số chứng từ được xem | Không chỉ số action API |
| Max Pre-Delivery Exposure | đỉnh net funds đã ra nhưng chưa có delivery acceptance | So sánh cùng fund/goal |
| Cumulative Loss | tổng actual net cash được ghi nhận loss trong kịch bản | Không bao gồm nợ hứa hoàn |
| Unreleased Custody | quỹ còn bị reserve/dispute sau STOP | Chỉ tiêu quan trọng tránh "an toàn nhưng khóa vô hạn" |
| Refund Correctness | sai lệch entitlement theo từng donor, double-claim/recovery | Conservation tổng không đủ |
| Gas | gas per operation, per completed charitable outcome | Normalize số request/tx khác nhau |
| Human Capital Burden | vốn organizer/vendor phải ứng, thời gian quay vòng | B1/B2 vendor prepay khác baseline B |
| Robustness | lỗi/reorg/retry và thời gian hồi phục projections | Thử trên các trace giống nhau |

Thiết kế phân tích: paired traces (seed cố định), report median/p95 và distribution thay vì chỉ average, công bố số mẫu/giả định, confidence interval nếu có thống kê thích hợp, và failure cases. Tách overhead của `vendor verification` khỏi lợi ích thuần của decision mechanism nếu đo được.

---

## 13. Test plan & definition of done

### 13.1 Contract unit/fuzz/invariant

- Kiểm `INV-01..08` với handler gọi ngẫu nhiên donate/approve/deposit/delivery/challenge/final/return/release/STOP/refund.
- Token behavior: mock callback/reentrancy, transfer failure, non-exact fee token giả, zero values, uint caps, wrong decimals, direct inflow.
- Request boundaries: unapproved request, different vendor, stale version, replay nonce, amount 0, expired deadline, duplicate final, actor role mismatch, gross cap after recovery, split-to-evade cap.
- Multi-request: concurrent reserve, finish one/stop other, return after STOP, recovered before/after snapshot, cross-campaign custody.
- Refund: 2 donors equal and unequal, base claim then late recoveries, multiple supplemental claims, zero contribution/dust, huge uint, beneficiary wallet mismatch, token transfer failed -> retry.
- Challenge: donor no contribution, stale evidence, duplicate case/version, response time edge, resolver offline, valid pause, no silent acceptance.
- Safety/liveness tests: request pending vendor obligation during STOP, timeout, dispute, unresolved amount vs loss threshold, no orphaned reservation without documented blocker.

### 13.2 Backend/indexer/storage

- API auth/session/SIWE: account role vs signer wallet; never derive organizer or donor rights from client claims.
- Freezing: canonical bytes & hash deterministic, chain/deployment identity binds, conflict on stale revision.
- Evidence: private original ACL, public redacted, manifest size/mime/hash, public access revocation policy, intentional redaction confirmation.
- Exact ledger replay: same events twice idempotent; reorg makes projections rollback/catch-up, no phantom payment.
- Persistence & recovery: reset chain with same numeric chainId but different genesis/codeHash must be rejected; DB backup + original files + deployment manifest restore.
- Organization verification: existing records do not automatically authorize every vendor; independent/vendor identity record and expiry required.
- OpenAPI/codegen: generated FE client matches backend schema exactly; no DB amount as JS float.

### 13.3 Frontend/browser acceptance

- Each action shows authority, current step and next step; distinction between prepare, wallet confirmation, tx pending, receipt, indexed.
- Wallet reject, account switch, chain switch, wrong deployment, reload pending, duplicate button, RPC timeout, indexer lag.
- Donor sees split between Available/Reserved/Paid/Recovered/Refund and can explain meaning of "deposit at risk".
- Original redacted to public via deliberate organizer confirmation; staff sees source with controlled access.
- Resolver can see conflict declaration and reason requirement before signing.
- Independent human pilot: real MetaMask/Brave acceptance recorded separately; tests do not substitute for manual acceptance.

### 13.4 Gate để thông báo "V1 accepted for local pilot"

1. Những OPEN ảnh hưởng tiền/authority/deadline/refund đã có ADR được duyệt.
2. Contract mới biên dịch; unit/fuzz/invariant đầy đủ, không còn known critical blocker.
3. Ledger được đối chiếu bằng **actual ERC-20 balances** và receipt/events trên trace có lỗi.
4. STOP/refund phải có ít nhất một full trace với vendor obligation và một recovery đến muộn.
5. Frontend/backend/API/indexer hoạt động với deployment HED riêng, không trộn B; chưa cần real-money.
6. Reviewer independently đánh giá ít nhất một bộ case trái chiều, ghi sai lệch và limitations.
7. Kết quả benchmark có logs, số lần chạy, môi trường, fixtures và cách tái lập; không đưa con số tự suy đoán.
8. Quy trình backup/restore và wallet signing được nghiệm thu; no funds claimed sent to wrong recipient.

---

## 14. Kế hoạch triển khai theo PR / cổng an toàn

### PR-0 — Research and decision record (chưa code)

- Review file này, khép 12 OPEN tác động tiền/quyền, viết trace và formal transition table cho STOP, vendor obligations, refunds.
- Cập nhật `docs/research-direction.md` bằng **phụ lục quyết định nghiên cứu mới**, không xóa các quyết định lịch sử B; link từ README mới khi được phê duyệt.
- Giữ `GOAL.md` của B hoặc đóng goal B đúng thủ tục; lập roadmap HED riêng, không âm thầm thay goal đang chạy.
- Output: stable protocol policy ID, accounting spec, review record và measurement plan.

### PR-1 — Contract P1 prototype

- Tạo `FundTogetherDisbursement.sol` + types + unit tests + invariant handlers; triển khai MockUSDC exact-transfer, deposit cap, reserve, delivery, dispute, payout, return, wind-down, refund.
- Giữ B untouched; không proxy/migration.
- Gate: compile + full Foundry tests + invariants + adversarial traces + source review đặc biệt payout/refund.

### PR-2 — Isolated backend + migration + event/indexer

- Tạo `disbursement/` module và schema/migration riêng; dùng SIWE/organization records, request canonical freeze, vendor verification, evidence storage, tx-preparation, reorg-safe indexer.
- Bất kỳ DB projection nào đều phải cross-check on-chain state, không tự tạo payout.
- Gate: API tests, migrations trên DB HED riêng, event replay/duplicate/reorg/recovery tests; OpenAPI generated.

### PR-3 — FE journeys

- Organizer request, vendor/deposit, delivery evidence; staff/resolver queue; donor public ledger/challenge/refund.
- Ưu tiên trạng thái rõ, không dashboard chỉ đẹp; triage lỗi wrong signer/network/version và pending wallet.
- Gate: unit/browser simulation + manual-wallet evidence.

### PR-4 — NCKH paired experiment and analysis

- Chạy B0/B1/B2 trên cùng fixtures G1/G2 và failure vendor; phân tích safety, adaptive tradeoffs, time, gas, recovery, outcome.
- Ghi limitations vendor ngoài đời, quality reviewer, pháp lý, token/liquidity; không suy một mô phỏng đủ chứng minh trust hay startup fit.

### PR-5 — P2/P3 expansion (chỉ sau kết quả)

- P2 organizer advance: giới hạn unpaid exposure riêng, chi chứng từ đặc thù, return unused, kiểm xem payable vào organizer hay vendor.
- P3 reimbursement: xác minh chi từ nguồn khác không trùng thanh toán trong escrow, chứng minh hàng/dịch vụ thật, chi phí vốn và chống hoàn ứng lặp.
- Cần ledger phân biệt payer/recipient, risk class và modality; không dùng một boolean `directPayment`.

### Rollback/migration strategy

- B0/B (đã triển khai): contract immutable, không nhập request P1 vào stage B; tiếp tục dùng ABI/schema cũ theo `protocolKind`.
- HED: deploy instance/token/mock context mới; test IDs, ledger và checkpoint tách. Code rollback là chuyển **routing của campaign mới** về B; không tạo giả định chuyển được tiền của campaign HED sang B.
- Không migrate donor/campaign obligation đang live trừ khi có một phương án explicit, audited, được tất cả bên quyền liên quan chấp thuận và có đường rút an toàn; việc thay source không thay contract đã deploy.

---

## 15. Decision log — câu hỏi buộc chốt trước code có token transfer

| ID | Quyết định phải phê duyệt | Đề xuất review, chưa chốt | Nếu sai sẽ gây |
|---|---|---|---|
| OPEN-01 | Deposit limit tiers/absolute caps | Thử parameter grid theo scenario; no hardcoded 20% | Too much exposure / vendor cannot start |
| OPEN-02 | Aggregate exposure và lifetime-loss thresholds | Cần cả hai; threshold breach fail-closed | Repeated small loss drains campaign |
| OPEN-03 | Deadline/case/challenge/hard stop | B làm baseline tham khảo, điều chỉnh cho vendor contracts | Frozen funds hoặc auto approval sai |
| OPEN-04 | Resolver mất khóa/inactive/COI | Explicit timeout STOP + independent escalation only if approved | Liveness và capture |
| OPEN-05 | Vendor obligations trong WIND_DOWN | Trả phần unencumbered; xử lý reserve theo terms/decision | Double entitlement vendor/donor |
| OPEN-06 | Donor challenge spam & minority protection | Eligibility by donor contribution, one case/version, report independent | DoS / unreviewed fraud |
| OPEN-07 | Parallel requests | V1 một open pre-delivery exposure; cho phép dependent delivery/outcome pending | Double reservation hoặc logistics deadlock |
| OPEN-08 | Partial delivery/claims | V1 tối đa một final payout; partial accepted value rõ | Pay for missing goods |
| OPEN-09 | Điều kiện `COMPLETED` | Financial settlement + confirmed charitable outcome | "Tiền đã mua" nhầm "quà đã trao" |
| OPEN-10 | Vendor verification / related party | Mandatory verified owner/conflict disclosure | Collusion funnel |
| OPEN-11 | Late refund, claims, rounding, unmatched token inflows | Base+supplement ledger như B, nhưng snapshot free cash only | Donor overpaid / stranded funds |
| OPEN-12 | P2/P3 & fiat/off-ramp | Deferred to post-P1; legal/payment partner review | False claim bank transfer completed |

**Trạng thái các mục trên:** `REVIEW_REQUIRED`. Người dùng đã duyệt **định hướng** P1 ưu tiên và đặt cọc có giới hạn, chưa duyệt con số/authority/timetable ở bảng này.

---

## 16. Hướng dẫn cho coding assistant / reviewer dùng file này

> Hãy đọc toàn bộ file và các nguồn tại **Mục 1** trước khi sửa code. Dùng commit baseline đã ghi để đối chiếu, xác nhận ref mới nhất trước khi tạo nhánh. Các thông tin ở đây thuộc ba loại: **hiện trạng repo**, **quyết định chiến lược từ người dùng**, và **đề xuất cần duyệt**. Không trộn ba loại.
>
> Trong PR-0, chỉ chỉnh tài liệu nghiên cứu/changelog, làm state/financial trace và xin duyệt các OPEN liên quan tiền. Không tự động tạo/phê duyệt transaction, không reset chain/database, không thay ABI của Workflow A/B, không tạo private key/seed, không đổi địa chỉ ví/resolver đang live.
>
> Sau khi protocol approved: implement thứ tự `contracts -> invariants -> backend schema+indexer -> evidence+review+API -> FE -> integration -> experiments`. Một bước phải có test tái lập và báo cáo đầy đủ trước khi chuyển bước tiếp. Nếu test trái với giả định, quay lại sửa spec; không "vá" accounting bằng cách xóa state hoặc cho staff update custody DB trực tiếp.
>
> Bảo đảm acceptance report tách `code compile/pass`, `local integration`, `manual wallet`, `real-world business validation`, `security review`, `ready for real funds`. Không được nói một mục DONE thay cho mục khác.

## 17. Nguồn và tính truy xuất

Tài liệu được viết sau khi đọc các file tại commit `022ff8c8ce1981eb7e9c8fe355164f93c3d39cbf`: `AGENTS.md`, `GOAL.md`, `README.md`, `docs/research-direction.md`, `docs/workflow-b-spec.md`, `docs/workflow-b-financial-rules.md`, `docs/workflow-b-code-audit-2026-10-10.md`, `docs/PROJECT_PROGRESS.md` (phần hiện trạng), `docs/business-validation-and-mvp-hardening.md`, `contracts/src/FundTogetherAdvance.sol`, `contracts/src/advance/AdvanceTypes.sol`, `backend/src/database/schema/advance.schema.ts`, `backend/src/advance/advance-plan.ts`, `advance-action-policy.ts`, `advance-workflow.service.ts`, `advance-indexer.service.ts`, `advance-evidence.service.ts`, `advance-review.service.ts`, `advance-campaign.schema.ts`, `advance-workflow.schema.ts`, các controller B, `contracts/foundry.toml`, và hai `package.json` FE/BE. Danh sách thư mục test và frontend được đối chiếu với repository tree API.

**Không chạy build/test hoặc kiểm tra chain live trong lượt tạo file.** Những số PASS được nêu ở tài liệu audit B là kết quả lịch sử của repo, không phải kết quả vừa chạy cho HED. Không có code HED mới được tạo hoặc ghi lên GitHub trong lượt này.

**Kết luận:** Hướng nghiên cứu nên chuyển trọng tâm từ `fixed milestone advance` sang `request-based hybrid escrow` với **reserved budget + bounded vendor deposit + accepted-delivery final payout + separate charitable outcome verification**. Điểm khó nhất không phải form yêu cầu chi, mà là quyền của vendor và donor khi đơn hàng chưa hoàn thành, cùng tính đúng của reservation/recovery/refund qua nhiều trạng thái. Chỉ nên gọi đây là giao thức có thể triển khai khi những quyền đó đã được formalize, kiểm thử và duyệt.
