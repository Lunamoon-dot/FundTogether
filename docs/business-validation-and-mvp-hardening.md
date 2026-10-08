# Củng cố MVP và kiểm chứng nghiệp vụ FundTogether

> Ngày: 2026-10-06
> Quyết định hướng phát triển: APPROVED — theo yêu cầu người dùng.
> Giai đoạn: IN_PROGRESS. Nghiên cứu thực tế và nghiệm thu còn TODO.
> Phạm vi: làm rõ nghiệp vụ, củng cố workflow hiện có, rồi thay đổi từng phần có kiểm chứng.

## 1. Quyết định hiện tại

Tạm hoãn mở rộng post-MVP. Ưu tiên hiểu cách một chiến dịch từ thiện vận hành
ngoài đời, kiểm chứng giả định của protocol, sửa các điểm không phù hợp và làm
cho MVP dễ sử dụng, có thể phục hồi và có kết quả kiểm tra tái lập được.

Verifier riêng, committee, appeals, slashing, reputation, AI, fiat bridge và
multi-chain tiếp tục là nội dung để sau. Được ghi trong roadmap không có nghĩa
là đã quyết định triển khai, hoặc cần triển khai ngay sau khi test local PASS.
Arc vẫn là ứng viên đánh giá về sau; không phải bước kế tiếp mặc định.

Giữ baseline đã duyệt để có một hệ thống tham chiếu. Có thể đề xuất thay đổi
baseline nếu nghiên cứu tìm ra vấn đề, nhưng phải ghi rõ tác động và được chốt
trước khi thay quyền, cách giữ/chuyển tiền hay nghĩa vụ của campaign đang tồn tại.
Quyết định này không tự mở thêm quyền ký, đổi deadline hay thay deployment.

### Vì sao nên làm lúc này

FE/BE, tài liệu và các deployment thử nghiệm còn thuận lợi để điều chỉnh. Khi có
người dùng thật, commitment và nghĩa vụ tài chính, chi phí thay đổi tăng lên.
Contract hiện tại không có đường upgrade: sửa source không sửa code đã triển khai,
và deploy mới không tự chuyển campaign, escrow hay quyền refund từ bản cũ.

Không khẳng định kiến trúc hiện tại là tối ưu nhất hoặc đã thích hợp với thực tế.
MVP là mô hình cần kiểm chứng. Mục tiêu giai đoạn này là xử lý các vấn đề có
bằng chứng và chốt phạm vi hợp lý, không đợi một hệ thống “hoàn hảo” vô thời hạn.

## 2. Đọc tài liệu và đánh giá trạng thái

| Loại thông tin | Tài liệu | Cách sử dụng |
|---|---|---|
| Hướng phát triển hiện tại | Tài liệu này; [MVP scope](./mvp-scope.md) | Chọn việc tiếp theo và điều kiện chuyển giai đoạn |
| Baseline nghiệp vụ đã duyệt | [Protocol](./protocol-spec.md), [milestone policy](./mvp-milestone-completion.md), [financial rules](./financial-rules.md) | Quyền, điều kiện và tiền; không coi toàn bộ đề xuất cũ là rule đang chạy |
| Code và cấu hình ứng dụng | [Overview](./PROJECT_OVERVIEW.md), deployment manifest, source | Phân biệt prototype và MVP mới |
| Bằng chứng kiểm tra | [Progress](./PROJECT_PROGRESS.md), [manual cases](./manual-mvp-test-cases.md) | Ngày, môi trường, thao tác và giới hạn của từng kết quả |
| Tư liệu/giả thuyết thiết kế | [v0.2](../v0.2/README.md) | Câu hỏi nghiên cứu và phương án; không tự tạo quyền hoặc bảo đảm |

Từ reset test được người dùng cho phép ngày 2026-10-07, manifest ứng dụng trỏ
`FundTogetherMvp` trên RPC 8545; tài khoản/tổ chức được giữ, campaign cũ bị bỏ.
`FundTogetherMvp` có source và tích hợp contract/BE/storage/indexer/FE đã được
ghi nhận kiểm tra trên Anvil riêng 9545. Smoke dọn fixture sau khi chạy; đó
không phải môi trường MetaMask MVP đang sẵn sàng sử dụng.

