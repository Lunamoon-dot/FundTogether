# FundTogether — Giải thích Mốc 7: Frontend Vertical MVP

> Tài liệu giải thích 4 journey của Process. UI, routes và component là ví dụ cho stack React đề xuất, không phải code/file đã tồn tại.

## 1. Vertical journey là gì?

Một user journey là hành trình một vai trò hoàn thành một mục tiêu từ giao diện tới các dịch vụ cần thiết.

“Vertical” nghĩa là làm trọn một lát có điểm đầu và kết quả quan sát được, nối UI với API/contract/indexer chứ không chỉ vẽ nhiều màn hình mock.

Một trang nhìn đẹp nhưng action chỉ đổi text local không chứng minh quyên góp hoặc refund đã xảy ra.

## 2. Trước khi code UI

Frontend cần ABI của contract — mô tả hàm, event và kiểu dữ liệu có thể gọi/đọc — cùng contract address, chain config, API schema và state machine tương đối ổn.

Theo Tech Stack, hướng đề xuất gồm React, TanStack Query, React Hook Form, Zod, Axios, Wagmi/Viem và RainbowKit. Đây là đề xuất hiện có, cần đọc package/repo trước khi viết code.

Phân biệt dữ liệu:

- **UI/client state:** bước wizard, modal, filter đang chọn; có thể dùng local state/Zustand.
- **Server state:** metadata/API data, quản lý cache/refetch bằng TanStack Query.
- **Chain state/transaction:** đọc contract và theo dõi wallet transaction bằng Web3 client.

Đừng lưu kết quả API lâu dài như thể nó là sự thật tài chính có thẩm quyền.

## 3. Journey 1 — Organizer tạo campaign

```text
Connect/Login
→ Campaign draft
→ Khai báo milestone
→ Khóa bond
→ Kiểm tra/Publish
```

### Bước A — Login/wallet

Người dùng tạo phiên bằng phương thức đã thiết kế; nếu dùng SIWE thì wallet ký thông điệp đăng nhập. Connect wallet tự nó chưa nhất thiết tạo phiên backend.

### Bước B — Wizard tạo draft

Form có thể chia general info, beneficiary, milestones, evidence policy, bond, review. React Hook Form quản lý form; Zod kiểm tra field theo schema. Frontend validation cải thiện trải nghiệm; backend kiểm tra lại vì request client không đáng tin.

Draft nội dung lưu backend/database. Thông số tài chính đã chọn cần khớp dữ liệu được publish on-chain; nếu sửa draft sau publish, không để UI trình bày như contract đã đổi theo.

### Bước C — Review trước khi ký

Hiển thị token, amount đã format đúng decimals, deadline có timezone, tổng milestone budget, bond required, chain và hành động wallet sắp thực hiện.

Gửi một amount nhầm đơn vị có thể khóa/nhận sai token; dùng integer/BigInt path của thư viện, tránh JS float.

### Bước D — Bond và publish

Nếu cần ERC20 approve, hiển thị đó là bước cấp allowance. Chờ approve success rồi mới gửi lock bond. Transaction mỗi bước có thể fail riêng.

Sau khi lock/publish, chờ receipt, xác nhận theo app policy, rồi indexer/backend sync. Chỉ sau đúng kết quả mới hiển thị campaign đã on-chain.

**Done:** draft lưu được, lỗi field chỉ rõ, sai ví/token được chặn, approve/lock/publish phân biệt và campaign có ID/address/tx truy xuất.

## 4. Journey 2 — Donor donate

```text
Xem list/detail
→ Kết nối đúng mạng/ví
→ Nhập amount
→ Approve token nếu cần
→ Donate
→ Theo dõi tx
→ Xem contribution đã sync
```

Campaign list/detail có thể lấy metadata từ API, số raised từ projection đã index. UI nên có thời điểm sync hoặc trạng thái loading khi nguồn dữ liệu đang trễ.

Trước donate hiển thị token address/amount, phí giao dịch ước tính do ví/network cung cấp nếu khả dụng, recipient contract và điều kiện donation.

Transaction gửi được ≠ receipt thành công ≠ database đã index. Khi user từ chối popup, không hiện “donated”. Khi receipt fail/revert, hiển thị có thể thử lại sau khi xem reason.

**Done:** donor có thể tra contribution bằng campaign/ví; refresh trang vẫn nhìn đúng dữ liệu chain đã index, không chỉ state trong React.

## 5. Journey 3 — Milestone, evidence, challenge, settlement

```text
Organizer activate
→ Nộp evidence
→ Review window
→ Không challenge hoặc mở dispute
→ Resolve/settle
→ Tiếp mốc sau
```

Trang milestone phải cho biết:

- Mốc đang ở state nào và điều kiện tiếp theo.
- Budget, released/remaining theo nguồn và nghĩa cụ thể.
- Bộ evidence/version nào được commit; link nào xem được.
- ReviewEnd tính từ mốc nào và timezone.
- Ai được challenge và nút challenge có đủ điều kiện không.
- Tx hash/trạng thái sync nào làm căn cứ hiển thị.

Frontend ẩn nút sai state để tránh thao tác vô ích; contract vẫn là nơi chặn cuối. Resolver UI chỉ hiển thị kết quả/chức năng user có quyền, không tự cập nhật status vào DB thay contract.

