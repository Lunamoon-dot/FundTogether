# FundTogether Protocol Specification — MVP

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-03
> **Source:** FundTogether v0.2 Process, Tech Stack and Threat Model

## 1. Purpose

FundTogether is a donation-based charitable crowdfunding protocol. Donors fund a campaign, an organizer delivers work in sequential milestones, and the protocol limits the amount exposed before each milestone is settled.

The MVP must prove one complete success path and one failure path:

```text
Create → Fund → Activate milestone → Submit evidence
→ Review / Challenge → Settle → Continue → Complete

Funding failure or cancellation → Refund → Bond settlement
```

This specification defines the protocol boundary. UI details, search, notifications and advanced reputation are application concerns and must not change financial rules.

## 2. MVP decisions

| Decision | MVP value | Status |
|---|---|---|
| Blockchain | EVM; Anvil local; Arc testnet priority for integration; Sepolia optional fallback | APPROVED LOCAL; ARC TRIAL TODO |
| Donation asset | ERC20 MockUSDC | APPROVED |
| Bond asset | Same MockUSDC as donations | APPROVED |
| Local gas asset | Anvil native test ETH, separate from donation and bond | APPROVED DEV BASELINE |
| Priority target | Arc testnet; USDC native gas and ERC20 share one balance | SELECTED TRIAL; NOT DEPLOYED |
| Production chain / sponsorship | Arc preferred candidate; production acceptance and sponsorship still open | CANDIDATE; NOT IMPLEMENTED |
| Milestones | Sequential; only the current milestone can be active | APPROVED |
| Release | Release the current milestone budget after successful settlement | APPROVED |
| Resolver | Current prototype: deployer role; target: independent final arbitration after verification/response | CURRENT LIMITATION; TARGET DESIGN REVIEWED |
| Challenge eligibility | Donor of the campaign being challenged | APPROVED |
| Challenge stake | None in MVP | APPROVED |
| Failure classification | Draft: `CANCEL_WITHOUT_FAULT`, `DEFAULT`, `MISCONDUCT`; taxonomy/slash mapping not frozen | OPEN; NOT IMPLEMENTED |
| Evidence | Restricted originals/manifests; public redacted derivatives; immutable versions | DOCUMENTED; STORAGE TODO |
| Verifier | One VERIFIER_ROLE: submission admission/versioning implemented; challenge/remediation specified; no edits/adjudication/direct transfers | PARTIALLY IMPLEMENTED |
| Refund | Pre-FUNDED full contribution snapshot/pull claims implemented; post-FUNDED composition open | PARTIALLY IMPLEMENTED |
| Reputation | Off-chain projection from indexed events | APPROVED |
| Timeout execution | Permissionless funding failure and unchallenged settlement; waiting-stage recovery still open | PARTIALLY IMPLEMENTED |

Deferred features include native ETH, multiple stablecoins, private evidence encryption, EIP-712 verifier signatures, Safe-based resolver execution, dynamic resolver registry, on-chain reputation registry, cross-chain support and DAO governance.

The 2026-10-03 review records layered verification as the target direction in
[Verification and dispute escalation](./verification-and-disputes.md). Current
contract behavior remains unchanged. The user's follow-up selects a permissioned
2-of-3 matching-verdict committee and individual vote recording for MVP.
This is selected design, not a verified implementation. The policy draft is in
[Dispute Policy and Resolver Committee](../v0.2/FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md).

## 3. Actors and authority

| Actor | Main actions | Authority boundary |
|---|---|---|
| Organizer | Create campaign, lock bond, activate milestone, submit evidence | Can act only for campaigns they own and only in valid states |
| Donor | Donate, inspect evidence, challenge, claim refund | Can challenge only after contributing to that campaign |
| Resolver | Final arbitration of unresolved cases in the target flow | Independent from organizer/challenger and prior case verifiers; predefined verdicts only; not implemented |
| Evidence / challenge verifier | Target admissibility checking and recorded findings | Cannot establish misconduct merely by admitting a claim or arbitrarily distribute funds |
| Protocol admin | Configure trusted roles and emergency controls | Must not arbitrarily edit campaign accounting |
| Beneficiary / vendor | Evidence subjects or sources | No automatic financial authority |
| Indexer | Read events and write projections | Cannot create financial truth or mutate contract state silently |

Web2 authentication identifies a user. Wallet signatures and contract checks establish authority for on-chain actions. A connected wallet alone is not proof of a backend session.

## 4. Source of truth and data ownership

