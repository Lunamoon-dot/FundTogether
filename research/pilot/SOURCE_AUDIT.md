# PILOT-01 source audit

This note records the repository-owned inputs for the Python validation pilot at
source SHA `4ef5bd71645e83609cb98226b94e69b98c3c166e`. It is a source audit, not a
policy approval, runtime claim, or executed Foundry result.

## Authority and versions

- The scientific protocol permits a validation-only pilot but keeps confirmatory
  Monte Carlo blocked. The pilot must validate the generator, keyed replay,
  `a`/`rho`, all three signal classes, outcome classification, and deterministic
  H3a/H4a vectors (`docs/research/VNEXT_RESEARCH_READINESS_REPORT.md:340-350`).
- The primary Judge model is shared-case Beta-Bernoulli. For `0 < rho < 1`,
  `alpha = a * (1/rho - 1)` and `beta = (1-a) * (1/rho - 1)`; `rho = 0` is an
  independent Bernoulli boundary. Court 1 and Court 2 share the case latent and
  have no Court 2 quality bonus
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:114-151`).
- Identity-keyed streams are required; the source protocol names the minimum
  domains and requires stable case/Judge/Backer/court/attempt/seat identities
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:326-364`).
- Candidate policy version:
  `fundtogether-vnext-v2-pr0-remediation-20261025`; commitment schema:
  `FTV2-COMMIT-2` (`docs/protocol/parameters-v2-policy.md:3-18`). The policy is
  `PROPOSED_PENDING_APPROVAL`, except the explicitly listed locked parameters
  (`docs/protocol/parameters-v2-policy.md:69-127`).
- Fixture identities are not production identities. PR3 uses
  `keccak256("fundtogether-vnext-v2-pr3-court-reset-fixture")` and policy
  `keccak256("CCPS-1")`; PR4 uses policy
  `keccak256("CWQ-1/DAO-TEMPORAL-1")`
  (`contracts/test/fixtures/V2CourtResetFixture.sol:109-118`,
  `contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol:12-22`).
- The repository has no Python research/simulation package or Python project
  manifest. Its only Python files are Anvil/backend helper scripts under
  `backend/scripts/`; they do not implement this model and should not be reused
  as scientific infrastructure.

## CWQ-1 rules to reproduce

The exact candidate rule is:

```text
wallet_weight = floor_sqrt(snapshot_contribution)
cast_weight = accept_weight + appeal_weight
threshold_met = cast_weight * 10_000 >= total_eligible_weight * 2_000

if total_eligible_weight == 0: ACCEPT
else if not threshold_met: ACCEPT
else if appeal_weight <= accept_weight: ACCEPT
else: APPEAL
```

These rules come from `docs/protocol/PR0_POLICY_FINALIZATION.md:25-69` and the
fixture implementation at
`contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol:411-423`.

- Use integer square root only. The contribution snapshot is immutable at DAO
  open; later contributions do not count. Each eligible wallet has one ballot
  (`docs/protocol/parameters-v2-policy.md:208-220`).
- The per-wallet contribution cap is `uint128_max`; weights and threshold
  products use checked `uint256` arithmetic. Over-cap and overflow reject rather
  than wrap (`docs/protocol/parameters-v2-policy.md:148-157`,
  `contracts/test/unit/VNext/V2BackerDaoCourt2Fixture.t.sol:176-199`).
- Threshold equality is inclusive. Zero electorate, zero effective weight,
  below-threshold participation, and a tie all result in `ACCEPT`
  (`docs/protocol/parameters-v2-policy.md:235-239`,
  `contracts/test/fuzz/V2BackerDaoCourt2Fixture.t.sol:21-35`).
- DAO eligibility excludes all Court 1 assignees known at open, including
  invalid/replacement attempts; the excluded contributions remain escrow/refund
  balances but are omitted from the DAO denominator. A second ballot and an
  ineligible ballot reject without changing the snapshot
  (`docs/protocol/PR0_POLICY_FINALIZATION.md:52-66,218-245`,
  `contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol:218-235,251-270`).
- Court 2 can open only after finalized `APPEAL`. It excludes the creator, every
  prior same-case/Court 1 assignee, and every wallet that cast a valid DAO
  ballot, whether ACCEPT or APPEAL. Court 2 assignment or replacement cannot
  edit prior eligibility, ballots, weights, or decision
  (`docs/protocol/parameters-v2-policy.md:247-265`,
  `contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol:399-408`).

### Q6 exact vector

Source: `docs/protocol/parameters-v2-policy.md:222-233` and
`contracts/test/unit/VNext/V2BackerDaoCourt2Fixture.t.sol:121-140`.

```text
scenario_id: Q6
unsplit distribution: [9_000_000]
unsplit choices: [APPEAL]
unsplit weight: 3_000

split distribution: nine wallets, each 1_000_000
split choices: nine APPEAL ballots
split weight: 9_000

total contribution before: 9_000_000
total contribution after:  9_000_000
result: wallet splitting triples CWQ-1 weight without adding capital
```

Q6 itself is a weight-amplification vector; Q10 is the outcome-flip vector.

### Q10 exact vector

Source: `docs/protocol/parameters-v2-policy.md:229-243` and
`contracts/test/unit/VNext/V2BackerDaoCourt2Fixture.t.sol:201-232`.