Case A/B đã có kết quả thử của người dùng và đối chiếu được ghi trong progress.
Case C1–C6, popup thực tế, đổi ví và reload pending còn cần nghiệm thu trên
môi trường MVP riêng. Kết quả tự động không chứng minh khả năng vận hành với
tiền thật, sự thật của bằng chứng, độc lập của resolver hoặc nhu cầu người dùng.

Các kết quả trên được đối chiếu từ source/config và nhật ký kiểm chứng hiện có;
lượt cập nhật docs này không chạy lại các suite hay xác nhận trạng thái live.

## 3. Baseline giữ nguyên trong lúc nghiên cứu

| Nội dung | Rule hiện đã duyệt | Giới hạn cần nói rõ |
|---|---|---|
| Danh tính | Account ứng dụng; ví liên kết bằng SIWE; quyền ký do contract | Role DB không tạo quyền on-chain; địa chỉ ví không chứng minh danh tính ngoài đời |
| Funding | Token MockUSDC local; goal bằng tổng budget; không vượt goal hoặc deadline | Không đại diện cho một luồng thanh toán fiat đã hoạt động |
| Milestone | Tuần tự; activation không chuyển tiền; giải ngân sau evidence admission và review/settlement | Organizer phải có nguồn thực hiện trước khoản giải ngân đó |
| Bond | Bằng budget lớn nhất; tách khỏi donor escrow | MVP không slash, không dùng bond để bồi thường donor |
| Resolver MVP | Một resolver được cấp quyền tiếp nhận và quyết định case | Có tin cậy đơn phương; không phải verifier độc lập |
| Review/case | Review 72 giờ; 7 ngày giải trình + 7 ngày xử lý; tối đa 3 phiên bản; một quyết định cuối/case/version | Đây là default đã chọn, chưa có đo đạc thực tế chứng minh phù hợp |
| STOP/timeout | Hoàn donor escrow chưa giải ngân; bond trả riêng, không phạt | Timeout không phải kết luận gian lận; không thu hồi tiền đã giải ngân |
| Claim MVP mới | Donor claim một lần; organizer claim bond riêng; transfer fail giữ quyền retry | Không thay recipient khi mất ví hoặc token issuer chặn chuyển |
| Rounding | Floor theo base unit; không hết hạn claim; dust giữ escrow; không sweep | Không mô tả khoản chưa claim là dust |
| Dữ liệu | Bản gốc riêng tư; bản công khai được organizer xác nhận đã che thông tin; hash/version bất biến | Hash xác nhận nội dung, không chứng minh sự thật hay bảo đảm dữ liệu luôn truy cập được |

Chi tiết deployment cũ và mới khác nhau ở đường thoát challenge và cách trả
bond. Khi kiểm tra một campaign phải xác định đúng deployment, không suy từ
source mới hoặc UI mới rằng campaign cũ đã được nâng cấp.

## 4. Các câu hỏi nghiệp vụ ưu tiên

Các mục dưới đây là TODO nghiên cứu, không phải bug đã chứng minh hay rule mới.
Mỗi mục cần ví dụ thực tế, người chịu trách nhiệm, tác động đến tiền/quyền và
một kết luận có bằng chứng trước khi đề xuất code.

### B01 — Ai có thể dùng hệ thống, để giải quyết việc gì?

- Chọn nhóm organizer/donor đầu tiên và loại hoạt động từ thiện cụ thể.
- Ai tổ chức, ai thụ hưởng, ai mua hàng, ai cung cấp và ai kiểm tra kết quả?
- Việc nào cần custody/cam kết on-chain? Việc nào chỉ cần account, hồ sơ hoặc audit?
- Đầu ra: một hồ sơ nhóm người dùng mục tiêu, hành trình hiện tại và giới hạn
  loại campaign MVP phục vụ; chưa suy rộng ra mọi hoạt động từ thiện.

### B02 — Dòng tiền để thực hiện milestone đến từ đâu?

