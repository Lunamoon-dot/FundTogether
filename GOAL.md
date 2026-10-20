# Goal — FundTogether Pure Decentralized Crowdfunding

FundTogether is a permissionless reward-crowdfunding protocol for one
independent digital comic or artbook campaign. Any wallet may create a proposal;
Backers pledge into contract escrow; stake-backed Judge courts review
publication and production milestones; only canonical review outcomes unlock
milestone payout.

The target journey is:

    Creator proposal
      → frozen terms and evidence commitment
      → three-Judge publication court
      → two-of-three PASS
      → FUNDING and Backer pledges
      → milestone evidence
      → three-Judge review
      → challenge window
      → exact milestone payout or refund

The Campaign contract is the financial source of truth. PostgreSQL is metadata
and an indexed projection. MinIO stores private evidence and PDF bytes. The
backend and Admin surface have no authority to choose outcomes or move funds.

The protocol accepts Sybil, collusion, bribery, inactive-Judge and
incorrect-majority risk. It does not claim that stake or a content hash proves
real-world truth.

The product remains limited to COMICS_ARTBOOK, one STANDARD digital-download PDF
tier, local MockUSDC on chain 31339, sequential milestones, challenges and
refunds. Physical shipping, inventory, NFTs, marketplace behavior, charity
workflow and public-chain/real-money launch are outside the pilot.

## Current evidence boundary

The current checkout still contains the pre-reset Resolver implementation and
a partially implemented VNext contract/indexer/read-only UI slice. Its tests
and runtime evidence are evidence only for the named slices, not proof of a
fresh end-to-end deployment. The target design and implementation order are
documented in
[FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md](docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md),
[parameters-v1.md](docs/protocol/parameters-v1.md),
[THREAT_MODEL_VNEXT.md](docs/protocol/THREAT_MODEL_VNEXT.md),
[STATE_MACHINE_VNEXT.md](docs/protocol/STATE_MACHINE_VNEXT.md),
[PURE_DECENTRALIZED_PROTOCOL.md](docs/architecture/PURE_DECENTRALIZED_PROTOCOL.md)
and
[2026-10-20-vnext-a-z-build-roadmap.md](docs/superpowers/plans/2026-10-20-vnext-a-z-build-roadmap.md)
and
[2026-10-20-pure-decentralized-protocol.md](docs/superpowers/plans/2026-10-20-pure-decentralized-protocol.md).