| Data or decision | Authoritative source | Backend responsibility |
|---|---|---|
| Contributions, escrow, bond, release, refund entitlement | Smart contract | Index and expose projection |
| Milestone and challenge state | Smart contract | Index and expose projection |
| Evidence file and metadata | Backend/storage | Store, version and expose according to visibility policy |
| Evidence commitment hash | Smart contract | Link file version to transaction/event |
| User account and wallet link | Backend with wallet proof | Authenticate and authorize API calls |
| Search, notifications and presentation fields | PostgreSQL | Query and cache |
| Reputation metrics | Indexed event projection | Compute and explain metric source |

PostgreSQL is not allowed to overwrite chain-derived financial state. If the API projection is stale, it must expose sync metadata or fall back to a chain read where appropriate.

## 5. Campaign configuration

The campaign must commit all values that affect financial rights or state transitions. At minimum:

```text
campaignId
organizer
donationToken
fundingGoal
fundingDeadline
milestones[]
  - milestoneId
  - budget
  - acceptanceCriteriaHash
  - reviewWindow
requiredBond
```

Long descriptions, images and beneficiary profiles are off-chain metadata. If an off-chain field changes the meaning of a financial or acceptance rule, it must be versioned and committed before it is used.

The current prototype exposes:

```solidity
createCampaign(string name, address donationToken, uint256 fundingDeadline, uint256[] milestoneBudgets)
```

It commits positive ordered budgets and derives `fundingGoal = sum(budgets)`
and `requiredBond = max(budgets)`. `milestones(campaignId, index)` exposes the
budget/state, and `milestoneCount(campaignId)` exposes the count. Creation emits
`CampaignCreated` followed by one `MilestoneConfigured` per index.

`configureMilestoneCriteria(campaignId, milestoneIndex, criteriaHash)` lets only
the organizer commit or correct a nonzero hash while DRAFT. Approval requires
all milestones to have criteria and freezes those commitments. The separate
`milestoneCriteria(campaignId, milestoneIndex)` getter and
`MilestoneCriteriaConfigured` event expose each hash. Criteria text/files remain
off-chain; the hash proves a commitment, not delivery or correctness.

Review is fixed at 72 hours for MVP, accepted by the user on 2026-10-03.
Admin duration changes are deferred. The creation ABI is still a prototype and must be stabilized
before frontend/backend campaign creation depends on it.

## 6. Core protocol actions

| Action | Caller | Required guard | Main effect |
|---|---|---|---|
| Create campaign | Organizer | Valid configuration; no financial state yet | Creates campaign configuration |
| Lock bond | Organizer | Correct token and amount; campaign not funded/active | Locks required bond |
| Donate | Donor | Campaign is fundable; amount > 0; before deadline | Transfers ERC20 into escrow |
| Finalize funding | Anyone | Deadline reached or goal reached according to rule | Moves campaign to funded or funding failed |
| Activate first milestone | Organizer | Campaign FUNDED; index 0; bond coverage valid | Marks milestone ACTIVE without transferring funds |
| Submit evidence | Organizer | Active milestone; valid evidence version | Commits evidence reference/hash |
| Open challenge | Eligible donor | Review window open; evidence exists | Opens challenge |
| Settle milestone | Resolver or permissionless timeout caller | Review/challenge conditions satisfied | Releases budget or applies approved outcome |
| Cancel campaign before funding | Organizer | Campaign in DRAFT, APPROVED or FUNDING | Creates immutable full-contribution refund snapshot and returns any locked bond atomically |
| Claim refund | Donor | Refund pool snapshot exists; entitlement > claimed | Transfers claimable amount once |
| Return/slash bond | Protocol outcome | Terminal settlement rule satisfied | Returns or allocates bond according to financial rules |

The API may prepare an action or publish intent. The contract receipt and indexed event determine whether the action actually happened.

The current prototype exposes `approveCampaign` for the trusted resolver (the deployer) and `publishCampaign` for the organizer. Donations are accepted only during `FUNDING` before the deadline, capped at the remaining goal. Reaching the goal immediately enters `FUNDED`. Anyone may call `finalizeFundingFailure` at or after the deadline if the campaign is still `FUNDING`.

Pre-funded cancellation/failure emits `RefundPoolSnapshotted` and, when a positive bond is returned, `BondReturned` in the terminal transaction. The organizer can cancel unpublished campaigns before or after the deadline; no token call is needed when no bond was locked. A donor's independent claim emits `RefundClaimed`. The pool excludes bond and unsolicited transfers, and each donor receives their full recorded contribution once. Post-funded refunds and slashing remain planned.

Evidence admission now uses AccessControl: deployer initially has DEFAULT_ADMIN_ROLE;
admin grants/revokes VERIFIER_ROLE and assigns/reassigns only pending submissions.
Organizer cannot be assigned to verify their own campaign. submitEvidence creates
a versioned SUBMITTED record. verifySubmission/rejectSubmission require the assigned
active role holder and exact current version/hash. Rejection records reasonHash and
allows a new version; acceptance starts the 72-hour review. History remains readable
through evidenceSubmissions and submissionVersion. No verifier action transfers tokens.
Events are EvidenceSubmissionCreated, VerifierAssigned, SubmissionVerified and
SubmissionRejected, replacing the old EvidenceSubmitted event.

