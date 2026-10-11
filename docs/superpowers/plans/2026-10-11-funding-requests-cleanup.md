# Kế hoạch chuyển sang yêu cầu cấp vốn và loại bỏ milestone cố định

> Khi thực hiện: dùng skill superpowers:executing-plans, làm trực tiếp trên nhánh hiện tại; không tạo nhánh hoặc giao sub-agent.

**Ngày:** 2026-10-11. **Trạng thái:** kế hoạch chuyển đổi; chưa thực hiện xóa code/dữ liệu.

**Mục tiêu:** thay mô hình lập sẵn các đợt bằng yêu cầu cấp vốn có căn cứ, xét duyệt trước cấp và đối chiếu sử dụng tiền sau cấp.

**Kiến trúc:** tái sử dụng tài khoản, ví, tổ chức, storage và nền tảng indexer. Thay phần cam kết ngân sách đợt cố định bằng hồ sơ yêu cầu cấp vốn. Tách dữ liệu/nghĩa vụ deployment cũ khỏi deployment mới; sản phẩm đích có một luồng chính mới, không duy trì hai wizard tạo campaign song song lâu dài.

**Stack:** React/TypeScript, NestJS, PostgreSQL/Drizzle, object storage, Solidity/Foundry, Viem.

**Căn cứ:** quyết định người dùng chuyển hẳn mô hình trong chat ngày 2026-10-11; `docs/research-direction.md`. Spec tiền mới chưa được duyệt. `docs/workflow-b-spec.md` và `docs/workflow-b-financial-rules.md` là baseline đối chiếu, không tự áp nguyên mọi quy tắc sang mô hình mới.

## 1. Mốc phục hồi và ranh giới

- Checkpoint `28b245c` trên `main`: toàn bộ thay đổi hiện có trước chuyển đổi, gồm onboarding, ví, UI và tài liệu.
- Fresh tests tại checkpoint: frontend157/157, backend166/166. Contract không thay đổi trong commit này; không chạy lại Foundry ở lượt checkpoint. Nghiệm thu con người vẫn chưa đạt.
- Không reset chain, xóa tài khoản/ví, dữ liệu tổ chức, hồ sơ, storage hoặc migration đã áp dụng.
- Không tự chuyển tiền, deploy, đổi địa chỉ contract đang chạy hoặc biến campaign B cũ thành campaign mới.
- Không coi đổi tên `stage` thành `request` là hoàn tất nghiệp vụ mới.
- Bỏ milestone cố định không bỏ kiểm tra kết quả sử dụng tiền, xử lý phản đối, quá hạn, tiền dư và hoàn tiền.
- Các mốc code phía dưới là điều kiện thực hiện sau khi chốt spec; yêu cầu hiện tại chỉ là checkpoint và lập kế hoạch dọn bỏ.

## 2. Giữ, sửa, loại bỏ

