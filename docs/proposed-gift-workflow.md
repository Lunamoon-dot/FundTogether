# Đề xuất workflow trao quà và xác minh — FundTogether

> Ngày: 2026-10-09.
> Trạng thái: DRAFT — đề xuất để thảo luận, chưa phải đặc tả đã duyệt để triển khai.
> Đọc trước: [Định hướng NCKH](./research-direction.md).
> Hiện trạng: code/deployment vẫn giải ngân sau xét duyệt. Tài liệu này đề xuất hướng B; không thay đổi quyền hoặc tiền đang tồn tại.

## 1. Mục tiêu và ranh giới

Thiết kế MVP cho hoạt động mua và trao quà: tổ chức đã xác thực nhận tiền để
thực hiện từng đợt; kết quả đợt trước được nghiệm thu trước khi cấp tiếp.
Trọng tâm là chất lượng bằng chứng, trách nhiệm người xác nhận/xét duyệt và
thực thi điều kiện bằng blockchain.

### 1.1. Mua và trao quà là một loại hình campaign

Theo góp ý người dùng ngày 2026-10-09, FundTogether phục vụ gây quỹ từ thiện;
tài liệu này đặc tả loại hình đầu tiên là mua và trao quà. Loại hình hoạt động
tách khỏi cách tiếp nhận (cá nhân/đơn vị) và kế hoạch cấp vốn (một/nhiều đợt).

Khung campaign, hạch toán, quyền ký, bằng chứng theo phiên bản và quyết định
xét duyệt có thể được tái sử dụng sau khi kiểm tra tính phù hợp. Checklist suất
quà, chứng từ mua hàng và bàn giao thuộc loại hình này; không đưa chúng thành
điều kiện cố định cho mọi campaign. Thêm loại hình khác cần quy tắc riêng về
hoàn thành, bằng chứng và các tác động tài chính, không chỉ thêm nhãn danh mục.

MVP vẫn chỉ triển khai loại mua và trao quà. Chưa thêm workflow engine hoặc
contract theo từng loại; tài liệu giữ ranh giới này để tránh khóa thiết kế chung
vào hoạt động trao quà.

### Đã được người dùng lựa chọn

- Hướng B: cấp tiền trước theo đợt, nghiệm thu trước khi cấp đợt sau.
- Mua và trao quà là loại hình campaign đầu tiên; hệ thống có thể xem xét các loại từ thiện khác về sau.
- Workflow xác minh là core; ưu tiên ứng dụng blockchain vào xác minh.

### Đề xuất trong tài liệu này, cần xem xét

- Bỏ bond ở phiên bản mới; không xóa nghĩa vụ bond của deployment cũ.
- Campaign được có một đợt hoặc nhiều đợt thực hiện có ý nghĩa thực tế.
- Cùng workflow tài chính cho trao trực tiếp và qua đơn vị; khác yêu cầu bằng chứng.
- Resolver MVP hiện có thẩm định/xét duyệt và xử lý phản đối; bên tiếp nhận cung
  cấp bằng chứng xác nhận, không tự có quyền giải ngân.
- MVP chưa thêm vai trò verifier riêng, committee, voting, scoring hay ZK.
- Giữ cách funding hiện có làm đề xuất ban đầu: goal bằng tổng ngân sách đợt,
  không vượt goal, đủ goal mới thực hiện. Thay rule này cần quyết định riêng.

## 2. Đơn vị nghiệp vụ

| Khái niệm | Ý nghĩa |
|---|---|
| Campaign | Một kế hoạch hỗ trợ có nhóm thụ hưởng, phạm vi, ngân sách và mục tiêu xác định |
| Đợt thực hiện/milestone | Một phần kết quả và ngân sách có thể thực hiện, nghiệm thu độc lập |
| Task | Công việc như mua, đóng gói, vận chuyển; không tự mở một lần cấp tiền |
| Đơn vị tiếp nhận | Trường/đơn vị địa phương nhận quà hoặc phối hợp phân phối |
| Cá nhân thụ hưởng | Người cuối cùng được hỗ trợ; không bắt buộc phải có ví blockchain |
| Người xét duyệt | Resolver MVP được chỉ định; đánh giá tiêu chí và chịu trách nhiệm về kết luận |

