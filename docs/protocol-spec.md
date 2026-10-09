# FundTogether Protocol Specification — MVP

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-06
> **Source:** FundTogether v0.2 Process, Tech Stack and Threat Model

**Scope as of 2026-10-09:** this document describes baseline A. The separately
approved local pilot B uses advance funding and no bond; its authority and
actions are in [workflow B specification](./workflow-b-spec.md). B implementation
is in progress under [the approved code plan](./workflow-b-code-plan.md); A deployments and
existing campaign obligations are not migrated by this documentation.

**2026-10-05 approved amendment:** [MVP milestone completion](./mvp-milestone-completion.md)
supersedes separate verifier/appeal/slash proposals below for MVP. The existing
resolver admits evidence and decides CONTINUE / RESUBMIT / STOP; one final case
per evidence version, 7-day response plus 7-day resolution. STOP/timeout refunds
unreleased donor escrow and returns bond without penalty. New contract source
is separate from the old prototype. Storage/indexer/signing UI have isolated
integration evidence. After the authorized test reset on 2026-10-07, the application
deploys MVP; real browser acceptance remains pending. See [milestone lifecycle](./milestone-lifecycle.md).

**2026-10-06 development decision:** prioritize
[business validation and MVP consolidation](./business-validation-and-mvp-hardening.md).
Approved baseline rules remain in force for testing. Their practical suitability,
including reimbursement working capital and the no-slash bond's purpose, needs
evidence. Post-MVP and public-network expansion are deferred. Historical
prototype interfaces and verifier/slash proposals below do not override the
newer MVP policy or create rights on the existing deployment.

## 1. Purpose

FundTogether is a donation-based charitable crowdfunding protocol. Donors fund a campaign, an organizer delivers work in sequential milestones, and the protocol limits the amount exposed before each milestone is settled.

The MVP must prove one complete success path and one failure path:

```text
Draft → System checks / corrections → Submit → Resolver campaign approval
→ Publish (bond locked; contract guards satisfied) → Fund → Activate milestone
→ Evidence checks / admission → Donor review
  no challenge → Settle → Continue → Complete
  challenge → Checks → Response → Re-verification
    unresolved/escalated → Resolver arbitration → Permitted protocol outcome

Funding failure or cancellation → Refund → Bond settlement
```

This specification defines the protocol boundary. UI details, search, notifications and advanced reputation are application concerns and must not change financial rules.

## 2. MVP decisions

| Decision | MVP value | Status |
|---|---|---|
| Blockchain | EVM; Anvil local; later public-network evaluation subject to consolidation gate | APPROVED LOCAL; PUBLIC TRIAL DEFERRED |
| Donation asset | ERC20 MockUSDC | APPROVED |
| Bond asset | Same MockUSDC as donations | APPROVED |
| Local gas asset | Anvil native test ETH, separate from donation and bond | APPROVED DEV BASELINE |
| Public-network candidate | Earlier Arc evaluation proposal; Sepolia optional fallback | DEFERRED; NOT DEPLOYED |
| Production chain / sponsorship | Arc preferred candidate; production acceptance and sponsorship still open | CANDIDATE; NOT IMPLEMENTED |
| Milestones | Sequential; only the current milestone can be active | APPROVED |
| Release | Release the current milestone budget after successful settlement | APPROVED |
| Resolver | Existing authorized resolver: campaign approval, evidence admission and bounded case decisions | APPROVED; NEW MVP ISOLATED INTEGRATION; BROWSER ACCEPTANCE TODO |
| Challenge eligibility | Donor of the campaign being challenged | APPROVED |
| Challenge stake | None in MVP | APPROVED |
| Failure policy | MVP STOP/timeout without misconduct finding or slash; expanded taxonomy deferred | APPROVED MVP; PRACTICAL VALIDATION TODO |
| Evidence | Restricted originals, public redacted immutable package, resolver access audit | NEW MVP ISOLATED INTEGRATION; BROWSER ACCEPTANCE TODO |
| Separate verifier | Prototype has assigned VERIFIER_ROLE; new MVP disables legacy admission and uses resolver | POST-MVP ACTOR DEFERRED |
| Refund | Unreleased escrow snapshot; proportional one-time claims; bond separate, no slash | APPROVED; REGRESSION EVIDENCE IN PROGRESS LOG |
| Reputation | Future projection proposal from indexed events | DEFERRED; NOT AN MVP DELIVERY REQUIREMENT |
| Timeout execution | Permissionless funding/milestone/admission/case recovery and local worker | NEW MVP ISOLATED VERIFICATION; CONTINUOUS OPERATIONS TODO |

Deferred features include native ETH, multiple stablecoins, private evidence encryption, EIP-712 verifier signatures, Safe-based resolver execution, dynamic resolver registry, on-chain reputation registry, cross-chain support and DAO governance.

The 2026-10-03 review records layered verification as the target direction in
[Verification and dispute escalation](./verification-and-disputes.md). Current
contract behavior remains unchanged. The latest 2026-10-04 user decision defers
the permissioned 2-of-3 committee to post-MVP. MVP uses the configured resolver
and records individual decisions. Expanded post-MVP financial policy remains open in
[Dispute Policy and Resolver Committee](../v0.2/FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md).

The 2026-10-04 clarification keeps resolver participation in MVP. Campaigns
always undergo dossier/integrity/criteria checks and organizer corrections before
resolver review; system eligibility alone cannot open a campaign. The resolver
may be authorized platform staff. Evidence and challenge verification precede
dispute arbitration. The earlier 2-of-3 direction concerns arbitration only,
not every campaign approval; the latest follow-up explicitly defers that threshold to post-MVP.

## 3. Actors and authority

