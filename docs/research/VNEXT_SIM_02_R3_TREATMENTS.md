# SIM-02 R3 adversarial treatment contract

**Status:** design-stage reproducibility contract; no adversarial experiment has
been run.  
**Design revision:** `sim-02-prereg-v2`  
**Treatment version:** `sim-02-r3-dgp-v1`  
**Evidence boundary:** synthetic treatment definitions and Foundry-only fixture
semantics; not production protocol behavior or real-world attack rates.

R3 is a mandatory falsification region. It is not an additional positive-claim
family, and no R3 p-value is entered into the R1/R2 Holm correction. A treatment
can reject or restrict a B2 recommendation without becoming evidence that B2
is beneficial elsewhere.

## Common contract

### Attacker boundary

The simulator's oracle may use `truth` and Court-1 correctness to score an
attack, but an attacker agent may use only the fields listed under
`attacker_observations`. Truth, the latent case difficulty, and Court-1
correctness are never exposed to an attacker. A controlled identity is a
wallet label in the synthetic population, not a human identity claim.

All unapproved values below are `PENDING_OWNER_APPROVAL`. Fixture values are
copied as arithmetic test vectors only; their presence does not approve a
runtime economic parameter.

The permitted `attacker_observations` are the attacker's controlled wallet
identities, public assignment/eligibility events, public deadlines and policy
version, its own contribution/stake/budget, and any private signal explicitly
generated for that wallet. It cannot observe another wallet's private signal,
the oracle truth, Court-1 correctness, latent difficulty, or a hidden Judge
quality draw.

### Randomness domains

Every treatment uses the fixed keyed stream contract
`blake2b-256-numpy-pcg64dxsm-v1`, master seed `20261028`, and canonical sorted
JSON labels. The treatment-specific domains are:

```text
r3a.controlled_group_trigger
r3a.honest_nonreveal
r3a.assignment
r3b.private_signal
r3b.participation
r3b.coordination
r3c.assignment
r3c.vote_target
r3d.wallet_split
r3e.settlement
```

The key includes `design_revision`, `treatment_version`, `region_id`,
`base_case_id`, `attempt_index`, `court_level`, `wallet_id` or `judge_id` as
applicable, and `draw_index`. Adding a reset or a Court 2 draw therefore cannot
shift B0/B1 paired streams.

### Input schema

Every R3 record consumes:

```text
design_revision, treatment_version, treatment_id, region_id, base_case_id,
truth_oracle_only, evidence_class, policy_version, eligible_judges,
judge_stake_snapshot, court_assignment_history, court_level, attempt_index,
contribution_snapshot, wallet_ownership, attacker_budget,
signal_parameters, random_stream_version
```

`truth_oracle_only` is explicitly unavailable to treatment agents. The input
also carries `evidence_class`, but in primary SIM-02 it is metadata-only and
does not alter Judge accuracy, difficulty, Backer signal probability, or
selection.

### Output schema

Every R3 record emits:

```text
treatment_id, controlled_identities, attacker_observations,
actions_by_attempt, dao_ballots, assignments, conflict_exclusions,
final_state, final_verdict, failure_reason, court2_opened,
gross_stake_slash, compensation_received, net_attacker_loss_before_gas,
milestone_escrow_debited, attacker_capital_before,
attacker_capital_after, deterministic_vector_id
```

`PROTOCOL_FAIL` has no substantive PASS/FAIL verdict. It is reported as a
procedural outcome, never as a harmful or beneficial substantive reversal.

## R3-A — coordinated non-reveal

| Field | Frozen treatment contract | Status |
| --- | --- | --- |
| Attacker objective | exhaust a Court-level reset budget and cause typed `PROTOCOL_FAIL` | PENDING_OWNER_APPROVAL |
| Controlled identities | exact `3 of 9` eligible Judge identities, selected before assignment | PENDING_OWNER_APPROVAL |
| Group trigger | one shared Bernoulli trigger per controlled group and court attempt, candidate probability `0.20` | PENDING_OWNER_APPROVAL |
| Honest non-reveal | independent per-seat Bernoulli, candidate probability `0.05` | PENDING_OWNER_APPROVAL |
| Action | if the group trigger is 1, every controlled assigned seat performs `NO_COMMIT_AND_NO_REVEAL`; otherwise it follows the honest stream | PENDING_OWNER_APPROVAL |
| Reset behavior | invalid Court is settled once; one fresh assignment is allowed at that level; the next invalid attempt is terminal | PENDING_OWNER_APPROVAL |
| Control persistence | the controlled identity set persists across Court levels and fresh assignments | PENDING_OWNER_APPROVAL |

Pseudocode:

```text
for attempt in [0, 1]:
    assignment = uniform_without_replacement(eligible, r3a.assignment, attempt)
    group_trigger = Bernoulli(0.20, r3a.controlled_group_trigger, attempt)
    for judge in assignment:
        if judge in controlled and group_trigger:
            action[judge] = NO_COMMIT_AND_NO_REVEAL
        else:
            action[judge] = NO_REVEAL if Bernoulli(0.05, r3a.honest_nonreveal, judge, attempt) else VALID_REVEAL
    if all action values are VALID_REVEAL:
        return VALID_COURT
    settle_invalid_once(assignment, action)
return PROTOCOL_FAIL
```

The shared trigger is not three independent Bernoulli failures. Honest
non-reveal remains separate. A reset changes assignment and attempt keys but
does not remove the attacker's identities or relax conflict rules.

Deterministic vector `R3-A-V1`:

```text
pool                 = [J0,J1,J2,J3,J4,J5,J6,J7,J8]
controlled           = [J0,J1,J2]
attempt 0 assignment = [J0,J3,J4]
attempt 0 trigger    = 1; honest non-reveal = 0
attempt 1 assignment = [J1,J5,J6]
attempt 1 trigger    = 1; honest non-reveal = 0
expected             = two invalid settlements, then PROTOCOL_FAIL
```

Required tests: a trigger causes one group decision, honest failures do not
retroactively become coordinated, a reset uses fresh assignment keys, and a
Court-2 attempt preserves the same controlled set unless the approved policy
explicitly changes it.

## R3-B — strategic DAO participation

The primary strategic policy does not expose truth or Court-1 correctness.
Each eligible wallet receives a private signal:

```text
P(signal=APPEAL | Court1_incorrect) = s = 0.20
P(signal=APPEAL | Court1_correct)   = f = 0.80
```

The `(s,f)` values are a misleading-signal candidate, not a calibration. A
wallet uses only its signal, contribution weight, eligibility, and declared
policy version. The candidate policy is:

```text
participate if signal=APPEAL with probability 0.80
participate if signal=ACCEPT with probability 0.50
ballot = APPEAL for an APPEAL signal, otherwise ACCEPT
cost    = unmodeled; no cost-based abstention is inferred
```

The candidate weights are integer `floor_sqrt(contribution)` and the ballot
threshold/tie/empty rules are copied from CWQ-1 only as pending fixture
semantics. Strategic wallets do not coordinate in the primary cell. A
coordination sensitivity must use `r3b.coordination` and be declared as a
separate cell; it cannot share the primary cell's p-value or denominator.

Pseudocode:

```text
for wallet in eligible_snapshot:
    signal = private_signal(wallet, r3b.private_signal, s, f)
    p = 0.80 if signal == APPEAL else 0.50
    if uniform(r3b.participation, wallet) < p:
        ballot[wallet] = signal
    else:
        ballot[wallet] = ABSTAIN
decision = cwq1_decision(snapshot_weights, ballots, pending_policy)
```

Deterministic vector `R3-B-V1` uses two wallets with equal weight. The first
case has an incorrect Court 1, signal uniform `0.10`, participation uniform
`0.70`, and therefore an `APPEAL` ballot. The second has a correct Court 1
with the same signal and participation uniforms and produces the same
`APPEAL` ballot. The expected result is that the agent's observable action is
identical even though the oracle's truth differs; this catches forbidden truth
access.

Required tests: signal rates are conditioned only inside the generator, no
agent input contains truth, participation uses the declared signal policy,
abstentions are not counted as ballots, and the DAO denominator is the frozen
eligible snapshot.

## R3-C — Judge collusion

Run two separately labeled target cells, `target=PASS` and `target=FAIL`,
selected before execution. The attacker controls exactly three of nine Judge
identities in the candidate treatment. Controlled Judges vote for the fixed
target; they do not receive additional information. Collusion does not change
reveal probability in the primary cell. A no-reveal variant is R3-A, not a
hidden extra behavior in R3-C.

```text
controlled_judge_count = 3 of 9                 PENDING_OWNER_APPROVAL
controlled_vote_target = PASS or FAIL           PENDING_OWNER_APPROVAL
controlled_reveal = VALID_REVEAL                PENDING_OWNER_APPROVAL
selection = uniform among eligible, non-conflicted identities
DAO participation by a controlled identity = allowed only if snapshot rules allow it
```

Pseudocode:

```text
assignment = uniform_without_replacement(eligible, r3c.assignment)
for judge in assignment:
    if judge in controlled:
        vote[judge] = fixed_target
    else:
        vote[judge] = honest_vote_from_shared_case_latent(judge)
    reveal[judge] = VALID_REVEAL
verdict = two_of_three(vote) if all_reveals_valid else INVALID
```

Deterministic vector `R3-C-V1`: assignment `[J0,J1,J4]`, controlled
`[J0,J1,J2]`, target `PASS`, honest `J4=FAIL`, all reveals valid. The expected
Court result is `PASS`. With oracle truth `FAIL`, the observable is a false
PASS; the mirror vector with target `FAIL` is retained separately and is not
selected after seeing truth.

