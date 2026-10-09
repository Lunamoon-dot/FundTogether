# Workflow B — đặc tả pilot đã duyệt

> Ngày: 2026-10-09. Trạng thái: APPROVED_FOR_LOCAL_PILOT.
> Nguồn: [GOAL](../GOAL.md), [kế hoạch](./workflow-b-delivery-plan.md),
> [định hướng NCKH](./research-direction.md).
> Người dùng duyệt B-D01–B-D10 qua yêu cầu: “được hãy tiếp tục gói B-D01-B-D10 đi”.
> Phê duyệt quy tắc pilot; chưa có implementation/acceptance B hoặc phê duyệt tiền thật.
> Không áp dụng cho baseline A hoặc deployment đang chạy.

## 1. Phạm vi và tiêu chí kiểm chứng

B cấp ngân sách trước cho một đợt; nghiệm thu đợt đó không chuyển thêm tiền.
Đợt sau chỉ nhận vốn khi đợt trước được resolver đánh giá đạt, hết thời gian
phản đối, không còn case và khoản dư được báo cáo đã thực sự trả lại.
Đợt cuối vẫn phải nghiệm thu. Không coi donor im lặng là bằng chứng hoàn thành.

MVP đầu tiên là `GIFT_DISTRIBUTION`, có kênh `INSTITUTION` hoặc `DIRECT`.
Task mua/kiểm/vận chuyển/bàn giao thuộc đợt, không tự mở một quyền cấp vốn.
Tiêu chí quà/danh sách người nhận thuộc checklist gift đã chốt. Contract escrow
giữ budget/thứ tự/commitment; không mang checklist quà thành rule cho mọi campaign.
Không thêm workflow engine, verifier riêng, committee, appeal, slash hoặc fiat.

Hai hồ sơ mẫu: [G1 qua đơn vị](./examples/gift-campaign-institution.md) và
[G2 trực tiếp](./examples/gift-campaign-direct.md). Kết quả cần đánh giá: đúng
hạch toán/quyền/state, vốn phải ứng, vốn đã cấp chưa nghiệm thu, sai lệch quyết
định, thời gian người/chain/indexer, gas và khả năng phục hồi. Dữ liệu giả chưa
chứng minh cơ chế phù hợp ngoài đời hoặc reviewer độc lập.

## 2. Đối chiếu source A ở baseline

Baseline Git: `b1881bd2cb3d6a4413605b06741624e86e2323da`.

| Boundary đã đọc | A trong source | Boundary B đã duyệt để triển khai |
|---|---|---|
| `contracts/src/modules/FundTogetherMilestones.sol` | Activation chỉ mở deadline; settlement tăng `totalReleased` và transfer budget | Claim advance chuyển tiền; finalize acceptance không transfer |
| `contracts/src/modules/FundTogetherBase.sol` | Bond coverage; snapshot `C - totalReleased` | Không bond; custody có thêm khoản return thực nhận |
| `contracts/src/FundTogetherMvp.sol` | Resolver không là organizer/donor; version/hash; CONTINUE/RESUBMIT/STOP; timeout; pull bond | Giữ kiểm soát wallet/version; thay policy nghiệm thu và accounting; không kế thừa đường payout A |
| `backend/src/modules/evidence/evidence-packages.service.ts` | Freeze manifest SHA-256 exact UTF-8 bytes; đối chiếu files và checkpoint chain | Thêm context B và original/public commitment; không coi freeze là nộp chain |
| `backend/src/database/schema/organizations.schema.ts` | `verificationStatus` mặc định `unverified`, OWNER membership | Cần quy trình xác thực có căn cứ; trường DB hiện tại chưa chứng minh quy trình đã có |
| `backend/src/modules/campaigns/campaign-review.service.ts` | Account RESOLVER riêng với SIWE wallet `canSign` | Giữ tách account access và authority contract |

Đây là đối chiếu source, không phải xác nhận dịch vụ đang live. Artifact B,
ABI B, migration, contract và FE/BE B chưa tồn tại ở lượt chuẩn bị này.

