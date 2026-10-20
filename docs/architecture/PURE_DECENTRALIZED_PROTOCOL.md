# FundTogether — Pure Decentralized Protocol

> **Status:** Current target architecture, decided 2026-10-20.
> **Implementation status:** The VNext contract core and indexed read-only
> surface are partially implemented. The full wallet journeys and fresh local
> runtime have not yet migrated.
>
> **Detailed reference:** [FundTogether VNext Protocol Specification V1](../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)

## 1. Decision

FundTogether is changing from a permissioned Resolver workflow to a protocol in
which review outcomes and financial transitions are decided by permissionless,
stake-backed Judge courts and enforced by the Campaign contract.

There is no Primary Resolver, Backup Resolver, Admin approval, or backend
operator with authority to approve a campaign, accept a milestone, release
funds, resolve a challenge, or open a refund. Admin and backend surfaces may
operate infrastructure and display projections, but they do not own protocol
authority or token custody.

The protocol accepts the risks of Sybil identities, collusion, bribery,
incorrect majority decisions, inactive Judges and adversarial evidence. Those
risks are part of the decentralized design and must be made visible in the
policy and evaluation; they are not silently replaced with a trusted reviewer.

This is a **stake-backed jury protocol**, not a claim that stake proves the
truth of off-chain evidence.

## 2. Product boundary

The product remains deliberately narrow:

- independent digital comics and artbooks (COMICS_ARTBOOK);
- one fixed-price STANDARD tier;
- one private DIGITAL_DOWNLOAD PDF;
- MockUSDC escrow on local chain 31339 during the pilot;
- sequential production milestones;
- evidence review before each milestone payout;
- permissionless challenges and refunds;
- no physical fulfilment, shipping, inventory, NFT or charity workflow.

Any wallet may create a campaign proposal. Creating a proposal does not itself
move funds or make the campaign pledgeable. The creator must commit valid terms,
the campaign must have a canonical publication review result, and the contract
must expose the campaign FUNDING state before backers can pledge.

## 3. Roles and authority

| Actor | Protocol authority | Explicit limitation |
| --- | --- | --- |
| Creator | Create a proposal, freeze terms, submit milestone evidence and request the next protocol action | Cannot approve their own evidence or bypass a court decision |
| Backer | Pledge, participate in eligible challenges, claim their own refund and inspect canonical state | A pledge does not automatically create Judge authority |
| Judge | Lock stake, receive a court seat and cast one vote for the assigned case | Cannot vote twice, vote after the deadline or decide another case without assignment |
| Permissionless caller | Trigger an eligible timeout, finalization, payout or refund transaction | Cannot redirect another wallet's claim |
| Backend/indexer | Validate input, store files, index events and serve projections | Cannot create financial truth from a database row or choose an outcome |
| Admin/operator | Maintain infrastructure and read operational health | Cannot approve, reject, release, refund or override protocol state |

Wallet login through SIWE proves control of an account key. It is an
authentication boundary, not a centralized review authority and not proof that
one wallet represents one human.

## 4. State machine

    DRAFT
      ↓ creator freezes a commitment
    PUBLICATION_REVIEW_OPEN
      ├── provisional PASS → APPEAL_WINDOW → FINAL_PASS → FUNDING
      ├── provisional FAIL → APPEAL_WINDOW → VERDICT_FAIL → CORRECTION / terminal
      └── INVALID/TIED/NO_QUORUM → retry / PROTOCOL_FAIL

    FUNDING
      ├── deadline + goal not reached → REFUNDING
      └── goal reached → MILESTONE_ACTIVE

    MILESTONE_ACTIVE
      ↓ creator submits evidence hash and dossier
    EVIDENCE_REVIEW_OPEN
      ├── provisional PASS → APPEAL_WINDOW → FINAL_PASS → CHALLENGE_WINDOW → MILESTONE_RELEASED
      ├── provisional FAIL → APPEAL_WINDOW → VERDICT_FAIL → CORRECTION or REFUNDING
      └── INVALID/TIED/NO_QUORUM → retry / PROTOCOL_FAIL

    MILESTONE_RELEASED
      ├── more milestones → NEXT_MILESTONE_ACTIVE
      └── final milestone → COMPLETION_REVIEW / SETTLED

    Any eligible failure, cancellation or upheld challenge → REFUNDING

