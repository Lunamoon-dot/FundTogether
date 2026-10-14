# Core V2 — H1 Technical Architecture Blueprint, Interface Specification & Invariant Test Plan (Revised)

> **File:** `docs/reward/CORE_V2_H1_TECHNICAL_BLUEPRINT.md`  
> **Date:** 2026-10-14  
> **Status:** `REVISED_DRAFT` — Đã sửa đổi toàn bộ các lỗi logic, bảo toàn vốn, và mở rộng quy mô theo phản hồi chi tiết của người dùng.  
> **Phạm vi H1:** Blueprint kiến trúc, Interface Solidity chuẩn mực, Ma trận trạng thái, và Kế hoạch kiểm thử Invariant.  
> **Nguyên tắc an toàn:**  
> - KHÔNG sửa đổi `FundTogetherEditions.sol` và các nghĩa vụ V1 hiện hành.  
> - KHÔNG tự ý hardcode hoặc coi các tỷ lệ 25% per-request cap hay 24h pre-disbursement wait là chính sách mặc định.  
> - CHƯA triển khai các hàm chuyển token thực tế khi các tham số FGATE bắt buộc chưa được ký duyệt.

---

## 1. Sửa đổi trọng yếu theo phản hồi của Người dùng (Changelog)

| Hạng mục | Lỗi ở bản thảo trước | Thiết kế đã sửa đổi chuẩn xác |
|---|---|---|
| **Phương trình bảo toàn vốn (Conservation)** | $R + U = P + F_{\text{main}} + E + V$ (sai khi có người rút tiền từ Vault vì $V$ giảm mà không có biến ghi nhận tiền đã ra khỏi Vault). | **$\mathbf{R} + \mathbf{U} = \mathbf{P} + \mathbf{F}_{\text{main}} + \mathbf{F}_{\text{vault}} + \mathbf{E} + \mathbf{V}_{\text{vault}}$**<br>Bảo toàn chính xác tuyệt đối ở mọi thời điểm, trước và sau khi Backer rút tiền từ Vault. |
| **Thời gian giải ngân (FGATE-4)** | Tự ý thêm `PRE_DISBURSEMENT_WAIT_SECONDS = 86400` (chặn giải ngân 24h). | **BỎ HOÀN TOÀN rào cản 24h.**<br>Challenge hoạt động liên tục; 12h là Review Window sau khi nộp reconciliation. Giải ngân được phép thực hiện ngay khi được duyệt và không có challenge ở trạng thái `ADMITTED`. |
| **Khả năng mở rộng của Refund Vault** | `sweepFromEscrow` nhận mảng `address[]` và `uint256[]`, có nguy cơ vượt gas limit khi hàng nghìn backer. | **Chuyển số dư O(1) Gas Scaling.**<br>Main Escrow chuyển số dư 1 lần kèm snapshot; Backer tự claim (pull-based) theo công thức tỷ lệ xác định mà không cần duyệt mảng trên chain. |
| **Kiểm soát Outcome Exposure trước giải ngân** | Chỉ kiểm tra chi phí đã đối chiếu $AcceptedExpense \le 50\% \times R$. Nguy cơ Creator rút vốn mới rồi mới đối chiếu, làm tổng rủi ro vượt trần. | **Kiểm soát rủi ro kết hợp trước giải ngân:**<br>$RiskExposure = Unreconciled + UnverifiedExpense$<br>Điều kiện giải ngân khoản mới $\Delta P$:<br>**$RiskExposure + \Delta P \le 50\% \times R$** |
| **Xử lý đồng thời nhiều Challenge** | Dùng cờ đơn `bool isChallenged` (không thể quản lý nhiều case cho 1 request). | **Scoped Freeze Registry:**<br>Lưu trữ `admittedCount` theo từng `targetKey = keccak256(campaignId, targetType, targetId)`. Chỉ freeze mục tiêu khi `admittedCount > 0`. |
| **Định danh trong Shared Vault** | Chỉ dùng `campaignId` đơn lẻ (nguy cơ va chạm giữa các deployment/escrow/token). | **Composite Key định danh duy nhất:**<br>`campaignKey = keccak256(abi.encode(sourceEscrow, token, campaignId, roundId))`. Chỉ cho phép `sourceEscrow` đã đăng ký được sweep. |
| **Trạng thái `FINANCIALLY_COMPLETE`** | Định nghĩa ledger bằng 0 (gây nhầm lẫn với số dư trong Vault). | **Phân biệt rõ ràng:**<br>Main Escrow đạt `FINANCIALLY_COMPLETE` khi mọi request/refund/challenge obligation tại Escrow đã xử lý xong và chỉ còn creator remainder đủ điều kiện payout. `claimFinalPayout()` chuyển sang `COMPLETED` và đưa $E$ về 0. Nghĩa vụ tại Vault ($V_{\text{vault}} > 0$) vẫn tồn tại độc lập cho Backer claim. |