| Nhóm/file thực tế | Xử lý | Điều kiện và lý do |
|---|---|---|
| `backend/src/modules/auth/`, `frontend/src/features/auth/`, `frontend/src/lib/web3/wallet-*` | Giữ | Login, SIWE, liên kết ví và giao dịch không phụ thuộc ngân sách đợt cố định |
| `backend/src/modules/organizations/`, `frontend/src/features/organizations/` | Giữ, sửa phần nối campaign | Membership/OWNER, xác thực tổ chức và request history vẫn cần |
| `backend/src/advance/organization-request*`, `organization-verification*`; `frontend/src/features/review/AdvanceOrganizationVerification.tsx`, `ApprovedOrganizationRequest.tsx` | Tách ra phần tổ chức dùng chung trước khi dọn advance | Không xóa onboarding chỉ vì file nằm trong module B |
| `backend/src/database/schema/advance.schema.ts` | Tách trách nhiệm, không xóa cả file/bảng | Có cả `organizationVerificationRecords` được dùng lại, cùng bảng/projection B cần giữ lịch sử |
| `contracts/src/FundTogetherAdvance.sol`, `contracts/src/advance/AdvanceTypes.sol` | Thay cơ chế campaign mới bằng contract yêu cầu cấp vốn | Budgets/criteria cố định, currentStage, next-stage eligibility không phù hợp. Giữ bản B ở checkpoint và artifact phục vụ deployment cũ |
| `frontend/src/features/campaigns/advance/AdvanceCampaignWizard.tsx`, `advance-plan.ts` | Thay wizard | Bỏ chọn G1/G2 như khuôn bắt buộc, danh sách đợt/budget chốt sẵn; giữ mục đích, đối tượng, căn cứ và ngân sách campaign theo spec mới |
| `AdvanceOrganizerActions.tsx`, `AdvanceEvidence.tsx`, `AdvanceCaseActions.tsx` | Viết lại các thao tác gắn request | Thay nhận vốn theo stage, evidenceRef theo stage bằng request ID; giữ phân biệt nháp/upload/ký/indexed |
| `backend/src/advance/advance-campaign*`, `advance-plan.ts`, `advance-action-policy.ts`, `advance-workflow*`, `advance-review*`, `advance-evidence*` | Thay domain/API từng phần | Không giữ gate cũ ngầm bên dưới UI mới; tái sử dụng validation/ACL/file primitives đã phù hợp |
| `backend/src/advance/advance-blockchain*`, `advance-indexer*`, `advance.types.ts` | Thêm adapter/event mới rồi rút B khỏi luồng tạo mới | Request identity, replay và checkpoint phải gắn đúng deployment; dữ liệu B không đọc bằng ABI mới |
| `frontend/src/features/review/AdvanceReview.tsx`, `InternalArea.tsx` | Thay hàng chờ và route nghiệp vụ | Hàng chờ yêu cầu cấp vốn, báo cáo sử dụng, phản đối; ADMIN tổ chức vẫn độc lập RESOLVER |
| `frontend/src/features/explore/AdvanceCampaignDetail.tsx`, `public-campaign-view.ts`, `PublicArea.tsx` | Sửa nội dung/trạng thái, giữ thành phần trình bày dùng chung | Bỏ số đợt, tiến độ milestone và lời hứa cấp kế tiếp; hiển thị các yêu cầu và dòng tiền thực |
| `frontend/src/lib/web3/advance-action.ts`, `deployment-context.ts`, API generated và `backend/src/advance/generated/openapi.json` | Thay boundary; sinh lại từ nguồn | Không sửa tay ABI/client generated; không dùng build mode cũ để đoán contract mới |
| `contracts/src/FundTogether.sol`, `FundTogetherMvp.sol`, `FundTogetherConfigured.sol`, `contracts/src/modules/`; FE/BE milestone baseline A | Ứng viên bỏ khỏi sản phẩm đang chạy sau kiểm tra tham chiếu | Không xóa ngay: còn test, deploy/import hoặc chức năng dùng chung; baseline nghiên cứu có thể tái lập từ checkpoint |
| `backend/drizzle/` và schema/lịch sử B | Giữ migration đã áp dụng; migration mới theo hướng bổ sung | Không DROP dữ liệu cũ để làm schema đẹp; chỉ xét dọn vật lý khi có kiểm kê, sao lưu và quyết định riêng |
| `contracts/test/unit/Advance/`, tests milestone A, scripts G1/G2 | Chuyển các bất biến cần giữ sang test mới trước khi loại test cũ khỏi suite chính | Không giảm test chỉ để báo PASS; G1/G2 vẫn là tình huống nghiệp vụ có thể tái sử dụng |
| `backend/scripts/workflow-b/`, `frontend/scripts/advance-*.mjs` | Thay setup/journey cho model mới; giữ recovery cần thiết cho B | Không chạy seed/reset/deploy cũ vào môi trường mới |
| `docs/workflow-b-*`, tài liệu A/v0.2 | Giữ lịch sử, gắn nhãn baseline; bỏ khỏi hướng dẫn hiện hành khi cutover | Không ghi đè báo cáo cũ thành bằng chứng hệ thống mới |
| `.local/`, ví, chain snapshot, private files | Giữ ngoài Git, không xóa | Đây không phải mã thừa |

## 3. Những quyết định tiền phải chốt trước task contract

**Cập nhật cùng ngày:** người dùng đã chọn sáu phương án đề xuất; xem
[kế hoạch nghiệp vụ mới](../../funding-request-plan.md). Bảng dưới giữ các điểm
cần cụ thể hóa thành spec, không dùng nó để hỏi lại sáu lựa chọn đã được chọn.

Không mở thêm hỏi đáp ở lượt lập kế hoạch này. Các điểm sau gom vào một đặc tả để review trước khi code phụ thuộc chúng:

| Quyết định | Phương án tối giản đề xuất — chưa được coi là đã duyệt |
|---|---|
| Điều kiện bắt đầu cấp | Chốt rõ đủ mục tiêu mới cấp hay cho cấp từ số đã huy động; không tự suy từ B |
| Số yêu cầu cùng lúc | Một khoản đã cấp nhưng chưa đối chiếu; cần chốt cả số yêu cầu nháp/đang xét/đã duyệt |
| Thẩm quyền và người nhận | Resolver duyệt; tổ chức nhận vào ví cố định. Chưa mở thanh toán trực tiếp nhiều supplier |
| Giữ chỗ khi duyệt | Nếu duyệt tạo quyền claim, phải có reserve và thời hạn; hủy/quá hạn giải phóng reserve, claim không dùng phần dành cho refund |
| Cam kết với donor | Khung mục đích/đối tượng/ngân sách được duyệt; yêu cầu không được tùy ý chuyển mục đích hoặc vượt quỹ có thể cấp |
| Sau chi | Hồ sơ đối chiếu, tiền dư thực trả, kết luận đạt/thiếu/không đạt; điều kiện được gửi/nhận khoản tiếp |
| Hạn và phản đối | Khi bắt đầu tính hạn, cửa sổ phản đối trước/sau cấp, ai xử lý và hậu quả timeout; không sao chép nguyên deadline stage |
| Kết thúc/refund | Điều kiện đóng campaign không còn danh sách stage cố định; xử lý request/reserve còn mở, base và return muộn |

Đặc tả phải trả lời: tiền thuộc ai, ai được chuyển, chuyển ở trạng thái nào, lỗi có rollback không, quyền có hết hạn/kẹt không, có thể thực hiện hai lần không. Báo giá chứng minh nhu cầu trước cấp; chứng từ/kết quả sau cấp là bước khác.

## 4. Thứ tự thực hiện và điều kiện được xóa

### D0 — Đặc tả và bản đồ phụ thuộc

- [x] Lưu checkpoint hiện tại trên `main`, không push, không tạo nhánh.
- [x] Kiểm kê nhóm giữ/sửa/bỏ trong kế hoạch này.
- [ ] Viết `docs/funding-request-spec.md`, `docs/funding-request-financial-rules.md`, state machine và trace thành công/thất bại. Đây là đầu vào bắt buộc của các task sau, chưa giả định interface đã chốt.
- [ ] Đối chiếu import/route/script/schema của từng file dự định xóa; lập danh sách cụ thể, không xóa theo từ khóa `milestone` hàng loạt.
- [ ] Chốt các quyết định mục 3; cập nhật tên đề tài/mục tiêu nghiên cứu nếu cần, không tự đổi tên đề tài đã đăng ký.

**Đạt:** một quy trình nhất quán từ donor góp → đề nghị → duyệt → cấp → đối chiếu → return/refund; không còn quyết định tiền bị suy đoán trong task code.

### D1 — Tách phần dùng chung khỏi module B

- [ ] Di chuyển organization-request/verification cùng provider/export/schema cần thiết sang module tổ chức; cập nhật module wiring và import.
- [ ] Giữ API và dữ liệu onboarding tương thích trong bước này, tránh rename hàng loạt cùng lúc.
- [ ] Kiểm login, ví, OWNER gửi/bổ sung, ADMIN xét, RESOLVER đọc đúng hồ sơ; cross-account access bị chặn.

**Đạt:** onboarding hoạt động không phụ thuộc dịch vụ giải ngân theo stage. Chỉ xóa file cũ sau khi không còn import đến chúng.

### D2 — Contract và accounting theo yêu cầu

- [ ] Từ spec đã duyệt, tạo contract/types mới trong `contracts/src/` và fixtures/tests tương ứng; không sửa nghĩa vụ deployment B hiện hữu.
- [ ] Viết test trước cho approve/claim một lần, sai actor, sai request/deployment, số vượt available/reserve, expiry/cancel và transfer failure.
- [ ] Kiểm bảo toàn tiền cùng nghĩa vụ từng request/donor, không chỉ tổng tiền; reserve không được trùng khoản refund. Fuzz chuỗi approve → cancel/claim → return → STOP → refund → late return.
- [ ] Xuất ABI/events/policy từ contract nguồn; mô tả chính xác interface mới trong code plan sau khi spec chốt.

**Đạt:** tests contract PASS, quyền/counters rollback khi chuyển token lỗi, không cấp trùng hoặc khóa return/refund. Chưa xóa contract/artifact B còn phục vụ runtime cũ.

### D3 — Backend, schema, storage và indexer