## 3. B-D01–B-D10: gói quyết định đã duyệt

Mọi dòng B-D01–B-D10 có trạng thái **APPROVED_FOR_LOCAL_PILOT** từ 2026-10-09.
Phê duyệt bao gồm thời hạn, giới hạn case/version, return muộn và điều kiện hoàn
tất của bản đã trình. Thay đổi quyền/tiền mới phải ghi rõ tác động và duyệt riêng.

| ID | Quy tắc pilot đã duyệt | Lý do / tác động quyền và tiền |
|---|---|---|
| B-D01 | Staff kiểm tra tổ chức; một resolver cố định theo deployment ký quyết định; organizer wallet cố định nhận vốn/return; contributor wallet phản đối/claim. Resolver không được donate, không là organizer. Không đổi ví/quyền sau funding. | Phù hợp MVP hiện có, giảm số actor. Resolver vắng dẫn tới timeout, mất ví có thể mất khả năng thao tác; không có admin lấy tiền thay. Xung đột theo người/tổ chức vẫn cần kiểm tra off-chain. |
| B-D02 | B không bond; ERC20 chuẩn exact-transfer, không fee/rebase. Goal = tổng budget dương; không overfund; đủ goal mới cấp. Funding duration 1–30 ngày, chốt trong plan, bắt đầu khi public. | Giảm vốn organizer phải ứng; donor chịu rủi ro advance. B deployment mới, không bỏ bond của A. |
| B-D03 | Sau đủ goal, resolver có 3 ngày xác nhận lại eligibility tổ chức/kế hoạch để mở quyền cấp đầu. Organizer có 7 ngày claim đúng toàn bộ budget đợt 0. Resolver có thể STOP có lý do trước claim. | Thẩm định trước funding không tự đủ cho lần cấp đầu. Không ký/không claim đúng hạn → STOP và refund custody. |
| B-D04 | Mỗi đợt chỉ claim một lần. Sau finalized acceptance của đợt trước, organizer có 7 ngày claim đợt kế. Phải đủ custody; không case; unused của đợt trước đã return đủ. Resolver có thể STOP có lý do trước claim. | Chặn overlap/cấp lặp. Return không tái mở ngân sách đã nhận hoặc tăng budget đợt khác. |
| B-D05 | Organizer khai kết quả; resolver kiểm từng criterion và lý do trong report immutable. MET mở phản đối; NEEDS_INFORMATION mở bổ sung; NOT_MET dẫn STOP; INCONCLUSIVE yêu cầu bổ sung hoặc STOP nếu không thể làm rõ trong giới hạn, không tự đạt. | Đủ giấy tờ chỉ là tiếp nhận. Hash/chữ ký hợp lệ vẫn có thể ghi kết luận sai; cần thực nghiệm T07. |
| B-D06 | Nộp lần đầu trong 30 ngày từ claim; tối đa 3 version/đợt (1 đầu + 2 bổ sung); 7 ngày mỗi lần bổ sung; 3 ngày mỗi review. Hard stop 60 ngày từ claim, mọi deadline đợt bị chặn bởi mốc này. | Hạn cụ thể để thử pilot, chưa có khảo sát xác nhận phù hợp. Không kéo dài vô hạn; version cũ bất biến. |
| B-D07 | Phản đối 3 ngày từ MET + xác nhận public bundle có thể truy cập. Một case/version; donor góp >0 hoặc resolver mở case kỹ thuật; 3 ngày material/phản hồi + 3 ngày resolver xử lý. CONTINUE / RESUBMIT / STOP; timeout = STOP, không coi gian lận. | Case khóa cấp tiếp; không quorum/appeal. CONTINUE là quyết định cuối của case/version; không mở case lặp cùng version. Giới hạn này đánh đổi chống kéo vòng với chứng cứ xuất hiện muộn. |
| B-D08 | Organizer wallet return theo đợt, thực nhận, tối đa advance đợt trừ returns trước. Trước snapshot vào base pool; sau snapshot vào **pool bổ sung tích lũy riêng**. Return luôn được phép trong cap, kể cả sau COMPLETED/STOPPED. | Không sửa base entitlement hoặc bỏ return muộn. Thêm mapping paid bổ sung và UX claim lại khi có inflow mới. Không thu hồi bằng lệnh resolver. |
| B-D09 | Base entitlement `floor(contribution × P0 / C)`; supplement entitlement `floor(contribution × S / C) - supplementPaid`. Pull theo ví góp, không loop donor, không hết hạn, không fee/sweep. C=0 chỉ cho pool=0. | Claim cũ vẫn được nhận bổ sung; rounding dust giữ escrow. Unclaimed là nghĩa vụ, không phải dust. Transfer lỗi rollback, quyền còn để retry. |
| B-D10 | COMPLETED chỉ sau final acceptance, hết phản đối/case và đã return phần unused được xác nhận. Snapshot tiền dư cùng tx đóng; STOP snapshot ngay. Outcome tách refund substate và nghĩa vụ return muộn. | Chuyển hết goal không tự hoàn tất. Không ép donor claim hết mới đóng; không hứa hoàn toàn bộ advance đã ra khỏi escrow. |

