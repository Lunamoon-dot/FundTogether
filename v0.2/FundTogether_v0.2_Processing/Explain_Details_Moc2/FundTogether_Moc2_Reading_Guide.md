# FundTogether — Giải thích Mốc 2: Smart Contract Core

> **Quyết định phạm vi mới nhất (2026-10-04):** MVP dùng resolver được cấp quyền,
> sau các bước kiểm tra hệ thống. Hội đồng 2/3 và ResolverManager để post-MVP.
> Các đoạn chọn 2/3 cho MVP bên dưới thuộc quyết định cũ, đã được thay thế;
> phần cơ chế hội đồng chỉ còn là tài liệu tham khảo cho post-MVP.

> Hướng dẫn học và prototype. Các tên file/hàm là ví dụ, chưa khẳng định đã có trong repo hoặc đã được duyệt. Xem [Mục lục các mốc](../FundTogether_Processing_Reading_Guide.md).

## Mốc 2 nhằm làm gì?

Biến rules đã thống nhất ở Mốc 1 thành **một prototype contract duy nhất** có thể chạy trên blockchain thử nghiệm. Mục tiêu là chứng minh state machine và accounting, chưa phải ra mắt sản phẩm hay đảm bảo contract production an toàn.

## 2.1 Single Campaign Prototype

Single Campaign nghĩa là một instance campaign thực hiện toàn bộ vòng đời cơ bản. Không cần bắt đầu bằng Factory, BondManager, EvidenceRegistry và nhiều contract phối hợp.

Trong project Foundry, một cấu trúc học tập thường là:

```text
fundtogether-contracts/
    foundry.toml        # cấu hình dự án Foundry
    src/Campaign.sol    # contract triển khai
    test/Campaign.t.sol # kiểm tra hành vi
```

Đây là ví dụ cấu trúc; hãy đối chiếu repo khi tạo code. Bạn viết `.sol` trong editor, chạy lệnh từ terminal ở thư mục có `foundry.toml`, và đọc kết quả test trong terminal.

Prototype cần hỗ trợ flow đã chốt: tạo/cấu hình campaign, donate, finalize funding, khóa bond, kích hoạt mốc, commit evidence, challenge, resolve, xử lý refund, hoàn tất. Chỉ thêm action thật sự cần cho state machine.

## Đưa quy tắc vào contract

Một contract thường giữ các phần:

- **State variables:** goal, deadline, tổng raised, balances, bond, state.
- **Mapping/array:** contribution theo donor, milestones, entitlement.
- **Hàm external:** action mà wallet/contract khác gọi.
- **Guard:** điều kiện quyền và state trước khi action chạy.
- **Event:** thông báo on-chain cho indexer và công cụ quan sát.
- **Custom error/revert:** lý do action không được chấp nhận.

Pseudo-flow của `donate`:

```text
kiểm tra đang FUNDING và chưa quá deadline
kiểm tra amount > 0 và campaign cap còn đủ
nhận token theo cách an toàn
cập nhật contribution/raised
phát DonationReceived
```

