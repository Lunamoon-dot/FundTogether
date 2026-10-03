# FundTogether — Giải thích Mốc 5: Blockchain Indexing & Sync

> Ponder và PostgreSQL là stack được đề xuất trong Tech Stack. Sơ đồ, schema và thuật toán dưới đây giải thích trách nhiệm chung; không phải xác nhận đã có indexer chạy trong repo.

## 1. Indexer giải quyết vấn đề gì?

Blockchain lưu trạng thái contract và events. Website lại cần truy vấn như “liệt kê campaign mới”, “campaign A nhận bao nhiêu donation”, “Minh đã claim refund chưa”. RPC có thể đọc dữ liệu, nhưng tự xây mọi trang bằng hàng loạt truy vấn log mỗi lần tải vừa tốn kém vừa khó phân trang.

Indexer là chương trình đọc chain và biến dữ liệu thành bảng truy vấn tiện cho API.

```text
Smart contract phát event
    ↓
Ponder/indexer đọc RPC từ block đã chọn
    ↓
Đổi event thành bản ghi domain
    ↓
Ghi PostgreSQL + checkpoint
    ↓
Backend API đọc projection
    ↓
Frontend hiển thị
```

Event không tự đi vào PostgreSQL. Một tiến trình indexer phải chủ động đọc và ghi nó.

## 2. “Nguồn sự thật” và “bản sao để đọc”

Nếu giao dịch donation thành công trên contract nhưng indexer đang dừng:

```text
Trạng thái on-chain: đã nhận 100
Projection PostgreSQL: có thể còn hiện 0 hoặc pending
```

Đây là trễ đồng bộ, không nên sửa bằng cách để admin gõ `raised = 100`. Cần làm indexer chạy lại/đối chiếu.

Database projection tiện tìm kiếm nhưng không có quyền phát minh sự kiện chưa tồn tại trên chain. UI nên chỉ ra đang đồng bộ khi có lý do và trạng thái tx riêng.

## 3. Event cần thiết kế thế nào?

Process liệt kê campaign created, donation received, funding finalized, bond locked, milestone activated, evidence submitted, challenge opened, settlement, refund available/claimed và bond returned/slashed.

Ví dụ event minh họa:

```text
DonationReceived(campaignId, donor, amount)
```

Để indexer dùng được, phải trả lời:

- Có chain ID và contract address nào là nguồn?
- `campaignId` là globally unique hay chỉ trong một contract?
- Amount là integer raw units hay decimal string đã format?
- Event chứa giá trị nào, giá trị nào phải đọc state lại?
- Event nào đại diện quyết định cuối, event nào chỉ là request?

Địa chỉ và transaction hash cần normalize/lưu lossless. Amount token thường lưu số nguyên dạng decimal string hoặc numeric type phù hợp; không dùng JS `number` cho token amount lớn.

Event nên diễn tả thay đổi đã được contract chấp nhận. Đừng phát `DonationReceived` trước khi token transfer/accounting thành công.

## 4. Identity event để chống duplicate

Một `txHash` có thể có nhiều logs. Dùng một khóa idempotency như:

```text
chainId + transactionHash + logIndex
```

Có thể bổ sung contract address theo schema. Ràng buộc unique trong database khiến retry cùng log không cộng donation lần hai.

Nếu indexer đọc lại event sau restart:

```text
INSERT event nếu chưa có
    ↓
project state chỉ từ một event đã được ghi nhận
    ↓
retry cùng event: conflict/no-op, không cộng tiếp
```

Không dùng thời gian event làm unique key; nhiều event xảy ra gần nhau.

## 5. Checkpoint và retry

Checkpoint ghi mốc block/progress của tiến trình đọc. Ví dụ block 1.000 đã xử lý; worker đọc tiếp sau đó.

Ghi projection và checkpoint phải được tổ chức để lỗi giữa chừng không bỏ qua event:

- Ghi event + projection + checkpoint trong một transaction database nếu cơ chế hỗ trợ, hoặc
- Ghi event idempotently trước; chỉ cập nhật checkpoint sau khi mọi event tới block đã xử lý thành công.

