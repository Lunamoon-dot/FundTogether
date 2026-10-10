# Workflow B — theo dõi nghiệm thu

> 2026-10-11: goal triển khai DONE theo lựa chọn rõ ràng của người dùng.
> Nghiệm thu toàn hệ thống vẫn IN_PROGRESS; phần con người chuyển sang giai đoạn
> sau, TODO/chưa đạt. Không tự đóng F2/I3/OI1 hoặc điền kết luận reviewer.
> Bàn giao kỹ thuật: frontend157/157, backend166/166, contract281/281;
> frontend B build/lint PASS, F4–F6 trình duyệt API giả lập33 kiểm tra PASS.

> 2026-10-09. IN_PROGRESS — C1–C6, B1–B6, F1–F6 có code/test; G1/G2 và nhiều nhánh failure/recovery đã kiểm xuyên tầng. Manual/reviewer và các kiểm tra còn thiếu chưa hoàn tất.
> [GOAL](../GOAL.md) / [delivery plan](./workflow-b-delivery-plan.md) /
> [spec pilot đã duyệt](./workflow-b-spec.md), [code plan đã duyệt](./workflow-b-code-plan.md).

Trạng thái nghiệm thu: **CHỜ DỮ LIỆU I3**, gồm thao tác MetaMask và quyết định reviewer.
CSV reviewer hiện có60 dòng mẫu,0 outcome được nhập. Có bằng chứng manual một
phần về liên kết ví sau sửa seed (ảnh người dùng và liên kết organizer/donorA
trong DB); chưa có hành trình ký giao dịch G1/G2 hoặc nghiệm thu popup đầy đủ.
Thực hiện theo [hướng dẫn kiểm thử thủ công](./workflow-b-manual-test-guide.md),
ghi kết quả từng bước, không suy PASS toàn bộ từ liên kết ví thành công.
Code-plan approval đã được ghi nhận, không có điểm duyệt lại. Báo cáo kỹ thuật
vẫn giữ từng kết quả bên dưới; toàn bộ nghiệm thu chưa hoàn tất.

Ngày2026-10-10, người dùng xác nhận chưa test và chọn làm thủ công sau; tiếp tục
phần kỹ thuật trước. Giữ I3/OI1 mở và không tự điền kết quả ký ví/reviewer.

Ngày2026-10-10: đã sửa nhãn xác thực ở danh sách/hồ sơ tổ chức, focused
public-review34/34 PASS, lint/B build PASS; không phải nghiệm thu ADMIN thực.
[Thiết kế onboarding](./workflow-b-organization-onboarding-plan.md) đã được
triển khai sau yêu cầu tiếp tục goal: OB1–OB3/OF1–OF2 DONE về code/kiểm thử;
OI1 IN_PROGRESS vì còn nghiệm thu người dùng. Các case mới không thay T01–T18
hoặc tự đóng I3.

### Bằng chứng onboarding ngày2026-10-10

Đối chiếu kỹ thuật mới nhất sau sửa màn xét duyệt: frontend156/156,
backend166/166 (27 suites), frontend B build/lint PASS. Chạy lại toàn bộ
contract local EVM:281/281,24 suites,0 fail/skip; preflight B PASS.
Các số đo HTTP/journey/browser cũ bên dưới vẫn giữ đúng thời điểm và phạm vi;
không phải mọi bài integration vừa được chạy lại. CSV reviewer vẫn0 kết luận
thật; manual tiếp tục được hoãn theo yêu cầu người dùng.

- Migration0014/0015 trên DB B qua guard: thêm request/documents/audit, khóa
  snapshot/history và siết NULL constraints. Đối chiếu dữ liệu cũ khi áp0014:
  25 users,14 wallet links,10 role rows,9 organizations/memberships,6 verification
  records giữ nguyên count/hash (kể cả password hashes). Report riêng tư:
  `.local/workflow-b/organization-migration-report.json`.
- HTTP Nest + PostgreSQL + MinIO thực: `node backend/scripts/workflow-b/organization-onboarding-smoke.cjs`.
  Lượt mở rộng74 HTTP checks/9 nhóm hành vi; các hành động đồng thời dùng
  kết nối/transaction thực. RESOLVER chỉ đọc/tải file của hồ sơ APPROVED;
  thu hồi role chặn ngay lịch sử/hồ sơ/file. File thuộc tổ chức khác và file
  bị sửa cùng độ dài đều bị chặn; object synthetic được phục hồi sau phép thử.
  Report `.local/workflow-b/organization-onboarding-report.json` giữ phạm vi và
  giới hạn. Chỉ thêm fixture có nhãn SYNTHETIC; không gửi giao dịch lên chain B.
