# FundTogether v0.2 — Tech Stack & Learning Roadmap

> **Project type:** Donation-based charitable crowdfunding  
> **Architecture:** Separate Frontend / Backend / Smart Contracts  
> **Core protocol:** Milestone Escrow + Evidence Verification + Organizer Bond + Challenge Governance + Reputation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Frontend Stack](#2-frontend-stack)
3. [Backend Stack](#3-backend-stack)
4. [Blockchain / Web3 Stack](#4-blockchain--web3-stack)
5. [Smart Contract Tooling](#5-smart-contract-tooling)
6. [Evidence & Storage](#6-evidence--storage)
7. [Repository Structure](#7-repository-structure)
8. [Integration Contracts](#8-integration-contracts)
9. [Learning Priorities](#9-learning-priorities)
10. [Suggested Learning Order](#10-suggested-learning-order)
11. [What NOT to Overlearn](#11-what-not-to-overlearn)
12. [Final Recommended Stack](#12-final-recommended-stack)

---

# 1. Architecture Overview

FundTogether nên được tách thành 3 project độc lập:

```text
fundtogether-frontend/
fundtogether-backend/
fundtogether-contracts/
```

Kiến trúc tổng quát:

```text
                         ┌─────────────────────┐
                         │      React FE       │
                         │                     │
                         │ TanStack Query      │
                         │ Zustand             │
                         │ Zod + RHF           │
                         │ Axios               │
                         │ Wagmi + Viem        │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                  REST API                    Wallet TX
                     │                             │
                     ↓                             ↓
            ┌─────────────────┐              Blockchain
            │     NestJS      │                   │
            │                 │                   │
            │ Zod             │                   │
            │ Drizzle         │                   │
            │ Viem            │                   │
            │ BullMQ          │                   │
            └──────┬───┬──────┘                   │
                   │   │                           │
              ┌────┘   └─────┐                    │
              ↓              ↓                    │
         PostgreSQL       Redis/BullMQ             │
              │                                    │
              │             ┌──────────────────────┘
              │             │
              │             ↓
              │          Ponder
              │             │
              └─────────────┘

          NestJS ─────────────→ S3 / Private Evidence
                                IPFS / Public Evidence
```

## Core separation

FundTogether cần giữ rõ 4 ranh giới:

```text
Zustand          ≠ TanStack Query
Client State       Server State

Axios            ≠ TanStack Query
HTTP Transport     Request Lifecycle / Cache

Wagmi            ≠ Viem
React Web3         Ethereum Client

PostgreSQL       ≠ Blockchain
Application Data   Critical Financial State
```

---

# 2. Frontend Stack

## Recommended Stack

```text
React + TypeScript
│
├── TanStack Query
├── Zustand
├── Zod
├── React Hook Form
├── Axios
├── Orval
│
├── Wagmi
├── Viem
├── RainbowKit
│
├── date-fns
└── sonner
```

---

## 2.1 TanStack Query

**Priority:** ★★★★★

Dùng cho **server state**:

```text
campaigns
milestones
organizer profile
evidence metadata
challenge history
reputation
```

Mental model:

```text
Server State
    ↓
TanStack Query
    ↓
React Component
```

Các API quan trọng:

```ts
useQuery()
useMutation()
invalidateQueries()
prefetchQuery()
```

### Không dùng Zustand cho dữ liệu từ API

Không nên:

```text
GET /campaigns
      ↓
put toàn bộ response vào Zustand
```

Nên:

```text
API Data
   ↓
TanStack Query
```

---

## 2.2 Zustand

**Priority:** ★★★★☆

Dùng cho **client state**:

```text
selected milestone
modal state
campaign creation wizard
filters
temporary UI preferences
draft state
```

Ví dụ:

```ts
interface CampaignDraftStore {
  currentStep: number
  selectedMilestone: string | null

  setStep(step: number): void
}
```

Không dùng Zustand làm database/cache API chính.

---

## 2.3 Zod

**Priority:** ★★★★★

Dùng cho:

```text
form validation
API response validation
environment validation
URL/query params
evidence metadata
campaign input
```

Ví dụ:

```ts
const milestoneSchema = z.object({
  title: z.string().min(3),
  budget: z.string(),
  deadline: z.string(),
  description: z.string(),
})
```

Zod đặc biệt hữu ích vì FundTogether xử lý nhiều dữ liệu không thể trust trực tiếp.

---

## 2.4 React Hook Form

**Priority:** ★★★★★

Kết hợp với:

```text
React Hook Form
      +
Zod
```

Phù hợp cho campaign wizard:

```text
Step 1 — General Information
Step 2 — Beneficiary
Step 3 — Milestones
Step 4 — Evidence Policy
Step 5 — Bond
Step 6 — Review
```

Không nên quản lý form lớn bằng hàng chục `useState()`.

---

## 2.5 Axios

**Priority:** ★★★★★

Dùng cho HTTP transport giữa FE và BE.

Hữu ích cho:

```text
Axios instance
interceptors
JWT / session handling
timeout
multipart upload
request cancellation
error normalization
```

Recommended structure:

```text
src/lib/http/
├── client.ts
├── interceptors.ts
└── errors.ts
```

---

## 2.6 Orval

**Priority:** ★★★★☆

Rất hữu ích khi FE và BE tách riêng.

Flow:

```text
NestJS DTO
    ↓
OpenAPI
    ↓
Orval
    ↓
Generated TypeScript Client
    ↓
Frontend
```

Giúp tránh:

```text
Backend CampaignResponse
≠
Frontend CampaignResponse
```

Có thể generate:

```text
API client
TypeScript types
TanStack Query hooks
```

---

## 2.7 date-fns

**Priority:** ★★★☆☆

Dùng cho:

```text
campaign deadline
milestone deadline
challenge countdown
review window
format date
```

---

## 2.8 sonner

**Priority:** ★★★☆☆

Dùng cho UX:

```text
Transaction submitted
Transaction confirmed
Milestone activated
Evidence uploaded
Challenge submitted
Refund completed
```

---

# 3. Backend Stack

## Recommended Stack

```text
NestJS
│
├── Zod
├── Drizzle
├── PostgreSQL
│
├── jose
├── argon2
├── siwe
│
├── Pino
├── BullMQ
├── Redis
│
├── AWS S3 SDK
├── file-type
│
├── Viem
└── Ponder
```

---

## 3.1 NestJS

FundTogether có nhiều domain riêng:

```text
Auth
Users
Organizations
Campaigns
Milestones
Evidence
Files
Challenges
Verifier
Reputation
Blockchain Indexer
Notifications
```

NestJS phù hợp vì module architecture rõ ràng và dễ mở rộng.

Suggested modules:

```text
src/
├── auth/
├── users/
├── organizations/
├── campaigns/
├── milestones/
├── evidence/
├── challenges/
├── reputation/
├── blockchain/
├── files/
└── notifications/
```

---

## 3.2 PostgreSQL

**Priority:** ★★★★★

Dùng cho application/query data.

Suggested tables:

```text
users
wallets
organizations
campaigns
milestones
donations
evidence
expenses
challenges
verifiers
badges
blockchain_transactions
event_sync_state
```

Cần học chắc:

```text
primary key
foreign key
unique constraint
transaction
index
JOIN
ACID
locking basics
```

---

## 3.3 Drizzle

**Priority:** ★★★★★

Recommended ORM cho project.

Ưu điểm:

```text
TypeScript-first
gần SQL
ít magic
type-safe
dễ hiểu query thực tế
```

Nếu team đã rất quen Prisma thì vẫn có thể dùng Prisma.

**Chọn một. Không dùng cả hai.**

---

## 3.4 Zod on Backend

Có thể dùng Zod cho:

```text
DTO validation
environment variables
API payload
service input
blockchain event decoding checks
```

FE và BE không nên import schema trực tiếp từ nhau nếu đã tách project.

Interface chính nên là:

```text
OpenAPI
```

---

## 3.5 jose

**Priority:** ★★★★☆

Dùng cho:

```text
JWT signing
JWT verification
session token crypto
```

Không tự implement JWT crypto.

---

## 3.6 argon2

**Priority:** ★★★★☆

Dùng nếu có:

```text
email/password authentication
```

Cho password hashing.

---

## 3.7 SIWE — Sign-In With Ethereum

**Priority:** ★★★★☆

Dùng để chứng minh user thực sự sở hữu wallet.

Flow:

```text
Frontend
   ↓
GET nonce
   ↓
Wallet signs SIWE message
   ↓
Backend verifies signature
   ↓
Create session/JWT
```

Không bao giờ chỉ nhận:

```json
{
  "wallet": "0x123..."
}
```

rồi coi caller là chủ wallet.

---

## 3.8 Pino / nestjs-pino

**Priority:** ★★★★☆

Structured logging.

Ví dụ log:

```json
{
  "campaignId": "...",
  "milestoneId": "...",
  "txHash": "...",
  "event": "milestone_synced"
}
```

Cực kỳ hữu ích khi debug Web2 ↔ Blockchain synchronization.

---

## 3.9 BullMQ + Redis

**Priority:** ★★★☆☆

Dùng khi bắt đầu có background jobs:

```text
blockchain event processing
notification
email
retry failed RPC
evidence processing
report generation
file scan
```

Pattern:

```text
Blockchain Event
      ↓
Queue
      ↓
Worker
      ↓
PostgreSQL
```

---

## 3.10 AWS S3 SDK

Useful packages:

```text
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
```

Có thể dùng với:

```text
AWS S3
Cloudflare R2
MinIO
Backblaze
```

Recommended upload flow:

```text
FE
 ↓ request presigned URL
BE
 ↓
Object Storage
 ↑
FE uploads directly
```

Không nên ép mọi file lớn đi xuyên qua NestJS server.

---

## 3.11 file-type

Dùng để kiểm tra actual file type.

Không trust hoàn toàn:

```text
filename.pdf
Content-Type: application/pdf
```

do client gửi lên.

---

# 4. Blockchain / Web3 Stack

## Recommended Web3 Stack

### Frontend

```text
Wagmi
Viem
RainbowKit
```

### Backend

```text
Viem
SIWE
Ponder
```

### Smart Contracts

```text
Solidity
Foundry
forge-std
OpenZeppelin Contracts
```

---

# 4.1 Viem

**Priority:** ★★★★★

Đây là Ethereum TypeScript client nên học đầu tiên.

Mental model:

```text
React
 ↓
Wagmi
 ↓
Viem
 ↓
JSON-RPC
 ↓
Ethereum
```

Cần học:

```text
createPublicClient
createWalletClient

readContract
writeContract
simulateContract

parseUnits
formatUnits

getLogs
decodeEventLog

verifyMessage
keccak256
```

Backend cũng dùng Viem.

Như vậy:

```text
FE → Wagmi + Viem
BE → Viem
```

Không cần học thêm Ethers.js.

---

# 4.2 Wagmi

**Priority:** ★★★★★

React Web3 integration.

Dùng cho:

```text
connect wallet
read smart contract
write transaction
wait receipt
sign message
watch event
network switching
```

Important hooks:

```text
useAccount
useReadContract
useWriteContract
useSimulateContract
useWaitForTransactionReceipt
useSignMessage
useWatchContractEvent
```

### Nên học Viem trước Wagmi

Không nên chỉ biết:

```ts
useWriteContract()
```

mà không hiểu:

```text
ABI encoding
wallet request
transaction signing
broadcast
pending
receipt
revert
event
```

---

# 4.3 RainbowKit

**Priority:** ★★★★☆

Dùng cho:

```text
Connect Wallet
MetaMask
WalletConnect
account switching
network switching
wallet modal
```

Chọn **RainbowKit hoặc Reown AppKit**.

Không cần dùng cả hai.

---

# 4.4 Ponder

**Priority:** ★★★☆☆ → ★★★★★ khi project lớn hơn

Blockchain event indexer.

Contract emit:

```text
CampaignCreated
DonationReceived
MilestoneActivated
EvidenceSubmitted
ChallengeOpened
MilestoneVerified
RefundClaimed
BondReturned
```

Ponder xử lý:

```text
Blockchain
    ↓
Event Indexer
    ↓
Normalized Data
    ↓
Query / Backend
```

Lợi ích:

```text
less custom getLogs code
checkpoint
reorg handling
event normalization
historical sync
```

Có thể tự viết Viem indexer ở bản đầu, sau đó chuyển sang Ponder.

---

# 5. Smart Contract Tooling

## Core Stack

```text
Solidity
Foundry
forge-std
OpenZeppelin Contracts
Slither
Echidna (later)
```

---

# 5.1 OpenZeppelin Contracts

**Priority:** ★★★★★

Không nên tự implement security primitive nếu OpenZeppelin đã có bản battle-tested.

### SafeERC20

FundTogether nên dùng ERC-20 stablecoin / MockUSDC.

Dùng:

```solidity
using SafeERC20 for IERC20;
```

Phù hợp cho:

```text
donation
refund
bond
milestone fund release
```

---

### ReentrancyGuard

Dùng cho:

```text
refund
bond withdrawal
fund release
```

---

### Pausable

Emergency stop khi phát hiện lỗi nghiêm trọng.

Admin chỉ nên có thể:

```text
pause
```

không nên có quyền:

```text
withdraw arbitrary user funds
```

---

### AccessControl

Có thể định nghĩa:

```text
VERIFIER_ROLE
RESOLVER_ROLE
ADMIN_ROLE
```

Principle:

```text
Least Privilege
```

Không tạo `ADMIN_ROLE` có toàn quyền nếu không cần.

---

### ECDSA

Hữu ích nếu verifier ký attestation off-chain.

```text
Evidence
    ↓
Verifier Signature
    ↓
Smart Contract verifies ECDSA
```

---

### MerkleProof

**Optional / future**

Nếu evidence records quá nhiều:

```text
1000 evidence hashes
       ↓
Merkle Tree
       ↓
1 Merkle Root on-chain
```

Không cần ở v0.2 đầu tiên.

---

# 5.2 Foundry

**Priority:** ★★★★★

Toolchain chính:

```text
forge build
forge test
forge script
cast
anvil
```

Cần học:

```text
unit testing
fuzz testing
invariant testing
gas report
deployment scripts
```

---

## Fuzz Testing

Ví dụ:

```text
random donation amounts
random milestone budgets
random challenge timings
```

để test edge cases.

---

## Invariant Testing

Đặc biệt quan trọng cho FundTogether.

Ví dụ invariants:

```text
Released_i <= Budget_i

Refunded_i <= RefundEntitlement_i

LockedBond >= RequiredBond

Total accounting remains consistent
```

Ví dụ:

```solidity
function invariant_noOverRelease() public {
    assertLe(
        campaign.totalReleased(),
        campaign.totalRaised()
    );
}
```

Foundry có thể thử nhiều chuỗi call:

```text
fund()
activateMilestone()
submitEvidence()
challenge()
resolve()
refund()
...
```

để tìm state sequence phá invariant.

---

# 5.3 forge-std

Dùng cho:

```text
Test
Vm cheatcodes
console
StdInvariant
```

Đặc biệt:

```text
StdInvariant
```

cho invariant tests.

---

# 5.4 Slither

**Priority:** ★★★★☆

Static analyzer.

Hữu ích để phát hiện:

```text
reentrancy patterns
dangerous calls
unused returns
shadowing
access-control smells
bad Solidity patterns
```

Không thay thế manual security review.

---

# 5.5 Echidna

**Priority:** ★★☆☆☆ ban đầu

Property-based smart contract fuzzing.

Dùng sau khi đã chắc:

```text
Foundry unit tests
Foundry fuzz tests
Foundry invariant tests
```

Có thể dùng cho research/security phase.

---

# 6. Evidence & Storage

FundTogether có 2 loại evidence.

## Public Evidence

Ví dụ:

```text
construction photo
public report
campaign update
public milestone document
```

Có thể dùng:

```text
IPFS
Pinata SDK
```

---

## Private Evidence

Ví dụ:

```text
bank statement
beneficiary identity
sensitive invoice
medical data
private vendor document
```

Không nên đưa public lên blockchain/IPFS.

Dùng:

```text
S3-compatible private storage
encryption
controlled access
```

---

## Evidence Hash Architecture

```text
Document
   ↓
SHA-256 / keccak256
   ↓
Hash
   ↓
Blockchain
```

Blockchain lưu:

```text
hash
timestamp
milestoneId
issuer / verifier
status
```

Không lưu raw sensitive data.

---

# 7. Repository Structure

Recommended:

```text
fundtogether-frontend/
fundtogether-backend/
fundtogether-contracts/
```

---

## Frontend

```text
fundtogether-frontend/
├── src/
│   ├── features/
│   │   ├── campaigns/
│   │   ├── milestones/
│   │   ├── evidence/
│   │   ├── challenges/
│   │   └── reputation/
│   │
│   ├── lib/
│   │   ├── http/
│   │   ├── web3/
│   │   └── validation/
│   │
│   ├── stores/
│   ├── hooks/
│   └── generated/
│
└── package.json
```

---

## Backend

```text
fundtogether-backend/
├── src/
│   ├── auth/
│   ├── users/
│   ├── organizations/
│   ├── campaigns/
│   ├── milestones/
│   ├── evidence/
│   ├── challenges/
│   ├── reputation/
│   ├── blockchain/
│   ├── files/
│   └── notifications/
│
└── package.json
```

---

## Contracts

```text
fundtogether-contracts/
├── src/
│   ├── CampaignFactory.sol
│   ├── CampaignEscrow.sol
│   ├── MilestoneManager.sol
│   ├── BondManager.sol
│   ├── EvidenceRegistry.sol
│   └── ChallengeManager.sol
│
├── test/
├── script/
├── lib/
└── foundry.toml
```

---

# 8. Integration Contracts

FundTogether có 2 interface contracts lớn.

## FE ↔ BE

```text
NestJS
   ↓
OpenAPI
   ↓
Orval
   ↓
Frontend Client
```

**Source of truth:** OpenAPI

---

## FE / BE ↔ Blockchain

```text
Solidity
   ↓
ABI
   ↓
Versioned Artifact
   ↓
FE + BE
```

Có thể tạo shared package:

```text
@fundtogether/contracts
```

chứa:

```text
ABI
contract addresses
chain IDs
deployment metadata
```

Không copy-paste ABI bằng tay.

---

# 9. Learning Priorities

## Frontend

| Skill / Library | Priority |
|---|---:|
| TypeScript | ★★★★★ |
| TanStack Query | ★★★★★ |
| Zod | ★★★★★ |
| React Hook Form | ★★★★★ |
| Axios | ★★★★★ |
| Zustand | ★★★★☆ |
| Wagmi | ★★★★★ |
| Viem | ★★★★★ |
| RainbowKit | ★★★★☆ |
| Orval | ★★★★☆ |
| date-fns | ★★★☆☆ |
| sonner | ★★★☆☆ |

---

## Backend

| Skill / Library | Priority |
|---|---:|
| NestJS | ★★★★★ |
| PostgreSQL | ★★★★★ |
| Drizzle | ★★★★★ |
| Zod | ★★★★★ |
| Viem | ★★★★★ |
| Pino | ★★★★☆ |
| SIWE | ★★★★☆ |
| jose | ★★★★☆ |
| argon2 | ★★★★☆ |
| S3 SDK | ★★★★☆ |
| BullMQ | ★★★☆☆ |
| Redis | ★★★☆☆ |
| Ponder | ★★★☆☆ → ★★★★★ |

---

## Smart Contracts

| Skill / Tool | Priority |
|---|---:|
| Solidity | ★★★★★ |
| EVM transaction model | ★★★★★ |
| State machine design | ★★★★★ |
| Accounting invariants | ★★★★★ |
| Foundry | ★★★★★ |
| forge-std | ★★★★★ |
| OpenZeppelin | ★★★★★ |
| SafeERC20 | ★★★★★ |
| AccessControl | ★★★★★ |
| ReentrancyGuard | ★★★★★ |
| Slither | ★★★★☆ |
| Echidna | ★★☆☆☆ |
| MerkleProof | ★★☆☆☆ |

---

# 10. Suggested Learning Order

## Phase 1 — Web2 Foundation

```text
Zod
 ↓
TanStack Query
 ↓
Zustand
 ↓
React Hook Form
 ↓
Axios
```

Backend:

```text
NestJS
 ↓
PostgreSQL
 ↓
Drizzle
 ↓
Pino
```

---

## Phase 2 — Blockchain Foundation

Học theo thứ tự:

```text
Solidity fundamentals
        ↓
EVM transaction model
        ↓
Smart contract state machine
        ↓
ERC-20 / SafeERC20
        ↓
Access control
        ↓
Foundry tests
        ↓
Fuzz testing
        ↓
Invariant testing
        ↓
Security patterns
```

---

## Phase 3 — Web3 Integration

```text
Viem
 ↓
Wagmi
 ↓
RainbowKit
 ↓
SIWE
 ↓
Blockchain events
 ↓
Indexer
 ↓
Ponder
```

---

## Phase 4 — FundTogether Integration

```text
Campaign creation
        ↓
Donation escrow
        ↓
Bond lock
        ↓
Milestone activation
        ↓
Evidence upload
        ↓
Evidence hash
        ↓
Challenge window
        ↓
Settlement
        ↓
Refund
        ↓
Reputation
```

---

# 11. What NOT to Overlearn

Trong 5–6 tháng, không nên dành quá nhiều thời gian vào:

```text
Kubernetes
Kafka
Microservices
GraphQL Federation
CQRS toàn hệ thống
Event Sourcing toàn hệ thống

Cross-chain
MEV
ZK Proofs
Custom tokenomics
NFT marketplace
DAO framework
AMM mathematics
Layer 2 internals
Upgradeable proxy architecture
```

Trừ khi research scope sau này thực sự cần.

---

# 12. Final Recommended Stack

## Frontend

```text
React + TypeScript

TanStack Query
Zustand
Zod
React Hook Form
Axios
Orval

Wagmi
Viem
RainbowKit

date-fns
sonner
```

---

## Backend

```text
NestJS

PostgreSQL
Drizzle

Zod

jose
argon2
SIWE

Pino

BullMQ
Redis

AWS S3 SDK
file-type

Viem
Ponder
```

---

## Smart Contracts

```text
Solidity

Foundry
forge-std

OpenZeppelin Contracts
├── SafeERC20
├── ReentrancyGuard
├── Pausable
├── AccessControl
├── ECDSA
└── MerkleProof (future)

Slither
Echidna (later)
```

---

## Evidence

```text
Private evidence:
S3-compatible object storage

Public evidence:
IPFS / Pinata

Integrity:
SHA-256 / keccak256

On-chain:
Hash + timestamp + status
```

---

# Core Skills to Focus On

Nếu chỉ chọn các kỹ năng quan trọng nhất cho FundTogether:

```text
1. Solidity state-machine design
2. Smart contract security
3. Accounting invariants
4. Foundry fuzz + invariant testing
5. PostgreSQL / backend architecture
6. Web2 ↔ Blockchain synchronization
7. Viem / Wagmi
8. Evidence architecture
```

Tỷ lệ effort gợi ý:

```text
Solidity + Protocol Design       25%
Security + Contract Testing      25%

Backend + Database               20%
Web3 Integration                 15%

Frontend UI                      10%
DevOps                            5%
```

> **FundTogether không nên được tối ưu thành một website đẹp trước.**
>
> Giá trị chính của project nằm ở:
>
> `Protocol Correctness → Security → Evidence Architecture → Hybrid Web2/Web3 Integration → Experimental Evaluation`

---

## Final Mental Model

```text
                         FundTogether
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
           FE                BE            Blockchain
            │                 │                 │
     User Experience     Off-chain Data    Financial Truth
     Wallet UX           Evidence          Escrow
     API State           Search            Bond
     Forms               Auth              Milestones
     Transactions        Files             Refund
                         Indexing           Critical State
```

Blockchain không thay thế backend.

Backend không thay thế blockchain.

Frontend không nên chứa business/security logic quan trọng.

Mỗi layer phải có trách nhiệm riêng và đồng bộ với nhau thông qua:

```text
FE ↔ BE          → OpenAPI
FE/BE ↔ Chain    → ABI + Events
```

Đây là kiến trúc phù hợp để FundTogether v0.2 có thể phát triển từ research prototype thành một hệ thống lớn hơn sau này.

---

# MVP Integration Baseline

Để tránh hiểu nhầm giữa thư viện đã cài và công nghệ đã được team phê duyệt, baseline tích hợp hiện tại được ghi như sau:

```text
Network development : Anvil local
Network validation  : Sepolia sau khi prototype ổn định
Financial asset     : ERC20 MockUSDC
Wallet integration  : Wagmi + Viem + RainbowKit
Backend chain read  : Viem
Event sync          : Indexer riêng; Ponder hoặc Viem indexer sau khi event model ổn định
API contract        : OpenAPI → Orval
Database            : PostgreSQL + Drizzle migrations
Evidence            : PostgreSQL metadata + public object storage/IPFS
```

Trong MVP, blockchain giữ financial truth và backend giữ metadata/projection. `submitted`, `receipt confirmed` và `indexed` là các trạng thái khác nhau; frontend không được gộp chúng thành một trạng thái thành công duy nhất.

EIP-712 verifier signatures, Safe/multisig resolver, private evidence encryption, ReputationRegistry on-chain và cross-chain được ghi nhận là hướng phát triển sau MVP, chưa phải dependency của setup FE/BE hiện tại.
