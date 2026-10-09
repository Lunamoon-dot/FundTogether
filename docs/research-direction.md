# Định hướng nghiên cứu khoa học — FundTogether

> Ngày ghi nhận: 2026-10-08.
> Cập nhật: 2026-10-09 — loại hình đầu tiên và gói B-D01–B-D10 đã duyệt cho pilot.
> Trạng thái: Định hướng do người dùng yêu cầu lưu và ưu tiên đọc.
> Phạm vi: mục tiêu, nội dung và kết quả nghiên cứu dự kiến; các quyết định nghiệp vụ còn mở.

## 1. Quy tắc sử dụng — đọc trước khi quyết định

Đọc tài liệu này trước khi phân tích, suy luận, đề xuất hoặc chốt quyết định
cho FundTogether, đặc biệt về nghiệp vụ, kiến trúc, dòng tiền, phạm vi phát triển
và kế hoạch nghiên cứu. Sau đó đọc tài liệu chuyên đề và kiểm tra code liên quan.

Mỗi quyết định cần xác định nó phục vụ mục tiêu nghiên cứu nào, ảnh hưởng đến
tiền/quyền/nghĩa vụ ra sao và sẽ được đánh giá bằng bằng chứng nào. Ưu tiên cơ chế
đơn giản có thể kiểm chứng; không mở rộng tính năng chỉ để thêm công nghệ.

Đây là định hướng nghiên cứu, không phải bằng chứng đã hoàn thành khảo sát,
thực nghiệm hoặc nghiệm thu. Tài liệu này không tự thay đổi quyền ký, accounting,
contract đã triển khai hay nghĩa vụ của campaign đang tồn tại. Quyết định mới
trực tiếp từ người dùng được ưu tiên; khi đổi hướng cần cập nhật tài liệu này
và các đặc tả bị ảnh hưởng để tránh mâu thuẫn.

## 2. Tên đề tài dự kiến

Nghiên cứu và xây dựng cơ chế giải ngân theo mốc dựa trên bằng chứng cho hệ thống
gây quỹ từ thiện ứng dụng blockchain.

## 3. Mục tiêu nghiên cứu dự kiến

Đề xuất và đánh giá cơ chế quản lý, giải ngân quỹ từ thiện theo từng mốc thực hiện,
kết hợp thẩm định bằng chứng, giám sát của người đóng góp và xử lý tranh chấp.
Nghiên cứu hướng đến tăng khả năng truy vết dòng tiền, giới hạn rủi ro giải ngân
sai và giảm gánh nặng vốn ban đầu cho tổ chức thực hiện. Xây dựng hệ thống thử
nghiệm FundTogether để kiểm chứng cơ chế đề xuất trong các kịch bản hoạt động
bình thường, thất bại và có tranh chấp.

## 4. Nội dung nghiên cứu dự kiến — bản dùng cho form

1. Khảo sát quy trình gây quỹ từ thiện, nhu cầu sử dụng vốn của tổ chức và các mô hình quản lý, giải ngân quỹ hiện có; xác định những hạn chế và yêu cầu nghiệp vụ của hệ thống.
2. Xác định vai trò, quyền hạn và trách nhiệm của tổ chức, người đóng góp và người xét duyệt; nghiên cứu quy trình xác thực tổ chức, thẩm định chiến dịch và tiêu chí đánh giá bằng chứng hoàn thành từng mốc.
3. Đề xuất, thiết kế và điều chỉnh cơ chế quản lý, giải ngân quỹ theo kết quả khảo sát và thực nghiệm, bao gồm lưu giữ quỹ bằng hợp đồng thông minh, giải ngân theo mốc, tiếp nhận và xử lý phản đối, xử lý quá hạn và hoàn trả phần quỹ chưa giải ngân.
4. Phân tích, so sánh các phương án giải ngân theo mốc; đánh giá sự đánh đổi giữa nhu cầu vốn ban đầu của tổ chức, rủi ro đối với quỹ và chi phí xét duyệt, từ đó lựa chọn phương án phù hợp với phạm vi nghiên cứu.
5. Xây dựng hệ thống thử nghiệm FundTogether tích hợp giao diện người dùng, backend, lưu trữ bằng chứng, hợp đồng thông minh và đồng bộ dữ liệu blockchain; hỗ trợ truy vết dòng tiền và theo dõi tiến trình xử lý chiến dịch.
6. Xây dựng bộ kịch bản thử nghiệm có kiểm soát và bộ hồ sơ bằng chứng có nhãn đánh giá tham chiếu; thực nghiệm, so sánh cơ chế đề xuất với mô hình tham chiếu theo các tiêu chí: tính đúng đắn của hạch toán quỹ, sai lệch trong quyết định xét duyệt, thời gian xử lý, chi phí giao dịch và khả năng phục hồi khi xảy ra lỗi.

