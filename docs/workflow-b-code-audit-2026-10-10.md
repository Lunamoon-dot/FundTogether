# Rà soát kế hoạch code Workflow B — 2026-10-10

## Kết luận

Chưa hoàn tất toàn bộ kế hoạch. Checklist hiện có 21 task, 88 mục đã tick và
5 mục chưa tick (1 ở F2, 4 ở I3). Đây là số đánh dấu trong tài liệu, không phải
tỷ lệ chất lượng hay chứng nhận mọi hành vi đã đúng.

## Đối chiếu task

| Task | Phạm vi | Kết quả rà soát |
|---|---|---|
| C1 | Setup/funding | Có contract và Funding.t.sol; checklist đã tick |
| C2 | Eligibility/advance | Có Advance.t.sol và implementation; checklist đã tick |
| C3 | Evidence/finalize | Có Evidence.t.sol; checklist đã tick |
| C4 | Case/timeout | Có Case.t.sol, Timeout.t.sol, Boundary.t.sol; checklist đã tick |
| C5 | Return/refund | Có Refund.t.sol; checklist đã tick |
| C6 | Invariant/artifacts | Có invariant, adversarial tests và artifact/deploy scripts; có ledger trước đó, không chạy lại Foundry trong lượt audit |
| B1 | Context/bootstrap | Có advance module/blockchain service và tests |
| B2 | Draft/freeze/schema | Có campaign service/schema/migration và tests |
| B3 | Xác thực/review | Có ADMIN verification, immutable reports, conflict và resolver gates; không có organizer verification-request lifecycle |
| B4 | Evidence/storage | Có evidence service/controller và tests; báo cáo MinIO integration cũ tồn tại |
| B5 | Indexer/replay | Có indexer service/tests và báo cáo replay cũ |
| B6 | API/action preparation | Có workflow/public controllers, generated OpenAPI và tests |
| F1 | Context/wizard | Có wizard, context, plan tests |
| F2 | Transaction lifecycle | Có code/tests; mục manual popup/sign/replacement chưa tick |
| F3 | Evidence UI | Có AdvanceEvidence và tests |
| F4 | Staff/resolver UI | Có AdvanceOrganizationVerification và AdvanceReview; còn lỗi status tổ chức ở UI dùng chung |
| F5 | Donor/journey | Có public detail/journey và tests |
| F6 | Refund/late return | Có refund panel và tests |
| I1 | G1 integration | Báo cáo journey PASS tồn tại: 38 receipts, G1/G2; manualExtension=false |
| I2 | Failure/recovery | Báo cáo failure171 receipts, waiting94, recovery7 checks và comparison138 tồn tại; không chạy lại integration trong lượt audit |
| I3 | Manual/reviewer/final audit | 4 mục còn mở; liên kết ví thành công không thay G1/G2/STOP/refund hoặc nghiên cứu reviewer |

## Bằng chứng chạy lại trong lượt audit

- Frontend Desktop: npm.cmd test — 132/132 PASS.
- Backend Desktop: npm.cmd test -- --runInBand — 26 suites, 162/162 PASS.
- Kiểm tra source tại d6be, đối chiếu các implementation liên quan và báo cáo
  ignored tại Desktop/.local/workflow-b. Không reset chain, tạo giao dịch,
  thay role hoặc xác thực tổ chức trong lượt này.
- Kết quả contract/HTTP/storage/recovery trước đây chỉ là bằng chứng lịch sử;
  không gọi là vừa chạy lại hoặc nghiệm thu Brave.

## Khoảng trống và lỗi phát hiện

1. **Khoảng trống kế hoạch:** B3/F4 yêu cầu staff ADMIN ghi xác thực với căn cứ,
   nguồn và thời hạn. Chưa định nghĩa organizer nộp hồ sơ/yêu cầu, chờ duyệt,
   yêu cầu bổ sung và gửi lại. Backend queue hiện liệt kê mọi tổ chức.
   Đây là thiếu trong hành trình sản phẩm, không phải task request đã được
   thực hiện nhưng bị hỏng. Cần bổ sung task và tiêu chí nghiệm thu nếu hoàn
   thiện onboarding trước manual acceptance; không tự coi checklist cũ bao phủ.
2. **Lỗi UI xác nhận từ source:** OrganizationProfile.tsx:25 và
   OrganizationsPage.tsx:119 ghi cứng "Chưa xác minh", dù API trả
   verificationStatus. Có thể khiến organizer tưởng xác thực chưa lưu.
   Chưa sửa trong lượt yêu cầu audit này.
3. **Chưa nghiệm thu:** F2 manual và I3 còn mở. Chưa đủ bằng chứng tuyên bố
   mọi đường UI/extension hoặc mọi yêu cầu GOAL đều DONE.

## Đính chính hướng dẫn trước

Việc thiếu nút gửi yêu cầu không tự chặn kỹ thuật G1 theo pilot hiện tại:
ADMIN có thể ghi verification trực tiếp, resolver kiểm bản ghi còn hiệu lực
tại checkpoint trước approval/first eligibility. Tuy nhiên không tự xác thực
thay người dùng hoặc bỏ kiểm tra hồ sơ để vượt gate.

Khuyến nghị tạm hoãn test trước đó là lựa chọn hoàn thiện trải nghiệm sản phẩm,
không phải bằng chứng G1 chưa được implement. Không cần hoàn thành I3 rồi mới
test: chính các lần test manual và reviewer tạo bằng chứng để đóng I3.

## Thứ tự tiếp tục

- Sửa nhãn trạng thái tổ chức để phản ánh dữ liệu thực.
- Bổ sung rõ task onboarding request nếu triển khai hành trình organizer nộp
  hồ sơ trước ADMIN; không đánh dấu B3/F4 cũ là bao phủ phần này.
- Nghiệm thu F2 và I3 theo G1, G2, STOP/refund, wallet rejection/reload/switch.
- Ghi kết quả reviewer và audit T01–T18; chỉ đóng kế hoạch khi đủ bằng chứng.
