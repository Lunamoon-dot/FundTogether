# FundTogether VNext Local Policy Freeze and Implementation Specification

> **Status:** Adopted design boundary for the next local implementation. This
> document is a specification, not evidence that the contract, indexer, API,
> frontend or runtime already satisfies it.
>
> **Date:** 2026-10-20
>
> **Policy version:** `fundtogether-vnext-local-v2-remediation`
>
> **Deployment boundary:** Anvil chain `31339`, MockUSDC, local PostgreSQL and
> private MinIO storage. This policy does not authorize public-chain, real-money
> or production custody.

## 1. Purpose and adoption boundary

This specification turns the completed design review into one coherent local
implementation target. It freezes the minimum protocol behavior needed to
implement and verify a permissionless campaign with stake-backed Judge review,
exact milestone escrow, terminal refunds and a private digital PDF access path.

The current product and architecture sources remain:

- [research direction](../../research-direction.md);
- [project overview](../../PROJECT_OVERVIEW.md); and
- [VNext Protocol V1](../../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md).

This document adopts the local remediation policy for new implementation work.
It does not reinterpret existing campaigns, review cases, deployments or
commitments. Existing policy versions remain valid for the cases that recorded
them.

The following files remain historical or proposal material and are not active
implementation authority for this policy:

- `2026-10-20-randomized-judge-review-design.md` and
  `2026-10-20-randomized-judge-publication.md` are superseded incremental
  publication work. They must not be used to preserve Resolver authority.
- `2026-10-20-fundtogether-mvp-open-funding-access-economics-design.md` is an
  unadopted alternative. Its NFT, generic access, open-funding,
  overfunding and refundable review-reserve proposals are excluded here.
- `2026-10-20-pure-decentralized-protocol-design.md` remains the target
  architecture summary; this document supplies the local implementation
  parameters and guards.

## 2. Product and trust boundary

### 2.1 Product boundary

The local reference product is exactly:

| Dimension | Frozen local rule |
| --- | --- |
| Category | `COMICS_ARTBOOK` |
| Tier | One `STANDARD` tier |
| Deliverable | One private `DIGITAL_DOWNLOAD` PDF |
| Asset | MockUSDC with integer token units |
| Access | Wallet-authenticated private gateway after canonical completion |
| NFT | Not used |
| Physical fulfilment | Out of scope |
| Marketplace, resale, royalties | Out of scope |
| KYC, email/password auth | Out of scope |
| Public chain and real money | Out of scope |

The access path is an off-chain entitlement, not a token. A wallet with a
canonical positive contribution may receive access after the campaign reaches
`COMPLETED` and the final PDF bytes are available. The gateway may issue a
short-lived private URL, but it cannot create a contribution, payout, refund or
financial entitlement.

PDF availability is a storage and delivery boundary, not proof of authorship,
quality, legality, uptime or real-world truth. Judges review the committed
evidence bytes available to them through the private evidence path. If required
evidence is unavailable or mismatches its commitment before finality, the case
follows the protocol retry/failure path. A later gateway outage cannot rewrite a
canonical ruling or authorize a backend-created financial reversal; any future
compensation policy requires a new policy version.

### 2.2 Authority boundary

```text
Creator / Backer / Judge wallet
          |
          v
CampaignEscrowVNext + JuryReview + JuryRegistry
          |
     canonical events
          |
transactional idempotent indexer
          |
PostgreSQL projections and read APIs
          |
React UI and private evidence/access gateway
```

The contracts are authoritative for campaign terms required for custody,
contributions, milestone state, evidence revision identity, Judge stake,
assignment, voting, review outcomes, payout, refund allocation and claim
uniqueness.

The backend owns SIWE, input validation, metadata, private evidence storage,
access checks and indexed read models. It MUST NOT choose a Judge, manufacture a
ruling, release funds, open a refund or increase an entitlement from a database
row.

Admin/operator access is read-only operational access. Resolver behavior that
remains in the checkout is historical or transitional implementation residue;
it is not an authority in this policy.

## 3. Frozen local policy parameters

All values below are integer-safe and MUST be stored or derivable from the
recorded `policyVersion`. A change to a fund-moving value creates a new policy
version and never mutates an existing campaign or review case.