- Browser Edge tự động, API B thật và hai account synthetic: lưu nháp/reload,
  upload, submit/khóa, ADMIN tải file/yêu cầu bổ sung, OWNER gửi lại, ADMIN duyệt,
  reload cả hai vai trò; giả lập mất phản hồi sau commit rồi reconcile, hủy gia
  hạn và giữ bản xác minh trước. Ảnh/script ở `.local/workflow-b/onboarding-ui/`.
  Phát hiện và sửa duplicate React key trên trang profile; lượt sau không còn lỗi đó.
- G1/G2 qua quy trình request mới: `node backend/scripts/workflow-b/journey-smoke.cjs`
  PASS,38 receipts/14 assertions,2 outcomes. Fork riêng được dừng, transaction DB
  rollback và chỉ dọn object do test tạo; source chain/count giữ nguyên.
- Backend166 tests PASS ở lượt triển khai. Frontend hiện có14 component/helper
  tests onboarding, full suite150 tests PASS; lint và B frontend build PASS.
  Resolver mở hồ sơ gốc từ lịch sử, đối chiếu record/request/snapshot; lỗi tải,
  đổi account hoặc mất role không hiển thị lại nội dung private từ cache.
  Backend build đã PASS trước đó; lượt mở rộng chỉ sửa frontend/test/docs,
  không đổi contract. B preflight vẫn PASS; cảnh báo bundle-size còn như trước.
- Bộ browser F4–F6 đã thay mock màn ADMIN cũ bằng queue/request mới và chạy lại
  trên Edge:32 checks PASS. Phát hiện query hồ sơ dùng cache30 giây, sửa để mỗi
  lần mở phải gọi API kiểm quyền và ẩn dữ liệu cũ trong lúc chờ. Đã kiểm deferred
  response,403/503/retry, hash sai, tải đúng642 bytes, form ADMIN/read-only resolver,
  evidence/refund gates và mobile. Báo cáo `.local/workflow-b/ui-review-browser-report.json`;
  ảnh `ui-approved-dossier.png`, `ui-verification.png`, `ui-review.png`, `ui-refund.png`.
  Đây là UI thật với API được intercept, không thay74 checks API thật ở trên
  hoặc nghiệm thu Brave/MetaMask. CSV reviewer kiểm lại:60 dòng,0 outcome.
- Xuất lại browser fixture từ DB/API B hiện tại rồi chạy cả hai bộ: organizer14
  checks và staff/resolver/public/refund32 checks PASS. Wizard G1/G2, integer
  amounts, frozen plan, evidence revision conflict và mobile vẫn đúng. Báo cáo
  organizer: `.local/workflow-b/ui-owner-browser-report.json`. Đã đóng các phiên
  Edge test riêng; B preflight sau test PASS, không reset hoặc đổi giờ chain.

| Case | Kiểm thử tự động đã ghi nhận | Nghiệm thu con người |
|---|---|---|
| O01 | Draft riêng tư; lưu thiếu thông tin được, gửi bị chặn; DB CHECK + immutable triggers | TODO |
| O02 | Hai request HTTP create/submit đồng thời trả một hồ sơ/snapshot, một queue item; stale write409 | TODO double click/hai tab Brave |
| O03 | Yêu cầu bổ sung → request mới; snapshot/review note cũ giữ nguyên; browser đã đi qua | TODO |
| O04 | Hai ADMIN và cancel/approve: một winner; injected failure rollback record/request/audit | TODO |
| O05 | REJECT có lý do; gia hạn bị từ chối không thu hồi record trước | TODO |
| O06 | Draft/pending không lộ cho RESOLVER; APPROVED đọc/tải được; anonymous/stranger/self-review/role vừa thu hồi bị chặn; UI cache bị ẩn | TODO |
| O07 | Sai MIME/hash/file tổ chức khác/storage thiếu bị chặn; private/no-store; PATCH/upload lúc UNDER_REVIEW bị409; ADMIN không sửa hộ | TODO |
| O08 | Sửa field cần reverify; expiry/SUSPENDED riêng; giả lập RPC lỗi không ghi đè status | TODO |
| O09 | Gia hạn/bổ sung không đổi field giữ verification trước; cancel browser không thu hồi | TODO |
| O10 | Migration giữ count/hash dữ liệu cũ; direct VERIFIED thiếu request bị409; REVOKED legacy còn dùng; legacy report UI còn đọc; A không đổi | TODO nghiệm thu tương thích |
| O11 | Browser OWNER/ADMIN/reload và mất phản hồi sau submit đã kiểm tự động | TODO Brave/người dùng |
| O12 | G1/G2 HTTP/fork bắt đầu từ verification được tạo qua request | TODO ký ví thực tế |

