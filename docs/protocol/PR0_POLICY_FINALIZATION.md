# FundTogether VNext PR0 — Policy Finalization

> **Policy package:** `fundtogether-vnext-v2-pr0-remediation-20261025`
>
> **Predecessor:** `fundtogether-vnext-v2-pr0-policy-20261025`. This candidate
> changes policy semantics; it does not rewrite commitments using that identity.
>
> **Scope:** documentation and policy only. This package does not change
> Solidity, ABI, backend, frontend, database, deployment, local chain state or
> existing campaign/review semantics.

This record is the disposition of the V2 Decision Register and O1–O8. It keeps
all locked V2 decisions in force and makes proposed values explicit. A
`PROPOSED_PENDING_APPROVAL` item is a review input and test-vector source; it
does not authorize runtime implementation or financial deployment.

## Decision status

| Status | Meaning |
| --- | --- |
| `LOCKED` | Already decided by the V2 register or the product instructions; PR1–PR4 must preserve it. |
| `PROPOSED_PENDING_APPROVAL` | PR0 supplies a concrete choice, formula, owner and tests, but an explicit policy sign-off is still required before runtime code uses it. |
| `OUT_OF_SCOPE` | The behavior is deliberately excluded from V2 and cannot be reintroduced by implementation convenience. |

## O1 — BackerDAO contribution-weighted quadratic policy

**Status:** `PROPOSED_PENDING_APPROVAL`
**Owner:** protocol/economic policy review before PR4

The two-choice model is unchanged: a contributor chooses exactly `ACCEPT` or
`APPEAL`; the DAO never submits PASS or FAIL. The proposed formula is named
`CWQ-1` (contribution-weighted quadratic):

```text
c_i       = wallet i's confirmed contribution in snapshot token base units
w_i       = floor_sqrt(c_i)                         # effective weight
W_accept  = sum(w_i for ACCEPT ballots)
W_appeal  = sum(w_i for APPEAL ballots)
W_total   = sum(w_i for all eligible snapshot wallets)
W_cast    = W_accept + W_appeal
participation = W_cast / W_total
```

`floor_sqrt` is integer-only. Weight is contribution-based, not identity-based:
at least `w²` contribution units in one wallet are needed for weight `w`.
Each eligible wallet has one ballot. Splitting the same contribution across
wallets can increase both voting weight and the participation denominator.
CWQ-1 does not provide Sybil resistance, and no incentive-compatibility or
collusion-resistance claim has been validated. Q6 and Q10 demonstrate the
split-wallet advantage; designing a new Sybil mechanism is outside this task.

The proposed decision rule is:

1. snapshot contributions and eligible wallets when the DAO window opens,
   applying only conflicts already knowable at that point (O7);
2. reject a second ballot from the same wallet or a wallet disallowed by the
   same-case Judge conflict rule;
3. require `W_cast × 10000 >= W_total × daoParticipationThresholdBps` with
   checked integer arithmetic and effective weights; `W_total = 0` or an
   unmet threshold defaults to `ACCEPT`;
4. choose `APPEAL` only when `W_appeal > W_accept`; otherwise choose `ACCEPT`.

Thus an unmet threshold or an exact tie preserves the Court 1 result. The
threshold, tie rule, snapshot identity, formula version, contribution cap and
overflow bounds are all emitted/committed as policy data. The exact proposed
values and vectors are in `parameters-v2-policy.md`.

**Approval still required:** formula version `CWQ-1`, the participation
threshold, and the default-to-ACCEPT treatment of a tie or unmet threshold.

## O2 — Publication review before a Backer exists

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended boundary:** `PUBLICATION_PRE_FUND_V1`

Publication review is a pre-funding gate. It uses the permissionless Court 1
assignment and commit–reveal rules, with the same creator/conflict exclusions,
but has no BackerDAO electorate and no Court 2 appeal. A valid publication
PASS opens funding; a valid FAIL blocks funding until the bounded correction
policy is satisfied; an invalid court uses the bounded reset policy.

Publication review cannot pay the creator or release milestone escrow. It does
not create a Backer snapshot retroactively. This is a policy boundary, not a
missing UI feature.

**Approval still required:** adoption of `PUBLICATION_PRE_FUND_V1` as the
campaign publication gate and its correction count/deadlines.

## O3 — Cost-Coverage Procedural Slashing and reset limits

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** `CCPS-1`

An invalid court has its own attempt/settlement identity and never creates a
substantive verdict. Allow at most one reset for Court 1 and one for Court 2
(two reselections per case). Invalidity of the replacement at either level is
`PROTOCOL_FAIL`, even if the other level has an unused reset. The last invalid
court is still settled for procedural costs; reaching the cap does not waive
a missed duty. Reset never consumes the Court 2 appeal allowance.

