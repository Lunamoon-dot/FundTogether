# FundTogether — Project Overview

> **Status:** Current target architecture, decided 2026-10-20. The VNext
> contract/backend/frontend slices are partially implemented; the local
> runtime is still pre-migration.

FundTogether is a permissionless reward-crowdfunding protocol for independent
digital comics and artbooks. It uses one standard digital-download PDF tier,
MockUSDC escrow, milestone evidence, stake-backed Judge courts, payout and
refund.

## Decentralization boundary

The target architecture is pure decentralized review and settlement:

- any wallet may create a campaign proposal;
- Judge eligibility and stake are protocol rules;
- a three-Judge court resolves by two-of-three majority;
- publication, milestone, completion and challenge outcomes are canonical
  contract state;
- payout and refund are permissionless contract actions once conditions are met;
- Resolver, Admin, backend and database rows cannot override the protocol.

The protocol accepts Sybil, collusion, bribery, inactive-Judge and
incorrect-majority risk. Stake and evidence hashes do not prove off-chain truth;
they provide economic participation and content-integrity commitments.

## Authentication boundary

Account login remains wallet-only. The browser requests a one-time SIWE nonce,
the connected wallet signs it, and the backend verifies origin, domain, chain
and signature before resolving or creating the wallet-owned account. This
proves wallet control only. It does not prove one-human identity or grant
review authority.

## Target architecture

    React frontend
      → NestJS API
          → PostgreSQL metadata and indexed projections
          → MinIO private evidence and final PDF
          → FundTogether Campaign contract
              → canonical events
                  → idempotent indexer
                      → PostgreSQL read model

The contract owns campaign terms required for trust, escrow, Judge stake,
assignment, votes, quorum, milestone state, challenge, payout and refund.
PostgreSQL stores application metadata and derived projections. MinIO stores
private file bytes. A wallet submission is not completion until the canonical
receipt and indexer projection exist.

## Target campaign journey

    DRAFT
      → PUBLICATION_REVIEW_OPEN
      → three-Judge court
      → two-of-three PASS
      → FUNDING
      → Backer pledge
      → MILESTONE_ACTIVE
      → evidence submitted
      → three-Judge review
      → challenge window
      → exact milestone payout
      → next milestone or final settlement

FAIL, cancellation, timeout or upheld challenge follows the policy-defined
correction/refund path. Funding success alone never pays the Creator.

## Roles

| Role | Target authority |
| --- | --- |
| Creator | Proposal, frozen terms and milestone evidence |
| Backer | Pledge, challenge where eligible and own refund |
| Judge | Stake, assigned court seat and one vote |
| Permissionless caller | Eligible timeout, payout or refund transaction |
| Backend/indexer | Validation, storage, indexing and read projections |
| Admin/operator | Infrastructure and read-only operations |

## Product boundary

The active target remains COMICS_ARTBOOK, one STANDARD tier, one private
DIGITAL_DOWNLOAD PDF, MockUSDC and local chain 31339. Physical fulfilment,
shipping, inventory, NFTs, marketplace, charity and public-chain/real-money
launch are excluded.

See [VNext protocol specification V1](protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md),
[Pure decentralized architecture](architecture/PURE_DECENTRALIZED_PROTOCOL.md),
[target scope](campaigns/SCOPE_V2_DECENTRALIZED.md),
[target workflows](campaigns/WORKFLOWS_V2_DECENTRALIZED.md) and
[Financial Policy V2](campaigns/FINANCIAL_POLICY_V2_DECENTRALIZED.md).

## Implementation boundary

The repository contains both the pre-reset Resolver implementation and a
partially implemented VNext slice. VNext currently includes the contract core
for publication/funding, stake-backed multi-court review, milestone evidence,
appeal/retry, exact-budget payout and terminal refunds; it also has an
idempotent projection/indexer slice, authenticated evidence APIs and Creator,
Backer and guided Judge wallet surfaces. The UI covers campaign creation,
funding, refunds, evidence submission, court visibility and
settlement/disbursement. Challenge entrypoints remain disabled by the local
policy. Focused Foundry/backend/frontend evidence exists, but the current
repository has no consolidated VNext one-command launcher and this cleanup is
not a fresh Anvil/PostgreSQL/MinIO acceptance run.

Admin/profile verification is not a target funding gate. Any Resolver UI or
role still present in the checkout is a historical runtime boundary; it does
not represent authority in the target protocol. Public-chain readiness,
production settlement sizing, remaining appeal/retry edge journeys and fresh
runtime E2E remain separate work.
