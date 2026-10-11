# FundTogether — thiết kế MVP giải ngân theo yêu cầu P1

> Ngày 2026-10-11 · HED-MVP-1 · DESIGN PROPOSAL / NOT IMPLEMENTED.
> Người dùng yêu cầu tác giả chọn phương án và viết thiết kế MVP/post-MVP. Tài liệu này chốt phương án khuyến nghị để review và làm căn cứ lập task; không khẳng định đã kiểm chứng, được phép dùng tiền thật hoặc đã duyệt mọi tham số tài chính.
> Triển khai trên codebase/nhánh hiện tại khi được yêu cầu, không tạo nhánh mới. Lượt soạn tài liệu không sửa code, deploy, reset dữ liệu hoặc di chuyển tiền.

## 1. Mục tiêu và tài liệu nguồn

Tổ chức gây quỹ cho mục đích đã công bố, sau đó gửi yêu cầu thanh toán có căn cứ. Escrow trả nhà cung cấp theo điều kiện đã duyệt; hệ thống kiểm riêng việc nhận hàng và kết quả thiện nguyện. Không yêu cầu chia sẵn toàn bộ ngân sách thành milestone cố định.

Nguồn: [định hướng](./research-direction.md), [phương án tổng quan](../v0.3/phuong-an-moi.md), [bản thay đổi v0.3](../v0.3/FundTogether_Hybrid_Disbursement_Change_Spec_v0.3.md), [kế hoạch dọn bỏ](./superpowers/plans/2026-10-11-funding-requests-cleanup.md). [Thiết kế post-MVP](./hed-post-mvp-design.md) không phải dependency của MVP.

Ba thay đổi so với [kế hoạch request ban đầu](./funding-request-plan.md): ưu tiên trả vendor thay vì ví tổ chức; full funding thay vì cấp khi chưa đủ mục tiêu; tách đối chiếu tài chính khỏi outcome để mua hàng rồi thuê xe không bị bế tắc. Đây là đề xuất thay thế minh bạch, không viết lại lịch sử lựa chọn cũ.

Baseline Git: `28b245c` chứa checkpoint B; `2e63880` đã hợp nhất remote UI vào local. Ref trong bản v0.3 (`022ff8c`) không bao phủ toàn bộ sửa đổi local. Khi triển khai phải kiểm lại checkout, source và dịch vụ thực chạy; không suy từ số commit rằng code đang phục vụ UI.

## 2. Phạm vi MVP

| Có trong MVP | Không có trong MVP |
|---|---|
| Mua/trao quà; dịch vụ vận chuyển phục vụ hoạt động đó | Quy trình tổng quát cho mọi loại từ thiện |
| P1: trả trực tiếp ví vendor đã xác nhận | Tạm ứng organizer P2, hoàn ứng P3, ngân hàng/tiền mặt/off-ramp |
| Một token MockUSDC exact-transfer, 6 decimals, local EVM | Token phí/rebase, multi-chain, tiền thật |
| Đủ goal mới kích hoạt; goal là trần huy động cố định | Góp trong lúc chi, donor exit tùy ý, thay mục đích |
| Một cọc và tối đa một final payment mỗi request | Nhiều lần giao/trả tiếp trong cùng request |
| Resolver chính + dự phòng chỉ tiếp quản đúng điều kiện | Voting, committee, bond/slash, oracle, AI tự duyệt |
| Một nhóm hoạt động outcome đang mở; đơn mua xử lý tuần tự | Nhiều đơn độc lập chạy song song |
| Vendor acknowledgement, delivery review, dispute, wind-down, refund | Tự cưỡng chế vendor trả token hoặc tự phân xử nghĩa vụ pháp lý |

P1 có thể không phù hợp vendor cần trả trước phần lớn giá trị hoặc chỉ nhận VND. Ghi nhận giới hạn này trong nghiên cứu; không giả lập một intermediary nhận token thành vendor đã nhận tiền ngân hàng.

## 3. Vai trò và ranh giới thẩm quyền

| Vai trò | Trách nhiệm | Giới hạn |
|---|---|---|
| OWNER | Tạo campaign/activity/request, nộp hồ sơ; xác nhận hàng đã nhận | Không tự duyệt, sửa approval hoặc đổi ví nhận đã khóa |
| ADMIN | Kiểm tổ chức/vendor, quan hệ liên quan, quyền kiểm soát ví, hồ sơ riêng | Không có quyền payout chỉ nhờ global role ADMIN |
| Resolver chính | Duyệt campaign/request, quyết định giá trị giao hàng, settlement/outcome/case | Không đặt recipient tùy ý, không bỏ cap/window hoặc tự nhận tiền |
| Resolver dự phòng | Tiếp quản quyết định bị quá hạn hoặc resolver chính rút vì COI | Không hoạt động song song; không sửa quyết định đã final |
| Vendor | Ký chấp nhận terms, nhận token, cung cấp chứng từ, trả tiền | Không tự xác nhận chất lượng/giao hàng đạt |
| Donor | Đóng góp, đọc thông tin công khai, challenge, nhận refund | Không rút tự do khi ACTIVE; không thay recipient refund |
| Executor | Gửi tx thực thi payout đã được cho phép | Không chọn amount, recipient hoặc nội dung quyết định |

On-chain chốt trước địa chỉ organizer, resolver chính/dự phòng, token, policyHash. Principal và backup phải khác nhau, khác organizer/vendor đối với quyết định liên quan. Kiểm khác ví không chứng minh khác người; hồ sơ COI vẫn cần người kiểm.

Staff verification là Web2 trust layer: record riêng tư có hash/expiry, resolver phê duyệt commitment chứa hash đó. Contract kiểm authority resolver, binding/hash và thời hạn được ký; không tự xác minh danh tính ngoài đời hoặc tin cờ `verified=true` từ client. Vendor ký acknowledgement từ chính ví nhận để chứng minh quyền kiểm soát, không chứng minh tư cách pháp nhân.

Caller payout có thể permissionless sau khi đầy đủ guard. Gas do caller tự trả; số tiền và ví nhận do contract đọc từ quyền đã khóa. Không cần ép vendor kết nối ví để claim tiền, nhưng vendor phải xác nhận terms trước.

## 4. Hồ sơ nghiệp vụ và liên kết

### 4.1 Campaign commitment

Khóa trước publish: purpose, beneficiary scope, allowed expense categories, goal, fundingEnd, outcome criteria, execution horizon, policyHash, refund policy, organizer wallet và deployment identity. Goal > 0, nhận góp tối đa goal; funding duration từ 1 đến 30 ngày.

