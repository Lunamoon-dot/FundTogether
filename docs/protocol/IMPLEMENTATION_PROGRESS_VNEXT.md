# FundTogether VNext — Implementation Progress

> **Status:** Live implementation ledger for the pure-decentralized target.
> This is evidence of the listed slices only; it is not a claim that the full
> protocol is deployed or financially complete.

**Roadmap:** [A–Z VNext build roadmap](../superpowers/plans/2026-10-20-vnext-a-z-build-roadmap.md)
**Specification:** [Protocol Specification V1](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
**Wallet journey slice:** [Wallet Journeys Implementation Spec](../superpowers/specs/2026-10-20-vnext-wallet-journeys-design.md)
**Remediation registry:** [Parameter Registry V2](parameters-v2-remediation.md)
**Runtime boundary:** local Anvil/MockUSDC only; no public-chain acceptance

**Policy-freeze delta:** The active local policy additionally requires funding
finalization only after its deadline, an initialized milestone deadline before
permissionless expiry, contributor conflict exclusion, publication appeals for
Creator verdict-fail cases, deterministic reward-dust allocation and disabled
challenge entrypoints. Forge is unavailable in the current Windows checkout,
so the focused Solidity suite must be rerun before this delta is called green.

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
| K | `JuryReview.sol`, `CampaignEscrowVNext.sol` | Appeal hooks exist; the active local policy keeps the challenge window passive and disables challenge entrypoints |
| L | `CampaignEscrowVNext.sol` | Payout/refund/challenge tests: 4 passed; conservation/failure-transfer fuzz suite: 3 passed |
| P | `DeployVNext.s.sol`, `deploy-vnext.cjs`, `verify-vnext-runtime.cjs`, `vnext-deployment.ts` | Foundry script compiles; runtime verifier/policy identity tests: 6 passed; one-time wiring is executable |
| P0/P1 remediation | `JuryReview.sol`, `JuryRegistry.sol`, `CampaignEscrowVNext.sol` | Retry/settlement/stake/liveness/budget/refund/court-order regressions covered; full Foundry suite: 117 passed |
| Q/R | `vnext-indexer.service.ts`, `vnext-event-projector.ts`, VNext Drizzle schema | Persistent event/projection/checkpoint transaction; replay/crash/refund/completion tests: 8 passed; real PostgreSQL replay check passed |
| S/T | `vnext.controller.ts`, `vnext-evidence-integrity.ts` | Read-only projection API, SHA-256 evidence check and focused evidence tests added |
| U/V/W/X | `VNextProtocolPage.tsx`, `VNextCreateCampaignPanel.tsx`, `VNextActionPanel.tsx`, `VNextJudgePage.tsx` | VNext Creator campaign creation/publication finalization, Backer actions and Judge stake/commit–reveal surface added; full journey and runtime acceptance remain incomplete |

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
- finalize funding permissionlessly only after the funding deadline, open full
  funding-failure refunds, and keep successful funds in contract custody;
- enforce a frozen 7-day milestone submission and correction window with
  permissionless timeout-to-refund paths;
- require the immutable milestone budget total to equal the funding goal;
- bind milestone evidence revisions to one review case each, allow bounded
  correction after `VERDICT_FAIL`, exclude campaign contributors from Judge
  enrollment and keep challenge entry disabled;
- pay an exact milestone budget only after final PASS and the challenge window,
  and open deterministic, claim-order-independent refunds on terminal failure;
- register every review case with a risk-adjusted Judge stake requirement and
  release unenrolled reservations after the enrollment deadline;
- preserve `R = P + F + E` in the tested partial-payout/refund and failed-token
  transfer paths.
- expose permissionless Creator/Backer actions from the VNext projection page;
  transaction UI distinguishes wallet request, submitted hash, successful
  receipt and canonical indexer confirmation;
- expose a separate VNext Judge route for stake deposit/withdrawal,
  case-stake reservation, enrollment and assigned commit–reveal actions;
- validate VNext genesis, deployed bytecode and campaign ABI identity before a
  wallet transaction is signed.

## Not implemented yet

The following remain incomplete and must not be inferred from the passing slice:

- non-reveal penalty remains the explicitly frozen local value `0`; production
  penalty economics and service-fee funding are not approved;
- full appeal/retry contribution eligibility and evidence availability wiring
  in the backend and wallet journeys;
- production batch/pull settlement and gas policy for the maximum 300-Judge
  snapshot;
- complete invariant coverage for all review liveness and multi-court paths;
- complete Creator multi-milestone/evidence-storage journey,
  Backer balances and refund entitlement reads, Judge reward claim and exact
  assigned-dossier ACL;
- fresh local runtime deployment and end-to-end acceptance.

## Verification record

The pre-freeze contract suite reported 117 passing tests, including historical
Resolver contracts and the new VNext focused suites. The historical tests are
kept for regression visibility and are not counted as proof of pure-decentralized
financial behavior.

Those counts predate the policy-freeze delta above; they are retained as
historical evidence, not as current verification of the changed behavior.

The pre-freeze VNext test snapshot was:

```text
test/unit/VNext/StateMachine.t.sol  7 passed
test/unit/VNext/JuryRegistry.t.sol  6 passed
test/unit/VNext/JuryReview.t.sol    9 passed
test/unit/VNext/CampaignCreation.t.sol  3 passed
test/unit/VNext/FundingEscrow.t.sol 3 passed
test/unit/VNext/MilestoneEvidence.t.sol 4 passed
test/unit/VNext/PayoutRefund.t.sol 4 passed
test/invariant/VNextConservation.t.sol 3 passed (256-case fuzz)

The full pre-freeze command was `forge test` → 117 passed, 0 failed, 0
skipped across 11 suites. The suite includes historical Resolver tests for
regression visibility; the VNext evidence is the focused VNext/invariant rows
above. Forge is unavailable in the current worktree, so these counts are not
current verification of the policy-freeze delta.

Backend focused evidence from the prior remediation checkout: VNext
indexer/projector 8 passed; runtime identity 6 passed; real PostgreSQL VNext
replay check passed; `npm run build` completed. These are historical evidence.
The prior runtime acceptance evidence used local Anvil chain `31339` after
deploying policy V2 and is not a current acceptance run for this branch.
Frontend evidence: `npm test` → 199 passed;
`npm run build` completed with only the existing large-bundle warning.

Current policy-freeze branch evidence after the wallet-journey slice:

```text
frontend: npm test -> 205 passed, 0 failed
frontend: npm run build -> success (existing large-bundle warning)
backend: focused VNext transaction-status Jest helper -> 3 passed, 0 failed
backend: npm run build -> success
contracts: Forge/Anvil verification remains pending because the tools are not
available in this Windows environment.
```

The current backend/frontend results do not imply contract deployment or
runtime acceptance. The VNext transaction endpoint reports `INDEXING` until a
canonical indexed event exists; a successful token approval intentionally ends
at the receipt boundary because the VNext indexer does not own ERC-20 events.

Every later gate must update this file with the exact command and result. A
green test is evidence only for the behavior it covers.