Chi tiết tiền và so sánh phương án return: [quy tắc tài chính B](./workflow-b-financial-rules.md).

## 4. Actor, authority và dữ liệu

| Actor | Account/API | Chain | Giới hạn |
|---|---|---|---|
| Organizer OWNER | Kế hoạch, original, redacted, bổ sung và phản hồi | Ví đã chốt: publish/cancel trước cấp, claim advance, submit commitment, return | Account login không thay wallet signing; client address không chứng minh ví |
| Staff xác thực | Kiểm danh tính, đại diện, quyền ví, căn cứ/thời hạn và lịch sử thu hồi | Không quyền rút tiền; xác thực là input cho resolver | Staff role không tạo authority chain; không tự đóng trạng thái chain từ DB |
| Resolver | Queue, original đúng campaign, checklist, conflict declaration và report | Duyệt plan/cấp đầu, MET/bổ sung/STOP, case, finalize đủ điều kiện | Không tùy ý đổi recipient/budget; wallet khác organizer/donor; không reassign giữa nghĩa vụ đang mở |
| Donor | Public redacted, đóng góp/refund theo account-linked wallets | Donate, challenge/material đúng version, claim cho chính ví góp | Không cần là staff; không được xem original chứa PII |
| Bên nhận / nhà cung cấp | Cung cấp tài liệu, đầu mối đối chiếu | Không quyền cấp vốn/nghiệm thu | Không bắt tạo ví; người ký biên bản không tự có authority resolver |
| Bất kỳ caller / worker | Xem deadline/checkpoint | Finalize review/funding/timeout đủ điều kiện | Không reward, không tự đổi deadline, không quyền rút escrow |

Mất xác thực tổ chức sau funding phải được resolver xử lý bằng STOP on-chain
trước advance tiếp theo; cập nhật DB một mình không khóa ví gọi trực tiếp.
Resolver không còn hoạt động thì deadline mở STOP permissionless. Đây là giới
hạn của mô hình một resolver, không phải cơ chế revocation tức thời bởi staff.
Không thay cam kết/nghĩa vụ campaign A bằng source hoặc migration B.

```text
Account login → SIWE wallet link → API access → hồ sơ DB/storage
                                                  ↓ freeze/version/hash
Wallet → RPC → Contract B → receipt/confirmations → Event → Indexer → DB → API/FE
```

Mọi resource B dùng deployment identity, chain ID, contract, campaign, stage,
plan/criteria/policy version và evidence version. Public artifact không chứa
original PII, secrets hoặc presigned URL. Original và redacted là hai object
riêng, hash riêng; public bundle liên kết commitment original nhưng không cho
phép donor xác minh nội dung không được quyền xem.

## 5. Trạng thái và đường thoát

Tên dưới đây là tên nghiệp vụ cho review, chưa là enum/ABI đã triển khai.