## 5. Kết quả nghiên cứu dự kiến

- Bộ đặc tả nghiệp vụ, mô hình trạng thái và quy tắc tài chính của cơ chế đề xuất.
- Hệ thống thử nghiệm FundTogether hỗ trợ hành trình tạo chiến dịch, đóng góp, nộp và xét duyệt bằng chứng, giải ngân, xử lý tranh chấp và hoàn tiền.
- Bộ kịch bản, dữ liệu thử nghiệm và công cụ phục vụ tái lập kết quả.
- Báo cáo đánh giá, so sánh với mô hình tham chiếu, chỉ ra điều kiện áp dụng, các đánh đổi và giới hạn của cơ chế.
- Báo cáo nghiên cứu khoa học và tài liệu hướng dẫn triển khai, sử dụng hệ thống.

## 6. Phạm vi linh hoạt và vấn đề cần quyết định

Ba trục của đề tài là gây quỹ từ thiện, blockchain và giải ngân theo mốc dựa
trên bằng chứng. Có thể điều chỉnh nghiệp vụ trong phạm vi đó theo khảo sát và
thực nghiệm; thay đổi các trục này cần xem xét lại tên và đề cương.

| Vấn đề | Hướng thảo luận và giới hạn hiện tại |
|---|---|
| Bond | B-D02 đã duyệt cho pilot B: không bond; baseline/deployment A có bond giữ nguyên nghĩa vụ. B có deployment local và hành trình tự động; nghiệm thu người dùng còn thiếu. |
| Xác thực tổ chức | Nghiên cứu xác thực tổ chức trước khi tham gia. Phải phân biệt danh tính/thẩm quyền với thẩm định campaign và nghiệm thu từng hoạt động; xác thực không tự bảo đảm sử dụng tiền đúng. |
| Dòng vốn | B-D01–B-D10 đã duyệt ngày 2026-10-09: cấp đúng budget/đợt sau đủ goal và eligibility; nghiệm thu trước cấp tiếp; các hạn và return/refund theo spec B. Contract/BE/FE B có code/test và G1/G2/failure chạy tự động; MetaMask/người dùng chưa nghiệm thu. Code A vẫn giải ngân sau nghiệm thu. |
| Xét duyệt | Người dùng xác định nghiệp vụ xác minh và workflow của nó là trọng tâm. Có thể điều chỉnh số người, vai trò và trách nhiệm; cần phân biệt tiếp nhận hồ sơ với đánh giá đạt tiêu chí, không coi donor im lặng là bằng chứng hoạt động đã hoàn thành. |
| Bằng chứng | Có thể điều chỉnh loại tài liệu và cách kiểm tra. Hash xác nhận tính toàn vẹn nội dung, không chứng minh sự thật ngoài đời. Nhãn tham chiếu cần có nguồn và tiêu chí rõ ràng. |
| Phản đối/hoàn tiền | Có thể điều chỉnh điều kiện, thời hạn và cách xử lý; phải chốt hệ quả tài chính. Phần đã giải ngân không tự được thu hồi; không hứa hoàn toàn bộ tiền khi chỉ còn một phần trong escrow. |
| QV/MDP và mở rộng | Là phương án nghiên cứu bổ sung nếu có câu hỏi, baseline và tiêu chí đo phù hợp; không phải cam kết triển khai hay điều kiện bắt buộc của đề tài. |

### 6.1. Hướng B đã được người dùng lựa chọn — 2026-10-08

Người dùng lựa chọn cấp vốn theo từng đợt vì tổ chức có thể dùng tiền quyên góp
để thực hiện hoạt động, giảm nhu cầu ứng vốn so với giải ngân sau nghiệm thu.
Người dùng chấp nhận hướng này có rủi ro cao hơn và muốn tập trung vào nghiệp vụ
xác minh cùng workflow. Đây là lựa chọn hướng thiết kế, chưa phải đặc tả tài chính
đủ để triển khai hoặc bằng chứng phương án đã tối ưu.

