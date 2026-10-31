# Pure Decentralized FundTogether Protocol Design

> **Status:** Current design decision, 2026-10-20. VNext contract,
> projection/API and Creator/Backer/Judge wallet slices are implemented; a
> consolidated launcher and fresh full-runtime acceptance are still pending.
>
> **Detailed source:** [FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md](../../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)

## Intent

Reset the FundTogether architecture around a pure decentralized protocol. The
protocol must allow permissionless campaign creation and use stake-backed Judge
courts for publication, milestone, completion and challenge decisions. No
trusted Resolver or platform administrator may override a court or move funds.

## Design

The Campaign contract owns escrow, review cases, Judge assignment, stake locks,
votes, quorum, challenge windows, milestone release, payout, refund and
timeouts. The backend owns authentication, validation, private storage and
indexed read models. The backend never chooses a Judge outcome and never holds
a financial signing key.

Each review case has a three-Judge reference court. Two PASS votes resolve PASS;
two FAIL votes resolve FAIL. At larger scale, the V1 reference can form
`floor(N/3)` courts from the eligibility snapshot, with an explicit second-layer
aggregation rule. The local VNext contract slice uses this multi-court rule;
production batch/pull settlement and large-snapshot gas limits remain an
acceptance gate.

The Creator submits a milestone dossier and content hash before the court opens.
The review uses commit–reveal, appeal-pool separation and bounded retries.
Only `FINAL_PASS` followed by the configured challenge condition can unlock the
exact frozen milestone budget. `VERDICT_FAIL` follows bounded correction or
refund rules. `PROTOCOL_FAIL` is an operational terminal result, not a factual
finding against the Creator, and never becomes an implicit PASS.

## Accepted assumptions

The protocol accepts wallet Sybil, stake concentration, collusion, bribery,
incorrect majority decisions, inactive Judges and evidence that is technically
unchanged but factually false. The protocol claims transparent custody and
decision history, not automatic truth about off-chain work.

## Required policy before production/runtime acceptance

The decentralization decision is complete. The local research values are
explicit and versioned in `fundtogether-vnext-local-v1`. A separate production
policy is still required for randomness/liveness, reviewer fee funding,
non-reveal economics, evidence availability, large-snapshot settlement and any
real-asset deployment. These values must be explicit and versioned before a
production or public-chain claim.

## Verification target

- contract invariants prove no over-release, double payout, double refund or
  unauthorized decision;
- Foundry tests cover publication, milestone, challenge, timeout and refund
  cases;
- indexer replay is idempotent;
- backend cannot manufacture a case result;
- UI distinguishes submitted, mined, indexed and canonical resolution states;
- local end-to-end tests use multiple Creator, Backer and Judge wallets.