Các hồ sơ, kết luận và tài liệu ở trên đều giả lập, không phải quyết định của
reviewer độc lập hoặc bằng chứng hồ sơ tổ chức ngoài đời hợp lệ.

## 1. Môi trường và kết quả hiện có

| Thuộc tính | Bằng chứng lượt này |
|---|---|
| Checkout | `C:\Users\dell\Desktop\FundTogether`, baseline HEAD `b1881bd2cb3d6a4413605b06741624e86e2323da` |
| Ngày / múi giờ báo cáo | 2026-10-09 / Asia/Saigon |
| Runtime | Node v24.21.0, Windows PowerShell |
| B environment | Anvil31338/RPC9547 riêng; contract `0xe7f1725e7734ce288f8367e1bb143e90bb3f0512`, deploymentId `0x220685ba7ff8de837d8cb4c3d23ccced14af96fbfebdada83d2f06677608af24`; DB B5434 và MinIO9100/9101 có fixture synthetic; FE B mode5174 build/fixture browser đã kiểm |
| Policy | APPROVED_FOR_LOCAL_PILOT B-D01–B-D10; dataset DRAFT lịch sử giữ nguyên bytes/hash |
| Dữ liệu | 2 plan/checklist, 12 package synthetic original/public, 8 accounting trace; SHA-256 exact bytes |
| Kiểm tra công cụ | `node --test backend/scripts/workflow-b/fixtures.test.cjs`: 14 PASS, 0 FAIL; đã thấy test RED trước implementation |
| Backend regression | `npm.cmd test -- --runInBand` trong `backend/`:26 suites/152 tests PASS,0 FAIL; build PASS. OpenAPI34 paths; HTTP50 assertions PASS gồm schema, cookie/context/state/indexer, private ACL, fresh reviewAccess và verification history |
| Frontend | 113 tests PASS; default A và B build PASS; lint PASS. Edge mocked-API14+18 checks PASS G1/G2, owner/reviewer/ADMIN gates, revision recovery, refund/late supplement và mobile. Live read-only Edge tải campaign1/public files từ API B, không React error/overflow; receipt/deployment RPC helper PASS. Chưa ký extension |
| Contract B | Final C6 regression A+B:280 PASS,0 FAIL/skip,24 suites; hai invariant256 runs/128000 calls. Gas test bổ sung PASS riêng:claim2/64 donors117186/117198 |
| Build/artifact/deployment B | `forge build --sizes` PASS, runtime16910 bytes; artifact/identity tests4 PASS; deployment block2/reuse verified. B migration14 applied; synthetic review/evidence journey reached CHALLENGE_WINDOW |
| B storage/review | Real SIWE/DB/MinIO/chain smoke PASS: role/wallet/OWNER/revocation/expiry, revision/freeze races, MIME/hash tamper, original/public ACL, outage/policy rejection; report `.local/workflow-b/review-evidence-report.json` |
| B indexer | Disposable loopback fork9548 + DB outer rollback PASS: duplicate/restart/crash/end-hash rollback, reorg/orphan replay, empty-block refresh and changed deploymentId runtime rejection. Source B preserved; report `.local/workflow-b/indexer-report.json` |
| G1/G2 HTTP journey | Real Nest HTTP/SIWE/DB/MinIO/contract/indexer trên fork9548: G1 COMPLETED, G2 ba đợt COMPLETED với NEEDS_INFORMATION→version2.38 receipts đối chiếu calldata/actor/event/checkpoint/balance; finalize không payout lần hai. `.local/workflow-b/journey-report.json` |
| Failure HTTP journey |171 successful receipts/30 assertions PASS,11 snapshots: CONTINUE/RESUBMIT/STOP, phản hồi một lần, supplement timeout, thiếu funding; G2 base1100 và return50+110; G1 base0 và return muộn; return trước snapshot; tiny-unit claim cả hai thứ tự. Một receipt revert có chủ ý do token transfer lỗi giữ nguyên quyền, retry thành công. `.local/workflow-b/failure-journey-report.json` |
| Waiting HTTP journey |94 receipts/20 assertions PASS,7 outcomes: first-review/claim/evidence/reviewer/case timeout; case mine trước challengeEnd; INCONCLUSIVE lần3 dừng, không freeze lần4; MET còn dư50 phải thực return trước COMPLETED. `.local/workflow-b/waiting-journey-report.json` |
| Recovery |7 checks PASS: cold restore snapshot Anvil, pg_dump/pg_restore vào DB mới,20 objects restore vào bucket riêng, missing-object recovery, fresh anvil_reset cùng31338 bị từ chối, checkpoint giữ nguyên, restart/RPC lag/recover. `.local/workflow-b/recovery-report.json`; source B giữ nguyên |
| Chuẩn bị manual/reviewer | Startup/preflight PASS, seed5 accounts/G1/G2 drafts chạy lại không tạo trùng. Corpus v3:12 mã trung tính,142 PDF/150 pages +24 PNG; hash/text/bounds toàn bộ PASS,17 trang mẫu render và ảnh minh họa đã kiểm. CSV chưa có quyết định; nhãn tác giả chưa độc lập |
| MetaMask / reviewer experiment | IN_PROGRESS một phần liên kết ví; G1/G2 qua extension và quyết định reviewer vẫn TODO; không tự ký extension hoặc dùng số học thay nghiệm thu người dùng |
| So sánh A/B có kiểm soát |6 paths/138 receipts PASS trên contract/token mới trong fork; A source khớp baseline, artifact source hashes đối chiếu compiler metadata. Gas/tx, vốn ứng và escrow ghi trong `.local/workflow-b/comparison-report.json`; xem giả định bên dưới |

