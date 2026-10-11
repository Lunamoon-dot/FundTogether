# FundTogether — kế hoạch giải ngân theo yêu cầu sử dụng vốn

> Ngày: 2026-10-11. Trạng thái: kế hoạch thiết kế và triển khai, chưa triển khai.
> Người dùng chọn phương án đề xuất cho sáu quyết định nghiệp vụ bằng “theo ý bạn, viết file plan đi”. Các chi tiết bổ sung được ghi riêng là đề xuất thiết kế; không coi việc viết file là đã deploy hoặc đã kiểm chứng.
> Thực hiện trực tiếp trên nhánh hiện tại, không tạo nhánh và không giao sub-agent. Khi thực hiện kế hoạch dùng superpowers:executing-plans.

**Mục tiêu:** bỏ việc chia sẵn ngân sách thành milestone cố định; tổ chức xin tiền cho công việc có căn cứ, resolver xét trước cấp, tổ chức giải trình sử dụng tiền sau cấp.

**Kiến trúc:** giữ tài khoản/ví, xác thực tổ chức, storage và nền tảng indexer. Contract quản lý quỹ và quyền cấp/hoàn tiền; backend quản lý hồ sơ, quyền đọc và bản chiếu blockchain; frontend hướng dẫn hành động theo trạng thái thật.

**Stack:** React/TypeScript, NestJS, PostgreSQL/Drizzle, object storage, Solidity/Foundry, Viem.

**Tài liệu liên quan:** [định hướng nghiên cứu](./research-direction.md), [kế hoạch giữ/sửa/xóa](./superpowers/plans/2026-10-11-funding-requests-cleanup.md). Quy tắc B cũ chỉ là baseline, không tự áp cho mô hình này.

## 1. Sáu lựa chọn làm cơ sở kế hoạch

| Mục | Phương án chọn |
|---|---|
| Nguồn giải ngân | Được xin từ số thực huy động, không phải chờ đủ mục tiêu. Khoản xin phải thực hiện được một công việc có ích độc lập |
| Người nhận | Ví tổ chức cố định đã liên kết; chưa trả trực tiếp nhiều nhà cung cấp |
| Khoản đang sử dụng | Tối đa một khoản đã cấp nhưng chưa đối chiếu xong; được chuẩn bị nháp khoản tiếp |
| Người duyệt | RESOLVER xét nhu cầu và hồ sơ chi; ADMIN chỉ xác thực tổ chức, không tự có quyền cấp tiền |
| Điều kiện cấp tiếp | Khoản trước được đối chiếu đạt, kết thúc phản đối và trả đủ tiền dư thực nhận |
| Kết thúc | Hoàn thành mục tiêu hoặc dừng có lý do; quỹ còn trong escrow được hoàn theo quyền đóng góp, không hứa thu hồi khoản đã chuyển ra |

Không thêm donor voting, bond, oracle, adaptive amendment hoặc nhà cung cấp nhận tiền trong phạm vi đầu tiên.

## 2. Luồng sản phẩm

```text
Tổ chức đã xác thực
  → Tạo campaign: mục đích, đối tượng, mục tiêu tiền, thời hạn
  → Resolver duyệt campaign
  → Công khai gây quỹ
  → Tổ chức lập yêu cầu cấp vốn kèm căn cứ
  → Resolver yêu cầu bổ sung / từ chối / duyệt
  → Tổ chức nhận đúng khoản đã duyệt
  → Thực hiện và nộp báo cáo sử dụng tiền
  → Resolver đối chiếu + cửa sổ phản đối + trả tiền dư
  → Đóng yêu cầu
  → Yêu cầu mới hoặc kết thúc campaign
```

Xác thực tổ chức không thay thẩm định yêu cầu. Báo giá trước cấp không thay hóa đơn/thanh toán/kết quả sau cấp. Hash và chữ ký không tự chứng minh nội dung ngoài đời.

### Campaign phải mô tả gì?

- Mục đích, nhóm thụ hưởng, phạm vi hoạt động và cách đánh giá kết quả toàn campaign.
- Mục tiêu huy động, hạn gây quỹ, hạn kết thúc hoạt động; phương án làm được nếu chỉ huy động một phần.
- Công khai rằng tiền có thể được cấp trước khi gây đủ mục tiêu, nên không đủ mục tiêu không đồng nghĩa được hoàn toàn bộ.
- Không yêu cầu khai báo danh sách milestone hoặc chia ngân sách thành các đợt từ lúc tạo.
- Phạm vi đầu tiên vẫn mua/trao quà; không xây bộ máy quy trình tổng quát cho mọi loại từ thiện.