Full funding tự đóng nhận góp; cần resolver xác nhận eligibility trước ACTIVE. Thiếu goal tới hạn: permissionless timeout → refund toàn custody, chưa được tạo nghĩa vụ vendor. Thay mục đích/goal/ví chính không sửa in-place; campaign mới không thừa kế tiền cũ tự động.

### 4.2 Activity — nhóm kết quả, không phải milestone cấp vốn

Một activity là kết quả thực tế có thể kiểm độc lập, ví dụ mua và trao 50 suất quà. Tạo trong quá trình ACTIVE, không lập danh sách bắt buộc từ đầu. Activity liên kết đơn mua hàng, vận chuyển và báo cáo trao quà; không có hàm tự cấp ngân sách activity.

Khóa trước đơn đầu: outcome criteria, budget ceiling, beneficiary subset, target quantity, delivery/outcome deadlines. Tổng gross approval của các request thuộc activity không vượt activity ceiling; cancellation/return không tự tái mở gross ceiling. MVP không sửa trần tùy ý. Chỉ được đóng `CANCELLED_NO_SPEND` và tạo activity thay thế khi chưa có payout, mọi request đã đóng, không còn commitment/nghĩa vụ, reserve/quarantine hoặc case. Activity đã chi nhưng không hoàn thành phải qua wind-down; không tạo activity khác để lách cap hoặc bỏ outcome cũ.

Đề xuất cap activity = tối đa 50% C để không mua hết quỹ trước khi có một kết quả thiện nguyện được kiểm. Điều này có thể buộc chia hoạt động thành nhóm nhỏ; là trade-off có chủ đích, không tuyên bố bỏ mọi giới hạn cấp vốn. Hoạt động không thể chia và cần hơn cap không được MVP hỗ trợ. Đo hạn chế này, không âm thầm nâng cap.

Mỗi đồng accepted spend được gắn một activity duy nhất. Chi vận chuyển phục vụ activity đó cộng vào cùng nhóm; outcome verified một lần không được xóa exposure của nhiều nhóm không liên quan.

### 4.3 FundingRequest và purchase terms

Nội dung: requestId, campaignId, activityId, requestVersion, vendorId/wallet, item/service lines, quantities/prices, Q approved maximum, D exact deposit, expectedDeliveryValue, termsHash, hồ sơ nhu cầu/báo giá, deadlines, tiêu chí nghiệm thu, điều kiện hủy/hoàn, verification hash, conflict declaration.

Tổng line items = requested amount; giá trị resolver duyệt phải đúng bản tổ chức gửi. Muốn đổi tiền/terms thì yêu cầu bổ sung, không admin sửa hộ. DRAFT lưu thiếu được; SUBMITTED khóa bản đang xét. Bổ sung tạo version mới cùng requestId trước approval. Sau approval không đổi terms/vendor/Q/D; hủy trước vendor commitment nếu hợp lệ và tạo request mới.

Evidence sau giao hàng có evidenceVersion riêng, không tăng requestVersion để hợp thức hóa khoản đã trả. Mọi report gắn deployment, campaign, activity, request, version và hashes chính xác.

### 4.4 Vendor verification và acknowledgement

Staff kiểm nguồn danh tính/đầu mối, báo giá, wallet proof, quan hệ với organizer/reviewer, expiry. MVP từ chối related-party và trường hợp chưa xác minh được, không giả định mọi vendor ngoài danh sách cấm là độc lập.

Vendor nhận bản terms đầy đủ để ký: Q, D, token/decimals, chain/contract/deployment, deadline, điều kiện giao/hủy, cơ chế review/challenge, không tự claim phần còn lại. Ký có nonce, expiry và requestVersion; thay bytes phải ký lại. Có thể dùng giao dịch acknowledge hoặc structured signature được contract xác minh; chọn một implementation trong code plan, không tạo hai nguồn quyền.

Approval reserve Q chưa có nghĩa vendor đã bắt đầu công việc. `vendorCommitted` chỉ bật sau acknowledgement hợp lệ. Với D > 0, terms mẫu yêu cầu đợi cọc confirmed mới bắt đầu; với D = 0, vendor bắt đầu sau acknowledgement confirmed. Off-chain phát sinh trái terms phải được ghi nhận là exception/tranh chấp, không tự xóa bằng contract timeout.

## 5. Luồng và trạng thái

```text
Campaign: DRAFT → REVIEW → APPROVED → FUNDING → FUNDED → ACTIVE
          FUNDING thiếu goal → STOPPED + refund
          ACTIVE → WIND_DOWN → COMPLETED / STOPPED / LOCKED_UNRESOLVED

Request: DRAFT → SUBMITTED → NEEDS_INFO → SUBMITTED(version mới)
                    ├─ REJECTED
                    └─ APPROVED_RESERVED → VENDOR_COMMITTED
                         → [DEPOSIT_PAID nếu D > 0]
                         → DELIVERY_REVIEW → ACCEPTED_PENDING_CHALLENGE
                         → DELIVERY_FINAL → FINAL_PAID hoặc NO_FINAL_DUE
                         → FINANCIALLY_SETTLED

Activity: OPEN → OUTCOME_REVIEW → ACCEPTED_PENDING_CHALLENGE → VERIFIED
          hoặc CANCELLED_NO_SPEND / FAILED / DISPUTED
```

DISPUTED là khóa scoped lên request/activity; không ghép mọi tổ hợp thành hàng chục trạng thái campaign. Request có state tài chính, evidence review và case riêng, nhưng một bảng guard contract quyết định hành vi. DB không tự tạo quyền payout.

Chỉ một request chưa FINANCIALLY_SETTLED/closed tại một thời điểm; nhiều nháp được phép. Sau đối chiếu đơn mua, được mở request vận chuyển trong cùng activity dù outcome chưa verified. Chỉ mở activity tiếp theo khi activity cũ VERIFIED hoặc CANCELLED_NO_SPEND; FAILED dẫn tới wind-down, không cho hoạt động mới. Vì vậy vẫn giải quyết được “mua hàng → thuê xe → trao quà” mà chưa cần generic dependency graph.