| Actor | Main actions | Authority boundary |
|---|---|---|
| Organizer | Create campaign, lock bond, activate milestone, submit evidence | Can act only for campaigns they own and only in valid states |
| Donor | Donate, inspect evidence, challenge, claim refund | Can challenge only after contributing to that campaign |
| Resolver MVP | Approve campaign dossiers, admit evidence and decide CONTINUE/RESUBMIT/STOP after bounded response/rechecking | Exact SIWE wallet and contract authority; conflict checks; reasons/version records; no arbitrary money/recipient choice |
| Separate evidence / challenge verifier | Deferred design; prototype-only assigned verifier admission remains | No separate verifier workflow required by new MVP; not an active MVP actor |
| Protocol admin | Prototype verifier-role administration; no arbitrary escrow withdrawal or emergency payout authority | Cannot overwrite campaign accounting or replace the immutable resolver through a DB role |
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
| User account | Backend with application session | Authenticate API calls; draft access uses internal userId |
| Wallet link | Backend with signed wallet proof | Prove wallet control; on-chain roles remain contract-authorized |
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

## 6. Core protocol actions — prototype reference

This section describes the older contract interface. For the new MVP's
resolver admission, version-bound actions, case exits and pull bond credit, use
[milestone lifecycle](./milestone-lifecycle.md) and
[financial recovery](./financial-recovery.md). Source existence does not enable
those actions on prototype campaigns.

| Action | Caller | Required guard | Main effect |
|---|---|---|---|
| Create campaign | Organizer | Valid configuration; no financial state yet | Creates campaign configuration |
| Approve campaign | Authorized resolver/staff | Target: completed dossier and prior system checks; current contract checks resolver/state/criteria | Allows organizer publication subject to bond/deadline guards; requests/rejections not yet implemented |
| Lock bond | Organizer | Correct token and amount; campaign not funded/active | Locks required bond |
| Donate | Donor | Campaign is fundable; amount > 0; before deadline | Transfers ERC20 into escrow |
| Finalize funding | Anyone | Deadline reached or goal reached according to rule | Moves campaign to funded or funding failed |
| Activate first milestone | Organizer | Campaign FUNDED; index 0; bond coverage valid | Marks milestone ACTIVE without transferring funds |
| Submit evidence | Organizer | Active milestone; valid evidence version | Commits evidence reference/hash |
| Open challenge | Eligible donor | Review window open; evidence exists | Opens challenge |
| Settle milestone | Resolver or permissionless timeout caller | Review/challenge conditions satisfied | Releases budget or applies approved outcome |
| Cancel campaign before funding | Organizer | Campaign in DRAFT, APPROVED or FUNDING | Creates immutable full-contribution refund snapshot and returns any locked bond atomically |
| Claim refund | Donor | Refund pool snapshot exists; entitlement > claimed | Transfers claimable amount once |
| Return bond | Terminal protocol transition | Terminal settlement rule satisfied | Prototype transfers bond; new MVP credits a separate organizer claim; no slash |

The API may prepare an action or publish intent. The contract receipt and indexed event determine whether the action actually happened.

The current prototype exposes `approveCampaign` for the trusted resolver (the deployer) and `publishCampaign` for the organizer. Local review eligibility checks criteria, frozen plan identity and bond; this is not the complete target dossier verification/correction workflow. Target campaign approval remains a human resolver decision after those checks. Donations are accepted only during `FUNDING` before the deadline, capped at the remaining goal. Reaching the goal immediately enters `FUNDED`. Anyone may call `finalizeFundingFailure` at or after the deadline if the campaign is still `FUNDING`.

Pre-funded cancellation/failure emits `RefundPoolSnapshotted` and, when a positive bond is returned, `BondReturned` in the prototype terminal transaction. The organizer can cancel unpublished campaigns before or after the deadline; no token call is needed when no bond was locked. A donor's independent claim emits `RefundClaimed`. The pool excludes bond and unsolicited transfers, and each donor receives their full recorded contribution once. Prototype activation/evidence timeouts also support unreleased-escrow refunds; challenge exits require the separate MVP. Slashing is deferred.

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

## 7. Evidence and challenge — historical verifier proposal

The assigned-verifier/challenge-screening/appeal proposal below is retained as
design history. The later approved MVP uses the existing resolver for admission
and final decisions, with a 72-hour donor review and fixed 7+7-day case window;
separate verifier and appeals are deferred. Admission proves neither delivery
nor truth; an unchallenged review is not proof that all donors read the evidence.

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

Target sequence: system evidence checks -> assigned verifier admission -> 72-hour
donor review -> timely challenge hold -> system challenge checks/screening ->
organizer response -> re-verification -> resolver arbitration only if unresolved
or handling deadlines require escalation. Revised evidence uses new immutable versions and fresh review.
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

Already decided for the current MVP: STOP/timeout refunds unreleased escrow,
case handling is fixed at 7+7 days, bond is not slashed, claims round down with
retained dust and no expiry/sweep. They are not unresolved implementation policy.

Remaining decisions/evidence before a practical freeze:

1. Target campaign type, organizer working capital and justified no-slash bond
   purpose; evidence from research questions B01–B03.
2. Evidence standards, resolver responsibilities/conflicts/capacity and donor
   participation; practical adequacy of the approved deadline defaults.
3. Operational ownership, backup/restore, timeout execution and limits of recovery
   for lost wallets, unavailable evidence or issuer-blocked token transfers.
4. Real browser MVP acceptance on a separate, consistent deployment and any
   later migration plan preserving existing prototype obligations.
5. Confirmation depth, token qualification and finality/reorg policy if a public
   validation network is subsequently selected.

Expanded misconduct taxonomy, slash allocation and appeals remain post-MVP
research. The [consolidation plan](./business-validation-and-mvp-hardening.md)
defines exit criteria; passing tests alone does not close these questions.

