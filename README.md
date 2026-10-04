# FundTogether

FundTogether là dự án crowdfunding từ thiện với campaign, milestone, hồ sơ bằng
chứng và escrow/bond trên blockchain. Dự án đang phát triển theo từng bước;
campaign draft lưu ở backend chưa đồng nghĩa campaign đã được công bố trên chain.

Hướng dẫn này dùng **Windows + PowerShell**, với **Foundry/Anvil trong WSL Ubuntu**.
Cập nhật: **04/10/2026**.

## 1. Những phần đang chạy được

| Phần | Trạng thái hiện tại |
|---|---|
| Tài khoản | Email/mật khẩu, session cookie; liên kết ví bằng chữ ký sau khi đăng nhập |
| Tổ chức | Tạo tổ chức, người tạo nhận OWNER; xem hồ sơ trong khu vực người dùng |
| Workspace | Quản lý campaign của tổ chức trong tab riêng |
| Campaign | Lưu/sửa bản nháp, milestones và tiêu chí hoàn thành |
| Evidence | Lưu/sửa báo cáo theo milestone; upload/tải bản gốc riêng tư qua MinIO |
| Contract | Prototype Foundry; xem trạng thái và giới hạn trong contracts/README.md |
| Feed/donation/indexer | Chưa nối thành journey FE/BE/chain hoàn chỉnh |

Freeze/hash, public redaction, nộp evidence lên contract và phần tranh chấp còn
cần hoàn thiện. Không có deployment address/ABI dùng chung đã xác nhận cho FE/BE.

```text
Frontend (5173) -> NestJS API (3000) -> PostgreSQL (5432)
                              └----> MinIO S3 API (9000)

Wallet / blockchain service -------> Anvil RPC (8545, chain 31337)
```

PostgreSQL lưu tài khoản, quyền, metadata và hồ sơ. MinIO lưu nội dung file.
Contract quản lý trạng thái tài chính khi journey on-chain được nối.

## 2. Chuẩn bị công cụ

