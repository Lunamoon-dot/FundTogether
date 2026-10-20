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
challenge entrypoints. Forge is unavailable on the Windows host PATH, but the
checked-in Foundry container is available for reproducible contract builds and
tests. Full web/API/browser acceptance remains separate.

## Implemented and verified slices

| Gate | Artifact | Evidence |
| --- | --- | --- |
| A | Spec/source-of-truth links | Docs link audit passes |
| B | `parameters-v1.md` | Registry exists; blocking financial decisions remain explicit |
| C | `THREAT_MODEL_VNEXT.md` | T01–T13 and fail-closed requirements documented |
| D | `VNextTypes.sol`, `JuryTypes.sol`, state-machine docs | Focused state tests: 11 passed |
| E | `IVNextEvents.sol` | `forge build` succeeds; event vocabulary compiles |
| F | `JuryRegistry.sol` | Focused registry tests: 14 passed; bounded settlement and reward claim |
| G/H | `JuryReview.sol` | Focused review tests: 20 passed; multi-court, commit–reveal, appeal, retry, final ruling and bounded settlement |
| I | `CampaignEscrowVNext.sol` | Campaign/funding/publication gate tests: 12 passed |
| J | `CampaignEscrowVNext.sol` | Evidence/revision tests: 6 passed |
| K | `JuryReview.sol`, `CampaignEscrowVNext.sol` | Appeal hooks exist; the active local policy keeps the challenge window passive and disables challenge entrypoints |
| L | `CampaignEscrowVNext.sol` | Payout/refund/challenge tests: 9 passed; conservation/failure-transfer fuzz suite: 3 passed |
| O | `JuryReview.sol`, `JuryRegistry.sol`, `CampaignEscrowVNext.sol`, `parameters-v2-remediation.md` | Gas profiles for batches 1/2/10/32, 300-Judge capped settlement, resumable partial batches, wallet-isolated reward/refund claims, and SafeERC20/state-ordering review are recorded |
| N (partial) | `contracts/test/invariant/VNextCampaignInvariant.t.sol`, `VNextJuryInvariant.t.sol`, `contracts/test/fuzz/VNextStateMachine.t.sol` | Stateful conservation/payout and court uniqueness/stake invariants pass at 256 runs × 128,000 calls per harness; recorded-seed state-machine fuzz passes with arbitrary callers, repeated actions and deadline jumps |
| P | `DeployVNext.s.sol`, `deploy-vnext.cjs`, `verify-vnext-runtime.cjs`, `vnext-deployment.ts` | Foundry script compiles; runtime verifier/policy identity tests: 6 passed; one-time wiring is executable |
| P0/P1 remediation | `JuryReview.sol`, `JuryRegistry.sol`, `CampaignEscrowVNext.sol` | Retry/settlement/stake/liveness/budget/refund/court-order regressions covered; current full Foundry suite: 136 passed |
| Q/R | `vnext-indexer.service.ts`, `vnext-event-projector.ts`, `IVNextEvents.sol`, VNext Drizzle schema | Persistent event/projection/checkpoint transaction; milestone review state/case-pointer events now project retry, appeal, ruling, correction and timeout transitions; Backer contribution/refund, challenge, court-summary and Judge ledger projections added; replay/crash/refund/completion tests remain the verification boundary |
| S/T/X | `vnext.controller.ts`, `vnext-evidence.service.ts`, `vnext-evidence.controller.ts`, `vnext.schema.ts` | Read-only projection API now exposes authenticated Backer/Judge indexed read models, assigned-Judge review reads, challenge history, indexer checkpoint/lag status, plus private VNext case-evidence upload/read ACL, canonical hash verification, short-lived user-bound evidence tickets and explicit storage-timeout/retry status |
| U/V/W/X | `VNextProtocolPage.tsx`, `VNextCreateCampaignPanel.tsx`, `VNextActionPanel.tsx`, `VNextJudgePage.tsx`, `VNextEvidencePanel.tsx`, `backend/scripts/campaigns/vnext-browser-e2e.cjs` | VNext Creator campaign creation/publication finalization, private evidence, Backer actions and Judge stake/commit–reveal/reward surface added; Judge workspace now requests assigned cases only; real SIWE + EIP-6963 browser Creator-create journey passes from fresh genesis and after long chain-time jumps, with deadline derived from latest chain block; full browser funding/review/payout journey remains incomplete |

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
- settle each final Judge case's stake and winner reward in permissionless
  batches capped at 32 work units, emit canonical settlement progress, and
  block publication/milestone materialization until every root, appeal and
  retry case is settled;
- expose evidence availability as a read-only policy boundary: missing or
  unavailable bytes block Judge commit/reveal before the canonical timeout,
  and after timeout the API/UI expose only the on-chain retry/protocol-failure
  path;
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
- emit and index canonical milestone review state/case-pointer events instead
  of inferring retry, appeal, ruling, correction or timeout state from votes or
  receipts;
- keep VNext case evidence in private storage, verify its SHA-256 bytes against
  the canonical on-chain evidence hash, and authorize only the Creator or an
  assigned Judge.

## Not implemented yet

The following remain incomplete and must not be inferred from the passing slice:

- non-reveal penalty remains the explicitly frozen local value `0`; production
  penalty economics and service-fee funding are not approved;
- full appeal/retry contribution eligibility and evidence availability wiring
  for every review round in the backend and wallet journeys;
