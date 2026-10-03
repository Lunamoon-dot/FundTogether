# FundTogether — Rà soát 10 mốc và hướng Arc

> Ngày: 2026-10-03
> Phạm vi: đối chiếu tài liệu, source/config hiện tại và Arc docs chính thức.
> Không chạy lại runtime tests/build, deploy hoặc cài toolchain trong lần rà này.

## 1. Kết luận và trạng thái mạng

```text
Local development        Anvil + MockUSDC
Public integration       Arc testnet ưu tiên — TODO
Optional comparison      Sepolia — TODO nếu cần
Production candidate     Arc ưu tiên — chưa approve/deploy
```

ERC20 là chuẩn token; Arc là mạng EVM. Dự kiến giữ giao diện ERC20 cho donation,
bond và refund, dùng USDC native trả gas. Hai interface cùng balance nhưng token
units 6 decimals và native units 18 decimals. Không đổi donate thành payable
hoặc cấu hình FE/BE tự động chỉ bằng việc cập nhật tài liệu.

## 2. Rà soát từng mốc

| Mốc | Trạng thái triển khai hiện tại | Nội dung cũ đã sửa / bổ sung | Bước còn cần |
|---|---|---|---|
| 1 Protocol | IN_PROGRESS | Đạt goal sớm; activate không release; review từ verifier accept; mandatory admission; evidence access; committee 2/3 | Chốt taxonomy, terminal refunds/slash, timeout/no-quorum/appeals |
| 2 Contract core | IN_PROGRESS | Contract nhiều campaignId; cập nhật funding failure và baseline verifier; tách Safe với committee | Exit CHALLENGED/recovery; Arc compiler/runtime validation |
| 3 Hardening | IN_PROGRESS | Bổ sung blocklist, failed payouts, shared balance/dust, unsolicited native inflows | Complete invariants/recovery review; Arc-specific validation |
| 4 Backend | IN_PROGRESS | Ghi nhận foundation, parser/metadata ownership đã có; không coi là SIWE/on-chain auth | Auth/session, domain API, uploads, chain metadata/ABI boundary |
| 5 Indexer | TODO | Tên event thực tế; committed-block finality; USDC duplicate streams; RPC range/retry | ABI/address/start block; idempotent projection/checkpoint/replay |
| 6 Evidence | IN_PROGRESS | Restricted originals/public redactions; schema parser đã có; hash/report/version độc lập | Authorized immutable storage, file checks, freeze/hash, rule report |
| 7 Frontend journeys | TODO | Admission trước review; một USDC balance có reserve gas; final/failed/indexed riêng | Nối wallet → contract → indexer/API, success/failure UX |
| 8 Integrated MVP | TODO | Không đẩy committee 2/3 sau MVP; thêm Arc acceptance gate | Complete journeys và failure recovery trên mạng đích |
| 9 Reputation | TODO — sau MVP | Không suy donation/identity từ balance/USDC logs | Chờ dữ liệu lịch sử đáng tin cậy |
| 10 Research | TODO — sau MVP | Đo full journey; receipt fees/native units; tách testnet/mainnet | Dataset/metrics/reproducible experiments |

Tài liệu đã cập nhật không làm các mốc triển khai thành DONE. Parser/ownership
service là code local, chưa nằm trong lần xuất bản tài liệu trên GitHub.
Chưa có evidence endpoint, SIWE, storage/report workflow hoặc on-chain
ownership validation. Các kết quả build/test cũ vẫn là lịch sử trong progress.

## 3. Các thay đổi baseline cần nhớ

| Chủ đề | Baseline đã cũ | Baseline hiện tại |
|---|---|---|
| Funding đủ sớm | Chờ deadline để finalize | Donate đạt goal vào FUNDED ngay |
| Giải ngân | Activate trả budget | Settlement thành công mới trả budget |
| Review | 72 giờ là ví dụ/từ submit | 72 giờ đã chốt, từ verifier accept |
| Verifier | Optional nhận định | Assigned role admission/versioning đã có |
| Resolver | Trusted resolver là toàn bộ MVP | Deployer approval hiện tại; arbitration committee 2/3 đã chọn, chưa có |
| Evidence | Public-only | Restricted originals + public redacted derivatives |
| Failure/refund | Hai loại failure mặc nhiên đã freeze; terminal refund coi như đầy đủ | Taxonomy/policy sau FUNDED OPEN; pre-FUNDED full snapshot/pull claim có code |
| Networks | Sepolia là bước mặc định kế tiếp | Arc testnet ưu tiên, Sepolia dự phòng |
| Events | EvidenceSubmitted/ContributionReceived/RefundAvailable | EvidenceSubmissionCreated/DonationReceived/RefundPoolSnapshotted và verifier decision events |

## 4. Trình tự tiếp theo

1. Chốt tối thiểu recovery/dispute money rules còn OPEN; hoàn thành đường thoát
   và failure handling trước nhận tiền thật.
2. Chuẩn bị Arc Foundry/runtime/compiler và testnet deployment metadata cho slice
   đã ổn định; không cần đợi reputation/research.
3. Backend auth/metadata và evidence storage có thể tiến hành song song với bước
   1–2, dựa vào schemas đã chốt; không tự quyết tài chính bằng DB.
4. Freeze ABI cho slice tích hợp → indexer → FE journeys; xác minh receipt,
   finality và indexed state riêng.
5. Đánh giá Arc production từ kết quả thực tế và review an toàn tiền.

```text
Wallet → FundTogether → ERC20 USDC
             │             │
             │       Native USDC gas (caller)
             ↓
Protocol events → Indexer → PostgreSQL projection → API → FE

Evidence files → Restricted storage / redactions
                         ↓
Frozen manifest → hash commitment → assigned verifier → review
```

## 5. Nguồn và giới hạn

- [Arc evaluation, source register và checklist](./FundTogether_Arc_Evaluation_v0.1.md)
- [Reading guide các mốc](./FundTogether_v0.2_Processing/FundTogether_Processing_Reading_Guide.md)
- [Current overview](../docs/PROJECT_OVERVIEW.md)
- [Progress và verification history](../docs/PROJECT_PROGRESS.md)
- [Protocol/event names](../docs/protocol-spec.md)
- [State machine](../docs/state-machine.md)
- [Financial rules/open decisions](../docs/financial-rules.md)

Đã đọc source contract, mock, Foundry settings và backend boundaries. Arc docs
được đọc ngày này; fee floors/RPC limits là dữ liệu tham chiếu có thể thay đổi.
Các lỗi đơn vị/status trong snippets chính thức được ghi ở Arc evaluation;
không sao chép vào code. Chưa có Arc deployment, live RPC validation hoặc
benchmark phí production của FundTogether.
