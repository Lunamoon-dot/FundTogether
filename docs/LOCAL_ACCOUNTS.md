# FundTogether Campaign — Local fixture accounts

> **Historical pre-reset fixture guide:** The account roles below describe the
> old Resolver/Admin runtime. The new protocol requires separate Judge stake
> fixtures and a new local seed policy before runtime migration. Do not use the
> Resolver accounts below as protocol authority.

Tài liệu này mô tả cách tạo fixture cho môi trường Anvil local. Đăng nhập chỉ
dùng ví Anvil tương ứng và chữ ký SIWE. Private key, seed phrase và mật khẩu
không được lưu trong repository hoặc tài liệu. Không dùng fixture local cho
mạng thật.

## Runtime local

- RPC: `http://127.0.0.1:9548`
- Chain ID: `31339`
- Web: `http://127.0.0.1:5175`
- Database: PostgreSQL local theo `.local/fundtogether/backend.env`

Địa chỉ Campaign, token và Resolver phải đọc từ:

```text
.local/fundtogether/generated/campaigns-deployment.local.json
```

Không copy địa chỉ deployment cố định vào tài liệu hoặc frontend. Manifest được tạo/kiểm tra bởi launcher sau khi Foundry build hoàn tất.

Tài khoản Admin được tách khỏi Resolver: Admin chỉ mang role `ADMIN`, không dùng
ví Admin để ký `approveCampaign`. Primary Resolver phải dùng đúng ví trong
`manifest.resolver`; Backup Resolver dùng `manifest.backupResolver`.

## Tạo tài khoản fixture

Chạy từ thư mục gốc:

```powershell
npm run seed:accounts --prefix backend
```

Lệnh này tạo/cập nhật **6 tài khoản ví**, liên kết đúng ví Anvil theo
`accountIndex`, cấp role nếu có, và mint 10,000 MockUSDC cho mỗi ví. Email
fixture chỉ là nhãn metadata để operator nhận diện account; nó không dùng để
đăng nhập.

Sau khi seed hoàn tất, script cũng sinh bảng Markdown dễ đọc ở:

```text
.local/fundtogether/LOCAL_ACCOUNTS.md
```

File local này ghi email label, role, địa chỉ ví công khai và chain ID. Không
ghi private key/seed phrase vào file hoặc gửi qua chat.

Script lấy các địa chỉ unlocked hiện tại từ Anvil theo thứ tự account, liên kết
chúng vào PostgreSQL và mint MockUSDC local. Nếu reset Anvil, chạy lại script để
đồng bộ lại wallet links và số dư. Địa chỉ ví phụ thuộc vào Anvil hiện tại.

### Bảng tài khoản và ví

| Index | Vai trò | Email label | Ví được liên kết |
|---:|---|---|---|
| 0 | Admin | `admin@fundtogether.com` | Anvil `eth_accounts[0]` |
| 1 | Primary Resolver | `resolver@fundtogether.com` | Anvil `eth_accounts[1]` |
| 2 | Backup Resolver | `backup-resolver@fundtogether.com` | Anvil `eth_accounts[2]` |
| 3 | Creator | `creator@fundtogether.com` | Anvil `eth_accounts[3]` |
| 4 | Backer 1 | `backer1@fundtogether.com` | Anvil `eth_accounts[4]` |
| 5 | Backer 2 | `backer2@fundtogether.com` | Anvil `eth_accounts[5]` |

Bảng dễ đọc nằm trong `.local/fundtogether/LOCAL_ACCOUNTS.md`. Nếu cần tạo lại
bảng sau khi reset Anvil, chạy lại lệnh seed ở trên. Để in bảng đầy đủ trực
tiếp trong PowerShell, chạy sau khi Anvil và database đã sẵn sàng:

```powershell
$rpcResult = Invoke-RestMethod -Uri 'http://127.0.0.1:9548' -Method Post -ContentType 'application/json' -Body (@{
  jsonrpc = '2.0'; id = 1; method = 'eth_accounts'; params = @()
} | ConvertTo-Json -Compress)
$fixtures = @(
  @{ Index = 0; Role = 'Admin'; Email = 'admin@fundtogether.com' }
  @{ Index = 1; Role = 'Primary Resolver'; Email = 'resolver@fundtogether.com' }
  @{ Index = 2; Role = 'Backup Resolver'; Email = 'backup-resolver@fundtogether.com' }
  @{ Index = 3; Role = 'Creator'; Email = 'creator@fundtogether.com' }
  @{ Index = 4; Role = 'Backer 1'; Email = 'backer1@fundtogether.com' }
  @{ Index = 5; Role = 'Backer 2'; Email = 'backer2@fundtogether.com' }
)
$fixtures | ForEach-Object {
  [pscustomobject]@{
    Index = $_.Index
    Role = $_.Role
    Email = $_.Email
    Wallet = $rpcResult.result[$_.Index]
    ChainId = 31339
  }
} | Format-Table -AutoSize
```

Lệnh trên chỉ in email label và **public wallet addresses**; nó không in
private key hoặc seed phrase. Không chụp hoặc dán output này vào commit, issue
hay chat. Tại `#/account`, kết nối đúng ví rồi ký thông điệp SIWE để đăng nhập;
ví mới sẽ tự tạo account, ví đã seed sẽ vào account tương ứng.

## MetaMask và Campaign flow

Thêm network `FundTogether Local` với RPC và chain ID ở trên. Import MockUSDC bằng địa chỉ trong Campaign manifest và giữ decimals là `6`.

Luồng test chính:

1. Creator đăng nhập, hoàn thành hồ sơ/IP declaration, tạo một Campaign `COMICS_ARTBOOK` với một tier PDF.
2. Resolver kiểm tra hồ sơ, evidence mẫu và mở/đóng community review theo kết quả thẩm định.
3. Creator publish Campaign on-chain.
4. Backer approve MockUSDC rồi pledge; indexer phải ghi nhận receipt và canonical entitlement.
5. Creator nộp production evidence và final PDF; Resolver kiểm tra release.
6. Backer nhận ticket tải PDF private hoặc claim refund theo state canonical.

Fixture này chỉ chứng minh luồng local có thể chạy. Nó không chứng minh quyền IP ngoài đời, chất lượng nội dung, hoặc giao dịch trên chain thật.
