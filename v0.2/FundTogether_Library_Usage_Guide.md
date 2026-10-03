# FundTogether — Library Usage Guide

> **Mục tiêu tài liệu:** Định nghĩa vai trò của các thư viện hiện có trong `frontend` và `backend`, cách chúng được sử dụng trong FundTogether, ranh giới trách nhiệm giữa các thư viện, và một số quy ước để tránh code bị chồng chéo hoặc khó mở rộng.

---

# 1. Kiến trúc tổng quan

Repository hiện có frontend, backend và contracts với dependency/build riêng:

```text
FundTogether/
├── frontend/
├── backend/
└── contracts/
```

Luồng chính:

```text
                    ┌────────────────────┐
                    │      Frontend      │
                    │ React + TypeScript │
                    └─────────┬──────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
             REST API                  Wallet / RPC
                │                           │
                ↓                           ↓
       ┌─────────────────┐           Blockchain
       │     Backend     │               │
       │ NestJS + TS     │               │
       └───────┬─────────┘               │
               │                         │
        ┌──────┼──────┐                  │
        │      │      │                  │
        ↓      ↓      ↓                  │
   PostgreSQL Redis   S3                 │
        │                                 │
        └──────── Blockchain Indexing ────┘
```

Nguyên tắc chính:

```text
Frontend
→ UI, form, state, wallet interaction

Backend
→ business data, auth, evidence, file, indexing, API

Blockchain
→ critical financial state, escrow, bond, milestone state, refund
```

---

# 2. Frontend Libraries

## 2.1 React + TypeScript + Vite

### Vai trò

Đây là nền tảng chính của frontend.

React xử lý:

```text
UI
component lifecycle
rendering
composition
interaction
```

TypeScript xử lý:

```text
type safety
API types
contract types
form types
shared frontend models
```

Vite xử lý:

```text
development server
build frontend
environment variables
asset bundling
```

### Trong FundTogether

Dùng để xây:

```text
Campaign List
Campaign Detail
Create Campaign Wizard
Organizer Dashboard
Donor Dashboard
Milestone Detail
Evidence Review
Challenge Flow
Refund Flow
Wallet Interaction UI
```

---

# 2.2 TanStack Query

### Vai trò

Quản lý **server state**.

Dùng cho dữ liệu lấy từ backend:

```text
campaigns
milestones
organizer profile
donor history
evidence metadata
challenge list
reputation
```

### Ví dụ FundTogether

```ts
useQuery({
  queryKey: ['campaign', campaignId],
  queryFn: () => campaignApi.getCampaign(campaignId),
})
```

Mutation:

```ts
useMutation({
  mutationFn: campaignApi.createCampaign,
})
```

Sau khi mutation thành công:

```text
invalidateQueries()
```

để đồng bộ dữ liệu.

### Không dùng cho

```text
modal open/close
selected tab
temporary wizard step
local UI preference
```

Các state đó thuộc Zustand hoặc local React state.

---

# 2.3 Zustand

### Vai trò

Quản lý **client-side state**.

### Dùng trong FundTogether

Phù hợp cho:

```text
Campaign creation wizard
Selected milestone
Modal state
Filter state
Temporary UI state
Wallet UI preference
Draft data chưa submit
```

Ví dụ:

```text
CreateCampaignStore

currentStep
draftMilestones
selectedBeneficiary
previewMode
```

### Không dùng cho

Không nên lưu toàn bộ:

```text
campaign list
campaign detail
donation history
milestone history
```

vào Zustand nếu dữ liệu đã đến từ backend.

Rule:

```text
Server State → TanStack Query
Client State → Zustand
```

---

# 2.4 Zod

### Vai trò

Runtime validation + TypeScript schema.

### Dùng trong FundTogether

Frontend validation:

```text
Create Campaign
Create Milestone
Submit Evidence
Challenge Form
Login input
Environment variables
```

Ví dụ:

```ts
const milestoneSchema = z.object({
  title: z.string().min(3),
  budget: z.string(),
  deadline: z.string(),
})
```

### Dùng kết hợp với

```text
React Hook Form
```

để validate form.

### Không nên coi Zod là

```text
database validator
blockchain security layer
authorization layer
```

Zod chỉ giúp validate shape và rule dữ liệu ở runtime.

---

# 2.5 React Hook Form

### Vai trò

Quản lý form phức tạp hiệu quả.

### Dùng trong FundTogether

Rất phù hợp cho:

```text
Create Campaign Wizard
Create Milestone
Organization Profile
Evidence Submission
Challenge Form
Verifier Form
```

Ví dụ flow:

```text
Form
 ↓
React Hook Form
 ↓
Zod Resolver
 ↓
Validated Data
 ↓
API Mutation / Blockchain Action
```

### Kết hợp

```text
React Hook Form
+
Zod
```

### Không nên

Dùng hàng chục `useState()` cho một form lớn.

---

# 2.6 Axios

### Vai trò

HTTP client giữa frontend và backend.

### Dùng trong FundTogether

Cho:

```text
GET campaign
POST campaign metadata
upload metadata
authentication
refresh token
challenge API
evidence API
reputation API
```

Recommended structure:

```text
src/
└── lib/
    └── http/
        ├── client.ts
        ├── interceptors.ts
        └── errors.ts
```

Ví dụ:

```ts
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})
```

### Interceptor dùng cho

```text
Authorization header
Refresh token
Common error normalization
Request ID
```

### Không dùng Axios cho

Blockchain RPC / smart contract calls.

Phần đó dùng Viem/Wagmi.

---

# 2.7 Wagmi `2.19.5`

### Vai trò

React integration cho Ethereum.

Wagmi cung cấp hooks để frontend giao tiếp với wallet và smart contract.

### Dùng trong FundTogether

```text
Connect wallet
Read contract
Write contract
Wait transaction receipt
Sign message
Watch event
Switch chain
```

Ví dụ:

```text
Donate
Lock Bond
Challenge Milestone
Claim Refund
```

có thể đi qua:

```text
useWriteContract()
```

### Flow

```text
React Component
      ↓
Wagmi
      ↓
Viem
      ↓
Wallet / RPC
      ↓
Blockchain
```

### Không dùng Wagmi

Trong backend.

Backend dùng Viem trực tiếp.

---

# 2.8 Viem

### Vai trò

Ethereum TypeScript client.

Đây là blockchain client thấp hơn Wagmi.

### Frontend dùng Viem cho

```text
formatUnits
parseUnits
keccak256
encode/decode data
contract utilities
signature utilities
```

### Backend dùng Viem cho

```text
read contract
get logs
decode events
verify signatures
query transaction receipt
sync blockchain state
```

### Quan trọng

Không cần thêm Ethers.js nếu Viem đã đáp ứng toàn bộ use case.

Rule:

```text
Frontend → Wagmi + Viem
Backend  → Viem
```

---

# 2.9 RainbowKit

### Vai trò

Wallet connection UI.

### Dùng trong FundTogether

Cung cấp UX cho:

```text
Connect Wallet
Disconnect
Select Wallet
Switch Account
Switch Network
WalletConnect
MetaMask
```

### Lý do dùng

Không cần tự xây toàn bộ wallet modal.

FundTogether nên tập trung effort vào:

```text
protocol
security
evidence
business flow
```

thay vì wallet UI.

---

# 2.10 Orval

### Vai trò

Generate API client từ Swagger/OpenAPI.

### FundTogether flow

Backend:

```text
NestJS
 ↓
Swagger / OpenAPI
```

Frontend:

```text
OpenAPI
 ↓
Orval
 ↓
Generated API client
 ↓
Generated types / hooks
```

### Mục tiêu

Tránh FE và BE định nghĩa duplicated type:

```text
Backend CampaignDto
Frontend CampaignDto
```

rồi dần dần lệch nhau.

### Có thể generate

```text
Axios client
TypeScript types
TanStack Query hooks
```

---

# 2.11 date-fns

### Vai trò

Date/time utility.

### Dùng trong FundTogether

```text
Funding deadline
Milestone deadline
Challenge window
Review countdown
Evidence timestamp
Campaign duration
```

Ví dụ:

```text
"3 days remaining"
"Review closes in 12 hours"
```

### Lưu ý

Blockchain deadline phải dựa vào:

```text
block.timestamp / on-chain timestamp
```

Frontend date chỉ dùng cho display/UX.

---

# 2.12 sonner

### Vai trò

Toast / notification UI.

### Dùng trong FundTogether

Ví dụ:

```text
Campaign created
Evidence uploaded
Wallet connected
Transaction submitted
Transaction confirmed
Challenge opened
Refund successful
```

### Nên phân biệt rõ

```text
Transaction Submitted
≠
Transaction Confirmed
```

Không hiển thị thành công quá sớm.

---

# 3. Backend Libraries

# 3.1 NestJS + TypeScript

### Vai trò

Backend framework chính.

### FundTogether modules nên có

```text
auth
users
wallets
organizations
campaigns
milestones
evidence
files
challenges
reputation
blockchain
notifications
```

Suggested structure:

```text
src/
├── config/
└── modules/
    ├── auth/
    ├── users/
    ├── campaigns/
    ├── milestones/
    ├── evidence/
    ├── challenges/
    ├── reputation/
    └── blockchain/
```

### Backend chịu trách nhiệm

```text
Auth
Authorization
Database
File metadata
Evidence storage
Search
Blockchain indexing
Notifications
Off-chain reputation
```

---

# 3.2 PostgreSQL

### Vai trò

Database chính.

### Dùng lưu

```text
users
wallets
organizations
campaign metadata
milestone metadata
evidence metadata
challenges
verifier data
reputation
blockchain sync state
```

### Không dùng DB làm source of truth cho

```text
donation balance
bond amount
on-chain refund
milestone financial settlement
```

Các giá trị tài chính critical phải lấy blockchain làm source of truth.

Backend có thể cache/index để query nhanh.

---

# 3.3 Drizzle ORM + Drizzle Kit

### Vai trò

Database access và migration.

### Drizzle ORM

Dùng cho:

```text
schema
queries
insert
update
transaction
relations
```

### Drizzle Kit

Dùng cho:

```text
migration generate
migration apply
schema management
```

### Recommended

Database schema phải encode constraint thật:

```text
unique
foreign key
not null
index
```

Không chỉ validate ở application layer.

---

# 3.4 Backend Zod

### Vai trò

Runtime validation.

### Dùng cho

```text
environment variables
request payload
internal service data
blockchain event payload
configuration
```

Có thể tiếp tục dùng Nest global validation pipe tùy implementation.

### Rule

Frontend Zod validation chỉ phục vụ UX.

Backend vẫn phải validate lại dữ liệu.

```text
Never trust frontend validation.
```

---

# 3.5 Swagger / OpenAPI

### Vai trò

API contract giữa Backend và Frontend.

Hiện:

```text
/docs
```

đã có Swagger.

### Dùng cho

```text
API documentation
DTO contract
Frontend generation
Testing
Integration
```

### Kết hợp với Orval

```text
Backend Swagger
      ↓
OpenAPI JSON
      ↓
Orval
      ↓
Frontend generated client
```

Đây nên là interface chính FE ↔ BE.

---

# 3.6 SIWE

### Vai trò

Sign-In With Ethereum.

Dùng để chứng minh user thực sự sở hữu wallet.

### Flow

```text
Frontend requests nonce
        ↓
Backend creates nonce
        ↓
Wallet signs SIWE message
        ↓
Backend verifies signature
        ↓
Session / JWT created
```

