# FundTogether — thiết kế post-MVP và điều kiện mở rộng

> Ngày 2026-10-11 · DESIGN BACKLOG / NOT IMPLEMENTED.
> Ưu tiên hoàn thiện [MVP P1](./hed-mvp-design.md). Tài liệu này mô tả lựa chọn nghiên cứu sau MVP, không tạo yêu cầu code ngay hoặc dependency ẩn cho MVP.

## 1. Nguyên tắc và cổng vào

Chỉ mở rộng khi có nhu cầu đo được qua các tình huống mua/trao quà và giới hạn thực tế của MVP. Không thêm công nghệ để hoàn thiện danh sách tính năng.

Trước mở rộng cần: core ledger/refund và vendor wind-down có integration evidence; người dùng chạy wallet journey; reviewer/vendor thử case trái chiều; báo cáo những khoản bị khóa, yêu cầu bị từ chối hợp lệ và nhu cầu vốn của vendor. Mở rộng có spec/state/trace/invariants riêng, không đổi nghĩa vụ campaign đã nhận góp bằng policy mới.

Mỗi feature có feature-independent gate; không bắt làm hết backlog. Codebase vẫn một hệ thống, protocol/deployment identity phân biệt phiên bản và nghĩa vụ cũ.

## 2. Thứ tự ưu tiên

| Ưu tiên | Hạng mục | Khi nào đáng làm |
|---|---|---|
| PM1 | P2 tạm ứng organizer có kiểm soát | Có chi phí hợp lệ P1 không thanh toán được; không chỉ vì muốn bỏ review |
| PM2 | P3 hoàn ứng | Có nhu cầu ứng trước thật và xác minh được nguồn tiền/chi trùng |
| PM3 | Nhiều request và outcome groups | MVP gây chậm/deadlock nghiệp vụ có bằng chứng dù đã cho đơn phụ thuộc tuần tự |
| PM4 | Partial funding | Tổ chức cần hoạt động trước đủ goal, donor hiểu và đồng ý quyền pooled refund |
| PM5 | Nhiều lần giao/thanh toán | Vendor thực sự có hợp đồng chia delivery; một final không đáp ứng |
| PM6 | Chính sách rủi ro thích ứng | Có dataset để so fixed policy với tiers; không tự coi “uy tín” là lý do bỏ chuẩn |
| PM7 | Thay đổi kế hoạch và phục hồi quyền ký | Có case thật không xử lý được bằng cancel/recreate trước commitment |
| PM8 | Thanh toán fiat, oracle/attestation, arbitration | Có đối tác/dữ liệu/use case rõ và điều kiện tích hợp được thẩm định |

PM1–PM8 không phải chuỗi bắt buộc; chọn một hạng mục mỗi lần để xác định nguyên nhân của lợi ích/rủi ro.

## 3. PM1 — Controlled Organizer Advance

P2 chuyển tiền đến ví tổ chức cố định, phục vụ khoản chi vendor không thể nhận token, chi địa phương hoặc chi có tính chất phù hợp. Đây không phải cách giả gọi intermediary là vendor.

Trước cấp: lý do không dùng P1, chi phí độc lập, số tiền, bằng chứng dự toán, deadline, exposure limit riêng. Sau cấp: chứng từ actual spend, nguồn chi, unused actual return và outcome liên quan. Cọc vendor và advance organizer phải cùng được tính vào tổng financial exposure, không cho mỗi phương thức một cap riêng rồi cộng vượt campaign cap.

Một approval amount cố định, claim một lần, không arbitrary recipient, không tự chi để hoàn ứng lần nữa. Expense identity liên kết nguồn thanh toán P1/P2/P3; hash giống chỉ là tín hiệu, khác bytes không chứng minh khoản chi khác.

**Gate:** case chi hợp lệ P1 không đáp ứng, classifier payment mode minh bạch, mixed-mode stop/refund trace, không over-reserve hoặc xóa exposure bằng đổi mode. Không thêm bond mặc định.

## 4. PM2 — Reimbursement

P3 cần chứng minh organizer đã chi bằng nguồn ngoài escrow; khoản mua thuộc scope, chưa dùng P1/P2 hoặc nguồn tài trợ khác để nhận hoàn hai lần. Hóa đơn không tự chứng minh đã trả tiền.

Hồ sơ: payer, recipient, nguồn vốn, thời điểm actual payment, hàng/dịch vụ, chứng từ và quyền đề nghị hoàn. Khi approved vẫn reserve quỹ, payout đúng cap, không bảo đảm mọi chi tự phát đều sẽ được hoàn. UI cảnh báo chưa approval là organizer tự chịu rủi ro không được reimbursement.