Ví dụ một sự kiện trao 100 suất tại một nơi có thể có một đợt và nhiều task.
Ba đợt trao ở ba thời điểm có thể có ba milestone. Không chia milestone chỉ
để tăng số bước hoặc tạo cảm giác bảo vệ tiền.

## 3. Hồ sơ kế hoạch trước funding

Mỗi đợt phải xác định:

- Số lượng, thành phần/chất lượng tối thiểu của suất quà.
- Nhóm người nhận, cách xác định đủ điều kiện và địa điểm/phạm vi thực hiện.
- Thời hạn thực hiện, ngân sách, dự kiến mua hàng và đơn vị/người tiếp nhận.
- Điểm hoàn thành: bàn giao cho đơn vị hay trao tới người thụ hưởng cuối cùng.
- Tiêu chí nghiệm thu, bằng chứng tương ứng và người/cách đối chiếu.
- Quy tắc xử lý thiếu số lượng, chi phí thay đổi, hàng thay thế hoặc còn ngân sách.

Ví dụ: cam kết trao quà tới 100 học sinh thì biên bản trường nhận hàng chưa
tự hoàn thành cam kết. Nếu mục tiêu được duyệt là bàn giao hàng cho trường,
nghiệm thu phải nói rõ phạm vi đó, không tuyên bố đã trao tới từng học sinh.

Sau khi duyệt/chốt, nội dung và tiêu chí gắn với commitment. Không sửa âm thầm
sau funding; thay đổi đáng kể phạm vi/ngân sách cần policy riêng trước khi code.

## 4. Workflow dự kiến

### 4.1. Xác thực tổ chức

Platform staff kiểm tra tổ chức, người đại diện, quyền kiểm soát ví và đầu mối
liên hệ. Trạng thái xác thực có phạm vi và căn cứ rõ; một địa chỉ ví hoặc tài
khoản đăng nhập không chứng minh danh tính/thẩm quyền ngoài đời.

Hồ sơ gốc riêng tư. Bản xác nhận được ký/gắn commitment có thể dùng làm căn cứ
cho resolver thẩm định; chưa quyết định mở registry on-chain riêng.

### 4.2. Thẩm định kế hoạch

Resolver xem tính rõ ràng, khả thi, ngân sách và khả năng kiểm chứng kết quả.
Quyết định duyệt gắn với phiên bản kế hoạch, tiêu chí và lịch/ngân sách đợt.
Hồ sơ thiếu được yêu cầu sửa trước chốt/funding.

### 4.3. Funding và cấp đợt đầu

Donations vào escrow. Khi đủ điều kiện funding, resolver xác nhận đủ điều kiện
cấp đầu dựa trên kế hoạch đã duyệt và trạng thái xác thực tổ chức còn phù hợp.
Organizer ký nhận/cấp ngân sách đợt đầu. Một đợt chỉ nhận khoản đã duyệt một lần.

Đề xuất MVP: cấp ngân sách đã duyệt của đợt; không tự đặt tỷ lệ giữ lại nếu chưa
có căn cứ vốn thực tế. Số tiền/lịch cấp chính thức vẫn cần người dùng chốt.

### 4.4. Thực hiện và nộp bằng chứng

Organizer thực hiện task, lập báo cáo kết quả theo từng tiêu chí và đối chiếu
ngân sách thực chi/phần còn lại. Files và nguồn xác nhận gắn với đúng đợt.
Đóng băng một phiên bản manifest; nộp commitment on-chain rồi chờ indexer.
Upload hoặc freeze không đồng nghĩa đã nộp on-chain hay đã được nghiệm thu.

### 4.5. Xét duyệt và phản đối

Resolver đánh giá nội dung, đối chiếu nguồn xác nhận; ghi kết luận và lý do
theo tiêu chí. Phân biệt thiếu thông tin, không đạt, nghi ngờ gian lận và lỗi kỹ thuật.

Đề xuất kết quả: đạt / yêu cầu bổ sung / cần xử lý case. Quyết định đạt được ký
on-chain gắn với phiên bản kế hoạch và hồ sơ. Donor xem bản công khai đã che
thông tin riêng tư, có thể phản đối trong cửa sổ đã quy định.