- production gas measurement and settlement economics for the maximum
  300-Judge snapshot; the local implementation is batch-bounded at 32 work
  units per transaction but has not yet been production-sized;
- complete invariant coverage for all review liveness and multi-court paths;
- appeal/retry dossier ACL now follows the root case and supports the canonical
  Challenger evidence owner; storage availability remains an off-chain
  limitation, while the local API/UI now expose timeout/retry status without
  creating a ruling or moving funds;
- full web/API/browser runtime acceptance and long-lived service orchestration;
  the isolated VNext chain/deploy/indexer acceptance and the browser
  Creator-create slice now pass, but they do not yet prove the complete
  browser funding/review/payout journey or production service topology.

## Verification record

The pre-freeze contract suite reported 117 passing tests, including historical
Resolver contracts and the new VNext focused suites. The historical tests are
kept for regression visibility and are not counted as proof of pure-decentralized
financial behavior.

Those counts predate the policy-freeze delta above; they are retained as
historical evidence, not as current verification of the changed behavior.

Current contract verification was rerun in the Foundry container because the
host Windows checkout does not have Forge on PATH:

```text
forge build -> success (solc 0.8.24)
forge test --summary -> 129 passed, 0 failed, 0 skipped
focused VNext unit suites -> 73 passed
VNextConservation invariant suite -> 3 passed (256-case fuzz)
```

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
```

The full pre-freeze command was `forge test` → 117 passed, 0 failed, 0
skipped across 11 suites. The suite includes historical Resolver tests for
regression visibility; the current VNext evidence is the focused
VNext/invariant rows above plus the current full run. The checked-in generated
CampaignEscrowVNext, JuryRegistry and JuryReview artifacts were regenerated
from that successful build.

Backend focused evidence from the prior remediation checkout: VNext
indexer/projector 8 passed; runtime identity 6 passed; real PostgreSQL VNext
replay check passed; `npm run build` completed. These are historical evidence.
The prior runtime acceptance evidence used local Anvil chain `31339` after
deploying policy V2 and is not a current acceptance run for this branch.
Frontend evidence: `npm test` → 199 passed;
`npm run build` completed with only the existing large-bundle warning.

Current policy-freeze branch evidence after the bounded-settlement,
escrow-boundary and evidence-availability slices:

```text
frontend: npm test -> 207 passed, 0 failed
frontend: npm run build -> success (existing large-bundle warning)
frontend: VNext static journey tests remain covered by the 207-test suite; the
route regression keeps `/campaigns/vnext` out of the legacy public campaign
detail matcher
backend: `npm run build` -> success; isolated migration audit -> PASS
backend: focused VNext Jest invocation with `--testMatch="**/*.spec.ts"` -> 11 suites, 38 passed, 0 failed
backend: real PostgreSQL crash/replay test -> 1 suite, 1 passed; event,
projection and checkpoint rollback was verified before exactly-once replay
backend: VNext runtime boot -> `GET /health` returned `200`, protocol
`FUNDTOGETHER_VNEXT`, chain `31339`, campaign escrow
`0xdc64a140aa3e981100a9beca4e685f962f0cf6c9`
backend: `npm run test:vnext-acceptance` now creates/migrates/drops an isolated
PostgreSQL database itself; direct fresh-chain acceptance -> `PASS`, protocol
`FUNDTOGETHER_VNEXT`, chain `31339`, payout campaign `0`, refund campaign `1`,
contract balance `0`
browser: `npm run test:vnext-browser` -> `PASS` from fresh Anvil genesis and
again after the direct acceptance advanced Anvil time and created six prior
campaigns; real SIWE session, EIP-6963 test wallet link, VNext Creator campaign
creation, receipt confirmation, canonical indexer polling and `CREATED`
projection reload all passed; deadline creation uses latest chain block time;
no legacy `/public/campaigns/vnext` request remained
contracts: focused Gate O additions -> `BatchSettlement` 3 passed,
`JuryRegistry` 14 passed, `PayoutRefund` 9 passed; the pre-fuzz full
`forge test --summary` run -> 134 passed, 0 failed, 0 skipped
contracts: Docker Foundry forge build -> success (solc 0.8.24); full
forge test -> 136 passed, 0 failed, 0 skipped; generated VNext ABIs refreshed.
contracts: `test/fuzz/VNextStateMachine.t.sol` -> 2 passed with a recorded
`--fuzz-seed 0x5eed5eed`; the fuzz sequence runs 128 cases and includes
arbitrary callers, repeated funding finalization/refund attempts and deadline
jumps. Conservation is asserted after every attempted action.
The host still lacks native Forge/Anvil; contract checks are container-backed.
The acceptance run used a temporary Docker Anvil plus a newly created isolated
PostgreSQL database and passed the persistent projection assertions; the
temporary database was dropped after verification.
```

The repository's default backend `npm test` currently discovers zero tests due
to its Jest pattern, while the explicit VNext config above discovers the
checked-in `src/**/*.spec.ts` suites. A full historical backend run also needs
RPC `127.0.0.1:9548` and currently cannot be treated as a green VNext runtime
acceptance result.

The current backend/frontend results do not imply public deployment or full
browser acceptance. The VNext transaction endpoint reports `INDEXING` until a
canonical indexed event exists; a successful token approval intentionally ends
at the receipt boundary because the VNext indexer does not own ERC-20 events.

Every later gate must update this file with the exact command and result. A
green test is evidence only for the behavior it covers.