FUNDING means that backers may pledge. It does not mean the creator has
received funds. A campaign's raised balance stays in escrow until the relevant
milestone has passed its Judge review and any configured challenge window.

## 5. Judge court model

Each review round creates a case for one decision: publication, a milestone,
completion or a challenge. The first court has three Judges and resolves by
two-of-three majority:

    3 assigned Judges
      ├── 2 PASS + 1 FAIL → PASS
      ├── 2 FAIL + 1 PASS → FAIL
      └── no quorum        → NO_QUORUM

The VNext contract slice opens `K = floor(N / 3)` courts for the frozen
snapshot, assigns `3K` unique Judges, and aggregates court results by strict
majority. The local policy freezes this all-court mode. The aggregation rule is
contract state, not a UI/backend inference; production gas and batch limits
remain separate acceptance gates.

Required invariants for every court:

- the court has exactly three unique assigned Judge addresses;
- the Creator is excluded from their own case;
- a Judge must lock the required stake before assignment or voting;
- each assigned Judge has one vote for that case;
- voting power is one vote per seat unless a later policy explicitly changes it;
- the contract records assignment, vote, resolution and timeout events;
- a database approval cannot substitute for a canonical case result.

The protocol does not assume that a minority vote is dishonest. Stake return,
review reward and slashing rules are separate economic policy decisions and must
be specified before they are implemented.

### 5.1. Eligibility and stake

Judge participation requires case enrollment, opt-in, conflict eligibility and
case stake locked before the snapshot. The reference policy uses a risk-adjusted
minimum:

    S_min(m) = max(S_0, alpha_risk(m) * milestonePayout(m))

Stake is one seat's collateral, not voting weight. Deposited stake is split into
available and locked balances, and a wallet cannot reserve more case stake than
its deposited balance. Backer status does not automatically create Judge power;
a Backer may become a Judge only after satisfying the same enrollment and
conflict rules.

### 5.2. Snapshot and court formation

When enrollment closes, the protocol freezes eligible addresses, locked case
stake, pool identity, snapshot block and randomness identifier. With `N` eligible
Judges, the local VNext policy opens `K = floor(N / 3)` courts using `3K`
Judges. The contract assigns these courts one permissionless call at a time;
bounded batching/pull settlement remains required before large public
deployments so a large number of courts does not require an unbounded loop.

Randomness must not be selected unilaterally by the backend. A court has exactly
three unique addresses; an unassigned Judge is not slashed.

### 5.3. Commit–reveal and finality

Each vote commitment binds chain, protocol version, campaign, milestone,
evidence revision, case, round, court, Judge address, vote and salt. Plaintext
votes are not accepted during commit. Reveal must match the commitment and the
assigned Judge.

The detailed V1 reference treats a court as invalid unless all three assigned
Judges reveal on time. Invalid courts and ties go to the frozen retry/timeout
path; they are not silently converted into PASS or substantive FAIL.

The protocol distinguishes:

- `FINAL_PASS`: substantive PASS after the appeal window is closed;
- `VERDICT_FAIL`: substantive FAIL after the appeal window is closed;
- `PROTOCOL_FAIL`: no valid substantive ruling after retry/timeout limits.

Only the first two can trigger coherence slashing. `PROTOCOL_FAIL` is an
operational failure and must not be described as proof that the Creator failed.

### 5.4. Appeal isolation

Base and Appeal pools are separate for a case. A Judge from Base cannot review
that case's Appeal, and a Judge from one Appeal round cannot review the next
Appeal round for the same case. An accepted appeal opens a new review; it does
not itself reverse the verdict. Appeal count, bond, fee and retry limits must be
frozen before the case begins.

## 6. Milestone payout rule