```text
Plan DRAFT → APPROVED → FUNDING → FUNDED_AWAITING_FIRST_REVIEW
                                    ↓ first eligibility confirmed
                         ADVANCE_AVAILABLE (stage 0)
                                    ↓ organizer claims, transfer succeeds
                         EXECUTING → EVIDENCE_PENDING_REVIEW
                                    ├─ NEEDS_INFORMATION → SUPPLEMENT_DUE → new version
                                    ├─ NOT_MET → STOPPED + refund snapshot
                                    ├─ INCONCLUSIVE → supplement / STOPPED
                                    └─ MET → CHALLENGE_WINDOW
                                               ├─ CASE_OPEN → CONTINUE / RESUBMIT / STOP
                                               └─ finalize + actual unused return
                                                     ↓
                               STAGE_FINALIZED → next ADVANCE_AVAILABLE
                                               → final COMPLETED + surplus snapshot

Any funded waiting state: expired action deadline / hard stop → STOPPED + snapshot
Refund: BASE_SNAPSHOTTED; LATE_RETURN_TOTAL may grow; per-wallet paid tracked separately
```

| Thao tác | Điều kiện và kết quả | Nếu không có actor / hết hạn |
|---|---|---|
| Duyệt/public | Plan/criteria/budget/wallet/policy immutable; tổ chức kiểm tra; public ghi fundingEnd = timestamp + duration đã chốt | DRAFT/APPROVED chưa nhận tiền có thể chờ; organizer cancel bất kỳ lúc nào |
| Donate | FUNDING, >0, amount <= goal còn thiếu, `now < fundingEnd`; đạt goal chốt C và firstReviewEnd | Thiếu goal tại `now >= fundingEnd`: bất kỳ caller finalize STOP snapshot C |
| Confirm first eligibility | Resolver, đủ goal, đúng plan, `now < firstReviewEnd` | `now >= firstReviewEnd`: STOP; không auto mở claim |
| Claim advance | Organizer, đúng đợt, `now < claimEnd`, đủ E và quyền hiện tại; transfer thành công mới ADVANCED | `now >= claimEnd`: STOP. Revert giữ quyền nếu còn hạn; không bảo đảm retry sau hạn |
| Submit version | Organizer, stage advanced, đúng next version/hash, chưa có case, trong submissionEnd | Không nộp đúng hạn → STOP. Upload/freeze không kéo dài chain deadline |
| Review | Resolver, đúng current version/evidenceHash; report hash nonzero, checklist và nguyên nhân | `now >= reviewEnd`: STOP; không tự MET. Thiếu còn version → bổ sung; hết lượt → STOP |
| MET | Review report theo tiêu chí; public hash và availability statement; surplus đã khai đúng base unit | Mở cửa sổ 3 ngày; không chuyển tiền, chưa mở stage sau |
| Challenge/case | Donor đã góp hoặc resolver case kỹ thuật, đúng version, `now < challengeEnd`; một case/version | Giữ tiền chưa cấp; pending case timeout → STOP |
| Case response/material | Organizer phản hồi; contributor thêm material; resolver xem, `now < responseEnd` | Vắng phản hồi không tự MET/không tự gian lận; chờ resolver tới resolutionEnd |
| Resolve | Resolver, `responseEnd <= now < resolutionEnd`, đúng case/version/hash/reason | `now >= resolutionEnd`: permissionless STOP |
| CONTINUE | Giữ MET, quyết định case cuối; mở lại 3 ngày đọc public bundle; không mở case lặp cùng version | Chứng cứ mới có thể gửi resolver để STOP; đây là thời gian đọc, không phải quyền appeal mới. Hạn cuối đợt không đổi |
| RESUBMIT | Còn lượt, tạo version mới trong 7 ngày; bản cũ/report/case giữ nguyên | Không cấp lại ngân sách; quá hạn hoặc hết lượt → STOP |
| Finalize stage | `now >= challengeEnd`, chưa tới finalizeEnd, MET, case đã CONTINUE hoặc không case; returnedStage >= declaredUnused | Thiếu return hoặc không finalize đúng hạn → STOP; nghiệm thu không transfer |
| STOP | Resolver có reason trước terminal hoặc caller timeout đúng state; khóa mọi advance/submit tiếp và snapshot E | Return/claim refund tiếp tục theo policy; không phục hồi execution |
| COMPLETED | Final stage finalized với nghĩa vụ unused đã trả; tạo base snapshot kể cả E=0 | Outcome giữ nguyên; donor claim không hạn, return muộn tăng supplement |

