# FundTogether — Project Instructions

## Mandatory first read — research direction

Before reasoning about FundTogether, proposing a change or finalizing a decision,
read `docs/research-direction.md` and `docs/PROJECT_OVERVIEW.md` first.
The current project direction was explicitly locked on 2026-10-08 and updated through 2026-10-13.

Align decisions with its research goals, narrow scope and evaluation criteria:
- Current product scope is **FundTogether**: a deliberately narrow **Reward Crowdfunding** pilot for independent digital comics and artbooks (`COMICS_ARTBOOK`).
- Core capabilities: Evidence-backed creator/IP review, one standard digital-download tier (PDF), escrowed pledges in MockUSDC, production-evidence review, private PDF release, disputes and refunds.
- **Out of scope:** Physical fulfilment, shipping/logistics, inventory tiers, and legacy charity/donation crowdfunding workflows. The repository does not retain active legacy charity workflow implementation.

## Project architecture

```text
React frontend (Vite/TS) ↔ NestJS API ↔ PostgreSQL (Drizzle) / MinIO (S3 storage)
          │                     │
          └─────────────────────┴────── Blockchain / Anvil (MockUSDC escrow)
                                           │
                         Idempotent indexer ┘
```

- **Frontend:** Owns user experience, forms, API state, wallet interaction (Wagmi + Viem + RainbowKit), and transaction status display. Uses hash-based routing.
- **Backend:** NestJS owning SIWE authentication, creator/IP declarations, drafts, evidence review, S3-compatible private storage, and blockchain-derived projections.
- **Smart contracts:** Foundry-managed contracts owning critical financial state: escrow pledges, deadlines, resolver approval, disputes, payouts, and refunds.
- **PostgreSQL:** Stores application metadata, draft configs, and indexed blockchain projections. Blockchain remains the source of truth for financial transitions.
- **MinIO:** S3-compatible object storage holding private final-PDF releases and sample evidence. Backers receive short-lived authenticated download tickets.

## Current technology stack

### Frontend
- React 19 + TypeScript + Vite
- TanStack Query for server state
- Wagmi + Viem for wallet and contract interaction
- RainbowKit for wallet connection modal
- Hash-based client routing (`window.location.hash`)
- Tailwind CSS

### Backend
- NestJS + TypeScript
- PostgreSQL + Drizzle ORM
- Zod schema validation
- SIWE (Sign-In with Ethereum) for wallet authentication
- MinIO (S3-compatible) for private PDF and evidence storage
- Idempotent event indexer synchronizing on-chain events to database

### Smart contracts & local runtime
- Foundry (Solidity contracts + tests + fuzzing)
- Local Anvil RPC node (chain `31339`)
- Local ports: PostgreSQL `5436`, MinIO `9202/9203`, API `3002`, Web `5175`, Anvil RPC `9548`

## Campaign core journeys

1. **Creator journey:**
   - Connect wallet & sign in via SIWE.
   - Complete Step 0: Creator profile & IP Declaration (author/studio pen name, bio, 100% IP ownership pledge).
   - Draft campaign: comic/artbook title, pitch, story, funding goal (MockUSDC), duration, and 1 standard PDF reward.
   - Submit sample evidence and production plan, then freeze draft for review.

2. **Resolver journey (Admin/Resolver):**
   - Inspect frozen draft, IP declaration, and sample evidence.
   - Approve or request correction/reject on-chain with documented reasoning.

3. **Backer journey:**
   - Browse approved campaigns in the Campaign feed.
   - Approve MockUSDC token and pledge into the escrow contract.
   - Indexer records canonical pledge and issues versioned entitlement.

4. **Production, Delivery & Settlement:**
   - Creator submits production progress evidence and final PDF hash.
   - Resolver verifies and accepts the final PDF release.
   - Backers access private PDF download with short-lived authenticated tickets.
   - If campaign succeeds and challenge window passes: Creator settles payout.
   - If campaign is cancelled or dispute upheld: Backers claim full escrow refund.

## Working rules

- Read nearby files, `docs/research-direction.md`, and `docs/PROJECT_OVERVIEW.md` before making changes.
- Never reintroduce legacy charity/organization crowdfunding or physical shipping logic into the Campaign product flow.
- Integer-safe token amounts and `bigint` only; never use floating point for financial calculations.
- Track transaction lifecycle explicitly: wallet request → submitted → canonical receipt → indexer projection.
- Validate inputs on the server even when the frontend validates them.
- Keep tests passing: Backend Jest suite, Frontend test runner (`npm test`), and Foundry tests.

## Current status

- **Scope:** Reward Crowdfunding only (FundTogether — Comics & Artbooks). Legacy physical delivery and charity workflows are retired/archived.
- **Backend:** NestJS application with domain modules under `src/modules`, controllers, services, indexers, storage, and migrations 0000–0005 fully verified (195/195 Jest tests pass).
- **Frontend:** Campaign feed, Creator Studio, Resolver console, Backer library, and Web3 integration verified (29/29 tests pass).
- **Contracts:** Foundry campaign escrow contracts, fuzzing, and deployment manifests verified.
- **Local runtime:** Fully automated launcher via `backend/scripts/campaigns/start-services.ps1`.
