# FundTogether research direction

> **Status:** Current source of truth for product direction. Reset decided
> 2026-10-20.

FundTogether is a deliberately narrow reward-crowdfunding protocol for
independent digital comics and artbooks. The product keeps one standard
digital-download PDF tier, escrowed MockUSDC pledges, production evidence,
milestone payout, challenges and refunds.

The architecture is now intentionally **purely decentralized**. Any wallet may
create a campaign proposal. Review outcomes and financial transitions are
decided by permissionless stake-backed Judge courts and enforced by the
Campaign contract. There is no trusted Resolver, Backup Resolver, Admin or
backend operator with authority to approve, reject, release or refund funds.

## Protocol boundary

The reference review court contains three Judges. Each Judge has one vote:

    2 PASS + 1 FAIL → PASS
    2 FAIL + 1 PASS → FAIL
    no quorum        → explicit retry/timeout rule

A campaign may open more three-Judge courts as stake participation and value at
risk grow. Multi-court aggregation is a contract policy parameter and must not
be invented by the UI or backend.

Funding success does not pay the Creator. The Creator submits a frozen
milestone deliverable and evidence hash. A canonical PASS, followed by the
configured challenge condition, unlocks only that milestone's fixed payout.
Failed, timed-out or upheld-challenge paths follow correction or refund rules.

## Accepted risk model

The protocol accepts Sybil wallets, stake concentration, collusion, bribery,
inactive Judges, incorrect majority outcomes and evidence that is unchanged but
factually false. These are protocol assumptions to expose and evaluate, not
reasons to restore a centralized reviewer.

Stake and hashes do not prove real-world truth. They provide economic
participation and integrity of the reviewed bytes. The protocol claims
transparent custody, deterministic state transitions and auditable decisions.

## Source-of-truth boundary

Blockchain holds campaign terms required for trust, escrow, Judge stake,
assignments, votes, quorum, milestone state, payout, challenge and refund
transitions. PostgreSQL stores metadata, review reasoning and indexed
projections. MinIO stores private evidence and final PDF bytes. A transaction
is not complete merely because a wallet submitted it; the canonical receipt and
idempotent indexer projection are required.

## Product boundary

- category: COMICS_ARTBOOK only;
- one STANDARD tier and one DIGITAL_DOWNLOAD PDF;
- local MockUSDC and chain 31339 during the pilot;
- no physical fulfilment, shipping, inventory, NFT, marketplace or charity
  workflow.

The complete target scope is in
[SCOPE_V2_DECENTRALIZED.md](campaigns/SCOPE_V2_DECENTRALIZED.md), the target
workflow is in
[WORKFLOWS_V2_DECENTRALIZED.md](campaigns/WORKFLOWS_V2_DECENTRALIZED.md),
the financial direction is in
[FINANCIAL_POLICY_V2_DECENTRALIZED.md](campaigns/FINANCIAL_POLICY_V2_DECENTRALIZED.md),
and the detailed protocol reference is
[FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md](protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md).

The detailed specification is the reference for court formation, dynamic stake,
commit–reveal, appeal separation, correction, slashing, solvency and invariants.
Its local Anvil numeric values are frozen in the versioned
`fundtogether-vnext-local-v1` registry for reproducible research; they are not
approved public-chain or real-money policy.

## Authentication direction

Account login remains wallet-only: SIWE proves control of a wallet and the
backend creates or resolves a server session for that wallet. Authentication
does not make one wallet equal one human and does not grant protocol authority.
Email/password login remains outside the active surface.

## Implementation status

The current repository and local runtime still contain the pre-reset Resolver
implementation alongside VNext contracts, indexed/API projections and
Creator/Backer/Judge wallet surfaces. VNext covers publication/funding,
stake-backed multi-court review, milestone evidence, appeal/retry, payout and
refund; local policy keeps challenge entrypoints disabled. Foundry and focused
backend/frontend tests are evidence for those slices only. They are not proof
that the pure decentralized protocol is deployed or freshly accepted end to
end.

Creator profile/Studio verification is optional metadata. Any remaining
Resolver behavior is implementation residue and historical evidence, not target
authority. Remaining appeal/retry edge journeys, production settlement sizing,
evidence availability guarantees, a consolidated VNext launcher and fresh local
runtime acceptance remain roadmap work.

The implementation order is threat model and policy, state machine and
accounting, contract and invariants, indexer, evidence pipeline, vertical
journeys, then disposable local end-to-end verification.
