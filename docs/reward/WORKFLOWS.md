# Reward Crowdfunding — Workflows hiện tại

> Phạm vi: pilot Reward Crowdfunding cho truyện tranh độc lập và artbook.
> Mạng local: Anvil chain `31339`, token `MockUSDC`.
>
> Tài liệu này là bản đồ thao tác của sản phẩm hiện tại. Quy tắc chi tiết về tiền,
> quyền hạn và trạng thái nằm tại [reward-crowdfunding-spec.md](../reward-crowdfunding-spec.md).

## 1. Creator verification

```text
Creator tạo hồ sơ + khai báo quyền IP
  → Admin duyệt hoặc từ chối
  → VERIFIED / REJECTED
```

- Creator chưa `VERIFIED` không được tạo campaign.
- Admin kiểm danh tính, quyền đại diện và tuyên bố quyền sở hữu/phát hành tác phẩm.

## 2. Campaign review và publish

```text
Creator tạo campaign + reward tiers
  → freeze commitment
  → gửi Resolver review
  → APPROVED
  → tạo campaign on-chain
  → backend kiểm bytecode, ví Creator, goal, commitment và receipt
  → PUBLISHED
```

- `commitmentHash` neo nội dung campaign và tiers đã freeze.
- Đăng ký on-chain fail-closed khi thiếu RPC, contract address, bytecode, ví liên kết,
  hoặc receipt không đúng với campaign.

## 3. Pledge và escrow

```text
Backer chọn tier
  → ký pledge MockUSDC
  → receipt được backend index chuẩn tắc
  → entitlement ACTIVE
  → đạt goal 100%
  → Resolver activateCampaign
  → ACTIVE
```

- Mỗi pledge bị giới hạn bởi supply của tier.
- Token nằm trong escrow contract, không phải số dư do backend tự xác nhận.

## 4. Production và expense verification

```text
Creator submit disbursement request
  → Resolver approveAndDisburse
  → Creator nhận MockUSDC từ escrow
  → Creator nộp chứng từ chi tiêu
  → Resolver candidate / challenge / finalize expenditure
  → Creator nộp bằng chứng mẫu in
  → Resolver recordProductionVerified
  → PRODUCTION_VERIFIED
```

- Cọc sản xuất bị contract giới hạn tối đa 50% goal.
- Mã truy cập phần thưởng số chỉ được phát sau `PRODUCTION_VERIFIED`.

## 5. Physical fulfillment

```text
Backer nhập địa chỉ giao hàng mã hóa AES-256-GCM
  → Creator tạo fulfillment batch và cập nhật vận chuyển
  → Backer xác nhận nhận hàng hoặc mở dispute
  → Resolver xử lý dispute
  → mọi physical entitlement đã CONFIRMED / REFUND_ELIGIBLE / REFUNDED
  → Resolver recordFulfillmentComplete
  → FULFILLMENT_COMPLETE
```

- Creator và Backer được phân quyền đọc thông tin giao hàng; dữ liệu không lên chain.
- Không thể complete fulfillment nếu còn physical entitlement chưa xử lý.

## 6. Complete, wind-down và refund

```text
FULFILLMENT_COMPLETE
  → Creator hoặc Resolver completeCampaign
  → COMPLETED

Funding failed hoặc execution quá hạn
  → startWindDown / FundingFailed
  → STOPPED
  → Backer claimRefund
  → entitlement REFUNDED
```

- Funding failed hoàn toàn: Backer rút lại 100% pledge.
- Wind-down sau khi đã chi: Backer rút phần escrow còn lại theo tỷ lệ; khoản Creator
  trả về sau đó đi vào supplement pool.

## 7. Chain synchronization

```text
Wallet transaction
  → RPC receipt
  → receipt sync hoặc background worker
  → canonical chain_events
  → PostgreSQL projection / entitlement / UI
```

- Receipt sync xử lý ngay sau thao tác từ UI.
- Worker quét block nền theo checkpoint `(last_block, last_block_hash)`.
- Khi phát hiện reorg, hệ thống đánh dấu event cũ non-canonical, replay chain logs,
  thu hồi entitlement mồ côi và dựng lại projection.

## Vai trò

| Vai trò | Quyền chính |
| --- | --- |
| Creator | Hồ sơ, campaign, tiers, chứng từ, fulfillment batch, hoàn tất campaign |
| Backer | Pledge, địa chỉ giao hàng, xác nhận nhận hàng, dispute, claim refund |
| Admin | Xác thực Creator và quyền IP |
| Resolver | Review campaign, activate, duyệt chi, xác thực sản xuất, xử lý dispute, xác nhận fulfillment |

## Kiểm chứng tự động hiện có

- Smart contracts: 34 tests Foundry.
- Reward HTTP acceptance: 28 tests.
- Reward contract scenarios: 6 scenarios.
- Reward backend unit tests: 17 tests.

Kết quả test chứng minh hành vi local đã được kiểm tra; không thay thế nghiệm thu ví,
RPC hoặc hoạt động giao hàng ngoài đời thực.
