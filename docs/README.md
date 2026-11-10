# FundTogether documentation

## Current direction

FundTogether is now documented as a pure decentralized reward-crowdfunding
protocol. The current target is permissionless campaign creation, stake-backed
three-Judge courts, milestone evidence, escrowed payout and permissionless
refund. The local runtime has not yet migrated.

The executable migration currently contains a local VNext contract core for
publication, funding, milestone review, appeal/retry, payout and refund, plus
an idempotent projection/API slice and Creator, Backer and guided Judge wallet
surfaces. This includes campaign creation, funding, refund, evidence,
commit–reveal, court visibility and settlement/disbursement flows. Challenge
entrypoints remain disabled by the local policy, and there is no consolidated
VNext one-command launcher. Any Resolver lifecycle behavior still in the
checkout is historical runtime compatibility, not target protocol authority.
Read implementation progress before treating the pure target as deployed.

## Reading order

1. [Research direction](research-direction.md)
2. [Project overview](PROJECT_OVERVIEW.md)
3. [VNext protocol specification V1](protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
4. [Parameter Registry V1](protocol/parameters-v1.md)
5. [Threat Model VNext](protocol/THREAT_MODEL_VNEXT.md)
6. [Canonical State Machine VNext](protocol/STATE_MACHINE_VNEXT.md)
7. [Implementation Progress VNext](protocol/IMPLEMENTATION_PROGRESS_VNEXT.md)
8. [Pure decentralized architecture](architecture/PURE_DECENTRALIZED_PROTOCOL.md)
9. [Pure decentralized campaign scope](campaigns/SCOPE_V2_DECENTRALIZED.md)
10. [Pure decentralized workflows](campaigns/WORKFLOWS_V2_DECENTRALIZED.md)
11. [Financial Policy V2](campaigns/FINANCIAL_POLICY_V2_DECENTRALIZED.md)
12. [Wallet-only authentication](auth/WALLET_ONLY_AUTH.md)

## Documentation map

| Area | Current meaning |
| --- | --- |
| research-direction.md | Product and research source of truth |
| PROJECT_OVERVIEW.md | Target architecture and source-of-truth boundaries |
| protocol/ | Detailed VNext protocol specification and status boundaries |
| architecture/ | Current pure-decentralized protocol architecture |
| campaigns/*_V2_DECENTRALIZED.md | Current target scope, workflow and financial policy |
| research/ | Reproducible VNext research records and declared limitations |

## Source-of-truth rule

The newest explicit user decision wins, followed by research-direction.md,
PROJECT_OVERVIEW.md and the V2 decentralized policy. Code and test evidence
describe what is actually implemented; they do not override the target policy.
Removed plans remain available in Git history but are not runtime evidence.

## Historical-document rule

Pre-reset Resolver, HED, charity and advisory Community Review documents are
not kept in the working tree. Use Git history only for a named regression or
forensic question. Historical code that remains executable is still governed by
its tests and explicit namespace; its removed documentation is not VNext
authority.
