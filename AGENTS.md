# FundTogether — Project Instructions

## Mandatory first read

Before reasoning about FundTogether, read docs/research-direction.md and
docs/PROJECT_OVERVIEW.md and
docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md. They define the current
pure-decentralized target; older Resolver policies and plans are historical
unless explicitly marked current.

## Product direction

- FundTogether is permissionless reward crowdfunding for independent digital
  comics and artbooks.
- Any wallet may create a campaign proposal.
- Backers pledge MockUSDC into contract escrow.
- Permissionless stake-backed Judge courts review publication, milestones,
  completion and challenges.
- A reference court has three Judges and resolves by two-of-three majority.
- Funding success does not release money. Creator milestone evidence must pass a
  Judge case and its challenge condition before exact milestone payout.
- No Primary Resolver, Backup Resolver, Admin or backend operator is a
  financial or review authority in the target protocol.
- Accepted risks include Sybil wallets, collusion, bribery, inactive Judges and
  incorrect majority outcomes.
- The detailed protocol separates base and appeal pools, uses commit–reveal,
  distinguishes substantive verdict failure from protocol failure, and requires
  accounting invariants before contract implementation.

The product remains one COMICS_ARTBOOK campaign model, one STANDARD tier and one
DIGITAL_DOWNLOAD PDF. Physical fulfilment, shipping, inventory, NFT,
marketplace, charity and real-money/public-chain launch are out of scope.

## Architecture

    React frontend ↔ NestJS API ↔ PostgreSQL / MinIO
          │                  │
          └────────────── Campaign contract / RPC
                                  │
                         idempotent event indexer

- Frontend owns UX, forms, wallet interaction and explicit transaction states.
- Backend owns SIWE, validation, private storage and read APIs. It must not
  choose a Judge outcome or create financial truth from PostgreSQL.
- Smart contracts own escrow, stake, court assignment, votes, quorum,
  milestones, challenges, payouts and refunds.
- PostgreSQL stores metadata and indexed projections.
- MinIO stores private evidence and final PDF bytes.
- The indexer consumes canonical events idempotently.

## Workflow rules

- Distinguish on-chain state, off-chain metadata, indexed projection and file
  storage.
- A submitted transaction is not a successful financial action. Track wallet
  request, submitted, mined, canonical receipt and indexed projection.
- Use integer-safe token amounts and bigint; never use floating point for money.
- Store evidence bytes off-chain and commit hashes when integrity matters.
- Never trust a client-supplied wallet address for authentication; use SIWE.
- A campaign can move funds only through explicit contract state transitions.
- Test unauthorized calls, invalid transitions, duplicate actions, timeouts,
  no-quorum paths, conservation and failed token transfers.

## Current status

The repository contains implemented VNext contract, indexer/API and
Creator/Backer/Judge UI slices, but the default one-command local launcher is
still the historical Campaign/Resolver runtime. Existing Resolver-based tests
and docs are historical evidence and must not be presented as target behavior.
Do not infer public-chain readiness or full runtime acceptance from focused
tests; follow the versioned protocol and implementation ledger.
