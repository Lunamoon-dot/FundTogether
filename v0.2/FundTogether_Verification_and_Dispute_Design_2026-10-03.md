# FundTogether — Kiểm tra evidence và xử lý tranh chấp theo tầng

> **Quyết định phạm vi mới nhất (2026-10-04):** MVP dùng resolver được cấp quyền,
> sau các bước kiểm tra hệ thống. Hội đồng 2/3 và ResolverManager để post-MVP.
> Các đoạn chọn 2/3 cho MVP bên dưới thuộc quyết định cũ, đã được thay thế;
> phần cơ chế hội đồng chỉ còn là tài liệu tham khảo cho post-MVP.

> Cập nhật: 2026-10-04
> Trạng thái: Hướng thiết kế đã đánh giá; chưa triển khai toàn bộ
> Nguồn: Đề xuất người dùng gửi và đối chiếu Threat Model v0.2

## 1. Kết luận đánh giá

Người dùng xác nhận resolver có hai nhiệm vụ trong MVP: duyệt campaign sau các
lớp kiểm tra và phân xử tranh chấp còn chưa giải quyết được sau kiểm tra, giải
trình, kiểm tra lại. Resolver có thể là nhân viên nền tảng được cấp quyền.
Hai nhiệm vụ có checklist và kết quả riêng; không bắt buộc hai đội nhân sự riêng.

Campaign luôn qua kiểm tra hồ sơ, tính toàn vẹn, ngân sách và tiêu chí bằng logic/
hệ thống; organizer sửa theo kết quả rồi nộp hồ sơ hoàn chỉnh cho resolver.
Đạt kiểm tra hệ thống chưa đồng nghĩa được mở campaign. Resolver xác thực đạt
mới cho phép organizer publish khi đủ bond và các điều kiện contract. Duyệt
campaign chưa chứng minh công việc trong tương lai đã hoàn thành.

Evidence và challenge đều có lớp kiểm tra trước. Nhánh phân xử chỉ chuyển tới
resolver khi vẫn bất đồng hoặc quy trình xử lý có giới hạn thời gian cần
escalation. Resolver thuộc MVP; không hoãn toàn bộ vai trò sang post-MVP.

Đây là bản ghi đánh giá thiết kế, không tự phê duyệt toàn bộ ví dụ trong đề xuất.
Chưa có số liệu chứng minh tỷ lệ “90% happy path” hay thời gian hoàn thành dự án.
Registry, reputation, chọn trọng tài ngẫu nhiên và phí xử lý vẫn là hướng sau MVP.
OCR/AI là hướng hỗ trợ tùy chọn cho pipeline evidence có thể nâng cấp; chưa chọn
provider và không phải điều kiện bắt buộc để MVP chạy. Xem
[Evidence Schema](./FundTogether_Evidence_Schema_v0.1.md) và
[Verification Report](./FundTogether_Verification_Report_v0.1.md).

## 2. Luồng mục tiêu

### Campaign trước khi công bố

```text
Organizer tạo nháp -> hệ thống kiểm tra hồ sơ/toàn vẹn/ngân sách/tiêu chí
  lỗi -> ghi kết quả -> organizer sửa -> kiểm tra lại
  đủ điều kiện -> nộp hồ sơ hoàn chỉnh -> resolver/nhân viên có quyền xem xét
    yêu cầu sửa -> ghi lý do -> revision mới -> kiểm tra lại
    từ chối -> chưa được công bố
    duyệt -> organizer publish khi đủ bond và điều kiện contract
```

Không sửa đè phiên bản đã commit. Quyết định gắn người xử lý, phiên bản và lý do.
Luồng yêu cầu sửa/từ chối/nộp lại campaign còn cần đặc tả và triển khai; không
tự suy ra quyền unfreeze hoặc enum on-chain mới từ sơ đồ này.

### Evidence và challenge

```text
ORGANIZER nộp evidence theo phiên bản
                  ↓
HỆ THỐNG kiểm tra tính toàn vẹn/tiêu chí; EVIDENCE VERIFIER kiểm tra đủ điều kiện
  REJECTED → ghi lý do → organizer sửa và nộp phiên bản mới
  ADMISSIBLE → ghi nhận admission trên chain
                  ↓
DONOR REVIEW — 72 giờ
  Không có phản đối đang chờ/được nhận → đủ điều kiện settlement
  Donor gửi phản đối đúng hạn → tạm khóa settlement
                  ↓
HỆ THỐNG kiểm tra challenge; CHALLENGE VERIFIER kiểm tra phản đối
  INVALID → ghi lý do; có đường phản đối kết quả loại bỏ
  ADMISSIBLE → ORGANIZER RESPONSE
                  ↓
RE-VERIFY theo tiêu chí đã khóa
  Khắc phục đạt → evidence phiên bản mới → review mới 72 giờ
  Chưa giải quyết / vẫn tranh chấp / đến hạn escalation → RESOLVER có quyền
                  ↓
PASS / RESUBMIT / CANCEL_WITHOUT_FAULT / MISCONDUCT
```

