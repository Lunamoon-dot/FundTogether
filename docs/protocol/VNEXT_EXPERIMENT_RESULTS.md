# FundTogether VNext — Experiment Results

**Date:** 2026-10-20  
**Method:** deterministic local Anvil/MockUSDC scenarios and contract tests.
These are implementation acceptance results, not a causal comparison or a
claim that the protocol is economically optimal.

## Scenario matrix

| Scenario | Observed result | Evidence boundary |
| --- | --- | --- |
| Publication PASS → funding → milestone PASS → payout | Exact milestone budget paid; duplicate payout rejected; escrow ended at zero in the direct scenario | One local policy and one configured campaign shape |
| Funding below goal | Full refund path opened after the deadline; duplicate refund rejected | Snapshot/pro-rata allocation is covered by focused tests |
| No quorum / protocol failure | Bounded retry path reached protocol failure rather than looping forever | Retry count is local-policy frozen |
| Tied multi-court result | Retry opened with a fresh case pointer | Not a truth or collusion-resistance measurement |
| Appeal | Appeal used a fresh non-overlapping Judge pool and final ruling materialized | Appeal bond economics remain local-policy scoped |
| Verdict FAIL → correction | One bounded correction revision passed and paid; correction timeout opened refund | One correction is the configured local limit |
| Failed transfer / duplicate settlement | State rollback and duplicate protection passed in focused contract tests | Uses MockUSDC behavior, not adversarial production tokens |
| Indexer replay/crash | Persistent event, projection and checkpoint transaction rolled back together, then replayed exactly once | PostgreSQL isolated test; no reorg simulation |

## Measured limits

The bounded settlement test recorded the following gas profiles:

| Settlement batch | Gas |
| ---: | ---: |
| 1 | 122,893 |
| 2 | 160,394 |
| 10 | 597,226 |
| 32 | 1,833,341 |

The local implementation caps settlement work at 32 units per transaction and
tests a 300-Judge input through repeated bounded batches. These measurements do
not establish a production gas limit, validator economics or public-RPC
viability.

## Baselines not yet measured

The roadmap asks for comparisons against immediate payout, centralized Resolver
approval, flat majority and alternative multi-court/slashing policies. Those
experiments have not been run in a controlled harness, so this release does not
report false PASS/FAIL rates, attack success rates, finality distributions,
reward inequality or reviewer capital efficiency.

## Reproduction commands

```text
docker run --rm -v "${PWD}:/workspace" -w /workspace/contracts ghcr.io/foundry-rs/foundry:latest "forge test --summary"
backend: npm run test:vnext-acceptance
backend: npm run test:vnext-browser
frontend: npm test
frontend: npm run build
```

The acceptance commands require a disposable Anvil chain `31339`, PostgreSQL
on `5436`, and a local Edge/Playwright installation for the browser runner.