Each court attempt freezes `resetCostMax` and three separate collateral
reservations before assignment. Let `n` count assigned Judges who miss a
required commit or valid reveal. Missing both is one violation per seat.
Classify duties after the original reveal deadline so a timely compliant Judge
is not penalized because another seat was absent.

```text
D = resetDisruptionAllowanceUnits          # fixed per compliant invalid-court seat
F = resetFinalizationAllowanceUnits        # fixed per invalid court, F >= 3 base units
resetCostMax = (3 - 1) × D + F              # worst case: one offender
requiredLockedStake = max(caseStakeRequirement, resetCostMax)

if n == 0:
    totalResetCompensation = 0; penalty_i = 0
else:
    totalResetCompensation = (3 - n) × D + F
    q = floor(totalResetCompensation / n)
    r = totalResetCompensation mod n
    penalty_i = q + (offenderRank_i < r ? 1 : 0)  # offenders only
    penalty_i = 0                               # all other seats
```

`offenderRank_i` is the zero-based rank among offenders by ascending canonical
address. Require checked arithmetic, `D >= 0`, `F >= 3`, and every seat's
`lockedCaseStake_i >= requiredLockedStake` before assignment. This is a
reservation from available stake, not a test of total deposited stake; the
same collateral cannot back two live obligations.

For `1 <= n <= 3`, `totalResetCompensation <= resetCostMax` and every
`penalty_i <= totalResetCompensation <= lockedCaseStake_i`. Thus one offender
covers the full defined liability; two or three offenders split one cost
schedule, without compensating it twice. `F >= 3` ensures every offender pays
at least one base unit. The unsupported default 10% slash is removed.

Penalty debits, funded compensation credits and the once-only settlement flag
are atomic. A compliant Judge gets no procedural slash, regardless of minority
vote; remaining stake unlocks after duty settlement. Replacement selection is
random, unique and excludes every Judge already assigned anywhere in the case.
Each replacement locks fresh sufficient collateral. A timeout with no assigned
offender creates no CCPS claim; no absent wallet or Backer becomes a debtor.

**Approval still required:** `CCPS-1`, D/F amounts, the case stake requirement,
allocation/recipient rules, one reset per level and two per case. Numeric
vectors R1–R10 in the registry are arithmetic fixtures, not calibrated prices.

## O4 — Funding and compensable Court Reset costs

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** stake-only, fully collateralized compensation

The eligible cost schedule is deliberately closed:

| Cost class | CCPS-1 treatment |
| --- | --- |
| Fixed procedural disruption | D to each assigned Judge with a timely valid commit and reveal in the invalid court; this compensates cancelled work, not a valid verdict reward. |
| Fixed invalidation/finalization allowance | F once to the permissionless caller that successfully settles the invalid court. It is a convention, not measurement of actual gas. |
| Verifiable actual costs | A canonical token debit could prove a cost, but this candidate authorizes no variable reimbursement (`actualCostReimbursementCapUnits = 0`). No invoice, receipt or gas-price oracle is consulted. |
| Unprovable losses | Lost profit, delay valuation, reputation, off-chain invoices and claimed actual gas are excluded. No backend or DAO may assess damages. |

Reset penalties are the only inflow to a pool keyed by policy, case and unique
court attempt. Settlement credits exactly `(3 - n) × D` to compliant seats
and F to the successful finalizer, including on terminal invalidity when no
replacement opens. Invalid courts earn zero valid-court service reward. A
replacement that later becomes valid earns the usual reward from the already
frozen valid-court reserve, without an extra reset service payment.

The milestone contribution escrow and valid-court reserve never pay reset
compensation. Compensation is not a creator/Backer refund and is never added
to `Raised_m`, `JudgePaid_m` or the unused reserve. Claims are pull-based,
once per recipient/invalid-court identity, backed by the already debited stake
in the same token. A failed transfer leaves the funded claim retryable; it
does not create debt or block replacement. No residual burn/treasury sink or
uncollateralized promise is introduced.

```text
sum(offender penalty_i) = totalResetCompensation = sum(compensation credits)
ResetSlashCollected = ResetCompensationPaid + ResetCompensationUnclaimed
```

**Approval still required:** cost scope, D/F prices, beneficiary/claim rule,
zero variable-cost cap and collateral validation. These are pending policy
choices; limiting compensation to the schedule is not a claim to cover every
real-world loss.

## O5 — Canonical reasoning and evidence references

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended schema:** `ReviewReferenceV1`

