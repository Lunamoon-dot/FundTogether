# FundTogether protocol documentation

The protocol directory contains the detailed VNext protocol specification. It
is the design reference for the pure-decentralized target; it is not evidence
that the current checkout or local runtime already implements the protocol.

## Current reference

- [FundTogether VNext Protocol Specification V1](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
- [Parameter Registry V1](parameters-v1.md)
- [Threat Model VNext](THREAT_MODEL_VNEXT.md)
- [Canonical State Machine VNext](STATE_MACHINE_VNEXT.md)
- [Implementation Progress VNext](IMPLEMENTATION_PROGRESS_VNEXT.md)

The specification is intentionally explicit about actors, custody, court
formation, commit–reveal voting, appeals, milestone correction, payout,
refund, failure handling, events and invariants.

## Status rules

- The permissionless, stake-backed, milestone-gated direction is the current
  product decision.
- Numeric values in the parameter registry are frozen local research inputs
  under `fundtogether-vnext-local-v1`; they are not public-chain or real-money
  financial policy.
- A protocol rule in this directory is not an implementation claim. Contract,
  indexer, backend, frontend and local-runtime evidence must be verified
  separately.
- Historical Resolver/Admin documents remain available for traceability only.
