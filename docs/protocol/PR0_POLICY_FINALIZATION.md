# FundTogether VNext PR0 — Policy Finalization

> **Policy package:** `fundtogether-vnext-v2-pr0-policy-20261025`
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
participation = W_cast / W_total
```

`floor_sqrt` is integer-only. It is quadratic voting because buying `w` units
of influence costs `w²` contribution units; contribution is the only source
of the voting budget. Each wallet has one ballot, and wallet splitting remains
an accepted Sybil limitation rather than an unclaimed anti-splitting property.

The proposed decision rule is:

1. snapshot contributions when the DAO window opens;
2. reject a second ballot from the same wallet or a wallet disallowed by the
   same-case Judge conflict rule;
3. require `participation >= daoParticipationThresholdBps` using effective
   weights;
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

## O3 — Court Reset count and non-voting Judge cost

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** `CR-1`

An invalid court has a separate `resetId`; it never increments the Court 2
appeal allowance and never creates a substantive verdict. A review case may
use at most one reset for Court 1 and at most one reset for Court 2. Once the
case-level reset cap is exhausted, the next invalid/timeout path is
`PROTOCOL_FAIL`.

For every assigned Judge who misses a required commit or reveal:

```text
penalty_i = min(lockedCaseStake_i,
                max(1 base unit, floor(lockedCaseStake_i × 1000 / 10000)))
```

The penalty is charged from that Judge's locked case stake. Non-offending
Judges have their remaining locked stake released under the normal settlement
rule. Multiple offenders are charged independently; their penalties are added
to the reset compensation pool, so no invented split can exceed any Judge's
locked collateral. Replacement selection excludes every Judge already used by
the case and is unique within the replacement court.

**Approval still required:** `CR-1`, the two-reset cap, the 10% penalty rate,
and the compensation recipient/claim rule.

## O4 — Funding the Court Reset cost

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** stake-only compensation

Reset penalties are the only inflow to `resetCompensationPool`. The milestone
contribution escrow and the frozen valid-court review reserve never fund a
reset. Replacement Judges may claim only the pool balance actually created by
offending locked stake; a zero or insufficient pool creates no hidden debt and
does not permit a creator or Backer charge. The pool is tracked separately
from `JudgePaid_m` and `Raised_m`.

**Approval still required:** whether the pool pays replacement Judge service,
reset execution gas subsidy, or remains a bounded burn/treasury sink. The
choice must preserve the stake-only source and conservation identities.

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
service rewards and explicit reset-pool accounting. An invalid Court 1 follows
the same cap and never opens the DAO.

**Approval still required:** whether a Court 2 protocol failure immediately
terminates the milestone or permits the separately versioned correction path.

## O7 — Same-case Judge participation in BackerDAO

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** disallow

Any wallet assigned to Court 1 or Court 2 for the case is ineligible to vote
in that case's BackerDAO. The contract rejects the ballot; it is not treated as
an abstention and cannot change the participation denominator. This preserves
the locked same-case conflict boundary without changing the two-choice DAO
model.

**Approval still required:** confirmation that the exclusion applies to all
assigned seats, including a Judge from an invalid/reset court.

## O8 — Publication reward funding

**Status:** `PROPOSED_PENDING_APPROVAL`
**Recommended policy:** zero local publication reward

`PUBLICATION_PRE_FUND_V1` has `publicationRewardRateBps = 0` and creates no
milestone reserve. A non-zero publication reward would require creator
prefunding or an external subsidy pool with its own identity, custody and
conservation rules; it cannot be charged to nonexistent Backer contributions.
Such a policy is a new version, not an implementation detail of V2.

**Approval still required:** whether a future release should add a separately
prefunded publication pool; PR1–PR4 assume the zero-reward boundary.

## Conflict resolutions recorded by PR0

| Conflict | PR0 resolution |
| --- | --- |
| V2-L11 provisionally assumes DAO quorum while O1 requires a threshold | Keep quorum/threshold as an explicit pending parameter; PR4 cannot implement the DAO until it is approved. The safe default for a tie or unmet threshold is `ACCEPT`. |
| V2 gives a valid-court reserve but O3/O4 require reset compensation | Valid-court rewards use `maxReviewReserve`; reset compensation uses only offending locked stake and a separate pool. |
| V2 says reset is not an appeal but did not bound retries | One reset per Court 1 and one per Court 2; further invalidity is `PROTOCOL_FAIL`. |
| V2 describes unused reserve as refundable but warns against double counting | Refunds are calculated after creator and Judge payments from the remaining escrow balance; an unused reserve is not added a second time. |
| Publication is mentioned as an optional gate but no electorate exists | Publication is explicitly pre-funding, Court 1 only, no BackerDAO and zero local reward. |
| Existing VNext contracts have incompatible storage/economics | V2 remains a new deployment identity; no migration or reinterpretation is authorized by PR0. |

## Approval gate

PR1 may proceed only after the protocol owner records approval for O1–O4 and
the publication boundary O2/O8. PR4 additionally requires O5–O7. Until then,
the registry and vectors are design-review artifacts only.