The Judge's reasoning and evidence references remain off-chain bytes. A
canonical serialization contains `policyVersion`, `caseId`, `courtId`,
`resetId`, `milestoneId`, `evidenceRevision`, `acceptanceCriteriaHash`,
`judge`, ordered evidence-reference digests and the reasoning digest. The
serialized bytes are hashed with `keccak256`; the hash is bound to the reveal
event and the case identity. A database row may index the bytes but cannot
replace the event hash or establish a verdict.

**Approval still required:** canonical serialization (JSON/CBOR), disclosure
of private evidence references, and whether Judge signatures are required in
addition to the event sender.

## O6 — Court 2 reset and protocol-failure terminal behavior

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** fail closed after the bounded reset cap

Court 2 uses the exact Court 1 evidence revision and criteria hash. If Court 2
is invalid, it may use its one reset. A further invalid Court 2 is
`PROTOCOL_FAIL`; it cannot open another appeal, create a third court, or pay a
creator. Remaining milestone escrow is refundable after already-earned valid
service rewards; independent, funded reset claims remain in the stake ledger.
An invalid Court 1 follows the same per-level cap and never opens the DAO
until a replacement Court 1 is valid.

**Approval still required:** whether a Court 2 protocol failure immediately
terminates the milestone or permits the separately versioned correction path.

## O7 — Time-ordered DAO/Judge conflicts

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** `DAO-TEMPORAL-1`

The locked business sequence is `Court 1 → BackerDAO → random Court 2`.
Court 2 assignments do not exist while the DAO votes. Court 2 must exclude
Court 1 Judges; that isolation is already locked. The following additional
restrictions remain proposals:

1. At DAO opening, freeze `assignedBeforeDaoOpen` from Court 1 history,
   including invalid attempts and their replacements. Under the proposed
   exclusion, remove these wallets from both eligible ballots and `W_total`.
   Contributions are retained for escrow/refunds. Rejected ballots never
   mutate the frozen denominator.
2. After the DAO closes with APPEAL, freeze the set of **all wallets that cast
   a valid ballot**, whether ACCEPT or APPEAL. Random Court 2 selection and
   its replacement exclude these voters, all Court 1 Judges, the creator and
   any prior case assignee. Non-voting Backers remain eligible subject to the
   existing conflict/stake rules.
3. Assignment never edits past eligibility, votes, weights, the snapshot,
   participation or DAO decision. ACCEPT opens no Court 2. Selection failure
   follows the approved timeout/protocol-failure path, never a retrospective
   invalidation of DAO votes.

**Approval still required:** exclusion of Court 1 assignees (including invalid
attempts) at DAO opening and exclusion of actual DAO voters from Court 2.
Neither new restriction is promoted to `LOCKED` by this remediation.

## O8 — Publication reward funding

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** zero local publication reward

`PUBLICATION_PRE_FUND_V1` has `publicationRewardRateBps = 0` and creates no
milestone reserve. A non-zero publication reward would require creator
prefunding or an external subsidy pool with its own identity, custody and
conservation rules; it cannot be charged to nonexistent Backer contributions.
Such a policy is a new version, not an implementation detail of V2.

**Approval still required:** whether a future release should add a separately
prefunded publication pool; any publication integration needs O2/O8 approval.
This is not an approval dependency for PR1's isolated funding fixture.

## Conflict resolutions recorded by PR0

| Conflict | PR0 resolution |
| --- | --- |
| V2-L11 provisionally assumes DAO quorum while O1 requires a threshold | Keep quorum/threshold as an explicit pending parameter; PR4 cannot implement the DAO until it is approved. The safe default for a tie or unmet threshold is `ACCEPT`. |
| V2 gives a valid-court reserve but O3/O4 require reset compensation | Valid-court rewards use `maxReviewReserve`; reset compensation uses only offending locked stake and a separate pool. |
| V2 says reset is not an appeal but did not bound retries | One reset per Court 1 and one per Court 2; further invalidity is `PROTOCOL_FAIL`. |
| V2 describes unused reserve as refundable but warns against double counting | Refunds are calculated after creator and Judge payments from the remaining escrow balance; an unused reserve is not added a second time. |
| Publication is mentioned as an optional gate but no electorate exists | Publication is explicitly pre-funding, Court 1 only, no BackerDAO and zero local reward. |
| Existing VNext contracts have incompatible storage/economics | V2 remains a new deployment identity; no migration or reinterpretation is authorized by PR0. |

## Approval gates by consuming PR