STOP do resolver trước terminal phải gắn lý do và context đang xét; không phải
quyền arbitrary payout. Organizer chỉ cancel trước advance đầu; sau đó có thể
yêu cầu dừng bằng hồ sơ, resolver STOP hoặc timeout. Không có sửa budget/plan
hồi tố; nếu kế hoạch không còn khả thi, dừng và tạo campaign khác sau đó.

## 6. Deadline pilot đã duyệt và biên timestamp

Các giá trị này đã duyệt **cho pilot/local**, chưa phải default production.
Fixture kỹ thuật contract sau khi duyệt có thể time-warp, không đồng bộ giờ
chain ứng dụng hay dùng giờ máy để mở quyền.

| Đồng hồ | Mốc bắt đầu | Giá trị pilot đã duyệt |
|---|---|---|
| Funding | Public mined | 1–30 ngày theo plan đã duyệt |
| First eligibility | Đạt goal | 3 ngày |
| Claim advance | Eligibility đầu / finalized đợt trước | 7 ngày |
| Initial evidence | Advance mined | 30 ngày |
| Review version | Submit mined | 3 ngày |
| Supplement | Quyết định NEEDS_INFORMATION/RESUBMIT mined | 7 ngày, tối đa 2 lần bổ sung |
| Challenge | MET + availability statement mined / CONTINUE mined | 3 ngày |
| Case material/response | Case opened mined | 3 ngày |
| Case resolution | Hết response window | Thêm 3 ngày |
| Finalization và return unused | Hết challenge window | Thêm 7 ngày |
| Hard stop từng đợt | Advance mined | 60 ngày |

Mọi hạn của đợt là `min(mốc + window, hardStop)`. Review/CONTINUE muốn mở
cửa sổ 3 ngày mới phải còn đủ thời gian trước hardStop; nếu không, không cho
ghi MET/CONTINUE rồi finalize ngay để bỏ cửa sổ. Resolver chọn STOP hoặc chờ
timeout của state hiện tại. Khi responseEnd = resolutionEnd do cap, chỉ còn
timeout; không bỏ qua cơ hội phản hồi để xử lý sớm.

Với thao tác phải thực hiện trước hạn: `now < deadline`; timeout: `now >= deadline`.
Finalize review: `challengeEnd <= now < finalizeEnd`, không pending case. Đúng
hardStop chỉ timeout được phép. Hết giờ không tự đổi chain state; cần tx gọi.
Phải test trước/bằng/sau mọi deadline, đặc biệt challenge và settle cạnh tranh.

## 7. Availability, nội dung sai và bổ sung

MET report ghi từng criterion: nguồn đã đọc, phép đối chiếu, kết luận, phạm vi,
giới hạn, declaredCampaignSpent/unused và reason. Report được freeze/hash; account
intent chưa có hiệu lực tiền. Contract xác thực signer/context/state và opaque
commitment, không đọc hóa đơn để suy kết quả; resolver chịu trách nhiệm kết luận.

Trước MET, resolver kiểm public bundle/redaction và xác nhận truy cập trong
report. Storage lỗi → chưa ký MET; review deadline vẫn hữu hạn. Storage hỏng
trong cửa sổ → donor hoặc resolver mở case kỹ thuật on-chain trước hạn để khóa
finalize; khôi phục và đối chiếu đúng bytes mới CONTINUE, mở đủ 3 ngày mới. Không
khôi phục/không xử lý case đúng hạn → STOP. Backend không tự gia hạn chain.
Contract không biết storage outage nếu không có tx báo; outage không được phát
hiện kịp là rủi ro cần ghi/đo T18, không có oracle availability trong MVP.

