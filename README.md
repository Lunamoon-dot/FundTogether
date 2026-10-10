# FundTogether

FundTogether là hệ thống thử nghiệm gây quỹ từ thiện, quản lý vốn theo từng đợt
và xét duyệt bằng chứng thực hiện. Blockchain giữ quỹ và thực thi điều kiện cấp
vốn, phản đối, quá hạn và hoàn tiền. Backend quản lý tài khoản, hồ sơ và quyền
truy cập; giao diện giúp người dùng theo dõi tiến trình.

**Cập nhật: 10/10/2026.** Phạm vi hiện tại là local/pilot với MockUSDC.
Nghiệm thu người dùng và nghiên cứu nghiệp vụ thực tế còn đang tiếp tục;
đây chưa phải hệ thống sẵn sàng nhận tiền thật.

## Định hướng và phạm vi

Đọc [định hướng nghiên cứu](docs/research-direction.md) trước khi đề xuất hoặc
thay đổi nghiệp vụ. Trọng tâm là quy trình xét duyệt bằng chứng, trách nhiệm của
người quyết định, truy vết dòng tiền và khả năng phục hồi khi xảy ra lỗi.

Mua và trao quà là loại hình campaign đầu tiên, gồm trao trực tiếp hoặc qua đơn
vị tiếp nhận, thực hiện trong một hoặc nhiều đợt. Các loại hình khác cần tiêu
chí và quy tắc riêng trước khi triển khai.

- **Workflow B:** không bond; cấp vốn trước từng đợt, nghiệm thu trước cấp tiếp.
- **Baseline A:** có bond và giải ngân sau nghiệm thu; giữ riêng để đối chiếu.
- Reviewer hiện tại là resolver; chưa triển khai verifier riêng hoặc AI kiểm
  chứng bằng chứng. Hash và chữ ký không chứng minh sự thật ngoài đời.
- Cổng đóng góp VND, chuyển đổi VND–USDC, marketplace và tài sản thưởng chưa
  thuộc chức năng đã triển khai.

## Workflow B

```text
Tổ chức được xác thực → chuẩn bị kế hoạch và tiêu chí → resolver duyệt
    → tổ chức công bố → donor đóng góp vào escrow
    → đủ mục tiêu → resolver xác nhận điều kiện cấp đầu
    → tổ chức nhận vốn đợt đầu → thực hiện và nộp bằng chứng
    → resolver xét từng tiêu chí: đạt / bổ sung / không đạt / chưa kết luận
    → cửa sổ phản đối → xử lý case nếu có
    → trả lại khoản dư đã xác nhận → chốt nghiệm thu → cấp đợt tiếp theo
    → nghiệm thu đợt cuối → hoàn tất campaign
```

Nghiệm thu không chuyển lại khoản vốn đã cấp. Khi campaign dừng hoặc hoàn tất,
refund được tính từ quỹ còn trong escrow và tiền tổ chức thực sự trả lại.
Khoản đã cấp ra ngoài không tự thu hồi được. Donor nhận về đúng ví đã góp;
quyền nhận không hết hạn, khoản trả lại muộn có thể tạo quyền nhận bổ sung.

Hạn xử lý dùng timestamp của chain. Hết hạn không tự tạo giao dịch chuyển trạng
thái: phải có người gọi thao tác timeout đủ điều kiện. Mỗi bước phân biệt yêu
cầu ký ví, hash đã gửi, receipt thành công và dữ liệu đã được index.

Chi tiết: [đặc tả B](docs/workflow-b-spec.md) và
[quy tắc tài chính B](docs/workflow-b-financial-rules.md).

## Trạng thái triển khai

| Phần | Phạm vi đã có trong checkpoint workflow B |
|---|---|
| Tài khoản và ví | Email/mật khẩu, session cookie, liên kết ví bằng SIWE; đăng nhập tài khoản và kết nối ví là hai bước riêng |
| Tổ chức và campaign | OWNER, ví đại diện, xác minh tổ chức bởi ADMIN; bản nháp, kế hoạch từng đợt, tiêu chí, duyệt và công bố |
| Contract | Đóng góp, cấp vốn một lần mỗi đợt, bằng chứng theo phiên bản, bổ sung, phản đối, xử lý case, timeout, return và refund |
| Bằng chứng | Bản gốc riêng tư, bản công khai đã che thông tin, manifest/hash và đánh giá theo từng tiêu chí |
| Indexer | Đồng bộ event vào PostgreSQL; kiểm deployment, replay, reorg và checkpoint |
| Giao diện | Khu vực tổ chức, staff/resolver, campaign công khai, đóng góp, bằng chứng, case và refund |
| Kiểm tra tự động | Unit/fuzz/invariant, hành trình G1/G2 và các nhánh failure/timeout, phục hồi chain/DB/storage đã có kết quả ghi nhận |
| Nghiệm thu và nghiên cứu | Thao tác MetaMask, đánh giá của reviewer độc lập, khảo sát và dữ liệu thực tế chưa hoàn tất |

