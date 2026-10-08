# FundTogether — Giải thích Mốc 3: Contract Hardening

> **Quyết định phạm vi mới nhất (2026-10-04):** MVP dùng resolver được cấp quyền,
> sau các bước kiểm tra hệ thống. Hội đồng 2/3 và ResolverManager để post-MVP.
> Các đoạn chọn 2/3 cho MVP bên dưới thuộc quyết định cũ, đã được thay thế;
> phần cơ chế hội đồng chỉ còn là tài liệu tham khảo cho post-MVP.

> Mốc này đánh giá prototype contract và tìm lỗi trước khi lấy ABI/event làm nền cho hệ thống Web2. Đây là giải thích quy trình, không phải audit hay xác nhận contract hiện an toàn.

## 1. Hardening giải quyết câu hỏi nào?

Mốc 2 hỏi: **contract có chạy được theo happy path không?** Mốc 3 hỏi: **các điều kiện xấu, chuỗi thao tác lạ và tương tác token có làm sai tiền/quyền không?**

Smart contract có thể giữ tiền mà không có nút “undo” của admin. Một lỗi điều kiện nhỏ có thể được gọi lặp bởi bất kỳ địa chỉ nào nếu hàm mở quyền.

Hardening là quy trình kiểm chứng tăng dần; chạy công cụ không đồng nghĩa đã tìm thấy mọi lỗ hổng.

## 2. Các loại kiểm tra và ví dụ

| Kiểm tra | Nó thử gì? | FundTogether example |
|---|---|---|
| Unit | Một hành vi riêng với input rõ | donor claim refund một lần |
| Negative/access control | Actor sai hoặc precondition sai | donor gọi `resolve` bị revert |
| Fuzz | Nhiều giá trị input | amount, budget, contribution nhiều cỡ |
| Invariant/stateful | Chuỗi call ngẫu nhiên, tính chất sau mỗi bước | tổng refund không vượt pool qua donate/settle/claim |
| Reentrancy | Token/callback gọi ngược trong lúc transfer | kiểm tra thứ tự cập nhật state và external call |
| Edge case | Điểm biên và state hiếm | đúng deadline, amount cực nhỏ, tổng bằng goal |
| Gas measurement | Chi phí lời gọi | campaign có số milestone/claim theo scope |
| Static analysis | Phân tích cấu trúc code theo pattern | Slither báo nguy cơ cần review |

