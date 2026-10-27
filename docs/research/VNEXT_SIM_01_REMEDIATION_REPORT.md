# FundTogether VNext SIM-01 Metrics and Judge–Backer Overlap Remediation

Status: exploratory engineering diagnostic only. This report is not a
confirmatory result, a superiority claim, a production-readiness claim, or
evidence about real crowdfunding behavior.

## Decision

SIM-01 remediation is **implementation PASS** and **SIM-02 confirmatory
GO/NO-GO: NO-GO**.

The corrected runner distinguishes substantive verdicts from procedural
failure, uses the published all-trial error denominators, and makes
Judge–Backer overlap a versioned treatment. The bounded results retain clear
negative B2 regions, especially under full overlap and misleading signals.
SIM-02 requires a separately approved design with frozen policy values,
pre-registered estimands and uncertainty procedures, and a resolved liveness
policy.

## Source and baseline revisions

| Item | Revision |
| --- | --- |
| Current implementation base | `d0c81c88b543fad859a119921a45b999719ff0d3` |
| SIM-01 implementation commit | `2960384d1d16651c99d8f73ac108a76ef2522789` |
| Current research specification | `58ad19b237758f776418ac64eed09a8c4031bffe` |
| V2 PR0/PR3/PR4 policy package | `d1b3b5fcfda8caa3fd83f40a32418772cce8b83b` |
| Reference PR #25 | [merged PR #25](https://github.com/Lunamoon-dot/FundTogether/pull/25) |
| Original SIM-01 raw SHA-256 | `3808dd7109196d102ac93034e6f686996f80415e493f46068805d2e5b1a87e49` |
| Remediation model | `fundtogether-sim-01-paired-v2` |
| Remediation raw schema | `sim-01-comparative-raw-v2` |

The original SIM-01 config, raw hash, manifest, tables, figures, and report
were not overwritten. The source-audit companion note is
[`VNEXT_SIM_01_REMEDIATION_SOURCE_NOTES.md`](VNEXT_SIM_01_REMEDIATION_SOURCE_NOTES.md).

## Original defects

The former reversal predicate treated `None != ground_truth` as a harmful
substantive reversal. Since `PROTOCOL_FAIL` requires `final_verdict: null`, a
Court 2 inability to produce a ruling could enter the harmful numerator.
The former beneficial and harmful rates also divided by all Court 2 openings,
not by the corresponding incorrect- or correct-Court-1 appeal populations.

The former `false_pass_rate` and `false_fail_rate` used truth-class
denominators. The published protocol defines both as joint error probabilities
over all initiated trials; truth-conditional diagnostics are now reported
separately.

The former scenario generator put all Judge identities into the Backer
population whenever enough Backer slots existed. The configured nine-Judge,
20-Backer case was therefore an implicit all-overlap stress case, not a
sensitivity study.

## Corrected estimands

Let `N` be all initiated trials in a reporting cell. A substantive Court 2
outcome requires `court2_final_valid` and a final `PASS` or `FAIL`; a
`PROTOCOL_FAIL` is never substantive.

```text
N_incorrect_appealed = count(Court1 incorrect AND DAO_APPEAL)
N_correct_appealed   = count(Court1 correct AND DAO_APPEAL)

beneficial_reversal_rate =
  count(Court1 incorrect AND DAO_APPEAL AND Court2 substantive
        AND Court2 final verdict correct)
  / N_incorrect_appealed

harmful_reversal_rate =
  count(Court1 correct AND DAO_APPEAL AND Court2 substantive
        AND Court2 final verdict incorrect)
  / N_correct_appealed
```

Zero denominators are `null`. The raw and summary outputs also publish
`N_beneficial_reversals`, `N_harmful_reversals`,
`N_appeal_protocol_failures`, and `N_court2_substantive`.

```text
appeal_protocol_failure_rate       = N_appeal_protocol_failures / count(DAO_APPEAL)
appeal_protocol_failure_all_trials = N_appeal_protocol_failures / N
appeal_failure_after_correct_court1
  = failures after correct Court 1 / N_correct_appealed
appeal_failure_after_incorrect_court1
  = failures after incorrect Court 1 / N_incorrect_appealed
court2_substantive_completion_rate
  = N_court2_substantive / count(DAO_APPEAL)
```

The corrected error metrics are:

```text
false_pass_rate = count(FINAL_PASS when ground_truth == FAIL) / N
false_fail_rate = count(VERDICT_FAIL when ground_truth == PASS) / N

false_pass_given_truth_fail = false PASS / count(ground_truth == FAIL)
false_fail_given_truth_pass = false FAIL / count(ground_truth == PASS)
```

`conditional_substantive_accuracy` remains conditional on substantive
resolution, while `all_trial_correct_substantive` retains `N` as its
denominator. Reporting both prevents unresolved cases from being hidden by a
selective-resolution denominator.

## Judge–Backer overlap treatment

`judge_backer_overlap_ratio` means:

```text
number of eligible Judge identities also represented as Backers
/ number of eligible Judge identities
```