Ví dụ thành công: C=2000, activity ceiling1000; đơn hàng Q800, cọc160 rồi final640 và settled. Sau đó đơn vận chuyển Q200, không cọc, nghiệm thu dịch vụ rồi trả200. Tổng approval1000, outcome exposure tối đa1000; chỉ sau báo cáo trao quà được VERIFIED mới mở activity tiếp theo. Phải dành ngân sách vận chuyển ngay trong activity ceiling, không dùng toàn trần cho hàng rồi kỳ vọng cap tự tăng.

Đơn D=0 vẫn chiếm slot request/reserve. Không dùng exposure tiền bằng 0 để mở vô hạn đơn đặt hàng.

## 6. Policy thử nghiệm cố định HED-MVP-1

Các giá trị là điểm khởi đầu để test, không chuẩn ngành. Freeze policyHash trước donor góp, không admin sửa giữa campaign.

| Tham số | Đề xuất MVP |
|---|---|
| Cọc/request | D <= floor(20% Q); D được chọn chính xác khi duyệt, không tự mặc định trả 20% |
| Absolute campaign deposit cap | floor(10% C), với C đã cố định sau full funding |
| Aggregate unresolved cash cap | floor(10% C) khi tạo exposure mới |
| Activity gross approval cap | floor(50% C), không đủ nhu cầu thì không duyệt activity |
| Outcome exposure cap | floor(50% C); admissions tính cả phần cam kết có thể tăng exposure, không chỉ số hiện tại |
| Loss stop | Một giá trị loss > 0 được xác nhận → khóa request/cọc mới, wind-down; không dùng tolerance để lặp mất tiền |
| Request đang xử lý | 1/campaign, không tính nháp |
| Payout/request | Tối đa 1 cọc, 1 final; số 0 không tạo transfer |
| Bổ sung evidence | Bản đầu + tối đa 2 lần bổ sung; giữ nguyên lịch sử |
| Case | 1 case mỗi object/evidence version; không appeal lặp cùng version |

`FinancialExposure = sum(Unresolved)`; `OutcomeExposure = sum(AcceptedSpent thuộc activity chưa VERIFIED)`. Hai nhóm tiền được phân loại không chồng nhau tại cùng thời điểm. Approved but unpaid được giới hạn bằng reserve/slot/activity gross ceiling. Khi reclassification làm vượt cap, khóa exposure mới chứ không revert việc ghi nhận sự thật.

Khi phát hiện một khoản accepted sai, phải reclassify có audit, giữ cash counters nguyên; không dùng “đã chấp nhận” để xóa rủi ro. Loss chỉ ghi trên phần tiền chưa được accepted/returned và có quyết định cuối; loss không tạo token. Mỗi phần tổn thất có ID/giá trị đã ghi để không cộng lặp lifetime loss; recovery giảm net loss, không xóa lịch sử sự kiện. Đã vào wind-down thì recovery không tự mở campaign lại.

## 7. Deadline và resolver dự phòng

| Công đoạn | Hạn khuyến nghị / xử lý |
|---|---|
| Campaign eligibility sau đủ goal | 3 ngày chính + 3 ngày dự phòng; không quyết định → wind-down/refund |
| Review request/evidence/outcome | 3 ngày chính + 3 ngày dự phòng từ lần nộp hợp lệ |
| Vendor acknowledgement | 3 ngày sau approval; chưa commit quá hạn → giải phóng reserve |
| Đặt cọc D > 0 | 3 ngày sau acknowledgement; chưa trả thì hủy theo terms chờ cọc, không claim muộn |
| Delivery | Số ngày ghi trong request, 1–30 ngày từ cọc confirmed; D=0 tính từ acknowledgement |
| Nộp hồ sơ delivery | Tối đa 3 ngày sau delivery deadline, có thể nộp sớm |
| Bổ sung hồ sơ | 7 ngày từ kết luận NEEDS_INFO, tối đa 2 lần, không vượt hard stop |
| Challenge delivery/outcome | 3 ngày sau kết luận có public evidence khả dụng |
| Case response | 3 ngày từ mở case |
| Case decision | Sau responseEnd: 3 ngày chính + 3 ngày dự phòng |
| Final payment | 7 ngày từ delivery finalization; expiry không tự xóa nghĩa vụ vendor |
| Outcome submission | 14 ngày sau đối chiếu đơn cuối thuộc activity, trong activity deadline đã khóa |
| Hard stop request/activity | Request: 60 ngày từ acknowledgement của đơn đó; activity: 90 ngày từ acknowledgement đầu tiên thuộc activity |
| Campaign execution horizon | 180 ngày từ ACTIVE, bao gồm thời gian activity; hết hạn → wind-down |
| Wind-down escalation target | 14 ngày để đưa ra quyết định hoặc công bố LOCKED_UNRESOLVED; không tự sung công reserve |

Mọi timestamp tính bằng chain time; thao tác thường `now < deadline`, timeout `now >= deadline`. Finalization chỉ khi `now >= challengeEnd`. Approval phải kiểm lịch khả thi, để đủ review/challenge/final-payment trong hard stop; không cắt challenge window cho vừa hạn.

Dự phòng tiếp quản một decision slot khi primary hết hạn hoặc chủ động recuse bằng tx. Takeover một chiều cho slot đó, principal không được ký sau takeover; mọi quyết định kiểm nonce/state/version. Backup có COI hoặc cũng hết hạn → fail closed đối với cấp mới, permissionless wind-down được gọi. Không tự bổ nhiệm ADMIN thành resolver.

Hard stop chặn business execution mới và mở đường wind-down; không xóa món nợ vendor. Trong wind-down, decision có thẩm quyền vẫn có thể xác nhận thanh toán nghĩa vụ từ order đã committed; không đặt cọc mới, không tăng Q hoặc đổi recipient. Nếu không có người đủ quyền giải quyết thì phần đó giữ LOCKED_UNRESOLVED và công bố rõ. Đây là giới hạn MVP, không hứa mọi quỹ được mở khóa hữu hạn.

## 8. Giải ngân, đối chiếu và quyền vendor

### 8.1 Approval → reserve → commitment → deposit

Approval phải atomic với reserve đủ Q, không chỉ D. Kiểm org/vendor records, request binding, cap/activity/slot, Available và deadlines. Giữ Q trong escrow không phải chuyển tiền.

Vendor acknowledgement khóa nghĩa vụ theo terms. Deposit chỉ khi ACTIVE, acknowledged, còn hạn, không blocking flag, đúng D chưa trả, có reserve và exposure room. `Reserved -= D; G += D; E -= D` cùng transaction exact-transfer; lỗi rollback tất cả.