### Trong FundTogether

Dùng để link:

```text
User Account
     ↕
Wallet Address
```

### Không được làm

Không trust chỉ vì client gửi:

```text
walletAddress = 0x...
```

---

# 3.7 Backend Viem

### Vai trò

Blockchain client của backend.

### Dùng cho

```text
readContract
getLogs
decodeEventLog
verifyMessage
getTransactionReceipt
getBlock
hash utilities
```

### FundTogether use case

Indexer xử lý:

```text
CampaignCreated
DonationReceived
BondLocked
MilestoneActivated
EvidenceSubmitted
ChallengeOpened
MilestoneSettled
RefundClaimed
```

---

# 3.8 Pino Logging

### Vai trò

Structured logging.

### Dùng thay

```text
console.log()
```

### Log nên chứa context

```json
{
  "requestId": "...",
  "campaignId": "...",
  "milestoneId": "...",
  "txHash": "...",
  "event": "blockchain_sync"
}
```

### Quan trọng cho

```text
debug sync
trace failed transaction
production logs
queue retry
API errors
```

---

# 3.9 Argon2

### Vai trò

Password hashing.

Nếu FundTogether hỗ trợ:

```text
email + password
```

thì dùng Argon2.

### Không dùng cho

```text
hash evidence
blockchain hashing
signature
```

Evidence hash dùng SHA-256 hoặc keccak256 tùy design.

---

# 3.10 AWS S3 SDK

### Vai trò

Object storage client.

### Dùng cho

```text
invoice
bank proof
photo
video
beneficiary document
organization document
```

### Recommended flow

```text
Frontend
   ↓
Request Presigned URL
   ↓
Backend
   ↓
Generate URL
   ↓
Frontend uploads file directly
   ↓
S3 / R2 / MinIO
```

### Ưu điểm

Backend không phải proxy file lớn.

---

# 3.11 BullMQ + Redis Client

### Vai trò

Background job system.

### Dùng khi FundTogether có

```text
blockchain sync retry
email
notification
evidence processing
file validation
report generation
event processing
```

Flow:

```text
Event / API
   ↓
Queue
   ↓
Worker
   ↓
Database / Notification
```

### Không cần

Đưa mọi API request vào queue.

Chỉ dùng cho công việc:

```text
async
retryable
slow
background
```

---

# 3.12 file-type

### Vai trò

Detect actual file type.

### FundTogether use case

User upload:

```text
invoice.pdf
```

Không nên chỉ tin:

```text
filename
MIME header từ client
```

Backend dùng `file-type` để kiểm tra nội dung thực tế nếu phù hợp.

### Mục tiêu

Giảm file upload giả dạng.

---

# 3.13 jose

### Vai trò

JWT / JWS / crypto utility.

### Dùng cho

```text
sign JWT
verify JWT
session token
access token
refresh token
```

### FundTogether

Có thể kết hợp:

```text
SIWE
 ↓
Backend verification
 ↓
JWT/session
```

### Không tự implement JWT crypto.

---

# 4. Library Responsibility Map

| Concern | Library |
|---|---|
| Server state | TanStack Query |
| Client state | Zustand |
| Runtime validation | Zod |
| Forms | React Hook Form |
| HTTP | Axios |
| API generation | Orval |
| Wallet React integration | Wagmi |
| Ethereum client | Viem |
| Wallet UI | RainbowKit |
| Dates | date-fns |
| Toast UX | sonner |
| Backend framework | NestJS |
| Database | PostgreSQL |
| ORM | Drizzle |
| Migration | Drizzle Kit |
| API contract | Swagger/OpenAPI |
| Wallet authentication | SIWE |
| Structured logging | Pino |
| Password hashing | Argon2 |
| File storage | AWS S3 SDK |
| Background jobs | BullMQ |
| Queue storage | Redis |
| File inspection | file-type |
| JWT/JWS | jose |

