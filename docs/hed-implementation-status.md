# HED-MVP-1 implementation status

This is local implementation evidence for the separate HED deployment. It is
not a production-readiness claim and does not alter historical baseline or
Workflow B obligations.

## H0--H7 implementation audit

| Stage | Status | Evidence |
| --- | --- | --- |
| H0 | DONE | `docs/hed-mvp-design.md` defines state, authority, custody and acceptance; contract tests exercise funding, reserve, delivery, outcome, case, return, wind-down and refund guards. |
| H1 | DONE | HED reuses authenticated accounts, organization membership, wallet proof and private/public storage boundaries; additions are isolated from A/B. |
| H2 | DONE | `FundTogetherDisbursement.sol` and `HedFundingAndReservationTest` cover 26 financial/authority cases, including a 256-run custody fuzz. |
| H3 | DONE | Additive HED migrations, frozen hashes/reviews, deployment-bound indexer, restart and forced-reorg replay are implemented. |
| H4 | DONE | HED-mode OWNER, ADMIN, RESOLVER, vendor and donor routes use receipt and indexed-state gates; wrong chain/account and missing evidence keep actions disabled or rejected. |
| H5 | DONE | Isolated local journey verifies funding → purchase → transport → outcome, on-chain balances, receipts and projection; reorg smoke removes the orphaned projection. |
| H6 | DONE | HED mode routes new campaign creation through `HedOrganizationCampaigns`; it does not fall back to milestone creation. A/B remain readable in their own modes. |
| H7 | DONE | This status, the HED runbook and verification record identify repeatable commands, deployment scope and human-acceptance limits. |

## Reproducible local acceptance

Start the isolated runtime first, then run one command from the repository root:

```powershell
& .\backend\scripts\hed\start-services.ps1 -SkipBuild
npm.cmd --prefix backend run acceptance:hed
```

`acceptance:hed` runs only HED evidence:

1. `HedFundingAndReservationTest` (financial authority and custody).
2. HED artifact generation and identity checks.
3. HED backend build and schema/review/indexer tests.
4. HED frontend build.
5. Purchase → transport → verified outcome smoke with MockUSDC balance and
   indexed-projection checks.
6. `evm_snapshot`/`evm_revert` reorg smoke and immutable runtime-health check.

The process never resets the chain, database, storage, wallets or A/B runtime.
Smoke campaigns are new HED-local records and the reorg case returns the chain
to its prior snapshot.

## Requirement mapping

| Design acceptance | Local evidence |
| --- | --- |
| MVP-T01--T04 | Funding/refund, one-request reserve, exact custody fuzz, vendor acknowledgement/deposit-cap/return tests. |
| MVP-T05--T07 | Partial delivery, challenge/final guards, residual release, scoped primary/backup takeover and timeout tests. |
| MVP-T08--T11 | Purchase → transport in one activity, outcome gate, wind-down, late returns and refund-accounting tests. |
| MVP-T12 | Private/public evidence package schema, server-derived hashes, frozen review records and public hash/state gate. |
| MVP-T13 | Deployment-identity test, idempotent canonical replay, restart verification and `smoke:hed:reorg`. |
| MVP-T14 | Outcome candidate/case/verification guards; real-world evidence quality remains human review. |
| MVP-T15 | One live request, frozen request/vendor terms and related-party declaration are technical guards; invoice duplication and collusion remain reviewer limits. |

## Explicitly pending human acceptance

- Brave/MetaMask account and chain changes, signing, replacement/pending/reload
  UX and refund claim behavior.
- Independent assessment of false, contradictory or incomplete evidence.
- Vendor agreement with deposit and waiting terms, and donor comprehension of
  reserved versus refundable custody.
- Legal, fiat, custody and public-chain decisions.

Automated local checks do not mark these as PASS. See
[`hed-mvp-runbook.md`](./hed-mvp-runbook.md) and
[`hed-mvp-verification.md`](./hed-mvp-verification.md) for runtime and
command-level evidence.