Bảng này mô tả checkpoint đã lưu, không chứng nhận dịch vụ trên máy đang chạy.
Các thay đổi tiếp theo có thể còn trong workspace chưa commit.
Xem [theo dõi nghiệm thu](docs/workflow-b-acceptance.md) và
[tiến độ](docs/PROJECT_PROGRESS.md) để biết bằng chứng và giới hạn từng lượt.
Không coi kiểm tra tự động là nghiệm thu MetaMask hoặc khảo sát người dùng.

## Kiến trúc

```text
Frontend ↔ NestJS API ↔ PostgreSQL / S3-compatible storage
    │          │
    └──────────┴────→ RPC → Smart contract

Smart contract → Event → Indexer → PostgreSQL → API → Frontend
```

- Frontend: React, TypeScript, Vite, TanStack Query, Wagmi/Viem, RainbowKit.
- Backend: NestJS, PostgreSQL/Drizzle, SIWE, S3-compatible storage qua MinIO local.
- Contracts: Solidity, Foundry/Anvil và OpenZeppelin.
- Tiền dùng số nguyên theo base unit; MockUSDC có 6 decimals. Database lưu hồ sơ
  và dữ liệu chiếu từ chain, không thay chain làm nguồn trạng thái tài chính.
- ABI được sinh từ artifact; deployment manifest ràng buộc chain, contract,
  token, resolver và phiên bản policy. Không sao chép ABI thủ công.

## Chạy local trên Windows

### 1. Công cụ cần có

- Git và submodules của contracts.
- Node.js 24.x, npm; dùng `npm.cmd` trong PowerShell.
- Docker Desktop chạy Linux containers, có Docker Compose.
- WSL Ubuntu-24.04, Python 3 và Foundry/Anvil trong distro đó.
- Ví trình duyệt như MetaMask để thao tác ký thủ công.

Hướng dẫn này chạy trong **PowerShell**. Các lệnh Bash cần chạy trong Ubuntu.
Cài Foundry theo [hướng dẫn chính thức](https://getfoundry.sh/getting-started/installation).

### 2. Clone và cài dependencies

```powershell
git clone --recurse-submodules https://github.com/Lunamoon-dot/FundTogether.git
Set-Location FundTogether
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Nếu đã clone, chạy `git submodule update --init --recursive` tại root trước khi
build contract. Build contract bằng Foundry trong WSL:

```powershell
$contractsPathB = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path (Get-Location).Path 'contracts')).Trim()
wsl.exe -d Ubuntu-24.04 --cd $contractsPathB --exec bash -lc '~/.foundry/bin/forge build'
```

### 3. Khởi động workflow B

Mở Docker Desktop, rồi chạy từ root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/scripts/workflow-b/start-services.ps1
```

Helper tạo cấu hình local nếu chưa có, khởi động PostgreSQL/MinIO B, tạo hoặc
khôi phục chain B, kiểm deployment, migrate DB B, build backend và mở BE/FE.
Nếu listener đã tồn tại, helper kiểm danh tính trước khi tái sử dụng.
Khi báo lỗi, đọc log của tiến trình hiện tại; không mở thêm node hoặc reset để
bỏ qua lỗi. Sau khi đã build backend có thể thêm `-SkipBuild`.

Kiểm tra các boundary trước thao tác ví:

```powershell
node frontend/scripts/advance-manual-setup.mjs
```

Mở **http://localhost:5174**. Dùng đúng origin `localhost:5174` khi đăng nhập và
ký SIWE. Nếu cần tài khoản/bản nháp mẫu:

```powershell
node backend/scripts/workflow-b/seed-local.cjs
```

