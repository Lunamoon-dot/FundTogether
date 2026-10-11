# HED-MVP-1 verification record

This record covers the isolated local HED deployment only. It is not a claim
about the historical baseline/Workflow B deployments, public-chain deployment,
or real-money readiness.

## Automated evidence

| Scope | Evidence | Result |
| --- | --- | --- |
| Financial state and authority | `forge test --match-contract HedFundingAndReservationTest` | 26 passing tests, including a 256-run reserve/custody fuzz: reserve, single open request, vendor acknowledgement, deposit caps, partial delivery, challenges, return invalidation, primary/backup takeover, wind-down and refunds. |
| Artifact and deployment identity | `npm.cmd --prefix backend run artifacts:hed` and `node backend/scripts/hed/artifact-contract.test.cjs` | Generated ABI is bound to the HED contract; malformed or cross-deployment manifests are rejected. |
| API schemas and evidence rules | Five focused HED Jest suites | 7 passing tests for campaign/request hashes, review schema, evidence hash and HED stream identity. |
| Local vertical journey | `npm.cmd --prefix backend run smoke:hed` | Full funding → activation → purchase → delivery candidate/final → transport in the same activity → delivery candidate/final → outcome verified. The smoke checks MockUSDC vendor balance, selected report hashes and REST/indexer projection. |
| Runtime health | `GET http://127.0.0.1:3002/health` | HED deployment identity and indexed checkpoint must both report `ready`. |

## HED-MVP mapping

- MVP-T01 through T11 are covered principally by the Solidity suite and the
  vertical smoke. The tests are local MockUSDC evidence, not business proof.
- MVP-T12 is covered by private/public evidence separation, server-derived
  public hashes and state/hash-gated public download. Browser interaction is
  still manual work.
- MVP-T13 has deployment identity checks and an idempotent, canonical-block
  indexer. Forced reorg/replay/restart needs a dedicated integration run before
  this case can be called complete.
- MVP-T14 is partially covered by outcome state and case guards; a human must
  still judge incorrect/insufficient outcome evidence.
- MVP-T15 is partly technical (one open request and frozen recipient/hash).
  Duplicate invoices, related parties and multiple-wallet evasion remain an
  ADMIN/reviewer process limitation for this MVP.

## Explicitly pending human acceptance

- Brave/MetaMask account/chain changes, signing, replacement/pending UX and
  reload recovery.
- Independent reviewer assessment of contradictory, incomplete and false
  evidence.
- Vendor agreement with deposit and waiting terms; donor comprehension of
  reserved versus refundable custody.
- Any legal, fiat, custody or production-chain decision.