`activateMilestone(campaignId, milestoneIndex)` activates the next pending
milestone after funding or previous settlement. It emits MilestoneActivated
without moving funds. Skipping and repeated activation revert.
submitEvidence commits a nonzero immutable hash/version without a review deadline.
milestoneEvidence exposes the latest hash and end timestamp after admission.
openChallenge is limited to campaign contributors strictly before reviewEnd;
it emits ChallengeOpened with donor and reason hash and blocks settlement.
Dispute resolution is not implemented; CHALLENGED currently has no exit.
settleMilestone is permissionless at/after reviewEnd for an unchallenged review.
It pays the organizer, emits MilestoneSettled and advances the current index.
Final settlement returns bond and emits CampaignCompleted atomically.
totalReleased excludes bond. Transactions do not run automatically at deadlines.

## 7. Evidence and challenge

User-approved verifier authority is specified in
[Verifier Specification v0.1](../v0.2/FundTogether_Verifier_Specification_v0.1.md).
Five specified procedural actions: verifySubmission, rejectSubmission, verifyChallenge,
rejectChallenge and verifyRemediation. The same role may check all three stages,
but cannot arbitrate the same case. Objective remediation starts a fresh 72-hour
review; unresolved subjective disputes escalate. Multiple platform-appointed
wallets share VERIFIER_ROLE, initially two; one assigned verifier handles a
submission, without a voting threshold. Grant/revoke and pending submission
reassignment are implemented. Challenge/remediation and hold/appeal
semantics remain open. Verifiers never modify organizer records or transfer funds.

Evidence has separate off-chain and on-chain stages:

```text
uploaded → hashed/versioned → commitment submitted
→ commitment confirmed → review → accepted or challenged
```

The hash proves integrity of the committed bytes. It does not prove that an invoice, photo or report is truthful in the physical world.

In MVP, a challenge does not automatically slash the organizer. The resolver must select an allowed outcome, and the contract must enforce that outcome's financial limits.

Target sequence: evidence admission -> 72-hour donor review -> timely challenge
hold -> screening -> organizer response -> re-verification -> final arbitration
only if unresolved. Revised evidence uses new immutable versions and fresh review.
Pending timely challenges must block settlement before screening finishes.
These target stages and dismissal appeals are not present in the prototype;
see the linked design for authority boundaries and remaining decisions.

## 8. Liveness and timeout rules

Deadlines create permission to execute; they do not execute code automatically. After a deadline, any account may submit a terminal action if the contract guard is satisfied.

The state machine must define at least:

- funding deadline;
- evidence review window;
- resolver decision deadline;
- organizer abandonment or cancellation path;
- the outcome when a resolver does not respond.

The exact timeout durations are an implementation parameter and must be recorded in the state-machine and financial-rules documents before contract freeze.

## 9. Required events

FundTogether-specific event names checked against source on 2026-10-03:

```text
CampaignCreated
MilestoneConfigured
MilestoneCriteriaConfigured
CampaignApproved
BondLocked
CampaignPublished
DonationReceived
FundingFinalized
MilestoneActivated
EvidenceSubmissionCreated
VerifierAssigned
SubmissionVerified
SubmissionRejected
ChallengeOpened
MilestoneSettled
CampaignCompleted
CampaignCancelled
RefundPoolSnapshotted
BondReturned
RefundClaimed
```

Every event must contain enough identifiers for an idempotent indexer: campaign ID, relevant actor, milestone ID where applicable, block context and event-specific values.

AccessControl also emits inherited role events. Slashing and committee verdict events are not implemented. Generate ABI from the build; this list is not a shared ABI/deployment artifact.

## 10. Implementation guardrails

- Use integer token amounts and `bigint`; never use floating point for financial values.
- Do not combine database writes and blockchain transactions as if they were one ACID transaction.
- Keep `BlockchainService` as low-level RPC/contract access and `IndexerService` as event-to-projection logic.
- Do not mark an operation complete before the required receipt, confirmation and indexing states are reached.
- All public contract actions require access-control, state, deadline and replay/double-call tests.

## 11. Open items before contract freeze

These items are intentionally still open for the detailed documents:

1. Post-funded cancellation and refund outcomes after milestone releases.
2. Exact resolver timeout duration and fallback outcome.
3. Exact bond slash amount and allocation cap.
4. Rounding and dust handling for refund claims.
5. Confirmation depth and reorg policy for the first validation network.