Ví dụ baseline: goal 20, budgets 8/12, bond 12. Organizer khóa 12; activation
không trả 8. Họ phải thực hiện milestone đầu, nộp bằng chứng và chờ review
trước khi được trả 8. Nguồn ứng trước, điều kiện mua chịu và thời điểm chi phí
cần được xác định, thay vì giả định tiền fundraising đã đủ để hoạt động bắt đầu.

- Organizer có thể vừa khóa bond vừa ứng chi phí không? Có campaign nào không thể?
- Evidence chứng minh kết quả đã hoàn thành, khoản đã chi hay kế hoạch chi?
- v0.2 phân tích bond cho khoảng tiền rời escrow trước khi được xác minh
  ([threat model, mục 10–12](../v0.2/FundTogether%20Threat%20Model%20v0.2%20%E2%80%94%20Charitable%20Crowdfunding.md)).
  Code hiện giải ngân sau review. Hai dòng tiền này cần được đối chiếu; không
  áp chứng minh “maximum unverified exposure” của mô hình trước giải ngân vào
  mô hình hiện tại khi chưa kiểm tra các giả định.
- Đầu ra: timeline nguồn tiền, chi phí, bond, evidence và payout của một campaign
  thực tế. Xem xét giữ reimbursement, thu hẹp loại campaign hoặc đề xuất mô hình
  khác; không tự bật trả trước, vendor payment hay slash trong lượt docs này.

### B03 — Bond đang bảo vệ điều gì và có đáng chi phí vốn không?

- Với no-slash MVP, bond là tài sản bị khóa rồi trả organizer; donor không được
  nhận bond bù cho khoản đã giải ngân sai. Không gọi bond là bảo hiểm hoàn tiền.
- Bond có mục đích khả thi nào ngoài giữ cam kết tham gia? Chi phí vốn có loại
  bỏ organizer tốt nhưng ít tiền? Chia nhỏ milestone ảnh hưởng gì đến yêu cầu bond?
- Đầu ra: mục tiêu bond, trường hợp có/không bảo vệ donor, chi phí vốn và các
  lựa chọn. Giữ công thức hiện tại tới khi có quyết định thay đổi được duyệt.

### B04 — Tiêu chí nào đủ để nghiệm thu một hoạt động từ thiện?

- Tiêu chí có đo được không, ai xác nhận, khi nào và cần tài liệu tối thiểu nào?
- Phân biệt chứng từ hợp lệ, tiền đã chi và kết quả thật đến người thụ hưởng.
- Hoạt động thay đổi, giá tăng, vendor thất bại hoặc còn tiền thừa xử lý thế nào?
- Đầu ra: checklist theo loại campaign; ví dụ đạt, thiếu, mâu thuẫn và không thể
  kết luận. Không sửa tiêu chí đã commit để hợp thức hóa kết quả.

### B05 — Resolver là ai, làm được bao nhiêu việc và chịu trách nhiệm thế nào?

- Cách tuyển/chỉ định, kiểm tra xung đột ngoài địa chỉ ví, chuẩn ghi lý do và
  cách hỗ trợ khi resolver nghỉ, mất khóa hoặc không thể tiếp nhận campaign.
- Một resolver làm cả admission và quyết định cuối có được chấp nhận trong pilot?
  Không suy nhiều wallet thành nhiều người độc lập.
- Ai trả chi phí kiểm tra/gas? Khả năng xử lý có đáp ứng deadline không?
- Đầu ra: mô tả trách nhiệm và giới hạn tin cậy; mô phỏng resolver vắng mặt/xung
  đột. Thay khóa, thay authority, appeals và slash cần quyết định riêng.

### B06 — Donor có thực sự theo dõi và phản đối được không?

- Donor biết khi nào evidence được tiếp nhận bằng cách nào, có hiểu review 72 giờ?
- Không có challenge có thể do không đọc, không hiểu hoặc không truy cập được;
  không coi sự im lặng là tất cả donor đã xác minh kết quả.
- Một contribution nhỏ có thể mở case và gây chậm luồng. Bổ sung được material
  nhưng không có stake/kháng nghị MVP; mức chi phí và sự công bằng cần đánh giá.