Suite bao gồm boundary B đã triển khai; smoke trên kiểm trực tiếp DB/storage/RPC.
Các lát này chưa thay cho hành trình ký ví trong FE hoặc toàn bộ T01–T18. HTTP
journey dùng probe định dạng; corpus reviewer v3 có tài liệu đọc được nhưng vẫn
là dữ liệu giả, hình minh họa và nhãn tác giả. Chưa có quan sát reviewer độc lập.

## 2. T01–T18: trạng thái hệ thống B

Tách kết quả tự động và nghiệm thu người dùng. `PASS phần ghi nhận` chỉ bao phủ
đường chạy mô tả ở cột bằng chứng, không tự hoàn tất toàn bộ yêu cầu của T đó.

| ID | Kịch bản | Nghiệm thu B | Bằng chứng hiện có / phần còn thiếu |
|---|---|---|---|
| T01 | G1 thành công | Auto PASS phần ghi nhận; manual TODO | HTTP→chain→indexer COMPLETED, A2200/E0; receipt/token check. Chưa thao tác extension |
| T02 | G2 ba đợt | Auto PASS phần ghi nhận; manual TODO |3 advances1100, supplementv2 không cấp thêm, nghiệm thu cuối COMPLETED; chưa extension |
| T03 | Funding thiếu/quá hạn | Auto PASS phần ghi nhận; manual TODO | API từ chối trước timeout; tại fundingEnd chặn donate, timeout và hoàn1100 thực góp. Contract kiểm các biên khác |
| T04 | Claim trước phép/sai ví/đợt/lặp | Auto PASS phần ghi nhận; manual TODO | Unit/HTTP gates, fixed recipient/amount, repeat blocked; FE helper/browser. Chưa ví người dùng |
| T05 | Thiếu hồ sơ/số lượng/sai signer | TODO human | Corpus12 tình huống; criterion gate tự động. Cần quyết định thật của reviewer |
| T06 | Version/ảnh dùng lại | Auto partial; human TODO | Binding/version/parent/schema/hash có tests và HTTPv2; PNG reuse giữ bytes; chưa review provenance thật |
| T07 | Reviewer xác nhận sai | TODO human | Mã trung tính/đáp án tách riêng, CSV trống; chưa có số mẫu thực nghiệm/nhãn độc lập/tỷ lệ false accept |
| T08 | Donor phản đối sát hạn/case | Auto PASS phần ghi nhận; manual TODO | CONTINUE/RESUBMIT/STOP, contributor/material/one-response/responseEnd; case mine trước challengeEnd rồi timeout khi resolver vắng. Chưa kiểm tương tác người dùng/MEV thực |
| T09 | Không làm/không nộp | Auto PASS phần ghi nhận; manual TODO | HTTP từ chối timeout sớm, tại submissionEnd STOP/P00 sau advance; không tự thu hồi tiền ra khỏi escrow |
| T10 | Resolver vắng/bổ sung quá giới hạn | Auto PASS phần ghi nhận; manual TODO | First-review/claim/evidence-review/case timeout có receipt; INCONCLUSIVE3 lần dẫn STOP, lần4 bị chặn; contract hard-stop PASS |
| T11 | G2 STOP sau đợt2 | Auto PASS phần ghi nhận; manual TODO | P01100/A2200; donor550 mỗi ví; actual return50+110 và claim supplement đến ví đã claim base |
| T12 | G1 STOP sau cấp toàn bộ | Auto PASS phần ghi nhận; manual TODO | P00, zero-base consume một lần, late return50→25 mỗi donor; FE không hứa2200 |
| T13 | Return trước/sau snapshot | Auto PASS phần ghi nhận; manual TODO | Return50 trước snapshot vào base, sau snapshot vào supplement; P0 không thay, late110 chia55 mỗi ví |
| T14 | Refund nhiều donor/base unit nhỏ | Auto PASS phần ghi nhận; manual TODO | HTTP góp3/4, pool5→base2/2; supplement2→0/1; cả hai thứ tự giữ2 đơn vị rounding, không trả người cuối. Contract fuzz/order/gas/near-uint256 và FE floor PASS |
| T15 | Token false/revert/callback | Auto PASS phần ghi nhận; manual TODO | Contract ERC20 rollback/reentrancy PASS; fork ép token balance0→receipt revert, quyền/counters giữ nguyên, khôi phục token rồi claim thành công một lần |
| T16 | Reload/đổi ví/popup/replaced tx | IN_PROGRESS human, partial | Automated helper/context/cache/receipt tests PASS; ảnh organizer liên kết ví và DB organizer/donorA xác nhận sau sửa seed. Timeout/reject/reload/switch/replaced tx và hành trình giao dịch vẫn cần kiểm thủ công |
| T17 | Replay/reorg/reset | Auto PASS phần ghi nhận; manual TODO | Real fork duplicate/reorg/crash/orphan; cold restore và actual reset trống cùng31338 bị từ chối; checkpoint/restart PASS |
| T18 | Storage/RPC/indexer gián đoạn | Auto PASS phần ghi nhận; manual TODO | MIME/hash/private ACL/policy outage, missing-file restore và RPC/indexer lag/recover; mocked UI lỗi storage. Full manual outage UX còn thiếu |

