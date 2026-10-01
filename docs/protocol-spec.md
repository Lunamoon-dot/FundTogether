# FundTogether Protocol Specification — MVP

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-02
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
| Blockchain | EVM-compatible; Anvil for local development, Sepolia for validation | APPROVED |
| Donation asset | ERC20 MockUSDC | APPROVED |
| Bond asset | Same MockUSDC as donations | APPROVED |
| Milestones | Sequential; only the current milestone can be active | APPROVED |
| Release | Release the current milestone budget after successful settlement | APPROVED |
| Resolver | Trusted resolver/admin | APPROVED MVP LIMITATION |
| Challenge eligibility | Donor of the campaign being challenged | APPROVED |
| Challenge stake | None in MVP | APPROVED |
| Failure classification | `NORMAL_FAILURE` and `MISCONDUCT` | APPROVED MVP SIMPLIFICATION |
| Evidence | Public evidence only | APPROVED MVP LIMITATION |
| Verifier | Optional input; resolver makes the final protocol decision | APPROVED |
| Refund | Snapshot-based unconsumed pool accounting | APPROVED |
| Reputation | Off-chain projection from indexed events | APPROVED |
| Timeout execution | Permissionless: anyone may call an eligible terminal action | APPROVED |

Deferred features include native ETH, multiple stablecoins, private evidence encryption, EIP-712 verifier signatures, multisig resolver, on-chain reputation registry, cross-chain support and DAO governance.

## 3. Actors and authority

| Actor | Main actions | Authority boundary |
|---|---|---|
| Organizer | Create campaign, lock bond, activate milestone, submit evidence | Can act only for campaigns they own and only in valid states |
| Donor | Donate, inspect evidence, challenge, claim refund | Can challenge only after contributing to that campaign |
| Resolver | Review challenge, accept or reject misconduct, settle disputed milestone | Trusted MVP role; contract limits allowed outcomes |
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

## 6. Core protocol actions

| Action | Caller | Required guard | Main effect |
|---|---|---|---|
| Create campaign | Organizer | Valid configuration; no financial state yet | Creates campaign configuration |
| Lock bond | Organizer | Correct token and amount; campaign not funded/active | Locks required bond |
| Donate | Donor | Campaign is fundable; amount > 0; before deadline | Transfers ERC20 into escrow |
| Finalize funding | Anyone | Deadline reached or goal reached according to rule | Moves campaign to funded or funding failed |
| Activate milestone | Organizer or permitted caller | Previous milestone settled; bond coverage valid | Opens current milestone |
| Submit evidence | Organizer | Active milestone; valid evidence version | Commits evidence reference/hash |
| Open challenge | Eligible donor | Review window open; evidence exists | Opens challenge |
| Settle milestone | Resolver or permissionless timeout caller | Review/challenge conditions satisfied | Releases budget or applies approved outcome |
| Cancel campaign | Authorized caller | Valid failure/cancellation condition | Freezes future work and creates refund path |
| Claim refund | Donor | Refund pool snapshot exists; entitlement > claimed | Transfers claimable amount once |
| Return/slash bond | Protocol outcome | Terminal settlement rule satisfied | Returns or allocates bond according to financial rules |

The API may prepare an action or publish intent. The contract receipt and indexed event determine whether the action actually happened.

## 7. Evidence and challenge

Evidence has separate off-chain and on-chain stages:

```text
uploaded → hashed/versioned → commitment submitted
→ commitment confirmed → review → accepted or challenged
```

The hash proves integrity of the committed bytes. It does not prove that an invoice, photo or report is truthful in the physical world.

In MVP, a challenge does not automatically slash the organizer. The resolver must select an allowed outcome, and the contract must enforce that outcome's financial limits.

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

The first contract event model should include:

```text
CampaignCreated
BondLocked
ContributionReceived
FundingFinalized
MilestoneActivated
EvidenceSubmitted
ChallengeOpened
MilestoneSettled
CampaignCancelled
RefundAvailable
RefundClaimed
BondReturned
BondSlashed
```

Every event must contain enough identifiers for an idempotent indexer: campaign ID, relevant actor, milestone ID where applicable, block context and event-specific values.

## 10. Implementation guardrails

- Use integer token amounts and `bigint`; never use floating point for financial values.
- Do not combine database writes and blockchain transactions as if they were one ACID transaction.
- Keep `BlockchainService` as low-level RPC/contract access and `IndexerService` as event-to-projection logic.
- Do not mark an operation complete before the required receipt, confirmation and indexing states are reached.
- All public contract actions require access-control, state, deadline and replay/double-call tests.

## 11. Open items before contract freeze

These items are intentionally still open for the detailed documents:

1. Exact campaign funding finalization rule when goal is reached before deadline.
2. Exact resolver timeout duration and fallback outcome.
3. Exact bond slash amount and allocation cap.
4. Rounding and dust handling for refund claims.
5. Confirmation depth and reorg policy for the first validation network.