Trước commitment, OWNER có thể cancel hoặc ai cũng gọi expiry sau hạn. Sau commitment không có đường hủy unilateral rồi chia reserve cho donor; phải settlement theo terms và bằng chứng.

### 8.2 Delivery review và final payout

Resolver ghi candidate accepted delivery value V (0 <= V <= Q), số lượng/chất lượng, report và original/public hashes. V không phải số đã chi từ escrow. Đơn chưa giao hoặc thiếu căn cứ không được candidate MET chỉ vì cần đóng nhanh.

Challenge hết hạn không tự chứng minh hàng thật; nó chỉ hoàn tất quy trình với một kết luận resolver đã có. Dispute khóa final. Kết luận bị thay phải có evidence/report mới và cửa sổ đọc đủ dài trong hạn, không rút ngắn quyền phản đối.

Tại quyết định final, khóa `R_auth`, V và amount P:

```text
NetPaid = GrossPaid - Returned
P = min(max(0, V - NetPaid), Q - GrossPaid, Reserved)
```

Trường hợp gross cap làm P không đủ V-NetPaid: phải giải quyết phần nghĩa vụ còn lại rõ ràng trước final authorization, không giả vờ vendor đã được thanh toán đủ. MVP không phát hành quyền vượt gross cap; không tạo request mới để lách nghĩa vụ chưa xử lý.

Executor trả đúng P đã khóa, không chọn `0 <= payment <= P`. Nếu P=0 chuyển NO_FINAL_DUE không gọi ERC20. Mọi return/reclassification/settlement sau khi khóa P phải vô hiệu hóa authorization chưa execute và yêu cầu resolver tính lại; không tự tăng payout do vendor vừa trả tiền. Authorization kiểm returnedAtAuthorization, nonce, version, V và reserve ở execution.

GrossPaid không giảm khi return; không tái cấp cọc/final đã tiêu thụ. After final, phát hiện sai chỉ mở recovery/dispute, không rewrite giao dịch hoặc final flag.

### 8.3 Partial delivery

V1 có một kết luận giao hàng cuối và tối đa một final. Giao bổ sung chỉ trước quyết định final và trong hạn. Partial final phải kèm căn cứ đóng phần chưa giao; nếu chưa xác định quyền residual thì giữ reserve, không release để đạt trạng thái xanh.

Q=1000, D=200, V=700, R=0 → final500; residual300 chỉ release khi phần đơn còn lại được đóng đúng căn cứ. V=100 → P=0, AcceptedSpent100, Unresolved100; không gọi Unresolved là tiền đã thu hồi.

### 8.4 Phân loại net cash và recovery

`GrossPaid - Returned = AcceptedSpent + Unresolved + NetLoss`. AcceptedSpent chỉ là phần token net được đối chiếu vào hàng/dịch vụ, không vượt V và không vượt net paid; giá trị hàng nhận còn chưa trả được theo dõi là nghĩa vụ riêng.

Return chỉ ghi actual exact inflow qua request ID, tổng <= GrossPaid. MVP chỉ vendor wallet đã khóa gọi return; không tự gán token chuyển trực tiếp vào contract. Return tự động giảm Unresolved rồi NetLoss trong giới hạn đã xác định; phần còn lại liên quan AcceptedSpent làm giảm cash-attributed AcceptedSpent và đánh dấu cần đối chiếu lại nghĩa vụ, không thay report gốc về hàng đã nhận. Các điều chỉnh cùng tx, tiền mới vào Quarantined khi request chưa settled.

Resolver phân loại/quyết định release Quarantined có hash/căn cứ; cash classification không cho quyền transfer tùy ý. Return sau khi request đã settled và không mở lại vendor obligation có thể vào Available khi ACTIVE, hoặc refund supplement khi WIND_DOWN/terminal. Nếu có claim nghĩa vụ mới, khóa phần tranh chấp trước khi allocation; entitlement refund đã phát hành không bị thu hồi.

## 9. Dừng, nghĩa vụ còn lại và refund

| Trạng thái đơn khi dừng | Xử lý |
|---|---|
| Chưa vendor commitment | Vô hiệu approval, release reserve; không payout |
| Đã commitment, chờ cọc | Không trả cọc mới; áp terms chờ cọc và xác nhận không có nghĩa vụ khác trước release |
| Đã trả cọc / D=0 vendor đã bắt đầu | Giữ reserve cho nghĩa vụ cần xử lý; chặn đơn mới; xét delivery/cancellation/dispute |
| Delivery finalized, final chưa trả | Trả nghĩa vụ hợp lệ từ reserve theo amount đã khóa; không chia cùng khoản cho donor |
| Final đã trả nhưng outcome chưa đạt | Không tự thu hồi; giữ báo cáo thiếu/không đạt, recovery thực mới tăng quỹ |

Wind-down refund Available ngay sau đóng contributions và chốt allocation; phần Reserved/Quarantined vẫn riêng. Base snapshot chỉ một lần; mọi phần release/recovery đủ điều kiện sau đó tăng SupplementPool, không snapshot lại toàn E.

COMPLETED yêu cầu outcome đạt, mọi request settled, reserve/quarantine bằng0 hoặc đã phân loại xong, không blocking case. STOPPED có thể ghi nhận loss đã resolved và kết quả một phần. LOCKED_UNRESOLVED thể hiện nghĩa vụ chưa phân xử, nhưng donor vẫn claim phần refund đã allocated. Không bắt claim hết mới COMPLETED/STOPPED.

Bất kỳ ai có thể gọi transition timeout/allocation khi điều kiện deterministic đã đủ; quyết định khoản vendor còn phải nhận vẫn cần resolver có authority. Actor offline không tự tạo approval.

## 10. Sổ tiền và bất biến

Ký hiệu: C tổng contributions; G gross payouts; R actual returns; F refunds paid; E accounting custody. Không có phí từ quỹ.

```text
C + R = G + F + E
E = Available + Reserved + Quarantined + RefundAllocated
tokenBalance(contract) >= sum(E của mọi campaign)

Q_i = GrossPaid_i + Reserved_i + Released_i       (request đã approved)
0 <= Returned_i <= GrossPaid_i <= Q_i
NetPaid_i = AcceptedSpent_i + Unresolved_i + NetLoss_i
NetPaid_i = GrossPaid_i - Returned_i

RefundAllocated = BasePool + SupplementPool - F
sum(remaining donor entitlements) <= RefundAllocated
```