---

# 5. Những cặp dễ nhầm

## Zustand vs TanStack Query

```text
Zustand
→ local/client state

TanStack Query
→ remote/server state
```

---

## Axios vs TanStack Query

```text
Axios
→ gửi HTTP request

TanStack Query
→ quản lý lifecycle của request
```

Flow:

```text
TanStack Query
      ↓
Axios
      ↓
Backend
```

---

## Wagmi vs Viem

```text
Wagmi
→ React hooks

Viem
→ Ethereum client
```

---

## Zod vs Database Constraint

```text
Zod
→ application validation

PostgreSQL Constraint
→ database integrity
```

Cả hai đều cần.

---

## SIWE vs JWT

```text
SIWE
→ chứng minh ownership của wallet

JWT
→ duy trì authenticated session
```

Flow:

```text
SIWE
 ↓
Authentication successful
 ↓
JWT/session
```

---

# 6. FundTogether Data Ownership

## Blockchain là source of truth cho

```text
donation
bond
funding goal result
milestone financial state
released funds
refund entitlement
challenge state nếu on-chain
critical settlement
```

---

## PostgreSQL là source of truth cho

```text
user profile
organization profile
campaign descriptions
images
search metadata
evidence metadata
notification
reputation metadata
admin workflow
```

---

## Object Storage là source of truth cho raw files

```text
invoice
bank statement
photo
video
identity document
beneficiary document
```

Blockchain chỉ lưu:

```text
hash
commitment
timestamp
critical reference
```

---

# 7. Recommended Frontend Flow

Ví dụ donor donate:

```text
Campaign Detail
      ↓
Backend API loads metadata
      ↓
TanStack Query caches metadata
      ↓
Wagmi checks wallet
      ↓
Viem parseUnits(amount)
      ↓
Approve ERC20
      ↓
Donate transaction
      ↓
Wait receipt
      ↓
Backend indexer receives event
      ↓
Database updates indexed view
      ↓
TanStack Query invalidate
      ↓
UI refresh
```

---

# 8. Recommended Evidence Flow

```text
Organizer selects file
      ↓
React Hook Form + Zod
      ↓
Frontend requests presigned URL
      ↓
Backend validates permission
      ↓
S3 SDK creates presigned URL
      ↓
Frontend uploads
      ↓
Backend records metadata
      ↓
Hash calculated
      ↓
Wagmi/Viem commits hash on-chain
      ↓
Indexer confirms event
      ↓
Evidence becomes ON_CHAIN_CONFIRMED
```

Suggested evidence status:

```text
DRAFT
UPLOADED
HASHED
TX_PENDING
ON_CHAIN_CONFIRMED
UNDER_REVIEW
VERIFIED
DISPUTED
```

---

# 9. Recommended Authentication Flow

```text
User opens app
    ↓
Connect Wallet
    ↓
GET /auth/nonce
    ↓
SIWE message
    ↓
Wallet signature
    ↓
POST /auth/verify
    ↓
Backend verifies with SIWE/Viem
    ↓
JWT/session issued with jose
    ↓
Frontend uses authenticated API
```

Nếu có password login:

```text
Password
   ↓
Argon2
   ↓
User record
```

Wallet auth và password auth có thể coexist.

---

# 10. Recommended Backend Module Ownership

```text
auth/
→ SIWE, JWT, sessions

users/
→ user profile

organizations/
→ organizer / charity entity

campaigns/
→ campaign metadata

milestones/
→ milestone metadata

evidence/
→ evidence metadata / status

files/
→ S3 / file processing

challenges/
→ off-chain challenge metadata

reputation/
→ badges / history

blockchain/
→ Viem, event sync, tx verification

notifications/
→ async notification

queues/
→ BullMQ workers
```

---

# 11. MVP Usage Priority

Không cần dùng hết toàn bộ thư viện ngay từ ngày đầu.

## P0 — Dùng ngay