### Hồ sơ yêu cầu cấp vốn

| Nhóm thông tin | Nội dung bắt buộc |
|---|---|
| Công việc | Làm gì, cho ai, vì sao thuộc mục đích campaign, kết quả riêng có thể nghiệm thu |
| Số tiền | Tổng xin, các dòng hàng hóa/dịch vụ, số lượng, đơn giá, căn cứ dự toán |
| Căn cứ nhu cầu | Kế hoạch phục vụ/đầu mối tiếp nhận; không chỉ một câu “cần tiền” |
| Chứng từ trước cấp | Báo giá hoặc căn cứ giá phù hợp; chưa đòi hóa đơn đã trả khi tổ chức chưa có tiền |
| Thực hiện | Người phụ trách, ví nhận cố định, thời hạn hoàn thành/báo cáo |
| Chống xin trùng | Tham chiếu khoản chi trước, xác nhận phần chưa được tài trợ; resolver đối chiếu lịch sử |
| Tiêu chí sau cấp | Kết quả và chứng từ cần cung cấp để đối chiếu khoản này |

Resolver duyệt hoặc yêu cầu sửa và gửi lại; không sửa trực tiếp số tiền/nội dung đã gửi của tổ chức. Khi duyệt, khóa nội dung, số tiền, ví nhận và tiêu chí của yêu cầu.

## 3. Chi tiết thiết kế đề xuất cho bản đầu

Các lựa chọn sau cụ thể hóa sáu điểm trên, chưa phải kết quả kiểm chứng hoặc quy tắc của deployment B hiện có.

### Trạng thái và số lượng yêu cầu

Tách trạng thái gây quỹ khỏi trạng thái thực hiện: campaign có thể còn nhận đóng góp trong khi một yêu cầu đang thực hiện. Tránh dùng một enum tuyến tính khiến “đã giải ngân” đồng nghĩa “đã đóng gây quỹ”.

```text
Yêu cầu trước cấp:
DRAFT → SUBMITTED → CHANGES_REQUESTED → gửi lại
                  → REJECTED
                  → APPROVED → DISBURSED
                  → CANCELLED / EXPIRED (nếu chưa cấp)

Sau cấp:
DISBURSED → REPORT_SUBMITTED → NEEDS_INFORMATION → nộp bổ sung
                            → ACCEPTED_PENDING_CHALLENGE
                            → DISPUTED / không đạt
ACCEPTED_PENDING_CHALLENGE → SETTLED (hết phản đối, đủ tiền dư)
```

- Đề xuất chỉ một yêu cầu hoạt động, tính từ SUBMITTED đến SETTLED; nháp tiếp theo không chiếm quỹ. Cách này đơn giản hơn cho phép nhiều yêu cầu được duyệt chờ tiền cùng lúc.
- Yêu cầu bị từ chối/hủy/hết hạn trước cấp không làm mất contribution, không làm campaign tự thất bại; giữ lịch sử và có thể gửi yêu cầu mới trong hạn.
- Sau cấp không có nút hủy để xóa nghĩa vụ báo cáo. Hồ sơ không đạt, tranh chấp hoặc quá hạn chặn khoản tiếp và đi qua quy trình xử lý/dừng.
- Số lần bổ sung, các deadline, giới hạn request/campaign và kết quả case phải được định nghĩa trong đặc tả trước code contract. Không mặc định sao chép các con số 3/7/30/60 ngày của B.

### Giữ chỗ và chuyển tiền

- Submit không chuyển tiền. Duyệt kiểm quỹ thực có và giữ chỗ đúng số tiền; số đã giữ chỗ không dùng cho yêu cầu khác.
- Claim chỉ chuyển đúng số đã duyệt tới ví tổ chức cố định; không gửi địa chỉ tùy ý từ form. Kiểm lại tổ chức, trạng thái, thời hạn và deployment theo đặc tả.
- Claim thành công tiêu thụ reserve và quyền nhận một lần. Hủy/hết hạn trước claim giải phóng reserve, không trừ tiền donor.
- Duyệt và giải ngân là hai sự kiện khác nhau. HTTP lưu hồ sơ, tx hash, receipt thành công và indexer đã đồng bộ phải hiển thị riêng.
- Nếu giao dịch chuyển token lỗi, toàn bộ counters/quyền/reserve của giao dịch đó rollback; retry khi còn đủ điều kiện.

### Gây quỹ thiếu mục tiêu và đóng campaign

