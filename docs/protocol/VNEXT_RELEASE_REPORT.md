# FundTogether VNext — Local Release Report

**Date:** 2026-10-20  
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
| Backend | 11 focused suites / 38 tests passed; build passed | VNext-focused Jest selection, not a claim that every historical suite is green |
| Frontend | 207 tests passed; production build passed | Existing large-bundle warning remains |
| Direct runtime | Fresh Anvil + isolated PostgreSQL scenario passed; payout/refund/no-quorum/tie/appeal/correction/replay paths exercised; contract balance ended at zero | One local chain and temporary database |
| Browser runtime | SIWE + EIP-6963 wallet link + Creator campaign creation + receipt/indexer/projection reload passed from fresh genesis and after large chain-time jumps | Full browser funding/review/payout journey remains open |

## Release blockers

The following prevent a broader release decision:

1. Full browser Backer/Judge funding, review, payout and refund journeys have
   not been accepted as one end-to-end browser scenario.
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