Mỗi report ghi deployment/time/mode và giới hạn. Receipt của fork đã kiểm khi
node còn sống; không đưa hash đó tra trên chain B gốc để gọi là persistent demo.
T07/T16 không được suy từ automated PASS; source synthetic không là khảo sát.

## 3. Cách tái lập phần đã kiểm

Tại repository root:

```powershell
node --test backend/scripts/workflow-b/fixtures.test.cjs
node backend/scripts/workflow-b/fixtures.cjs
```

Tại `backend/`:

```powershell
npm.cmd test -- --runInBand
```

Generator không cần credentials/.env; paths/hash/output không phụ thuộc giờ
máy. [Catalog](./examples/fixtures/workflow-b/catalog.json) là điểm vào bytes;
[trace](./examples/fixtures/workflow-b/accounting-traces.json) ghi input/action/C/A/R/F/E.
Hai lượt generate trong thư mục temp riêng được tests đối chiếu byte-identical.
Nếu sửa source tạo fixture khác, giữ frozen package cũ và dùng folder mới;
không dùng generator để sửa bytes của package đã submit chain.

## 4. Phép đo và dữ liệu chưa được thu thập

Reviewer: số mẫu, nguồn rubric/nhãn độc lập, MET/NEEDS_INFORMATION/NOT_MET/
INCONCLUSIVE, false accept/reject và thời gian người thao tác còn thiếu. Corpus
v3 dùng neutral IDs và hash mới; bảng đáp án ngoài reviewer folder.142 PDF không
là142 quan sát;12 tình huống vẫn có0 quyết định của người. Không lấy outcome chain
làm nhãn tham chiếu hoặc tự điền CSV.

Integration: token balances/counters base unit, receipt/block/hash/log, identity,
API checkpoint và projection sau replay. Timing chia wallet/người, mining,
confirmation, indexer; gas đo từ receipt. Baseline A có bond và release sau
nghiệm thu, B no-bond/advance chỉ nếu được duyệt; dùng giả định chung khi so sánh.