```text
Xác thực tổ chức và thẩm định kế hoạch
→ Cấp tiền đợt đầu theo điều kiện được chốt
→ Tổ chức thực hiện và nộp bằng chứng
→ Nghiệm thu đợt vừa thực hiện
→ Đủ điều kiện mới cấp tiền đợt tiếp theo
→ Nghiệm thu đợt cuối và đóng campaign
```

Phải phân biệt bằng chứng kế hoạch trước cấp vốn với bằng chứng kết quả sau thực
hiện. Nghiệm thu không tự chuyển lại khoản đã cấp. Tiền đã chuyển khỏi escrow
không tự thu hồi được; khi dừng, phần hoàn tiền được bảo đảm chỉ từ quỹ còn giữ,
cộng khoản tổ chức thực sự trả lại nếu có đường nộp lại được đặc tả sau này.
Một giới hạn trên mỗi đợt chưa bảo đảm giới hạn tổng tổn thất nếu nghiệm thu sai
lặp lại; chính chất lượng xác minh là giả định phải đánh giá.

Còn cần chốt: tiêu chí/căn cứ và người quyết định lần cấp đầu; số tiền và lịch
cấp; người nghiệm thu, trách nhiệm và xung đột lợi ích; quyền phản đối và khi
nào mở cấp tiếp; hồ sơ thiếu/sai, timeout; ngân sách còn dư, khoản trả lại và
tiêu chí hoàn tất. Việc chọn B không tự chốt bỏ bond, deadline hoặc quyền ký.

### 6.2. Phạm vi đầu tiên và ưu tiên xác minh — 2026-10-08

Người dùng chọn hoạt động mua và trao quà làm trường hợp đầu tiên vì số task ít
và workflow tương đối đơn giản. Đồng ý hướng xác thực tổ chức, thẩm định kế
hoạch và nghiệm thu từng đợt cho MVP; ưu tiên tập trung vào tiêu chí bằng chứng
và workflow xác minh, đồng thời muốn ứng dụng công nghệ blockchain vào xác minh.

Đây là yêu cầu định hướng, chưa lựa chọn EAS, oracle, ZK, Merkle hay một quy tắc
chữ ký/quorum mới. Khi đề xuất cần chỉ ra blockchain kiểm chứng dữ liệu, người
xác nhận và điều kiện giải ngân nào; nguồn thông tin về sự kiện ngoài đời vẫn
phải được kiểm tra. Đợt đầu có thẩm định kế hoạch; đợt cuối vẫn cần nghiệm thu
kết quả dù không còn lần cấp tiền tiếp theo. Không diễn giải lòng tin ở hai
điểm này thành việc bỏ kiểm tra hoặc đã chứng minh sự thật.

### 6.3. Loại hình campaign — quyết định người dùng ngày 2026-10-09

FundTogether là hệ thống gây quỹ từ thiện. Mua và trao quà là một loại hình
campaign, được chọn làm phạm vi MVP/nghiên cứu đầu tiên; không định nghĩa toàn
bộ hệ thống chỉ dành cho trao quà. Các loại hình khác có thể được xem xét sau
khi có yêu cầu và quy tắc nghiệp vụ cụ thể.

Phân biệt ba thuộc tính độc lập:

- Loại hình hoạt động: hiện là mua và trao quà.
- Cách trao/tiếp nhận của loại này: trực tiếp cho cá nhân hoặc qua đơn vị.
- Kế hoạch thực hiện/cấp vốn: một đợt hoặc nhiều đợt có ý nghĩa thực tế.

Khung chung gồm tổ chức, campaign, ngân sách, kế hoạch cấp vốn, hồ sơ bằng
chứng, quyết định xét duyệt, phản đối, hạch toán và hoàn tiền. Tiêu chí hoàn
thành, hồ sơ phải nộp và cách xác minh cần gắn với loại hình hoạt động và phiên
bản được duyệt. Không hard-code yêu cầu suất quà/biên bản bàn giao vào toàn bộ
campaign hoặc các quy tắc escrow chung.