Fuzz tìm input bất thường. Invariant test còn có thể tạo chuỗi hành động ngẫu nhiên. Hai loại bổ sung nhau, không thay thế nhau. Foundry cung cấp invariant testing qua các hàm `invariant_...`; cách tạo sequence phụ thuộc test harness. [Foundry invariant testing](https://getfoundry.sh/forge/invariant-testing).

## 3. Thực hiện trong project

1. Chọn một invariant đã định nghĩa ở 1.8.
2. Viết test kiểm tra tính chất thay vì chỉ kiểm tra một ví dụ may mắn.
3. Tạo handler/test actors để gọi các action hợp lệ theo nhiều thứ tự.
4. Chạy `forge test` và cấu hình mức fuzz phù hợp với môi trường.
5. Khi lỗi xuất hiện, lưu counterexample/trace, thu nhỏ thành test tái hiện rõ.
6. Sửa nguyên nhân; chạy lại test tái hiện và toàn bộ suite.
7. Chạy Slither trên source/config cụ thể; phân loại từng finding bằng lý do.
8. Ghi kết quả, commit/build/compiler version và vấn đề còn mở.

Trong terminal tại thư mục Foundry, các lệnh minh họa sau phụ thuộc phiên bản cài đặt và cấu hình dự án:

```sh
forge test
slither .
```

Đây là hướng dẫn dự kiến theo stack trong Tech Stack; cần kiểm tra tool có cài và repo có đúng loại dự án trước khi chạy. Output tool là dấu hiệu cần phân tích, không phải chứng nhận bảo mật.

## 4. Viết assertion gắn với tài sản thật

Invariant yếu: “function không revert khi amount bằng 1”.

Invariant hữu ích hơn:

```text
Sau mọi sequence hợp lệ:
    releasedGross[m] <= budget[m]
    refundPaid[i] <= entitlement[i]
    escrow token thực >= nghĩa vụ chưa thanh toán trong scope test
```

Đọc cả state nội bộ lẫn số dư token. Biến internal bị ghi sai có thể vẫn pass nếu test chỉ assert biến đó mà không đối chiếu transfer.

### Ví dụ test conservation

Đặt fixture 10.000 donation và 5.000 bond. Sau các action donate/activate/refund, đối chiếu:

```text
token nhận vào
= token còn trong escrow
 + gross token đã release
 + refund đã trả
 + bond đã trả Organizer
```

Nếu có transfer thu hồi, tính theo token thực nhận và không đếm nó vừa là “giảm release” vừa là “tiền mới vào”. Test balance token mock cùng sổ nghĩa vụ để tìm cả mismatch nội bộ lẫn transfer sai.

## 4.1 Tạo harness cho chuỗi action

Invariant harness là code test giúp sinh hành động có chủ đích, không phải thư viện production:

1. Tạo mock token và deploy Campaign vào EVM test.
2. Tạo địa chỉ test cho Organizer, Donor và Resolver.
3. Mint/approve token thử nghiệm cho đúng actor.
4. Handler gọi các action ở nhiều thứ tự, bỏ qua action khi precondition chưa đúng.
5. Sau mỗi call, assertion đọc contract và token balance.
6. Nếu sai, lưu sequence/counterexample rồi biến thành regression test.

Handler phải cho action quan trọng chạy được. Nếu nó luôn gọi `activateMilestone` trước khi goal đạt, mọi lượt đều revert và invariant “không vượt budget” có thể chưa từng quan sát đường release.

## 5. Reentrancy và token behavior

Reentrancy xảy ra khi một external call vào hợp đồng khác tạo lời gọi quay lại contract trước khi logic hiện tại hoàn tất. Test với mock token có callback có thể phơi bày thứ tự cập nhật chưa đúng.

Mô hình ERC20 MVP có thể giả định token chuẩn cụ thể, nhưng cần ghi phạm vi. Không tuyên bố hỗ trợ mọi token khi chưa kiểm tra transfer fee, callback, blacklist, rebase hoặc hành vi bất thường.

Dùng `SafeERC20` phù hợp interface giúp xử lý một số khác biệt return value; nó không tự làm toàn bộ accounting an toàn.

### Trình tự kiểm tra transfer

Với hàm claim, đọc theo các bước:

```text
1. Đọc state và quyền claim
2. Ghi claimed/đóng quyền claim trước
3. Gọi token transfer
4. Nếu transfer thất bại, transaction revert cả trạng thái cập nhật
5. Kiểm tra state, event và balance
```

Test mock token có callback có thể tìm lỗi reentrancy. Nếu transfer token thất bại, logic không được để state đã ghi nhưng tiền chưa ra.

## 6. Access control và thời gian

Thử mỗi role bằng ít nhất một địa chỉ đúng và một địa chỉ sai. Kiểm tra quyền cho từng campaign/milestone và trong state không hợp lệ.

Thử boundary deadline:

```text
deadline - 1 giây
đúng deadline
deadline + 1 giây
```

Thời gian test có thể được điều khiển bằng cheatcode local; điều này không tạo quyền tùy ý thay thời gian trên chain thật.

### Ma trận test quyền

| Action | Organizer | Donor đúng campaign | Donor campaign khác | Resolver đúng | Admin |
|---|---:|---:|---:|---:|---:|
| donate | Theo rule | Theo rule | Theo rule | Theo rule | Theo rule |
| submit evidence | Đúng state | Từ chối | Từ chối | Từ chối | Chỉ nếu được cấp quyền |
| challenge | Nếu đủ tư cách | Theo eligibility | Theo eligibility | Theo rule | Không tự có quyền |
| resolve | Nếu được chỉ định | Từ chối | Từ chối | Đúng dispute | Chỉ nếu được cấp quyền |

Các ô “theo rule” cần được điền từ protocol. Khi quyền gắn với một campaign, tạo hai campaign trong test để xác nhận quyền ở A không lan sang B.

## 7. Gas, giới hạn và pull payment

Refund cho mọi donor trong một vòng lặp có thể hết gas khi danh sách lớn. Kiểm tra quy mô và ưu tiên mỗi donor tự claim nếu financial rules chọn pull-payment.

Không benchmark con số gas của một local build rồi gọi đó là phí cố định production; phí phụ thuộc mạng, calldata và giá gas lúc giao dịch.

## 8. Slither và review kết quả

Slither là công cụ static analysis cho Solidity. Nó có thể gợi ý bug/pattern nguy hiểm nhưng finding có thể false positive, còn lỗi logic protocol có thể không bị bắt.

Quy trình xử lý finding:

```text
Finding
  → xem đúng source và đường gọi
  → hiểu tác động tới quyền/tiền
  → sửa hoặc ghi lý do loại trừ
  → review lại sau thay đổi
```

Không xóa dòng cảnh báo khỏi báo cáo để làm CI xanh mà không lưu quyết định.

Lưu report cùng commit SHA, phiên bản compiler và cấu hình đã chạy. Khi source đổi, báo cáo cũ không còn mô tả đầy đủ code mới.

### Diễn giải kết quả cẩn thận

| Quan sát | Chưa thể kết luận | Việc cần làm |
|---|---|---|
| Fuzz test pass | Không có input xấu nào tồn tại | Xem range, run count, action handler và state đã chạm |
| Slither không báo | Contract đã được audit | Review logic protocol, quyền, accounting và dependency |
| Finding là false positive | Có thể bỏ mọi finding tương tự | Xác minh từng đường gọi và ghi lý do review |
| Test local pass | Mạng thật/config thật giống local | Kiểm tra token, compiler, chain và deploy config riêng |
| Gas thấp ở fixture nhỏ | Mọi campaign chạy được | Ước lượng kích thước gần giới hạn scope; tránh loop không giới hạn |

## 9. Hai lớp security trong Development Order

Process có thể gây hiểu nhầm: Mốc 3 là Contract Hardening trước backend, nhưng Final Development Order còn ghi Security Hardening sau End-to-End MVP.

Có thể diễn giải thành hai lớp:

- **Trước tích hợp:** harden các rủi ro contract cốt lõi đủ để phụ thuộc ABI/state an toàn hơn.
- **Trước bất kỳ release có tiền/thực tế:** review/security assessment toàn hệ thống sau khi contract, backend, indexer, storage và frontend ghép lại.

Đây là cách làm rõ thứ tự, cần team xác nhận độ sâu/định nghĩa exit criteria. Review contract riêng không đánh giá sai lệch giữa API và chain hoặc lộ file private.

### Cổng kỹ thuật trước khi backend phụ thuộc ABI

- Action tài chính có caller/state rule và test balance.
- Refund, settlement, bond return/slash có test gọi lặp.
- Resolver, challenge và deadline có test quyền/boundary.
- Core invariants gắn với unit/fuzz/stateful tests phù hợp.
- Slither findings có trạng thái review, không có critical issue chưa xử lý.
- ABI/event được lưu từ build/compiler nhất quán.

Đây là cổng tích hợp, không phải chứng nhận public deployment. Việc review toàn hệ thống vẫn cần sau khi các service được nối.

## 10. Đầu ra của Mốc 3

- Test unit, negative/access-control, fuzz và invariant phù hợp các invariant đã chốt.
- Bản ghi Slither findings và cách xử lý.
- Ước tính/giới hạn gas liên quan scope.
- Counterexample đã sửa thành regression test.
- Danh sách giả định token, timeout, keeper/resolver và rủi ro còn tồn tại.
- ABI và event chưa được xem là freeze nếu còn thay đổi public interface.

**Hoàn thành khi biết kiểm tra nào đã chạy, trên phiên bản nào, kiểm tra gì, và điều gì vẫn chưa được bảo đảm.**

Nguồn: [Process — Mốc 3 và Final Development Order](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Tech Stack — Foundry, Slither, OpenZeppelin](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md).

## MVP baseline alignment

Hardening phải kiểm tra permissionless timeout, không release vượt budget, không claim refund hai lần, bond coverage theo maximum exposure, event đầy đủ cho indexer và quyền resolver trong phạm vi MVP. Committee 2/3 để post-MVP và chưa có code; không đồng nhất với Safe còn hoãn. AccessControl admission/versioning đã có; EIP-712 vẫn hoãn. Timeout/recovery ngoài funding failure và unchallenged settlement chưa triển khai.

## Rà soát mốc và hướng Arc — 2026-10-03

CHALLENGED chưa exit; admission timeout, organizer abandonment và post-funded refund/slash chưa có. TODO kiểm tra Arc blocklist/failed payout/atomic rollback, unsolicited native inflows và dust; không thêm admin sweep có thể lấy escrow/bond.

Arc testnet là hướng tích hợp ưu tiên, chưa deploy/kiểm chứng runtime. Xem
[bảng rà 10 mốc](../../FundTogether_Milestone_Review_2026-10-03.md) và
[Arc sources và checklist](../../FundTogether_Arc_Evaluation_v0.1.md).
Các yêu cầu Arc ở đây là TODO, không phải kết quả test/deploy.
