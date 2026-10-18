# FundTogether

FundTogether là MVP Reward Crowdfunding dành cho truyện tranh số và
artbook độc lập. Mỗi ấn phẩm có một gói `STANDARD`, một quyền tải
`DIGITAL_DOWNLOAD` dạng PDF và sử dụng MockUSDC trên mạng Anvil local.

Đây là hệ thống nghiên cứu và nghiệm thu local, chưa được phép dùng tài sản thật
hoặc triển khai công khai.

## Phạm vi hiện tại

```text
Creator khai báo hồ sơ/IP
  -> tạo và khóa cam kết ấn phẩm
  -> Resolver thẩm định, có thể mở Community Review
  -> Resolver duyệt đúng snapshot
  -> phát hành campaign on-chain
  -> Backer pledge vào escrow
  -> Creator nộp bằng chứng và PDF cuối
  -> Resolver nghiệm thu
  -> Backer tải PDF riêng tư
  -> payout hoặc refund theo policy đã khóa
```

Không thuộc MVP: in ấn vật lý, vận chuyển, tồn kho, nhiều tier trả phí, NFT,
charity workflow và organization crowdfunding.

## Kiến trúc

```text
React + Vite  <->  NestJS API  <->  PostgreSQL / MinIO
      |                 |
      +-----------------+----> Anvil / FundTogetherCampaign.sol

Contract event -> idempotent indexer -> PostgreSQL projection -> API -> UI
```

- Blockchain là nguồn sự thật cho pledge, escrow, dispute, payout và refund.
- PostgreSQL giữ metadata ứng dụng và projection đã index.
- MinIO giữ sample evidence và PDF cuối ở chế độ riêng tư.
- Giao dịch phải phân biệt yêu cầu ví, submitted, receipt canonical và indexed.

## Chạy local

Yêu cầu: Node.js/npm, Docker Desktop, WSL có Foundry và ví trình duyệt để test
tay. Từ PowerShell tại root repository:

```powershell
& .\backend\scripts\campaigns\start-services.ps1
```

Các cổng local:

| Thành phần | Địa chỉ |
| --- | --- |
| Frontend | `http://localhost:5175` |
| API | `http://localhost:3002` |
| PostgreSQL | `localhost:5436` |
| MinIO API / Console | `localhost:9202` / `localhost:9203` |
| Anvil RPC | `http://127.0.0.1:9548`, chain `31339` |

Runtime phải nhận diện đúng deployment Campaign trước khi tái sử dụng listener;
không reset chain/DB/storage để bỏ qua lỗi nhận diện.

## Kiểm tra

```powershell
cd frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build

cd ..\backend
npm.cmd run build
npm.cmd run test:workflow
npm.cmd run test:campaigns

cd ..\contracts
forge build
forge test
```

Kết quả tự động không thay thế nghiệm thu MetaMask, xác minh tác giả/IP hoặc
đánh giá tính đúng đắn của bằng chứng ngoài đời.

## Bản đồ repository

| Đường dẫn | Vai trò |
| --- | --- |
| `frontend/src/features/campaigns/` | UI hiện hành: public, Creator, Resolver, Backer và historical read-only surfaces |
| `frontend/src/features/campaigns/api/campaigns.ts` | API client nội bộ của Campaign |
| `backend/src/modules/campaigns/` | Backend nội bộ của Campaign |
| `backend/src/modules/` | Các domain module đang hoạt động |
| `contracts/src/campaigns/` | Contract và interface tài chính |
| `docs/campaigns/` | Scope, workflow, policy và test guide hiện hành |
| `docs/archive/` | Tài liệu lịch sử, không phải yêu cầu hiện hành |

Đọc [docs/README.md](docs/README.md) để biết thứ tự tài liệu và nguồn chuẩn.