---

## 2. Kiến trúc hai Hợp đồng V2

```
                       +---------------------------------------+
                       |        MockUSDC (ERC-20, 6 dec)       |
                       +---------------------------------------+
                                   ^               ^
                         transfers |               | transfers
                                   v               v
 +------------------------------------+         +------------------------------------+
 | FundTogetherProgressiveEscrow.sol  |         |    FundTogetherRefundVault.sol     |
 | (Main Campaign & Request Escrow)   |         |      (Shared Multi-Campaign)       |
 |                                    |  sweep  |                                    |
 | - Chu kỳ gọi vốn (ACTIVE)          | tokens  | - Isolated ledgers theo            |
 | - Pipeline 1-slot FundingRequest   |-------->|   (sourceEscrow, token, id, round) |
 | - Giải phóng slot tại DISBURSED    |         | - Chuyển vốn O(1) gas              |
 | - Continuous Challenge Engine      |         | - Pull-based pro-rata claims       |
 | - Scoped Freeze (ADMITTED state)   |         | - Quyền claim vĩnh viễn            |
 | - Bắt buộc: RiskExposure+dP <= 50% |         | - Hạch toán tách biệt Dust         |
 +------------------------------------+         +------------------------------------+
                   |                                               |
                   +-----------------------+-----------------------+
                                           | Canonical Events
                                           v
                          +---------------------------------+
                          |    Idempotent Event Indexer     |
                          |    (txHash, logIndex dedup)     |
                          +---------------------------------+
                                           |
                                           v
                          +---------------------------------+
                          |     PostgreSQL Projections      |
                          |   (Audit Dashboard công khai)   |
                          +---------------------------------+
```

---

## 3. Toán học Bảo toàn Vốn và Các Invariants

### 3.1 Phương trình Bảo toàn Tuyệt đối (Conservation Invariant)

Tại mọi block snapshot và sau bất kỳ giao dịch nào trên toàn hệ thống:

$$\mathbf{R} + \mathbf{U} = \mathbf{P} + \mathbf{F}_{\text{main}} + \mathbf{F}_{\text{vault}} + \mathbf{E} + \mathbf{V}_{\text{vault}}$$

Trong đó:
- $\mathbf{R}$: Tổng vốn huy động được xác nhận tại thời điểm kết thúc funding (`FundingFinalized`).
- $\mathbf{U}$: Tổng số token thực tế Creator đã hoàn trả về Main Escrow hoặc nộp bổ sung vào Vault (`returnUnused` / `receiveSupplement`).
- $\mathbf{P}$: Tổng số token thực tế đã giải ngân chuyển ra ví Creator (`disburseFunds`).
- $\mathbf{F}_{\text{main}}$: Tổng số token Backer đã rút trong Main Refund Round 7 ngày tại Main Escrow (`claimRefund`).
- $\mathbf{F}_{\text{vault}}$: Tổng số token Backer đã rút từ Shared Refund Vault (`claimFromVault`).
- $\mathbf{E}$: Số dư token thuộc campaign đang nằm trong Main Escrow (ledger phân vùng, không lấy raw `balanceOf` nếu nhiều campaign dùng chung contract).
- $\mathbf{V}_{\text{vault}}$: Số dư token thuộc campaign đang nằm trong Shared Refund Vault theo isolated ledger, gồm unclaimed allocations và dust; không phải tổng raw `balanceOf(vault)`.

#### Bảng ma trận biến thiên trạng thái (Conservation Delta Matrix):