- Hết hạn gây quỹ chỉ đóng nhận đóng góp; không tự đánh dấu hoạt động đã thất bại và không tự hoàn contribution đã dùng.
- Đề xuất cho phép dùng quỹ còn lại cho các yêu cầu hợp lệ tới hạn hoạt động đã công bố, dù không đạt mục tiêu huy động.
- Mục tiêu hoàn thành do resolver đối chiếu kết quả thực tế, không suy từ việc đạt mục tiêu tiền hoặc hết số dư. Không đạt mục tiêu ban đầu phải ghi kết quả một phần/dừng đúng thực tế.
- Hoàn tất bình thường chỉ khi không còn yêu cầu/reserve/tranh chấp chưa xử lý. Dừng bất thường phải vô hiệu hóa quyền claim chưa thực hiện và giữ hồ sơ khoản đã cấp chưa đối chiếu.
- Khi terminal: khóa góp/cấp mới, snapshot quyền trên custody còn lại; return/refund vẫn hoạt động. Không để thiếu báo cáo khiến quỹ còn trong escrow không bao giờ có đường hoàn.

### Refund khi gây quỹ và chi tiêu cùng diễn ra

Đề xuất bản đầu dùng quỹ chung: terminal refund phân bổ theo contribution thực nhận của từng ví trên tổng contribution cuối cùng, không cấp quyền rút riêng cho donor vào muộn. Donor phải thấy rõ tiền góp sau có thể cùng chịu phần thiếu hụt từ khoản đã cấp trước đó. Đây là sự đánh đổi của quỹ chung, phải chốt trong đặc tả tiền; nếu muốn bảo vệ từng nhóm donor theo thời điểm góp thì cần mô hình khác, không âm thầm thêm vào bản đầu.

Không có refund giữa chừng khi campaign còn hoạt động. Tiền tổ chức trả trước terminal vào custody; tiền trả sau terminal tạo quyền bổ sung. Không xóa quyền đã nhận base, không tính lại base theo custody sau mỗi claim, không sweep phần donor chưa nhận.

## 4. Quy tắc kiểm chứng tiền

Ký hiệu: C tổng góp, A tổng đã cấp, R tổng thực trả về, F tổng hoàn đã trả, E custody, Q quỹ giữ chỗ chưa cấp.

```text
C + R = A + F + E
0 <= Q <= E
Available = E - Q       (chỉ khi campaign còn hoạt động)
Claim(request) tối đa một lần, đúng approvedAmount
Return(request) <= Disbursed(request) - Returned(request)
```

Q là nghĩa vụ trong E, không cộng Q như tiền mới. Khi terminal không dùng Available để mở cấp mới. Cần kiểm thêm tổng quyền refund và quyền từng ví; chỉ invariant tổng tiền chưa chứng minh phân bổ đúng.

Không mặc định `A <= C`: nếu tiền dư được trả rồi dùng cho yêu cầu khác thì tổng cấp tích lũy có thể vượt tổng góp. Đặc tả phải phân biệt tổng luân chuyển, số chi được chấp nhận và ngân sách còn có thể dùng, tránh vừa thu hồi tiền dư vừa đếm nó là chi phí đã hoàn thành.

## 5. Ví dụ nghiệm thu đề xuất

Đơn vị ở đây là MockUSDC local, không phải quy đổi VND. Campaign mục tiêu 1.000, A/B mỗi người góp 150; mới huy động 300.

| Bước | C | A | R | F | E | Q |
|---|---:|---:|---:|---:|---:|---:|
| Hai donor góp | 300 | 0 | 0 | 0 | 300 | 0 |
| Duyệt yêu cầu 200 | 300 | 0 | 0 | 0 | 300 | 200 |
| Tổ chức claim | 300 | 200 | 0 | 0 | 100 | 0 |
| Chi hợp lệ 180, trả dư 20 | 300 | 200 | 20 | 0 | 120 | 0 |
| Đối chiếu xong rồi dừng với kết quả một phần | 300 | 200 | 20 | 0 | 120 | 0 |
| A/B mỗi người nhận 60 | 300 | 200 | 20 | 120 | 0 | 0 |

Nếu không có khoản trả thực tế, refund pool chỉ là 100. Duyệt báo cáo ghi dư 20 không tự làm E tăng. Đã chi 180 không có nghĩa campaign mục tiêu 1.000 hoàn thành toàn bộ.

Ca bổ sung bắt buộc: donor góp sau khi đã cấp; request hết hạn trước claim; không nộp báo cáo; case không giải quyết; STOP khi đang giữ chỗ; transfer lỗi; claim lặp; return muộn; rounding; refresh/đổi account/đổi ví.

## 6. Kế hoạch triển khai theo thứ tự