| PR | Direct policy dependencies | Policies that do not block this slice |
| --- | --- | --- |
| PR1 — milestone funding | Immutable ordered commitments, target, sequential activation, active pointer, deadlines, contribution ledger, exact-target guard and full funding-failure refund. Complete policy identity/commitment schema is required. | O1 DAO values, O3/O4 reset economics and O7 conflicts do not block a Foundry-only funding fixture that does not consume them. |
| PR2 — financial accounting | Approved reward rate/range, denominator/rounding, maximum reserve, creator payout, valid-service accrual, refund allocation/dust and failed-transfer behavior. | DAO vote weights and reset prices are not PR2 inputs; outcome fixtures cannot pretend to be live Court authorization. |
| PR3 — Court Reset | Approved CCPS-1 costs/recipients, locked collateral, reset limits, procedural duties, once-only settlement and O6 terminal policy. | DAO weighting is not a reset calculation input. |
| PR4 — BackerDAO / Court 2 | Approved CWQ-1, snapshot/caps, threshold, zero-electorate/tie rule, time-ordered conflicts and Court 2 random assignment. Integrated Court 2 reset/settlement depends on accepted PR2/PR3. | Publication O2/O8 and evidence schema O5 gate their actual consumers; they are not blanket PR1 prerequisites. |

### Campaign creation and versioning boundary

PR1 can implement/test its smallest slice with a complete, explicit test
manifest under a distinct **Foundry-only funding fixture** identity. It has
no production adoption or user funding authorization. A target reached in that
fixture stays FUNDED; it cannot fabricate a final PASS, payout or M2 activation.
There is no new policy blocker to writing that slice from the locked funding
decisions. This remediation does not start PR1.

Every real V2 campaign freezes the complete economic manifest and its hash at
campaign creation, before any contribution: reward/reserve/payout rules, reset
cost/collateral/caps/recipients, DAO/conflicts, publication and evidence policy,
and all milestone terms. The commitment schema and version rules are in the
registry. No absent field, mutable version alias or placeholder can be filled
in later. Case/DAO snapshots instantiate the already frozen policy; they do
not choose new economics. A changed policy requires a new identity and a new
campaign/deployment, never a retrofit of a funded PR1 fixture.

User-facing funding remains gated by approval and integration of every policy
committed by that campaign, including publication O2/O8 and evidence O5 where
used. Separating implementation PRs does not authorize money to enter an
incomplete settlement implementation.

## REVIEW_REMEDIATION_SUMMARY

| Finding | Remediation | Verification / invariant | Remaining approval |
| --- | --- | --- | --- |
| A: 10% slash did not guarantee coverage | CCPS-1 fixes the eligible cost schedule, reserves each seat for sole-offender liability and splits one compensation total. | R1–R10; slash equals funded credits, no collateral reuse, no contribution/reserve debit, no debt or minority slash. | D/F, cost scope, collateral and recipient rules, reset/terminal limits remain `PROPOSED_PENDING_APPROVAL`. |
| B: future Court 2 assignments could exclude past DAO votes | Freeze Court 1 history at DAO open; select Court 2 only after APPEAL, with proposed actual-voter exclusion. | Temporal acceptance tests; no change to past votes/weights/denominator after assignment. | Both added conflict restrictions remain `PROPOSED_PENDING_APPROVAL`; Court 1/Court 2 isolation is preserved. |
| C: quadratic weight could imply identity/Sybil guarantees | Keep CWQ-1 and Q6; Q10 makes split-wallet advantage change ACCEPT into APPEAL. | Contribution-based weights; no Sybil, incentive-compatibility or collusion-resistance claim. | CWQ-1, threshold and tie/snapshot parameters remain `PROPOSED_PENDING_APPROVAL`. |
| D: unrelated approvals blocked PR1 | Gate each consuming PR and seal full campaign policy identity at creation. | Funding-only fixture cannot pay creator, advance M2 or later acquire new economics. | PR1 fixture has no direct pending policy blocker; full campaign funding still requires complete approved policy/integration. |

PR2 still needs reward/reserve/payout/refund/rounding approval; PR3 still needs
CCPS-1 and bounded procedural/terminal approval; PR4 still needs DAO/conflict/
Court 2 approval. The sequential funding, full milestone declaration,
exact-target guard, Creator-frozen percentage reward, three-Judge courts,
provisional Court 1, ACCEPT/APPEAL, Court 2 reversal, stake-only no-vote
penalty, unused-reserve refunds and M2-after-successful-M1-payout decisions
are preserved. No retrospective alignment bonus, high/low effort, minority
slashing, purchased signal, trusted oracle, Sybil redesign or pool-shortage/
quorum-liveness research is added.