| Giao dịch | $\Delta R$ | $\Delta U$ | $\Delta P$ | $\Delta F_{\text{main}}$ | $\Delta F_{\text{vault}}$ | $\Delta E$ | $\Delta V_{\text{vault}}$ | $\Delta \text{Left} - \Delta \text{Right}$ |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Pledge** (giai đoạn funding) | $+c_i$ | $0$ | $0$ | $0$ | $0$ | $+c_i$ | $0$ | $c_i - c_i = 0$ ✅ |
| **Disburse** (giải ngân cho Creator) | $0$ | $0$ | $+d$ | $0$ | $0$ | $-d$ | $0$ | $0 - (d - d) = 0$ ✅ |
| **Return Unused** (trả về Escrow) | $0$ | $+u$ | $0$ | $0$ | $0$ | $+u$ | $0$ | $u - u = 0$ ✅ |
| **Claim Main Refund** | $0$ | $0$ | $0$ | $+f_m$ | $0$ | $-f_m$ | $0$ | $0 - (f_m - f_m) = 0$ ✅ |
| **Sweep to Vault** (sau 7 ngày) | $0$ | $0$ | $0$ | $0$ | $0$ | $-s$ | $+s$ | $0 - (-s + s) = 0$ ✅ |
| **Claim from Vault** | $0$ | $0$ | $0$ | $0$ | $+f_v$ | $0$ | $-f_v$ | $0 - (f_v - f_v) = 0$ ✅ |
| **Late Return to Vault** | $0$ | $+u_l$ | $0$ | $0$ | $0$ | $0$ | $+u_l$ | $u_l - u_l = 0$ ✅ |

---

### 3.2 Phân vùng Vốn (Custody Partitions)

1. **Tại Main Escrow:**
   $$\mathbf{E} = \text{availableForNewPayout} + \mathbf{Q} + \mathbf{L}$$
   - $\mathbf{Q} \ge 0$: Tổng vốn đã phê duyệt và đặt trước (`RESERVED`), sẵn sàng giải ngân.
   - $\mathbf{L} \ge 0$: Quỹ refund vòng chính được snapshot tại thời điểm `WIND_DOWN` trước khi sweep.
   - $\text{availableForNewPayout} \ge 0$: Vốn tự do khả dụng.

2. **Tại Shared Refund Vault:**
   $$\mathbf{V}_{\text{vault}} = \text{totalSwept} + \text{totalSupplements} - \text{totalClaimed}$$
   - `getIsolatedBalance(campaignKey)` là custody source of truth; tổng raw `balanceOf(vault)` chỉ là tổng của các isolated ledgers.
   - Quyền claim của từng backer được tính lazy bằng `floor()`. Phần dư làm tròn không được giả định là đã phân bổ và không được dùng để giảm $\mathbf{V}_{\text{vault}}$.
   - `dustBalance` chỉ là nhãn kế toán khi contract có cơ chế bounded chứng minh được; với quyền claim vô thời hạn, dust không được sweep, redirect hoặc tự động cấp cho bất kỳ ai.

---

### 3.3 Công thức Kiểm soát Rủi ro 50% Outcome Exposure Trước Giải Ngân

Để ngăn chặn kịch bản Creator rút vốn mới rồi mới đối chiếu làm thất thoát vốn Backer:

1. **Biến số rủi ro:**
   - $Unreconciled$: Vốn đã giải ngân nhưng chưa có chứng từ được Resolver chấp nhận:
     $$Unreconciled = \sum_{req} \left( \text{disbursed}(req) - \text{returned}(req) - \text{acceptedExpense}(req) \right)$$
   - $UnverifiedExpense$: Chi phí đã được Resolver chấp nhận nhưng deliverable tương ứng chưa được nghiệm thu:
     $$UnverifiedExpense = \sum_{req} \text{acceptedExpense}(req) \quad [\text{deliverable chưa VERIFIED}]$$

2. **Tổng vốn đang chịu rủi ro không có kết quả nghiệm thu (Risk Exposure):**
   $$RiskExposure = Unreconciled + UnverifiedExpense$$

3. **Điều kiện tiên quyết để giải ngân khoản mới $\Delta P$:**
   $$\boxed{RiskExposure + \Delta P \le \text{OUTCOME\_CAP\_BPS} \times R / 10\,000}$$
   *(Với $\text{OUTCOME\_CAP\_BPS} = 5000$, tương đương 50% của $R$).*

---

## 4. Đặc tả Cơ chế Giám sát Liên tục (Continuous Challenge) & Scoped Freeze

