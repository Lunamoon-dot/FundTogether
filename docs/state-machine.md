# FundTogether State Machine — MVP

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-03
> **Related:** [Protocol specification](./protocol-spec.md), [Financial rules](./financial-rules.md)

## 1. State machine rules

Every transition has four parts:

```text
caller → guard → state change → event
```

The contract is the final authority for on-chain transitions. The backend and frontend may hide invalid actions for usability, but they cannot authorize an action the contract rejects.

## 2. Campaign lifecycle

```text
DRAFT
  ├─ cancelCampaign (organizer) → CANCELLED
  └─ approveCampaign (resolver) → APPROVED
       ├─ cancelCampaign (organizer) → CANCELLED
       └─ publishCampaign (organizer, bond locked) → FUNDING
            ├─ donate reaches goal → FUNDED
            ├─ finalizeFundingFailure at/after deadline → FUNDING_FAILED
            └─ cancelCampaign (organizer) → CANCELLED

FUNDED
  └─ activateMilestone → MILESTONE_ACTIVE

MILESTONE_ACTIVE
  └─ submitEvidence → IN_REVIEW

IN_REVIEW
  ├─ review expires without challenge → SETTLEABLE
  └─ openChallenge → CHALLENGED

SETTLEABLE
  └─ settleMilestone → MILESTONE_SETTLED

CHALLENGED
  └─ resolveChallenge → MILESTONE_SETTLED or CANCELLED

MILESTONE_SETTLED
  ├─ activate next milestone → MILESTONE_ACTIVE
  └─ last milestone settled → COMPLETED

Pre-funded FUNDING_FAILED or CANCELLED
  └─ same transaction: snapshot refund pool + return bond
       └─ each donor calls claimRefund independently
```

The contract currently implements the lifecycle through funding and pre-funded refunds. Milestone and post-funded challenge/cancellation states shown above remain planned. Refund availability is stored separately from campaign state; the campaign remains `CANCELLED` or `FUNDING_FAILED` while donors claim.

## 3. Campaign transitions

| From | Action | Caller | Guard | To | Event |
|---|---|---|---|---|---|
| DRAFT | approve | Resolver | Existing campaign | APPROVED | `CampaignApproved` |
| APPROVED | publish | Organizer | Bond locked; deadline still in future | FUNDING | `CampaignPublished` |
| FUNDING | donate reaches goal | Donor | Before deadline; amount does not exceed remaining goal | FUNDED | `DonationReceived`, `FundingFinalized` |
| FUNDING | finalize failure | Anyone | At/after deadline; goal not reached | FUNDING_FAILED | `FundingFinalized`, `RefundPoolSnapshotted`, `BondReturned` |
| DRAFT/APPROVED/FUNDING | cancel | Organizer | Campaign has not reached FUNDED; no deadline restriction | CANCELLED | `CampaignCancelled`, `RefundPoolSnapshotted`, `BondReturned` only if bond amount > 0 |
| FUNDED | activate | Organizer/allowed caller | Next sequential milestone; bond coverage valid | MILESTONE_ACTIVE | `MilestoneActivated` |
| MILESTONE_SETTLED | activate next | Organizer/allowed caller | Previous settlement confirmed | MILESTONE_ACTIVE | `MilestoneActivated` |
| MILESTONE_SETTLED | complete | Anyone | No remaining milestone | COMPLETED | completion event or final settlement |
| FUNDED/ACTIVE/REVIEW (planned) | cancel | Authorized path | Post-funded outcome rules still to be implemented | CANCELLED | `CampaignCancelled` |

Unpublished campaigns can be cancelled with or without a locked bond, including after the funding deadline. No token call is made when the recorded bond amount is zero. A cancelled draft cannot later be approved, published or bonded again. Its zero refund snapshot creates no donor entitlement because donations were never accepted.

## 4. Milestone transitions

```text
PENDING → ACTIVE → EVIDENCE_SUBMITTED → REVIEWING
                              │              ├─ settle → SETTLED
                              │              └─ challenge → CHALLENGED
                              └─ cancel → CANCELLED

CHALLENGED → RESOLVED_ACCEPTED → SETTLED
CHALLENGED → RESOLVED_MISCONDUCT → CANCELLED
```

Required guards:

- only one milestone can be active;
- milestone index must be sequential;
- evidence belongs to the active milestone;
- settlement cannot execute twice;
- a challenge cannot be opened after the review window;
- the resolver can choose only outcomes allowed by the protocol;
- a timeout caller cannot bypass the underlying state and time guards.

## 5. Evidence states

```text
NOT_SUBMITTED
→ UPLOADED
→ COMMITMENT_PENDING
→ COMMITTED
→ REVIEWING
→ ACCEPTED or CHALLENGED
```

`UPLOADED` is an off-chain storage result. `COMMITTED` means the hash/version was confirmed on-chain. Neither state alone means the real-world claim is true.

## 6. Challenge states

```text
ELIGIBLE
→ OPEN
→ UNDER_REVIEW
→ UPHELD
or
→ REJECTED
or
→ EXPIRED
```

MVP has no challenge stake and no automatic slash. An upheld challenge may lead to campaign cancellation and bond allocation only through the approved resolver outcome.

## 7. Refund states

```text
NOT_AVAILABLE
→ POOL_SNAPSHOTTED
→ CLAIMABLE
→ PARTIALLY_CLAIMED
→ CLAIMED
```

Each donor claim is independent and idempotent. A donor may not claim more than the entitlement calculated from the immutable pool snapshot.

For the implemented pre-funded path, the snapshot and claim availability are created together. Each donor moves directly from unclaimed to fully claimed; partial claims are not implemented. No contribution or an already-claimed refund reverts. If a bond transfer fails, the campaign stays `FUNDING` and no snapshot is created. If a refund transfer fails, the donor remains unclaimed and can retry.

## 8. Timeout semantics

Timeouts must be permissionless. The contract exposes an action that any account can call after the required deadline. The caller receives no special financial right merely for submitting that transaction.

The detailed specification must define the outcome for:

- funding deadline;
- review expiry;
- resolver inactivity;
- organizer inactivity.

## 9. Transition test matrix

At minimum, contract tests must cover:

```text
valid transition succeeds
wrong caller reverts
wrong state reverts
deadline not reached reverts
deadline reached permits only intended action
duplicate action reverts
out-of-order milestone activation reverts
failed transition leaves balances and state unchanged
```

