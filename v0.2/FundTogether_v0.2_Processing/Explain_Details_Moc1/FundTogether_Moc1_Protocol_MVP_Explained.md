# FundTogether — Mốc 1: Protocol & MVP Definition

> Tài liệu giải thích đầy đủ các mục 1.1–1.10 trong Mốc 1 của Development Process. Đây là tài liệu học và thảo luận; các phương án được ghi là ví dụ/đề xuất chưa phải quyết định được team phê duyệt.

## Mục lục

- [1.1 — Actor Model](#moc-1-1)
- [1.2 — On-chain và Off-chain](#moc-1-2)
- [1.3 — State Machine](#moc-1-3)
- [1.4 — Bond Rule](#moc-1-4)
- [1.5 — Refund Rule](#moc-1-5)
- [1.6 — Evidence Model](#moc-1-6)
- [1.7 — Challenge Model](#moc-1-7)
- [1.8 — Protocol Invariants](#moc-1-8)
- [1.9 — Output của Mốc 1](#moc-1-9)
- [1.10 — Các quyết định cần chốt trước khi implement](#moc-1-10)

Mỗi phần bắt đầu bằng một mục trong Process. Ví dụ số tiền, state, endpoint, tên field và lựa chọn chưa được đánh dấu Approved chỉ dùng để minh họa; đối chiếu Protocol Specification khi team chốt rule.

## Cập nhật thiết kế ngày 2026-10-03

Tham chiếu [Kiểm tra evidence và xử lý tranh chấp theo tầng](../../FundTogether_Verification_and_Dispute_Design_2026-10-03.md).
Hướng mục tiêu tách admission, donor review, organizer response, re-verification
và phân xử cuối cùng. Resolver không cần kiểm tra mọi milestone. Nội dung học/ví dụ
bên dưới vẫn cần đối chiếu bản cập nhật. Người dùng chọn committee 2/3 cho MVP
trong [Dispute Policy](../../FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md).
Admin cấp/thu hồi quyền verifier và phân công hồ sơ pending đã được chốt và triển khai; timeout, appeal, slash và committee vẫn chưa hoàn tất.
> Cập nhật tiếp: quyền/giới hạn verifier đã được chốt trong [Verifier Specification v0.1](../../FundTogether_Verifier_Specification_v0.1.md).
> Admission gate/versioning đã triển khai: deployer admin cấp/thu hồi role và
> phân công lại hồ sơ pending. Timeout, appeal và slash vẫn mở; committee chưa có.

<a id="moc-1-1"></a>
## 1.1 — Actor Model

> Tài liệu học và thảo luận thiết kế: giải thích các vai trò, quyền, nơi triển khai và cách kết nối Web2 với blockchain.
>
> **Trạng thái:** Những quy tắc được ghi là ví dụ hoặc đề xuất chưa phải quyết định chính thức của protocol. Tài liệu này không thay thế Protocol Specification.

### 1. Actor Model là gì?

**Actor Model trong mục 1.1 là mô hình các bên tham gia nghiệp vụ: ai tham gia hệ thống, mỗi bên được làm gì, và hệ thống dựa vào đâu để cho phép hoặc từ chối hành động đó.** Ở đây không nói đến mô hình lập trình đồng thời cũng có tên “actor model”.

Đây là bước thiết kế quyền và trách nhiệm trước khi viết code.

Ví dụ câu hỏi mà mô hình này phải trả lời:

> Một người đăng nhập website rồi tự nhận mình là Organizer thì có được rút tiền của campaign không? Nếu không, thành phần nào ngăn việc đó?

Với mỗi actor, Process yêu cầu xác định:

- Được làm gì?
- Không được làm gì?
- Hành động nào cần ví?
- Hành động nào chỉ cần tài khoản Web2?
- Hành động nào cần quyền được contract kiểm tra on-chain?

Ngoài ra, cần gắn quyền với **đối tượng cụ thể** và **điều kiện cụ thể**. Ví dụ: là Organizer của campaign A không có nghĩa được sửa campaign B; là Organizer đúng campaign cũng không có nghĩa được giải ngân ở mọi trạng thái.

### 2. Ví dụ xuyên suốt

Giả sử có campaign **“Lắp hệ thống lọc nước cho trường A”**, mục tiêu huy động **10.000 MockUSDC**. MockUSDC trong ví dụ là token thử nghiệm, không phải tiền thật.

Campaign gồm ba milestone — các giai đoạn có ngân sách và kết quả cần đạt:

| Milestone | Công việc | Ngân sách minh họa |
|---|---|---:|
| M1 | Khảo sát, chuẩn bị địa điểm | 2.000 |
| M2 | Mua và lắp thiết bị | 5.000 |
| M3 | Kiểm tra, bàn giao | 3.000 |

Các actor:

| Actor | Ai trong ví dụ? | Trách nhiệm chính |
|---|---|---|
| Organizer | Lan, đại diện nhóm thiện nguyện | Tổ chức và thực hiện campaign |
| Donor | Minh, người góp 100 MockUSDC | Đóng góp, theo dõi việc sử dụng tiền |
| Beneficiary | Trường A và học sinh | Nhận lợi ích từ hệ thống lọc nước |
| Vendor | Công ty B bán và lắp thiết bị | Cung cấp hàng hóa, dịch vụ, hóa đơn |
| Verifier | Hương, người được giao kiểm tra | Đưa ra kết quả kiểm tra bằng chứng |
| Resolver | Một bên được chỉ định | Giải quyết tranh chấp |
| Protocol Admin | Người hoặc nhóm quản trị protocol | Thực hiện quyền vận hành được quy định |

**Actor là vai trò trong quy trình, không nhất thiết là một loại tài khoản riêng.**

Lan có thể là Organizer của campaign A và Donor của campaign B. Trường A có thể chỉ nhận thiết bị ngoài đời, không cần tài khoản website.

Bảy actor không đồng nghĩa phải tạo bảy loại tài khoản, bảy bảng dữ liệu hay bảy dashboard ngay.

### 3. Organizer — người tổ chức

#### 3.1 Trách nhiệm

Lan lập kế hoạch, tổ chức mua và lắp thiết bị, báo cáo việc thực hiện, nộp bằng chứng.

Các hành động Process nêu:

- Tạo campaign.
- Khóa bond — khoản tài sản bảo đảm.
- Nộp evidence — bằng chứng.
- Yêu cầu milestone settlement — xử lý kết thúc milestone theo quy tắc protocol.

Settlement không nên được mặc định luôn là thời điểm chuyển toàn bộ tiền cho Organizer. Ý nghĩa tài chính cụ thể phụ thuộc lựa chọn giải ngân trước, sau hay có kiểm soát; phần đó cần chốt trong protocol.

#### 3.2 Tạo campaign thực tế gồm những phần nào?

“Tạo campaign” có thể bao gồm cả Web2 và blockchain:

| Công việc | Thực hiện ở đâu? | Hình thức thực tế |
|---|---|---|
| Điền tên, mô tả, giới thiệu trường | Form trên website | Nội dung nhập trong trình duyệt |
| Lưu bản nháp | Backend và database | Một bản ghi chưa công bố |
| Upload ảnh trường | Storage | File ảnh được lưu |
| Đăng ký thông số tài chính | Smart contract | Trạng thái on-chain |
| Khóa bond | Campaign contract và token contract theo thiết kế | Giao dịch chuyển/khóa token |

Đây là cách phân chia minh họa. Thời điểm đăng ký campaign và khóa bond chưa được chốt chỉ bằng bảng này.

#### 3.3 Quyền phải gắn với campaign

Hệ thống phải biết:

```text
Lan là Organizer của campaign nào?
Lan đang dùng ví nào?
Ví đó có đúng là ví Organizer được campaign ghi nhận không?
Campaign hiện có cho phép hành động này không?
```

Nhãn “Organizer” trong hồ sơ người dùng không đủ để cấp quyền trên mọi campaign.

#### 3.4 Các giới hạn cần ghi rõ

Các giới hạn đề xuất để đưa vào thảo luận protocol:

- Không tự kết luận bằng chứng của mình đã được xác minh độc lập.
- Không lấy bond về trước khi đủ điều kiện.
- Không giải ngân vượt ngân sách hoặc bỏ qua thứ tự milestone.
- Không tùy ý thay đổi thông số tài chính sau khi donor đã đóng góp.

Nếu cho phép sửa thông số trong một số trường hợp, phải quy định ai cho phép và ảnh hưởng đến donor thế nào. Không để nút “Edit” trên UI tự quyết định quy tắc tài chính.

### 4. Donor — người đóng góp

#### 4.1 Quyền có thể phát sinh từ khoản đóng góp

Minh góp 100 MockUSDC vào campaign A. Một thiết kế đơn giản là contract ghi nhận:

```text
Campaign A:
    Ví Minh đã đóng góp: 100 MockUSDC
```

Từ dữ liệu đó, contract có thể xác định ví Minh là donor của campaign A. Không nhất thiết phải có bước admin cấp `DONOR_ROLE`.

#### 4.2 Tách từng hành động

| Hành động | Điều kiện minh họa |
|---|---|
| Xem campaign | Có thể công khai, không cần đăng nhập |
| Xem evidence công khai | Có thể không cần ví |
| Donate | Cần ví thực hiện giao dịch |
| Challenge | Đủ điều kiện người challenge và còn thời hạn |
| Claim refund | Có quyền nhận refund, còn số được nhận và trạng thái cho phép |

**Ai được challenge vẫn là câu hỏi chưa chốt trong Process.** Nếu chọn “chỉ donor của campaign”, phải kiểm tra khoản đóng góp ở đúng campaign đó.

Minh góp vào A không tự động có quyền challenge B.

#### 4.3 Donor không phải lúc nào cũng được lấy lại toàn bộ tiền

Quyền nhận refund phụ thuộc trạng thái campaign và công thức hoàn tiền ở mục 1.5.

- Actor Model xác định **ai được yêu cầu**.
- Financial rules xác định **được nhận bao nhiêu, khi nào và từ nguồn tiền nào**.

Không nên suy ra “đã donate” đồng nghĩa “được rút lại bất cứ lúc nào”.

### 5. Beneficiary — người thụ hưởng

Trong ví dụ, học sinh được sử dụng nước sạch. Họ nhận **lợi ích từ thiện**, không nhất thiết nhận token.

Một phương án MVP:

```text
Trường A ký biên bản bàn giao ngoài đời
    ↓
Lan tải bản scan lên hệ thống
    ↓
Biên bản trở thành một phần evidence
    ↓
Người kiểm tra đánh giá biên bản
```

Trong luồng này, trường A không cần ví hoặc tài khoản website.

Nếu muốn đại diện trường trực tiếp xác nhận trên website, cần thiết kế thêm:

- Tài khoản nào đại diện cho trường?
- Ai xác minh người đó thực sự đại diện cho trường?
- Xác nhận được lưu trong database hay có chữ ký ví?
- Một lần xác nhận có ảnh hưởng gì đến settlement?

Việc một tài khoản hoặc một ví bấm “Đã nhận” chỉ có ý nghĩa khi đã làm rõ danh tính, phạm vi xác nhận và hiệu lực của thao tác đó.

### 6. Vendor — nhà cung cấp

Công ty B bán máy lọc nước, thực hiện lắp đặt và cung cấp hóa đơn.

Trong MVP, Vendor có thể chỉ là bên cung cấp chứng từ:

```text
Công ty B phát hành hóa đơn
    ↓
Lan nhận hóa đơn
    ↓
Lan nộp hóa đơn làm evidence
```

Nếu quy trình không yêu cầu Vendor thao tác trực tiếp, chưa cần xây cổng đăng nhập riêng cho họ.

**Hóa đơn là một nguồn bằng chứng; tên công ty trên hóa đơn không tự chứng minh nội dung đúng.** Threat Model đã xét khả năng Organizer và Vendor thông đồng.

Do đó, quyền cung cấp chứng từ không nên bị hiểu thành quyền tự xác nhận rằng chứng từ đủ để giải ngân.

Việc trả tiền trực tiếp cho Vendor hay qua Organizer là quyết định của luồng giải ngân, chưa được chốt chỉ bằng việc liệt kê actor Vendor.

### 7. Verifier — người kiểm tra bằng chứng

#### 7.1 Công việc thực tế

Ví dụ Hương kiểm tra evidence của M2:

1. Mở bộ hồ sơ của milestone.
2. Đọc hóa đơn.
3. Đối chiếu model máy trên hóa đơn với ảnh thiết bị.
4. Kiểm tra biên bản lắp đặt.
5. Ghi kết luận với phạm vi rõ ràng.

Kết luận có thể là:

> Đã đối chiếu model thiết bị với hóa đơn; chưa đủ dữ liệu để xác minh giá mua thực tế.

Đây chính xác hơn một nhãn “Verified” không nói đã kiểm tra điều gì.

#### 7.2 Attestation là gì?

Attestation là một tuyên bố xác nhận, cần làm rõ:

- Ai xác nhận?
- Xác nhận điều gì?
- Cho bằng chứng hoặc phiên bản bằng chứng nào?
- Vào lúc nào?
- Có giới hạn hoặc kết luận chưa xác định nào không?

Attestation không nhất thiết có nghĩa toàn bộ campaign đúng hoặc mọi sự kiện ngoài đời đã được chứng minh.

#### 7.3 Được lưu ở đâu?

Các phương án thiết kế gồm:

| Phương án | Hình thức |
|---|---|
| Off-chain | Tài khoản Verifier gửi kết quả qua backend, lưu trong database |
| Thông điệp có chữ ký ví | Verifier ký dữ liệu; hệ thống kiểm tra chữ ký theo thiết kế |
| Giao dịch on-chain | Verifier gửi giao dịch ghi xác nhận vào contract |

**Mục 1.1 chưa chọn phương án.** Nếu kết quả Verifier quyết định trực tiếp settlement, phải quy định cách contract nhận và xác thực kết quả.

Ghi `approved = true` trong database không khiến contract tự biết hoặc tự tin kết quả đó.

### 8. Resolver — người giải quyết tranh chấp

#### 8.1 Khác Verifier như thế nào?

- **Verifier:** kiểm tra và đưa ra nhận định về bằng chứng.
- **Resolver:** đưa ra quyết định khi xuất hiện tranh chấp theo thẩm quyền protocol cấp.

Ví dụ Minh thấy hóa đơn ghi hai thiết bị nhưng ảnh chỉ có một:

```text
Minh mở challenge
    ↓
Lan cung cấp giải trình
    ↓
Hương cung cấp kết quả kiểm tra
    ↓
Resolver xem hồ sơ và ra quyết định
    ↓
Contract áp dụng hệ quả được protocol quy định
```

Resolver có thể kết luận challenge được chấp nhận hoặc bị bác bỏ. Hủy campaign, slash bond hay refund sau đó như thế nào phải theo quy tắc đã chốt.

#### 8.2 Giới hạn quyền

Quyền giải quyết tranh chấp không nên biến thành quyền nhập một địa chỉ bất kỳ rồi chuyển tiền của campaign đến đó.

Đặc tả cần ghi rõ:

- Resolver nào có quyền với tranh chấp nào?
- Được chọn những kết quả nào?
- Có thời hạn xử lý không?
- Nếu không xử lý thì có đường thoát nào?
- Có được đổi Resolver khi tranh chấp đang diễn ra không?

MVP có thể dùng một bên tin cậy làm Resolver như Process đề xuất. Nếu cùng một người vừa làm Verifier vừa làm Resolver, vẫn cần ghi nhận đó là hai quyền khác nhau và làm rõ xung đột lợi ích.

### 9. Protocol Admin — người quản trị protocol

#### 9.1 Không mặc định có toàn quyền

Admin cần được định nghĩa bằng danh sách quyền cụ thể:

```text
Có được tạm dừng chức năng nào?
Ai được tiếp tục hoạt động sau khi tạm dừng?
Có được cấp hoặc thu hồi quyền Verifier không?
Có được thay Resolver không?
Thay đổi áp dụng cho campaign đang chạy hay chỉ campaign mới?
```

Đây là các câu hỏi thiết kế, không phải quyền tự có vì mang tên Admin.

Tài liệu Tech Stack định hướng admin có thể tạm dừng khi cần và không nên có quyền tùy ý rút tiền người dùng.

#### 9.2 Admin website và admin protocol

| Vai trò | Nơi thực hiện quyền | Ví dụ phạm vi |
|---|---|---|
| Admin website | Backend và dữ liệu ứng dụng | Xử lý nội dung hoặc tài khoản theo quyền được cấp |
| Admin protocol | Smart contract | Gọi chức năng quản trị mà contract cho phép |

Một người có thể giữ cả hai, nhưng đổi tài khoản thành admin trong database không tự cấp quyền quản trị contract.

Nếu thiết kế cho phép nâng cấp contract hoặc thay các quyền quan trọng, cần đánh giá cả khả năng thay đổi gián tiếp quy tắc tài chính; không chỉ nhìn vào việc có hàm rút tiền trực tiếp hay không.

### 10. Tài khoản Web2, ví và quyền on-chain

#### 10.1 Bốn khái niệm cần tách

| Khái niệm | Ý nghĩa | Hình thức thực tế |
|---|---|---|
| Web2 account | Danh tính trong ứng dụng | Bản ghi người dùng trong database |
| Phiên đăng nhập | Cách backend nhận biết yêu cầu thuộc người đã đăng nhập | Ví dụ cookie phiên trình duyệt gửi kèm |
| Wallet | Công cụ quản lý tài khoản blockchain và ký | Ứng dụng ví hoặc ví trình duyệt |
| Quyền on-chain | Điều kiện contract kiểm tra trước khi cho thực hiện thao tác | Địa chỉ được chỉ định, bảng quyền hoặc dữ liệu trạng thái |

Ví dụ dữ liệu minh họa:

```text
Trong database:
    User: Lan
    Ví đã chứng minh quyền kiểm soát: W_LAN

Trong campaign contract:
    Organizer: W_LAN
```

`W_LAN` chỉ là ký hiệu minh họa, không phải địa chỉ ví thật.

Backend dùng tài khoản và liên kết ví để xử lý thao tác Web2. Contract dùng điều kiện của chính nó để quyết định thao tác on-chain.

#### 10.2 Contract kiểm tra người gọi bằng cách nào?

Trong Solidity, `msg.sender` là địa chỉ gọi ở lời gọi hiện tại. Với luồng ví gọi trực tiếp campaign contract, contract có thể so sánh địa chỉ này với organizer đã lưu.

Nếu có contract trung gian, người gọi hiện tại có thể là contract đó. Không mặc định `msg.sender` luôn là ví người dùng cuối. [Tài liệu Solidity](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties).

Logic minh họa, không phải code hiện có của dự án:

```text
Nếu địa chỉ gọi khác Organizer của campaign:
    Từ chối

Nếu milestone không ở trạng thái cho phép nộp evidence:
    Từ chối

Nếu các điều kiện hợp lệ:
    Ghi nhận evidence commitment
```

**Có quyền đúng vẫn chưa đủ; phải đúng đối tượng và đúng trạng thái.**

#### 10.3 Backend biết người dùng kiểm soát ví bằng cách nào?

Không thể chỉ tin địa chỉ người dùng nhập, vì ai cũng có thể sao chép địa chỉ công khai của Lan.

Một cách là SIWE — Sign-In with Ethereum:

1. Backend phát thông điệp đăng nhập có mã dùng một lần, gọi là nonce.
2. Người dùng ký bằng ví.
3. Backend xác minh chữ ký, domain, nonce, thời hạn và các trường cần thiết.
4. Nếu hợp lệ, backend thiết lập phiên gắn với địa chỉ đó.

Đây là ký thông điệp đăng nhập, không phải giao dịch donate. Chữ ký chứng minh quyền kiểm soát ví theo cơ chế xác thực, không tự chứng minh danh tính ngoài đời. [Chuẩn SIWE](https://eips.ethereum.org/EIPS/eip-4361).

Nếu liên kết ví vào tài khoản Web2 có sẵn, backend còn cần kiểm tra phiên của tài khoản đang yêu cầu liên kết.

**Connect wallet không tự đồng nghĩa đã đăng nhập backend.** Kết nối ví cho phép ứng dụng tương tác với ví; phiên đăng nhập cần luồng xác thực tương ứng.

### 11. Luồng thực tế: Organizer nộp evidence

#### 11.1 Giả định cho luồng này

- Lan là Organizer của campaign đang xét.
- M2 đang cho phép nộp evidence theo state machine.
- File được lưu off-chain.
- Lan trực tiếp dùng ví gửi giao dịch commit hash lên contract.
- Database lưu dữ liệu ứng dụng và trạng thái được đồng bộ từ blockchain.

Đây là mô hình minh họa phù hợp hướng đi trong Process, không khẳng định đã có implementation.

#### 11.2 Bước 1 — Lan mở trang nộp evidence

**Ở đâu:** trình duyệt, trong phần frontend của ứng dụng.

Frontend hiển thị campaign, milestone và nút upload. Người khác có thể không thấy nút, nhưng việc ẩn nút chỉ phục vụ trải nghiệm.

Một người vẫn có thể tự gửi yêu cầu đến backend mà không bấm nút. Vì vậy, quyền phải được kiểm tra ở backend và contract cho từng phần việc tương ứng.

#### 11.3 Bước 2 — Frontend yêu cầu backend cho phép upload

**Backend là gì:** chương trình nhận và xử lý yêu cầu của ứng dụng. Tech Stack đề xuất dùng NestJS để xây phần này.

**Nơi chạy:** khi phát triển có thể chạy trên máy bạn; khi triển khai chạy trên máy chủ. Bạn viết code trong editor, khởi chạy chương trình bằng terminal và xem thông báo xử lý/lỗi trong log.

Backend kiểm tra:

```text
Đã đăng nhập chưa?
Tài khoản đang yêu cầu là ai?
Có quyền nộp evidence cho campaign này không?
Milestone có thuộc đúng campaign không?
```

Danh tính phải lấy từ phiên đã xác thực. Không tin trường kiểu `userId = Lan` do trình duyệt tự gửi.

Nguồn dữ liệu dùng để xác định quyền Organizer phải được thiết kế rõ. Nếu dùng bản sao trạng thái on-chain trong database, cần tính đến độ trễ đồng bộ; contract vẫn kiểm tra quyền khi giao dịch commit được thực thi.

#### 11.4 Bước 3 — Upload file và lưu metadata

| Thành phần | Chứa gì? | Ví dụ |
|---|---|---|
| Storage | Nội dung file thực tế | PDF hóa đơn, ảnh thiết bị |
| Database | Metadata, tức thông tin mô tả/quản lý file | Người nộp, milestone, vị trí lưu, trạng thái |
| Hash | Giá trị được tính từ nội dung | Giá trị dùng để đối chiếu tính toàn vẹn |

Backend có thể cấp URL upload có thời hạn và phạm vi phù hợp để trình duyệt tải file trực tiếp lên storage. URL này là quyền upload được giới hạn, không phải toàn quyền truy cập kho file.

Hệ thống cần bảo đảm hash gắn với đúng nội dung được lưu. Chi tiết tính hash và khóa phiên bản file thuộc Evidence Pipeline.

Sau bước này, trạng thái có thể là:

```text
File đã upload
Chưa commit on-chain
```

Hash giúp đối chiếu nội dung, không tự chứng minh hóa đơn đúng ngoài đời hoặc bảo đảm file sẽ luôn truy cập được.

#### 11.5 Bước 4 — Ví Lan gửi giao dịch commit hash

Frontend yêu cầu ví Lan ký và gửi giao dịch. Ví gửi giao dịch qua kết nối tới node/RPC — điểm ứng dụng dùng để giao tiếp với mạng blockchain.

Contract kiểm tra lại quyền người gọi và trạng thái milestone. Nó không dựa vào việc frontend từng hiện nút hay backend từng cho upload.

Nếu Lan upload xong nhưng từ chối ký, file vẫn có thể tồn tại trong storage, còn trạng thái on-chain chưa thay đổi.

#### 11.6 Bước 5 — Giao dịch thực thi và dữ liệu được đồng bộ

Cần phân biệt các mốc:

```text
Ví chấp nhận ký/gửi
    ↓
Có transaction hash — mã nhận diện giao dịch
    ↓
Giao dịch được đưa vào block
    ↓
Kiểm tra receipt để biết thực thi thành công hay thất bại
    ↓
Đạt chính sách xác nhận của ứng dụng
    ↓
Indexer cập nhật database
    ↓
Frontend hiển thị kết quả đã đồng bộ
```

Không phải giao dịch được đưa vào block là chắc chắn thực thi thành công. Cũng không phải có transaction hash là đã hoàn tất.

**Indexer** là chương trình đọc dữ liệu/event blockchain và cập nhật dữ liệu phục vụ ứng dụng. Event không tự chạy vào database nếu không có chương trình thực hiện việc đó.

Vì có độ trễ giữa các mốc, blockchain có thể đã ghi nhận thành công trong khi website còn hiển thị đang đồng bộ.

#### 11.7 Sơ đồ tổng thể

```text
Lan → Frontend → Backend kiểm tra quyền → Storage + Database
          │
          └→ Ví Lan → Contract kiểm tra quyền → Blockchain
                                                   │
                                                Indexer
                                                   │
                                                Database
                                                   │
                                                  API
                                                   │
                                                Frontend
```

API ở đây là giao diện để frontend yêu cầu dữ liệu từ backend, chẳng hạn trạng thái evidence. Không phải mọi ứng dụng đều phải dùng đúng sơ đồ này; đây là luồng đang chọn để minh họa.

#### 11.8 Nhìn ở đâu để biết đã chạy đúng?

| Điều cần kiểm tra | Nơi quan sát khi phát triển |
|---|---|
| Yêu cầu upload có được chấp nhận không? | Network trong công cụ phát triển trình duyệt và log backend |
| File đã tồn tại chưa? | Công cụ quản trị storage hoặc thao tác đọc file có quyền phù hợp |
| Metadata có đúng campaign/milestone không? | Database qua công cụ truy vấn hoặc API kiểm tra |
| Giao dịch thành công không? | Receipt qua RPC hoặc block explorer của mạng đang dùng |
| Contract ghi đúng commitment chưa? | Đọc trạng thái contract và event liên quan |
| Indexer đã xử lý chưa? | Log/checkpoint của indexer và bản ghi database |
| Người không có quyền có bị chặn không? | Test backend và contract bằng danh tính/ví khác |

Việc kiểm tra phải đối chiếu cùng campaign, milestone và giao dịch; không chỉ nhìn thấy một dòng “Success” trên giao diện.

### 12. Cách hoàn thành mục 1.1

#### 12.1 Sản phẩm cần tạo ở mốc này

**Viết đặc tả quyền đủ rõ để chuyển thành code và test.** Chưa cần triển khai toàn bộ luồng ở mục 11.

Có thể viết phần Actors trong `protocol-spec.md`, một đầu ra mà Process dự kiến. Đây là vị trí đề xuất, không khẳng định file đã tồn tại.

#### 12.2 Quy trình từng bước

1. **Liệt kê actor và trách nhiệm:** bắt đầu từ bảy vai trò trong Process.
2. **Liệt kê hành động:** tách upload file khỏi commit hash; tách kiểm tra bằng chứng khỏi quyết định tranh chấp.
3. **Gắn phạm vi:** quyền toàn hệ thống, theo campaign hay theo milestone?
4. **Xác định nguồn quyền:** ai cấp, hoặc suy ra từ dữ liệu nào?
5. **Ghi nơi kiểm tra:** backend, contract hoặc cả hai với trách nhiệm riêng.
6. **Ghi điều kiện và giới hạn:** trạng thái, thời hạn, xung đột vai trò và trường hợp người phụ trách không hoạt động.
7. **Viết tình huống kiểm chứng:** một trường hợp hợp lệ và một trường hợp bị từ chối cho từng quyền quan trọng.

#### 12.3 Ví dụ một hành động được đặc tả

| Thuộc tính | Quy tắc minh họa |
|---|---|
| Hành động | Commit evidence của milestone |
| Người được phép | Organizer của chính campaign đó |
| Nguồn quyền | Địa chỉ Organizer lưu trong contract |
| Điều kiện | Milestone thuộc campaign và đang cho phép nộp evidence |
| Nơi kiểm tra | Campaign contract |
| Kết quả | Ghi commitment và phát event |
| Trường hợp từ chối | Organizer của campaign khác gọi vào |
| Tác động tiền | Chỉ ghi commitment, không tự giải ngân trong ví dụ này |

#### 12.4 Các tình huống để kiểm chứng mô hình quyền

Đây là tình huống thiết kế cho các quy tắc minh họa, không phải báo cáo test đã chạy:

- Organizer của A nộp evidence cho A ở trạng thái hợp lệ: được phép.
- Organizer của A nộp evidence cho B: bị từ chối.
- Người không có quyền gọi trực tiếp API, bỏ qua UI: backend vẫn từ chối.
- Ví không phải Organizer gọi trực tiếp contract: contract vẫn từ chối.
- Organizer đúng campaign nộp khi milestone đã đóng: từ chối theo state machine.
- Người thay trường `userId` trong yêu cầu thành ID của Lan: không được backend nhận là Lan.
- Thay nhãn admin trong dữ liệu ứng dụng: không tự có quyền admin contract.
- Upload thành công nhưng từ chối ký: không hiển thị đã commit on-chain.

#### 12.5 Tiêu chí hoàn thành

Mục 1.1 đạt yêu cầu khi với mỗi hành động, team chỉ ra được:

> **Ai được làm, với đối tượng nào, trong điều kiện nào, và thành phần nào thực sự ngăn người không có quyền thực hiện nó.**

Các lựa chọn chưa thống nhất cần được đánh dấu là câu hỏi mở, không giấu dưới những tên chung như “admin xử lý” hoặc “hệ thống kiểm tra”.

### 13. Những quyết định còn cần chốt

- Beneficiary và Vendor có cần trực tiếp dùng ứng dụng trong MVP không?
- Verifier có bắt buộc không? Xác nhận của họ có hiệu lực đến đâu?
- Attestation lưu off-chain, có chữ ký hay được ghi bằng giao dịch on-chain?
- Ai được challenge và điều kiện được xác định từ nguồn nào?
- Ai làm Resolver? Nếu không xử lý đúng hạn thì sao?
- Admin có chính xác những quyền nào?
- Vai trò nào được kiêm nhiệm, vai trò nào cần tách?
- Địa chỉ Organizer hoặc Resolver có được thay đổi không, theo quy trình nào?
- Nếu quyền thay đổi on-chain, backend cập nhật và xử lý phiên đang tồn tại thế nào?

Những câu hỏi này có liên hệ với state machine, challenge model và financial rules. Actor Model xác định người có quyền; các mục tiếp theo hoàn thiện điều kiện và hệ quả của hành động.

### 14. Tài liệu tham chiếu

- [Development Process & MVP Roadmap](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md) — mục 1.1 và các quyết định còn mở.
- [Threat Model v0.2](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>) — vai trò nghiệp vụ, giả định tin cậy và nguy cơ thông đồng.
- [Tech Stack & Learning Roadmap](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md) — định hướng backend, xác thực và quyền quản trị.
- [Solidity: Block and Transaction Properties](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties) — ý nghĩa của `msg.sender`.
- [ERC-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361) — chuẩn thông điệp và xác thực đăng nhập bằng ví.

---

<a id="moc-1-2"></a>
## 1.2 — On-chain và Off-chain

> Tài liệu giải thích, không phải protocol đã phê duyệt. Tên trường và luồng bên dưới là thiết kế minh họa, không khẳng định code/API đã tồn tại.
>

### 1. Ý chính của mục này

**Chốt on-chain/off-chain là quyết định dữ liệu nào thuộc quyền quyết định của blockchain, dữ liệu nào do ứng dụng quản lý và hai bên trao đổi với nhau bằng cách nào.**

Không chỉ là chọn chỗ lưu. Cùng một thông tin có thể xuất hiện ở cả blockchain và database, nhưng phải có một nguồn có thẩm quyền cho từng quyết định.

Ví dụ: PostgreSQL có thể lưu số tiền campaign đã nhận để website tải nhanh. Nếu database ghi 12.000 còn contract ghi 10.000, backend không được dựa vào 12.000 để cho giải ngân thêm 2.000.

Quy tắc Process đưa ra: blockchain quản lý sự thật tài chính trọng yếu và commitment; PostgreSQL phục vụ dữ liệu ứng dụng và truy vấn.

### 2. Các thành phần thực tế nằm ở đâu?

| Thành phần | Hình thức | Khi phát triển | Khi triển khai |
|---|---|---|---|
| Frontend | Code giao diện, chạy thành website | Dev server trên máy bạn; người dùng thao tác trong trình duyệt | Website được phục vụ qua hosting; giao diện chạy trong trình duyệt |
| Backend | Chương trình nhận yêu cầu API, kiểm tra quyền, xử lý nghiệp vụ ứng dụng | Tiến trình trên máy bạn | Tiến trình trên server/dịch vụ chạy ứng dụng |
| PostgreSQL | Hệ quản trị cơ sở dữ liệu, chứa bảng và bản ghi | Dịch vụ local hoặc môi trường dev riêng | Database server/dịch vụ được quản lý |
| Object storage | Kho chứa file dưới các object key | Kho thử nghiệm hoặc dịch vụ tương thích ở local | Dịch vụ lưu ảnh, PDF, video |
| Smart contract | Chương trình được triển khai trên blockchain | Mạng local hoặc testnet | Mạng được dự án chọn |
| RPC endpoint | Địa chỉ kết nối đến node blockchain | Node local hoặc endpoint testnet | Node/dịch vụ RPC phù hợp mạng |
| Indexer | Chương trình đọc dữ liệu blockchain, tạo dữ liệu truy vấn | Tiến trình chạy trên máy bạn | Worker/service chạy liên tục hoặc theo lịch |

“Local” nghĩa là phục vụ phát triển trên máy hoặc môi trường thử nghiệm, không phải đã đưa hệ thống lên mạng cho người khác dùng.

Tech Stack hiện đề xuất React, NestJS, PostgreSQL và Ponder cùng các công cụ hỗ trợ. Đây là định hướng tài liệu; ví dụ ở đây không đòi hỏi cài hoặc dùng mọi thành phần ngay.

### 3. Phân loại dữ liệu theo campaign ví dụ

Campaign lắp lọc nước có goal 10.000 MockUSDC, ba ngân sách 2.000 / 5.000 / 3.000, Organizer là Lan.

| Dữ liệu | Nguồn có thẩm quyền đề xuất | Bản sao/hiển thị ở đâu? | Lý do |
|---|---|---|---|
| Ví Organizer | Contract | Database, UI | Quyết định quyền gọi hành động on-chain |
| Token nhận donation, goal, deadline | Contract | Database, UI | Quyết định nhận tiền và funding thành công |
| Ngân sách, số đã release | Contract | Database, UI | Giới hạn chuyển tiền |
| Khoản đóng góp, quyền refund | Contract | Database, UI | Quyết định ai được nhận bao nhiêu |
| Bond, kết quả slash | Contract | Database, UI | Tài sản bảo đảm và hệ quả tranh chấp |
| Hash của bộ evidence | Contract | Database | Cam kết nội dung đang được review |
| Trạng thái challenge, kết quả cuối | Contract | Database, UI | Chặn hoặc cho phép transition tài chính |
| Tên, mô tả, ảnh giới thiệu | Backend/database/storage | UI | Nội dung trình bày, tìm kiếm |
| PDF hóa đơn, ảnh thực địa | Storage | Database giữ thông tin về file | Không cần lưu toàn bộ file lên chain |
| Phiên đăng nhập, quyền xem file riêng tư | Backend | Database/session store theo thiết kế | Kiểm soát truy cập ứng dụng |
| Thông báo, bộ lọc tìm kiếm | Backend/database | UI | Không quyết định số tiền contract cho chuyển |

**Một ngoại lệ cần suy nghĩ:** tiêu chí nghiệm thu có thể là văn bản dài off-chain nhưng ảnh hưởng settlement. Nên commit phiên bản/hash của tiêu chí đã thống nhất để Organizer không sửa mô tả sau khi nhận tiền rồi đổi điều kiện thành công.

Không phải mọi “text” đều chỉ là nội dung trang trí.

### 4. Ví dụ lưu một hóa đơn

Hóa đơn M2 là file `invoice.pdf`. Ba lớp dữ liệu khác nhau:

```text
Storage:
    Nội dung bytes của invoice.pdf

Database:
    evidenceId, campaignId, milestoneId
    loại INVOICE, objectKey, version
    người nộp, trạng thái upload/commit

Contract:
    commitment của evidence/bộ evidence
    milestone liên quan, phiên bản đang review
    người gửi và thời điểm ghi nhận on-chain
```

Database không nhất thiết chứa file PDF trong một ô. Nó có thể chỉ giữ `objectKey`, tức tên định danh file trong kho, còn backend dùng định danh đó để cấp quyền đọc.

Không dùng URL có thời hạn làm định danh lâu dài của file. URL có thể hết hạn trong khi evidence vẫn cần tồn tại.

### 5. Luồng donate: frontend có hai đường giao tiếp

Giả định donor dùng ví trực tiếp, không có backend ký thay.

```text
Trình duyệt ── gọi API ──> Backend ── truy vấn ──> Database
     │
     └── yêu cầu ví ký ──> RPC/node ──> Smart contract
                                          │
                                  Event/trạng thái
                                          │
                                       Indexer
                                          │
                                       Database
```

1. Minh mở campaign: frontend gọi API để lấy mô tả và số liệu đã đồng bộ.
2. Minh chọn góp 100 MockUSDC: frontend chuẩn bị thao tác ví đúng mạng và đúng contract.
3. Với token ERC20 thông thường, Minh cấp allowance nếu chưa đủ rồi gọi donate; approve chỉ cấp quyền chi, chưa phải donation.
4. Contract kiểm tra thời hạn, số tiền, token và chuyển token theo logic đã định.
5. Chỉ khi thực thi thành công mới có khoản donation được chấp nhận theo protocol.
6. Indexer đọc kết quả đã đạt chính sách xác nhận và cập nhật bản ghi ứng dụng.
7. UI hiển thị đã đồng bộ; trước đó có thể hiển thị đang chờ xác nhận/đồng bộ.

ERC20 định nghĩa `approve`, `allowance`, `transferFrom`; chi tiết này giải thích vì sao việc cấp quyền và việc chuyển token là hai hành động khác nhau. [Chuẩn ERC20](https://eips.ethereum.org/EIPS/eip-20).

### 6. Indexer là gì, viết ở đâu, hoạt động thế nào?

Indexer là code bạn viết/configure để đọc event blockchain và tạo bản ghi truy vấn. Nó không phải “tính năng tự có của PostgreSQL”.

Ví dụ nội dung chương trình:

```text
Đọc checkpoint gần nhất
    ↓
Lấy event trong khoảng block cần xử lý
    ↓
Kiểm tra đúng chain và đúng contract
    ↓
Ghi/cập nhật dữ liệu theo event
    ↓
Lưu checkpoint phù hợp sau khi ghi thành công
```

RPC có các phương thức để đọc log và receipt; đây là giao diện kết nối tới dữ liệu blockchain, không phải database của website. [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/).

Các từ thường gặp:

- **Checkpoint:** mốc block đã xử lý để có thể tiếp tục sau khi chương trình khởi động lại.
- **Idempotency:** xử lý lại cùng event không cộng thêm donation lần nữa.
- **Confirmation policy:** quy tắc ứng dụng dùng để chờ đủ xác nhận cho mạng đang chọn.
- **Reorg:** chuỗi canonical thay đổi, khiến dữ liệu từng thấy có thể bị thay thế; cần khả năng đối chiếu và xử lý lại.

Khóa event phải chứa định danh mạng và log đủ rõ; đồng thời lưu block hash để đối chiếu khi cần. Chỉ chống trùng event chưa đủ để giải quyết reorg.

### 7. Những tình huống dễ hiểu sai

| Tình huống | Cách hiểu đúng |
|---|---|
| Database cập nhật donation trước khi có receipt thành công | Đây chỉ nên là yêu cầu pending, chưa phải khoản đóng góp đã xác nhận |
| Backend tạm ngừng | Contract có thể vẫn hoạt động; UI và truy vấn ứng dụng có thể bị ảnh hưởng |
| File upload thành công nhưng ví từ chối ký | Có file off-chain, chưa có commitment on-chain |
| Contract ghi hash thành công nhưng storage mất file | Có cam kết nhưng thiếu nội dung để kiểm tra |
| Sửa description trong database | Không tự sửa budget hoặc deadline trong contract |
| UI hiện “Verified” do admin sửa DB | Không tạo ra kết quả settlement có hiệu lực on-chain |

### 8. Làm mục 1.2 bằng cách nào?

1. Mở tài liệu đặc tả trong editor.
2. Liệt kê từng nhóm dữ liệu và từng quyết định tài chính.
3. Tạo bảng gồm: trường dữ liệu, nguồn có thẩm quyền, bản sao, người được sửa, thời điểm được sửa.
4. Với dữ liệu được commit, ghi phiên bản nào được cam kết và cách tìm nội dung tương ứng.
5. Vẽ hai luồng đọc/ghi cho một donation và một evidence.
6. Ghi cách xử lý khi chain, database hoặc storage chưa đồng bộ.

Đầu ra là một mục “Data Ownership / On-chain vs Off-chain” trong protocol spec hoặc một bảng liên kết từ đó. Chưa cần tạo database thật để hoàn thành thiết kế này.

### 9. Kiểm tra đã hiểu/chốt đủ chưa?

- Nếu sửa số tiền trong database, contract có cho rút thêm không? Phải là không trong thiết kế này.
- Có thể dựng lại dữ liệu donation từ chain không? Phải xác định event/state đủ để làm việc đó.
- Có thể dựng lại toàn bộ ảnh và mô tả từ chain không? Thường không; cần chính sách lưu trữ riêng.
- Khi website hiển thị chậm, có biết đối chiếu receipt, indexer log và database ở đâu không?
- Có thông tin off-chain ảnh hưởng acceptance nhưng chưa khóa phiên bản không?

**Hoàn thành khi mỗi dữ liệu có nơi quản lý rõ ràng và mỗi quyết định tài chính có nguồn xác thực rõ ràng.**

Nguồn dự án: mục 1.2 trong [Process](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), phần Architecture trong [Tech Stack](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md).

---

<a id="moc-1-3"></a>
## 1.3 — State Machine

> Thiết kế minh họa để học và thảo luận, chưa phải state machine đã phê duyệt. Tên hàm/trạng thái là đề xuất, không phải API hiện có.
>

### 1. State machine giải quyết vấn đề gì?

State machine là tập trạng thái và những đường chuyển hợp lệ giữa chúng.

Thay vì chỉ kiểm tra “Lan là Organizer”, contract còn hỏi: “Campaign và milestone hiện có ở trạng thái cho phép thao tác không?”

Ví dụ: Lan đúng Organizer nhưng chưa đủ goal thì không được kích hoạt M1. Minh đúng donor nhưng review window đã hết thì không được mở challenge theo quy tắc thời hạn minh họa.

Một transition — lần chuyển trạng thái — cần xác định:

```text
Trạng thái trước + hành động + người gọi + điều kiện
    → trạng thái sau + tác động tiền + event
```

### 2. Không nên trộn tất cả trạng thái thành một danh sách mơ hồ

Sơ đồ Process là bức tranh tổng quan. Khi viết spec nên tách rõ ít nhất:

| Phạm vi | Ví dụ trạng thái | Nó trả lời gì? |
|---|---|---|
| Campaign | CREATED, FUNDING, FUNDED, EXECUTING, FUNDING_FAILED, CANCELLED, COMPLETED | Cả chiến dịch đang ở đâu? |
| Milestone | NOT_STARTED, ACTIVE, REVIEW, DISPUTED, ACCEPTED, REJECTED | Một giai đoạn đang ở đâu? |
| Upload/transaction của UI | UPLOADED, AWAITING_SIGNATURE, PENDING, CONFIRMED, SYNCING | Người dùng đang chờ bước kỹ thuật nào? |

Ví dụ campaign vẫn EXECUTING trong khi M1 ACCEPTED, M2 REVIEW và M3 NOT_STARTED. Không cần đổi trạng thái toàn campaign thành tên riêng của từng milestone.

“Refund available” cũng có thể là một quyền được tính từ trạng thái terminal và pool, không bắt buộc là trạng thái campaign độc lập. Campaign CANCELLED vẫn có donor chưa claim.

### 3. Ví dụ theo prototype hiện tại — cập nhật 2026-10-03

- Goal 10.000, budgets 2.000 / 5.000 / 3.000 MockUSDC.
- Chỉ nhận tới goal; không nhận vượt mức trong ví dụ.
- Donation đạt đúng goal chuyển ngay sang FUNDED; không chờ funding deadline.
- Bond 5.000 được khóa trước khi mở funding.
- Chỉ một milestone chưa được chấp nhận tại một thời điểm.
- Kích hoạt milestone chỉ đổi state; budget vẫn nằm trong escrow.
- Settlement thành công mới chuyển budget đúng một lần cho Organizer.
- Review window đã chốt mặc định 72 giờ, bắt đầu từ verifier acceptance.
- Assigned verifier có role còn hiệu lực phải accept đúng evidence hash/version; submission chưa được accept không bắt đầu review.

Ví dụ này khớp đường không có challenge trong code. Committee 2/3 đã chọn nhưng chưa triển khai; timeout dispute và hệ quả tài chính sau FUNDED vẫn OPEN.

### 4. Sơ đồ bằng chữ

```text
Campaign:
DRAFT → APPROVED → FUNDING → FUNDED → MILESTONE_ACTIVE
  │        │          │                      ↓
  └────────┴──────────┴→ CANCELLED      EVIDENCE_PENDING
                      └→ FUNDING_FAILED       ↓ verifier accept
                                          IN_REVIEW
                                          │       │
                                     settle       challenge
                                          ↓       ↓
                    MILESTONE_SETTLED / COMPLETED CHALLENGED

Milestone:
PENDING → ACTIVE → SUBMITTED → REVIEWING → SETTLED
                     │ reject           │
                     └→ ACTIVE          └→ CHALLENGED (chưa có exit)
```

Tên trong sơ đồ dùng enum hiện tại; milestone SUBMITTED tương ứng campaign EVIDENCE_PENDING, REVIEWING tương ứng IN_REVIEW. Recovery do quá hạn và exit khỏi CHALLENGED chưa triển khai; không tự hiểu là fraud hoặc tự động slash.

### 5. Bảng transition mẫu

| Trước | Hành động minh họa | Ai gọi? | Điều kiện chính | Sau | Tác động tiền |
|---|---|---|---|---|---|
| DRAFT | approveCampaign | Resolver prototype | Mỗi milestone có criteria hash | APPROVED | Không chuyển tiền |
| APPROVED | publishCampaign | Organizer | Bond đủ, trước deadline | FUNDING | Không chuyển donation |
| FUNDING | donate | Donor | Trước deadline, amount > 0, không vượt cap | FUNDING hoặc FUNDED nếu đạt goal | Token donor → escrow |
| FUNDING | finalizeFundingFailure | Bất kỳ ai | Tới deadline, raised thiếu goal | FUNDING_FAILED | Snapshot refund và trả bond atomically |
| DRAFT / APPROVED / FUNDING | cancelCampaign | Organizer | Chưa FUNDED | CANCELLED | Snapshot refund và trả bond atomically |
| FUNDED / MILESTONE_SETTLED | activateMilestone | Organizer | Đúng mốc hiện tại, mốc trước settled | MILESTONE_ACTIVE | Không chuyển budget |
| MILESTONE_ACTIVE | submitEvidence | Organizer | Đúng mốc, hash khác zero | EVIDENCE_PENDING | Không chuyển tiền |
| EVIDENCE_PENDING | verifySubmission / rejectSubmission | Assigned verifier | Role còn hiệu lực, đúng hash/version | IN_REVIEW / MILESTONE_ACTIVE | Không chuyển tiền |
| IN_REVIEW | openChallenge | Donor đã đóng góp | Trước reviewEnd | CHALLENGED | Không slash; chưa có exit |
| IN_REVIEW | settleMilestone | Bất kỳ ai | Tới reviewEnd, không challenge | MILESTONE_SETTLED hoặc COMPLETED | Chuyển budget; mốc cuối trả bond trong cùng tx |
| CHALLENGED | Committee resolution | Committee 2/3 mục tiêu | Policy chưa hoàn tất | Chưa triển khai | Chưa được phép giả định refund/slash |
| FUNDING_FAILED / CANCELLED | claimRefund | Donor có quyền | Pool đã chốt, chưa claim đủ | Không đổi terminal state | Escrow → donor |

“Bất kỳ ai gọi” không phải bất kỳ ai được tự quyết kết quả. Contract tính kết quả từ điều kiện đã lưu. Người gọi chỉ kích hoạt phép tính và trả gas theo cơ chế giao dịch.

### 6. Theo dõi dòng tiền qua happy path

Không tính gas vào token pool, không có phí protocol trong ví dụ.

| Mốc thời gian | Donation còn trong escrow | Bond khóa | Tổng donation đã release |
|---|---:|---:|---:|
| Funding hoàn tất | 10.000 | 5.000 | 0 |
| Activate M1; submit và verifier accept | 10.000 | 5.000 | 0 |
| Settle M1 sau review | 8.000 | 5.000 | 2.000 |
| Activate M2; submit và verifier accept | 8.000 | 5.000 | 2.000 |
| Settle M2 sau review | 3.000 | 5.000 | 7.000 |
| Activate M3; submit và verifier accept | 3.000 | 5.000 | 7.000 |
| Settle M3, complete và trả bond atomically | 0 | 0 | 10.000 |

Verifier accept không giải ngân. Nếu cả activate và settle đều trả full budget thì đã giải ngân hai lần.

Đây là release-after-settlement đã chọn. Các phân tích pre-funding ở phần học khác là phương án lịch sử, không áp dụng nguyên công thức exposure cho prototype này. Trên Arc, phí caller vẫn tách khỏi accounting donation/bond dù cùng tài sản USDC.

### 7. Deadline không tự chạy code

Đồng hồ đi qua deadline không tự tạo giao dịch blockchain.

```text
Đến hạn
    ↓
UI hoặc worker phát hiện điều kiện đã đủ
    ↓
Một tài khoản gửi giao dịch finalize/settle
    ↓
Contract kiểm tra thời gian và trạng thái lúc thực thi
    ↓
Nếu đúng: cập nhật state
```

Worker là chương trình nền của ứng dụng. Nếu nó gửi giao dịch thì cần tài khoản ký và nguồn trả gas phù hợp; không nên mặc định backend có khóa của Organizer.

Một action permissionless có thể cho người khác tiếp tục nếu worker không hoạt động. Điều kiện hợp lệ vẫn nằm trong contract.

Quy ước thời gian minh họa không chồng lấn:

- Donate: `now < fundingDeadline`; finalize: `now >= fundingDeadline`.
- Challenge: `now < reviewEnd`; settle: `now >= reviewEnd`.
- `now` ở đây là thời gian block contract sử dụng, không phải đồng hồ trình duyệt.

Giao dịch được gửi trước hạn nhưng thực thi sau hạn vẫn có thể bị từ chối. UI đếm ngược chỉ là trợ giúp.

### 8. Khi một bên không hoạt động

| Trường hợp | Điều phải thiết kế |
|---|---|
| Không ai finalize funding | Ai được gọi thay, có worker hỗ trợ không? |
| Organizer nhận tiền rồi không nộp evidence | Deadline evidence, thời gian bổ sung, ai mở xử lý default? |
| Resolver không xử lý | Backup/escalation/timeout; bond và refund được xử lý ra sao? |
| Không ai claim refund | Tiền giữ ở đâu; có hết hạn claim không? |
| Admin pause lâu | Pause áp dụng action nào; có khóa cả refund không? |

Không có challenge vì evidence chưa bao giờ được nộp là tình huống khác với đã hết review window hợp lệ.

### 9. Code và kiểm tra nằm ở đâu?

- **Spec:** sơ đồ và bảng transition viết bằng Markdown.
- **Contract:** enum/state variables và điều kiện trước mỗi action.
- **Contract tests:** chạy các đường hợp lệ và cố đi qua đường bị cấm.
- **Backend/indexer:** lưu bản sao trạng thái để truy vấn, không tự sửa kết quả chain.
- **Frontend:** chỉ hiển thị thao tác phù hợp, phân biệt pending với state chính thức.

Ở giai đoạn thiết kế, thử bằng bảng và giấy đã hữu ích: đặt campaign ở FUNDING rồi thử gọi activate; nếu bảng không chỉ ra rõ phải từ chối thì spec còn thiếu.

Khi đã có code, test ít nhất: trước/đúng/sau deadline; gọi settle hai lần; activate M2 trước M1; resolve bởi ví sai; nộp evidence sau terminal state; finalization thiếu goal.

### 10. Đầu ra cần có

- Danh sách state theo từng phạm vi.
- Bảng đầy đủ người gọi, guard, trạng thái sau, tác động tiền và event.
- Một trace thành công, một trace funding fail, một trace dispute/cancel.
- Quy ước thời gian tại đúng điểm biên.
- Danh sách đường timeout còn mở, không giả vờ đã hoàn tất thiết kế.

**Hoàn thành khi từ mỗi trạng thái đều biết được hành động hợp lệ tiếp theo và tiền thay đổi ra sao, kể cả khi có lỗi hoặc có người không hợp tác.**

Nguồn: mục 1.3 trong [Process](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), các phần State Machine và Challenge trong [Threat Model](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

---

<a id="moc-1-4"></a>
## 1.4 — Bond Rule

> Giải thích mô hình protocol, dùng token thử nghiệm và giả định minh họa; không phải quy tắc tài chính đã được team phê duyệt.
>

### 1. Bond là gì, bảo vệ khoảng thời gian nào?

Bond là tài sản Organizer khóa theo protocol để chịu hệ quả khi vi phạm các nghĩa vụ đã định trước.

Ví dụ Lan khóa 5.000 MockUSDC của mình. Donor đóng tổng cộng 10.000. Hai khoản có thể nằm cùng địa chỉ contract nhưng vẫn là hai nguồn tiền với nghĩa vụ khác nhau.

```text
Donor → 10.000 donation → tiền phục vụ campaign
Lan   →  5.000 bond     → tài sản bảo đảm
```

Bond không làm số tiền huy động thành 15.000 và không mặc định là ngân sách mua thiết bị.

Theo mô hình pre-funding, donation rời escrow trước khi milestone được chấp nhận. Bond bảo vệ khoảng thời gian tiền đã ra ngoài nhưng chưa được xác minh theo protocol.

### 2. Exposure là gì?

**Unverified exposure** là lượng tiền đã được đưa ra khỏi phạm vi kiểm soát an toàn của protocol mà kết quả sử dụng chưa được chấp nhận theo quy tắc.

Đây là khái niệm của mô hình, cần định nghĩa chính xác khi implement. Không đồng nhất với số dư ví Organizer và cũng không đồng nhất với tổng tiền đã release từ đầu campaign.

Ví dụ khi M1 đã được chấp nhận và M2 vừa được trả 5.000:

```text
Tổng release từ đầu: 2.000 + 5.000 = 7.000
Trong đó M1 đã accepted: 2.000
Exposure của M2 chưa accepted: 5.000
```

“Accepted” ở đây là kết luận của protocol theo evidence/challenge, không bảo đảm tuyệt đối sự thật ngoài đời. Nếu gian lận lọt qua M1, mô hình bond cho exposure hiện tại không tự bảo hiểm toàn bộ thiệt hại quá khứ.

### 3. Công thức và điều kiện áp dụng

Process đưa ra:

```text
RequiredBond = alpha × MaximumUnverifiedExposure
```

- `alpha`: tỷ lệ bảo đảm.
- `MaximumUnverifiedExposure`: mức exposure lớn nhất mà cơ chế cho phép phát sinh.
- Nếu alpha = 1, giá trị bond bằng mức exposure đó, tính trong cùng đơn vị tài sản hoặc cơ chế định giá đã xác định.

Để suy ra `RequiredBond = max(milestone budgets)`, cần ít nhất các giả định:

1. Milestone được giải ngân toàn budget trước khi xác minh.
2. Chỉ có một milestone chưa được accepted tại một thời điểm.
3. Không có khoản tạm ứng khác vượt ra ngoài ngân sách này.
4. Không đưa exposure cũ chưa xử lý sang mốc kế tiếp.
5. Bond cùng token với donation trong ví dụ, token không có cơ chế làm thay đổi số dư ngoài mô hình đã chọn.

**Chỉ nói “pre-funded toàn bộ” là chưa đủ nếu cho nhiều milestone chạy đồng thời.**

### 4. Tính bằng ví dụ 2.000 / 5.000 / 3.000

Với hoạt động tuần tự:

```text
MaximumUnverifiedExposure = max(2.000, 5.000, 3.000) = 5.000
alpha = 1
RequiredBond = 5.000 MockUSDC
```

| Thời điểm | Exposure chưa accepted | Bond đang khóa trong ví dụ |
|---|---:|---:|
| Chưa activate M1 | 0 | 5.000 |
| M1 active | 2.000 | 5.000 |
| M1 accepted, chưa mở M2 | 0 | 5.000 |
| M2 active | 5.000 | 5.000 |
| M2 accepted, chưa mở M3 | 0 | 5.000 |
| M3 active | 3.000 | 5.000 |
| Hoàn tất, không nghĩa vụ còn lại | 0 | Đủ điều kiện trả bond |

Ví dụ giữ cố định 5.000 đến cuối để đơn giản. Việc exposure hiện tại về 0 giữa hai mốc không có nghĩa Lan được rút toàn bộ bond ngay rồi bỏ việc khóa cho mốc tiếp theo.

#### Trường hợp công thức max không còn đủ

Nếu cho M2 và M3 chưa xác minh cùng chạy:

```text
Exposure đồng thời = 5.000 + 3.000 = 8.000
Bond theo max budget = 5.000
Khoảng thiếu so với exposure = 3.000
```

Nếu controlled withdrawal trả 1.000 mỗi lần nhưng năm lần chưa được xác minh, exposure có thể vẫn lên 5.000. Chia nhỏ giao dịch không tự làm giảm exposure tối đa.

### 5. “Reusable bond” nghĩa là gì?

Khoản bond được giữ để bảo đảm lần lượt các milestone, không phải mỗi lần lại cộng thêm một khoản bond bằng budget.

Lan không cần khóa 2.000 + 5.000 + 3.000 chỉ vì có ba mốc. Với giả định tuần tự, một khoản 5.000 được giữ xuyên suốt.

Nhưng nếu bond bị slash rồi campaign vẫn được phép tiếp tục, cần kiểm tra lại coverage. Không thể coi bond còn nguyên sau khi đã bị trừ. Thiết kế đơn giản có thể kết thúc campaign khi có vi phạm nghiêm trọng; nếu cho tiếp tục, phải chốt top-up và điều kiện kích hoạt mốc kế tiếp.

### 6. Bond lock thực tế diễn ra ở đâu?

Luồng minh họa cho token ERC20 thông thường:

1. Frontend đọc cấu hình budget và hiển thị required bond.
2. Lan chọn đúng ví và đúng mạng.
3. Ví thực hiện cấp allowance cho contract nếu chưa đủ.
4. Lan gọi action lock bond bằng ví.
5. Contract tự kiểm tra số cần khóa và nhận token theo logic protocol.
6. Contract cập nhật bond ledger và phát event.
7. Indexer đồng bộ; backend/API/UI cập nhật trạng thái.

Số required bond không chỉ tính trên frontend. Contract phải kiểm tra để không ai sửa giao diện rồi khóa ít hơn.

**Approve chưa phải lock bond.** Allowance là quyền cho spender chi token; số dư bond chỉ tăng khi action nhận token được thực thi thành công. [ERC20](https://eips.ethereum.org/EIPS/eip-20).

#### Token thực sự “nằm” ở đâu?

Với ERC20, token contract ghi balance của địa chỉ campaign/escrow. Campaign contract giữ sổ nghĩa vụ: bao nhiêu là donation, bao nhiêu là bond, bao nhiêu đã trở thành quyền refund.

Database chỉ lưu bản sao phục vụ hiển thị, không cầm token và không thể tự trả bond bằng cách đổi một ô dữ liệu.

### 7. Trả bond và slash khác nhau thế nào?

| Tình huống | Định hướng theo tài liệu | Điều vẫn phải chốt |
|---|---|---|
| Funding không đạt goal, chưa release | Refund donation, trả bond | Ai gọi, khi nào có thể claim? |
| Hoàn tất mọi mốc | Trả bond khi hết nghĩa vụ | Có final review/nghĩa vụ nào còn chờ không? |
| Thất bại khách quan | Không tự slash chỉ vì campaign fail | Quy trình xác nhận và xử lý tiền còn lại |
| Organizer vi phạm nghĩa vụ | Có thể slash một phần/toàn bộ theo rule | Điều kiện, người kết luận, số tiền, nơi nhận |
| Có challenge | Chỉ mở tranh chấp | Giữ bond trong khi xử lý; không xem challenge là bằng chứng gian lận |

**Slash** là chuyển quyền hưởng một phần bond ra khỏi Organizer theo quyết định hợp lệ. Nó không bắt buộc là đốt token; nơi nhận phải được chỉ rõ: refund pool, bên bị thiệt hại hoặc cơ chế khác đã thống nhất.

Không nên có rule mơ hồ “Resolver thích slash bao nhiêu cũng được”.

### 8. Ví dụ slash để thấy dòng tiền

Giả sử M1 đã accepted, M2 nhận 5.000 rồi bị kết luận vi phạm. Donation còn trong escrow là 3.000; bond đang khóa là 5.000.

**Giả định riêng cho ví dụ:** quyết định cuối cùng chuyển toàn bộ 5.000 bond vào refund pool; không có tiền thu hồi khác.

```text
Donation chưa release: 3.000
Bond được phân bổ cho donor: 5.000
Refund pool: 8.000
Bond còn trả Organizer: 0
```

5.000 bond đã nằm trong escrow từ trước. Chuyển nó sang refund pool là đổi phân bổ nghĩa vụ, không tạo thêm 5.000 token mới.

Nếu Organizer đã trả lại 1.000 của M2 và rule chỉ bù thiệt hại chưa thu hồi, ví dụ khác có thể slash 4.000, trả bond còn lại 1.000. Không tự dùng công thức này cho mọi fraud: mức bồi hoàn và mức phạt là lựa chọn cần chốt riêng.

### 9. Những điều bond không tự giải quyết

- Không xác định được hóa đơn ngoài đời là thật chỉ từ số dư token.
- Không bảo đảm mọi vi phạm đều được phát hiện trong review window.
- Không bảo đảm resolver hoạt động hoặc quyết định đúng.
- Không bao phủ tự động phần đã accepted rồi sau này mới phát hiện gian lận.
- Bond cùng token giảm bài toán tỷ giá giữa hai tài sản, nhưng không biến token thành tài sản không có rủi ro.

Do đó, alpha = 1 là một tham số bảo đảm trong mô hình, không phải lời hứa donor luôn nhận lại 100% donation trong mọi failure.

### 10. Cách làm mục 1.4

1. Viết rõ thời điểm tiền rời escrow.
2. Liệt kê các khoản có thể cùng chưa được xác minh.
3. Tính maximum exposure theo các trạng thái hợp lệ.
4. Chọn alpha và tài sản bond; ghi đơn vị.
5. Chốt thời điểm khóa, ai nộp và ai nhận bond được trả.
6. Chốt điều kiện return/slash, người có quyền kết luận và địa chỉ/phân bổ nhận tiền.
7. Viết ví dụ số cho success, funding fail, honest failure, misconduct.
8. Chuyển mỗi giới hạn thành trường hợp kiểm tra contract.

Kiểm tra: thiếu một đơn vị bond có activate được không; slash rồi có dùng lại bond cũ không; gọi trả bond hai lần có trả thêm không; khóa bond có bị cộng nhầm vào raised không.

**Đầu ra:** bảng lifecycle bond và công thức exposure có đầy đủ giả định, được liên kết với state machine và refund rule.

Nguồn: [Process — mục 1.4](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md); [Threat Model — Bond, Maximum Exposure, Reusable Bond và Failure](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

---

<a id="moc-1-5"></a>
## 1.5 — Refund Rule

> Ví dụ accounting dùng MockUSDC, chưa phải quyết định chính thức. Không có phí protocol; phí gas được trả riêng và không được cộng vào quyền refund trong ví dụ.
>

### 1. Refund rule phải trả lời những gì?

Không chỉ “campaign fail thì refund”. Phải xác định:

```text
Ai có quyền nhận?
Tiền lấy từ pool nào?
Số tiền bao nhiêu?
Khi nào được claim?
Ai thực hiện chuyển?
Làm sao không trả hai lần hoặc vượt số đang có?
```

Process phân biệt funding không đạt goal và campaign dừng giữa chừng. Đây là hai tình huống có lượng tiền còn kiểm soát được rất khác nhau.

### 2. Ba nhóm tiền cần tách

Giữ ví dụ goal 10.000, budgets 2.000 / 5.000 / 3.000, bond 5.000.

| Nhóm | Đang ở đâu? | Có tự động sẵn sàng refund không? |
|---|---|---|
| Donation chưa release | Escrow do protocol kiểm soát | Có thể phân bổ khi đủ điều kiện hủy/refund |
| Donation đã chuyển Organizer | Ví Organizer hoặc đã thanh toán ngoài hệ thống | Không, trừ phần thực sự được hoàn về |
| Bond | Escrow, nhưng thuộc nghĩa vụ trả Organizer nếu không bị slash hợp lệ | Chỉ phần được quyết định phân bổ cho refund mới vào pool |

**“Organizer chưa tiêu” không đồng nghĩa “protocol đang giữ”.**

Nếu Lan nhận 5.000 và khai còn 1.000, con số 1.000 chỉ được cộng vào refund pool sau khi token thực sự quay về và được ghi nhận đúng action/accounting.

### 3. Trường hợp A — funding thất bại

Giả sử chỉ huy động được 6.000 trước deadline, chưa milestone nào được mở.

Minh đóng 100, các donor khác đóng 5.900.

```text
Donation trong escrow = 6.000
Refund pool = 6.000
Minh nhận lại = 100
Bond 5.000 được xử lý trả Lan riêng
```

Điều kiện để tuyên bố refund 100% contribution: không có khoản donation nào đã release, không có khoản phí bị trừ trong mô hình và contract còn đủ tài sản thực nhận.

“100% contribution” không bao gồm gas mà Minh trả cho mạng khi approve/donate/claim.

### 4. Trường hợp B — dừng sau M1, trước khi mở M2

Campaign đã huy động đủ 10.000. M1 đã release và accepted 2.000. M2 chưa nhận tiền.

```text
Donation còn escrow = 10.000 - 2.000 = 8.000
Refund pool donation = 8.000
Minh đóng 100 / 10.000 = 1%
Minh nhận = 8.000 × 1% = 80
```

Minh không nhận lại 100 vì 20 trong phần đóng góp theo tỷ lệ đã gắn với 2.000 được sử dụng ở M1.

Việc campaign dừng không tự đảo ngược giao dịch trả M1. Trả bond cho Lan hay giữ để giải quyết nghĩa vụ còn lại phải theo kết luận của protocol.

### 5. Trường hợp C — dừng sau khi M2 đã nhận tiền

M1 accepted, M2 đã nhận full budget 5.000, chưa được accepted.

```text
Đã release: 2.000 + 5.000 = 7.000
Donation còn escrow: 3.000
Bond còn khóa: 5.000
```

#### C1. Không có slash, không có tiền hoàn về

Nếu quyết định hợp lệ là honest failure và bond được trả theo rule:

```text
Refund pool = 3.000
Minh nhận = 3.000 × 100 / 10.000 = 30
```

Không được tính pool là 8.000 chỉ vì M2 chưa được verified. Chưa verified không làm tiền đã chuyển tự quay lại escrow.

#### C2. Slash toàn bộ 5.000 vào refund pool

Giả định có kết luận misconduct hợp lệ, rule chọn phân bổ 5.000 bond cho donor:

```text
Refund pool = 3.000 + 5.000 = 8.000
Minh nhận = 80
```

Không nói donor được refund 100%: 2.000 của M1 đã được chấp nhận và không reverse trong mô hình này.

#### C3. Organizer hoàn về 1.000, slash 4.000 theo rule bù phần chưa thu hồi

Đây là một rule minh họa khác, không phải rule mặc định:

```text
Donation chưa release = 3.000
Tiền thực hoàn về = 1.000
Bond phân bổ cho donor = 4.000
Refund pool = 8.000
Bond còn trả Lan = 1.000
```

Phải ghi nhận việc thu hồi trước khi tính phần bù, nếu không có thể bù trùng. Nếu protocol có hình phạt thêm ngoài bù thiệt hại, phải ghi thành rule riêng.

### 6. Định nghĩa EligibleContribution

Một lựa chọn MVP đơn giản:

```text
EligibleContribution_i = tổng donation hợp lệ của ví i trong campaign
TotalEligibleContribution = tổng các EligibleContribution
```

Giả định: không có chuyển nhượng quyền donation, không có refund trước đó ngoài accounting đã định, không nhận thêm tiền sau khi khóa funding và mọi donor cùng chia sẻ các khoản chi theo tỷ lệ.

Khi pool đã chốt:

```text
Entitlement_i = floor(RefundPoolSnapshot × Contribution_i / TotalContributionSnapshot)
Claimable_i = Entitlement_i - AlreadyClaimed_i
```

`Snapshot` là giá trị chốt tại thời điểm đủ điều kiện. Không thay số chia sau mỗi lần donor claim.

#### Sai lầm: dùng pool đang giảm làm cơ sở tính

Pool ban đầu 8.000, Minh có 1% và nhận 80. Pool còn 7.920.

Nếu người tiếp theo cũng đóng 1% mà được tính `7.920 × 1% = 79,2`, người đến sau bị thiệt chỉ do thứ tự claim.

Đúng: entitlement của mọi người được tính từ cùng snapshot 8.000; biến số dư còn lại chỉ dùng để theo dõi đã trả bao nhiêu.

### 7. Original ratio và unconsumed accounting có luôn khác nhau không?

Process viết rằng hai mô hình khác nhau nếu có partial milestone release. Cần làm rõ: **partial release tự nó chưa đủ làm kết quả khác nhau.**

Nếu mỗi khoản release luôn được phân bổ theo cùng tỷ lệ cho tất cả donor, tỷ lệ phần chưa tiêu vẫn bằng tỷ lệ contribution ban đầu.

Ví dụ A đóng 60, B đóng 40; release 20 theo tỷ lệ:

```text
A đã dùng 12, còn 48
B đã dùng 8, còn 32
48 / 80 = 60%; 32 / 80 = 40%
```

Hai cách cho cùng kết quả.

Chúng khác khi quy tắc tiêu tiền không đồng đều, ví dụ dành donation cho milestone riêng hoặc tiêu theo thứ tự người đóng:

```text
A đóng 60, B đóng 40
Nếu 20 được trừ chỉ vào phần A:
A còn 40, B còn 40
```

Unconsumed accounting lúc này là 50/50, còn original ratio là 60/40. Team phải chọn mô hình phân bổ thực sự, không chỉ chọn tên công thức.

### 8. Làm tròn và đơn vị token

Contract thường tính bằng số nguyên đơn vị nhỏ nhất. Trong ví dụ cấu hình MockUSDC có 6 decimals:

```text
1 MockUSDC = 1.000.000 đơn vị nhỏ nhất
100 MockUSDC = 100.000.000 đơn vị nhỏ nhất
```

Đây là cấu hình mock được giả định, không phải mọi ERC20 đều có 6 decimals.

Nếu pool có 10 đơn vị nhỏ nhất và ba người có trọng số bằng nhau, làm tròn xuống cho mỗi người 3, tổng 9, dư 1.

Cần chốt cách xử lý phần dư: giữ trong contract hay phân bổ theo một quy tắc xác định. Không tự chuyển cho admin khi chưa có rule. Cách đơn giản là ghi rõ dust giữ lại trong MVP; đổi lại có số dư rất nhỏ chưa phân phối.

Khi implement phải dùng phép nhân/chia an toàn, không dùng số thực JavaScript cho accounting on-chain hoặc amount lớn ở frontend.

### 9. Luồng claim refund thực tế

```text
Campaign đủ điều kiện terminal và pool đã được chốt
    ↓
Frontend hiển thị claimable từ nguồn dữ liệu phù hợp
    ↓
Minh dùng ví gọi claimRefund
    ↓
Contract tính quyền còn lại và kiểm tra trạng thái
    ↓
Đánh dấu đã claim/cập nhật nghĩa vụ trước external transfer
    ↓
Chuyển token; lỗi chuyển phải làm transaction revert đúng cách
    ↓
Event → indexer → database → UI
```

Mỗi donor tự claim là mô hình **pull payment**: người có quyền chủ động rút phần của mình. Tránh vòng lặp gửi cho tất cả donor trong một giao dịch vì số lượng người lớn có thể khiến giao dịch không chạy nổi.

Frontend không tự trừ DB rồi xem như đã refund. Chỉ kết quả giao dịch thành công mới xác nhận token đã chuyển.

Ví dụ MVP có thể giới hạn trả về chính ví có contribution. Nếu cho nhận ở ví khác hoặc nhờ người khác claim hộ, phải đặc tả quyền ký và người nhận riêng.

### 10. Nếu có tiền quay về sau khi đã chốt pool?

Không thể âm thầm tăng pool snapshot rồi giữ nguyên cách đánh dấu “đã claim hết” của những người đã nhận trước đó.

Hai hướng thiết kế:

- Chốt pool sau một quy trình xử lý có deadline rõ; công bố giới hạn về tiền thu hồi muộn và cách xử lý nó.
- Cho nhiều đợt phân phối, mỗi đợt có accounting hoặc tổng entitlement tích lũy trừ đã nhận.

Hướng thứ hai phức tạp hơn nhưng xử lý được tiền về muộn. Đây là quyết định còn mở; không để contract nhận tiền rồi không có rule phân bổ. Cũng không trì hoãn vô hạn quyền refund chỉ vì “có thể còn thu hồi được”.

### 11. Làm ở đâu và kiểm tra gì?

| Việc | Nơi thực hiện |
|---|---|
| Chốt công thức, người nhận, pool, rounding | Financial rules trong tài liệu |
| Lưu contribution, snapshot, claimed; thực hiện chuyển token | Contract |
| Lưu lịch sử claim để truy vấn | Indexer/database |
| Hiển thị số nhận được, pending, lỗi | Frontend |
| Kiểm tra số dư trước/sau và gọi lặp | Contract tests |

Các ca cần có: funding fail 100%; dừng trước M2; dừng sau M2 đã release; bond không bị tính vào pool khi chưa slash; claim hai lần; đổi thứ tự claim; số chia bằng 0; rounding; transfer thất bại; tiền thu hồi muộn.

**Đầu ra:** định nghĩa đủ mọi biến, ví dụ số cho từng failure path và quy tắc cuối cùng cho những token đang được contract giữ.

Nguồn: [Process — mục 1.5 và Q7](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Threat Model — Refund Accounting, Double Refund, Refund DoS](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

---

<a id="moc-1-6"></a>
## 1.6 — Evidence Model

> Hướng dẫn thiết kế và thực hành khái niệm; các trường, trạng thái, thời hạn và payload là ví dụ đề xuất, chưa phải code/API hiện có.
>

### 1. Evidence Model cần giải quyết gì?

Evidence là bằng chứng dùng để đánh giá việc thực hiện milestone: hóa đơn, ảnh, biên bản bàn giao, chứng từ thanh toán hoặc xác nhận của bên nhận.

Mô hình evidence quy định một bằng chứng có những trường gì, lưu ở đâu, gắn với milestone nào, được sửa khi nào và người review đang xem đúng phiên bản nào.

Ba mệnh đề khác nhau:

```text
Đã nộp evidence ≠ evidence được chấp nhận ≠ sự thật ngoài đời chắc chắn đúng
```

Hệ thống có thể chứng minh “đây là file Lan cam kết tại thời điểm đó”; không vì vậy tự biết “máy lọc nước đã lắp đúng chất lượng”.

### 2. Ví dụ bộ evidence của M2

M2 có budget 5.000 MockUSDC, yêu cầu mua và lắp thiết bị.

| File | Loại | Muốn chứng minh gì? | Chưa chứng minh được gì? |
|---|---|---|---|
| Hóa đơn | INVOICE | Vendor ghi nhận hàng hóa, giá, người mua | Hóa đơn có thể giả; chưa chứng minh đã trả tiền |
| Chứng từ thanh toán | BANK_PROOF | Có giao dịch phù hợp | Chưa chứng minh thiết bị đã lắp đúng |
| Ảnh lắp đặt | PHOTO | Có hình ảnh thiết bị tại hiện trường | Có thể chụp sai thời điểm/địa điểm |
| Biên bản bàn giao | BENEFICIARY_CONFIRMATION | Đại diện trường xác nhận nội dung ghi trong biên bản | Cần biết người ký có thẩm quyền và xác nhận phạm vi nào |

Nhiều loại bằng chứng bổ sung cho nhau, không chỉ đếm đủ bốn file là kết luận đúng. Tiêu chí nghiệm thu phải được quy định trước.

### 3. Giải thích từng trường Process đề xuất

| Trường | Ý nghĩa | Ví dụ/hệ quả |
|---|---|---|
| milestoneId | Evidence phục vụ mốc nào | M2; cần gắn đúng campaign nữa |
| type | Phân loại nội dung | INVOICE, PHOTO... |
| documentHash | Dấu vân tay số của nội dung theo thuật toán được chọn | Tính lại để phát hiện file khác |
| storagePointer | Thông tin tìm file | Object key + version, hoặc CID theo thiết kế |
| submittedAt | Thời điểm nộp | Phải phân biệt upload ở backend với commit on-chain |
| submitter | Ai nộp | User ID ở ứng dụng, địa chỉ ví ở giao dịch |

Nếu hệ thống có nhiều chain và nhiều campaign contract, định danh phải tránh lẫn dữ liệu. Một số hiệu milestone như `2` không đủ để biết nó thuộc campaign nào.

Không nhất thiết lưu mọi trường ở cả hai phía. Ví dụ type và pointer có thể nằm trong manifest off-chain được hash, trong khi contract lưu commitment của cả bộ.

### 4. Hash là gì và kiểm tra thế nào?

Giả sử chọn SHA-256 cho hash file trong mô hình minh họa:

```text
Bytes nguyên bản của invoice.pdf
    ↓ SHA-256
Giá trị hash H1
```

Khi tải file để review:

```text
Bytes file tải về
    ↓ cùng thuật toán SHA-256
Giá trị H2

So sánh H2 với H1 đã commit
```

Hash khớp cung cấp bằng chứng về tính toàn vẹn theo giả định an toàn của thuật toán. Nó không xác thực nội dung hóa đơn ngoài đời.

#### Thử trên máy Windows

Điều kiện: có một file thử nghiệm không nhạy cảm; mở PowerShell trong thư mục chứa file. Tên dưới đây là ví dụ, thay bằng file thực tế:

```powershell
Get-FileHash -LiteralPath '.\invoice-demo.pdf' -Algorithm SHA256
```

Kết quả là bảng có Algorithm, Hash, Path. Tải lại đúng file rồi chạy cùng lệnh để đối chiếu. Đây là thao tác đọc file local, không gửi giao dịch và không upload dữ liệu.

Nếu dùng keccak256 cho protocol thì không lấy SHA-256 để so sánh. Cũng không coi SHA3-256 và keccak256 là tên thay thế tùy ý. Thuật toán và cách mã hóa phải thống nhất giữa các thành phần.

### 5. Một file và một bộ evidence khác nhau thế nào?

Nếu chỉ commit hash hóa đơn mà không commit ảnh và biên bản, những file còn lại chưa được bảo vệ bởi commitment đó.

Một phương án là tạo **manifest** — file mô tả danh sách bằng chứng của một phiên bản:

```json
{
  "campaignRef": "campaign-demo",
  "milestoneId": 2,
  "version": 1,
  "files": [
    {
      "type": "INVOICE",
      "hashAlgorithm": "sha256",
      "documentHash": "<hash-cua-file>",
      "storagePointer": "<dinh-danh-file-va-phien-ban>"
    }
  ]
}
```

Đây là payload minh họa, chưa phải schema cuối. Không dùng các placeholder như dữ liệu thật.

Quy trình:

1. Hash từng file nguyên bản.
2. Tạo manifest có định danh campaign/milestone/version và danh sách file.
3. Cố định bytes của manifest, hoặc dùng quy tắc serialization chuẩn hóa đã định.
4. Hash manifest và commit giá trị đó lên contract.
5. Khi kiểm tra: đối chiếu manifest trước, rồi đối chiếu từng file theo manifest.

Nếu hai bên tự tạo lại JSON với thứ tự key hoặc khoảng trắng khác nhau, bytes có thể khác dù nội dung nhìn giống nhau. Không tự “hash lại JSON tương đương” mà bỏ qua quy tắc serialization.

### 6. Pipeline từng bước: từ chọn file đến review

#### Bước 1 — Chọn file trong trình duyệt

Lan mở trang M2, chọn file và loại evidence. Frontend có thể kiểm tra nhanh dung lượng và định dạng để báo lỗi sớm. Backend vẫn phải kiểm tra lại các điều kiện nó chịu trách nhiệm.

#### Bước 2 — Xin quyền upload từ backend

Frontend gọi một API tạo upload request. Backend kiểm tra phiên đăng nhập, quyền Organizer của campaign và milestone được phép nhận evidence.

Backend cấp một object key riêng, tránh để người dùng tự chọn đường dẫn ghi đè file của người khác.

#### Bước 3 — Upload lên storage

Một cách là backend cấp presigned URL: URL cho phép thao tác cụ thể với object trong thời hạn. Trình duyệt upload trực tiếp lên storage, không cần nhận khóa quản trị storage.

URL này có thể dùng lại trong thời hạn; không mặc định là “một lần”. Upload cùng key có thể thay thế object nếu cấu hình/quyền cho phép. [Amazon S3: presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

#### Bước 4 — Xác nhận đúng file và phiên bản

Không chỉ nhận chuỗi “upload done” do frontend gửi rồi tin rằng file đã tồn tại. Backend/worker kiểm tra object đã lưu, dung lượng, hash hoặc checksum theo thiết kế.

Để tránh file bị ghi đè giữa lúc tính hash và lúc review, cần tham chiếu object version bất biến hoặc sao chép sang vùng final không cho người upload sửa. URL hết hạn đơn thuần không giải quyết được mọi cửa sổ ghi đè trước đó.

#### Bước 5 — Ghi metadata, đóng bộ evidence

Database lưu file/version và trạng thái đã kiểm tra. Backend chuẩn bị manifest hoặc dữ liệu commitment theo schema đã chốt.

Lan cần biết mình sắp cam kết bộ nào; nếu frontend tự tính hash, backend vẫn phải đối chiếu nội dung được lưu với hash công bố.

#### Bước 6 — Commit bằng ví

Lan dùng ví gửi giao dịch. Contract kiểm tra quyền và state, ghi commitment rồi phát event nếu thành công.

Thời gian upload ở backend và thời gian commit trong block là hai mốc khác nhau; nên đặt tên trường tách biệt thay vì dùng một `submittedAt` cho mọi thứ.

#### Bước 7 — Xác nhận, đồng bộ, bắt đầu review theo rule

Indexer đọc giao dịch thành công theo confirmation policy và cập nhật dữ liệu. UI hiển thị bộ evidence đã commit.

Rule phải xác định review bắt đầu theo mốc nào. Nếu chọn thời điểm commit, phải có cơ chế xử lý khi file không truy cập được; contract không tự biết storage đang mất mạng.

Không nên cho review clock chạy âm thầm trong khi không ai có thể đọc bằng chứng mà không có đường báo lỗi/challenge tương ứng.

### 7. Các trạng thái off-chain nên phân biệt

```text
DRAFT → UPLOADING → UPLOADED → CONTENT_CHECKED
    → AWAITING_SIGNATURE → TX_PENDING → COMMITTED
```

Tên là minh họa. Nếu giao dịch lỗi, file không tự mất và người dùng có thể cần thử commit lại khi còn được phép.

“COMMITTED” cũng chưa phải “ACCEPTED”. Review và dispute thuộc state machine của milestone.

### 8. Có cho sửa evidence không?

Trước commit, có thể cho sửa draft. Sau khi review đã bắt đầu, không được âm thầm thay file dưới cùng commitment.

Nếu cần bổ sung, tạo version mới và ghi rõ:

- Ai được resubmit?
- Có thay bộ đang review hay chỉ đính kèm giải trình?
- Review window có bắt đầu lại không?
- Challenge đang mở gắn với version cũ được xử lý thế nào?
- Có giới hạn số lần resubmit để không kéo dài vô hạn không?

Một thiết kế MVP đơn giản có thể không cho Organizer tự thay version trong review; chỉ bổ sung theo luồng dispute rõ ràng. Đây là lựa chọn để cân nhắc, chưa chốt.

### 9. Public và private evidence

**Public:** người xem được đọc nội dung đã công khai. Với demo, dùng dữ liệu giả hoặc đã loại bỏ thông tin nhạy cảm.

**Private:** file không công khai; backend kiểm tra quyền rồi cấp quyền đọc phù hợp. Link có thời hạn vẫn có thể bị chia sẻ trong thời gian còn hiệu lực; người đã tải file có thể giữ bản sao.

Không đưa tên, số tài khoản, hồ sơ bệnh án vào event hoặc pointer công khai. Hash không phải mã hóa và không tự bảo đảm bí mật cho dữ liệu dễ đoán.

Nếu dùng IPFS, CID là định danh nội dung có cấu trúc, không đơn giản là chuỗi SHA-256 của file trong mọi cách đóng gói. Không so sánh CID trực tiếp với `documentHash` như hai chuỗi cùng định dạng. [IPFS: Content Identifiers](https://docs.ipfs.tech/concepts/content-addressing/).

Chọn IPFS không thay thế kế hoạch duy trì dữ liệu và quyền riêng tư. Chọn storage tập trung cũng không khiến hash mất tác dụng kiểm tra nội dung.

### 10. Làm ở đâu, quan sát ở đâu?

| Việc | Nơi code/cấu hình | Nơi kiểm tra |
|---|---|---|
| Chọn file, tiến độ upload | Frontend | Trình duyệt, Network |
| Kiểm tra quyền, cấp URL | Backend | API response, log |
| Giữ bytes và version | Storage configuration | Storage console/API |
| Kiểm tra file, lập manifest | Backend/worker theo thiết kế | Hash, metadata, log |
| Lưu commitment | Contract | Receipt, event, đọc state |
| Cập nhật trạng thái đọc | Indexer/database | Checkpoint và bản ghi |

### 11. Đầu ra và ca kiểm tra của mục 1.6

Đầu ra gồm schema, thuật toán hash, quy tắc version, storage pointer, quyền truy cập, thời điểm mở review và cách xử lý file mất truy cập.

Các ca kiểm tra quan trọng:

- File tải lại khớp hash; đổi một byte thì không khớp.
- Người khác không ghi đè file của Organizer.
- File upload xong nhưng transaction fail không hiển thị đã committed.
- Không cho thay nội dung bộ đang review mà giữ nguyên version.
- Challenge chỉ đúng version liên quan.
- Cùng file được nộp lại không tự thành bằng chứng gian lận; phải xét quy tắc tái sử dụng. Hash cũng không bắt được mọi hóa đơn trùng vì quét lại file có thể đổi bytes.
- Backend không công khai file private chỉ vì người dùng biết ID.

Nguồn dự án: [Process — 1.6 và Evidence Pipeline](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Threat Model — Evidence, Replacement, Availability, Privacy](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

---

<a id="moc-1-7"></a>
## 1.7 — Challenge Model

> Mô hình minh họa, không phải rule đã phê duyệt. Các thời hạn và điều kiện dưới đây phục vụ thảo luận; phần timeout phải được chốt trước khi coi protocol hoàn chỉnh.
>

### 1. Challenge là gì?

Challenge là hành động phản đối kết quả/bằng chứng của một milestone theo quy trình protocol, khiến milestone cần được xử lý tranh chấp trước khi tiếp tục.

Ví dụ M2 khai đã lắp hai thiết bị, nhưng Minh thấy ảnh và biên bản chỉ có một. Minh không thể tự sửa state thành fraud hoặc rút bond của Lan. Minh mở challenge và cung cấp lý do để bên có thẩm quyền xử lý.

```text
Challenge = yêu cầu xem xét tranh chấp
Challenge ≠ bằng chứng tự động xác nhận gian lận
Challenge ≠ tự động slash bond
```

### 2. Vì sao không bắt donor vote ở mọi milestone?

Process đề xuất có thể dùng resolver đơn giản trong MVP. Threat Model định hướng chỉ xử lý sâu khi có phản đối, giảm việc donor phải tham gia mọi lần settlement.

Đánh đổi: người theo dõi phải có cơ hội tiếp cận evidence và hành động trong thời hạn. Không có challenge có thể vì evidence đúng, nhưng cũng có thể vì không ai đọc.

Do đó, nhánh không challenge là **chấp nhận theo quy tắc protocol**, không phải chứng nhận tuyệt đối đúng ngoài đời.

### 3. Một bộ rule minh họa để giải thích

| Câu hỏi | Phương án minh họa |
|---|---|
| Ai được challenge? | Ví có contribution > 0 trong chính campaign |
| Khi nào? | Milestone đang REVIEW và trước reviewEnd |
| Window bao lâu? | Mặc định đã chốt: 72 giờ từ assigned verifier acceptance |
| Có stake không? | Chưa dùng stake trong ví dụ |
| Có protocol fee không? | Không trong ví dụ; người gửi vẫn có thể phải trả gas |
| Có nhiều dispute cùng lúc không? | Một dispute active cho một milestone/version |
| Ai quyết định? | Resolver được chỉ định trước theo rule |
| Donor có vote không? | Không bắt buộc trong MVP minh họa |
| Verifier làm gì? | Cung cấp nhận định; không mặc định có quyền quyết định cuối |

Giới hạn một dispute không có nghĩa cấm cung cấp thêm bằng chứng. Có thể gom bổ sung vào hồ sơ tranh chấp đang mở; quyền bổ sung, thời hạn và cách đóng hồ sơ phải được định nghĩa.

### 4. Dòng thời gian cụ thể

Ví dụ dùng UTC để thống nhất log và timestamp:

```text
01/10/2026 09:00 UTC: assigned verifier accept M2, review bắt đầu
04/10/2026 09:00 UTC: reviewEnd
```

Trong ví dụ:

- Trước reviewEnd: người đủ điều kiện có thể challenge.
- Tại hoặc sau reviewEnd: không được mở challenge thông thường; có thể settle nếu không dispute và đủ điều kiện khác.
- Một transaction gửi trước hạn nhưng thực thi sau hạn có thể bị từ chối.

Nếu Minh challenge ngày 02/10 lúc 10:00 và chọn resolver deadline bảy ngày từ lúc mở dispute:

```text
resolveBy = 09/10/2026 10:00 UTC
```

Đây là thời hạn mới của dispute; không phải tới reviewEnd ngày 04/10 thì tự bỏ qua challenge.

72 giờ là mặc định đã chốt và hiện có trong contract. Bảy ngày cho resolver chỉ là ví dụ; timeout, no-quorum và hệ quả tài chính chưa chốt.

### 5. Quy trình challenge qua Web2 và blockchain

#### Bước 1 — Minh đọc bằng chứng

Frontend lấy metadata qua API, lấy file theo quyền truy cập. Người xem có thể đối chiếu commitment để biết đang xem đúng bộ đã nộp.

#### Bước 2 — Minh nhập lý do và đính kèm tài liệu

Nội dung dài và file lưu off-chain. Backend xác thực người gửi, kiểm tra quyền upload và lưu bản draft.

Ví dụ lý do: “Manifest M2 version 1 ghi hai thiết bị; biên bản bàn giao chỉ ghi một.” Lý do phải gắn với campaign, milestone và version cụ thể.

#### Bước 3 — Minh mở challenge bằng ví

Ví gửi giao dịch kèm định danh mốc, commitment lý do hoặc dữ liệu cần thiết theo schema đã chốt.

Contract kiểm tra donor eligibility từ nguồn có thẩm quyền, state REVIEW, thời hạn và chưa có dispute vi phạm giới hạn. Không tin frontend gửi `isDonor = true`.

Nếu thành công, contract ghi DISPUTED và event. Draft trong database chưa đủ để khóa settlement nếu giao dịch chưa thành công.

#### Bước 4 — Backend/indexer cập nhật hồ sơ và thông báo

Indexer đồng bộ event. Backend có thể tạo thông báo cho Organizer/Resolver. Thông báo hỗ trợ vận hành; việc gửi email thành công không phải điều kiện tự xác nhận dispute đã ghi on-chain.

#### Bước 5 — Lan giải trình, Verifier nhận xét

Nội dung bổ sung được version hóa và gắn vào hồ sơ. Không xóa bộ evidence ban đầu để thay bằng ảnh mới mà mất lịch sử.

#### Bước 6 — Resolver ra quyết định

Resolver kiểm tra hồ sơ, nhập kết quả và lý do trên giao diện quản trị, rồi ký giao dịch theo quyền protocol.

Nếu lý do dài lưu off-chain, on-chain có thể ghi commitment và mã kết quả. Contract giới hạn lựa chọn kết quả và hệ quả, không cho Resolver tự chuyển tiền đến nơi tùy ý.

#### Bước 7 — Contract áp dụng hệ quả và UI đồng bộ

Kết quả được phản ánh qua event/state. Nếu milestone bị từ chối, hệ thống đi tới đường hủy/settlement phù hợp; nếu được chấp nhận, có thể mở mốc tiếp theo theo state machine.

### 6. Phân biệt kết quả tranh chấp và phân loại lỗi

Không nên chỉ dùng một bool `pass` vì có thể hiểu là milestone pass hay challenge pass.

| Kết quả minh họa | Ý nghĩa | Hệ quả cần định nghĩa |
|---|---|---|
| Challenge rejected, milestone accepted | Phản đối không đủ căn cứ theo quy trình | Cho phép tiến tiếp, không tự slash |
| Challenge upheld, normal failure | Có vấn đề khiến mốc không hoàn tất, nhưng chưa kết luận misconduct | Hủy/điều chỉnh theo rule; không tự slash vì thất bại |
| Challenge upheld, misconduct established | Xác định vi phạm theo tiêu chí đã chốt | Hủy và xử lý bond/refund theo công thức |
| Inconclusive | Chưa đủ căn cứ | Cần đường escalation/timeout; không tự coi là fraud |

Các mã kết quả trên là đề xuất để thấy cần phân biệt gì. MVP có thể ít mã hơn nếu vẫn diễn đạt được mọi trường hợp phải xử lý.

### 7. Nếu Resolver không hoạt động thì sao?

Đây là bài toán **liveness**: hệ thống có đường đi tiếp hoặc đóng nghĩa vụ hay không.

| Cách xử lý | Ưu điểm | Đánh đổi |
|---|---|---|
| Chuyển cho backup resolver đã chỉ định | Giữ được đánh giá nội dung | Backup vẫn có thể không hoạt động |
| Hết hạn thì tự accept | Dễ tiếp tục campaign | Có thể giải phóng bond và tiếp tục dù phản đối đúng |
| Hết hạn thì hủy, refund tiền chưa release, giữ bond chờ xử lý | Ngăn mở thêm exposure | Bond vẫn có thể bị khóa vô hạn nếu không có đường cuối |
| Quy tắc terminal xác định sẵn cho cả bond khi timeout | Có thể kết thúc nghĩa vụ | Phải chấp nhận đánh đổi về công bằng và khả năng bị lợi dụng |

Một timeout chuyển sang backup chỉ là bước trung gian, chưa đủ nếu không quy định backup cũng timeout thì sao.

**Hủy campaign nhưng giữ bond vô thời hạn chỉ giải quyết một phần liveness.** Tài liệu này không chọn ngầm auto-slash hay auto-return. Team phải chốt đường cuối và lý do trước khi freeze architecture.

Việc đến hạn không tự gửi giao dịch: cần một actor/worker gọi action timeout, còn contract kiểm tra điều kiện.

### 8. Challenge stake và spam

Không có stake giúp donor dễ phản đối, nhưng có thể tăng challenge thiếu căn cứ. Chỉ cho donor cũng không loại bỏ spam vì kẻ phá có thể góp một lượng nhỏ.

Nếu dùng stake, cần chốt:

- Token và số stake.
- Hoàn khi nào, bị mất khi nào, mất vào đâu.
- Resolver không xử lý thì stake ra sao.
- Nếu challenge bị bác bỏ nhưng người gửi có thiện chí, người đó có luôn bị phạt stake không?

Stake không thay thế thẩm định và không mặc định giải quyết Sybil — việc một người tạo nhiều địa chỉ/tài khoản.

Đối với prototype, có thể bỏ stake để tập trung kiểm tra flow; phải ghi nhận đây là giới hạn chống spam, không tuyên bố đã giải quyết.

### 9. Những trường hợp phải đưa vào rule

- File không truy cập được trong review: ai báo, có tạm dừng clock không, ai xác nhận sự cố?
- Organizer không nộp evidence: xử lý theo deadline thực hiện, không đợi review window chưa từng bắt đầu.
- Hai challenge đến gần nhau: transaction hợp lệ đầu tiên mở dispute; lần sau xử lý theo quy tắc duplicate/bổ sung.
- Resolve và timeout ở đúng điểm biên: guard thời gian phải không chồng lấn; transaction thực thi trước có thể đổi state khiến transaction sau bị từ chối.
- Resolver cũng là Organizer: chính sách xung đột lợi ích; so địa chỉ chỉ phát hiện trùng địa chỉ, không phát hiện cùng người dùng ví khác.
- Admin thay Resolver trong lúc dispute: có được phép, có thông báo và trì hoãn hay giới hạn nào?

### 10. Làm mục 1.7 ở đâu?

- Trong spec: bảng eligibility, thời gian, bằng chứng, kết quả, timeout và financial effect.
- Trong contract: guard, state dispute, deadline, quyền resolve và áp dụng hệ quả.
- Trong backend: hồ sơ tranh chấp, upload, quyền đọc, thông báo.
- Trong frontend: màn hình đọc hồ sơ, gửi challenge, giải trình và quyết định.
- Trong indexer: đồng bộ event để các bên thấy cùng tiến trình.

Để kiểm tra, diễn tập một dispute từ đầu đến cuối với các ví khác nhau và cả tình huống không có ai resolve. Đo số tiền trước/sau; challenge đơn thuần phải không tự làm mất bond theo định hướng tài liệu.

**Đầu ra:** mọi dispute có người xử lý, thời hạn và đường kết thúc nghĩa vụ được định nghĩa; nếu còn thiếu, đánh dấu rõ câu hỏi mở thay vì vẽ mũi tên “resolve” rồi xem là xong.

Nguồn: [Process — 1.7](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Threat Model — Challenge Principle, Governance Inactivity, Incorrect Bond Slashing](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

---

<a id="moc-1-8"></a>
## 1.8 — Protocol Invariants

> Các tính chất và test bên dưới là hướng dẫn thiết kế, chưa phải báo cáo contract đã được kiểm thử. Công thức đi kèm giả định để tránh dùng sai phạm vi.
>

### 1. Invariant là gì?

Invariant là tính chất phải giữ đúng ở mọi trạng thái hợp lệ trong phạm vi được định nghĩa.

Ví dụ: tổng tiền đã release cho M2 không được vượt budget 5.000. Hành động donate, challenge, resolve hoặc gọi lặp không được tạo ra đường khiến con số đó thành 10.000.

Phải phân biệt:

| Khái niệm | Ví dụ |
|---|---|
| Precondition — điều kiện trước hành động | Chỉ Organizer được submit evidence |
| Postcondition — kết quả sau hành động | Submit thành công ghi đúng commitment |
| Invariant — tính chất xuyên suốt | Tổng release của một milestone không vượt budget |
| Liveness — khả năng tiến triển | Dispute có đường kết thúc dù resolver không hoạt động |

Một hệ thống giữ tiền mãi mãi có thể không trả sai đồng nào nhưng vẫn thất bại về liveness. Không thay thế kiểm tra timeout bằng mỗi invariant “không mất tiền”.

### 2. Bắt đầu bằng định nghĩa biến

Trong ví dụ không có phí, một token đơn giản, không rebase và không trừ phí khi chuyển:

- `budget[m]`: ngân sách đã chốt của milestone m.
- `releasedGross[m]`: tổng token đã chuyển ra cho m; không giảm chỉ vì có tiền hoàn lại.
- `returnedFromOrganizer`: token thực nhận lại qua luồng thu hồi được ghi nhận.
- `bondDeposited`: tổng bond thực nhận.
- `bondReturned`: tổng bond đã trả Organizer.
- `refundPaid`: tổng refund đã trả donor.
- `escrowBalance`: số dư token thực của địa chỉ escrow trong phạm vi ví dụ.

Tên trường minh họa, không phải code hiện có. Phân biệt tổng lịch sử và số dư hiện tại để công thức không trừ/cộng hai lần.

### 3. Fund Safety — không release vượt ngân sách

```text
releasedGross[m] <= budget[m]
```

Với M2 budget 5.000:

- Activate lần đầu: gross release thành 5.000.
- Activate lại hoặc settle: không được chuyển thêm full budget.
- Nếu mô hình cho release từng phần, tổng các lần release vẫn không quá 5.000.

Ví dụ rule này không cho hoàn 1.000 rồi tự động release lại 1.000 nếu tổng gross đã là 5.000. Nếu sản phẩm muốn tái cấp khoản thu hồi, phải định nghĩa invariant khác và phạm vi chi tiêu; không tự đổi cách hiểu biến giữa các hàm.

**Ca kiểm tra:** gọi activate hai lần; release amount vượt phần còn lại một đơn vị; gọi resolve theo hai nhánh; thử đi tiếp sau cancellation.

### 4. Refund Safety — không trả vượt quyền

```text
claimed[donor] <= entitlement[donor]
sum(claimed) <= refundPoolSnapshot
```

Với pool 8.000, Minh có 1%, entitlement là 80. Sau claim 80, gọi lại không được chuyển thêm 80.

Nếu pool có nhiều đợt, phải dùng invariant tương ứng với entitlement tích lũy và số đã trả. Không áp công thức một snapshot cố định cho flow có tiền mới về mà không điều chỉnh.

**Ca kiểm tra:** đảo thứ tự donor claim; claim hai lần; contribution rất nhỏ; pool có rounding; chuyển token thất bại; dùng ví chưa đóng góp.

### 5. Bond Safety — đủ bảo đảm trong đúng giai đoạn

Process yêu cầu `LockedBond >= RequiredBond` trong active exposure period.

Ví dụ đang vận hành bình thường, M2 có exposure 5.000, bond chưa phân bổ phải đủ theo policy. Không được cho mở M2 khi bond còn 4.999.

Nhưng sau quyết định terminal phân bổ 5.000 bond cho donor, “bond còn khóa cho Organizer” giảm. Không vì vậy tự kết luận invariant sai nếu campaign đã bị đóng và bond chuyển thành nghĩa vụ refund đúng rule.

Cần viết rõ:

```text
Khi campaign còn có thể tạo/duy trì exposure theo đường vận hành:
    coverage phải thỏa policy

Khi xử lý terminal/slash:
    không tạo exposure mới
    tài sản được chuyển sang đúng nghĩa vụ theo quyết định
```

**Ca kiểm tra:** không đủ bond; trả bond giữa chừng; slash rồi vẫn cố activate mốc tiếp; thay budget sau khi tính bond.

### 6. Ordering và No Double Settlement

Hai tính chất khác nhau:

```text
Mốc i+1 chỉ được active nếu mốc i ACCEPTED theo rule
Một mốc chỉ có tối đa một final settlement
```

“Resolved” cần diễn đạt rõ: dispute được resolve bằng REJECTED không có nghĩa đủ điều kiện mở mốc sau.

No double settlement không có nghĩa không cho cập nhật bản nháp hoặc cung cấp giải trình. Nó giới hạn quyết định cuối và tác động cuối của mốc.

**Ca kiểm tra:** activate M2 trước M1; M1 bị rejected rồi activate M2; settle sau resolve; resolve lại; gọi complete trước mốc cuối.

### 7. Funding Failure và Honest Failure

```text
Sau deadline, raised < goal:
    không được mở milestone
```

Tính chất này phải được guard ngay cả khi chưa ai gửi giao dịch finalize. Không nên có cửa sổ “chưa finalize nên vẫn activate được”.

Hai tính chất bổ sung từ Threat Model:

- Challenge tự nó không slash bond.
- Project failure đơn thuần không tự đồng nghĩa misconduct để slash.

**Ca kiểm tra:** mở challenge rồi kiểm tra bond chưa bị phân bổ; honest failure không tự đốt bond; chỉ decision hợp lệ mới kích hoạt hệ quả tương ứng.

### 8. Conservation of Funds — không tạo hoặc làm biến mất tiền trong sổ

Một phương trình tổng quát cho ví dụ, dùng lượng thực nhận/thực trả:

```text
donationsReceived + bondDeposited + returnedFromOrganizer
    = escrowBalance + releasedGrossTotal + refundPaid + bondReturned
```

Phạm vi: không phí, không token lạ gửi thẳng, không transfer fee/rebase, không có khoản chi khác. Nếu có những dòng đó, phải đưa vào phương trình hoặc theo dõi surplus riêng.

Slash trong cùng escrow chỉ đổi phân bổ nghĩa vụ, chưa phải một dòng token chuyển ra; không cộng slash như tiền mới nạp.

#### Ví dụ trước và sau slash M2

Trước refund:

```text
Input: 10.000 donation + 5.000 bond = 15.000
Output/state: 7.000 đã release + 8.000 trong escrow = 15.000
```

8.000 trong escrow gồm 3.000 donation chưa release và 5.000 bond. Quyết định slash chuyển bond sang quyền donor; balance vẫn 8.000.

Sau refund hết 8.000:

```text
15.000 = 0 escrow + 7.000 release + 8.000 refund + 0 bond return
```

#### Ví dụ thu hồi 1.000, slash 4.000, trả bond còn 1.000

```text
Input: 10.000 + 5.000 + 1.000 = 16.000
Output: 7.000 gross release + 8.000 refund + 1.000 bond return = 16.000
```

Gross release không giảm, còn thu hồi được ghi ở phía input. Nếu vừa giảm release vừa cộng thu hồi sẽ đếm hai lần.

#### Khi có người gửi token trực tiếp ngoài hàm donate

Token balance có thể lớn hơn sổ nghĩa vụ. Không được nhận mọi khoản gửi thẳng là donation có quyền refund khi thiếu thông tin accounting.

Một kiểm tra solvency hữu ích:

```text
actualTokenBalance >= tổng nghĩa vụ còn được escrow bảo đảm
```

Các nhóm nghĩa vụ phải không chồng lấn. Tiền đã chuyển từ bond ledger sang refund ledger không còn được tính đồng thời vào cả hai.

Phương trình trong Threat Model dùng `VerifiedReleased + PendingExposure`. Khi campaign bị từ chối và có khoản không thu hồi được, cần định nghĩa khoản đó nằm trong nhóm nào. Không được làm tiền biến mất khỏi phương trình chỉ vì đổi tên state.

### 9. Evidence integrity cũng có invariant

- Bộ evidence đang review không được thay nội dung dưới cùng version/commitment.
- Dispute phải trỏ đúng bộ evidence đang bị phản đối.
- Thay version phải qua transition được cho phép.

Không biến điều kiện “hash chưa từng thấy” thành bảo đảm không có hóa đơn trùng: scan lại cùng hóa đơn có thể tạo hash khác. Quy tắc nhận diện expense cần phạm vi và dữ liệu riêng.

### 10. Unit test, fuzz test và invariant test khác nhau thế nào?

| Loại | Cách thử | Ví dụ |
|---|---|---|
| Unit test | Chọn tình huống cụ thể | Minh claim 80 rồi claim lại |
| Fuzz test | Thay đổi dữ liệu đầu vào trong phạm vi | Nhiều mức contribution và pool, kiểm tra tổng refund |
| Stateful invariant test | Thử nhiều chuỗi hành động và kiểm tra tính chất | Donate → finalize → activate → challenge → resolve → claim |

Foundry hỗ trợ invariant test trên chuỗi lời gọi được tạo ngẫu nhiên; tên hàm invariant thường có tiền tố `invariant_`. Handler có thể giúp tạo hành động và dữ liệu có ý nghĩa cho campaign. [Foundry: Invariant Testing](https://getfoundry.sh/forge/invariant-testing).

Handler là code trong bộ test, không phải một backend production mới. Nó có thể biết các ví thử nghiệm, số tiền hợp lệ và cách đưa thời gian tới deadline để khám phá nhiều nhánh.

Nếu mọi lời gọi đều bị revert vì sai trạng thái, test có thể “pass” mà gần như chưa kiểm tra đường có tiền. Cần xem các action đã thực sự thành công và các failure path có được đi qua không.

### 11. Viết và chạy ở đâu?

Process dự kiến dùng Foundry cho contract prototype. Khi đã có dự án Foundry, cấu trúc minh họa:

```text
src/Campaign.sol
test/Campaign.t.sol
test/CampaignInvariant.t.sol
```

Đây là vị trí đề xuất, không khẳng định đã tồn tại. Mở terminal tại thư mục dự án có `foundry.toml`, sau khi Foundry và dependency cần thiết đã được thiết lập:

```sh
forge test
```

Kết quả mong đợi là các test được thực thi và báo pass/fail. Chưa có contract/test thì chạy lệnh không chứng minh thiết kế đúng. [Foundry: Tests](https://getfoundry.sh/forge/tests).

Một assertion minh họa, không phải file test đầy đủ:

```text
Sau mỗi action thành công:
    kiểm tra released[m] <= budget[m]
    kiểm tra claimed[i] <= entitlement[i]
    kiểm tra tài sản đủ cho nghĩa vụ hiện tại
```

### 12. Output của mục 1.8

Tạo bảng cho từng invariant: ID, diễn đạt, biến/đơn vị, phạm vi state, action có thể ảnh hưởng, ca test và giới hạn mô hình.

Ví dụ `INV-REFUND-01`: tổng refund paid không vượt pool đã phân bổ; áp dụng từ khi mở refund tới cuối; các action ảnh hưởng là finalize refund, claim và phân bổ thêm nếu có.

**Hoàn thành khi mỗi tính chất có nghĩa chính xác và có cách kiểm chứng; không chỉ có một danh sách khẩu hiệu “an toàn, đúng thứ tự, không mất tiền”.**

Nguồn dự án: [Process — 1.8](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Threat Model — Core Protocol Invariants](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

---

<a id="moc-1-9"></a>
## 1.9 — Output của Mốc 1

> Giải thích cách tổ chức và hoàn thành đặc tả. Các đoạn mẫu không có nghĩa team đã chốt rule. Bộ tài liệu giải thích 1.1–1.10 không tự thay thế năm đầu ra chính thức bên dưới.
>

### 1. Tại sao cần đầu ra bằng tài liệu?

Mốc 1 biến ý tưởng thành các quy tắc người khác có thể implement và test mà không phải tự đoán.

Nếu một người nghĩ activate đã chuyển tiền còn người khác nghĩ settle mới chuyển tiền, cả hai có thể viết code hợp lý theo cách hiểu riêng nhưng hệ thống trả tiền hai lần khi ghép lại.

Tài liệu ở đây là công cụ thống nhất giao diện giữa công việc của người viết contract, backend, frontend và người kiểm tra, không phải viết nhiều trang để đạt số lượng.

### 2. Năm đầu ra Process yêu cầu

| Đầu ra | Trả lời câu hỏi gì? | Nội dung chính |
|---|---|---|
| `protocol-spec.md` | Hệ thống vận hành theo bộ rule nào? | Actors, phạm vi, cấu hình, quyền, liên kết các quy tắc |
| `state-machine.md` | Từ mỗi trạng thái được đi đâu? | States, transitions, caller, guard, deadline, event, tác động tiền |
| `financial-rules.md` | Tiền được ghi nhận và phân bổ thế nào? | Donation, bond, release, thu hồi, slash, refund, rounding |
| Threat model | Có thể bị lạm dụng như thế nào? | Tài sản, giả định tin cậy, đường tấn công, biện pháp, rủi ro còn lại |
| `mvp-scope.md` | Phiên bản đầu làm tới đâu? | Có/không có, hành trình, tiêu chí hoàn thành, giới hạn |

Repo đã có [FundTogether Threat Model v0.2 — Charitable Crowdfunding.md](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>). Không cần tạo bản sao khác tên chỉ để giống chữ `threat-model-v0.2.md` trong Process. Có thể giữ file hiện tại, cập nhật theo quyết định sau này và dẫn liên kết từ spec.

### 3. Viết ở đâu, dùng gì?

Đây là file Markdown trong dự án, viết bằng editor như những file bạn đang đọc. Có thể xem bản render bằng trình xem Markdown và quản lý thay đổi qua Git nếu dự án dùng Git.

Một cách tổ chức tương lai, chỉ là đề xuất:

```text
docs/protocol/
    protocol-spec.md
    state-machine.md
    financial-rules.md
    mvp-scope.md

Threat Model hiện có → được dẫn liên kết từ protocol-spec.md
```

Không cần chuyển file hay tạo thư mục mới chỉ để hoàn thành phần giải thích hiện tại. Khi viết đặc tả thật, nên theo cấu trúc repo đang có.

Markdown spec không chạy trên server, không tự trở thành database và không tự điều khiển contract. Nó là đầu vào để con người implement và kiểm tra.

### 4. protocol-spec.md nên chứa gì?

Nó là điểm vào của bộ rule, không chép lặp toàn bộ chi tiết của mọi file khác.

Khung đề xuất:

```text
1. Mục tiêu và phạm vi protocol
2. Thuật ngữ và đơn vị token
3. Actor / permission matrix
4. Cấu hình campaign và milestone
5. Quyền sở hữu dữ liệu on-chain/off-chain
6. Tóm tắt lifecycle, liên kết state machine
7. Tóm tắt accounting, liên kết financial rules
8. Evidence và challenge policy
9. Danh sách event cần thiết và ý nghĩa
10. Invariants và giả định tin cậy
11. Quyết định đã chốt / câu hỏi còn mở
```

Ví dụ một rule đủ cụ thể để thảo luận:

> Trong phương án pre-funding, activate chuyển budget của milestone đúng một lần. Settlement không chuyển lại budget này. Mốc kế tiếp chỉ được active sau khi mốc trước ACCEPTED.

Nếu rule này chưa được team đồng ý, đánh dấu Proposed, không ghi như yêu cầu đã khóa.

### 5. state-machine.md phải hơn một sơ đồ

Sơ đồ giúp hình dung, bảng mới giải quyết các trường hợp cụ thể.

Một entry minh họa:

| Trường | Giá trị đề xuất |
|---|---|
| Action | finalizeFunding |
| State trước | FUNDING |
| Caller | Bất kỳ ai |
| Điều kiện | Đã tới deadline, chưa finalized |
| Kết quả | FUNDED nếu raised đủ goal; ngược lại FUNDING_FAILED |
| Tiền | Không tự chuyển token; nhánh fail mở quyền refund theo rule |
| Gọi lại | Bị từ chối hoặc không đổi state theo lựa chọn thống nhất; không tạo quyền hai lần |
| Nếu không ai gọi | Có thể có worker hỗ trợ; action vẫn cho người khác gọi |

Ngoài happy path, phải có evidence quá hạn, dispute, resolver timeout, cancellation và claim sau khi campaign đã terminal.

### 6. financial-rules.md cần đủ để tính bằng tay

Tài liệu phải định nghĩa mọi biến, không chỉ đưa công thức rồi để người đọc đoán pool chứa gì.

Nội dung cần có:

- Asset và decimals được cấu hình/kiểm tra thế nào.
- Raised có bao gồm bond không? Trong ví dụ là không.
- Goal và tổng budget có quan hệ gì? Trong ví dụ bằng nhau.
- Có nhận vượt goal không, vượt thì xử lý thế nào?
- Tiền chuyển ở activate hay settle?
- Bond lock/return/slash theo điều kiện nào?
- EligibleContribution là gì?
- Refund pool gồm khoản thực nhận nào?
- Snapshot, rounding, claim lặp và tiền thu hồi muộn xử lý ra sao?
- Phí protocol, gas, token gửi nhầm có nằm trong mô hình không?

Ví dụ phải tính được trace này:

```text
Donation 10.000; bond 5.000
M1 release 2.000 rồi accepted
M2 release 5.000 rồi bị hủy
Donation còn 3.000
Nếu slash hợp lệ 5.000 cho donor → pool 8.000
Minh đóng 100 → entitlement 80
```

Nếu hai người đọc ra pool 3.000 và 8.000 nhưng không chỉ ra khác nhau ở quyết định slash nào, spec chưa rõ.

### 7. Threat model không phải cam kết “đã an toàn”

Một dòng threat model có thể gồm:

| Thành phần | Ví dụ |
|---|---|
| Tài sản | Donation chưa release |
| Tác nhân | Organizer có thể hành xử xấu |
| Tấn công | Gọi activate hai lần để nhận tiền hai lần |
| Biện pháp | State guard + accounting giới hạn budget |
| Kiểm tra | Test gọi lặp và invariant release cap |
| Giới hạn còn lại | Chưa chứng minh bằng chứng ngoài đời là đúng |

Threat model cần cập nhật khi thay rule: thêm partial withdrawal, đổi quyền admin, thêm private evidence hoặc dùng nhiều token đều có thể mở đường lỗi mới.

Không đánh dấu rủi ro đã xử lý chỉ vì đã ghi một biện pháp trong Markdown; implementation và validation là các bước tiếp theo.

### 8. mvp-scope.md giúp tránh mở rộng vô hạn

MVP không phải mọi tính năng v0.2. Phải ghi rõ hành vi phiên bản đầu và giới hạn người dùng sẽ gặp.

Ví dụ scope đề xuất cho prototype:

| Có trong phạm vi | Để sau hoặc chưa chọn |
|---|---|
| Một token thử nghiệm | Nhiều token, native asset song song |
| Milestone tuần tự | Nhiều milestone chạy đồng thời |
| Public evidence giả/đã xử lý phù hợp | Hệ thống private evidence đầy đủ |
| Resolver tin cậy theo policy | Community voting, nhiều verifier đồng thuận |
| Refund đúng accounting | Reputation nâng cao |

Tiêu chí hoàn thành nên mô tả kết quả quan sát được, ví dụ donor claim thành công đúng số và không claim thêm lần hai. “Có trang refund” chưa đủ.

Một prototype mô phỏng decision resolver bằng ví thử nghiệm không phải hệ thống production đã giải quyết quản trị.

### 9. Quy trình hoàn thành Mốc 1

#### Bước 1 — Đọc và gom các rule hiện có

Lấy Process, Threat Model, Tech Stack làm nguồn. Ghi chỗ đã thống nhất, chỗ chỉ là baseline, chỗ có nhiều phương án.

#### Bước 2 — Lập decision log

Decision log là bảng theo dõi quyết định, không cần một hệ thống quản lý mới:

```text
ID | Vấn đề | Lựa chọn | Trạng thái | Lý do | File bị ảnh hưởng
```

Ví dụ: funding full-budget hay controlled withdrawal ảnh hưởng state machine, bond, refund và tests.

#### Bước 3 — Chốt đường đi và dòng tiền cùng nhau

Viết từng transition, đặt số dư bên cạnh, kiểm tra không trả cùng khoản ở hai bước.

#### Bước 4 — Diễn tập ít nhất ba kịch bản

1. Campaign hoàn thành toàn bộ.
2. Funding không đạt goal.
3. Dừng sau khi một milestone đã được pre-fund, có dispute và bond settlement.

Với mỗi kịch bản, trả lời tiền ở đâu, ai gọi tiếp, nếu không gọi thì sao, nếu gọi hai lần thì sao.

#### Bước 5 — Kiểm tra chéo các file

Nếu financial rules đổi sang release trước, state machine không được còn mô tả settle là trả full budget. Nếu mvp-scope nói public-only, backend spec không được mặc định đã có hệ thống private evidence.

#### Bước 6 — Ghi phiên bản được team đồng ý

Có thể dùng version của tài liệu hoặc commit Git đã thống nhất. “Freeze” nghĩa là có baseline để implement; vẫn có thể sửa sau khi phát hiện vấn đề nhưng phải cập nhật các phần phụ thuộc và test.

### 10. Trả lời sáu câu hỏi của Process

| Câu hỏi | Nơi phải tìm được câu trả lời |
|---|---|
| Tiền ở đâu tại mỗi state? | State machine + bảng accounting |
| Ai gọi action tiếp theo? | Actor matrix + transition table |
| Action thay đổi tiền thế nào? | Financial effect của transition |
| Gọi hai lần thì sao? | Rule idempotency/revert + test scenario |
| Actor không hoạt động thì sao? | Timeout/escalation/liveness policy |
| Campaign fail thì tiền đi đâu? | Failure classification + refund/bond rules |

### 11. Khi nào được sang Mốc 2?

Có thể làm prototype để học/thử nghiệm khi một số rule còn mở, nhưng phải gắn nhãn giả định. Không coi architecture đã khóa khi những quyết định thay đổi quyền giữ/chuyển tiền còn chưa rõ.

Trước baseline implementation chính thức, cần:

- Các công thức tính được bằng số cụ thể.
- Mọi action tài chính có quyền, guard và hệ quả rõ.
- Không còn mâu thuẫn release/settle.
- Dispute và bond có đường kết thúc đã chọn.
- Scope, event và invariant nhất quán.
- Danh sách kiểm tra có thể chuyển thành test.

**Tạo đủ năm tên file không chứng minh Mốc 1 đã xong; nội dung phải đủ để người khác implement mà không phải tự quyết hộ các rule tài chính.**

Nguồn: [Process — 1.9 và Definition of Done](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md).

---

<a id="moc-1-10"></a>
## 1.10 — Các quyết định cần chốt trước khi implement

> Đây là tài liệu giải thích lựa chọn và đánh đổi. Những phương án được đề xuất phục vụ MVP/prototype chưa phải quyết định chính thức thay mặt team.
>

### 1. Mục 1.10 khác các mục trước thế nào?

Các mục 1.1–1.8 giải thích những phần cần thiết kế. Mục 1.10 yêu cầu team chọn phương án cụ thể để người viết code không tự đoán.

Ví dụ “có bond” chưa đủ: bond là token nào, khóa lúc nào, slash ra sao? Chọn những câu trả lời khác nhau có thể tạo ra hai kiến trúc khác nhau.

Mỗi quyết định nên có:

```text
Câu hỏi → Lựa chọn → Lý do → Phần bị ảnh hưởng
        → Ví dụ kiểm chứng → Trạng thái đã chốt/chưa chốt
```

Mục 1.10 trong Process có tám câu Q1–Q8. Cuối Process còn nhấn mạnh challenge stake và vai trò bắt buộc/tùy chọn của Verifier; tài liệu này giải thích thêm hai điểm đó ở phần 10–11, không đổi số câu gốc.

### 2. Q1 — Donation dùng asset nào?

#### 2.1 Asset nghĩa là gì?

Asset ở đây là tài sản contract nhận làm donation. Với MVP có thể là token ERC20 thử nghiệm, thay vì hỗ trợ đồng thời token và native coin.

- **ERC20:** token có contract riêng quản lý số dư và giao diện chuyển token.
- **Native coin:** tài sản gốc của mạng, ví dụ ETH trên Ethereum; cách nhận/chuyển khác với ERC20.
- **MockUSDC:** token thử nghiệm mô phỏng một số hành vi phục vụ kiểm thử. Tên gọi không biến nó thành USDC thật, không tạo bảo chứng hoặc giá trị quy đổi.

#### 2.2 Một token giúp đơn giản ở đâu?

Với một token đã chọn:

```text
Goal, milestone budget, bond và refund
    → cùng một đơn vị kế toán
    → không phải quy đổi giữa nhiều tài sản
```

Nếu nhận cả ETH và một stablecoin, cần trả lời thêm: goal đo bằng gì, khóa tỷ giá lúc nào, token biến động thì tính đủ goal ra sao, refund bằng tài sản nào?

#### 2.3 Ví dụ lựa chọn cho prototype

Theo khuyến nghị trong Process, có thể bắt đầu với một MockUSDC có địa chỉ cố định theo từng môi trường, cấu hình 6 decimals trong ví dụ.

```text
Người dùng nhập: 100 MockUSDC
Giá trị nguyên gửi contract: 100.000.000 đơn vị nhỏ nhất
```

Không dùng tên/symbol để nhận diện token; cần đúng chain và địa chỉ token. Địa chỉ triển khai là thông tin cấu hình, không phải private key.

ERC20 quy định các thao tác như `approve` và `transferFrom`; `decimals` là metadata tùy chọn của chuẩn, vì vậy triển khai phải biết cách xử lý token đã chọn thay vì giả định mọi token giống nhau. [Chuẩn ERC20](https://eips.ethereum.org/EIPS/eip-20).

#### 2.4 Làm ở đâu?

| Phần | Việc cần làm |
|---|---|
| Spec | Ghi asset, decimals, token behavior được hỗ trợ |
| Contract | Gắn token hợp lệ, nhận/chuyển và ghi accounting đúng |
| Frontend | Hiển thị đơn vị, chuyển đổi amount chính xác, dùng đúng chain/address |
| Backend/indexer | Gắn dữ liệu với đúng mạng và contract |
| Test | Sai token, allowance thiếu, balance thiếu, amount ở đơn vị nhỏ nhất |

Một mock chuyển đúng số tiền không chứng minh contract tương thích mọi token có transfer fee, rebase, blacklist hoặc cơ chế khác. Nếu chưa hỗ trợ, ghi giới hạn rõ.

Việc không nhận native coin làm donation không đồng nghĩa người dùng không cần native coin để trả gas trên mạng được chọn.

### 3. Q2 — Bond có dùng cùng token với donation không?

#### 3.1 Hai lựa chọn

| Phương án | Điều cần xử lý |
|---|---|
| Donation và bond cùng token | So sánh lượng bảo đảm trong cùng đơn vị |
| Donation và bond khác token | Cần cơ chế định giá, cập nhật coverage, xử lý biến động và nguồn giá |

Ví dụ donation tính bằng MockUSDC, exposure 5.000 và bond cũng 5.000 MockUSDC: so sánh trực tiếp số lượng token theo alpha = 1.

Nếu bond là ETH, số ETH đủ hôm nay có thể không còn đủ theo tỷ giá ngày mai. Khi đó phải thiết kế oracle — nguồn đưa dữ liệu giá vào cơ chế — và nhiều rule bổ sung.

#### 3.2 Đề xuất để học/triển khai MVP

Dùng cùng token như định hướng Process để tập trung kiểm tra luồng bond thay vì thêm bài toán định giá.

Tuy cùng token, donation ledger và bond ledger vẫn phải tách. Nếu balance contract là 15.000 thì không suy ra raised là 15.000; trong ví dụ donation 10.000 và bond 5.000.

#### 3.3 Ghi quyết định thế nào?

Một entry Proposed có thể là:

> Bond và donation dùng cùng token cấu hình cho campaign. Bond không được tính vào funding goal. Required bond được tính từ milestone budgets và cơ chế exposure đã thống nhất.

Kiểm tra bằng case: chỉ khóa bond mà chưa ai donate thì raised phải vẫn bằng 0.

### 4. Q3 — Release toàn budget trước hay controlled withdrawal?

Đây là lựa chọn ảnh hưởng mạnh nhất đến state machine, exposure, evidence và accounting.

#### 4.1 Phương án A — pre-fund toàn milestone

Với M2 budget 5.000:

```text
Activate M2
    ↓
Escrow chuyển 5.000 cho Organizer
    ↓
Organizer thực hiện công việc và nộp evidence
    ↓
Review / challenge
    ↓
Settlement xác nhận kết quả, không trả lại 5.000 lần nữa
```

Ưu điểm: ít action và dễ làm prototype. Đánh đổi: toàn bộ 5.000 rời escrow trước khi kết quả được accepted.

Những ví dụ xuyên suốt trong bộ tài liệu dùng phương án A, milestone tuần tự. Đây là giả định để giải thích nhất quán, không phải team đã chọn.

#### 4.2 Phương án B — controlled withdrawals / expense requests

M2 được cấp hạn mức 5.000 nhưng tiền chưa nhất thiết chuyển hết ngay:

```text
Activate M2, xác lập ngân sách 5.000
    ↓
Yêu cầu chi 1.000 cho hạng mục cụ thể
    ↓
Kiểm tra/duyệt theo rule
    ↓
Chuyển 1.000 tới người nhận được phép
    ↓
Tiếp tục các yêu cầu trong giới hạn budget
```

Phải quyết định ai duyệt, duyệt trước hay sau chi, người nhận là Organizer hay Vendor, hủy request ra sao và đối chiếu chứng từ nào.

“Milestone vault” là nơi giữ hoặc sổ phân bổ tiền của mốc theo thiết kế. Không nhất thiết phải tạo một contract mới cho mỗi mốc; có thể bắt đầu bằng accounting trong một prototype nếu đáp ứng yêu cầu.

#### 4.3 Điều kiện để B thực sự giảm exposure

Nếu được rút 1.000 năm lần liên tiếp mà chưa cần đối soát lần nào, exposure vẫn có thể lên 5.000.

B giảm exposure khi rule giới hạn tổng lượng chưa được xác minh hoặc giữ được kiểm soát chi thực chất. Thêm nút “Request expense” mà người nào cũng có thể tự approve không tự cải thiện an toàn.

#### 4.4 Chọn dựa trên điều gì?

- Muốn chứng minh lifecycle cơ bản trước: A dễ giới hạn scope hơn.
- Nghiên cứu kiểm soát giải ngân chi tiết: B có thể phù hợp hơn nhưng cần nhiều rules/tests.
- Với cả hai, phải mô tả thời điểm tiền rời escrow và cập nhật lại công thức bond/refund.

Đừng dùng sơ đồ A với kỳ vọng an toàn của B.

### 5. Q4 — Ai resolve dispute trong MVP?

#### 5.1 Resolver cần làm gì ngoài “bấm approve”?

Đọc bộ evidence đúng version, đọc challenge và giải trình, chọn kết quả trong phạm vi được phép, ghi lý do rồi ký quyết định theo protocol.

Process cho phép cân nhắc admin/trusted verifier cho MVP. “Trusted” nghĩa là mô hình đang đặt niềm tin vào bên đó; không phải blockchain đã chứng minh họ công bằng.

#### 5.2 Đề xuất có giới hạn

Có thể dùng một Resolver được chỉ định cho prototype, nhưng phải ghi:

- Địa chỉ nào có quyền và quyền áp dụng phạm vi nào.
- Ai được thay địa chỉ đó và khi nào.
- Có được xử lý campaign do chính mình tổ chức không.
- Deadline quyết định, backup/escalation và đường cuối khi timeout.
- Quyết định nào được phép tạo tác động slash/refund.

Giao diện quản trị là phần off-chain; quyền thực thi quyết định vẫn phải được contract kiểm tra. Đăng nhập admin website không tự cho phép ví gọi resolve.

#### 5.3 Điều chưa thể bỏ qua

“Hết bảy ngày chuyển cho backup” chưa hoàn chỉnh nếu backup cũng có thể không xử lý. Chọn terminal policy phải cân bằng liveness và công bằng, như đã phân tích ở [1.7](#moc-1-7).

Tài liệu này giữ quyết định đó là câu hỏi mở, không ngầm chọn auto-slash, auto-accept hoặc giữ bond vô hạn.

### 6. Q5 — Ai được challenge?

#### 6.1 So sánh ba lựa chọn trong Process

| Lựa chọn | Contract/backend cần kiểm tra gì? | Đánh đổi |
|---|---|---|
| Bất kỳ donor của hệ thống | Có lịch sử donation ở đâu đó | Người ngoài campaign cũng có quyền; cần nguồn xác định donor toàn hệ thống |
| Donor của chính campaign | Contribution tại campaign này | Dễ gắn lợi ích và dữ liệu on-chain; không loại bỏ người góp rất nhỏ để phá |
| Bất kỳ tài khoản đã xác minh | Trạng thái xác minh và liên kết ví/quyền | Phụ thuộc quy trình xác minh off-chain và cách đưa quyền đó tới contract |

Nếu hiểu “any donor” là donor của bất kỳ campaign nào, cần ghi như vậy. Không để hai người hiểu “any donor” theo hai phạm vi khác nhau.

#### 6.2 Lựa chọn minh họa trong bộ tài liệu

Ví có contribution > 0 trong chính campaign được challenge trong window. Không cần admin cấp một role donor toàn hệ thống.

Minh đã góp cho A không tự được challenge B. Nút challenge có thể bị ẩn khi không hợp lệ, nhưng contract phải tự kiểm tra vì người dùng có thể gọi trực tiếp.

Nếu cần cho Verifier hoặc người ngoài cung cấp báo cáo, có thể có đường gửi thông tin off-chain riêng. Báo cáo đó không tự trở thành challenge on-chain khi người gửi không có quyền theo rule.

### 7. Q6 — Phân biệt FAILURE / DEFAULT / FRAUD hay hai nhóm?

#### 7.1 Ba khái niệm nghiệp vụ

| Loại | Ví dụ | Không được suy ra ngay |
|---|---|---|
| Project failure | Sự cố khách quan khiến công việc không hoàn thành | Tự động slash Organizer |
| Default | Không thực hiện nghĩa vụ nộp bằng chứng/giải trình đúng rule | Tự động kết luận có chủ ý gian lận |
| Fraud | Bằng chứng đủ mạnh về hành vi giả mạo/chuyển sai mục đích theo quy trình | Ai tố cáo trước thì có quyền lấy bond |

Threat Model phân biệt ba loại. Process đặt câu hỏi liệu MVP có thể rút gọn thành NORMAL_FAILURE / MISCONDUCT.

#### 7.2 Rút gọn thế nào để không mất ý nghĩa?

Có thể dùng hai nhóm **kết quả xử lý** ở contract nếu rule vẫn xác định được khi nào một default đã trở thành misconduct được kết luận. Hồ sơ off-chain có thể giữ lý do chi tiết hơn.

Ví dụ chưa nộp evidence đúng hạn có thể mở quy trình xử lý nghĩa vụ, cho thời gian giải trình, rồi mới áp kết quả theo điều kiện định trước.

Không viết `missedDeadline → FRAUD → slash all` chỉ để giảm số trạng thái.

#### 7.3 Phần code bị ảnh hưởng

Enum/mã kết quả, quyền Resolver, công thức slash, event, UI hiển thị lý do và tests. Vì vậy phải định nghĩa bằng tình huống cụ thể, không chỉ tranh luận nên có hai hay ba tên.

### 8. Q7 — Refund theo original ratio hay unconsumed accounting?

#### 8.1 Original contribution ratio

Minh đóng 100 trên tổng 10.000, tức 1%. Nếu pool đã chốt là 8.000, Minh nhận 80 trước rounding ở đơn vị nhỏ nhất.

Ưu điểm: dễ giải thích và ít trạng thái accounting khi mọi donor cùng tài trợ theo tỷ lệ cho mọi milestone.

#### 8.2 Unconsumed contribution accounting

Theo dõi phần đóng góp nào đã được sử dụng và phần nào còn lại. Nó có ý nghĩa nếu sản phẩm cho tài trợ riêng một mốc, donor vào ở những giai đoạn khác nhau hoặc chi theo cơ chế phân bổ không đồng đều.

Nếu mọi khoản chi đều được trừ theo cùng original ratio, hai cách có thể tương đương dù có partial release. **Partial release không tự tạo khác biệt.**

Ví dụ A đóng 60, B đóng 40; chi 20 theo tỷ lệ thì phần còn lại 48/32 vẫn là 60/40. Chỉ trừ 20 từ A thì phần còn lại 40/40 mới khác.

#### 8.3 Đề xuất cho mô hình minh họa

Original contribution ratio phù hợp khi funding đóng trước các milestone và mọi khoản chi được chia sẻ theo tỷ lệ. Snapshot pool/denominator cần cố định cho đợt claim; không dùng pool giảm dần để tính entitlement người đến sau.

Phải chốt thêm rounding, tiền thu hồi muộn, phần bond vào pool và cách xử lý donation gửi ngoài đường chuẩn. Xem các phép tính ở [1.5](#moc-1-5).

### 9. Q8 — Evidence public-only hay có private ngay?

#### 9.1 Public-only trong MVP nghĩa là gì?

Người xem được đọc bộ evidence công khai theo policy. Nó không có nghĩa chấp nhận đưa mọi hồ sơ thật lên mạng.

Với demo, có thể dùng dữ liệu giả. Nếu dùng file thật cần tạo bản phù hợp để công khai, loại bỏ thông tin không cần thiết trước khi upload/commit. Bản đã che và bản gốc có hash khác nhau; phải ghi rõ đang cam kết và review bản nào.

#### 9.2 Private evidence kéo theo những gì?

- Xác định ai được xem: donor, verifier, resolver hay nhóm khác.
- Backend xác thực và kiểm tra quyền mỗi yêu cầu cấp quyền đọc.
- Storage không công khai, URL truy cập có thời hạn/phạm vi phù hợp.
- Quy trình liên kết file gốc, bản công khai và phiên bản.
- Cách donor challenge khi không được xem toàn bộ evidence.
- Hạn chế tiết lộ dữ liệu qua log, metadata, event và pointer.

Nếu chỉ nói “private = mã hóa file” nhưng không giải quyết ai giữ khóa và ai được giải mã thì thiết kế còn thiếu.

#### 9.3 Đánh đổi cần ghi trong scope

Public evidence giả/đã xử lý phù hợp giúp prototype đơn giản. Private evidence cần thiết nếu use case thực buộc xử lý tài liệu nhạy cảm; lúc đó không thể cắt bỏ chỉ vì muốn demo nhanh rồi đưa file nguyên bản lên công khai.

Ghi rõ lựa chọn nào áp dụng cho prototype, lựa chọn nào là điều kiện trước khi dùng dữ liệu thực tế.

### 10. Câu hỏi bổ sung từ cuối Process — Challenge có stake/fee không?

Stake là tài sản đặt cọc cho challenge; fee là khoản phí theo protocol. Cả hai khác phí gas của mạng.

MVP minh họa không dùng stake/fee protocol, nhưng người gửi giao dịch vẫn cần trả gas theo môi trường.

Nếu thêm stake, cần định nghĩa token, amount, thời điểm nhận, điều kiện hoàn/tịch thu và người nhận. Nó tạo thêm nghĩa vụ tiền trong contract và invariant; không chỉ thêm một ô nhập số trên form.

Stake có thể giảm một số hành vi spam nhưng cũng có thể làm người phản đối đúng không đủ khả năng tham gia. Không coi stake là giải pháp hoàn chỉnh chống nhiều ví giả.

### 11. Câu hỏi bổ sung — Verifier bắt buộc hay tùy chọn?

#### Tùy chọn

Verifier cung cấp nhận định, nhưng nhánh không challenge vẫn có thể settle khi đủ guard khác. Đây là giả định của ví dụ 1.3.

#### Bắt buộc

Mỗi milestone cần attestation hợp lệ trước khi chuyển bước. Khi đó phải thêm:

- Ai được cấp quyền Verifier và phạm vi của họ.
- Xác nhận có chữ ký hay transaction, gắn đúng campaign/milestone/version thế nào.
- Cần bao nhiêu xác nhận, có thể thu hồi không.
- Nếu họ không xác nhận hoặc không hoạt động thì sao.
- Challenge window bắt đầu trước hay sau attestation.

Không thể thêm Verifier bắt buộc mà giữ nguyên guard “hết thời gian và không challenge là settle” nếu chưa có xác nhận.

### 12. Bảng tóm tắt phương án đang dùng để minh họa

**Toàn bộ bảng là Proposed/Illustrative, chưa phải Approved.**

| Hạng mục | Giả định/đề xuất cho ví dụ | Cần quyết định thêm |
|---|---|---|
| Donation asset | Một MockUSDC thử nghiệm | Mạng, địa chỉ, decimals, token behavior |
| Bond asset | Cùng token donation | Ai nộp/nhận bond; điều kiện return/slash |
| Release | Full budget khi activate, tuần tự | Team có chọn A hay B không? |
| Resolver | Bên được chỉ định | Timeout cuối, thay quyền, xung đột lợi ích |
| Eligibility | Donor của campaign | Có ngưỡng/tư cách bổ sung không? |
| Failure | Phân biệt honest failure với vi phạm đã kết luận | Tiêu chí default/fraud và mức slash |
| Refund | Original ratio, pool snapshot | Thu hồi muộn, rounding, dust |
| Evidence | Public demo phù hợp | Khi dùng dữ liệu thật có cần private không? |
| Stake/fee | Không trong ví dụ | Chấp nhận giới hạn chống spam tới đâu? |
| Verifier | Optional trong happy path minh họa | Có bắt buộc trong protocol cuối không? |

Ngoài tám câu chính, còn các tham số cần thống nhất: goal cap/overfunding, thời điểm finalize, milestone deadlines, resubmission, review window, quyền pause và token gửi nhầm.

### 13. Quy trình team chốt thật

1. Đọc mỗi lựa chọn cùng ví dụ, đánh dấu chỗ chưa hiểu.
2. Ghi một quyết định bằng câu có thể kiểm chứng, tránh chỉ ghi “A” hoặc “B”.
3. Chạy lại ví dụ 10.000 / 2.000–5.000–3.000 để thấy tiền và state.
4. Cập nhật các tài liệu bị ảnh hưởng: spec, state machine, financial rules, threat model, scope.
5. Viết ít nhất một test scenario phân biệt lựa chọn đã chọn với phương án còn lại.
6. Chỉ đánh dấu Approved khi người có trách nhiệm đã đồng ý; giữ các câu hỏi chưa chốt nhìn thấy được.

Mẫu decision record minh họa:

```text
ID: DEC-RELEASE-01
Status: Proposed
Vấn đề: Thời điểm chuyển budget cho Organizer
Phương án: Chuyển full budget khi activate, không chuyển lại khi settle
Giả định: Milestone tuần tự; bond đủ trước activate
Đánh đổi: Dễ prototype, exposure bằng budget mốc đang hoạt động
Ảnh hưởng: State machine, bond formula, refund pool, tests
Kiểm chứng: Activate M2 trừ escrow 5.000; settle M2 không trừ thêm
```

**Mục 1.10 hoàn thành khi các lựa chọn làm thay đổi dòng tiền và quyền được chốt nhất quán; không phải khi tất cả câu hỏi đều có một câu trả lời ngắn.**

Nguồn: [Process — 1.10 và Các quyết định cần team trả lời trước implementation](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md); [Threat Model](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

## MVP baseline alignment

Baseline hiện tại: Anvil + ERC20 MockUSDC cho local; Arc testnet ưu tiên tích hợp, Arc là ứng viên production ưu tiên. Goal bằng tổng budgets; bond bằng budget lớn nhất; release sau settlement. Verifier admission/versioning bắt buộc trước review 72 giờ đã triển khai. Committee 2/3 đã chọn nhưng chưa có code; taxonomy, timeout và tài chính sau FUNDED vẫn OPEN. Originals truy cập hạn chế, bản redacted mới công khai; không còn baseline public-only.

---

## Rà soát mốc và hướng Arc — 2026-10-03

Ví dụ accounting đã cập nhật theo code: đạt goal sớm vào FUNDED; activate không release; review từ verifier accept; settlement mới trả budget. Timeout/appeals/no-quorum và slash sau FUNDED vẫn OPEN.

Arc testnet là hướng tích hợp ưu tiên, chưa deploy/kiểm chứng runtime. Xem
[bảng rà 10 mốc](../../FundTogether_Milestone_Review_2026-10-03.md) và
[Arc sources và checklist](../../FundTogether_Arc_Evaluation_v0.1.md).
Các yêu cầu Arc ở đây là TODO, không phải kết quả test/deploy.