| Parameter | Local value | Owner / rule |
| --- | ---: | --- |
| Chain | `31339` | Deployment identity |
| Token | MockUSDC, 6 decimals | Contract deployment |
| Minimum stake floor | `10 MockUSDC` | `JuryRegistry` |
| Risk multiplier | `500 bps` | `requiredCaseStake = max(floor, ceil(riskValue * 500 / 10000))` |
| Court size | `3` unique Judges | `JuryReview` |
| Court mode | `K = floor(N / 3)` | All courts in the frozen snapshot |
| Eligible Judge cap | `300` | Local gas/research cap |
| Judge enrollment window | `48 hours` | Starts when case enrollment opens |
| Commit window | `24 hours` | Starts after assignment/enrollment phase |
| Reveal window | `24 hours` | All three assigned Judges must reveal |
| Appeal window | `48 hours` | Starts after the latest valid substantive round |
| Randomness timeout | `48 hours` | Timeout is protocol failure, not substantive FAIL |
| Milestone submission window | `7 days` | Starts when the milestone becomes active |
| Correction window | `7 days` | Starts when a milestone correction opens |
| Challenge window | `7 days` | Reserved parameter; challenge is disabled locally |
| Maximum appeal rounds | `2` | Fresh non-overlapping pool per round |
| Maximum retries per review level | `2` | Only protocol-invalid rounds retry |
| Maximum milestone corrections | `1` | Budget and criteria remain frozen |
| Minority slash | `500 bps` | Only after substantive finality |
| Non-reveal penalty | `0` | Missing reveal invalidates the court |
| Service/review fee | `0 MockUSDC` | No paid reviewer service in local policy |
| Appeal bond | `1 MockUSDC` | Returned when the appeal family reaches finality |
| Challenge | Disabled | No `openChallenge` in this local policy |
| Refund expiry | None | Entitlements remain pull-claimable |
| Funding overrun | Revert | Contribution above remaining goal is rejected |
| Court aggregation | Strict majority | Tie or invalid court becomes protocol failure |
| Reward source | Minority slash pool only | Separate Judge ledger; deterministic dust |

The local policy deliberately has no service-fee income. Judge participation
may therefore produce zero reward when there is no minority slash. This is a
known research limitation, not permission to deduct an unapproved fee from
Backer escrow.

## 4. Frozen campaign commitment

Before publication review or funding, the Creator MUST commit:

- Creator payout wallet;
- supported token and chain;
- `COMICS_ARTBOOK` category, `STANDARD` tier and PDF deliverable type;
- funding goal and funding deadline;
- ordered milestone identifiers;
- exact positive payout budget for each milestone;
- acceptance-criteria hash for each milestone;
- evidence submission and correction policy;
- review, appeal and refund policy versions;
- protocol version and local `policyVersion`;
- deliverable/access commitment hash and private access policy metadata
  commitment. The final PDF bytes are committed with the final evidence
  revision, not at campaign creation.

For this policy:

```text
fundingGoal = sum(all immutable milestone budgets)
```

There is no `baseReviewBudget`, review reserve or completion surplus in the
campaign goal. Review service fees are zero. Judge stake, appeal bonds and
Judge reward/slash balances are separate ledgers and are never counted as
campaign contribution escrow.

After funding begins, the contract MUST reject changes to the goal, milestone
order, acceptance criteria, payout amount, Creator payout wallet, token, chain,
deliverable commitment or policy version.

## 5. Campaign and funding state machine

```text
DRAFT
  -> PUBLICATION_REVIEW
       -> PUBLICATION_APPROVED
            -> FUNDING
                 -> MILESTONES_RUNNING
                 -> REFUNDING (goal not reached at deadline)
```

When `raised == fundingGoal` before the funding deadline:

- no additional contribution is accepted;
- the campaign may remain visibly in `FUNDING`;
- `finalizeFunding` MUST revert before the deadline;
- after the deadline, any caller may finalize the campaign.

At deadline finalization:

- if `raised == fundingGoal`, the campaign enters
  `MILESTONES_RUNNING` and activates the first milestone;
