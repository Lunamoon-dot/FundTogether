# Randomized Judge Review and Permissionless Creator Publishing

> **Status:** Proposed migration design; implementation has not started.
> **Date:** 2026-10-20
> **Scope:** FundTogether's first transition away from fixed Resolver authority.

## 1. Decision

FundTogether will remove Studio verification as a prerequisite for a Creator to
publish a funding proposal. Wallet ownership, authenticated account ownership,
campaign-term validation and canonical transaction reconciliation remain
required. Admin verification is not a funding gate.

Fixed Primary/Backup Resolver authority will be replaced incrementally by
case-based Judge committees. A Judge is selected for a specific review case,
not granted permanent authority over every campaign.

The first executable transition is a publication-review case:

```text
Creator submits frozen terms
        ↓
Contract creates a publication JudgeCase
        ↓
Three eligible Judges are selected and recorded
        ↓
Judges vote once: APPROVE or REJECT
        ↓
Two-of-three quorum resolves the case
        ↓
APPROVE permits the campaign to enter FUNDING
```

This first phase is a randomized committee mechanism, not full Proof of Stake.
Stake weighting, slashing, reviewer rewards and permissionless reviewer entry
remain later business-policy decisions.

## 2. Goals

- Remove the centralized Studio verification gate for funding publication.
- Remove fixed Resolver approval from the first publication path.
- Make Judge assignment and votes auditable from canonical on-chain events.
- Prevent one Judge from deciding a case alone.
- Preserve the existing wallet transaction lifecycle and escrow accounting while
  authority migration is staged.
- Keep the migration reversible at the source level until the new case path is
  verified.

## 3. Non-goals for the first phase

- No Kleros-style protocol, token economy, or reviewer marketplace.
- No stake weighting, slashing, reviewer yield or reward distribution.
- No claim that the committee proves the truth of off-chain evidence.
- No redesign of payout, refund, surplus or escrow accounting.
- No simultaneous migration of every historical Resolver action.
- No physical fulfilment, shipping, real-world asset or legacy organization
  workflow.

## 4. Authority and data boundaries

| Concern | Phase-1 authority |
| --- | --- |
| Wallet/account identity | SIWE and linked wallet checks |
| Campaign terms | Creator submits; server validates; commitment is canonical |
| Studio profile | Optional metadata only; never a funding gate |
| Judge eligibility | On-chain eligible reviewer registry for the local experiment |
| Judge selection | Contract records the selected Judge addresses for the case |
| Judge outcome | Contract counts one vote per assigned Judge |
| Funding visibility | Canonical approved publication case plus canonical campaign binding |
| Escrow and refunds | Existing Campaign contract rules until separately migrated |
| File/evidence storage | Existing private storage boundary; no claim of on-chain truth |

The backend may prepare a case and display its status, but it must not choose a
Judge outcome or grant funding access from a database row alone. The indexer
projects `JudgeCaseCreated`, `JudgeSelected`, `JudgeVoted` and
`JudgeCaseResolved` using an idempotent event identity.

## 5. JudgeCase model

Each case records at least:

- `caseId`;
- campaign identity and commitment hash;
- case kind (`PUBLICATION` in phase one);
- selected Judge addresses in a fixed-size committee;
- vote deadline and resolution status;
- each Judge's single vote;
- the resolved outcome and decision hash.

The contract must reject:

- a committee with fewer than three eligible Judges;
- duplicate Judge addresses in one committee;
- a non-assigned voter;
- a second vote from the same Judge;
- a vote after resolution or expiry;
- a Creator acting as a Judge for its own case;
- a database-only approval without the expected canonical case events.

The local prototype may use an on-chain deterministic selection seed recorded at
case creation. This is sufficient to test assignment and accounting locally,
but it must not be described as manipulation-resistant production randomness.
A stronger randomness source is a later decision boundary.

## 6. Outcome policy

The first policy is deliberately narrow:

- `2/3 APPROVE` resolves the publication case as approved;
- `2/3 REJECT` resolves it as rejected;
- no quorum reaches a timeout state and does not open funding;
- a rejected or timed-out case does not move escrow to the Creator;
- Creator correction/resubmission uses a new case and a new commitment revision.

The exact timeout recovery and any future reward/slashing destination require a
separate financial-policy decision. No payout is inferred from a submitted vote
or a pending case.

## 7. Incremental migration

### Phase 1 — publication gate

- Remove Studio verification from the creator publication preflight.
- Add the publication JudgeCase and three-Judge quorum.
- Replace the fixed Resolver `approveCampaign` gate for this path.
- Keep un-migrated production, release, disbursement, completion and dispute
  actions explicitly marked as transitional until each receives its own case
  type.

### Phase 2 — evidence cases

- Migrate production and final digital-asset review to Judge cases.
- Preserve the existing hash/commitment and receipt/indexer boundaries.

### Phase 3 — financial decision cases

- Migrate disbursement, completion and dispute decisions only after their
  conservation and failure policies are specified and tested.
- Remove the remaining fixed Resolver addresses from the active financial
  contract only when no active transition depends on them.

### Phase 4 — PoS incentives

- Add reviewer stake, eligibility weighting, reward, slash and conflict policy
  only as a separately approved business model.

## 8. Migration risks

- Removing Studio verification without a JudgeCase would make publication
  permissionless but unreviewed; the two changes must ship as one publication
  boundary.
- Keeping the old Resolver path during migration could accidentally let an old
  wallet bypass Judge cases; old calls must be disabled for migrated case kinds.
- Backend-selected Judges would recreate centralization even if the UI says
  "random"; assignment must be recorded and checked by the contract.
- A timeout that neither opens refund nor leaves a recoverable next action can
  strand funds; the publication phase must not move funds before resolution.

## 9. Verification requirements

- Contract tests cover unique three-Judge selection, one-vote-per-Judge,
  two-of-three resolution, rejection, timeout and Creator/Judge exclusion.
- Backend tests prove that Studio profile status is not required for publication
  and that actor identity comes from the authenticated wallet/session.
- Indexer tests replay Judge events and prove no duplicate case/vote projection.
- Frontend tests show Judge case status and never treat a submitted vote as a
  canonical result.
- Existing escrow/refund tests remain green during the publication migration.
