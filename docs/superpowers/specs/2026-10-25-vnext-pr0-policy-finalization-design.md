# VNext PR0 Policy Finalization Design

## Intent

PR0 turns the V2 design proposal into an auditable policy package without
changing Solidity, backend, frontend, database, deployment, or local-chain
state. It preserves the locked V2 business decisions and makes every missing
economic or liveness parameter explicit before PR1–PR4 can add runtime code.

## Goals

- Record a disposition for O1–O8 and identify decisions that still require
  explicit approval.
- Preserve the two-choice BackerDAO model while specifying a named,
  contribution-weighted quadratic candidate and exact test vectors.
- Bound publication review, Court Reset, reward reserve, and refund behavior.
- Publish a versioned parameter registry and acceptance gates for PR1–PR4.

## Non-goals and anti-goals

- No runtime or ABI changes, migrations, deployments, chain resets, or data
  deletion.
- No CEAV signal, trusted audit, high/low effort mechanism, minority slash, or
  new voting model.
- No claim that proposed values are approved public-chain economics.

## Approaches

1. Edit only the V2 proposal. This keeps one file but mixes policy, parameters,
   and test gates and makes approval status hard to audit.
2. Keep V2 as the protocol source and add a PR0 decision record, a parameter
   registry, and PR1–PR4 acceptance criteria. This is the selected approach:
   it is reviewable, additive, and keeps runtime untouched.
3. Implement Solidity while closing the policy gaps. This conflicts with the
   requested PR0 scope and would commit to unapproved ABI/economic semantics.

## Selected design

The V2 specification receives only cross-references and conflict clarifications.
`PR0_POLICY_FINALIZATION.md` owns O1–O8 status and approval gates;
`parameters-v2-policy.md` owns machine-readable values and arithmetic rules;
`PR1-PR4_ACCEPTANCE_CRITERIA.md` owns the minimum evidence required before each
runtime PR is accepted. Values marked `PROPOSED_PENDING_APPROVAL` are usable as
test vectors only and cannot authorize deployment or financial code.

The proposed BackerDAO formula is named `CWQ-1`: at the opening snapshot, a
wallet's integer contribution `c_i` (token base units) maps to
`w_i = floor(sqrt(c_i))`. Each wallet casts one `ACCEPT` or `APPEAL` ballot,
weights are summed with checked `uint256` arithmetic, and the final choice is
strict weighted majority; a tie or unmet participation threshold defaults to
`ACCEPT`. The formula is a candidate for approval, not a replacement of the
two-choice voting model.

Court Reset is bounded per review case, charges only the missing Judge's locked
case stake, never consumes the valid-court reserve, and records a separate
reset identity. Publication review is pre-funding and has no BackerDAO
electorate or milestone reward; any non-zero publication subsidy needs a new
approved policy version.