Financial settlement có thể hoàn thành khi trả reimbursement nếu hồ sơ đủ; outcome chưa đạt vẫn là nghĩa vụ riêng. Không tính P3 như chi từ escrow đã hoàn thành outcome chỉ vì có hóa đơn.

**Gate:** trace cùng invoice qua ba phương thức, currency conversion nếu có phải là nghiên cứu riêng, vốn lưu động organizer và false rejection được đo.

## 5. PM3 — Parallel requests/activity groups

Thay slot1 bằng giới hạn số lượng hữu hạn cùng caps tài chính/outcome. Không bỏ reserve toàn nghĩa vụ khi cho song song. Các dependency phải có directed acyclic graph hoặc tập quan hệ đơn giản được chọn trước; không generic workflow engine nếu vài quan hệ mua/vận chuyển đủ dùng.

Nguồn exposure có khóa: request net cash → activity allocations tổng100% → outcome status. Chi phí dùng chung như một chuyến xe phục vụ hai nhóm phải có tỷ lệ phân bổ bất biến, không gán toàn bộ hai lần hoặc bỏ khỏi cả hai. Reserve và worst-case future exposure được kiểm ở approval, rechecked tại execution.

Stop/replay không loop toàn bộ requests/donors không giới hạn: bounded batching hoặc aggregate counters và settle từng request. Hoàn tiền chỉ allocation phần free, không phụ thuộc mọi vendor cùng kết thúc.

**Gate:** concurrent approvals, cancel/claim/return interleavings, split-to-evade caps, independent activity fail không xóa obligation nhóm khác, gas bounded theo giới hạn đã công bố.

## 6. PM4 — Partial funding và contribution cohorts

Đây là thay đổi quyền donor, không chỉ bỏ check goal. Hai lựa chọn cần so sánh:

| Mô hình | Ưu điểm | Giá phải trả |
|---|---|---|
| Quỹ chung, trọng số cuối kỳ | Đơn giản; request dùng custody hiện có | Donor vào muộn có thể cùng chịu mất tiền từ khoản cấp trước đó; phải công bố rõ |
| Theo cohort/thời điểm exposure | Tách trách nhiệm theo lúc góp | Accounting/recovery/refund phức tạp, không copy công thức B |

Chưa chọn cohort chỉ để tránh giải thích pooled risk. Trước mở chức năng phải chốt funding end, khi nào donation đóng, contribution snapshot, free cash reserve, thất bại mục tiêu nhưng đã chi, quyền supplement của từng cohort.

**Gate:** donor góp trước/sau payout/loss/recovery, STOP xen donation, một người nhiều lượt góp, rounding, oracle-free actual balance model. Không dùng `C` thay đổi để tính quyền đã snapshot.

## 7. PM5 — Nhiều delivery và final installments

Mỗi payment authorization có nonce và amount cố định. Theo dõi accepted cumulative value, gross paid, actual returns, invalidated/consumed authorizations, còn lại obligation. Không tái mở gross cap chỉ vì vendor return.

Finalization mỗi phần có evidence binding và challenge policy rõ; không rút ngắn window để giao nhiều phần. Một phần tranh chấp có khóa toàn đơn hay chỉ phần đó phải được chốt, không suy “đã giao70%” là có thể trả70% khi quality terms all-or-nothing.

**Gate:** partial accepted rồi bị đảo kết luận, return giữa authorize/execute, hai partial claims đồng thời, duplicate invoice và final closure residual.

## 8. PM6 — Risk-adaptive policy và nghiên cứu

B1 fixed policy của MVP là baseline. B2 thay deposit/review burden/caps dựa trên thông tin có nguồn: loại giao dịch, độ chắc của chứng từ, quan hệ liên quan, giá trị và lịch sử đã kiểm. Không giảm checklist chất lượng hàng hoặc outcome chỉ vì danh tiếng.

Policy version freeze trước góp; không reviewer tự chọn tier thấp bằng cờ client. Khi facts đổi làm tier tăng, chặn exposure mới và xét lại authorization chưa execute, không rewrite payout đã xảy ra.

Thử grid0/10/20/30% deposit, campaign caps và challenge delays; đo đồng thời valid request service rate, false approval/rejection, time-to-funds, unresolved/locked cash, loss, reviewer burden, organizer/vendor working capital và outcome completion. Báo median/p95, phân phối, số mẫu và giả định; không tối ưu success rate bằng bỏ case khó.

Không thêm MDP vào contract. Nếu đủ dữ liệu, mô phỏng off-chain có baseline held-out và sensitivity analysis; policy cuối deterministic, giải thích được. QV chỉ cân nhắc preference advisory, không tước refund hoặc sửa mục đích donor bằng đa số.