### 4.1 Bốn trạng thái của Challenge

```
[Backer gửi đơn + hash bằng chứng]
              │
              v
        [ SUBMITTED ]  <─── KHÔNG freeze bất kỳ hoạt động nào; chỉ ghi nhận hồ sơ
              │
    ┌─────────┴─────────┐
    │ (Resolver duyệt)  │ (Resolver từ chối thụ lý)
    v                   v
[ ADMITTED ]      [ DISMISSED ]  <─── Không freeze; đóng case
    │
    ├───> KÍCH HOẠT SCOPED FREEZE TRÊN MỤC TIÊU CỤ THỂ
    │     (Ví dụ: Request #1 bị freeze; Request #2 vẫn xử lý bình thường nếu đủ hạn mức)
    │
    ├─── [Creator nộp giải trình / khắc phục]
    │
    ┌───┴───┐
    v       v
[ UPHELD ] [ DISMISSED ]
    │            │
    │            └─── Dỡ bỏ Scoped Freeze; phục hồi trạng thái bình thường
    v
Chế tài: Điều chỉnh giảm chi phí, yêu cầu nộp trả vốn, hoặc kích hoạt Wind-Down nếu nghiêm trọng.
```

### 4.2 Cơ chế Scoped Freeze Registry đa nhiệm (Challenge Concurrency)

Không dùng biến cờ boolean đơn giản `bool isChallenged`. Hợp đồng sử dụng registry theo dõi số lượng case đang thụ lý:

```solidity
// Hash định danh mục tiêu: campaign phải nằm trong domain để tránh cross-campaign freeze.
mapping(bytes32 => uint256) public admittedChallengesCount;

function getTargetKey(uint256 campaignId, ChallengeTargetType targetType, uint256 targetId) public pure returns (bytes32) {
    return keccak256(abi.encode(campaignId, targetType, targetId));
}

function isTargetFrozen(uint256 campaignId, ChallengeTargetType targetType, uint256 targetId) public view returns (bool) {
    bytes32 targetKey = getTargetKey(campaignId, targetType, targetId);
    return admittedChallengesCount[targetKey] > 0;
}
```

- Chỉ `SUBMITTED -> ADMITTED` mới được tăng count; chỉ `ADMITTED -> UPHELD/DISMISSED` mới được giảm count. Mọi transition lặp hoặc resolve case chưa admitted phải revert.
- Khi một challenge chuyển sang `ADMITTED`: `admittedChallengesCount[targetKey]++`. Mục tiêu bị đóng băng ngay lập tức.
- Khi challenge được giải quyết (`UPHELD` hoặc `DISMISSED`): `admittedChallengesCount[targetKey]--`. Mục tiêu chỉ được rã đông khi không còn case nào ở trạng thái `ADMITTED` nhắm vào nó.

### 4.3 Phân định Review Window 12 giờ

- **Ý nghĩa thực tế:** Khi Creator nộp hồ sơ reconciliation kèm chứng từ, mở ra một khoảng thời gian 12 giờ gọi là **Review Window**.
- **Tính chất:**
  1. Trong 12h này, cộng đồng Backer và Resolver có thời gian đối chiếu công khai các chứng từ.
  2. Hết 12h **KHÔNG ĐỒNG NGHĨA** với việc chứng từ tự động được coi là hợp lệ (không auto-settle).
  3. Hết 12h **KHÔNG PHẢI** là hạn chót của quyền challenge. Backer vẫn có quyền nộp challenge sau 12h tại bất kỳ thời điểm nào suốt campaign.
  4. Sau khi request đã ở trạng thái `DISBURSED`, slot pipeline của Creator đã trống. Creator hoàn toàn có quyền soạn và nộp Funding Request mới mà không bị chặn bởi việc reconciliation của request trước đang trong 12h Review Window (miễn là thỏa mãn điều kiện $RiskExposure + \Delta P \le 50\% \times R$).

---

## 5. Đặc tả Shared Refund Vault có Khả năng Mở rộng Cao (O(1) Gas Scaling)

### 5.1 Định danh Duy nhất (Composite Key)

Để đảm bảo không bao giờ xảy ra va chạm hoặc dùng chéo vốn giữa các campaign, deployment hoặc token khác nhau:

```solidity
bytes32 public constant VAULT_DOMAIN = keccak256("FUNDTOGETHER_REFUND_VAULT_V2");

function getCampaignKey(
    address sourceEscrow,
    address paymentToken,
    uint256 campaignId,
    uint256 roundId
) public pure returns (bytes32) {
    return keccak256(abi.encode(VAULT_DOMAIN, sourceEscrow, paymentToken, campaignId, roundId));
}
```

### 5.2 Cơ chế Sweep O(1) Không Dùng Mảng Unbounded

1. **Giao dịch Sweep từ Main Escrow:**
   - Sau khi kết thúc vòng chính 7 ngày, bất kỳ ai (permissionless) hoặc Main Escrow gọi:
     ```solidity
     function sweepFromEscrow(
         uint256 campaignId,
         uint256 roundId,
         uint256 amountToSweep,
         uint256 totalRaisedSnapshot
     ) external;
     ```
   - **Bảo mật:** `msg.sender` bắt buộc phải là địa chỉ Main Escrow hợp lệ đã được đăng ký.
   - Hợp đồng Escrow chuyển đúng `amountToSweep` ERC-20 token sang Vault bằng `safeTransfer`.
   - Vault chỉ cập nhật một struct duy nhất cho campaign:
     ```solidity
     struct CampaignVaultRecord {
         address sourceEscrow;
         address paymentToken;
         uint256 totalSwept;
         uint256 totalSupplements;
         uint256 totalClaimed;
         uint256 totalRaisedSnapshot;
         uint256 sweepTimestamp;
         bool isSwept;
     }
     ```
   - **Chi phí Gas:** Cố định ($O(1)$), độc lập hoàn toàn với số lượng Backer (dù là 10 người hay 100.000 người, phí gas đều như nhau và không bao giờ bị vượt block gas limit).

### 5.3 Cơ chế Rút Tiền Kéo (Pull-Based Pro-Rata Claim)

Khi Backer gọi `claimFromVault(bytes32 campaignKey)`:
- Vault xác minh số tiền đóng góp ban đầu của Backer $c_i$ và snapshot tổng số tiền đã claim ở Main Round $F_{\text{main}}$ (thông qua interface đọc an toàn từ registered `sourceEscrow`):
  $$TotalEntitlement_i = \text{floor}\left( \frac{(totalSwept + totalSupplements + mainRoundClaimedSnapshot) \times c_i}{totalRaisedSnapshot} \right)$$
  $$Claimable_i = TotalEntitlement_i - F_{\text{main}, i} - claimedFromVault_i$$
- Nếu $Claimable_i > 0$, Vault chuyển token cho Backer và cập nhật $claimedFromVault_i += Claimable_i$.
- **Bảo toàn quyền lợi:** Quyền rút này **không có thời hạn hết hạn 90 ngày**. Backer có thể rút bất kỳ lúc nào.

### 5.4 Trust boundary và canonical sweep proof

- `registerSourceEscrow(sourceEscrow, paymentToken)` là thao tác owner/admin của Vault; mỗi escrow chỉ được bind với đúng một payment token.
- `sweepFromEscrow()` chỉ chấp nhận `msg.sender` là registered source escrow. Vault phải đọc `getRefundSweepData(campaignId)` từ escrow và reject nếu `amountToSweep`, `roundId`, `totalRaisedSnapshot` hoặc `mainRoundClaimedSnapshot` lệch canonical state.
- `receiveSupplement()` phải xác thực sender theo policy của campaign và phải exact-transfer đúng payment token đã bind; không ghi tăng ledger chỉ từ tham số caller.
- `campaignKey` phải bao gồm domain, `sourceEscrow`, `paymentToken`, `campaignId` và `roundId`; không tái sử dụng record đã `isSwept`.
- Mọi claim phải thỏa `totalClaimed <= totalSwept + totalSupplements`; tổng `getIsolatedBalance()` của mọi campaign không được vượt raw token balance của Vault. Không có phép tính tổng entitlement bằng vòng lặp unbounded.

---

## 6. Kế hoạch Kiểm thử Invariant Toàn diện trên Foundry

Được thiết kế để chạy trực tiếp trên Foundry (`forge test` trong WSL / Linux runtime):

### 6.1 `InvariantTokenConservation.t.sol`