- if `raised < fundingGoal`, the campaign enters `REFUNDING` with the full
  confirmed contribution amount refundable;
- no Creator payout or Judge fee is authorized by funding finalization.

Contributions after the deadline or above the remaining goal MUST revert. A
submitted contribution transaction is not a canonical contribution until the
contract receipt and indexer projection exist.

Funding success does not pay the Creator. Every Creator payment requires the
milestone review and payout guards below.

## 6. Milestone state machine

```text
PENDING
   -> ACTIVE
       -> EVIDENCE_SUBMITTED
           -> REVIEW_ENROLLMENT
               -> REVIEW_ROUND
                   -> PROVISIONAL_PASS / PROVISIONAL_FAIL
                       -> APPEAL_WINDOW
                           -> FINAL_PASS
                           -> VERDICT_FAIL
                       -> RETRY_ELIGIBLE
                           -> new REVIEW_ROUND
                           -> PROTOCOL_FAIL
       -> TERMINAL_FAILURE (submission timeout)

VERDICT_FAIL
   -> CORRECTION
       -> EVIDENCE_SUBMITTED (one new revision)
       -> TERMINAL_FAILURE (correction timeout/limit)

FINAL_PASS
   -> PAYABLE
       -> PAID
```

The first active milestone receives a frozen submission deadline when funding
is finalized. A later milestone receives its deadline when the previous
milestone is paid. A pending milestone with no initialized deadline MUST NOT be
expired by a public caller.

The Creator may submit evidence before the deadline. Each submission creates a
new immutable `evidenceRevision`, evidence hash and review-case identity. The
acceptance-criteria hash, payout amount, Creator payout wallet and policy
version cannot change during correction.

An active milestone with no evidence after its deadline may be expired by any
caller and enters the terminal refund path. This timeout is operational and is
not a factual Judge verdict.

## 7. Review cases and Judge courts

### 7.1 Case identity

Every publication, base, retry and appeal case MUST bind:

```text
chainId
protocolVersion
policyVersion
campaignId
milestoneId or publication marker
evidenceRevision
reviewCaseId
roundId
caseKind
creator
riskValue
requiredCaseStake
```

The identity, evidence revision, risk value, policy values and required stake
are immutable after case creation.

For risk calculation:

- publication review uses `fundingGoal`;
- milestone review uses the frozen milestone payout budget;
- appeal review uses the root case risk value.

```text
requiredCaseStake = max(
    minimumStakeFloor,
    ceil(riskValue * riskMultiplierBps / 10_000)
)
```

The integer-safe ceiling operation is:

```text
ceil(x * bps / 10_000) = (x * bps + 9_999) / 10_000
```

### 7.2 Judge eligibility and conflict

Enrollment is permissionless for a wallet that has deposited enough MockUSDC
stake and satisfies the case policy. The following wallets MUST be excluded
from the case snapshot:

- the campaign Creator;
- any wallet with a canonical contribution to the same campaign at the
  eligibility snapshot.

If the conflict-filtered eligible set has fewer than three Judges, no court may
be created. The case follows bounded retry and then `PROTOCOL_FAIL` rules.

The local implementation does not attempt to identify humans behind wallets.
Sybil wallets, collusion, bribery, stake concentration and incorrect majority
outcomes remain accepted research risks.

### 7.3 Reservation and settlement

Before a Judge reserves stake, `JuryRegistry` MUST contain a registered case in
`ENROLLMENT_OPEN` with its case identity, pool, enrollment deadline and required
stake.

`reserveCaseStake` MUST reject unknown, expired, closed or underfunded cases and
must not exceed the Judge's available deposited balance. Available, reserved,
settled and reward balances are separate integer ledgers.

If a wallet reserves stake but is not enrolled when enrollment closes, any
caller may release the reservation back to that Judge's available balance. An
enrolled or assigned reservation follows exactly-once case settlement and
cannot use the abandoned-reservation recovery path.

### 7.4 Snapshot and assignment

At snapshot finalization the review engine freezes:

- eligible Judge addresses in canonical order;
- each Judge's locked case stake;
- snapshot block and seed identifier;
- `N`, `K = floor(N / 3)` and the assignment permutation.