## 9. PM7 — Amendment và phục hồi quyền ký

Plan change chia operational/financial/fundamental. Ghi immutable history, chỉ sửa nghĩa vụ tương lai trong envelope; không hạ tiêu chí để hợp thức hóa kết quả cũ. Fundamental đổi mục đích/token/rights: campaign mới, không tự chuyển quỹ.

Vendor wallet mất khóa sau commitment là vấn đề nghĩa vụ, không cho admin update recipient. Nếu xây recovery: xác minh chủ thể, declaration các bên, thời gian công khai, chặn payment cũ, authority riêng và trace phản đối. Cơ chế backup reviewer của MVP không trao quyền đổi ví vendor.

Donor conditional exit nếu nghiên cứu phải có mô hình quyền trên unreleased funds và recovery của payout trước exit; không chỉ `F += exit`. Không trộn exit với refund terminal hoặc xóa contribution rồi dùng công thức cũ.

**Gate:** replay domain/nonce, stale amendment, unclaimed exit + STOP, lost key, malicious recovery claimant, mọi đường bảo toàn obligations và nhận đúng người.

## 10. PM8 — Fiat và bằng chứng bên ngoài

### Fiat/off-ramp

Cần đối tác và specification riêng: ai giữ token/fiat, beneficiary bank verification, tỷ giá/thời điểm khóa, phí, chuyển lỗi/hoàn lại, settlement finality, quyền donor khi intermediary thất bại, đối chiếu token–fiat và điều kiện vận hành được thẩm định. Token ra ví intermediary chỉ là một chặng, không hiển thị vendor paid ở chặng đó.

### Attestation/oracle

Ưu tiên claim cụ thể có nguồn, ví dụ supplier xác nhận invoice hoặc đơn vị tiếp nhận ký receipt. Signature chứng minh issuer/bytes; không chứng minh sự thật. Chốt expiry/revocation/domain/replay và privacy. Oracle không tự bypass cash cap, case hoặc outcome review.

### Arbitration và bond

Chỉ khi có dữ liệu cho thấy primary/backup không đủ xử lý locked obligations. Cần xác định ai là arbitrator, phạm vi, phí, bằng chứng, thời gian, phản đối và cách thực thi quyết định. Không gọi một địa chỉ admin là hội đồng độc lập.

Bond nếu có là thay đổi policy và vốn lưu động; tách operational failure khỏi fraud, xác định slash authority và nguồn restitution. Chưa có dữ liệu thì không bật bond/bounty.

ZK/TLS proof chỉ nghiên cứu provenance dữ liệu số khi có use case; không giải quyết việc trao quà ngoài đời bằng ảnh/hash.

## 11. Thiết kế đánh giá để không trộn hiệu ứng

| Variant | Câu hỏi chính |
|---|---|
| B0 fixed-stage organizer advance | Baseline hiện tại |
| R1 request-based organizer advance | Lợi ích riêng của bỏ ngân sách stage cố định |
| R2 request-based P1 fixed policy | Tác động đổi người nhận và lịch thanh toán |
| R3 P1 adaptive policy | Tác động riêng của thích ứng theo rủi ro |

R1 có thể là mô hình thực nghiệm cô lập, không bắt triển khai P2 production trước MVP P1. Dùng paired scenarios cùng chất lượng chứng từ, hành vi vendor/reviewer, token và nhu cầu vốn. Các mức vendor phải ứng vốn và thời gian chờ khác nhau phải được đo, không giấu thành lợi ích escrow.

Mỗi mở rộng có nghiên cứu applicability: việc hợp lệ nào bị loại, ai chịu chi phí/vốn, trường hợp tiền bị khóa và trường hợp reviewer xét sai. Không gọi synthetic dataset là khảo sát độc lập.

## 12. Điều kiện mở một hạng mục post-MVP

1. Có case và số đo cho thấy MVP chưa đáp ứng.
2. Có delta quyền/tiền/state so với policy đang dùng, không chỉ danh sách màn hình.
3. Có trace trả tiền/refund/recovery và giới hạn khóa vốn.
4. Có tests quyền từng actor/recipient, replay và accounting độc lập.
5. Có kế hoạch migration/deployment mới, bảo toàn dữ liệu/obligations.
6. Người dùng chọn phạm vi mở rộng; không tự đưa cả backlog vào goal MVP.

Không xóa chức năng/test MVP để đưa feature mới vào nhanh. Mỗi hạng mục có điểm dừng riêng; khi chưa có dữ liệu hoặc reviewer/vendor phù hợp, giữ là nghiên cứu chứ không ghi “production ready”.
