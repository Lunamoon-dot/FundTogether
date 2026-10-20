# FundTogether VNext — Local Release Report

**Date:** 2026-10-21
**Decision:** local research prototype verified for the listed evidence slices;
not a public-chain release, real-money release, or claim of trustless truth.

## Scope

This report covers the pure-decentralized VNext target only:

- one COMICS_ARTBOOK campaign, STANDARD tier and DIGITAL_DOWNLOAD PDF;
- MockUSDC on Anvil chain `31339`;
- permissionless campaign/funding/payout/refund transitions;
- stake-backed three-Judge courts with commit–reveal and two-of-three quorum;
- PostgreSQL projections derived from canonical contract events.

Physical fulfilment, NFT/marketplace behavior, public-chain deployment and
real-money custody are outside this decision.

## Evidence completed

| Area | Result | Boundary |
| --- | --- | --- |
| Solidity build/tests | 136 passed, 0 failed, 0 skipped | Docker Foundry; historical contracts are included for regression visibility |
| Stateful invariants | Campaign and Jury handlers pass 256 runs × 128,000 calls; conservation fuzz and recorded-seed state-machine fuzz pass | Local MockUSDC assumptions; not a production gas proof |
| Backend | 9 focused VNext suites / 34 tests passed; build passed | VNext-focused Jest selection, not a claim that every historical suite is green |
| Frontend | 207 tests passed; production build passed | Existing large-bundle warning remains |
| Direct runtime | Fresh Anvil + isolated PostgreSQL scenario passed; payout/refund/no-quorum/tie/appeal/correction/replay paths exercised; contract balance ended at zero | One local chain and temporary database |
| Browser runtime | SIWE + EIP-6963 wallet link, Creator campaign creation, direct Judge publication resolve/materialization, Backer funding, private evidence upload, Judge UI commit/reveal, settlement, exact payout, underfunded refund allocation freeze and refund claim passed twice from clean Anvil genesis | Publication materialization is a direct permissionless contract call in this runner; this is local browser acceptance, not production service-topology or human-wallet acceptance |

The browser run also caught and fixed a projection defect: the contract moves a
successful `FundingFinalized` campaign directly to `MILESTONES_RUNNING (3)`,
while the projector had incorrectly retained the unused intermediate
`FUNDED (2)` value. Both the pure projector and PostgreSQL projector now map the
canonical event to state `3`.

## Release blockers

The following prevent a broader release decision:

1. Publication resolution/materialization is exercised by a direct
   permissionless contract call in the browser runner; the Creator publication
   UI is not claimed as part of this vertical browser fixture.
2. Non-reveal penalty and service-fee/reviewer-budget economics remain frozen
   or unapproved; the local policy uses non-reveal penalty `0`.
3. The configured local batch limit is measured, but production sizing for the
   maximum 300-Judge snapshot is not established.
4. Evidence availability is an off-chain storage dependency. The API/UI expose
   timeout and retry status, but cannot prove that evidence is factually true.
5. The security scan history includes incomplete/usage-limited scans; no clean
   public-chain security conclusion is authorized.

## Decision

The repository may describe the named slices as a **local research prototype
verified**. It must not describe VNext as public-chain ready, trustless truth,
audited, or safe for real money.