The local cap is `N <= 300`. `K` is zero when fewer than three eligible Judges
exist. The permutation is generated once from the frozen list and local seed.
Assignment calls only materialize already-determined seats:

```text
court k:
  seat 0 = permutation[3*k]
  seat 1 = permutation[3*k + 1]
  seat 2 = permutation[3*k + 2]
```

Assignment call order MUST NOT affect court membership. A Judge cannot receive
two seats in one review round. Judges in a Base pool cannot participate in an
Appeal pool for the same case; Judges in one Appeal pool cannot participate in
a later Appeal pool for that case.

The local randomness provider is deterministic and verifiable for research.
The backend MUST NOT submit an arbitrary Judge list. A randomness timeout is a
protocol failure and follows bounded retry; it is not a substantive FAIL.

## 8. Commit–reveal and outcome policy

Each assigned Judge has one vote for one court. The commitment MUST bind at
least:

```text
chainId
protocolVersion
policyVersion
campaignId
milestoneId or publication marker
evidenceRevision
reviewCaseId
roundId
courtId
judgeAddress
vote
salt
```

The contract MUST reject duplicate commits, late commits, wrong Judge, wrong
round, wrong court, reused commitment and reveal values that do not match the
commitment. Plaintext vote is not accepted during commit.

All three assigned Judges MUST reveal valid votes before the court is valid.
Missing reveal, invalid reveal or reveal timeout invalidates the court. It does
not become a two-vote substantive result and does not receive a non-reveal
cash penalty in this local policy.

A valid court resolves:

```text
PASS + PASS + FAIL -> PASS
PASS + FAIL + FAIL -> FAIL
PASS + PASS + PASS -> PASS
FAIL + FAIL + FAIL -> FAIL
```

For multiple courts:

```text
FinalPass iff PassCourts > K / 2
FinalFail iff FailCourts > K / 2
Tie      iff PassCourts = FailCourts
```

An invalid court, tie, unavailable randomness or incomplete required
aggregation produces `RETRY_ELIGIBLE`, not substantive `VERDICT_FAIL`. A valid
substantive aggregate enters the appeal window and MUST NOT enter retry.

After the maximum retries for that review level, the case becomes
`PROTOCOL_FAIL`. `PROTOCOL_FAIL` is an operational result and MUST NOT be used
as proof of Creator misconduct or as a minority-slash basis.

## 9. Appeal and correction policy

An appeal is permissionless only for an eligible requester while the appeal
window is open and the bond is transferred:

- a Backer with a nonzero canonical contribution may appeal;
- the Creator may appeal a publication or milestone `VERDICT_FAIL`.

The requester cannot select Judges, change evidence, change acceptance
criteria, change payout amount or reuse a Judge from an earlier pool. The
appeal opens a fresh non-overlapping pool. A valid appeal opens a new review; it
does not itself reverse the prior ruling. The 1 MockUSDC appeal bond is returned
when the appeal family reaches finality, regardless of which substantive result
prevails.

After a milestone `VERDICT_FAIL`, the Creator may use at most one correction if
the correction policy permits it. The correction creates a new evidence
revision and review case, retains the original criteria and budget, and starts
the 7-day correction deadline. A correction timeout or exhausted correction
allowance opens terminal failure. `PROTOCOL_FAIL` does not create an unlimited
correction right.

Challenge is disabled in this local policy. The implementation MUST NOT expose
a zero-cost unlimited `openChallenge` path. A future challenge policy must
freeze bond amount, payer, fee cap, return/slash behavior, active-case limit and
terminal disposition in a new policy version.

## 10. Judge settlement, slash and reward accounting

Every enrolled Judge case settles exactly once, including cases with zero
slash, zero winners or zero rounded reward. Root, retry and appeal cases have
distinct settlement identities.

For a substantive final ruling only:

```text
Slash_j = floor(minoritySlashBps * lockedStake_j / 10_000)
           when Vote_j != FinalRuling
Slash_j = 0 otherwise
```

Slash MUST never exceed locked case stake. A protocol failure has no
substantive minority and therefore no minority slash.

The total slash is distributed only to valid Judges aligned with the final
ruling. For `W` aligned winners:

```text
baseReward = floor(totalSlash / W)
dust       = totalSlash - (baseReward * W)
```

Every aligned winner receives `baseReward`. The first `dust` aligned winners
in canonical Judge order receive one additional unit. Admin, backend and
Creator cannot claim residual dust.

Judge stake and Judge reward ledgers are separate from campaign contribution
escrow. A reward claim is pull-based, belongs only to the entitled Judge and
cannot spend a campaign payout or refund pool.

Settlement MUST be atomic:

1. reject an already settled case;
2. calculate slash and winner totals;
3. settle each enrolled Judge in `JuryRegistry`;
4. record reward accounting, including zero reward;
5. mark the case settled;
6. emit the settlement event.

If any registry settlement fails, the whole transaction reverts with all
settlement flags unchanged so the canonical transition can be retried.

## 11. Payout, refund and conservation

### 11.1 Milestone payout

Any caller may call `payMilestone` only when all guards hold:

- funding is successful;
- the exact evidence revision has a canonical `FINAL_PASS`;
- the appeal window and any configured finality conditions have ended;
- the milestone has not already been paid;
- the payout amount equals the frozen milestone budget;
- the campaign is not terminal or refunding;
- escrow has sufficient MockUSDC;
- the Creator payout wallet is the wallet frozen in the campaign commitment.

The contract MUST not trust a submitted transaction, database row, upload flag
or backend approval as payout authorization. Failed token transfers revert the
entire transition.

### 11.2 Terminal transitions

Terminal failure occurs after a creator submission timeout, correction timeout,
final `PROTOCOL_FAIL` or another explicitly frozen terminal guard. A terminal
transition MUST:

1. stop new funding, evidence submission, payout and review openings;
2. close existing cases through bounded retry/timeout behavior;
3. settle already-earned immutable obligations under the case policy;
4. freeze the exact remaining campaign escrow and contribution snapshot;
5. open pull-based Backer refund entitlements.

No new discretionary expenditure may be introduced after terminal state.

### 11.3 Conservation

For every campaign:

```text
R = total confirmed contributions
P = successful Creator milestone payouts
F = successful Backer refunds
E = remaining campaign contribution escrow

R = P + F + E
P <= fundingGoal
sum(each milestone payout) <= fundingGoal
```

Judge stake, appeal bonds and Judge reward/slash pools are separate identities.
There is no `Q` review-fee term in this local campaign invariant because the
local service fee is zero and no review reserve is funded from Backer escrow.

### 11.4 Refund allocation

At `openRefunds`, the contract MUST record:

- terminal reason;
- `refundPool = currentEscrow`;
- `refundSnapshot = totalCanonicalContribution`;
- contributor order based on first canonical contribution;
- deterministic prefix contribution values.

For contributor `i`:

```text
claimable_i = floor(refundPool * prefix_i / refundSnapshot)
             - floor(refundPool * prefix_previous / refundSnapshot)
```

This guarantees:

```text
sum(all entitlements) == refundPool
claimed + unclaimed == refundPool
```

Claim order cannot change the result. A zero-token entitlement is still
recorded exactly once. A second claim or a claim by another wallet reverts.
Unclaimed entitlements do not expire or become Admin, Creator or platform
property.

Funding failure refunds the full canonical contribution because no milestone
payout has occurred. A partial terminal failure refunds only the remaining
escrow after successful, immutable payouts.

## 12. PDF access and authentication

Account authentication is wallet-only SIWE. The browser requests a nonce, the
wallet signs the domain/chain-bound message, and the backend verifies the
signature before creating or resolving the wallet-owned session. The backend
never receives a private key, and authentication does not prove one-human-one-
wallet identity.

The access gateway may issue a private PDF URL only when its read model or
direct canonical read confirms:

- the campaign is `COMPLETED`;
- the requesting wallet has a canonical positive contribution;
- the final PDF commitment matches the stored bytes;
- the bytes are currently available to serve.

Access is not a contract-held NFT, is not transferable, does not create a new
financial claim and is separate from a Backer's refund entitlement. Under this
exact-budget local policy, successful completion pays every frozen milestone
and therefore leaves no completion surplus to refund. The separation remains
explicit so a future compatible policy cannot silently revoke access merely
because it introduces a residual refund pool.

