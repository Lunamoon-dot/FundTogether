# FundTogether — Pure Decentralized Workflows

> **Status:** Current target workflow, decided 2026-10-20. Documentation only;
> current local Resolver flows are pre-reset historical behavior.
>
> **Detailed protocol:** [VNext Protocol Specification V1](../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)

## 1. Publication

    Creator wallet
      → creates and freezes commitment
      → enrollment snapshot
      → contract assigns three Judges
      → commit → reveal → court aggregate
      → provisional ruling
      → appeal window
      → FINAL_PASS → campaign becomes FUNDING
      → VERDICT_FAIL → correction/new commitment or terminal failure
      → PROTOCOL_FAIL → terminal failure/refund policy

The backend may prepare the case and serve the dossier, but it cannot approve a
publication from a database row. createCampaign must require the exact
canonical case result for the same creator and commitment.

The detailed V1 reference permits multiple three-Judge courts when eligible
participation supports them. The contract, not the UI, defines whether the
case uses one court or `floor(N/3)` courts and how court results aggregate.

## 2. Funding

    FUNDING
      → Backer approves MockUSDC
      → Backer pledges exact quantity
      → contract emits Pledged
      → indexer creates the entitlement projection

A submitted transaction is not a pledge until the receipt and canonical event
are verified. The escrow remains in the Campaign contract.

## 3. Milestone review and payout

    MILESTONE_ACTIVE
      → Creator uploads evidence to private storage
      → Creator anchors evidence hash
      → enrollment and eligibility snapshot
      → three-Judge court(s) commit/reveal
      → provisional ruling
      → appeal window with non-overlapping Judge pool
      → FINAL_PASS + challenge window
      → no upheld challenge → exact milestone payout
      → next milestone

The Judge decision is a protocol result, not a guarantee that the work is true,
good or legally valid. The UI must show submitted, mined, indexed and resolved
states separately.

`VERDICT_FAIL` may open a bounded correction revision without changing the
original acceptance criteria or payout amount. `PROTOCOL_FAIL` is not a factual
finding against the Creator and follows the frozen terminal policy.

## 4. Failure and refund

    VERDICT_FAIL after correction limit /
    PROTOCOL_FAIL / CANCELLATION / TIMEOUT / UPHELD CHALLENGE
      → REFUNDING
      → each eligible Backer claims their own canonical contribution

If a campaign has already paid earlier milestones, the remaining escrow is
refunded pro-rata from a fixed snapshot. A refund claim cannot exceed that
snapshot pool, and a successful claim cannot execute twice.

No caller may redirect another Backer's refund. A failed transfer reverts the
claim state so the claim can be retried, and a successful claim cannot execute
twice.

## 5. No trusted fallback

There is no Primary Resolver or Backup Resolver fallback. A missing quorum,
inactive Judge pool or unresolved challenge follows a deterministic protocol
timeout/retry rule. If that rule cannot safely determine payout, funds remain in
escrow or become refundable according to the frozen policy; an operator does not
decide manually.

## 6. Data flow

    Wallet transaction
      → Campaign contract
      → canonical event
      → idempotent indexer
      → PostgreSQL projection
      → API/UI

Evidence bytes and private PDFs stay in MinIO. Only the integrity commitment and
financial consequences belong on-chain.

## 7. Judge settlement

After final substantive ruling, the protocol settles each assigned position:

```text
case stake locked → assignment → commit → reveal
                 → final settlement → reward/slash → unlock
```

Coherence slash can apply only to valid revealed votes opposite a substantive
`FINAL_PASS` or `VERDICT_FAIL`. No minority slash is inferred from
`PROTOCOL_FAIL`; fees, no-show penalties and dust redistribution require an
explicit versioned policy.
