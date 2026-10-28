# SIM-02 research decision register

**Status:** recommendations and pending owner decisions; nothing in this
register approves runtime policy.  
**Design revision:** sim-02-prereg-v1  
**Source baseline:** origin/main@7d773668a201f8ba9c137fb6751d69122222b606

Approval states used here:

- LOCKED: explicitly locked by the cited policy package for the stated
  fixture/design scope.
- PROPOSED_PENDING_APPROVAL: candidate policy value in the V2 registry.
- PENDING_OWNER_APPROVAL: SIM-02 design choice that must be approved before
  confirmatory execution.
- UNVALIDATED: no credible measurement exists yet.

## 1. Policy and mechanism register

| Decision | Candidate/default | Status | Required approval/evidence | Scientific consequence if changed |
| --- | --- | --- | --- | --- |
| Reference Court | three unique Judges; two-of-three majority | LOCKED for reference design | preserve in all baselines | changes B0/B1/B2 comparability |
| B0 reset/DAO/Court 2 | none | PENDING_OWNER_APPROVAL | freeze terminal invalid semantics | changes the simple baseline |
| B1 reset | one fresh bounded reset; second invalid attempt fails | PROPOSED_PENDING_APPROVAL | approve reset limit and terminal path | changes C1 and liveness |
| B2 sequence | B1 path, valid Court 1, DAO, finalized APPEAL, fresh Court 2, one bounded Court 2 reset | PROPOSED_PENDING_APPROVAL | approve state sequence and no bypass | changes C2 mechanism identity |
| CWQ-1 | floor square-root contribution weight | PROPOSED_PENDING_APPROVAL | formula, cap, overflow, tie, threshold | changes DAO influence and wallet-splitting result |
| DAO threshold | candidate 2,000 bps effective weight | PROPOSED_PENDING_APPROVAL | quorum/threshold and empty/tie rule | changes Court 2 opening rate |
| DAO tie/empty/unmet | candidate ACCEPT | PROPOSED_PENDING_APPROVAL | explicit default and no-quorum terminal path | changes liveness and appeal selection |
| DAO snapshot | confirmed contributions and eligibility at DAO open | PROPOSED_PENDING_APPROVAL | freeze time and event identity | changes denominator and voter set |
| Court 1 conflict | all known Court 1 assignees excluded at DAO open | PROPOSED_PENDING_APPROVAL | temporal exclusion semantics | changes electorate and supply |
| Court 2 conflict | Court 1 history, creator, and valid DAO voters excluded | Court 1 isolation LOCKED; voter/creator exclusions pending | approve full conflict set | changes Court 2 exhaustion |
| CCPS-1 D/F | D=10, F=3, resetCostMax=23 fixture vector | PROPOSED_PENDING_APPROVAL | collateral, recipients, reset limits | changes operations and attacker net cost |
| Reset funding | offending locked stake only | PROPOSED_PENDING_APPROVAL | preserve separation from milestone escrow | changes accounting/fund safety |
| Court 2 exhaustion | bounded timeout to PROTOCOL_FAIL; do not rewrite DAO | PROPOSED_PENDING_APPROVAL | timeout, refund/unlock, reason codes | changes liveness and correctness denominator |
| Randomness | deterministic keyed streams for study; no production claim | PENDING_OWNER_APPROVAL | freeze stream/version; separately approve production source | changes assignment dependence |
| Evidence | frozen revision/hash and explicit availability check | PENDING_OWNER_APPROVAL | canonical bytes, disclosure, timeout/revision | changes information quality and external validity |
| Rewards/refunds | fixture accounting only; no production economic inference | PROPOSED_PENDING_APPROVAL | rate/reserve/dust/failed-transfer policy | changes cost and capital-lock gates |

The candidate values in this table are not owner-approved merely because they
are present in a fixture or manifest.

## 2. Liveness policy register

| Question | Recommended SIM-02 default | State classification | Alternative sensitivity |
| --- | --- | --- | --- |
| Fewer than three initial eligible Judges | terminal PROTOCOL_FAIL with no assigned-duty reward/slash; refund/unlock only after accounting | PENDING_OWNER_APPROVAL | bounded grace/recovery before terminal |
| A Court has non-reveal | invalid attempt; one fresh reset at that Court level | PENDING_OWNER_APPROVAL | independent, coordinated, and strategic non-reveal |
| Reset exhaustion | typed terminal PROTOCOL_FAIL; never a substantive verdict | PENDING_OWNER_APPROVAL | larger reset budget is a different mechanism |
| Selection draw exhausted | typed bounded recovery, not proof of insufficient pool | PENDING_OWNER_APPROVAL | vary draw/retry budget |
| Randomness unavailable | bounded recovery then terminal typed failure | PENDING_OWNER_APPROVAL | fallback source changes attack surface |
| DAO no quorum/tie/empty | candidate ACCEPT, but report the reason separately | PENDING_OWNER_APPROVAL | APPEAL or terminal failure |
| Court 2 candidate exhaustion | bounded timeout to PROTOCOL_FAIL, preserve DAO transcript | PENDING_OWNER_APPROVAL | conflict relaxation changes B2 |
| Retry/timeout horizon | fixed finite values in policy manifest | PENDING_OWNER_APPROVAL | no post-result retry extension |
| Escrow refund/unlock | contract-state transition only after terminal accounting | PENDING_OWNER_APPROVAL | no database-created financial truth |
| STUCK | right-censored at frozen horizon; not a verdict | PENDING_OWNER_APPROVAL | horizon sensitivity |

