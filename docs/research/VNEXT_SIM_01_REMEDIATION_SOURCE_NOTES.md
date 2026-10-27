# SIM-01 remediation source notes

Status: source audit only. No simulator code was changed and no full simulation
was run. The final worktree check found unrelated/uncommitted edits in multiple
SIM-01 source files; this note anchors all SHA and line findings to committed
`HEAD` and does not treat those edits as the current source revision.

## Verified revisions

| Role | Current revision | Primary-source check |
| --- | --- | --- |
| Current repository baseline | `d0c81c88b543fad859a119921a45b999719ff0d3` | `HEAD` and `origin/main`; merge commit for PR #25. |
| SIM-01 implementation/report commit | `2960384d1d16651c99d8f73ac108a76ef2522789` | Last commit for the comparative source, config, tests, and foundation report. |
| Historical SIM-01 base baseline | `1b3fc71bf0e714afc2d7a9a36f243523b3ccd0ae` | Pinned by the original config/report as the pre-PR-25 `origin/main` baseline; it is not the current repository baseline. |
| Current research specification | `58ad19b237758f776418ac64eed09a8c4031bffe` | Last revision of `docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md`. |
| Current V2 PR0/PR3/PR4 policy package | `d1b3b5fcfda8caa3fd83f40a32418772cce8b83b` | Last revision of `PR0_POLICY_FINALIZATION.md`, `PR1-PR4_ACCEPTANCE_CRITERIA.md`, and `FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md`. |
| Current PR3 fixture file revision | `6bf371646da84044006d34d76319da221ab6d59f` | Last file revision of `contracts/test/fixtures/V2CourtResetFixture.sol`. |
| Current PR4 fixture file revision | `d00c92dca186164ff2bb842e420b9ac2f80c9f76` | Last file revision of `contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol`. |
| Current target V1 protocol | `f16388588beb9049f0ebe3b80632669c6abe1c46` | Last revision of `FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md`; it remains proposed research protocol, not deployed runtime. |

The original SIM-01 metadata therefore needs to be read as layered: the
SIM-01 source is `2960384…` on top of the historical base `1b3fc71…`, while
the remediation worktree is now at `d0c81c8…`. The config's `research_pr`
field points to PR #24; the SIM-01 merge itself is PR #25.

## Findings

### 1. The published metric definitions and implementation disagree

The research protocol defines `N` as all initiated trials and defines
`false_pass_rate` and `false_fail_rate` over `N`, while conditional substantive
accuracy is separately defined over `N_substantive`
(`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:261-294`). It also defines
harmful reversal as a correct Court 1 result changed to incorrect by Court 2,
with denominator only correct Court 1 outcomes receiving `DAO_APPEAL`
(`docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md:296-304`).

The current implementation instead uses truth-class denominators for
`false_pass_rate`/`false_fail_rate` and computes both reversal numerators over
all `court2_opened` rows
(`research/pilot/src/fundtogether_pilot/comparative_metrics.py:35-44,
57-60, 81-84`). Its `harmful` predicate is `final_verdict != ground_truth`;
the typed schema explicitly requires `final_verdict is None` for
`PROTOCOL_FAIL` (`research/pilot/src/fundtogether_pilot/comparative_schema.py:332-344`).
Thus a Court 2 procedural failure after a correct Court 1 is currently counted
as harmful substantive reversal, and procedural failures also remain in the
reversal denominator.

The foundation report's historical misleading-cell `0.950` is therefore not a
valid substantive-harm rate as published. The same row reports `0.625`
Court 2 protocol failure (`docs/research/VNEXT_SIM_01_FOUNDATION_REPORT.md:175-192`),
but the source audit cannot recover the corrected substantive/procedural
partition without a corrected replay of the preserved raw records.

### 2. Judge–Backer overlap is an implicit all-overlap assumption in committed SIM-01