The gateway MUST fail closed when the canonical completion or contribution
condition is absent. Backend availability or stale indexer data MUST never
authorize a financial transition.

## 13. Canonical events and persistent indexer

Every financial or review transition MUST emit a canonical event containing the
campaign/case/revision identifiers needed for deterministic projection.

Minimum event groups:

| Group | Events |
| --- | --- |
| Campaign | `CampaignCreated`, `PublicationEvidenceSubmitted`, `PublicationFinalized`, `ContributionReceived`, `FundingFinalized`, `CampaignCompleted`, `CampaignRefundsOpened` |
| Milestone | `MilestoneActivated`, `MilestoneEvidenceSubmitted`, `MilestoneRevisionSubmitted`, `MilestonePaid` |
| Review | `ReviewCaseCreated`, `JudgeEnrolled`, `JurySnapshotFinalized`, `CourtAssigned`, `VoteCommitted`, `VoteRevealed`, `CourtFinalized`, `ReviewRoundFinalized`, `ReviewRetryOpened`, `AppealOpened`, `FinalRulingEstablished`, `ReviewCaseSettled` |
| Judge ledger | `CaseStakeReserved`, `UnenrolledCaseStakeReleased`, `CaseStakeSettled`, `JudgeSlashed`, `JudgeRewardAccrued`, `JudgeRewardClaimed` |
| Refund | `BackerRefundClaimed` |

The persistent event identity MUST include:

```text
chainId
contractAddress
transactionHash
logIndex
```

For each canonical log, one database transaction MUST:

1. insert the event identity;
2. apply the event-specific projection only if the insert is new;
3. update the stream checkpoint;
4. commit all writes together.

A duplicate delivery MUST not increment additive fields again. A crash before
commit must leave no partial projection or checkpoint. A crash after commit
must allow replay to skip the already-applied event.

The stream identity MUST include chain ID, escrow/contract address and local
genesis identity. Reorganization handling must not use block number alone; the
indexer must follow the configured confirmation/replay policy and expose stale
or incomplete projections without synthesizing payout, refund, completion or
review outcome.

## 14. Required transition table

Every implementation transition must document actor, guard, state write, fund
movement, event, replay guard, failure behavior and postcondition.

| Transition | Caller | Required guard | Result |
| --- | --- | --- | --- |
| `createCampaign` | Any wallet | Exact budget sum and valid commitment | Immutable proposal |
| `createPublicationCase` | Creator/protocol flow | Frozen proposal and policy identity | Publication case |
| `finalizePublicationCase` | Permissionless | Valid court finality | Publication approved/rejected |
| `finalizeFunding` | Permissionless | Deadline elapsed and exact goal/failure state | Milestones or refund |
| `submitMilestoneEvidence` | Creator | Active milestone, before deadline | New revision and base case |
| `expireMilestoneSubmission` | Permissionless | Active deadline expired | Terminal refund path |
| `reserveCaseStake` | Judge | Registered open case and sufficient stake | Reserved case stake |
| `releaseUnenrolledCaseStake` | Permissionless | Enrollment closed, not enrolled | Available stake restored |
| `finalizeSnapshot` | Permissionless | Enrollment closed, valid seed | Frozen permutation |
| `assignCourt` | Permissionless | Snapshot finalized, court unassigned | Determined seats materialized |
| `commitVote` / `revealVote` | Assigned Judge | Correct phase and binding | Canonical vote lifecycle |
| `openRetry` | Permissionless | Explicit `RETRY_ELIGIBLE` | Retry case or protocol failure |
| `openAppeal` | Eligible Backer/Creator | Substantive result, window, bond | New appeal case |
| `finalizeRuling` | Permissionless | Review/appeal finality conditions | Final result |
| `settleCase` | Permissionless | Final case and not settled | Exactly-once Judge settlement |
| `payMilestone` | Permissionless | Final pass and all payout guards | Exact one-time payout |
| `openRefunds` | Permissionless | Terminal campaign state | Frozen refund pool |
| `claimRefund` | Entitled Backer | Frozen entitlement and unclaimed | Exact one-time transfer |