Required tests: controlled membership is fixed before assignment, selection
is uniform over the eligible set, target is not outcome-selected, colluding
votes do not change the ballot weight, and no Court-1 correctness or truth
field is available to the attacker.

## R3-D — fixed-capital wallet splitting

This treatment is a deterministic decision-flip demonstration, not a
probability-of-success estimate. The attacker contribution is fixed:

```text
opponent ACCEPT contribution = 16,000,000 base units
attacker APPEAL capital      =  9,000,000 base units
capital before = capital after = 9,000,000 base units
```

For wallet count `k`, allocate `q = 9,000,000 div k` to every wallet and the
remainder to the lowest canonical wallet IDs. Every wallet is above the
candidate positive minimum and below the fixture `uint128` cap. The DAO
snapshot occurs before any ballot; all eligible wallets vote; weights are
`floor_sqrt(contribution)`, and the CWQ-1 participation/threshold/tie rule is
applied exactly as a pending fixture rule.

Pseudocode:

```text
parts = integer_split(total_attacker_capital=9_000_000, wallet_count=k)
snapshot = [opponent=16_000_000 ACCEPT, parts_i APPEAL]
weights = [floor_sqrt(c) for c in snapshot]
decision = cwq1_decision(weights, all_ballots, pending_policy)
```

Deterministic vector `R3-D-V1` is the verified Q10 fixture vector:

| Attacker wallets | Attacker allocation | Attacker weight | Opponent weight | Expected decision |
| ---: | --- | ---: | ---: | --- |
| 1 | `[9,000,000]` | 3,000 | 4,000 | ACCEPT |
| 9 | nine `[1,000,000]` | 9,000 | 4,000 | APPEAL |

The screening sensitivity counts are `1, 2, 4, 8`; count 9 is retained for
the exact Q10 vector. The total contribution, snapshot timing, eligible set,
and ballot threshold are never changed between split and unsplit rows.

Required tests: integer allocations sum exactly to 9,000,000, `floor_sqrt`
weights match the fixture, threshold cross-products do not use floating point,
the one-to-nine vector flips as shown, and a flip is reported as a deterministic
counterexample rather than a probabilistic Sybil-resistance estimate.

## R3-E — CCPS-1 compensation recapture

This treatment preserves the verified PR3 arithmetic and does not claim that
the arithmetic is deterrence. Candidate fixture values are `D=10`, `F=3`,
`resetCostMax=23` base units, all `PENDING_OWNER_APPROVAL`.

For one procedural offender:

```text
gross slash from offender A       = 2D + F = 23
compensation to compliant B        = D = 10
compensation to compliant C        = D = 10
compensation to finalizer F        = F = 3
milestone escrow debited           = 0
```

If one actor controls offender A and the permissionless finalizer, the actor's
net stake loss before gas is `23 - 3 = 20`. The finalizer receipt is not
subtracted from the milestone escrow and is not a Judge service reward. A
second all-offender vector has gross slash `3` and finalizer compensation `3`,
so its net before gas is `0`; it is a separate boundary case, not an average.

Pseudocode:

```text
offenders = assigned seats missing commit or valid reveal
n = len(offenders)
gross = (3 - n) * D + F
penalties = integer_equal_split(gross, offenders, canonical_address_remainder)
debit(offender_locked_stake, penalties)
credit(D, each compliant seat)
credit(F, permissionless finalizer)
net_actor_loss_before_gas = gross_actor_slash - actor_compensation_received
```

Deterministic vectors `R3-E-V1` and `R3-E-V2` are the PR3 R1 and R3 vectors:

| Vector | Offenders | Gross slash | Same actor compensation | Net loss before gas | Escrow debit |
| --- | --- | ---: | ---: | ---: | ---: |
| V1 | A only; B/C compliant; actor also finalizes | 23 | 3 | 20 | 0 |
| V2 | A/B/C all non-reveal; actor finalizes | 3 | 3 | 0 | 0 |

Gas, opportunity cost, capital lock, and identity-control cost are unresolved
inputs. No deterrence claim is permitted until those costs and the actor's
ability to control the recipient identity are approved and measured.

## Versioned unresolved inputs and recommendation rule

The following remain explicit blockers rather than hidden defaults:

```text
controlled Judge/backer counts and identity acquisition
group-trigger and honest non-reveal probabilities
strategic participation costs and coordination
CWQ-1 minimum contribution, cap, threshold, tie, and empty policy
Court-2 conflict persistence and fresh-assignment budget
CCPS-1 D/F, reset limits, reward recipients, gas, and opportunity cost
evidence availability and revision timing
```

R3 outputs must include the full input manifest, action trace, failure reason,
and deterministic vector ID. A treatment that cannot be executed because one
of these inputs is pending is reported as `UNVALIDATED`, not silently filled
with a researcher-selected value.