- Đầu ra: thử tác vụ đọc/phản đối với donor mục tiêu, đo hiểu biết, thời gian và
  tình huống thao túng. Notification/stake/quorum chỉ là phương án nếu có bằng chứng.

### B07 — Thất bại, lỗi kỹ thuật và gian lận được giải thích thế nào?

- Tách funding thiếu, chậm tiến độ, không đủ bằng chứng, resolver offline và
  gian lận có chứng cứ. State FAILED không tự kết luận MISCONDUCT.
- Sau milestone đầu trả 8 trên tổng 20, STOP chỉ có pool 12. Donor góp 8/12
  nhận 4.8/7.2; bond 12 trả riêng organizer. Không hứa hoàn toàn bộ khoản đã góp.
- Giải ngân sai, mất ví, issuer đóng băng và tài liệu không còn đọc được cần
  hướng xử lý/giới hạn rõ; DB và support không thể tự đảo ngược token transfer.
- Đầu ra: bảng tình huống → actor → tài sản/quyền còn lại → thao tác được phép
  → lời giải thích cho donor/organizer; các trường hợp chưa có đường giải quyết.

### B08 — Token, dữ liệu và vận hành có phù hợp thực tế không?

- Người dùng có thể mua/giữ token và trả gas không? Họ có hiểu token nào/RPC nào?
- Ai giữ tài liệu, xử lý dữ liệu nhạy cảm, yêu cầu đồng ý, retention và sự cố
  phát tán bản công khai? Chốt quốc gia/phạm vi hoạt động trước khi đánh giá
  nghĩa vụ pháp lý với người có chuyên môn; docs này không kết luận tuân thủ.
- Ai trực dịch vụ, gọi timeout và hỗ trợ khi RPC/indexer/storage hỏng? Kinh phí,
  backup, phục hồi và sổ đối chiếu tài chính do ai chịu trách nhiệm?
- Đầu ra: danh mục phụ thuộc, trách nhiệm vận hành và các điều kiện chưa đáp ứng.
  MockUSDC/Anvil PASS không thay thế đánh giá issuer/token thật hoặc mạng đích.

## 5. Cách nghiên cứu và ghi quyết định

Làm từng nhóm nhỏ theo thứ tự B01–B03 → B04–B05 → B06–B08, trong khi vẫn sửa
bug đã xác định và cải thiện lời giải thích của workflow hiện tại.

1. Dựng một ví dụ campaign từ đầu tới cuối, gồm cả ngân sách và ngoại lệ.
2. Đối chiếu tài liệu chiến dịch thật đã được phép sử dụng; trao đổi với organizer,
   donor và người xét hồ sơ. Ghi ngày, bối cảnh, mẫu và giới hạn; ẩn thông tin riêng.
3. So với rule/code hiện tại: đâu phù hợp, đâu chỉ là giả định, đâu chưa có giải pháp.
4. Ghi các lựa chọn và trade-off; chốt quyết định có ảnh hưởng tiền/quyền trước code.
5. Triển khai một thay đổi nhỏ, kiểm tra regression và thử tác vụ với người dùng.

Mẫu một quyết định:

```text
ID / ngày / trạng thái: TODO -> IN_PROGRESS -> APPROVED hoặc DEFERRED
Vấn đề và ví dụ thật:
Rule/code hiện tại, deployment áp dụng:
Bằng chứng, nguồn và giới hạn:
Các lựa chọn, chi phí và tác động:
Actor/quyền/dòng tiền thay đổi:
Campaign cũ, migration và rollback:
Quyết định, người xác nhận, lý do:
Case chấp nhận và case từ chối:
Kết quả kiểm chứng, việc còn mở:
```

Không dùng số lượng test, suy đoán hoặc nội dung AI như bằng chứng rằng mô hình
đã phù hợp thị trường. Không liên hệ người khác hay công bố tài liệu của họ khi
chưa có quyền; việc nghiên cứu thực tế ở mục này chưa được thực hiện.

## 6. Công việc củng cố MVP song song

