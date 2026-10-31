# FundTogether protocol documentation

The protocol directory contains the detailed VNext protocol specification. It
is the design reference for the pure-decentralized target; it is not evidence
that the current checkout or local runtime already implements the protocol.

## Current reference

- [FundTogether VNext Protocol Specification V2 — Design Proposal](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md)
- [PR0 Policy Finalization](PR0_POLICY_FINALIZATION.md)
- [V2 PR0 Parameter Registry](parameters-v2-policy.md)
- [PR1–PR4 Acceptance Criteria](PR1-PR4_ACCEPTANCE_CRITERIA.md)
- [FundTogether VNext Protocol Specification V1](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
- [Parameter Registry V1](parameters-v1.md)
- [Remediation Parameter Registry V2](parameters-v2-remediation.md)
- [Threat Model VNext](THREAT_MODEL_VNEXT.md)
- [Canonical State Machine VNext](STATE_MACHINE_VNEXT.md)
- [Implementation Progress VNext](IMPLEMENTATION_PROGRESS_VNEXT.md)

The specification is intentionally explicit about actors, custody, court
formation, commit–reveal voting, appeals, milestone correction, payout,
refund, failure handling, events and invariants.

## Status rules

- The permissionless, stake-backed, milestone-gated direction is the current
  product decision.
- The V2 file and PR0 policy package are proposed design/audit artifacts. They
  do not supersede V1 or change runtime behavior until the pending O1–O8
  approvals and a versioned adoption decision are recorded.
- Numeric values in the parameter registries are frozen local research inputs.
  The current remediation deployment identity is
  `fundtogether-vnext-local-v2-remediation`; it is not public-chain or
  real-money financial policy.
- The V2 registry supersedes V1 only for the explicitly remediated stake,
  retry, settlement, budget, deadline, refund and indexer rules. It does not
  reinterpret existing campaigns or review cases.
- A protocol rule in this directory is not an implementation claim. Contract,
  indexer, backend, frontend and local-runtime evidence must be verified
  separately.
- Pre-reset Resolver/Admin documents are available only through Git history and
  are not protocol authority.