## 15. Invariants and failure behavior

The implementation MUST test at least:

- no unauthorized escrow release;
- no Resolver/Admin/backend financial authority;
- exact milestone budget and no overfunding;
- no payout above a frozen milestone budget;
- no double payout;
- no double refund;
- no double case settlement;
- no duplicate Judge seat;
- no Creator or conflicted Backer Judge assignment;
- no unassigned vote;
- one vote per assigned Judge;
- all-three-reveal court validity;
- invalid court and tie never become substantive FAIL;
- valid substantive result cannot enter retry;
- retry eventually reaches a caller-triggerable terminal path;
- case stake never exceeds deposited stake;
- abandoned reservation can be recovered before enrollment;
- settled stake cannot become locked again;
- slash never exceeds locked stake;
- `R = P + F + E`;
- refund entitlements exactly equal the snapshot refund pool;
- claim order cannot change refund entitlement;
- failed token transfers revert state and accounting;
- access is denied without canonical completion/contribution;
- indexer replay is idempotent;
- malformed or non-canonical events do not advance the checkpoint.

The protocol MUST fail closed when:

- a valid final PASS is absent;
- the evidence revision does not match the case;
- assignment is duplicate or non-unique;
- a Judge has not locked required stake;
- appeal finality has not passed;
- escrow or refund pool is insufficient;
- token transfer fails;
- duplicate payout, refund or settlement is attempted;
- the indexer event is malformed or non-canonical.

No backend outage, missing UI page, stale projection or pending wallet
transaction may authorize fund movement.

## 16. Implementation acceptance gates

Implementation is not accepted merely because the document exists or a subset
of unit tests passes. The following gates are required in order:

1. Policy identity and deployment manifest agree on policy version, chain,
   token, decimals, court cap and timing values.
2. Contract unit tests cover creation, publication, funding deadline behavior,
   exact budget, contribution cap, stake reservation, snapshot, assignment,
   commit–reveal, appeal, correction, payout, refund and failed transfer.
3. Fuzz/invariant tests cover conservation, uniqueness, stake coverage,
   settlement and terminal liveness.
4. Persistent indexer tests replay real event payloads through the transactional
   database boundary, including duplicate delivery and crash-before-commit.
5. API tests prove SIWE wallet ownership and prove no database mutation creates
   a financial or review result.
6. Frontend tests distinguish submitted, mined, canonical and indexed states;
   no UI label treats submission as financial success.
7. A fresh disposable runtime seeds separate Creator, Backer and Judge wallets,
   completes one payout flow, one timeout/protocol-failure flow and all refund
   claims, then reconciles contract balances, canonical events and PostgreSQL
   projections.
8. The release report records unavailable tools, skipped scenarios and
   remaining local limitations. Unexecuted checks are not reported as passing.

## 17. Explicit non-goals and future policy gates

This policy does not implement or authorize:

- NFT minting, transferability or resale;
- generic multi-product access integrations;
- open funding after the goal or overfunding surplus;
- campaign-funded review reserve or paid service-fee market;
- paid challenge or pooled objection;
- public randomness provider;
- public-chain or real-money custody;
- physical fulfilment, shipping or inventory;
- centralized Resolver fallback;
- backend custody or backend-selected outcomes;
- claims that stake, hashes or majority prove real-world truth.

Before any public or real-asset deployment, a new policy version must specify
and verify production randomness, reviewer fee funding, non-reveal economics,
challenge economics, evidence availability guarantees, large-snapshot gas
limits, independent contract audit and the final release decision.

## 18. Definition of done for this specification

This specification is ready to hand to an implementation-plan phase when:

- the local policy version and product boundary are explicit;
- no active section assumes NFT, open funding or overfunding;
- every financial transition has an actor, guard, postcondition, event and
  failure path;
- campaign escrow and Judge ledgers are separate;
- court validity, retry, appeal and protocol failure are distinct;
- refund allocation is deterministic and total-conserving;
- backend/indexer authority boundaries are explicit;
- acceptance criteria distinguish documentation, tests, build, runtime and
  public-chain claims.

The document itself is documentation/design evidence only. It does not claim
that the implementation, tests, builds or runtime acceptance have already
passed.