Đây là thứ tự tư duy, không phải code production. Token ERC20 cần chú ý allowance: `approve` cấp quyền chi, `transferFrom` chuyển token theo quyền đó. Dùng thư viện phù hợp và xử lý kết quả transfer; không giả định mọi ERC20 hoạt động giống mock. [ERC20](https://eips.ethereum.org/EIPS/eip-20).

## Vì sao viết một contract trước?

Nhiều module quá sớm làm khó lần theo “action này cập nhật sổ nào, contract nào giữ tiền, lời gọi nào atomic”. Prototype đơn giúp tìm ra ranh giới thật cần module hóa sau khi logic ổn.

Đơn giản ở đây không đồng nghĩa nhét mọi trách nhiệm vào một hàm dài. Chia hàm/nội bộ rõ ràng, nhưng chưa triển khai kiến trúc contract phân tán khi chưa có nhu cầu.

## 2.2 Thứ tự thêm feature

Mỗi feature là một lát dọc: state + action + accounting + event cần thiết + tests.

| Lần | Feature | Câu hỏi cần kiểm chứng |
|---|---|---|
| 1 | Campaign config | Cấu hình sau khi publish có bị đổi trái rule không? |
| 2 | Donation | Ai gửi, amount nào, raised ghi đúng không? |
| 3 | Goal/deadline | Boundary `< deadline` / `>= deadline` nhất quán không? |
| 4 | Failed funding refund | Mốc không mở; mỗi donor nhận tối đa entitlement? |
| 5 | Bond | Asset, allowance, custody, coverage đúng không? |
| 6 | Milestones | Tổng budget/fields khớp campaign config không? |
| 7 | Sequential activation | M2 có bị mở trước resolve M1 không? |
| 8 | Evidence commitment | Ai commit, gắn đúng version/mốc không? |
| 9 | Review/challenge | Thời gian và eligibility có đúng không? |
| 10 | Settlement | Quyết định ghi nhận một lần, tiền chỉ chuyển theo mô hình đã chọn? |
| 11 | Cancellation | Stop action nào, tiền nào đang ở custody nào? |
| 12 | Remaining refund | Pool thật có đủ, snapshot và claim chính xác không? |
| 13 | Bond return/slash | Điều kiện, lượng và nơi nhận được giới hạn ra sao? |

Không làm reputation on-chain trước: nó phụ thuộc lịch sử kết quả đáng tin; gắn sớm tăng scope và khó sửa nếu protocol thay đổi.

### Mỗi feature cần có “contract” giữa các bước

Trước khi code `donate`, viết ngắn đầu vào, kết quả và lỗi có thể nhìn thấy:

```text
Input: donor wallet, amount raw units
Precondition: FUNDING, deadline còn hiệu lực, cap còn chỗ
Effect: token nhận vào escrow; raised/contribution cập nhật
Output: event chứa campaign, donor, amount
Failure: sai state, amount không hợp lệ, allowance/balance thiếu
```

Đây không phải giao diện HTTP. Đây là mô tả hành vi để contract test và frontend cùng hiểu một việc.

Tương tự, `claimRefund` cần xác định entitlement và amount còn lại; `resolve` cần xác định ai có quyền chọn kết quả nào; `activateMilestone` cần làm rõ có transfer tại activation hay chỉ tạo quyền rút. Không để những quy tắc khác nhau bị giấu trong tên hàm.

## 2.3 Viết test trước khi thêm feature tiếp

Ví dụ sau donation:

```text
donation hợp lệ thành công
zero donation bị từ chối
donation sau deadline bị từ chối
raised và contribution đúng
người không đủ token/allowance không tạo ghi nhận giả
```

Sau milestone:

```text
không mở M2 trước M1
tổng release không vượt budget
settle lần hai không tạo thêm payment
người sai quyền bị từ chối
```

Test là code trong `test/`, không phải testnet thật. Viết cho từng thay đổi trước khi layer kế tiếp giả định hành vi đó đã đúng. Tránh chỉ test happy path.

Lệnh khi repo Foundry đã sẵn sàng:

```sh
forge test
```

Mục tiêu là thấy từng test pass/fail; test pass chỉ xác nhận các assertion đã viết, không chứng minh mọi lỗi đã hết.

### Ví dụ một vòng thêm feature

Theo rule hiện tại, thêm `finalizeFundingFailure`:

1. Chỉ xử lý campaign còn FUNDING tại hoặc sau deadline.
2. Kiểm tra donate đạt goal chuyển ngay sang FUNDED.
3. Finalize failure trước deadline hoặc khi đã FUNDED bị từ chối.
4. Deadline failure snapshot/trả bond một lần; donor claim độc lập.
5. Implement FUNDING_FAILED; nhánh FUNDED nằm trong donate.
6. Chạy tests, đọc trace khi fail, sửa code hoặc sửa spec nếu phát hiện rule chưa thể thi hành.
7. Chỉ rồi mới thêm feature phụ thuộc, như activate milestone.

Nếu spec yêu cầu finalization được bất kỳ ai gọi nhưng test chỉ gọi bằng Organizer, suite chưa kiểm tra quyền permissionless.

Test tên “funding finalized” cũng cần assert cả state, số tiền, quyền refund ở failure và event. Chỉ assert không revert là quá yếu.

## Luồng demo local

```text
Test Foundry tạo trạng thái mock
    ↓
Test wallets gọi contract trong EVM cô lập
    ↓
Assertion đọc state/balance/event
    ↓
Kết quả hiện ở terminal
```

Nếu muốn bấm qua giao diện sau này có thể chạy node local; đó là bước tích hợp khác. Chưa cần khóa private key thật hay deploy mainnet để chứng minh accounting.

### Cách thao tác khi repo Foundry thực sự đã sẵn sàng

1. Mở terminal tại thư mục contracts; xác nhận `foundry.toml` và test scaffold tồn tại.
2. Đọc cấu hình Solidity, remappings và dependency trước khi thêm import mới.
3. Tạo mock ERC20 để test allowance/balance và một số actor riêng cho Organizer, Donor, Resolver.
4. Viết contract trong `src/`, test trong `test/`; dữ liệu riêng của môi trường nên ở script/config theo repo.
5. Chạy test local. Đọc tên test thất bại, revert reason/trace; không coi dòng summary xanh là đã chạy đủ edge cases.
6. Nếu cần xem transaction như người dùng, chạy local node riêng và dùng ví dev được tạo riêng cho môi trường đó.
7. Chỉ deploy testnet sau khi config/network addresses được kiểm tra. Local passing test không đòi hỏi testnet.

Tên file ở đây theo convention minh họa. Không đặt mnemonic/private key vào file `.sol`, test fixture đã commit hoặc frontend bundle. Test account local và account có tài sản thật phải tách.

### “Single Campaign” là một instance logic

Có thể dùng một contract prototype deploy cho một campaign thử nghiệm, chưa cần CampaignFactory tạo hàng loạt. Contract vẫn nhận campaign config và milestones cụ thể; dữ liệu đó không nhất thiết được chia ra 10 contract ngay.

Để kết quả không mơ hồ, test nên dùng fixture riêng:

```text
campaignGoal = 10.000
budgets = [2.000, 5.000, 3.000]
organizer = account A
donor = account B
resolver = account C
```

Fixture không chứng minh thiết kế dùng được cho mọi campaign; nó là scenario có thể tái lập. Viết thêm ít nhất một scenario khác cho giới hạn amount/deadline.

### Khi nào nên ngừng thêm feature?

Ngừng mở scope khi flow tạo–fund–finalize và các nhánh funding fail/happy path đã kiểm chứng được. Đừng thêm reputation chỉ để demo có nhiều event. Trước khi Mốc 2 kết thúc, phải có đường mid-campaign cancellation và remaining refund đủ để xác nhận prototype phủ failure path Process yêu cầu; nếu chưa, ghi rõ việc đó còn lại, không gọi lifecycle hoàn chỉnh.

## Definition of done cho mỗi feature

- Rule liên kết tới protocol spec.
- Guard đúng quyền/state.
- State và token balance thay đổi chính xác.
- Event đủ trường để consumer dự kiến dùng.
- Test hợp lệ, sai điều kiện, gọi lặp và biên quan trọng.
- Không phá invariant trước đó.

Ở Mốc 2 có thể đánh dấu “prototype hoàn tất”, nhưng chưa gọi “production safe”. Những kiểm tra hardening nằm ở Mốc 3.

Nguồn: [Process — Mốc 2](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Tech Stack — Smart Contracts/Foundry](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md).

## MVP baseline alignment

Prototype contract nên bắt đầu với ERC20 MockUSDC, milestone tuần tự, bond bằng cùng token và các đường `fund → milestone → settlement → refund`. Committee 2/3 để post-MVP và chưa có code; Safe và EIP-712 là cơ chế riêng còn hoãn. Restricted originals/public redactions đã được đặc tả; storage chưa có. Reputation on-chain sau MVP.

## Rà soát mốc và hướng Arc — 2026-10-03

Một FundTogether.sol hiện quản lý nhiều campaignId. Prototype đã có funding, bond, criteria, admission và unchallenged settlement. Arc Foundry/compiler/EVM target/precompile validation còn TODO; 129 tests là kết quả lịch sử, không phải lần chạy mới hoặc bằng chứng tương thích Arc.

Arc testnet là hướng tích hợp ưu tiên, chưa deploy/kiểm chứng runtime. Xem
[bảng rà 10 mốc](../../FundTogether_Milestone_Review_2026-10-03.md) và
[Arc sources và checklist](../../FundTogether_Arc_Evaluation_v0.1.md).
Các yêu cầu Arc ở đây là TODO, không phải kết quả test/deploy.
