# Workflow B — quy tắc tài chính pilot đã duyệt

> Ngày: 2026-10-09. APPROVED_FOR_LOCAL_PILOT cùng gói B-D01–B-D10.
> Phụ thuộc B-D02/B-D03/B-D04/B-D08/B-D09/B-D10 trong [spec](./workflow-b-spec.md).
> Quy tắc A tại [financial-rules.md](./financial-rules.md) tiếp tục áp dụng cho A.
> Các công thức ở đây mới được kiểm bằng công cụ trace offline, chưa có Contract B.

## 1. Token, đơn vị và custody

Pilot chỉ dùng MockUSDC exact-transfer ERC20, 6 decimals, không fee,
rebase, callback làm thay đổi accounting hoặc tiền fiat. Không suy MockUSDC
tương đương VND. Gas do caller trả riêng, không lấy từ donation hoặc refund.
Mỗi amount là base unit uint / bigint, JSON dùng chuỗi số nguyên. Contract B
phải kiểm balance delta cho inflow đúng amount và dùng SafeERC20/nonReentrant;
nếu token không theo giả định thì revert, không ghi counters từ amount yêu cầu.

| Ký hiệu | Ý nghĩa |
|---|---|
| `B[m]`, `G` | Budget đợt đã duyệt; `G = sum(B[m])` |
| `c[i]`, `C` | Contribution thực nhận của ví i; `C = sum(c[i])` |
| `A[m]`, `A` | Vốn đã cấp tích lũy đợt m / toàn campaign |
| `R[m]`, `R` | Khoản thực nhận trả lại được phân bổ cho đợt / campaign |
| `F` | Tổng refund đã trả thành công |
| `E` | Custody hiện tại cho campaign, chưa chuyển đi |
| `P0` | Base refund pool cố định tại terminal snapshot |
| `S` | Return pool bổ sung tích lũy sau snapshot, không phải balance hiện tại |
| `baseClaimed[i]`, `supplementPaid[i]` | Quyền base đã tiêu thụ / supplement đã thực trả cho ví |
| `U[m]` | Unused của đợt theo báo cáo được nghiệm thu; không phải tiền contract tự thu hồi |

Invariant tiền:

```text
C + R = A + F + E
0 <= C <= G
A[m] thuộc {0, B[m]}, mỗi đợt chỉ cấp một lần
0 <= R[m] <= A[m]; R = tổng R[m]
A <= G; F <= P0 + S (khi đã snapshot)
balance(token, contract) >= tổng E của mọi campaign cùng token
```

Bond B = 0 theo B-D02 đã duyệt. Không có reserve khác bù campaign thiếu tiền.
Tiền chuyển thẳng vào contract ngoài return API là excess chưa phân bổ; không
tạo contribution/return/quyền admin. Không cộng `P0` hoặc `S` thêm vào `E` như
một khoản cash mới. Pool là counter quyền; E là cash custody còn giữ.

## 2. Bốn thao tác chuyển token

| Thao tác | Ai có tiền / ai được gọi | Điều kiện và effect | Khi lỗi / lặp / kẹt |
|---|---|---|---|
| Donate | Ví donor, caller chính ví góp → escrow | Funding, trước hạn, không vượt goal; balance delta đúng; tăng c[i]/C/E | Revert toàn tx, không tạo quyền từ HTTP/hash. Reaching goal khóa donate. Hết funding thiếu → snapshot refund |
| Advance | Donor escrow chịu điều kiện protocol; caller organizer → ví organizer cố định | Stage đúng/eligible, trước claimEnd, đủ E; tăng A[m]/A, giảm E, tiêu thụ quyền trước transfer | SafeERC20 lỗi rollback cả quyền/counters; retry trước hạn. NonReentrant; timeout STOP phần còn giữ. Không admin redirect |
| Return | Token thuộc ví organizer sau advance; caller organizer dùng allowance → escrow | Stage đã cấp, amount>0, `amount <= A[m]-R[m]`; actual received đúng; tăng R[m]/R/E, nếu snapshot tăng S | Fail không tính return; caller tự gửi lại. Không tái mở advance. Chấp nhận return muộn không hạn trong cap |
| Refund | Escrow có nghĩa vụ với contributor; caller chính ví góp → chính ví đó | Có snapshot, base chưa consumed và/hoặc supplement quyền mới >0; giảm E, tăng F/paid | Transfer lỗi rollback paid/flags; claim retry không hạn. Không iterate donor và không cho người khác đổi recipient |