RefundAllocated gồm cả dust chưa thể chia, không chỉ tổng claimable. Không cho Available/Reserved/Quarantined trùng cùng token. Released_i là reserve từng request đã giải phóng một lần; reallocation sang request khác không reset lịch sử i. Quarantine là phân loại custody, không phải tiền mới.

Sau full funding contribution weights cố định. `base_i=floor(c_i*BasePool/C)`; `supplement_i=floor(c_i*SupplementPool/C)`; claim = base chưa consumed + supplement_i - supplementPaid_i. Pool tích lũy không giảm vì claim; F/paid tăng và E/RefundAllocated giảm cùng tx. C=0 không tạo positive donor pool; không chia0. Không expiry/sweep cho claim; floor theo integer base unit.

Base=0 có thể được consumed mà không token transfer; quyền supplement giữ nguyên. Transfer thất bại rollback consumed/paid, không mất quyền. Không đổi ví refund khi đổi email/liên kết ví. Token gửi trực tiếp ngoài donate/return là excess không phân bổ, không cộng C/R, không có admin withdrawal trong MVP.

### Trace cùng cap MVP

Campaign C=2000, activity ceiling1000, request Q1000, D200 (20% Q và10% C). Hai donor góp1000/người.

| Mốc | Available | Reserved | Quarantined | RefundAllocated | G | R | F | E |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Đủ goal | 2000 | 0 | 0 | 0 | 0 | 0 | 0 | 2000 |
| Reserve Q | 1000 | 1000 | 0 | 0 | 0 | 0 | 0 | 2000 |
| Trả cọc | 1000 | 800 | 0 | 0 | 200 | 0 | 0 | 1800 |
| Wind-down, base1000 | 0 | 800 | 0 | 1000 | 200 | 0 | 0 | 1800 |
| A claim base500 | 0 | 800 | 0 | 500 | 200 | 0 | 500 | 1300 |
| Quyết định V700, trả final500 | 0 | 300 | 0 | 500 | 700 | 0 | 500 | 800 |
| Đóng phần đơn còn lại, release300 → supplement | 0 | 0 | 0 | 800 | 700 | 0 | 500 | 800 |
| Vendor return100 sau settled → supplement | 0 | 0 | 0 | 900 | 700 | 100 | 500 | 900 |
| A claim200, B claim700 | 0 | 0 | 0 | 0 | 700 | 100 | 1400 | 0 |

Final totals:2000+100=700+1400+0. BasePool1000, SupplementPool400; mỗi donor tổng700. Nếu return100 thực tế chưa vào thì không có dòng tăng supplement đó. Recovery làm net accepted cash giảm phù hợp; không tự sửa kết luận số hàng V700.

## 11. Bằng chứng, challenge và dữ liệu riêng

Pre-payment: nhu cầu, line items, báo giá, vendor verification, acknowledgement/terms. Delivery: hàng/dịch vụ đã nhận, người kiểm nhận, invoice và đối chiếu tiền; không đòi bằng chứng final bank payment trước final ERC20 payout. Outcome: bàn giao đúng nhóm thụ hưởng, số lượng, xác nhận độc lập khi có, sai lệch và giới hạn.

### 11.1 Quy tắc đánh giá chung

Một tiêu chí phải có một kết luận rõ ràng: `MET`, `NOT_MET` hoặc
`NEEDS_INFO`. `MET` không có nghĩa “đúng ngoài đời”; nó chỉ xác nhận resolver
đã kiểm bộ căn cứ được mô tả dưới đây và ghi lý do có thể review. `NEEDS_INFO`
không phải chấp thuận có điều kiện, không mở quyền reserve/cọc/final. `NOT_MET`
chỉ kết luận tiêu chí đang xét không đạt; settlement, loss hoặc wind-down vẫn
phải theo guard và sổ tiền ở mục 8--10.

Mỗi lần submit/review phải lưu immutable review record gồm: object và version,
criterion ID, kết luận, reason code, mô tả ngắn, reviewer/role, thời điểm,
hash manifest gốc, hash public bundle (nếu công bố), conflict declaration và
tham chiếu case. Sửa bản giải trình hay file tạo evidence version mới; không
ghi đè kết luận cũ. Resolver chỉ có thể kết luận khi không có COI đã khai báo
và verifier/vendor/organizer không chính là resolver cho object đó. Không thể
chứng minh độc lập chỉ bằng địa chỉ ví khác; ADMIN phải ghi kết quả kiểm COI
off-chain trước khi object vào hàng resolver.

Các cột `required` bên dưới là điều kiện tối thiểu để resolver được chọn
`MET`; một file đơn lẻ không thay thế toàn bộ criterion. Thiếu file có thể
được `NEEDS_INFO` nếu còn hạn và lượt bổ sung, hoặc `NOT_MET` nếu hết hạn,
không thể kiểm nguồn, hay mâu thuẫn trọng yếu không được giải trình. `Human
review` là phần không tự động hóa: hệ thống chỉ kiểm manifest, hash, ACL,
binding, hạn và completeness; không suy chất lượng hàng, danh tính hay sự
kiện thực tế từ upload/hash.

### 11.2 Rubric nhu cầu mua trước reserve/cọc

| ID | Criterion và căn cứ bắt buộc | Kết luận chặn/mở | Owner kiểm | Dấu vết bắt buộc |
|---|---|---|---|---|
| NEED-01 | Mục đích, activity, nhóm thụ hưởng, loại chi và quantity có trong campaign/activity đã khóa; không ngoài scope. | `NOT_MET` từ chối request; `MET` mới xét tiếp. Không tự đổi campaign/activity. | Resolver | request version + activity/campaign commitment hash |
| NEED-02 | Line items, đơn giá, quantity và currency/token cộng đúng requested amount; `Q`, `D`, expectedDeliveryValue và deadline nhất quán. | `NEEDS_INFO` khi lỗi dữ liệu có thể sửa; `NOT_MET` khi amount/terms không giải trình được. | Resolver; server kiểm tổng/format | canonical line-item snapshot + calculation result |
| NEED-03 | Báo giá/vendor offer còn hiệu lực, định danh vendor và recipient wallet đã ADMIN xác minh; wallet proof khớp ví nhận. | Không `MET`/reserve nếu vendor verification hết hạn, thiếu hoặc wallet khác terms. | ADMIN rồi resolver kiểm binding | verification record hash/expiry + wallet proof hash |
| NEED-04 | Declaration quan hệ organizer/vendor/reviewer đầy đủ; không related-party và resolver không COI. | `NOT_MET` cho MVP nếu có related-party/COI chưa xử lý; không thay reviewer để che record. | ADMIN; resolver recuse | conflict declaration + verification decision |
| NEED-05 | Activity ceiling, one-open-request slot, `Q` reserve, deposit/unresolved caps, execution horizon và lịch review/challenge đều còn room. | Đây là guard deterministic: không đạt thì không tạo approval/reserve, không cho override thủ công. | Contract; resolver chỉ đề xuất | policyHash, counters và guard result trong approval event |
| NEED-06 | Terms nêu rõ hàng/dịch vụ, điều kiện giao/hủy/return, delivery criteria và recipient; vendor sẽ ký đúng requestVersion. | `NEEDS_INFO` nếu terms mơ hồ; `MET` mới approved. Approval vẫn chưa là commitment. | Resolver | termsHash + criterion list hash |

