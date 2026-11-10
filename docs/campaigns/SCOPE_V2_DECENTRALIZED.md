# FundTogether — Pure Decentralized Campaign Scope

> **Status:** Current target scope, decided 2026-10-20. VNext contract,
> projection/API and Creator/Backer/Judge UI slices are implemented; the full
> scope has no consolidated launcher or fresh local-runtime acceptance.
>
> **Protocol detail:** See [VNext Protocol Specification V1](../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md).

## Product

FundTogether is a permissionless reward-crowdfunding protocol for independent
digital comics and artbooks. Any wallet can create a campaign proposal and any
wallet can pledge to a campaign that has reached canonical FUNDING state.

The protocol uses stake-backed Judge courts to review publication, production
milestones, completion and challenges. The Campaign contract, not a Resolver,
Admin or backend operator, decides whether a review outcome can unlock a payout
or refund.

The protocol scope includes base review, appeal isolation, correction and
terminal protocol failure. A valid review is not merely a row in PostgreSQL:
the contract must bind the commitment/evidence revision, assignment, vote
round, final ruling and financial transition.

## Fixed pilot boundary

- category: COMICS_ARTBOOK;
- one STANDARD tier;
- one fixed-price DIGITAL_DOWNLOAD PDF;
- MockUSDC on local chain 31339 for the prototype;
- sequential milestones with frozen budgets;
- private evidence/PDF storage with on-chain content hashes;
- permissionless Judge participation subject to stake rules;
- dynamic minimum case stake based on the frozen milestone risk/budget policy;
- eligibility snapshot, random three-Judge assignment and commit–reveal voting;
- bounded retry, appeal and correction paths;
- canonical `FINAL_PASS`, `VERDICT_FAIL` and `PROTOCOL_FAIL` outcomes;
- no physical fulfilment, shipping, inventory, NFT, marketplace or charity flow.

## Core journey

    Any wallet creates campaign proposal
      → freezes terms and evidence commitment
      → opens a three-Judge publication court
      → two-of-three PASS
      → campaign enters FUNDING
      → Backers pledge into escrow
      → Creator submits milestone evidence
      → three-Judge milestone court reviews
      → provisional ruling
      → appeal window / final ruling
      → PASS + challenge window
      → exact milestone payout
      → repeat until final delivery or refund

Funding success is not a payout. The creator receives only the amount attached
to a milestone that has passed the protocol's review and challenge conditions.

## Roles

| Role | Current target behavior |
| --- | --- |
| Creator | Creates a proposal, freezes terms, submits evidence and requests protocol actions |
| Backer | Pledges, observes cases, challenges where eligible and claims their own refund |
| Judge | Stakes, is assigned to a case and casts one vote |
| Caller | May trigger an already-eligible timeout, payout or refund |
| Backend/indexer | Provides storage, projections and transaction reconciliation only |
| Admin/operator | Infrastructure/read-only operations only; no financial authority |

Contributing to a campaign makes a wallet a Backer. It does not automatically
make that wallet a Judge for the same campaign.

## Accepted risks

The target protocol explicitly accepts that:

- one human may control multiple wallets;
- stake concentration may influence who becomes a Judge;
- Judges may collude, abstain, be bribed or be wrong;
- a majority vote may not reflect real-world truth;
- evidence hashes cannot prove authorship or delivery;
- a court may fail to reach quorum;
- a permissionless caller may execute an eligible transition.

The design must expose these assumptions rather than claim trustless factual
verification.

## Remaining policy and acceptance gates

The decentralization decision is fixed and the local research registry contains
explicit values for the first executable slice. Production/public-chain values
and the remaining runtime acceptance gates are still not approved:

- production randomness and liveness/retry design;
- non-reveal penalty and reviewer service-fee funding;
- production batch/pull settlement limits for large Judge snapshots;
- evidence availability and inaccessible-evidence timeout;
- full indexer replay/reorg behavior and fresh local runtime acceptance;
- Creator, Backer and Judge wallet transaction journeys.

The local registry freezes the research values for enrollment, commit,
reveal, appeal and correction deadlines; review service fee funding; non-reveal
penalty; slash redistribution; surplus handling; evidence availability and the
terminal behavior of `PROTOCOL_FAIL`.

These are protocol parameters, not a reason to restore a trusted Resolver.

## Evidence boundary

Evidence and private PDF bytes remain off-chain in object storage. The protocol
commits their hashes and revision identities. A matching hash proves byte
integrity only; it does not prove authorship, quality, delivery or real-world
truth.