Chỉ mở cấp tiếp khi có kết luận đạt, cửa sổ phản đối kết thúc và không còn case
chưa giải quyết. Sự im lặng không thay cho quyết định nghiệm thu của resolver.
Deadline 72 giờ/7+7 ngày hiện có là baseline để đánh giá, chưa chứng minh phù hợp
với trao quà; không tự coi chúng là quyết định mới được duyệt cho luồng B.

### 4.6. Cấp tiếp hoặc đóng campaign

Sau nghiệm thu, organizer có quyền nhận đợt tiếp theo, không được trả lại lần
nữa khoản của đợt vừa thực hiện. Đợt cuối cũng phải nghiệm thu và xử lý tiền còn
lại trước khi đánh dấu hoàn tất. Chuyển hết tiền không tự là COMPLETED.

Mô hình khái niệm, chưa chốt enum hoặc API:

```text
Đủ funding → Được phép cấp đợt → Đã cấp, đang thực hiện
→ Đã nộp bằng chứng → Đang xét duyệt/phản đối
   ├─ Đạt và hết cửa sổ → Mở đợt tiếp / chốt hoàn tất
   ├─ Thiếu → Bổ sung theo giới hạn/thời hạn được chốt
   └─ Case → Giữ tiền còn lại → Xử lý / dừng / timeout
```

## 5. Hai kiểu bằng chứng, một workflow

| Kiểm tra | Qua đơn vị | Trao trực tiếp |
|---|---|---|
| Người nhận đúng phạm vi | Kiểm tra đơn vị, người ký và thẩm quyền | Kiểm tra nhóm/điều kiện thụ hưởng theo kế hoạch |
| Mua đúng hàng | Chứng từ mua, số lượng và thành phần quà | Tương tự |
| Bàn giao | Biên bản và xác nhận của bên tiếp nhận | Biên nhận/danh sách giao nhận được kiểm tra; không ép mỗi người có ví |
| Đã tới người cuối cùng | Hồ sơ phân phối tiếp nếu mục tiêu yêu cầu | Xác nhận giao nhận và kiểm tra bổ sung phù hợp |
| Kiểm tra độc lập | Liên hệ đầu mối đơn vị đã được kiểm tra | Liên hệ/kiểm tra mẫu theo phương pháp được chốt; không suy mẫu thành đã kiểm mọi người |

Ảnh/video là nguồn đối chiếu, không tự đủ cho toàn bộ tiêu chí. Biên bản có chữ
ký cũng phải kiểm tra nguồn/thẩm quyền. Lưu dữ liệu cá nhân theo phân quyền;
không đưa danh sách người thụ hưởng hoặc ảnh nhạy cảm lên chain.

## 6. Blockchain trong xác minh

1. Chốt hash kế hoạch, tiêu chí và hồ sơ theo version.
2. Ghi người ký và phạm vi xác nhận/kết luận.
3. Ràng buộc xác nhận với chain/deployment, campaign, đợt và đúng phiên bản;
   ngăn dùng lại cho hồ sơ khác hoặc cấp tiền hai lần.
4. Contract thực thi quyền, ngân sách, thứ tự, trạng thái, cửa sổ phản đối và
   điều kiện cấp tiếp; backend không tự bật quyền tài chính.
5. Event → indexer idempotent → projection/UX, phân biệt request/submitted/
   receipt/confirmation/indexed.

MVP ưu tiên phát triển từ commitment và quyết định ký on-chain sẵn có. Nếu cần
chữ ký ngoài giao dịch cho xác nhận bổ sung, đánh giá chuẩn EIP-712/EAS và thư
viện đã có thay vì tự tạo mật mã. EAS là phương án, chưa chọn dependency.
Xác nhận của đơn vị tiếp nhận không tự thay kết luận của resolver. Chữ ký chứng
minh người phát biểu/nội dung; thông đồng hoặc xác nhận sai vẫn là rủi ro cần đo.
Khi xác nhận bị sửa/thu hồi phải có lịch sử và policy ảnh hưởng lần cấp sắp tới;
không diễn giải thu hồi chữ ký là đảo ngược tiền đã chuyển.

## 7. Tiền, sai lệch và đường thoát