INCONCLUSIVE không được map sang MET. Yêu cầu bổ sung trong giới hạn; nếu không
làm rõ được thì STOP. Không mở case trước MET để tiêu thụ quyền donor phản đối
của version chưa từng được công khai nghiệm thu. Một case/version bao gồm mọi
donor material trong cửa sổ response. Sau CONTINUE không có case thứ hai cùng
version: nếu outage/chứng cứ mới, gửi resolver để STOP trước finalize; nếu không
ai gọi tx ngăn chặn kịp, chain có thể finalize. Đây là giới hạn cần người dùng
chấp nhận của policy không appeal, không phải bảo đảm public availability.
Việc dùng cùng hash ảnh là tín hiệu đối chiếu, không tự
chứng minh gian lận; sai deployment/stage/version là lỗi binding phải chặn.

## 8. Commitment và event cần cho bước triển khai sau duyệt

Plan/criteria: hash exact immutable bytes gồm activity type/channel, budgets,
tasks, điểm hoàn thành, rubric, policy values, organizer/resolver và identity.
Evidence: exact manifest + hashes của mọi file; context và parent version được
chốt. Decision: report hash gắn planHash/criteriaHash/evidenceHash/publicHash,
actor và outcome. Không tự thêm mật mã hoặc chữ ký ngoài tx; SHA-256 theo
boundary bytes đã có, contract kiểm opaque bytes32, version và signer.

Nhóm event dự kiến: plan approved/published; donation và funded; first eligibility;
advance budget; evidence/version; decision/deadline; case/material/response/outcome;
stage finalized; return theo stage và bucket trước/sau snapshot; base snapshot;
base/supplement refund; STOP/COMPLETED. Event tiền cần campaign/stage/wallet,
amount và counters/bucket đủ replay. Indexer dùng tx/log/block hash cùng identity,
transaction checkpoint/projection, retry idempotent, rollback reorg, reset fail closed.
Tên/signature/ABI và migration cụ thể chỉ lập sau duyệt; không copy ABI bằng tay.

## 9. Review gate

Đầu ra chuẩn bị: hai mẫu, 12 package synthetic, nhãn tham chiếu tách riêng,
8 accounting trace, test công cụ offline, spec này và financial rules.
Ảnh fixture là SVG minh họa có nhãn synthetic; JSON/SVG không phải DTO/file MIME
production hiện tại. Chuyển thành hồ sơ PDF/PNG phù hợp upload B là việc tích hợp
sau duyệt. Không đưa hồ sơ giả này vào storage/DB/chain đang chạy.

**Điểm duyệt B-D01–B-D10 đã hoàn tất.** Không hỏi lại gói quyết định này.
[Kế hoạch code](./workflow-b-code-plan.md) ghi signature/event/migration/test để
review theo GOAL.md trước thực hiện; triển khai trong chat này, không tạo chat/sub-agent.
Trạng thái giai đoạn 1: mẫu và quyết định pilot DONE; implementation B IN_PROGRESS.

Fixture JSON/SVG đã freeze lúc DRAFT giữ nguyên bytes/hash và nhãn DRAFT lịch sử.
Phê duyệt không âm thầm sửa những commitment này. Artifact policy/deployment B
sau triển khai phải chứa policy đã duyệt và được đối chiếu getters contract.

## 10. Điều chưa được chứng minh

Chưa có khảo sát chi phí thực tế, nhãn độc lập ngoài đời, reviewer experiment,
Contract B đầy đủ/invariant/deployment, reorg/indexer B, upload B, manual MetaMask hoặc
deployment B. [Nghiệm thu B](./workflow-b-acceptance.md) giữ T01–T18 TODO, ghi
riêng evidence của công cụ offline. Đặc tả này không cấp quyền dùng tiền thật.
