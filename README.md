# FundTogether

FundTogether là prototype reward crowdfunding permissionless cho truyện tranh
số và artbook độc lập. Target VNext dùng một tier `STANDARD`, một
`DIGITAL_DOWNLOAD` PDF và MockUSDC trong escrow trên chain local `31339`.

Repository chỉ phục vụ nghiên cứu và demo local. Không dùng tài sản thật hoặc
triển khai public chain.

## Ranh giới hiện tại

Repository đang chứa hai runtime có mục đích khác nhau:

| Surface | Trạng thái |
| --- | --- |
| **VNext** | Target hiện hành: campaign permissionless, stake-backed Judge courts, commit–reveal, milestone evidence, payout và refund do contract quyết định. Source đã có Creator creation, Funding Checkout, Refund Dashboard, Evidence Wizard, Judge workspace, Court Dashboard và settlement/disbursement. |
| **Historical Campaign/Resolver** | Runtime local cũ vẫn được đăng ký, có route và regression tests. Nó được giữ để tương thích và đối chiếu lịch sử, không phải authority của target VNext. |

```text
React frontend <-> NestJS API <-> PostgreSQL / MinIO
       |                  |
       +------------------+--> Anvil / VNext contracts

Contract -> canonical event -> idempotent indexer -> PostgreSQL projection
```

- Smart contracts sở hữu escrow, Judge assignment/vote, state transition,
  payout và refund VNext.
- Backend sở hữu SIWE, validation, private evidence và read APIs; backend không
  được tạo verdict hay financial truth.
- PostgreSQL là metadata/projection; MinIO giữ private evidence/PDF bytes.
- Wallet submission chưa phải thành công: UI phân biệt wallet request,
  submitted, receipt và indexed projection.

Đọc [research direction](docs/research-direction.md),
[project overview](docs/PROJECT_OVERVIEW.md) và
[VNext protocol specification](docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
trước khi thay đổi protocol.

## Yêu cầu local

- Node.js và npm tương thích với lockfiles;
- Docker Desktop cho PostgreSQL/MinIO;
- WSL Ubuntu có Foundry, hoặc Foundry tương đương trên host;
- ví trình duyệt cho manual/browser acceptance;
- Anvil local tại `http://127.0.0.1:9548`, chain `31339` khi chạy runtime.

Không commit `.env`, private key, seed phrase hoặc nội dung `.local/`.

## Runtime và deployment identity

Launcher hiện có:

```powershell
# Historical Campaign/Resolver runtime only
& .\backend\scripts\campaigns\start-services.ps1
```

**Chưa có VNext one-command launcher.** VNext hiện có các script deploy,
runtime verification, backend và browser acceptance riêng trong
`backend/scripts/campaigns/`; không được hiểu launcher historical là VNext.

Runtime thật yêu cầu manifest bị ignore tại `.local/fundtogether/generated/` và
xác minh chain ID, genesis, deployed bytecode, ABI/policy identity trước khi ký.
Frontend test dùng fixture deterministic được bật rõ ràng bởi test bootstrap;
fixture đó không được dùng cho `dev` hoặc `build` runtime.

## Kiểm tra

Các lệnh nhẹ, không yêu cầu live chain hoặc private secrets:

```powershell
cd frontend
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build

cd ..\backend
npm.cmd ci
npm.cmd run lint
npm.cmd run build
npm.cmd run test:vnext:unit
npm.cmd run test:vnext-runtime

cd ..\contracts
git submodule update --init --recursive
forge build
forge test
```

Full backend Jest và runtime E2E (`test:vnext-acceptance`,
`test:vnext-browser`) chứa integration suites cần PostgreSQL, MinIO, Anvil và
deployment manifest thật nên không thuộc lightweight CI. Không reset chain,
database hoặc storage chỉ để làm test xanh.

## Bản đồ repository

| Đường dẫn | Vai trò |
| --- | --- |
| `frontend/src/features/campaigns/vnext/` | VNext Creator, Backer, Judge, court và settlement UI |
| `frontend/src/features/campaigns/` | VNext cùng các surface historical vẫn còn active |
| `backend/src/modules/campaigns/` | VNext API/evidence và historical Campaign services |
| `backend/src/indexer/` | VNext, Campaign và historical idempotent indexers |
| `backend/src/blockchain/generated/` | ABI/artifact cần cho runtime identity và frontend |
| `contracts/src/` | VNext và historical contracts; production Solidity không phải cleanup target |
| `docs/protocol/` | VNext specification, threat model và implementation ledger |
| `docs/archive/` | Tài liệu lịch sử, không phải yêu cầu target hiện hành |

Đọc [docs/README.md](docs/README.md) để biết thứ tự nguồn chuẩn.