- **Mục tiêu:** Chứng minh bất biến bảo toàn vốn tuyệt đối.
- **Handler Actions:** Sinh ngẫu nhiên các chuỗi giao dịch:
  1. `pledge()` với các ví Backer khác nhau.
  2. `finalizeFunding()` khi đến hạn.
  3. `submitFundingRequest()`, `reserveFunds()`, `disburseFunds()`.
  4. `returnUnused()` trả tiền về Escrow.
  5. `submitChallenge()`, `admitChallenge()`, `resolveChallenge()`.
  6. `startWindDown()` và `claimRefund()` (Main Round).
  7. `sweepToVault()` sau 7 ngày.
  8. `claimFromVault()` từ các Backer ngẫu nhiên.
  9. `receiveSupplement()` (hoàn trả muộn vào Vault).
- **Assertion kiểm tra tại mỗi lần gọi hàm:**
  ```solidity
   assertEq(
       R + U,
       P + F_main + F_vault + E + V_vault,
       "Conservation invariant violated: R + U != P + F_main + F_vault + E + V_vault"
   );
  ```

### 6.2 `InvariantOutcomeExposurePreDisburse.t.sol`

- **Mục tiêu:** Đảm bảo không bao giờ có giao dịch giải ngân nào làm tổng vốn chịu rủi ro vượt quá 50% vốn huy động.
- **Assertion:**
  ```solidity
  uint256 riskBefore = escrow.getRiskExposure(campaignId);
  uint256 newDisbursement = handler.nextDisbursementAmount();
  uint256 riskExposure = escrow.getRiskExposure(campaignId);
  assertLe(
      riskBefore + newDisbursement,
      (R * OUTCOME_EXPOSURE_CAP_BPS) / 10_000,
      "pre-disbursement risk gate exceeded"
  );
  assertTrue(
      riskExposure <= (R * OUTCOME_EXPOSURE_CAP_BPS) / 10_000,
      "Risk exposure exceeded 50% cap"
  );
  ```

### 6.3 `InvariantVaultIsolation.t.sol`

- **Mục tiêu:** Chứng minh việc Backer của Campaign A rút tiền từ Shared Vault không bao giờ làm giảm hoặc ảnh hưởng tới số dư của Campaign B.
- **Assertion:**
  ```solidity
  uint256 balanceB_before = vault.getCampaignBalance(campaignKeyB);
  // Thực hiện claim trên Campaign A
  vault.claimFromVault(campaignKeyA);
  uint256 balanceB_after = vault.getCampaignBalance(campaignKeyB);
  assertEq(balanceB_before, balanceB_after, "Cross-campaign fund leakage in Vault");
  ```

---

## 7. Bảng Tham số Cấu hình FGATE (Configurable Parameters)

Tất cả các tham số sau đây **KHÔNG ĐƯỢC HARDCODE** mà sẽ được truyền vào qua Constructor / Campaign Initializer dưới dạng tham số cấu hình:

| Mã FGATE | Tham số | Giá trị Đề xuất (Chờ duyệt) | Mô tả |
|---|---|:---:|---|
| **FGATE-1** | `perRequestCapBps` | `2500` (25%, đề xuất) | Giới hạn tối đa một lần giải ngân; chưa được dùng trước khi duyệt. |
| **FGATE-2** | `unreconciledCapBps` | `5000` (50%, đề xuất) | Giới hạn tổng vốn chưa đối chiếu; chưa được dùng trước khi duyệt. |
| **FGATE-3** | `outcomeExposureCapBps` | `5000` (50%, đề xuất) | Trần tổng rủi ro vốn chưa có nghiệm thu; cần user sign-off. |
| **FGATE-4** | `preDisbursementWait` | `0` (đề xuất, không chờ) | Không áp đặt 24h chờ; giá trị thực thi phải được policy phê duyệt. |
| **FGATE-5** | `reviewWindowDuration` | `43200` (12 giờ, đề xuất) | Khoảng thời gian cộng đồng xem xét chứng từ reconciliation. |
| **FGATE-6** | `mainRefundRoundDuration` | `604800` (7 ngày, đề xuất) | Thời hạn rút tiền vòng chính tại Main Escrow trước khi sweep sang Vault. |
| **FGATE-7** | `vaultClaimExpiry` | `0` (vô thời hạn, đề xuất) | Không tự tước quyền claim; cần ghi vào policy được duyệt. |
