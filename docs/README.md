# FundTogether documentation

## Current direction

FundTogether is now documented as a pure decentralized reward-crowdfunding
protocol. The current target is permissionless campaign creation, stake-backed
three-Judge courts, milestone evidence, escrowed payout and permissionless
refund. The local runtime has not yet migrated.

The executable migration currently contains a local VNext contract core for
publication, funding, milestone review, appeal/retry, challenge, payout and
refund, plus an idempotent projection slice and a read-only protocol page.
Creator/Backer/Judge wallet journeys and fresh local-runtime acceptance are
still incomplete. Any Resolver lifecycle behavior still in the checkout is
transitional implementation residue, not target protocol authority. Read
implementation progress before treating the pure target as deployed.

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
13. [Pure decentralized design](superpowers/specs/2026-10-20-pure-decentralized-protocol-design.md)
14. [A–Z VNext build roadmap](superpowers/plans/2026-10-20-vnext-a-z-build-roadmap.md)
15. [Implementation plan](superpowers/plans/2026-10-20-pure-decentralized-protocol.md)
16. [Pre-reset progress evidence](PROJECT_PROGRESS.md)

## Documentation map

| Area | Current meaning |
| --- | --- |
| research-direction.md | Product and research source of truth |
| PROJECT_OVERVIEW.md | Target architecture and source-of-truth boundaries |
| protocol/ | Detailed VNext protocol specification and status boundaries |
| architecture/ | Current protocol architecture plus historical blueprints |
| campaigns/*_V2_DECENTRALIZED.md | Current target scope, workflow and financial policy |
| superpowers/ | Current design, A–Z roadmap and implementation plan |
| PROJECT_PROGRESS.md | Pre-reset implementation evidence; not proof of the new protocol |
| archive/ and old V1 documents | Historical only |

## Source-of-truth rule

The newest explicit user decision wins, followed by research-direction.md,
PROJECT_OVERVIEW.md and the V2 decentralized policy. Code and test evidence
describe what is actually implemented; they do not override the target policy.
Plans are not runtime evidence.

## Historical-document rule

Pre-reset Resolver, Admin-approval and advisory Community Review documents are
retained for traceability. They must be labeled historical and must not be used
to design or accept the new protocol.