| Công cụ | Yêu cầu / cách cài |
|---|---|
| Git | Có lệnh git; cần tải cả submodules của contracts |
| Node.js | Dùng **24.x**, tương ứng runtime đã kiểm tra; [tải Node.js](https://nodejs.org/en/download) |
| npm | Đi kèm Node; hướng dẫn dùng npm.cmd trong PowerShell |
| PostgreSQL | Cài server + pgAdmin; máy phát triển hiện dùng 18.x; [Windows installer](https://www.postgresql.org/download/windows/) |
| Docker Desktop | Chạy Linux containers, mở Docker Desktop trước khi chạy MinIO; [hướng dẫn Windows](https://docs.docker.com/desktop/setup/install/windows-install/) |
| WSL + Ubuntu | Dùng Ubuntu-24.04 cho Foundry/Anvil |
| Ví trình duyệt | Tùy chọn cho luồng liên kết ví; ví dụ MetaMask |

Kiểm tra công cụ trong PowerShell:

```powershell
git --version
node --version
npm.cmd --version
docker compose version
docker info
wsl --list --verbose
```

Nếu chưa có Ubuntu, cài WSL theo môi trường Windows của bạn:

```powershell
wsl --install -d Ubuntu-24.04
```

Hoàn tất thiết lập user Ubuntu, khởi động lại Windows nếu trình cài yêu cầu.
Nếu dùng distro khác, thay Ubuntu-24.04 trong các lệnh bên dưới.

### Cài Foundry trong Ubuntu

Mở Ubuntu bằng PowerShell:

```powershell
wsl -d Ubuntu-24.04
```

Chạy **trong terminal Ubuntu**, không chạy khối này trực tiếp trong PowerShell:

```bash
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup
~/.foundry/bin/forge --version
~/.foundry/bin/anvil --version
exit
```

Tham khảo [hướng dẫn cài Foundry](https://getfoundry.sh/getting-started/installation?embedable=true).

## 3. Clone và cài dependencies

Clone trong thư mục làm việc bạn chọn:

```powershell
git clone --recurse-submodules https://github.com/Lunamoon-dot/FundTogether.git
Set-Location FundTogether
```

Nếu đã clone trước đó, chạy ở thư mục gốc repo:

```powershell
git submodule update --init --recursive
```

Cài dependencies theo lockfile; repo chưa có npm workspace/package.json ở root:

```powershell
Set-Location backend
npm.cmd ci
Set-Location ..
Set-Location frontend
npm.cmd ci
Set-Location ..
```

Các bước tiếp theo bắt đầu từ **thư mục gốc repo**, trừ khi có chỉ dẫn khác.
Contracts dùng dependencies trong contracts/lib qua Git submodules.

## 4. Tạo cấu hình local

Copy mẫu nếu file cấu hình chưa tồn tại, tránh ghi đè cấu hình đang dùng:

```powershell
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
```

Sửa backend/.env theo máy của bạn:

```dotenv
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@localhost:5432/fundtogether
WEB_ORIGIN=http://localhost:5173
AUTH_DOMAIN=localhost:5173
AUTH_CHAIN_ID=31337
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=fundtogether-evidence-private
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

- DATABASE_URL gồm user, mật khẩu, host, port và tên database bạn thực sự tạo.
  Thay postgres/fundtogether nếu dùng tên khác. URL-encode phần mật khẩu nếu có
  ký tự đặc biệt như @, # hoặc %; không gửi URL chứa mật khẩu vào chat/log.
- **Để trống hai khóa S3 trên lần setup đầu**, rồi dùng script ở bước 6 để tạo
  credentials. Script giữ giá trị đã có; để nguyên CHANGE_ME từ file mẫu sẽ
  không tự tạo credentials mới.
- REDIS_URL có trong mẫu nhưng chưa cần Redis để chạy các luồng trong README.
- Auth hiện dùng session trong PostgreSQL; không cần AUTH_JWT_SECRET cho luồng này.

Frontend cần:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

VITE_CHAIN_ID/VITE_CONTRACT_ADDRESS trong file mẫu còn là cấu hình dự kiến.
Wallet provider hiện dùng chain Foundry 31337 trong AppProviders.tsx, chưa đọc
hai biến đó để đổi chain hoặc tự nối contract. Không điền địa chỉ contract giả.

Giữ URL frontend là **http://localhost:5173** để khớp Origin/SIWE domain. Đổi
sang 127.0.0.1 ở trình duyệt cần chỉnh cấu hình tương ứng. Restart BE/FE sau khi
đổi env. File .env và .env.local được Git ignore; không commit credentials.

## 5. PostgreSQL: chạy server, tạo DB và migrate

Hướng dẫn chính dùng PostgreSQL cài trên Windows; compose.storage.yaml chỉ chạy
MinIO, không tạo PostgreSQL container.

Kiểm tra service:

```powershell
Get-Service -Name 'postgresql*'
```

Nếu service dừng, mở PowerShell với quyền phù hợp và dùng tên service thực tế:

```powershell
Start-Service -Name postgresql-x64-18
```

Tên trên là ví dụ cho bản 18; dùng tên trả về bởi Get-Service trên máy của bạn.

Trong pgAdmin, kết nối server bằng user/mật khẩu đã đặt khi cài, mở Query Tool
trên database postgres và chạy một lần nếu database chưa tồn tại:

```sql
CREATE DATABASE fundtogether;
```

Hoặc dùng psql nếu đã có trong PATH; lệnh sẽ hỏi mật khẩu:

```powershell
psql -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE fundtogether;"
```

Nếu psql không có trong PATH, dùng pgAdmin hoặc executable trong thư mục bin của
bản PostgreSQL đã cài. Không chạy lại CREATE DATABASE khi DB đã tồn tại.

Áp dụng migrations đang có, từ repo root:

```powershell
Set-Location backend
npm.cmd run db:migrate
Set-Location ..
```

db:migrate áp dụng migrations; db:generate dùng khi phát triển schema mới,
không cần chạy để setup một checkout thông thường. User DB cần quyền tạo bảng
và chạy migrations trong database này.

## 6. MinIO: chạy storage và khởi tạo bucket

Mở Docker Desktop, đợi docker info trả về thông tin server. Từ repo root:

```powershell
node backend/scripts/setup-local-storage.cjs
docker compose --env-file backend/.env -f compose.storage.yaml up -d --build
docker compose --env-file backend/.env -f compose.storage.yaml ps
```

Lần đầu build image tải Go và dependencies nên có thể mất vài phút. MinIO
Community hiện source-only và không còn được bảo trì; image local build từ
commit chính thức cố định. Đây là môi trường học/local, chưa phải lựa chọn
storage production. Xem [MinIO README](https://github.com/minio/minio) và
[chi tiết storage của project](docs/backend-step-5-evidence-upload.md).

Khởi tạo bucket bằng code backend đã build:

```powershell
Set-Location backend
npm.cmd run build
node scripts/initialize-local-storage.cjs
Set-Location ..
```

| Địa chỉ | Vai trò |
|---|---|
| http://127.0.0.1:9000 | API S3 cho backend |
| http://127.0.0.1:9001 | Console MinIO; đăng nhập bằng các khóa S3 trong backend/.env |
| http://127.0.0.1:9000/minio/health/live | Health storage, mong đợi HTTP 200 |

Bucket fundtogether-evidence-private không có anonymous policy. Tài liệu nằm
dưới originals/; người dùng tải qua API có kiểm tra quyền. Named volume giữ dữ
liệu qua container restart. Không dùng compose down -v nếu muốn giữ file.

## 7. Chạy BE, FE và Anvil

Mở các terminal riêng để process tiếp tục chạy. Mỗi terminal BE/FE bắt đầu ở repo
root. PostgreSQL và Docker Desktop cần đang chạy; MinIO đã được khởi tạo.

### Terminal 1 — backend

```powershell
Set-Location backend
npm.cmd run start:dev
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/docs
- Health: http://localhost:3000/health

Health xác nhận API đã chạy; endpoint này không tự kiểm tra toàn bộ DB/storage.

### Terminal 2 — frontend

```powershell
Set-Location frontend
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

Mở http://localhost:5173. --strictPort giúp không âm thầm đổi cổng và lệch Origin
khi 5173 đã bị process khác chiếm.

### Terminal 3 — Anvil, khi cần wallet/blockchain local

Chạy đúng **một lệnh**, giữ terminal này mở:

```powershell
wsl -d Ubuntu-24.04 -- bash -lc '~/.foundry/bin/anvil --host 0.0.0.0 --port 8545 --chain-id 31337'
```

| Network setting | Giá trị |
|---|---|
| Network name | FundTogether Local / Foundry |
| RPC URL trong ví | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency symbol | ETH |

Tài khoản và khóa do Anvil cung cấp chỉ dùng cho local. Dùng ví thử nghiệm riêng.
Anvil khởi động mới mặc định không giữ state phiên trước; địa chỉ deployment và
balance cũ có thể không còn hợp lệ.

**Anvil chỉ tạo local blockchain, không tự deploy FundTogether/MockUSDC.** Repo
chưa có flow deploy local/ABI dùng chung cho journey FE/BE hoàn chỉnh. Không có
lệnh publish/donate qua UI đã hoàn thiện trong hướng dẫn này.

Luồng email/tổ chức/campaign draft/evidence không cần chạy Anvil. Khi dùng ví
trên network Foundry, để Anvil chạy cho ví đọc network/balance; lỗi Unable to
connect to Foundry phải kiểm tra Anvil/network. Chữ ký SIWE là thao tác off-chain.

## 8. Thử các luồng hiện có trên UI

### Tài khoản → tổ chức → campaign

1. Mở http://localhost:5173/#/account, đăng ký bằng email và mật khẩu 12–128 ký tự.
2. Vào Tổ chức của tôi, tạo tổ chức. Tài khoản tạo tổ chức nhận OWNER.
3. Xem hồ sơ tổ chức trong tab người dùng; bấm Quản lý campaign để mở workspace
   của tổ chức trong tab riêng.
4. Vào Campaign → Tạo campaign. Điền tên/mô tả, Next sang milestones.
5. Điền từng milestone và tiêu chí; dùng Add milestone khi cần thêm.
6. Xem lại và lưu. Mở campaign để xem hoặc sửa bản nháp đã lưu.

Tổ chức mới có trạng thái chưa xác minh. Campaign được lưu ở DB, chưa công bố
trên chain. Quyền dựa trên membership tổ chức; người tạo không giữ quyền riêng
nếu đã mất membership. Workspace cá nhân vẫn dành cho các draft cá nhân cũ.

### Campaign → milestone → evidence → file

1. Trong chi tiết campaign, bấm Mở hồ sơ bằng chứng ở milestone cần làm; hoặc
   vào Bằng chứng → chọn campaign → chọn milestone bằng tên.
2. Điền báo cáo, thời gian thực hiện và kết quả theo tiêu chí, rồi Lưu hồ sơ.
3. Chọn loại tài liệu và file. Hỗ trợ PDF/JPEG/PNG, tối đa 10 MiB/file và
   20 file/hồ sơ. Lưu thay đổi báo cáo trước khi thêm file.
4. Dùng Tải về để lấy bản gốc qua API; reload để đọc lại hồ sơ đã lưu.
5. Nếu hai tab cùng sửa, revision cũ bị từ chối. Form giữ nội dung, cho phép tải
   bản mới nhất sau khi xác nhận. Nếu milestone đổi thứ tự trước lần lưu đầu,
   server chặn ID/index cũ và yêu cầu tải lại campaign.

Sau khi campaign có evidence, API hiện chặn sửa kế hoạch campaign để giữ tham
chiếu milestones. Lưu hồ sơ/upload thành công chưa phải freeze hay nộp xét duyệt.

### Liên kết ví — tùy chọn

Đăng nhập account trước, vào phần tài khoản, kết nối ví và ký yêu cầu liên kết
SIWE. Chữ ký chứng minh quyền kiểm soát địa chỉ; thao tác liên kết không gửi
transaction. Liên kết ví không tự cấp quyền tổ chức hoặc quyền contract.

Feed, đóng góp/refund và quyết định verifier chưa có journey UI/on-chain đầy đủ.

## 9. Build và kiểm tra dành cho người phát triển

Từ backend/:

```powershell
npm.cmd run build
npm.cmd test -- --runInBand
node scripts/auth-smoke.cjs
node scripts/organization-campaign-smoke.cjs
node scripts/evidence-upload-smoke.cjs
```

Smoke scripts cần DB local đã migrate; evidence smoke cần MinIO/bucket. Chạy trên
DB phát triển, lần lượt từng script. Chúng mở Nest trên cổng tạm, tạo accounts và
dữ liệu thử rồi xóa dữ liệu thuộc lần chạy đó. Build trước khi chạy vì scripts
đọc code trong dist/. Kết quả HTTP không thay thế kiểm tra thao tác trình duyệt.

Từ frontend/:

```powershell
npm.cmd run build
npm.cmd run lint
```

Build/test contract, chạy **từ repo root trong PowerShell**; --cd chuyển thư mục
Windows sang working directory của WSL:

```powershell
wsl -d Ubuntu-24.04 --cd "$((Get-Location).Path)\contracts" -- bash -lc '~/.foundry/bin/forge build'
wsl -d Ubuntu-24.04 --cd "$((Get-Location).Path)\contracts" -- bash -lc '~/.foundry/bin/forge test -vv'
```

Forge tests tự chạy EVM test, không cần Anvil đang mở. Xem thêm
[contract guide](contracts/README.md); chưa coi mọi nhánh timeout/dispute là đã
được test chỉ vì contract build thành công.

## 10. Lỗi thường gặp và dừng local

| Triệu chứng | Kiểm tra |
|---|---|
| npm.ps1 bị PowerShell chặn | Dùng npm.cmd như các lệnh trên |
| Docker daemon/pipe unavailable | Mở Docker Desktop, đợi docker info thành công |
| Không kết nối được DB | Service PostgreSQL, host/port, DB đã tạo, user/password và DATABASE_URL |
| Relation/table does not exist | Chạy db:migrate đúng backend/.env và database |
| Origin must match / SIWE domain sai | Dùng localhost:5173 và kiểm tra WEB_ORIGIN/AUTH_DOMAIN |
| Cannot GET/POST endpoint mới | Kiểm tra đúng API URL, restart BE đang chạy code cũ |
| Vite trắng sau thay đổi dependencies | Restart Vite; có thể dùng npm.cmd run dev -- --force --host localhost --port 5173 --strictPort |
| Foundry RPC không truy cập được | Terminal Anvil còn chạy, RPC 8545, chain 31337 và network trong ví |
| MinIO credentials không hợp lệ | Đừng giữ CHANGE_ME; keys trong backend/.env phải khớp container. Restart BE và recreate service khi đổi keys |
| Storage unavailable | MinIO health, S3 env, bucket initializer, bucket không có public policy |
| Port already in use | Kiểm tra process đang dùng cổng; tránh chạy hai instance cùng cổng |

Dừng FE/BE/Anvil bằng Ctrl+C trong terminal tương ứng. Dừng storage từ repo root:

```powershell
docker compose --env-file backend/.env -f compose.storage.yaml stop
```

Lần chạy sau: PostgreSQL service → Docker Desktop/MinIO → BE → FE; thêm Anvil
khi cần luồng ví/blockchain. Không cần cài lại dependencies hay generate migration
mỗi lần chạy. Sau khi pull thay đổi lockfile, chạy lại npm ci trong package liên quan.

## Tài liệu

- [Kiến trúc hiện tại](docs/PROJECT_OVERVIEW.md)
- [Tiến độ và bằng chứng kiểm tra](docs/PROJECT_PROGRESS.md)
- [Account và wallet](docs/accounts-and-wallets.md)
- [Campaign/evidence draft API](docs/backend-step-2-drafts.md)
- [Tổ chức sở hữu campaign](docs/backend-step-4-organization-campaigns.md)
- [Upload và storage](docs/backend-step-5-evidence-upload.md)
- [Contract prototype](contracts/README.md)
- [Tài liệu thiết kế v0.2](v0.2/README.md)

README được đối chiếu với code/config/scripts hiện tại và các kết quả local
trong PROJECT_PROGRESS. Toàn bộ setup từ clone trên máy sạch chưa được chạy lại;
các màn hình trên trình duyệt vẫn cần kiểm tra thủ công.