Đây là ranh giới thiết kế; chưa triển khai loại mới, generic workflow engine
hay nhiều contract theo loại. Khi thêm loại hình, phải đánh giá khung hiện có
có phù hợp và chốt riêng các thay đổi ảnh hưởng quyền, dòng tiền hoặc trạng
thái. Không mặc định mọi loại từ thiện dùng cùng lịch cấp tiền hoặc bằng chứng.

### 6.4. Gói B-D01–B-D10 được duyệt — 2026-10-09

Người dùng đồng ý bộ [đặc tả B](./workflow-b-spec.md) và
[quy tắc tài chính B](./workflow-b-financial-rules.md), yêu cầu tiếp tục gói
B-D01–B-D10. Đây là phê duyệt rule cho local/pilot, thay các chi tiết còn mở
của hướng B ghi ở 6.1; không phải chứng minh phù hợp thực tế hoặc ready tiền thật.

Đã chốt: một resolver; staff xác thực tổ chức; no-bond, goal=sum budgets;
eligibility đầu, advance một lần/đợt; kết luận theo criterion; tối đa ba version;
deadline/hard stop hữu hạn; một case/version, không appeal; unused phải return
thực nhận; base refund cố định + supplement tích lũy cho return muộn; không
expiry/sweep; nghiệm thu cuối và refund outcome tách nhau. Xem spec cho giá trị
thời hạn và rủi ro availability, reviewer sai/mất ví/case cuối đã được trình.

GOAL.md yêu cầu review kế hoạch code sau phê duyệt spec; người dùng đã duyệt
kế hoạch bằng “tôi duyệt mà”. Triển khai trong chat
hiện tại, môi trường B riêng; không đổi obligations, account hoặc dữ liệu A.
Hash/chữ ký vẫn không chứng minh sự thật ngoài đời. Khảo sát, dữ liệu nhãn độc
lập và nghiệm thu MetaMask vẫn cần thực hiện. Test contract/integration đã có
bằng chứng theo [acceptance](./workflow-b-acceptance.md), không thay khảo sát.

## 7. Cách chốt và đánh giá một thay đổi

1. Xác định vấn đề thực tế, nhóm người dùng và giả định cần kiểm chứng.
2. Đối chiếu baseline hiện có; nêu phương án, quyền quyết định và tác động đến dòng tiền.
3. Chốt những quyết định ảnh hưởng quyền, tiền và nghĩa vụ trước khi triển khai.
4. Chọn mô hình tham chiếu, kịch bản, chỉ số và cách thu thập dữ liệu trước khi thực nghiệm.
5. Ghi kết quả, điều kiện áp dụng và giới hạn; không đồng nhất test kỹ thuật với sự phù hợp ngoài đời.

Hướng nghiên cứu, nội dung form, lựa chọn luồng B và đặc tả pilot đã được lưu/phê
duyệt. B đã triển khai local và có so sánh contract A/B trên giả định chung;
khảo sát thực tế, dataset nhãn độc lập và nghiệm thu người dùng vẫn cần thực hiện.

## 8. Tài liệu cần đối chiếu sau khi đọc định hướng

- [Đề xuất workflow trao quà](./proposed-gift-workflow.md): bản thảo ngày 2026-10-09 về hướng B, kiểu bàn giao, tiêu chí xác minh, vai trò blockchain và thứ tự triển khai; chưa là đặc tả đã duyệt.
- [Đặc tả pilot B](./workflow-b-spec.md), [financial rules B](./workflow-b-financial-rules.md) và [kế hoạch code](./workflow-b-code-plan.md): gói quyết định đã duyệt và kế hoạch triển khai để review.
- [Kiểm chứng nghiệp vụ và củng cố MVP](./business-validation-and-mvp-hardening.md): câu hỏi B01–B08 và tiêu chí chuyển giai đoạn.
- [Tổng quan hiện tại](./PROJECT_OVERVIEW.md) và [tiến độ](./PROJECT_PROGRESS.md): implementation và bằng chứng kiểm tra.
- [Quy tắc tài chính](./financial-rules.md), [protocol](./protocol-spec.md), [state machine](./state-machine.md) và [MVP milestone](./mvp-milestone-completion.md): baseline tiền, quyền và trạng thái.
- [v0.2](../v0.2/README.md): tài liệu tham khảo và giả thuyết; cần đối chiếu với quyết định mới và code.