Resolver chỉ được approve khi NEED-01..06 đều `MET`. Approval đóng băng
snapshot; vendor acknowledgement sau đó phải khớp `termsHash`, `requestVersion`,
chain và deployment. Acknowledgement không sửa hay bù thiếu căn cứ NEED-01..06.

### 11.3 Rubric giao hàng và settlement

| ID | Criterion và căn cứ bắt buộc | Giá trị quyết định | Kết luận chặn/mở | Owner kiểm |
|---|---|---|---|---|
| DEL-01 | Delivery package bind đúng request/version/vendor; có invoice/biên nhận hoặc chứng từ dịch vụ, thời điểm nhận và người kiểm nhận. | Không tự suy `V`; chỉ mở review. | Thiếu/mismatch → `NEEDS_INFO` hoặc `NOT_MET`; không final. | Resolver + human review |
| DEL-02 | Hàng/dịch vụ giao khớp line items về loại, quantity, chất lượng/điều kiện đã khóa; sai lệch được liệt kê. | Chỉ phần được xác nhận mới có thể vào `V`. | Không được chọn `MET` cho toàn đơn khi chỉ có một phần đạt. | Resolver + người kiểm nhận |
| DEL-03 | Nguồn kiểm có thể đối chiếu: người kiểm nhận/đầu mối, địa điểm/thời gian khi phù hợp, và giải thích mâu thuẫn giữa invoice, report, quantity. | Xác định độ đủ căn cứ cho `V`, không tạo giá trị hàng mới. | Nguồn không kiểm được hoặc mâu thuẫn trọng yếu → không `MET` cho phần liên quan. | Resolver + human review |
| DEL-04 | Số tiền đã trả, return thực nhận và hàng/dịch vụ đã giao được đối chiếu theo request. | `V` phải thỏa `0 <= V <= Q`; `P` chỉ tính bằng công thức mục 8.2. | Không dùng invoice hay `V` để vượt `Q`, `Reserved` hoặc gross cap. | Contract/accounting guard |
| DEL-05 | Partial delivery ghi rõ phần đạt, phần chưa giao, nghĩa vụ residual, deadline/bước xử lý hoặc căn cứ release. | Resolver chốt partial `V` và trạng thái residual. | Không rõ residual → giữ reserve/quarantine; không release để đóng đơn. | Resolver |

`DELIVERY_CANDIDATE` chỉ được tạo khi DEL-01..04 đủ để review và report/public
bundle khả dụng. Resolver khóa `V`, criterion outcomes và hash report trước
challenge. Sau cửa sổ challenge không case, hoặc case được settle, `DELIVERY_FINAL`
mới cho phép authorization final; contract vẫn tự kiểm nonce, `Returned`, `V`,
`Reserved` và exact `P`. `MET` của delivery không đồng nghĩa outcome thiện
nguyện đã đạt.

### 11.4 Rubric outcome trao quà

| ID | Criterion và căn cứ bắt buộc | Kết luận chặn/mở | Owner kiểm | Dấu vết bắt buộc |
|---|---|---|---|---|
| OUT-01 | Báo cáo bind đúng activity, các request đã settled và beneficiary subset/target quantity đã khóa. | Mismatch → không `MET`; không mở activity mới từ report sai binding. | Resolver | activity commitment + request IDs + report hash |
| OUT-02 | Bằng chứng bàn giao thể hiện số lượng đã trao, thời gian/địa điểm phù hợp và sai lệch so với target. | Chỉ `MET` khi đạt tiêu chí outcome đã khóa hoặc có quyết định rõ phần đạt/không đạt. | Resolver + human review | delivery/outcome manifest + variance record |
| OUT-03 | Có xác nhận độc lập khi campaign yêu cầu hoặc khi resolver không thể tự đối chiếu; nếu không có, báo cáo phải nêu giới hạn và nguồn còn lại. | Không được trình “đã xác minh độc lập” khi chỉ có organizer/vendor tự khai. | Resolver | confirmer reference hoặc limitation reason |
| OUT-04 | Không còn case outcome mở, deadline/challenge đã xử lý, và outcome report/public bundle khả dụng trong window. | Chỉ `MET` cuối cùng mới đưa activity `VERIFIED`. | Contract guard + resolver | candidate/final event + case references |

Outcome có thể `NOT_MET` dù delivery/payment đúng. Khi đó không viết lại payout
đã mined, không gọi campaign `COMPLETED`, không tự tạo thêm cash; resolver ghi
variance, loss/reclassification nếu có căn cứ và chuyển theo guard wind-down.
Một activity `VERIFIED` là điều kiện mở activity tiếp theo, không phải chứng
minh mọi người thụ hưởng đều nhận giá trị hoàn hảo ngoài đời.

### 11.5 Kết quả review, challenge và trace kiểm chứng

| Kết quả | Khi dùng | Tác động được phép |
|---|---|---|
| `MET` / candidate | Đủ criterion cho object hiện tại, report/public bundle đã khóa. | Mở challenge window; không tự payout hay đánh dấu outcome hoàn tất. |
| `NEEDS_INFO` | Thiếu căn cứ có thể bổ sung trong lượt/hạn còn lại. | Giữ state và reserve; không cấp quyền tiền mới; tạo version/bổ sung có audit. |
| `NOT_MET` | Không đạt, hết hạn, không kiểm được nguồn hoặc mâu thuẫn trọng yếu. | Không final chỉ vì timeout; resolver/case xác định settlement, residual và wind-down theo mục 8--9. |
| `UPHOLD` | Case không bác được candidate bằng material hợp lệ. | Giữ kết luận đã khóa, mở 3 ngày xem kết luận; không có case thứ hai cùng version. |
| `REJECT_AND_SETTLE` | Case hoặc review bác một phần/toàn bộ. | Khóa final liên quan; phải ghi `V`, reserve/quarantine, loss và nghĩa vụ residual trước transition. |