- [ ] Migration bổ sung request/review/report và projection mới; bảo toàn users, organizations, wallet links, audit và dữ liệu B.
- [ ] Xây API từ spec, sinh OpenAPI/client; giới hạn sửa hồ sơ sau gửi/duyệt, lưu căn cứ quyết định.
- [ ] Gắn chứng từ trước cấp và sau chi với đúng request; kiểm ACL original/public, immutable snapshot và upload failure.
- [ ] Kiểm event → indexer → DB theo deployment/request, duplicate/replay/reorg; HTTP success không giả thành cấp tiền thành công.

**Đạt:** kiểm thử API/DB/file/indexer đạt với dữ liệu mới và dữ liệu tổ chức cũ. Mới bỏ controller/service B khỏi ứng dụng chính sau khi luồng thay thế sẵn sàng.

### D4 — UI theo yêu cầu và chuyển luồng chính

- [ ] Thay wizard chia đợt bằng campaign + danh sách yêu cầu cấp vốn; form có công việc, số tiền, căn cứ, người nhận, hạn theo spec.
- [ ] Thay review và organizer actions; cập nhật donor view, dòng tiền, lý do chặn, pending/receipt/indexed và phục hồi reload.
- [ ] Chặn gửi thao tác cũ qua URL/deployment sai; link lịch sử không âm thầm trỏ sang request mới.
- [ ] Sau khi đường mới chạy xuyên tầng, bỏ G1/G2 picker cố định, next-stage buttons, milestone routes tạo/sửa mới và nhánh runtime A/B không còn dùng. Lưu cách truy cập/xử lý nghĩa vụ cũ riêng trước khi bỏ UI cũ.

**Đạt:** một trải nghiệm tạo campaign mới, không lẫn thuật ngữ/điều kiện milestone. Không đánh dấu bản mới đã nghiệm thu từ kết quả UI B cũ.

### D5 — Dọn mã chết, công cụ và tài liệu

- [ ] Tìm import/route/package scripts/ABI references còn lại; chỉ xóa file không còn người dùng hoặc đã có đường thay thế tương đương.
- [ ] Xóa dependency chỉ khi không còn import/runtime/codegen/test dùng; giữ Wagmi/Viem, storage, auth và các primitive còn cần.
- [ ] Chuyển hướng README/overview/runbook/manual guide sang luồng mới; đánh dấu tài liệu B là lịch sử, giữ commit tái lập.
- [ ] Lập danh sách file thực xóa và lý do trong progress; commit riêng cho từng nhóm thay thế để dễ phục hồi.

**Kiểm tra:** frontend `npm.cmd test`, `npm.cmd run lint`, build target mới; backend `npm.cmd test -- --runInBand`, `npm.cmd run build`; contracts `forge test`; integration local riêng và kiểm tra link tài liệu. Chỉ bỏ script B sau khi script thay thế đã chạy đạt.

## 5. Năm ca bắt buộc khi review chuyển đổi

1. Ví/account cũ đăng nhập và đọc tổ chức sau migration — D1/D3 phải giữ đúng chủ và quyền.
2. Hai request tranh cùng số dư hoặc claim đồng thời — D2/D3 không over-reserve/chi hai lần.
3. Quyết định/transaction cũ trả muộn sau đổi request hoặc deployment — D3/D4 không cập nhật nhầm hồ sơ.
4. STOP/timeout khi còn reserve và khoản đã cấp chưa đối chiếu — D2 giữ đường thu hồi reserve, return/refund đúng spec.
5. URL/file của hồ sơ B cũ — D3/D4 không lộ dữ liệu, không dịch sang trạng thái mới hoặc làm mất nghĩa vụ đã tồn tại.

## 6. Điều kiện kết thúc việc dọn bỏ

- Không còn hành vi yêu cầu chia ngân sách thành milestone cố định trong luồng tạo campaign mới.
- Mọi đường tài chính mới dùng request identity và policy đã duyệt; không dựa vào cờ UI.
- Shared organization/auth/storage giữ test; test kế toán/quyền được thay tương đương trước khi bỏ test stage.
- Dữ liệu và nghĩa vụ cũ vẫn có cách đọc/xử lý; không xóa snapshot, file riêng hoặc migration để đạt build xanh.
- Có checkpoint, diff danh sách xóa, kiểm chứng tự động mới và danh sách nghiệm thu con người còn thiếu.

Trong lượt lập kế hoạch này chưa xóa code, đổi database hoặc triển khai contract mới.