In the committed SIM-01 source, `generate_base_scenario()` creates
`judge-000` through `judge-(N-1)` and puts all of them into the Backer
population whenever `backers_per_case >= judge_pool_size`; there is no overlap
parameter or realized-overlap field in `BaseScenario`
(`research/pilot/src/fundtogether_pilot/scenarios.py:20-38,78-140`). The
committed config uses 9 Judges and 20 Backer slots
(`research/pilot/configs/sim_01_exploratory.json:22-27`), so the original
large-pool and constrained-pool cells both use complete Judge–Backer overlap.

The committed config loader, comparative runner, and typed schema expose no
overlap treatment or overlap diagnostics
(`research/pilot/src/fundtogether_pilot/config.py:41-74`,
`research/pilot/src/fundtogether_pilot/comparative.py:589-623`,
`research/pilot/src/fundtogether_pilot/comparative_schema.py:33-102`).
Therefore the original SIM-01 results are an all-overlap default, not a
four-level overlap sensitivity study. Any overlap seam visible in the dirty
worktree is uncommitted remediation work and is outside the verified source
SHA above.

### 3. Current Court 2 eligibility/conflict semantics

The current source-of-truth semantics are:

1. At DAO opening, exclude all prior Court 1 assignees, including invalid and
   replacement attempts, from DAO eligibility and `W_total`; keep their
   contribution for escrow/refund accounting.
2. After finalized `APPEAL`, exclude all valid DAO voters, whether `ACCEPT` or
   `APPEAL`, plus the creator and every prior case assignee from Court 2 and
   its replacement. A non-voting Backer is not excluded by that rule alone.
3. Court 2 is opened only by finalized `APPEAL`; it has three new unique Judges,
   the same evidence revision/criteria, and no Court 1 overlap. Candidate
   exhaustion follows a bounded timeout/`PROTOCOL_FAIL` path; ballots are not
   erased and conflicts are not relaxed.

These rules are stated in the PR0 policy record
(`docs/protocol/PR0_POLICY_FINALIZATION.md:223-245`), the PR4 acceptance gates
(`docs/protocol/PR1-PR4_ACCEPTANCE_CRITERIA.md:186-234`), and the detailed V2
state machine (`docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md:351-373,
413-464`). The additional DAO-voter exclusion is explicitly still
`PROPOSED_PENDING_APPROVAL`; Court 1/Court 2 isolation is the locked part.

The Foundry-only PR4 fixture implements those proposed semantics: DAO opening
skips `caseJudgeAssigned` history; Court 2 eligibility rejects the creator,
any prior case assignee, and `daoVoted` wallets; and unassigned Court 2
exhaustion becomes protocol failure after its timeout
(`contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol:201-247,302-320,366-409`).
The simulator mirrors the same conflict set when Court 2 is attempted and the
schema rejects Court 1/Court 2 or DAO-voter overlap
(`research/pilot/src/fundtogether_pilot/comparative.py:319-364,395-403`,
`research/pilot/src/fundtogether_pilot/comparative_schema.py:362-376`).

PR3 semantics remain separate: reset is procedural recovery, not Court 2; one
reset is allowed per court level, and a further invalid replacement is terminal
`PROTOCOL_FAIL` (`docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md:358-411`,
`contracts/test/fixtures/V2CourtResetFixture.sol:624-646`). An unassigned Court
2 timeout creates no assigned-duty reset compensation
(`contracts/test/fixtures/V2CourtResetFixture.sol:714-728`).

## Runtime/evidence boundary

The V2 package is a research policy/fixture package. The checked-out runtime
does not yet implement a BackerDAO/CWQ-1/single-Court-2 workflow; its existing
`openAppeal` is a different review-round mechanism
(`docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md:153-166`,
`docs/research/VNEXT_RESEARCH_READINESS_REPORT.md:61-84`). The PR4 fixture is
explicitly deterministic, Foundry-only, and not deployment code
(`contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol:12-14`). These semantics
must therefore be used as versioned research assumptions, not presented as
current production or live-chain behavior.
