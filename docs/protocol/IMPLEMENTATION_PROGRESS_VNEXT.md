# FundTogether VNext — Implementation Progress

> **Status:** Live implementation ledger for the pure-decentralized target.
> This is evidence of the listed slices only; it is not a claim that the full
> protocol is deployed or financially complete.

**Roadmap:** [A–Z VNext build roadmap](../superpowers/plans/2026-10-20-vnext-a-z-build-roadmap.md)
**Specification:** [Protocol Specification V1](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
**Remediation registry:** [Parameter Registry V2](parameters-v2-remediation.md)
**Runtime boundary:** local Anvil/MockUSDC only; no public-chain acceptance

## Implemented and verified slices

| Gate | Artifact | Evidence |
| --- | --- | --- |
| A | Spec/source-of-truth links | Docs link audit passes |
| B | `parameters-v1.md` | Registry exists; blocking financial decisions remain explicit |
| C | `THREAT_MODEL_VNEXT.md` | T01–T13 and fail-closed requirements documented |
| D | `VNextTypes.sol`, `JuryTypes.sol`, state-machine docs | Focused state tests: 7 passed |
| E | `IVNextEvents.sol` | `forge build` succeeds; event vocabulary compiles |
| F | `JuryRegistry.sol` | Focused registry tests: 6 passed; bounded settlement and reward claim |
| G/H | `JuryReview.sol` | Focused review tests: 9 passed; multi-court, commit–reveal, appeal, retry and final settlement |
| I | `CampaignEscrowVNext.sol` | Campaign/funding/publication gate tests: 6 passed |
| J | `CampaignEscrowVNext.sol` | Evidence/revision tests: 4 passed |
| K | `JuryReview.sol`, `CampaignEscrowVNext.sol` | Appeal/challenge hooks exist; focused review/campaign tests pass |
| L | `CampaignEscrowVNext.sol` | Payout/refund/challenge tests: 4 passed; conservation/failure-transfer fuzz suite: 3 passed |
| P | `DeployVNext.s.sol`, `deploy-vnext.cjs`, `verify-vnext-runtime.cjs`, `vnext-deployment.ts` | Foundry script compiles; runtime verifier/policy identity tests: 8 passed; one-time wiring is executable |
| P0/P1 remediation | `JuryReview.sol`, `JuryRegistry.sol`, `CampaignEscrowVNext.sol` | Retry/settlement/stake/liveness/budget/refund/court-order regressions covered; current full Foundry suite: 129 passed |
| Q/R | `vnext-indexer.service.ts`, `vnext-event-projector.ts`, VNext Drizzle schema | Persistent event/projection/checkpoint transaction; current post-remediation projector/indexer tests: 10 passed |
| S/T | `vnext.controller.ts`, `vnext-evidence-integrity.ts` | Read-only projection API, SHA-256 evidence check and focused evidence tests added |
| U/V/W/X | `VNextProtocolPage.tsx` | Read-only VNext protocol/campaign projection surface added; Creator/Backer/Judge wallet journeys remain incomplete |

## Current executable behavior

The current VNext contract slice can:

- accept a configured stake token and immutable review-controller boundary;
- deposit and withdraw only available Judge stake;
- reserve case stake without exceeding available balance;
- settle a case stake once with a bounded slash amount;
- create a review case from the configured Campaign caller;
- enroll non-Creator Judges that already reserved case stake;
- freeze a randomness-provider seed after enrollment;
- assign `floor(N / 3)` deterministic three-Judge courts without Judge overlap;
- enforce court-specific commit authorization;
- verify commit–reveal vote preimages;
- mark a court `INVALID` when any assigned Judge fails to reveal;
- aggregate court results into PASS, FAIL, TIED or protocol failure;
- open bounded appeal rounds with a fresh, non-overlapping Judge pool and
  return an appeal bond after finalization;
- open bounded retry rounds for no-quorum, randomness, invalid-court and tied
  outcomes; retries use a fresh root-case Judge pool and end in protocol
  failure after the frozen retry limit;
- settle Judge locks once, slash only a minority on substantive outcomes and
  expose pull-claim rewards from the slash pool;
- create a frozen campaign proposal with a publication review gate; only a
  canonical publication `FINAL_PASS` opens contribution funding, without
  Resolver/Admin approval;
- finalize funding permissionlessly, open full funding-failure refunds, and
  keep successful funds in contract custody;
- enforce a frozen 7-day milestone submission and correction window with
  permissionless timeout-to-refund paths;
- require the immutable milestone budget total to equal the funding goal;
- bind milestone evidence revisions to one review case each, allow bounded
  correction after `VERDICT_FAIL`, open eligible Backer challenge cases;
- pay an exact milestone budget only after final PASS and the challenge window,
  and open deterministic, claim-order-independent refunds on terminal failure;
- register every review case with a risk-adjusted Judge stake requirement and
  release unenrolled reservations after the enrollment deadline;
- preserve `R = P + F + E` in the tested partial-payout/refund and failed-token
  transfer paths.

## Not implemented yet

The following remain incomplete and must not be inferred from the passing slice:

- non-reveal penalty remains the explicitly frozen local value `0`; production
  penalty economics and service-fee funding are not approved;
- full appeal/retry contribution eligibility and evidence availability wiring
  in the backend;
- production batch/pull settlement and gas policy for the maximum 300-Judge
  snapshot;
- complete invariant coverage for all review liveness and multi-court paths;
- wallet transaction journeys for Creator, Backer and Judge, including
  commit–reveal and reward claim;
- fresh local runtime deployment and end-to-end acceptance.

## Post-PR #10 remediation gate evidence — 2026-10-20

This is fresh evidence from the isolated remediation worktree. It covers the
listed local slices only; it is not a production deployment or a complete
security audit.

```text
contracts: forge test
  129 passed, 0 failed, 0 skipped, 11 suites

backend: npm run build
  exit 0

backend: npm run test:vnext-runtime
  8 passed, 0 failed

backend: focused VNext projector/indexer Jest command
  2 suites passed; 10 tests passed, 0 failed

repository: git diff --check
  exit 0
```

The fresh gate evidence establishes that:

- milestone timeout and evidence submission are guarded by campaign state, the
  first unpaid milestone and non-zero deadlines; the valid path is tested only
  after successful funding;
- `MilestoneConfigured` and `MilestoneStateChanged` carry the canonical
  milestone projection payload, and persistent/in-memory handlers are
  idempotent; zero bytes32 values are normalized before nullable projection
  writes;
- runtime verification retains deployment identity and `policyHash` checks,
  then compares the complete frozen campaign/review getter and constant matrix,
  including `maxEligibleJudges`;
- event identity remains `(stream_id, transaction_hash, log_index)`, while
  block identity remains `(stream_id, block_hash, log_index)`; no index redesign
  was made for the withdrawn `logIndex` false positive;
- no Resolver, Admin or backend financial/review authority was added by this
  remediation.

The live Anvil/PostgreSQL acceptance script was not rerun in this isolated
worktree because its local `.local/fundtogether/backend.env` and running
services are not present here. Earlier runtime acceptance output must therefore
not be reused as post-remediation evidence. A production security audit,
public-chain deployment and real-money acceptance remain out of scope.

Every later gate must update this file with the exact command and result. A
green test is evidence only for the behavior it covers.
