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
  └─ submitEvidence → EVIDENCE_PENDING

EVIDENCE_PENDING
  ├─ rejectSubmission (assigned active verifier) → MILESTONE_ACTIVE; new version allowed
  └─ verifySubmission (assigned active verifier) → IN_REVIEW; 72 hours starts here

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

The contract implements funding, pre-funded refunds, sequential activation,
versioned evidence admission/rejection, donor challenge and unchallenged settlement/completion.
SETTLEABLE is a derived time condition, not a stored enum: campaign stays
IN_REVIEW until settleMilestone executes. Last settlement directly enters
COMPLETED and returns bond in the same transaction. Challenge resolution and
post-funded cancellation remain planned; CHALLENGED currently has no exit.
Review is fixed at 72 hours from verifier acceptance; admin duration changes are deferred.
Refund availability
is stored separately from campaign state; the campaign remains `CANCELLED` or
`FUNDING_FAILED` while donors claim.

## 3. Campaign transitions

| From | Action | Caller | Guard | To | Event |
|---|---|---|---|---|---|
| DRAFT | approve | Resolver | Criteria committed for every milestone | APPROVED | `CampaignApproved` |
| APPROVED | publish | Organizer | Bond locked; deadline still in future | FUNDING | `CampaignPublished` |
| FUNDING | donate reaches goal | Donor | Before deadline; amount does not exceed remaining goal | FUNDED | `DonationReceived`, `FundingFinalized` |
| FUNDING | finalize failure | Anyone | At/after deadline; goal not reached | FUNDING_FAILED | `FundingFinalized`, `RefundPoolSnapshotted`, `BondReturned` |
| DRAFT/APPROVED/FUNDING | cancel | Organizer | Campaign has not reached FUNDED; no deadline restriction | CANCELLED | `CampaignCancelled`, `RefundPoolSnapshotted`, `BondReturned` only if bond amount > 0 |
| FUNDED | activate first | Organizer | Index 0; locked bond covers budget | MILESTONE_ACTIVE | `MilestoneActivated` |
| MILESTONE_SETTLED | activate next | Organizer | Current index; locked bond covers budget | MILESTONE_ACTIVE | `MilestoneActivated` |
| MILESTONE_ACTIVE | submit evidence | Organizer | Current index; nonzero hash | EVIDENCE_PENDING | `EvidenceSubmissionCreated` |
| EVIDENCE_PENDING | assign/reassign reviewer | Admin | Current pending version; active verifier role; not organizer | EVIDENCE_PENDING | `VerifierAssigned` |
| EVIDENCE_PENDING | accept evidence | Assigned verifier | Active role; current version/hash | IN_REVIEW | `SubmissionVerified` |
| EVIDENCE_PENDING | reject evidence | Assigned verifier | Active role; current version/hash; reason required | MILESTONE_ACTIVE | `SubmissionRejected` |
| IN_REVIEW | challenge | Contributing donor | Current index; now < reviewEnd; nonzero reason hash | CHALLENGED | `ChallengeOpened` |
| IN_REVIEW | settle | Anyone | Current index; now >= reviewEnd; not challenged | MILESTONE_SETTLED or COMPLETED | `MilestoneSettled`; final: `BondReturned`, `CampaignCompleted` |
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

Implemented milestone states are PENDING, ACTIVE, REVIEWING, CHALLENGED, SETTLED
and SUBMITTED. Submission transitions ACTIVE to SUBMITTED; acceptance transitions
to REVIEWING and starts the timer. Rejection returns ACTIVE and permits a new
immutable version. Decisions/history are not overwritten. Activation moves no funds. Settlement pays exactly
the budget once; next activation is organizer-only after settlement. Challenge
resolution states in the diagram remain planned. There is no evidence-submission
timeout or resolver timeout recovery implementation yet.

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

### Reviewed target extension — not implemented

The proposed extension separates evidence admission, pending challenge screening,
organizer response, re-verification and final arbitration. The existing contract
enum/guards above still describe the implemented flow. Do not interpret the
following target as a deployed state machine:

```text
Evidence submitted -> admission -> donor review (72h)
Timely challenge -> settlement hold -> challenge screening
  inadmissible -> reasoned dismissal with contest path
  admissible -> organizer response -> re-verification
    correction accepted -> new evidence version -> fresh donor review
    unresolved -> independent resolver -> permitted verdict
```

Every waiting stage needs an explicit timeout/fallback; revised evidence must
not overwrite a previous commitment. Max correction rounds, appeal finality and
timing are still OPEN. Committee 2-of-3 is selected for MVP in the user's follow-up,
but not implemented. See [Verification and disputes](./verification-and-disputes.md).

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