```text
scenario_id: Q10
opponent: one ACCEPT wallet with 16_000_000 contribution, weight 4_000

unsplit attacker:
  distribution: one APPEAL wallet with 9_000_000 contribution
  weight: 3_000
  totals: ACCEPT 4_000, APPEAL 3_000
  decision: ACCEPT

split attacker:
  distribution: nine APPEAL wallets, each 1_000_000
  total contribution: 9_000_000 (unchanged)
  weight: 9_000
  totals: ACCEPT 4_000, APPEAL 9_000
  decision: APPEAL
```

All wallets vote in both Q10 forms, so the participation threshold is met. The
result proves a deterministic limitation, not the real-world frequency of an
attack.

## CCPS-1 R3 rules and exact vector

CCPS-1 uses `D = 10`, `F = 3`, `resetCostMax = 2D + F = 23`, and fixture
`caseStakeRequirement = 23`. Each seat must lock
`max(caseStakeRequirement, resetCostMax)`. The values are base-unit fixtures,
not calibrated prices (`docs/protocol/parameters-v2-policy.md:267-310,345-362`).

For `n` procedural offenders:

```text
n == 0: compensation = 0
1 <= n <= 3: compensation = (3 - n) * D + F
q, r = divmod(compensation, n)
penalty by ascending offender address = q + 1 for the first r, otherwise q
```

An offender is an assigned seat missing commit or valid reveal; missing both is
one seat violation. An invalid court earns no service reward. Slash/compensation
is a separate locked-stake ledger and never milestone escrow
(`docs/protocol/PR0_POLICY_FINALIZATION.md:89-144,146-183`).

Exact R3 fixture:

```text
scenario_id: R3
assigned judges: 3
initial deposited stake: 50 per judge
locked stake: 23 per judge
offenders: all 3 judges (none commits/reveals)
gross slash: 3 total
penalties: [1, 1, 1]
compliant-judge compensation: 0
successful finalizer allowance/claim: 3
milestone escrow effect: 0
```

The standard R3 assertions are at
`contracts/test/unit/VNext/V2CourtResetFixture.t.sol:129-145`. The same-actor
control vector is at lines 230-257: one economic actor controls all three Judge
stakes and the finalizer wallet, the finalizer claims all 3 units, controlled
assets after claim equal controlled stake before settlement, and net loss before
gas is exactly zero. Thus fully funded compensation does not imply positive
deterrence cost. This result is only for those exact assumptions.

The fixture implementation calculates and debits this one total, credits `D`
to each compliant seat and `F` once to `msg.sender`, preserves once-only
settlement, and makes claims pull-based
(`contracts/test/fixtures/V2CourtResetFixture.sol:577-669`).

## Workflow semantics the pilot must preserve

- B0: the initial three-Judge court either produces a valid two-of-three
  substantive verdict or `PROTOCOL_FAIL`; no reset/DAO/Court 2
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:46-55`).
- B1: identical initial Court 1 observations as B0; one fresh, non-overlapping
  replacement after invalidity; a second invalid attempt is `PROTOCOL_FAIL`
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:57-66`).
- B2: B1 Court 1 plus generated DAO ballots; only finalized APPEAL opens a fresh
  same-quality Court 2, also with one bounded reset. Invalid courts never become
  substantive FAIL (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:68-86`).
- `FINAL_PASS` and `VERDICT_FAIL` are substantive; `PROTOCOL_FAIL` is procedural.
  Substantive resolution and terminal completion therefore have different
  denominators (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:259-294`).

## Ambiguities and boundaries to keep explicit

- No repository source declares a PILOT-01 `model_version`, Python package
  version, or random-stream algorithm/version. The pilot must introduce and pin
  those identities; it must not present them as an existing approved policy.
- The source protocol's illustrative random domains use
  `judge_case.potential_vote`, `judge.control`, `selection.candidate`, and
  `dao.private_signal`, while the task request names nearby but different
  labels. Domain names are implementation-version inputs; changing a name
  changes the stream and must be recorded, not silently aliased
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:326-356`).
- Stable Judge heterogeneity is explicitly a separate optional logistic
  sensitivity model. It must not be mixed into the primary shared-case
  Beta-Bernoulli calibration (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:153-164`).
- Coordinated non-reveal needs an explicit shared group/attacker latent;
  ordinary non-reveal remains marginal Bernoulli. Colluding Judges follow a
  declared attacker target, but attacker control never changes truth
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:166-170`).
- The full Backer model must generate private signal, participation, preference,
  actual ballot, and finalized decision separately. `alpha_appeal` and
  `beta_appeal` are outputs, not privileged inputs
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:172-203`).
- The three required signal anchors are informative `(0.80, 0.20)`,
  non-informative `(0.50, 0.50)`, and misleading `(0.20, 0.80)`. Negative
  misleading regions must not be discarded
  (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:205-231`).
- PR4's contributor snapshot and Judge selection contain unbounded scans and
  deterministic entropy. They are small-vector research seams, not production
  scalability/randomness evidence
  (`docs/research/VNEXT_PROTOCOL_HARDENING_RFC.md:245-347,349-470`).
- Current Court 1 assignment lacks a fixture-equivalent bounded exhaustion
  transition; T1-B typed recovery is proposed but not implemented. A minimal
  Python smoke workflow must therefore be explicitly versioned and must not be
  called exact Solidity parity
  (`docs/research/VNEXT_PROTOCOL_HARDENING_RFC.md:245-347`).
- All `CWQ-1`, `CCPS-1`, DAO temporal, reward/refund, evidence, and most liveness
  values remain pending. A passing pilot validates implementation of a
  synthetic fixture, not those assumptions, the protocol, or production
  readiness (`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:417-437,517-530`).