PASS là kết quả cho phép settlement theo điều kiện contract; không phải chứng
minh tuyệt đối sự thật ngoài đời. Hết thời gian không tự chạy giao dịch: vẫn
cần người hoặc dịch vụ gọi contract. Quy tắc hiệu lực cuối cùng/kháng nghị verdict
của resolver cần chốt trước khi triển khai.

## 3. Ranh giới quyền hạn

Người dùng đã chốt [Verifier Specification v0.1](./FundTogether_Verifier_Specification_v0.1.md):
một loại VERIFIER_ROLE kiểm tra evidence/challenge/remediation; chỉ admissibility
và objective validation, không sửa dữ liệu, không adjudication, không chuyển tiền.
Sửa lỗi khách quan -> review lại 72 giờ; dispute vẫn chưa rõ -> resolver.
Evidence admission/versioning và AccessControl đã triển khai theo checkpoint
trong spec; challenge/remediation, committee và deadline/appeal vẫn chưa triển khai.

| Vai trò | Được làm | Giới hạn |
|---|---|---|
| Resolver khi duyệt campaign | Xem hồ sơ hoàn chỉnh và kết quả kiểm tra; duyệt/yêu cầu sửa/từ chối trước publish | Luôn có hệ thống kiểm tra trước; không chứng nhận việc thực hiện trong tương lai |
| Evidence verifier | Kiểm tra đủ hồ sơ, đọc được, đúng phiên bản, khớp tiêu chí | ADMISSIBLE chưa chứng minh evidence thật; không được tùy ý chuyển tiền |
| Challenge verifier | Kiểm tra donor, thời hạn, phạm vi, trùng lặp, tài liệu hỗ trợ | Nhận phản đối chưa đồng nghĩa organizer sai phạm; nội dung chưa rõ cần escalation |
| Organizer | Giải trình, bổ sung, khắc phục | Không tự bác challenge, đổi tiêu chí đã duyệt hoặc mở khóa giải ngân |
| Re-verifier | Kiểm tra phản hồi và ghi kết quả | Kết quả bị tranh chấp cần có đường đưa lên resolver |
| Resolver khi phân xử | Kết luận tranh chấp được chuyển lên sau kiểm tra/giải trình/kiểm tra lại | Tránh xung đột theo case; chỉ verdict cho phép; không nhập tùy ý người nhận/số tiền/slash |
| Smart contract | Kiểm tra quyền, trạng thái, thời hạn và thực thi tài chính | Không tự xác minh được sự thật ngoài đời |

Hệ thống verifier vẫn là điểm cần tin cậy. Gọi nó là “hệ thống” hoặc dùng AI
không loại bỏ trách nhiệm đánh giá. Cần ghi rõ ai kiểm tra, kiểm tra gì và giới
hạn kết luận. Chữ ký/hash không biến một thông tin thành sự thật.

## 4. Thời gian, phiên bản và khả năng phục hồi

- Giữ thời lượng review 72 giờ đã chốt. Theo luồng mục tiêu, đồng hồ bắt đầu
  sau khi admission của phiên bản evidence được ghi nhận trên chain.
- Phản đối đúng hạn phải chặn settlement khi đang chờ kiểm tra. Chỉ có timestamp
  trong database chưa bảo vệ được tiền trên chain, nhất là phản đối sát hết hạn.
- INVALID cần lý do và cơ chế phản đối việc loại bỏ; không cho verifier âm thầm
  kiểm duyệt donor. Phản đối không hợp lệ không tự khởi động lại review.
- Evidence sửa đổi phải có phiên bản/hash mới liên kết bản cũ; không ghi đè.
  Nội dung thay đổi cần review mới; giới hạn số lần nộp lại để tránh kéo dài vô hạn.
- Mỗi bước chờ cần deadline và fallback: admission, screening, organizer response,
  re-verify và resolver. Không phản hồi chưa đủ để kết luận MISCONDUCT.
- Chưa chốt thời hạn từng bước, số vòng sửa, cơ chế kháng nghị và kết quả timeout.
  Đề xuất 7 ngày trước đó chưa phải quy tắc đã được người dùng phê duyệt.

## 5. Ai làm resolver?

Theo xác nhận 2026-10-04, nhân viên nền tảng được cấp quyền có thể làm resolver.
Hướng hội đồng 2/3 dưới đây áp dụng cho phân xử tranh chấp được chuyển lên;
không tự áp threshold đó vào duyệt campaign. Cách bổ nhiệm, nhân sự và quyền
cụ thể còn cần chốt; cập nhật workflow không tự đổi threshold đã chọn trước.