Each milestone freezes a deliverable, evidence commitment and maximum payout.
The creator must submit the evidence before the court can review it.

    Creator submits evidence
      → evidence hash is anchored
      → three Judges review the same commitment
      → two-of-three PASS
      → challenge window expires without an upheld challenge
      → creator or permissionless caller executes the exact milestone payout

The contract must reject:

- payout before the corresponding case is canonically PASS;
- payout above the frozen milestone budget;
- payout for a later milestone while an earlier milestone is unresolved;
- payout twice for one milestone;
- a backend-only or wallet-submission-only payout claim.

If a milestone fails, the policy must provide a correction path or a refund
path. If a court cannot reach quorum, the protocol must not silently treat the
case as PASS; it follows the explicit retry or timeout rule.

The correction path may create a new evidence revision and review-case identity,
but it cannot change the original acceptance criteria or payout amount. A
`VERDICT_FAIL` can lead to correction while correction allowance remains;
`PROTOCOL_FAIL` follows the terminal failure policy and must not create unlimited
resubmissions.

## 7. Source-of-truth boundaries

    Creator / Judge wallet
            ↓ signed transaction
    Campaign contract
            ↓ canonical event
    Idempotent indexer
            ↓ projection
    PostgreSQL / API
            ↓ read model
    React UI

| Data | Source of truth |
| --- | --- |
| Escrow balance, milestone state, Judge stake, votes, quorum, payout, refund | Campaign contract |
| Campaign text, review reasoning, account metadata and search fields | PostgreSQL |
| Evidence bytes and private PDF | MinIO/object storage |
| Evidence integrity reference | Hash committed by the protocol; bytes remain off-chain |
| UI status and recovery state | Derived projection; never a financial authority |

Evidence hashes prove that the reviewed bytes have not changed. They do not
prove authorship, quality, delivery, legality or real-world truth.

## 8. Fund safety invariants

For every campaign:

1. Pledged MockUSDC enters the campaign escrow through the contract.
2. Only a contract state transition can move escrowed funds.
3. A milestone payout is bounded by its frozen budget and executed once.
4. A refund claim belongs to the eligible Backer's canonical contribution.
5. Failed token transfers revert the state change and remain retryable.
6. Every financial transition emits an event and is idempotently indexed.
7. Accepted pledges equal escrowed funds plus completed payouts plus refunds,
   subject only to explicitly defined fees or surplus rules.

For a campaign with received contributions `R`, successful payout `P`,
successful refund `F` and remaining escrow `E`, the stronger conservation rule
is:

    R = P + F + E

The contract must also enforce `P <= Goal`, one payout per milestone, and refund
rights no greater than the refund pool snapshot. If a campaign fails before any
payout, the Backer refund is the full canonical contribution. After partial
payout, remaining escrow is distributed pro-rata from a fixed snapshot; payout
already made is not automatically reversible.

The backend never holds a private key capable of moving campaign funds.

## 9. Migration and implementation order

The current repository contains a verified pre-reset Resolver implementation
plus a partially implemented VNext contract, projection and read-only UI
slice. Its existing tests and runtime evidence are evidence only for the named
slices and do not prove that the full protocol has been deployed or accepted
end to end.

The new implementation order is:

1. Threat model and decentralized financial policy.
2. Campaign, Judge, appeal and court state machines with I1–I10 invariants.
3. Versioned local economic parameters: stake, fee, randomness, no-quorum,
   appeal, slash/reward, correction and multi-court aggregation.
4. Single-campaign contract with publication, milestone, challenge, payout and
   refund cases.
5. Foundry unit, fuzz and invariant tests.
6. Idempotent indexer and PostgreSQL projections.
7. Evidence availability, Judge dossier permissions and revision identity.
8. Creator, Backer and Judge vertical journeys.
9. Disposable local-chain end-to-end acceptance and runtime identity check.

No existing Resolver path should be silently treated as the new protocol. Old
contracts, plans and manual tests are retained for historical comparison until
the new contract and runtime are verified.