Receipt smoke đã lưu gasUsed/block/hash/mining/indexer timing; `acceptance-report.cjs`
tổng hợp11 reports vào ignored `acceptance-summary.json`, gồm onboarding HTTP
và hai bộ browser regression. Mỗi report phải khớp deploymentId; giữ hash,
ngày chạy và phạm vi (API giả lập/HTTP thật/fork) để không trộn bằng chứng.
T01/T02 trỏ tới `journey-report.json` mới qua request-bound verification; source
report thiếu/FAIL không được thay bằng PASS cũ. Có5 test kiểm báo cáo rỗng,
PASS/FAIL mâu thuẫn, sai identity và ranh giới nghiệm thu con người.
`reviewer-results.py`
đọc CSV người dùng cung cấp, không điền quyết định;3 parser tests PASS. Hiện có0
quan sát hoàn chỉnh, tỷ lệ để null. Chỉ so nhãn tác giả MET/NOT_MET; thiếu thông
tin, INCONCLUSIVE và MET_CONDITIONAL_RETURN không được coi là nhãn nhị phân.

### So sánh contract A/B trên giả định chung

`comparison-smoke.cjs` triển khai token/contract mới trên fork9548. Hai donor
góp bằng nhau, token6 decimals, G1 một đợt2200 hoặc G2 ba đợt1100. Từng hoạt
động chi đủ budget trước review bằng token transfer mô phỏng tới vendor; không
có tín dụng nhà cung cấp, vay vốn, fiat hoặc chi phí vận hành. A khóa bond bằng
budget lớn nhất và tái sử dụng tiền được hoàn; B không cần token organizer ban
đầu. Đây là đo cơ chế với giả định được kiểm soát, không là khảo sát nhu cầu vốn.

| Đường chạy | Giao dịch protocol | Gas từ receipts | Vốn organizer ban đầu, token | Tiền donor đã ra trước nghiệm thu một đợt | Quỹ refund cuối, token |
|---|---:|---:|---:|---:|---:|
| G1 A hoàn tất |13|1.371.395|4.400 = bond2200 + chi2200|0|0|
| G1 B hoàn tất |12|1.461.475|0|2.200|0|
| G2 A hoàn tất |21|2.513.333|2.200 = bond1100 + chi1100|0|0|
| G2 B hoàn tất |20|2.953.337|0|1.100|0|
| G2 A đợt2 không có hồ sơ |17|1.955.200|2.200|0|2.200|
| G2 B đợt2 không có hồ sơ |16|2.089.246|0|1.100|1.100|

Gas gồm approval, các call protocol, claim bond/refund khi có; loại deployment,
mint và vendor transfer mô phỏng.138 receipts gồm cả các bước loại khỏi phép
so gas. Compiler0.8.24/optimizer200 giống nhau; source hashes đối chiếu artifact,
dependency CRLF chuẩn hóa về LF của build WSL. Source A không đổi so baseline.
Các policy và số bước review khác nhau; gas local không là chi phí mạng thực.
Con số trước nghiệm thu chỉ là một đợt đang mở, không chặn tổn thất cộng dồn
nếu nhiều kết luận sai liên tiếp. Chưa có A/B qua browser, thời gian người dùng,
dữ liệu thực địa hoặc tỷ lệ reviewer độc lập. Không kết luận B tối ưu từ bảng này.

Lượt waiting đầu có submitEvidence revert dùng hết168824 gas trong khi eth_call
cùng block thành công. Sender unlocked của harness hiện estimate +20% và lưu
estimatedGas/gasLimit; lượt chạy lại94 receipts PASS. Đây là điều chỉnh công cụ
Anvil, không phải kết quả kiểm gas hoặc popup của MetaMask.

## 5. Điều kiện tiếp tục

1. DONE: người dùng đã duyệt B-D01–B-D10 trong spec và financial rules ngày2026-10-09.
2. DONE: kế hoạch code C1–C6/BE/FE/integration đã được duyệt bằng “tôi duyệt mà”; không còn chờ điểm duyệt này.
3. Triển khai/test trên chain/DB/storage riêng, G1 trước G2/failure; giữ baseline A.
4. Chuẩn bị rồi nghiệm thu MetaMask/người dùng; cập nhật từng T với bằng chứng.

GOAL vẫn chưa hoàn thành. [Runbook](./workflow-b-local-runbook.md) hướng dẫn chạy,
tài khoản/ví, G1/G2, recovery và reviewer. Các kiểm tra còn thiếu, manual acceptance
và nghiên cứu reviewer phải tiếp tục, không bỏ qua để đánh dấu DONE.