**Done:** mỗi transition UI phân biệt submitted, pending, confirmed, indexed, accepted và disputed theo đúng mức bằng chứng có được.

## 6. Journey 4 — Failure và refund

```text
Funding fail hoặc campaign bị cancel hợp lệ
→ Contract mở entitlement/pool theo rule
→ Donor xem claimable
→ Kết nối đúng ví
→ Claim refund
→ Tx success và indexer sync
```

Frontend hiển thị: pool/entitlement theo snapshot, số đã claim, còn có thể claim, token/network, và transaction status. “Refund available” nghĩa có quyền yêu cầu; chưa nghĩa tiền đã vào ví.

Không đặt nút “Refund all” gọi vòng lặp tất cả donor. Một donor claim phần của mình theo pull-payment.

Nếu entitlement off-chain stale, gọi/read chain theo thiết kế hoặc cho thấy mốc block dữ liệu. Không cho frontend tự tính dùng pool còn lại nhân tỷ lệ sau từng claim.

**Done:** donor claim đúng một lần, số dư ví thay đổi theo receipt thành công và reload trang vẫn hiển thị đã claim.

## 7. Common transaction state cho frontend

Tách trạng thái phổ biến:

```text
IDLE
→ WALLET_REQUESTED
→ USER_REJECTED hoặc SUBMITTED(txHash)
→ INCLUDED_SUCCESS / INCLUDED_REVERTED
→ CONFIRMED_BY_APP_POLICY
→ INDEXED
```

Tên là gợi ý. Dùng một component/state model tái sử dụng nếu thực sự giúp, nhưng không gộp tất cả lỗi thành toast “Something failed”.

Thông báo, nút thử lại và đồng bộ API khác nhau tùy lỗi: từ chối chữ ký thì không có tx hash; revert có tx; backend timeout có thể vẫn đã gửi transaction.

## 8. Nơi code frontend trong stack đề xuất

Ví dụ cấu trúc từ Tech Stack:

```text
src/features/campaigns/
src/features/milestones/
src/features/evidence/
src/features/challenges/
src/features/refunds/
src/lib/http/
src/lib/web3/
```

Đây là ví dụ, hãy nhìn repo trước. Thường feature lưu page/components/hooks/schema; `lib/http` quản lý API transport; `lib/web3` cấu hình client/contracts. Không đặt private server secret vào bundle frontend.

## 9. Giao diện cần thông báo gì cho người dùng?

| Tình huống | Thông điệp đúng mức |
|---|---|
| Chưa mở wallet | Chưa kết nối ví |
| Sai chain | Hãy chuyển sang mạng được hỗ trợ |
| Chờ approve | Đang chờ ví xác nhận cấp quyền token |
| Transaction gửi | Đã gửi, đang chờ mạng |
| Receipt thành công, chưa index | Giao dịch thành công, dữ liệu ứng dụng đang cập nhật |
| Upload xong, chưa commit | File đã upload; chưa ghi commitment on-chain |
| Claimable | Bạn có thể gửi yêu cầu claim; chưa nhận tiền cho tới khi giao dịch hoàn tất |

Không hiển thị “đã verified” chỉ vì file được upload, hash được commit hoặc backend lưu status.

## 10. Responsive, lỗi mạng và accessibility

MVP vẫn cần form đọc được trên màn hình nhỏ, labels cho input, keyboard focus, trạng thái lỗi có văn bản chứ không chỉ màu, và đường xem transaction/evidence bằng thông tin phụ trợ.

Nếu wallet disconnect, API mất kết nối hoặc indexer chậm, giữ nội dung user chưa gửi ở draft phù hợp; đừng âm thầm gửi lặp transaction.

## 11. Làm bốn journey theo thứ tự

1. Nối dữ liệu đọc, hoàn thành campaign detail/list.
2. Làm donation vì kiểm tra wallet, token, transaction lifecycle.
3. Làm Organizer publish vì cần form, API và contract config.
4. Làm milestone/evidence/challenge.
5. Làm failure/refund và kiểm tra accounting cuối.

Thứ tự này là cách đề xuất triển khai UI; dependency protocol/indexer vẫn phải được tôn trọng. Có thể chia nhóm journey độc lập sau khi API/ABI ổn định.

## 12. End-to-end acceptance

Một test journey thật trên local/testnet môi trường dự án nên xác nhận:

- Organizer tạo campaign và bond đúng.
- Donor donate, backend/indexer thấy đúng amount.
- Milestone tiến đúng state, evidence upload và commit đúng.
- Challenge/settlement theo quyền/thời gian.
- Failure/refund trả đúng token và không claim trùng.
- UI refresh/reopen vẫn tái dựng đúng trạng thái từ dữ liệu server/chain.

Mock UI test hữu ích cho validation/layout, nhưng không chứng minh ví, contract, receipt, indexer và refund đã nối thật.

Nguồn: [Process — Mốc 7, bốn journey](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Tech Stack — Frontend/Integration Contracts](../../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md).

## MVP baseline alignment

Frontend phải biểu diễn riêng `submitted`, receipt success, confirmed và indexed. Wagmi/Viem xử lý wallet transaction; TanStack Query xử lý server projection; Zustand chỉ giữ client state. Frontend không tự tính refund hoặc financial truth thay contract.