Mỗi criterion có test fixture tối thiểu gồm một bộ đạt, một bộ thiếu/mismatch và
một bộ mâu thuẫn/partial nếu criterion có amount hoặc quantity. H0 phải lập
state/action/actor/guard table từ rubric này. H2 kiểm NEED-05, DEL-04,
challenge/final guards và mọi tác động custody; H3 kiểm immutable record,
ACL/version/hash và projection; H4 kiểm reason/disabled state không báo thành
công sớm; H5 chạy trace mua → vận chuyển → trao quà. Mapping tối thiểu: NEED →
MVP-T02/T03/T04/T15; DEL → MVP-T05/T06/T10/T12; OUT → MVP-T08/T09/T14; record,
ACL và lifecycle → MVP-T12/T13. Các đánh giá nguồn/chất lượng/COI là human
review có nhãn, không được báo PASS chỉ nhờ test tự động.

MVP giữ PDF/PNG/JPEG,10MiB/file, tối đa20 bản gốc/package; bản public redacted tương ứng được chọn có chủ đích. Organization/vendor documents không mặc định công khai. Manifest/hash canonical, private ACL, MIME/bytes/hash được kiểm server-side. Public report không chứa PII, presigned URL hoặc bí mật ví.

Donor contribution>0 và resolver được mở case delivery/outcome đúng window; không donor-count quorum/bond. Một case/object/version; người khác thêm material vào case đó trước responseEnd, không tạo thêm timer. Tối đa20 tài liệu/case, một material bundle/donor/version; API rate-limit không thay guard chain.

Trước deposit donor có thể báo nghi ngờ off-chain để resolver xem và dừng; báo cáo này không tự khóa on-chain. UI phải nói rõ giới hạn đó. On-chain challenge MVP bắt đầu ở candidate delivery/outcome; case financial khóa final liên quan, case outcome khóa request mới trong activity/campaign nhưng không tự hủy vendor payable đã final.

Case outcomes: UPHOLD (căn cứ đã đọc, mở lại3 ngày xem kết luận), REQUEST_INFORMATION (còn lượt/hạn mới quay review), REJECT_AND_SETTLE (xác định V/nghĩa vụ/loss rồi wind-down). Không case thứ hai cùng evidence version sau UPHOLD; vấn đề mới có thể được báo resolver để wind-down trước payout. Trường hợp cả reviewer sai và không phát hiện là rủi ro còn lại.

Public bundle không truy cập trước candidate: không bắt đầu window. Hỏng sau window bắt đầu: không tự dừng thời gian chain; cần case/stop có tx đúng hạn. Không UI hứa “storage lỗi tự khóa tiền”.

## 12. UI MVP

| Người dùng | Màn hình và hành động |
|---|---|
| Organizer | Tổ chức hiện có → campaign không chia đợt → activity → request/vendor → gửi → theo dõi duyệt/cọc → hồ sơ giao hàng → outcome |
| ADMIN | Hàng chờ xác thực tổ chức/vendor; identity/COI/expiry; không nút trả tiền |
| Resolver | Ba hàng chờ: nhu cầu mua, giao hàng/settlement, outcome/case; thấy amount/remaining obligations/nguồn quyết định |
| Vendor | Xem terms đã khóa, ký acknowledgement đúng ví, gửi bằng chứng qua đường được cấp quyền, return theo request |
| Donor | Mục đích, funding, danh sách request, đã trả/còn giữ/reserve/refund, outcome riêng, challenge/claim |

Nhãn tiền phải phân biệt: còn trong quỹ, đang giữ cho đơn hàng, đã trả vendor, đã thu hồi, có thể hoàn donor. “Đã thanh toán” không hiển thị như “đã trao quà”. Claim/review disabled có lý do cụ thể. URL phải chứa đúng request/version; liên kết cũ không mở form ký cho request hiện tại khác.

Tx flow: chuẩn bị → chờ ví → hash submitted → receipt success/revert → xác nhận/indexed đúng event. Reload khôi phục tx hash, không tự gửi lại; đổi account/chain hủy ý định chưa ký, không xóa nghĩa vụ tx đã gửi. Nút permissionless không có nghĩa user được sửa calldata nghiệp vụ.

## 13. Kiến trúc và dữ liệu triển khai

```text
Frontend → API: auth, draft, upload, freeze, reports, prepare transaction
Frontend wallet → contract: approval/acknowledgement/payout/return/refund
Contract events → indexer → PostgreSQL projections → API/UI
Private storage: original documents; public storage/access: redacted bundles
```

Contract giữ amounts, identities, commitments, deadlines, guards, role takeover, case/refund counters. Backend giữ nội dung hồ sơ, membership/ACL, file integrity, API validation; không có endpoint staff sửa custody.

Entity tối thiểu: campaign commitment; activity; vendor verification; request draft/version/frozen snapshot; approval; vendor acknowledgement; delivery package/report; outcome package/report; case/material/decision; ledger events/projection. Tất cả tài chính keyed bởi chain+deployment+contract+campaign+request; request DB UUID không dùng nhầm numeric campaign ID.

Source dự kiến: `contracts/src/FundTogetherDisbursement.sol` và `contracts/src/disbursement/DisbursementTypes.sol`; `backend/src/disbursement/`; `backend/src/database/schema/disbursement.schema.ts`; `frontend/src/features/disbursement/`. Một module riêng đủ cho MVP, không thêm plugin policy engine hay microservice.

API families dự kiến: `/v1/disbursement/campaigns`, `activities`, `vendors`, `requests`, `delivery`, `outcomes`, `cases`, `public`, `refunds`. Write endpoint cần OWNER/ADMIN/RESOLVER và object ACL đúng; transaction prepare không ghi payout thành công. GET trả deployment/checkpoint/blockTime, không hiển thị lỗi RPC thành số0. OpenAPI/client và ABI sinh từ nguồn, không copy tay.

Events cần replay được: campaign/funding, activity commitment, request submitted/approved/cancelled, vendor acknowledged, deposit/final paid, delivery candidate/finalized, outcome candidate/finalized, case/takeover, request settled/reclassified, return received, reserve/quarantine released, wind-down, refund allocated/claimed. Cash event có request/campaign counters sau thao tác và reasonHash khi phân loại. Indexer xử lý log order, idempotent/reorg rollback, kiểm identity manifest và code trước hoạt động.