Resolver chỉ quyết định eligibility/outcome; không chuyển token tới ví tùy ý.
Sau advance, contract không kiểm soát chi tiêu ngoài đời. STOP không claw back;
return phải là giao dịch organizer tự nộp thực nhận. Mất ví hoặc token từ chối
transfer có thể giữ nghĩa vụ trong escrow vô hạn; không có admin sweep cứu hộ.
Trade-off này thuộc gói đã duyệt; không hứa mọi vấn đề tiền đều được giải quyết bằng tx.

## 3. Funding và cấp vốn

Mọi B[m] dương, ordered list cố định; G được tính, không nhập riêng. Không nhận
quá goal. Khi C=G ghi timestamp funded; first eligibility và claim dùng deadline
trong spec. Plan và tổ chức đã duyệt không tự mở advance khi chưa confirm đầu.

```text
Claim đầu: C = G; resolver confirmed first eligibility; stage 0;
             trong claim window; E >= B[0]
Claim tiếp: previous stage finalized; no pending case; previous unused returned;
             đúng next stage; trong claim window; E >= B[next]
Finalize acceptance: không thay A, không chuyển B[m] lần nữa
```

Không gộp hai đợt, trả nhà cung cấp, cấp theo tỷ lệ, partial advance, phí hoặc
phạt/slash trong MVP này. Việc organizer đã return một phần không cho claim lại.

## 4. Chi tiêu, dư và return

Báo cáo tách CAMPAIGN, ORGANIZER, OTHER. Chỉ cộng đúng token/currency/unit;
không cộng VND và MockUSDC. Tổng chi từ campaign cho đợt m không vượt B[m].
Nếu thực tế vượt thì phần tự bù phải có nguồn riêng và bằng chứng; report khai
toàn bộ excess lấy từ campaign là NEEDS_INFORMATION, không tăng budget/cấp thêm.

```text
0 <= acceptedCampaignSpent[m] <= B[m]
U[m] = B[m] - acceptedCampaignSpent[m]
Finalize stage cần R[m] >= U[m]
```

Report unused không tự tăng R/E. Return có thể xảy ra trước quyết định hoặc
muộn; tối đa actual advance của đúng đợt. Return không thay chi phí/nhãn báo
cáo cũ; reviewer phải đối chiếu nguyên nhân trả nhiều hơn U. Một khoản tự nguyện
trả thêm trong cap được phân bổ cho donor; không tái dùng cho đợt sau hoặc cho
organizer rút. B[m+1] vẫn đúng budget đã chốt. U chưa trả hết → giữ quyền cấp
tiếp/đóng, hết finalization deadline → STOP; sau STOP return vẫn được phép.

COMPLETED nghĩa là kết quả trong phạm vi được nghiệm thu và U đã trả đủ,
không khẳng định không thể có phát hiện/return mới. Contract kiểm numeric U
do resolver xác nhận, không biết khoản chi ngoài đời hoặc một report khai sai.
T07 phải đo false acceptance riêng với correctness kế toán.

## 5. B-D08 — so sánh return sau snapshot

| Phương án | Hành vi | Chi phí / giới hạn |
|---|---|---|
| Đóng return trước snapshot | Chờ cửa sổ return rồi chốt pool cuối; không nhận return API muộn | Ít mapping hơn nhưng trì hoãn refund; khoản muốn trả muộn phải có quy trình ngoài protocol; không phù hợp mục tiêu giữ đường trả lại lâu dài |
| **Base cố định + supplement tích lũy (đã duyệt)** | STOP/COMPLETED snapshot ngay; return sau đó vào counter S, contributor có entitlement bổ sung | Thêm mapping paid và claim bổ sung; giải thích hai pool/dust. Không sửa quyền base, không cần tạo pool mới cho từng return |

Chọn phương án thứ hai để không chặn organizer thực sự trả tiền sau khi donor
đã claim. Hai pool có cùng denominator C và weights c[i] đã khóa. Thao tác
return không tăng base P0. Pool supplement tích lũy không giảm khi claim; chỉ
paid/F/E đổi. Đợt/campaign outcome không quay lại execution.

## 6. Snapshot và entitlement

Snapshot một lần khi funding thiếu/cancel trước cấp, STOP hoặc COMPLETED.
Tính E từ custody được hạch toán, không dùng toàn balance của contract chung.

```text
Tại snapshot: P0 = E = C + R_before - A; S = 0; F = 0
baseEntitlement[i] = floor(c[i] * P0 / C)
supplementEntitlement[i] = floor(c[i] * S / C)
claimable[i] = (baseClaimed[i] ? 0 : baseEntitlement[i])
               + supplementEntitlement[i] - supplementPaid[i]
```

`C=0`: A/R/E/P0/S phải đều 0; entitlement 0, không chia 0. Budget vẫn có thể
được chốt trong draft hủy không có donor. C, c[i] không đổi sau snapshot.
Contract cần `Math.mulDiv` full precision, không nhân uint256 rồi chia gây
overflow. Việc trace dùng bigint chưa kiểm Solidity overflow hoặc gas.