| Tình huống | Đề xuất hành vi |
|---|---|
| Funding thiếu hoặc quá hạn | Rule funding/refund hiện có làm điểm xuất phát, cần kiểm tra tương thích B |
| Chưa đủ điều kiện cấp đầu | Tiền còn escrow; có deadline/đường dừng thay vì giữ vô thời hạn |
| Đã cấp nhưng chưa thực hiện/thiếu bằng chứng | Không cấp tiếp; cho bổ sung/giải trình theo policy, timeout mở dừng quỹ còn lại |
| Có phản đối | Giữ phần chưa cấp; xử lý case có lý do, lịch sử và hạn cuối |
| Chuyển token thất bại | Quyền/counters không bị tiêu thụ; retry an toàn, không đánh dấu đã nhận |
| STOP/timeout | Snapshot phần donor custody thực sự còn trong escrow; claim theo contribution, không hứa thu hồi advance |
| Còn tiền ở ví organizer | Báo cáo nghĩa vụ trả lại và cung cấp đường nộp lại contract; không tính khoản chưa trả thành tiền sẵn sàng refund |
| Một đợt đã nhận toàn bộ goal | Escrow có thể bằng 0; nghiệm thu không còn hạn chế lần cấp tiếp, không có bảo đảm refund từ khoản đã chuyển |

Đề xuất đơn giản: ngân sách đợt là giới hạn cấp; phần chưa dùng trả lại escrow,
không tự chuyển sang đợt khác. Cần chốt trước implementation cách xác định thực
chi, số dư, thời hạn trả và cách hoàn phần thừa ở campaign hoàn thành.

Tiền trả lại trước refund snapshot có thể được đưa vào pool khi chốt. Tiền đến
sau snapshot/claim cần policy riêng; không tăng âm thầm pool và làm quyền nhận
phụ thuộc thứ tự. Không xóa nghĩa vụ chỉ vì token/recipient tạm từ chối transfer.

## 8. Kế hoạch thực hiện theo phụ thuộc

| Bước | Đầu ra | Điều kiện kiểm tra trước bước sau |
|---|---|---|
| 1. Mô tả hai campaign mẫu | Một đợt qua đơn vị, nhiều đợt trao trực tiếp; ngân sách/task/tiêu chí/hồ sơ | Biết rõ nguồn tiền, điểm hoàn thành và ai xác nhận từng tiêu chí |
| 2. Chốt policy xác minh/tài chính | Quyền, cấp đầu/cấp tiếp, bổ sung, case/timeout, dư/return/refund | Mọi outcome có trách nhiệm, quyền và hệ quả tiền rõ |
| 3. Contract và invariant B | Cấp trước theo đợt, quyết định/version, no-bond nếu duyệt, recoverability | Không double payout; donor custody bảo toàn; hồ sơ sai version không mở tiền; timeout/revert có đường thoát |
| 4. Backend/storage/indexer | Hồ sơ theo kiểu trao, checklist, quyết định, projection và replay | Quyền truy cập đúng; hash/revision nhất quán; replay không nhân tiền/quyết định |
| 5. Frontend theo hành trình | Tạo đợt/task, nhận vốn, nộp, xét duyệt, phản đối, đóng/hoàn | Người dùng biết đang chờ ai, ví/hạn/số tiền và trạng thái giao dịch |
| 6. Thực nghiệm và nghiên cứu | Kịch bản/nhãn tham chiếu, trace, kết quả và giới hạn | Tách lỗi kỹ thuật với xét duyệt sai; kết quả tái lập, không mặc định blockchain chứng minh sự thật |

Giữ code/deployment cũ làm baseline. Phiên bản B cần deployment riêng; sửa source
không chuyển campaign/quyền/tiền cũ. Chỉ triển khai sau khi spec và các quyết định
về tiền/quyền được duyệt; chưa chạy test hoặc thay application trong lượt đề xuất.

## 9. Các quyết định còn phải chốt

- Bỏ bond ở bản B; số tiền/lịch cấp mỗi đợt và điều kiện ký cấp đầu.
- Mục tiêu bàn giao hay tới người thụ hưởng cuối; nguồn/thẩm quyền xác nhận và phương pháp kiểm tra.
- Quyền xét duyệt/case, deadline, giới hạn bổ sung, điều kiện khóa/mở lần cấp tiếp.
- Ngân sách thừa/thiếu/thay đổi, hoàn tiền khi thành công còn dư, nộp lại trước/sau refund snapshot và nghĩa vụ không trả lại.

Các đề xuất trên chưa biến thành phê duyệt của người dùng chỉ vì được ghi thành tài liệu.