No-loop donor payouts. Các chuyển campaign-wide khi dừng dựa aggregate counters và slot request đang mở, không loop lịch sử request vô hạn. Snapshot tạo base một lần; settlement sau đó allocate increment O(1).

## 14. Giải quyết 12 OPEN và quyết định bổ sung

| ID | Lựa chọn của thiết kế MVP | Mục |
|---|---|---|
| OPEN-01 | Một fixed policy, cọc tối đa20% Q và10% C, không adaptive tiers | 6 |
| OPEN-02 | Unresolved cap10% C, activity/outcome cap50% C, loss>0 dừng mới | 4,6 |
| OPEN-03 | Deadline cụ thể, không auto approval hoặc timeout xóa vendor rights | 7 |
| OPEN-04 | Primary/backup được chốt trước, takeover scoped; cả hai mất thì locked liability công khai | 3,7 |
| OPEN-05 | Wind-down phân free custody/reserve, giữ đường thanh toán nghĩa vụ đã committed | 8,9 |
| OPEN-06 | Donor>0, không quorum/bond,1 case/object/version, material bounded | 11 |
| OPEN-07 | 1 request tài chính đang mở,1 activity outcome; mua rồi vận chuyển được | 5 |
| OPEN-08 | 1 cọc + tối đa1 final, partial settlement có căn cứ, amount final chính xác | 8 |
| OPEN-09 | Outcome đạt + obligations resolved + không case; không chờ donor claim hết | 9 |
| OPEN-10 | Staff kiểm vendor, vendor ký terms, không related-party trong MVP | 3,4 |
| OPEN-11 | Free cash base, cumulative supplement, no expiry/sweep, excess unassigned | 9,10 |
| OPEN-12 | P1 local token; P2/P3/fiat ở post-MVP | 2 |
| MVP-13 | Full funding trước mọi vendor commitment/payment; đổi rõ phương án partial trước | 4 |

“Đã chọn trong thiết kế” không phải “đã test hoặc production-approved”. Các tham số cố định được đưa vào sensitivity experiment ở post-MVP; thay tham số tạo policy version mới cho campaign mới.

## 15. Trình tự triển khai và giữ dữ liệu cũ

1. Đối chiếu bảng state/guard và trace; tạo implementation plan có signatures/API/test cases từ thiết kế này, giải quyết mâu thuẫn trước code tiền.
2. Tách organization verification/auth/storage dùng chung khỏi `advance`; regression onboarding/ACL không đổi.
3. Contract P1 + invariant/adversarial tests + generated ABI/policy.
4. Migration additive + API/evidence + indexer; không xóa migration đã áp dụng hoặc chuyển snapshot B thành HED.
5. FE MVP journeys; integration deployment riêng, giữ account/org/wallet hiện có khi phù hợp.
6. Chỉ rút wizard/routes milestone khỏi luồng tạo mới khi HED đã chạy xuyên tầng; giữ cách đọc/xử lý nghĩa vụ A/B cũ. Không mặc định duy trì hai sản phẩm tạo campaign lâu dài.
7. Nghiệm thu local riêng; ghi manual/reviewer pending trung thực. Không lấy test B để báo HED PASS.

Không push, tạo PR/nhánh hoặc deploy chỉ vì tài liệu dùng thuật ngữ phase. Không sửa obligations contract immutable cũ; rollback UI/code không chuyển được tiền giữa deployment.

## 16. Ma trận kiểm chứng và điều kiện bàn giao

| Ca | Phải chứng minh |
|---|---|
| MVP-T01 | Full funding/thiếu goal/refund; donor weights không đổi sau ACTIVE |
| MVP-T02 | Một slot request, reserve Q đủ, approval race không over-reserve, D=0 vẫn chiếm slot |
| MVP-T03 | Vendor terms signature nonce/version/chain, expiry/cancel before commitment |
| MVP-T04 | Deposit cap/budget/activity cap, claim lặp, token revert/callback/non-exact rollback |
| MVP-T05 | Không trả final trước delivery final/challenge; partial và no-final-due đúng |
| MVP-T06 | Return giữa authorization và payout vô hiệu authorization; không tự tăng final hoặc tái mở gross cap |
| MVP-T07 | Primary/backup timeout, recusal, race takeover, cả hai inactive không auto release nghĩa vụ |
| MVP-T08 | Mua → thuê xe → trao quà không deadlock; không mở activity thứ hai chưa đủ điều kiện |
| MVP-T09 | Outcome exposure, loss/reclassification không tạo cash hoặc mở quyền mới |
| MVP-T10 | STOP ở từng trạng thái vendor; trace mục10 đối chiếu actual token balances và per-donor |
| MVP-T11 | Base0, C0, rounding, nhiều recovery/release, claim xen giữa, dust/excess không sweep |
| MVP-T12 | ACL private/public, stale form, report mismatch, storage unavailable, case limits |
| MVP-T13 | Replay/reorg/reset identity, wrong API deployment, lỗi RPC/indexer, pending/reload/replaced |
| MVP-T14 | Outcome sai/không đạt và chi đúng: không báo COMPLETED; dòng tiền vẫn đúng |
| MVP-T15 | Input lách cap bằng đổi vendor/đa ví/duplicate invoice được chặn hoặc ghi giới hạn human review |

Fuzz model giữ ledger độc lập, không tính expected bằng chính helper implementation. Paired traces B0/B1 dùng cùng giả định vendor, nhu cầu vốn và lỗi reviewer; không kết luận P1 tốt hơn chỉ vì vendor trong mô phỏng tự ứng tiền miễn phí.

Bàn giao kỹ thuật: build/tests, integration actual balances/events/projections, recovery, doc/runbook và danh sách hạn chế. Nghiệm thu con người: vendor hiểu terms, resolver đọc hồ sơ trái chiều, donor hiểu locked vs refundable, Brave/MetaMask thật. Hai loại bằng chứng ghi riêng.

Giới hạn được chấp nhận cho MVP: dữ liệu danh tính/chất lượng hàng dựa người xét; mất hai resolver có thể khóa phần nghĩa vụ; vendor có thể không chấp nhận cọc thấp/thanh toán chậm; cap activity loại bỏ hoạt động không chia nhỏ; không bảo đảm thu hồi tiền đã ra escrow. Đây là nội dung phải đo, không che bằng badge “verified”.
