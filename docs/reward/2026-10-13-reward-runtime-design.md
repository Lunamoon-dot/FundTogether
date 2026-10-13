# Reward Runtime Local Design

> Ngày: 2026-10-13  
> Trạng thái: Đã duyệt hướng thiết kế, chờ review đặc tả trước khi lập implementation plan.

## Mục tiêu

Reward Crowdfunding là runtime local duy nhất được hỗ trợ để phát triển và demo.
HED không còn khởi động cùng ứng dụng, nhưng source, tài liệu, Docker volumes và
snapshot `.local/hed/` được giữ nguyên như dữ liệu lịch sử.

## Vấn đề hiện tại

Reward đang dùng một phần runtime HED: launcher, manifest frontend, biến môi
trường và RPC `9548`. Khi listener ở `9548` là chain Reward hoặc chain khác,
launcher HED từ chối chạy vì manifest HED và genesis/deployment không khớp.
Việc này an toàn nhưng khiến không có lệnh khởi động đầy đủ cho Reward.

## Quyết định

Tạo runtime Reward độc lập trong `.local/reward/`. Reward sử dụng các port local
đang được dùng trong UI để không phải thay MetaMask hoặc bookmark:

| Thành phần | Giá trị |
| --- | --- |
| RPC Anvil | `http://127.0.0.1:9548`, chain ID `31339` |
| API NestJS | `http://127.0.0.1:3002` |
| Frontend Vite | `http://127.0.0.1:5175` |
| PostgreSQL host port | `5436` |
| MinIO API / console | `9202` / `9203` |
| Local root | `.local/reward/` |

Runtime HED sẽ không dùng các port này. Dữ liệu HED cũ không bị xóa, reset,
migrate hoặc sử dụng để chạy Reward.

## Thành phần

### Environment và container

- `backend/scripts/reward/initialize-environment.cjs` tạo hoặc kiểm tra
  `.local/reward/backend.env`, không bao giờ in secret.
- `infra/reward/compose.yaml` tạo PostgreSQL database `fundtogether_reward` và
  MinIO volume riêng, không dùng volume HED.
- Environment Reward dùng tên `REWARD_*`; không dùng `HED_*` làm fallback.

### Chain và deployment

- `backend/scripts/reward/start-chain.ps1` chỉ tái sử dụng listener khi Reward
  manifest xác nhận chain ID, genesis, bytecode, contract address và policy đúng.
- Nếu không có listener, script khởi động Anvil dưới supervisor Reward và deploy
  `FundTogetherReward` cùng `MockUSDC`.
- Manifest nằm tại `.local/reward/generated/deployment.local.json`; frontend và
  backend chỉ đọc manifest này.
- Listener không khớp Reward manifest phải fail closed, không tự kill/reset chain.

### Backend

- Tạo entry point/module Reward chỉ import `RewardModule`, `AuthModule`,
  `OrganizationsModule`, database và storage cần cho Reward.
- Không import `HedModule` hoặc route HED vào runtime Reward.
- API health trả `protocolKind: REWARD` cùng chain/deployment identity để launcher
  phát hiện đúng listener ở `3002`.
- Chạy migrations database Reward trước khi start API.

### Frontend

- Vite alias deployment chuyển sang Reward manifest.
- API client đọc `VITE_REWARD_API_URL`, không dùng `VITE_HED_API_URL`.
- Scripts `dev`, `build` và test context đặt tên Reward; URL dev vẫn là `5175`.

### Launcher

`backend/scripts/reward/start-services.ps1` thực hiện tuần tự:

```text
initialize environment
→ Docker compose Reward up --wait
→ start/verify Reward Anvil
→ migrate Reward database
→ build backend nếu không -SkipBuild
→ start/verify API :3002
→ start frontend :5175
→ verify health identity
```

Mỗi listener có identity sai phải được giữ nguyên và launcher dừng với lỗi rõ ràng.
Launcher không tự xóa data, volume, manifest, snapshot hay process không sở hữu.

## Không thuộc phạm vi

- Xóa source, docs, migrations, contracts hoặc `.local/hed/` của HED.
- Chạy đồng thời runtime HED và Reward.
- Migration/bảo toàn campaign HED sang database Reward.
- Thay đổi financial rules, contract Reward hay workflow Reward.
- Deploy public chain, fiat, hoặc production hosting.

## Tiêu chí nghiệm thu

1. Một lệnh `start-services.ps1` khởi động Reward DB, storage, chain, API và web.
2. Health API/manifest/frontend cùng nhận diện `REWARD`, chain `31339` và đúng
   contract deployment.
3. Listener hoặc manifest không khớp fail closed, không bị kill/reset tự động.
4. HED volumes và `.local/hed/` không thay đổi bởi launcher Reward.
5. Backend build, frontend build, Foundry tests và reward E2E vẫn pass.