| ID | Công việc | Điều kiện chấp nhận | Trạng thái |
|---|---|---|---|
| H01 | Chuẩn bị môi trường browser MVP riêng, bảo toàn prototype | FE/BE/RPC/token/manifest cùng instance; wallet trỏ đúng RPC; có inventory, backup và cách phục hồi | TODO |
| H02 | Nghiệm thu A/B và C1–C6 cùng lỗi ví | Receipt/event/index khớp; claim/settle không lặp; account/role/link đúng; reload không gửi lại | IN_PROGRESS — A/B có bằng chứng, C thủ công còn TODO |
| H03 | Vận hành và phục hồi | Thử stop/start, backup/restore DB + chain + files + manifest; RPC/MinIO lỗi; checkpoint catch-up; không mất hoặc nhân đôi nghĩa vụ | IN_PROGRESS — có các kiểm tra local, chưa nghiệm thu vận hành đầy đủ |
| H04 | UX theo trạng thái và kiến thức của người dùng | Người dùng hiểu đang chờ ai, hạn chain, ví, số tiền nhận, lý do khóa nút và bước tiếp theo; không nhầm refund/bond/approval | IN_PROGRESS — có UI, thử người dùng còn TODO |
| H05 | Tối ưu có đo đạc | Đo RPC latency, bộ nhớ/dung lượng state, truy vấn/index lag, bundle và tải file; sửa bottleneck tái hiện được, giữ regression | TODO |

Với phục hồi, không chỉ backup DB: projections có thể replay, nhưng metadata,
wallet links và file riêng không tự sinh lại từ chain. Giữ danh tính deployment
và checkpoint tương thích. Restore không tự đồng bộ giờ máy vào Anvil; thay
clock có thể làm deadline hết hạn và phải là thao tác chủ động được hiểu rõ.

Ưu tiên blocker giao dịch, sai quyền, sai số tiền, nguy cơ mất dữ liệu hoặc bế
tắc workflow trước tối ưu hiệu năng. Không thêm framework/upgradeability hoặc
viết lại hệ thống nếu chưa chỉ ra vấn đề và tiêu chí chấp nhận.

## 7. Điều kiện kết thúc giai đoạn này

Các mục sau còn TODO; không phải chứng nhận đã đạt:

- B01–B03 có ví dụ và bằng chứng; dòng tiền trước/sau evidence và vai trò bond
  được giải thích nhất quán. Vấn đề trọng yếu phải có quyết định hoặc thu hẹp scope.
- B04–B08 có checklist, trách nhiệm và giới hạn rõ; rủi ro còn mở có owner và
  được chấp nhận rõ ràng, không ẩn dưới nhãn “post-MVP sẽ xử lý”.
- A/B/C và các lỗi ví thực tế đã nghiệm thu trong môi trường được ghi rõ;
  kế toán, duplicate, failed-transfer, timeout, replay/reorg giữ regression.
- Người dùng mục tiêu hoàn thành các tác vụ chính và hiểu giới hạn refund,
  bond, evidence và resolver; ghi lỗi quan sát được cùng cách xử lý.
- Backup/restore và liveness có người thực hiện, chi phí và diễn tập có bằng chứng.
- Docs, source, ABI/deployment và UI không mô tả capability chưa triển khai;
  chưa còn blocker được xác định về quyền/tiền/dữ liệu trong phạm vi đã chọn.

Sau đó mới đánh giá có cần post-MVP, mạng testnet công khai hay tiếp tục củng cố.
Mỗi tính năng mới phải giải quyết một nhu cầu/rủi ro có bằng chứng. Mốc này không
tự cho phép dùng tiền thật; đánh giá token/mạng, bảo mật độc lập, vận hành và
nghĩa vụ thực tế cần các cổng chấp nhận riêng.

## 8. Phạm vi cập nhật 2026-10-06

DONE: ghi hướng phát triển, đối chiếu baseline/source/cấu hình, nhận diện chênh
lệch mô hình dòng tiền v0.2 và MVP, lập câu hỏi nghiên cứu và cổng chuyển giai đoạn.
Chỉ cập nhật tài liệu; không đổi code, quyền, DB, storage, deployment hay tiền.
Các bài toán nghiệp vụ chưa được giải quyết chỉ vì đã được ghi vào tài liệu.