Seed tạo dữ liệu synthetic; không ký ví hoặc nạp token thay người dùng.
Thông tin đăng nhập nằm trong `.local/workflow-b/manual-accounts.json` được Git
bỏ qua. Đọc `.local/workflow-b/manual-preflight.json` để lấy mạng, địa chỉ token,
contract và resolver đúng lượt chạy; không dùng địa chỉ của deployment cũ.

### 4. Phân biệt hai môi trường

| Thành phần | Workflow B | Baseline A |
|---|---|---|
| Frontend | `localhost:5174` | `localhost:5173` |
| Backend / Swagger | `localhost:3001` / `/docs` | `localhost:3000` / `/docs` |
| Anvil RPC | `127.0.0.1:9547` | `127.0.0.1:8545` |
| Chain ID | `31338` | `31337` |
| PostgreSQL | `5434`, DB `fundtogether_workflow_b` | `5432` |
| MinIO API / console | `9100` / `9101` | `9000` / `9001` |
| Cấu hình B | `.local/workflow-b/backend.env` | Cấu hình A giữ riêng |

Không dùng launcher/reset/migration A cho B. RPC cùng chain ID vẫn có thể là
chain khác sau reset; phải kiểm cả deployment identity. MockUSDC và ETH local
chỉ phục vụ thử nghiệm, không có giá trị đổi ra tiền thật.

Đọc [runbook local B](docs/workflow-b-local-runbook.md) để xem vai trò, kịch bản,
log, snapshot và phục hồi. Tài khoản ADMIN được xác thực tổ chức; quyền RESOLVER
và đúng ví resolver đã liên kết mới cho phép ký quyết định campaign.

## Kiểm tra dành cho người phát triển

Các lệnh sau là thao tác chủ động, không chạy tự động khi mở README:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build:workflow-b
npm.cmd --prefix frontend run lint
npm.cmd --prefix backend test -- --runInBand
npm.cmd --prefix frontend test
```

Kiểm thử tích hợp cần đọc điều kiện môi trường và phạm vi ghi dữ liệu trong
[runbook](docs/workflow-b-local-runbook.md) trước khi chạy. Một số script dùng
fork riêng để không thay đổi chain ứng dụng; hash của fork không phải giao dịch
trên chain demo đang được lưu.

Git chỉ lưu source, migrations, fixtures synthetic và tài liệu. Cấu hình thật,
credentials, snapshot chain, DB và object storage cần được quản lý riêng;
không commit `.env`, private key, seed phrase hoặc file tài khoản local.

## Bản đồ repository và tài liệu

| Đường dẫn | Nội dung |
|---|---|
| `frontend/` | Giao diện và thao tác ví; boundary API/deployment |
| `backend/src/advance/` | API/domain/indexer cho workflow B |
| `backend/scripts/workflow-b/` | Khởi động local, deployment, fixtures và kiểm tra B |
| `backend/drizzle/` | Migrations PostgreSQL |
| `contracts/src/FundTogetherAdvance.sol` | Contract cấp vốn trước của B |
| `contracts/src/FundTogetherMvp.sol` | Contract baseline giải ngân sau nghiệm thu của A |
| `infra/workflow-b/` | Docker Compose riêng cho DB/storage B |
| `docs/` | Nghiệp vụ, kế hoạch, bằng chứng kiểm tra và định hướng nghiên cứu |
| `v0.2/` | Tài liệu tham khảo lịch sử; đối chiếu với quyết định và source hiện tại |

- [Định hướng NCKH](docs/research-direction.md)
- [Tổng quan dự án](docs/PROJECT_OVERVIEW.md)
- [Tiến độ triển khai](docs/PROJECT_PROGRESS.md)
- [Đặc tả B](docs/workflow-b-spec.md) / [quy tắc tài chính](docs/workflow-b-financial-rules.md)
- [Kế hoạch triển khai B](docs/workflow-b-code-plan.md)
- [Nghiệm thu B](docs/workflow-b-acceptance.md)
- [Campaign mẫu qua đơn vị](docs/examples/gift-campaign-institution.md) / [trao trực tiếp](docs/examples/gift-campaign-direct.md)
- [Kiểm chứng nghiệp vụ và củng cố MVP](docs/business-validation-and-mvp-hardening.md)
- [Phục hồi tài chính baseline A](docs/financial-recovery.md)