Claim cập nhật base flag và supplementPaid tới entitlement hiện tại trước
external transfer. Lần đầu có entitlement 0 có thể tiêu thụ base flag và emit
zero accounting event mà không gọi ERC20 transfer 0; lần sau không có quyền mới
thì reject. Return muộn tạo supplement quyền mới cho cả ví đã consumed base.
Không gọi nó là donor đã hoàn tất mọi quyền tương lai chỉ vì claimable hiện tại 0.

Thứ tự tx claim/return có thể đổi payout của từng tx nhưng không đổi tổng quyền
theo cùng S cuối cùng. Tiền claim của ví i không vượt base + supplement cumulative.
Snapshot/return/claim cùng block phải được index theo log order, không từ state UI.

## 7. Dust và nghĩa vụ chưa claim

```text
E sau snapshot = P0 + S - F
Total entitlement hiện tại = Σ floor(c[i]*P0/C) + Σ floor(c[i]*S/C)
Unclaimed = Total entitlement hiện tại - F
Dust hiện tại = P0 + S - Total entitlement hiện tại
E = Unclaimed + Dust
```

Tổng trên dùng để kiểm nghiên cứu, không yêu cầu contract loop donor. Contract
phải cung cấp counters/claimable từng ví đủ đối chiếu; UI không gọi toàn E là
dust khi chưa biết quyền từng ví. Có thể chỉ hiển thị exact dust khi đã claim
hết entitlement ở cùng supplement total được kiểm; nếu không, báo retained pool
gồm nghĩa vụ chưa claim và rounding. Không tự sweep phần này.

Supplement dust chỉ là rounding tại S hiện tại, có thể giảm khi S tăng. Nó
không phải quyền admin; giữ ở escrow để không thiếu khi entitlement tăng sau
return nhỏ tiếp theo. Không hết hạn claim, không thưởng caller, không đổi
weights và không gửi dust cho organizer hoặc donor cuối.

## 8. Trace mẫu đã tính

Số bảng dưới đây là MockUSDC hiển thị; file trace là base unit ×1.000.000.
Hai donor A/B có weights 60%/40%.

| Case | C | A | R | P0 | S | Refund A/B | E sau claim |
|---|---:|---:|---:|---:|---:|---|---:|
| G1 thành công không dư | 2.200 | 2.200 | 0 | 0 | 0 | 0 / 0 | 0 |
| G1 STOP sau cấp toàn bộ | 2.200 | 2.200 | 0 | 0 | 0 | 0 / 0 | 0 |
| G1 dư/return 50 trước snapshot | 2.200 | 2.200 | 50 | 50 | 0 | 30 / 20 | 0 |
| G2 thành công 3 đợt | 3.300 | 3.300 | 0 | 0 | 0 | 0 / 0 | 0 |
| G2 STOP sau cấp đợt 2 | 3.300 | 2.200 | 0 | 1.100 | 0 | 660 / 440 | 0 |
| G2 return 110 sau claim base | 3.300 | 2.200 | 110 | 1.100 | 110 | Thêm 66 / 44 | 0 |

Base unit nhỏ: C=10, cA=3/cB=7, A=3, P0=7: base A=2/B=4, dust=1.
Return muộn 1 rồi 2 tạo S=3: supplement A=0/B=2, supplement dust=1.
Sau cả hai ví claim quyền hiện tại: F=8, E=2, unclaimed=0, dust=2. Nếu B mới
claim base trước return, E=6 gồm A base=2 + B supplement=2 chưa claim và dust=2.

## 9. Kiểm chứng và giới hạn

Chạy tại repository root:

```powershell
node --test backend/scripts/workflow-b/fixtures.test.cjs
node backend/scripts/workflow-b/fixtures.cjs
```

`accounting.cjs` chỉ kiểm trace hypothetical và invariants số nguyên; không có
signer, receipt, token transfer, transaction rollback, deadlines hay RPC. Action
`accept` giả định review đã finalized, không mô phỏng xác minh thật. Không import
công cụ này vào backend runtime hoặc FE để quyết định quyền tài chính.

Contract unit/fuzz/invariant, lỗi transfer/reentrancy, access/deadline/version,
multicampaign custody, idempotent/reorg/indexer, storage quyền và nghiệm thu
MetaMask đều TODO. [Acceptance](./workflow-b-acceptance.md) không đánh dấu T01–T18
PASS từ các phép tính trên. Spec và [kế hoạch code](./workflow-b-code-plan.md)
đã được duyệt; triển khai/test từng task đang IN_PROGRESS theo GOAL.md.