Requested levels are `0.00`, `0.25`, `0.50`, and `1.00`. The realized Judge
count uses nearest-integer, half-up rounding. Thus, for nine eligible Judges,
the realized counts are `0`, `2`, `5`, and `9`, with realized ratios `0`,
`2/9`, `5/9`, and `1`. The deterministic mapping uses the lowest stable Judge
identities first; the Creator is never an eligible Judge.

Each record stores the requested ratio, realized count and ratio, overlap
identity list, and total contribution capital. Slot-index contributions keep
total capital fixed; partial overlap changes wallet ownership of contribution
slots and that ownership is visible in the raw snapshot.

For each overlap treatment, the base case, ground truth, shared difficulty,
Judge potential behavior, initial Court 1 selection, participation streams,
Backer slot count, random-stream version, and attacker capital remain keyed to
the same case identity. The overlap treatment changes only the explicit role
mapping and the resulting eligibility/ownership consequences.

Court 2 diagnostics distinguish Court 1 history, DAO voters, Creator conflict,
insufficient Judge supply, and non-reveal procedural failure. A non-voting
Judge–Backer is not excluded merely for being a Backer.

## Configuration and outputs

The corrected configuration is
[`sim_01_overlap_remediation.json`](../../research/pilot/configs/sim_01_overlap_remediation.json):

- four overlap levels;
- large (`9`) and constrained (`3`) Judge pools;
- `rho = 0.00` and `0.30`;
- non-reveal `0.00` control and `0.20` treatment;
- informative, non-informative, and misleading signals;
- 32 replications per cell, selected before execution;
- paired B0/B1/B2 observations;
- master seed `20261027` and the existing keyed stream version.

The remediation output directory is
`research/pilot/results/sim_01_remediation/`. It contains the typed raw JSONL
locally, manifest, corrected metric tables, Court 2 eligibility diagnostics,
overlap sensitivity table, figures, and checksums. Raw JSONL and replay output
are ignored by Git; the raw hash is committed in the manifest/checksum record.

The primary run produced 9,216 records:

```text
32 cells × 32 replications × 3 signal treatments × 3 models = 9,216
```

## Analytical checks

For full overlap, nine Judges, three Court 1 seats, six remaining
Judge–Backers, independent 80% turnout, and no other exclusions:

```text
X ~ Binomial(6, 0.20)
P(X >= 3) = 0.09888
```

The remediation diagnostic observed `0.09375` (`3/32`), absolute error
`0.00513`, and status `PASS` under the declared exploratory tolerance `0.20`.
The diagnostic explicitly accounts for Court 1 assignment history. Eligibility
distributions in the zero, partial and full-overlap cells were recorded rather
than substituted with this closed form.

## Historical `0.950` correction

The historical misleading, large-pool, `rho=0.30`, zero-non-reveal cell had:

| Partition | Count |
| --- | ---: |
| DAO appeals | 20 |
| Appeals after correct Court 1 | 19 |
| Appeals after incorrect Court 1 | 1 |
| Court 2 protocol failures | 20 |
| Protocol failures after correct Court 1 | 19 |
| Protocol failures after incorrect Court 1 | 1 |
| Substantive harmful reversals | 0 |
| Substantive beneficial reversals | 0 |

The published `0.950` was exactly `19/20`: every appeal after a correct
Court 1 failed procedurally, and `None != ground_truth` made those 19 rows
look harmful. It is **not** a substantive harmful-reversal rate. The corrected
harmful rate is `0/19 = 0.0`; the appeal protocol-failure rate after correct
Court 1 is `19/19 = 1.0`.

## Overlap sensitivity results

Large pool, `rho=0`, zero non-reveal, B2, 32 replications per signal cell:

| Signal | Requested overlap | Realized count | Mean Court 2 eligible after DAO | Protocol failure | Court 2 substantive completion | Beneficial reversal | Harmful reversal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Informative | 0.00 | 0 | 6.000 | 0.000 | 1.000 | 1.000 | null |
| Informative | 0.25 | 2 | 4.906 | 0.000 | 1.000 | 1.000 | 0.000 |
| Informative | 0.50 | 5 | 3.156 | 0.094 | 0.625 | 0.571 | 1.000 |
| Informative | 1.00 | 9 | 1.125 | 0.219 | 0.000 | 0.000 | null |
| Misleading | 0.00 | 0 | 6.000 | 0.000 | 1.000 | null | 0.217 |
| Misleading | 0.25 | 2 | 4.906 | 0.000 | 1.000 | null | 0.130 |
| Misleading | 0.50 | 5 | 3.156 | 0.125 | 0.818 | null | 0.227 |
| Misleading | 1.00 | 9 | 1.125 | 0.688 | 0.120 | null | 0.000 |

The `null` values are zero-denominator results, not zeros. Full overlap is a
strong liveness stress in this model: DAO voters remove most of the six
post-Court-1 candidates. Partial overlap retains a measurable Court 2 path;
it does not guarantee an improvement in correctness.

The full eligibility distributions for the same large-pool, `rho=0`,
zero-non-reveal, informative control were:

| Requested overlap | Realized count | `court2_eligible_judges_after_dao` distribution |
| ---: | ---: | --- |
| 0.00 | 0 | `6:32` |
| 0.25 | 2 | `4:10, 5:15, 6:7` |
| 0.50 | 5 | `2:7, 3:16, 4:6, 5:3` |
| 1.00 | 9 | `0:7, 1:17, 2:5, 3:3` |

The constrained three-Judge pool has zero post-Court-1 Judge supply before
DAO effects. In the `rho=0`, non-reveal `0.20` stress cell, Court 2 assignment
success was zero at every overlap level; Court 2 exhaustion rates were
`0.156` informative, `0.281–0.313` non-informative, and `0.406` misleading.
No Judge was silently added and no conflict rule was relaxed.

## Paired B0/B1/B2 results

Large pool, `rho=0.30`, zero non-reveal, full overlap:

| Signal | Model | Substantive resolution | All-trial correct substantive | Protocol failure | Corrected beneficial | Corrected harmful |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Informative | B0 | 1.000 | 0.594 | 0.000 | n/a | n/a |
| Informative | B1 | 1.000 | 0.594 | 0.000 | n/a | n/a |
| Informative | B2 | 0.625 | 0.625 | 0.375 | 0.077 (`1/13`) | null (`0/0`) |
| Non-informative | B0 | 1.000 | 0.594 | 0.000 | n/a | n/a |
| Non-informative | B1 | 1.000 | 0.594 | 0.000 | n/a | n/a |
| Non-informative | B2 | 0.438 | 0.250 | 0.563 | 0.143 (`1/7`) | 0.000 (`0/12`) |
| Misleading | B0 | 1.000 | 0.594 | 0.000 | n/a | n/a |
| Misleading | B1 | 1.000 | 0.594 | 0.000 | n/a | n/a |
| Misleading | B2 | 0.375 | 0.000 | 0.625 | 0.000 (`0/1`) | 0.000 (`0/19`) |

In that full-overlap misleading cell, the paired B2-minus-B1 differences were
`-0.625` for substantive resolution, `-0.594` for all-trial correct
substantive outcomes, and `+0.625` for protocol failure. This is a retained
negative B2 region, not a favorable-seed exclusion.

Under zero overlap in the large-pool, `rho=0.30`, zero-non-reveal cells, B2
had no Court 2 protocol failures and corrected `7/13` informative incorrect
Court 1 appeals and `5/7` non-informative incorrect Court 1 appeals. In the
misleading cell it produced `1/18` substantive harmful reversals. These are
finite exploratory counts, not a claim that zero overlap is generally better.

## Validation and replay evidence

- Full Python suite: **50 passed**, with only dependency deprecation warnings.
- Existing PILOT-01 runner: 64,000-record replay generated and legacy schema
  validation passed; raw SHA-256 is
  `2da6d35ce0425742b31564d642338ad70552aecce67387ceb4a8a2023bd73357`.
  The original committed PILOT-01 artifacts were not overwritten.
- Existing SIM-01 configuration: 2,304-record legacy-schema replay generated
  and schema validation passed. Its new-code replay hash is
  `c83ab7de995d8c5db1bd8be39cab072e1bc0b02619115e5a8eec50b39fbd340a`;
  this differs from the preserved original because the corrected runner emits
  additional versioned fields and metrics.
- Remediation schema validation: **9,216 records, PASS**.
- Remediation raw SHA-256:
  `90d7c4c33c08430a2067d9a882f6f58c9c06a48f68685b77792b6875ce03c842`.
- Identical remediation replay SHA-256: the same hash, exact byte match.
- `git diff --check`: PASS.

Primary output checksums are in
`research/pilot/results/sim_01_remediation/checksums.sha256`. Raw JSONL is
kept locally for replay and is not committed as a large dataset.

## Limitations and remaining uncertainty

- All Judge, Backer, signal, participation, non-reveal, and policy values are
  synthetic; no human identity, evidence truth, public-chain gas, latency,
  real reviewer supply, or real-money behavior is modeled.
- The role mapping changes contribution ownership for partial overlap even
  though total capital is fixed; ownership effects are not separately
  identified from eligibility effects in this exploratory design.
- The abstract selection stream is deterministic and reproducible, not a
  deployable randomness primitive or liveness proof.
- DAO-voter exclusion, Court 2 exhaustion and reset behavior are versioned
  fixture assumptions, not current production runtime authority.
- No confirmatory inference, p-values, interval-based superiority claim,
  seed search, or favorable-result filtering was performed.

## Recommendation for SIM-02

Do not start confirmatory SIM-02 inference from these outputs. First approve a
new design that freezes the overlap/ownership treatment, Court 2 liveness and
no-quorum semantics, fee and reward policy, evidence availability policy,
replication and clustering plan, and joint error/procedural-failure estimands.
Retain B0 and B1 as live comparators; do not assume B2 is superior. Any SIM-02
continuation should report substantive accuracy, all-trial correctness,
coverage, procedural failure, and Court 2 eligibility together.