Hội đồng ba người độc lập, cần hai người cùng kết luận, là phương án đáng cân nhắc.
Đây là cơ chế có thành viên được lựa chọn, không tự chứng minh tính phi tập trung.
Ba ví có thể thuộc một người; quan hệ tổ chức/lợi ích phải được kiểm tra ngoài chain.

Resolver của vụ việc cần tránh xung đột với organizer, challenger, vendor và
verifier đã tham gia vụ đó. Không tự chọn vụ việc theo lợi ích tài chính.

Nếu dùng 2/3, hai phiếu phải cùng verdict, campaign, milestone, dispute, phiên bản
evidence/response, vòng xử lý và ngữ cảnh contract. Hai kết luận khác nhau không
tạo quorum. Mỗi thành viên bỏ phiếu một lần/vòng; cần quy tắc cho bất đồng,
rút khỏi vụ việc, mất quyền truy cập và thay thành viên.

**Cập nhật lựa chọn:** Quyết định mới nhất của người dùng hoãn hội đồng 2/3 đến post-MVP
và ResolverManager ghi từng verdict, không dùng Safe thay toàn bộ quá trình vote.
Xem [Dispute Policy và hội đồng resolver](./FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md).
Lựa chọn này thay đề xuất ban đầu và bổ sung phạm vi threshold voting; registry
động, reputation và random assignment vẫn để sau. Chưa triển khai committee.

Tham khảo cơ chế xác nhận theo ngưỡng: [Safe smart account overview](https://docs.safe.global/advanced/smart-account-overview).
Safe không tự đánh giá evidence hoặc ngăn thông đồng; chưa quyết định dùng Safe.

## 6. Verdict và tài chính

| Verdict đề xuất | Ý nghĩa | Hệ quả cần quy định trong contract |
|---|---|---|
| PASS | Phân xử chấp nhận milestone | Settlement đúng ngân sách một lần, theo quy tắc finality đã chốt |
| RESUBMIT | Thiếu sót có thể sửa | Phiên bản mới, review mới, giới hạn vòng và deadline; chưa giải ngân |
| CANCEL_WITHOUT_FAULT | Không tiếp tục được, chưa chứng minh sai phạm | Dừng; snapshot escrow chưa giải ngân; trả bond theo quy tắc terminal |
| MISCONDUCT | Có kết luận sai phạm kèm lý do | Dừng; refund tiền chưa giải ngân và phần slash được định nghĩa trước |

DEFAULT được bổ sung vào bảng policy dự thảo để phân biệt không hoàn thành nghĩa vụ
với gian lận; chưa chốt điều kiện/hệ quả tiền. Slash, refund
sau giải ngân, rounding và lỗi chuyển token cần chốt trước khi viết nhánh terminal.
Tiền đã trả organizer không tự động thu hồi được. Không chia bond bị slash cho
người kết luận sai phạm; phí resolver chưa thuộc phạm vi triển khai hiện tại.

## 7. Ranh giới on-chain/off-chain

```text
File → Storage
Hồ sơ, kiểm tra, giải trình, danh tính và quan hệ → Backend / Database
Admission / dismissal / verdict được xác thực → giao dịch Smart Contract
Contract event → Indexer idempotent → Database projection → Frontend
```

Backend ghi “resolved” chưa đủ mở escrow. Contract phải kiểm tra người có quyền,
case/version, trạng thái và deadline. Submitted, receipt success, confirmed và
indexed là các bước khác nhau. Chưa chốt API, vai trò ký/gửi admission và appeal.

## 8. Code hiện tại khác hướng thiết kế ở đâu?

Tại lần đối chiếu 2026-10-03 trong C:\Users\dell\Desktop\FundTogether:

- Resolver hiện là địa chỉ triển khai contract, dùng để duyệt campaign.
- Nộp evidence tạo phiên bản SUBMITTED; verifier được admin phân công và còn role
  phải chấp nhận đúng hash/version trước khi review 72 giờ bắt đầu.
- Donor challenge trực tiếp chuyển CHALLENGED; chưa có screening/response/re-verify.
- Evidence cũ không sửa; sau reject organizer nộp phiên bản mới, lưu lịch sử.
  Chưa có vòng remediation sau challenge.
- Luồng không có challenge có settlement, giải ngân tuần tự và trả bond cuối.
- CHALLENGED chưa có đường thoát; chưa có committee hoặc timeout recovery.

Luồng evidence admission được cập nhật theo code đã kiểm thử; các bước mục tiêu
còn lại không được đánh dấu DONE.
Quyết định tiếp theo: quyền verifier và xác thực; hold/appeal; deadline/fallback;
membership/conflict handling của hội đồng 2/3; quy tắc terminal tài chính.