Nếu checkpoint đi trước khi projection được ghi, restart có thể nhảy qua dữ liệu bị mất. Nếu checkpoint đi sau, có thể đọc lại nhưng duplicate handling phải an toàn.

Retry RPC cần backoff/giới hạn và log rõ lỗi. Retry không được biến lỗi tạm thành việc xử lý event nhiều lần.

### Luồng polling khi worker khởi động

1. Đọc `lastFinalizedBlock` và block hash đã lưu.
2. Lấy chain head, áp confirmation policy để chọn block an toàn.
3. Chọn range vừa phải từ checkpoint tới block đó.
4. Lấy logs cho đúng contract/topic.
5. Decode bằng ABI và mapping đúng phiên bản.
6. Ghi event idempotently, cập nhật projection rồi mới lưu checkpoint.
7. Nếu batch lỗi, không tiến checkpoint qua phần chưa commit; ghi lỗi có thể retry.

Range lấy log cần giới hạn để RPC không trả payload quá lớn. Range thực tế phụ thuộc mạng/provider, không lấy một con số ví dụ làm cấu hình chung.

## 6. Confirmation và reorg

### Confirmation policy

Giao dịch trong block có thể còn bị thay thế do cơ chế fork/reorg của chain. Ứng dụng chọn chính sách chờ xác nhận phù hợp mạng và mức rủi ro; không dùng một con số chung cho mọi chain nếu chưa nghiên cứu.

UI có thể có các trạng thái riêng:

```text
submitted → included/pending confirmation → confirmed → indexed
```

Trạng thái “indexed” xác nhận database đã xử lý theo policy của app, không phải một cấp độ cuối cùng giống nhau trên mọi mạng.

### Reorg awareness

Lưu block number và block hash cho event/checkpoint quan trọng. Khi phát hiện parent/hash không còn khớp canonical chain, cần rollback projection bị ảnh hưởng hoặc rebuild từ block an toàn trước đó.

Nếu chỉ dedupe bằng txHash/logIndex nhưng không thể undo state do block orphaned, database có thể tiếp tục hiển thị donation không còn thuộc chuỗi canonical.

### Quy trình reconcile/rebuild

Khi block hash tại checkpoint không còn khớp:

1. Tìm checkpoint/parent block chung còn canonical.
2. Đánh dấu logs thuộc block orphaned là noncanonical hoặc rollback projection.
3. Đọc lại logs từ mốc chung theo thứ tự block/transaction/log.
4. Dựng lại projection và checkpoint.
5. API có thể báo đang đồng bộ lại nếu số liệu tạm thay đổi.

Nếu database chỉ giữ aggregate mà không có event ledger, undo chính xác rất khó. Lưu event nguồn hoặc có replay path là quyết định schema, không đợi có reorg mới nghĩ ra.

## 7. Event history và projection

Event table là lịch sử những log đã xử lý; projection tables là hình ảnh trạng thái tiện đọc.

```text
chain_events: record từng log + block metadata
campaign_projection: dữ liệu tổng hợp để API query
donation_projection: donation theo campaign/donor
```

Đây là gợi ý, schema thực tế phụ thuộc Ponder/Drizzle và query cần thiết.

Giữ event history giúp sửa projection và replay khi có bug mapping. Với event bị orphaned, phải ghi trạng thái/undo policy thay vì xóa lịch sử debug không dấu vết.

## 8. Reconcile — đối chiếu với contract

Indexer test không chỉ kiểm tra worker chạy. Chọn campaign thử rồi:

1. Gửi một giao dịch trên local/testnet phù hợp.
2. Đọc receipt/event trực tiếp từ chain.
3. Đợi indexer qua confirmation policy.
4. Query DB/API.
5. So chain ID, contract, transaction hash, log index, donor và raw amount.
6. Gọi job xử lý lại cùng block; số dư projection không được tăng lần nữa.

Thử restart worker giữa batch và RPC timeout. Nếu có local-chain test hỗ trợ reorg/fork, kiểm tra rollback/replay ở local; không thử gây reorg trên chain công khai.

### Ví dụ trace donation để debug

Khi Minh báo góp 100 nhưng trang hiện 0, lần theo cùng transaction:

```text
RPC/Explorer: receipt success, logIndex 2, amount raw
Indexer log: chainId + txHash + logIndex
chain_events: row canonical, blockNumber/hash
donation_projection: donor, campaign, raw amount
API response: đúng campaign/wallet/filter
Frontend cache: query đã refetch/invalidate chưa?
```

Nếu chain không có event: kiểm tra address, ABI, chain và starting block. Nếu event đúng nhưng projection sai: xem mapping/idempotency. Nếu API đúng nhưng UI sai: xem cache, account và network.

## 9. Ponder, PostgreSQL và API ở đâu?

Theo Tech Stack, Ponder làm blockchain indexing; NestJS cung cấp API, Drizzle truy vấn PostgreSQL. Ponder có thể ghi database theo setup đã chọn hoặc đồng bộ qua ranh giới thiết kế rõ; trách nhiệm chính là đọc chain và cung cấp dữ liệu indexed.

Các tiến trình có thể chạy local/dev riêng rồi triển khai thành services. API đọc DB, indexer ghi projection/checkpoint. Chúng có thể dùng chung PostgreSQL nhưng cần migration và quyền DB phù hợp.

Không tạo hai indexer độc lập cùng ghi một projection nếu chưa có khóa và ownership rõ.

### Xác định điểm bắt đầu và phiên bản event

Indexer cần starting block — block triển khai contract hoặc mốc chọn làm điểm đọc. Bắt đầu muộn làm thiếu lịch sử; bắt đầu từ genesis có thể tốn công không cần thiết.

Nếu contract được redeploy/upgrade, xác định ABI và semantics theo address/block. Event có signature giống nhau nhưng ý nghĩa thay đổi không được diễn giải toàn bộ lịch sử bằng mapping mới mà chưa đánh giá.

Worker dừng lâu cần có chỉ số head/last indexed block, runbook resume/replay và backup database nhất quán. Đừng xóa checkpoint để thử lại nếu chưa biết projection có idempotent và rollback được không.

## 10. Dữ liệu event nào không nên tin mù quáng?

- `FundingFinalized`: kiểm tra event emitted đúng nhánh và chain.
- `RefundAvailable`: có thể nghĩa quyền đã mở, chưa có tiền trả.
- `RefundClaimed`: transaction thực sự thành công mới ghi claim.
- `EvidenceSubmitted`: event commit hash, chưa nói evidence verified.
- `MilestoneSettled`: cần biết kết quả và tác động tiền chính xác; tên settlement chung chung chưa đủ.

Backend nên thể hiện riêng trạng thái “refund claimable” và “refund claimed”.

## 11. Dấu hiệu vận hành cần quan sát

Log có `chainId`, contract, range block, event key, txHash và lỗi (không log secret). Metric/log hữu ích:

- Head block so với last indexed block.
- Thời gian trễ đồng bộ.
- Số lần retry/RPC error.
- Checkpoint hiện tại.
- Số conflict duplicate expected.
- Reorg/rollback count.

Nếu UI sai số, đi theo một event từ chain → indexer log → event table → projection row → API response. Đừng chỉ sửa row cuối.

### Tách lỗi RPC khỏi lỗi mapping

Timeout/rate-limit/disconnect là lỗi vận chuyển; thường cần retry/backoff hoặc endpoint phù hợp. Event decode được nhưng state sai là lỗi ABI/mapping/business logic; retry không giải quyết được.

Log cần network, contract, range, error category và event key để lần theo. Không ghi credential RPC vào log.

## 12. Đầu ra Mốc 5

- Event schema khớp ABI đã ổn định.
- Indexer config mạng, address và starting block.
- Event identity/unique constraint và idempotent processing.
- Checkpoint, retry, confirmation policy, reorg recovery.
- Projection schema/API query phục vụ nhu cầu MVP.
- Quy trình replay/reconcile và log đủ để debug.

Nguồn: [Process — Mốc 5](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Tech Stack — Ponder và Integration Contracts](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md), [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/).

## MVP baseline alignment

Indexer MVP phải event-driven, có checkpoint, confirmation policy, retry và idempotency. `BlockchainService` chỉ cung cấp RPC/contract access; indexer mới chuyển event thành projection PostgreSQL. Ponder hoặc Viem indexer vẫn là lựa chọn triển khai sau khi ABI/event model được freeze.