| Task | File/nhóm tác động | Đầu ra và cách kiểm |
|---|---|---|
| P1 — Đặc tả | Tạo `docs/funding-request-spec.md`, `docs/funding-request-financial-rules.md` | Chốt state/deadline/case/funding/refund và interfaces; trace ví dụ mục 5, cả donor vào muộn. Chưa code tiền trước khi hoàn tất bước này |
| P2 — Tách phần dùng chung | `backend/src/advance/organization-request*`, `organization-verification*`, `advance.module.ts`, schema; frontend organization/review | Auth/OWNER/ADMIN/RESOLVER và lịch sử tổ chức giữ nguyên; test regression trước/sau |
| P3 — Contract mới | Đề xuất `contracts/src/FundTogetherRequests.sol`, `contracts/src/requests/RequestTypes.sol`, tests request/invariant | Test từ spec cho reserve/claim/cancel/timeout/report/return/refund, từng actor và replay; không thay deployment B |
| P4 — Dữ liệu/API/indexer | Đề xuất `backend/src/funding-requests/`, `backend/src/database/schema/funding-requests.schema.ts`, migration mới | Request ID ràng buộc hồ sơ và deployment; snapshot/audit, file ACL, duplicate/reorg/replay, generated OpenAPI |
| P5 — UI mới | Đề xuất `frontend/src/features/funding-requests/`; sửa public/review/workspace | Campaign không bắt chia đợt; lập/duyệt/claim/báo cáo/phản đối/hoàn tiền; receipt/indexed, reload, sai ví và lỗi API |
| P6 — Tích hợp và dọn bỏ | Theo [D4–D5 của kế hoạch dọn](./superpowers/plans/2026-10-11-funding-requests-cleanup.md) | Journey ví dụ mục 5 và các nhánh lỗi đạt; sau đó bỏ route/wizard/API/test stage không còn dùng, kiểm không mất đường đọc/xử lý nghĩa vụ cũ |
| P7 — Bàn giao | Overview, runbook, manual guide và báo cáo mới | Bằng chứng kỹ thuật riêng cho model mới, danh sách manual/reviewer chưa làm ghi TODO |

Các tên module mới là đề xuất tổ chức code; interfaces contract/API cụ thể là đầu ra P1 để không dựng trước chữ ký hàm trên quy tắc tiền chưa đầy đủ.

Mỗi task code: viết test hành vi cần giữ/thay → xác nhận lỗi trước sửa khi thích hợp → triển khai tối thiểu → chạy kiểm tra phù hợp → cập nhật bằng chứng. Không bỏ test lỗi bằng cách xóa cả suite milestone trước khi có kiểm tra tương đương.

## 7. Giữ và bỏ

- Giữ: tài khoản/ví, tổ chức và xác thực, dữ liệu/file/audit cũ, storage, nguyên tắc integer accounting và event-driven indexing.
- Thay: danh sách budget/criteria cố định từ lúc tạo, `currentStage`, eligibility/cấp đợt tiếp, evidence/case gắn stage và trạng thái campaign tuyến tính.
- Bỏ khỏi luồng mới: lựa chọn G1/G2 bắt buộc, nút thêm milestone, progress theo số đợt, lời hứa cấp tiếp theo kế hoạch đợt đã chốt.
- Chỉ xóa source cũ sau khi kiểm import/route/script/test và giữ cách phục hồi từ `28b245c`. Không DROP DB, xóa migration, reset chain hoặc xóa file riêng để hoàn tất việc dọn.
- Không triển khai đồng thời Adaptive Escrow/plan amendment, voting, bond, oracle hoặc payment nhiều supplier.

## 8. Điều kiện hoàn thành và trọng tâm review

- Yêu cầu không vượt quỹ có thể cấp; approval/claim đồng thời không over-reserve, không cấp hai lần.
- Không thể dùng một hồ sơ nhu cầu để nhận hai khoản hoặc thay báo cáo sau chi bằng báo giá trước chi.
- Góp sau khi đã giải ngân, STOP có reserve và return muộn có phân bổ được mô tả và kiểm bằng trace, không chỉ tổng số dư.
- Metadata/request/deployment không lẫn khi reload, chuyển account/ví hoặc indexer replay; file riêng không lộ.
- Luồng cũ có thể đọc/xử lý nghĩa vụ tồn tại; luồng mới có kiểm thử riêng, không lấy PASS của B làm nghiệm thu mới.
- Build/test/lint và integration PASS là hoàn tất kỹ thuật; thao tác Brave/MetaMask và đánh giá hồ sơ thực tế được báo riêng.

Lượt hiện tại chỉ tạo kế hoạch; không thay code chạy, không xóa chức năng, không thay tiền hoặc dữ liệu người dùng.