```text
Frontend
- TanStack Query
- Zustand
- Zod
- React Hook Form
- Axios
- Wagmi
- Viem
- RainbowKit

Backend
- NestJS
- PostgreSQL
- Drizzle
- Zod
- Swagger
- Pino
- Viem
```

---

## P1 — Dùng khi bắt đầu auth / file

```text
SIWE
jose
Argon2
AWS S3 SDK
file-type
```

---

## P2 — Dùng khi hệ thống có async/indexing nhiều hơn

```text
BullMQ
Redis
```

---

## P3 — Automation

```text
Orval
```

Nên đưa vào sớm khi API bắt đầu ổn định.

---

# 12. Các quy ước kiến trúc nên giữ

## Rule 1

Frontend không quyết định financial truth.

Không dựa vào frontend để quyết định:

```text
user có được refund không
milestone đã settle chưa
bond đủ chưa
```

---

## Rule 2

Backend không được giả làm blockchain source of truth.

DB có thể cache:

```text
donation amount
milestone state
```

nhưng phải trace ngược được về:

```text
block number
tx hash
event
contract address
```

---

## Rule 3

Không duplicate API type bằng tay nếu có thể generate.

```text
OpenAPI
 ↓
Orval
```

---

## Rule 4

Không dùng `number` cho token accounting.

Frontend/Web3 dùng:

```text
bigint
parseUnits
formatUnits
```

---

## Rule 5

Không trust file metadata từ client.

Backend phải validate:

```text
size
allowed type
actual type
ownership
upload permission
```

---

## Rule 6

Không hiển thị transaction thành công khi mới broadcast.

State nên là:

```text
IDLE
SIGNING
SUBMITTED
CONFIRMING
CONFIRMED
FAILED
```

---

## Rule 7

Không để business-critical logic chỉ tồn tại trong frontend.

Logic quan trọng phải nằm ở:

```text
Smart Contract
hoặc
Backend
```

tùy loại rule.

---

# 13. Tóm tắt

Stack hiện tại phù hợp với kiến trúc FundTogether.

Mental model cuối cùng:

```text
React
├── TanStack Query → Server State
├── Zustand        → Client State
├── RHF + Zod      → Forms
├── Axios          → Backend HTTP
└── Wagmi + Viem   → Blockchain

NestJS
├── PostgreSQL + Drizzle → Application Data
├── Zod                   → Validation
├── Swagger               → API Contract
├── SIWE + Viem           → Wallet Auth / Blockchain
├── jose + Argon2         → Auth
├── Pino                  → Logging
├── S3 SDK + file-type    → Evidence Files
└── BullMQ + Redis        → Background Jobs
```

FundTogether nên giữ nguyên triết lý:

```text
Frontend
→ User Interaction

Backend
→ Off-chain Application State

Blockchain
→ Critical Financial State

Storage
→ Raw Evidence Files
```

Nếu giữ rõ ranh giới này ngay từ đầu, project sẽ dễ mở rộng hơn rất nhiều khi thêm:

```text
smart contracts
event indexer
verifier workflow
reputation
private evidence
organization verification
multi-chain support
```

mà không phải thay lại toàn bộ kiến trúc.

## Trạng thái sử dụng và Arc — 2026-10-03

Danh sách thư viện là vai trò đề xuất, không chứng minh integration hoàn tất.
Viem/Wagmi cần Arc chain/deployment metadata; không mặc định native currency ETH.
Token 6 decimals, native gas/value 18 decimals dùng bigint; JSON decimal strings.
Không lấy parseUnits(amount, 6) làm native tx.value hoặc cộng hai balance.

Ponder chưa setup; BlockchainService hiện chỉ kiểm tra RPC config. Xem
[Arc sources](./FundTogether_Arc_Evaluation_v0.1.md) và
[mốc còn thiếu](./FundTogether_Milestone_Review_2026-10-03.md).