Alternative rows are not hidden implementation choices. A confirmatory run
cannot start while the selected row is pending.

## 3. Effect and acceptance-threshold register

The values below are candidate planning ranges, not binding decisions. Each
value must be approved before a result can be called a pass/fail gate.

| Parameter | Scientific meaning | Candidate value/range | Rationale | Measurement availability | Consequence of violation | Approval |
| --- | --- | --- | --- | --- | --- | --- |
| minimum_correctness_improvement | minimum Delta_correct for B2 benefit | 0.02, 0.05, or 0.10 | separates practically meaningful benefit from sampling noise; compare a sensitivity range rather than choose after results | estimable from paired outcomes | no B2 correctness benefit in region | PENDING_OWNER_APPROVAL |
| maximum_acceptable_resolution_loss | allowed negative Delta_resolution | 0.02, 0.05, or 0.10 | prevents correctness gains from hiding a liveness loss; margin must reflect acceptable unresolved cases | estimable from paired outcomes | fail liveness gate; no correctness trade | PENDING_OWNER_APPROVAL |
| maximum_protocol_failure_increase | B2 minus B1 protocol-failure premium | 0.02, 0.05, or 0.10 | bounds procedural risk introduced by Court 2 and conflict exclusions | estimable from typed outcomes | fail operational gate | PENDING_OWNER_APPROVAL |
| maximum_court_operations_premium | extra attempted courts per initiated case | 0.5, 1.0, or 2.0 | makes extra state transitions comparable to per-case benefit before monetary evidence exists | Level-1 proxy available | fail complexity gate | PENDING_OWNER_APPROVAL |
| maximum_latency_premium | added settlement/timeout time | not yet numerically available | a time gate is necessary because stuck capital has user cost, but no credible measurement is present | runtime/validated timing model absent | gate remains unvalidated | PENDING_OWNER_APPROVAL |
| maximum_capital_lock_premium | added collateral/escrow duration | not yet numerically available | captures the economic cost of fresh Judges, resets, and Court 2 without fabricating a price | event/timestamp and economic model absent | gate remains unvalidated | PENDING_OWNER_APPROVAL |
| maximum_adversarial_failure_rate | allowed failure in approved threat cell | 0.05 or 0.10 candidate | bounds failure in a declared attack region; it is not a universal resistance claim | typed adversarial simulation only | reject or restrict B2 region | PENDING_OWNER_APPROVAL |
| attacker_cost criterion | minimum fixed-capital/operational cost for a flip | no binding value | wallet splitting and recapture need a budget-relative criterion, not a qualitative “resistant” label | economic attacker model absent | no resistance claim | PENDING_OWNER_APPROVAL |
| gas budget | contract execution cost bound | no binding value | operation counts are not gas; an exact benchmark is required before economic interpretation | exact Foundry benchmark absent | economic gate unvalidated | PENDING_OWNER_APPROVAL |

Candidate margins are used in the power table only as transparent planning
inputs. If no owner-approved margin exists, the relevant conclusion is
INCONCLUSIVE rather than “no significant difference, therefore equal.”

## 4. Overlap and ownership register

| Decision | SIM-02 recommendation | Status |
| --- | --- | --- |
| Primary overlap model | O1 stable contribution slots; fixed per-slot potential signals and participation uniforms | PENDING_OWNER_APPROVAL |
| Sensitivity model | O2 wallet-identity-keyed streams, separately labeled | PENDING_OWNER_APPROVAL |
| Requested overlap levels | 0, 0.25, 0.50, 1.00; nearest-integer half-up realization | PENDING_OWNER_APPROVAL |
| Ownership assignment | low-value, high-value, and uniform stable slots; total capital fixed | PENDING_OWNER_APPROVAL |
| Causal language | identify role/eligibility and weight-mapping effects conditional on shared potentials; do not claim pure eligibility or Sybil resistance | PENDING_OWNER_APPROVAL |

O1 is not perfect isolation of ownership effects. O2 observations cannot be
pooled with O1 observations or used to choose a favorable stream after results.

## 5. Cost and evidence register

| Cost/evidence item | Current capability | Required before it can gate B2 | State |
| --- | --- | --- | --- |
| Court/seat/ballot/reset counts | pilot schema can record resource proxies | exact field semantics and denominator check | CONDITIONAL |
| Contract gas | relevant Foundry fixture exists | exact version/compiler benchmark, p50/p95/max and block boundary | UNVALIDATED |
| Real elapsed time | no validated end-to-end timing | runtime/event benchmark with timeout semantics | UNVALIDATED |
| Capital duration | synthetic state transitions only | timestamped lock/release measurement | UNVALIDATED |
| Opportunity cost | no approved price model | calibrated or bounded economic model | UNVALIDATED |
| Evidence availability | hash/revision seams exist in design/fixtures | availability/disclosure/failure acceptance | UNVALIDATED |
| Attacker profitability | deterministic arithmetic vectors only | declared budget, gas, rewards, timing, and recipient model | UNVALIDATED |

Until these rows are closed, Court counts can be compared as resource proxies
but cannot support a claim that B2 is economically superior.

## 6. Approval and amendment protocol

Before confirmatory execution, the owner must approve the pending policy rows,
the numerical margins, liveness semantics, exact cell list, replication counts,
and primary analysis family. The approval record must identify the policy/model
version and source commit.

After execution begins, a change requires a new design revision, timestamp,
reason, affected cells, new seed or version where applicable, and separate
analysis. It cannot overwrite raw output or convert exploratory findings into
confirmatory evidence.
