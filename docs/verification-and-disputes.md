# Evidence Verification and Dispute Escalation

> Updated: 2026-10-03
> Status: Reviewed design direction; not implemented
> Source: User-supplied layered verification proposal, existing MVP rules and v0.2 threat model

The source-corpus review is recorded in
[the repository v0.2 corpus](../v0.2/FundTogether_Verification_and_Dispute_Design_2026-10-03.md).
This repository document is the implementation-facing counterpart, not a
replacement for that external design corpus.

## 1. Assessment and scope

Adopt the separation of admissibility checking, donor review, organizer response,
re-verification and final arbitration as the target direction. It gives organizers
an opportunity to correct problems and reserves arbitration for unresolved cases.
Campaign admission before publication and milestone evidence admission are separate
checks: admission of a campaign cannot verify future delivery.

This document records the assessment and constraints, not approval of every
example in the supplied text. There is no measured evidence for its "90% happy
path" estimate or delivery-time estimate. Resolver registry, reputation, random
assignment, fees and external arbitration are future candidates. AI is not
required for this flow and remains outside the current MVP.

## 2. Target workflow

```text
Organizer submits a versioned evidence package
  -> Evidence verifier checks admissibility
       REJECTED -> reason -> organizer corrects and submits a new version
       ADMISSIBLE -> authenticated on-chain admission -> 72-hour donor review
          no pending/admitted challenge -> eligible for settlement
          donor submits challenge -> provisional settlement hold
            Challenge verifier checks admissibility
              INVALID -> reason + recorded dismissal; contest path required
              ADMISSIBLE -> organizer response
                re-verify against original criteria
                  correction accepted -> new evidence version + fresh 72-hour review
                  contested/unresolved -> independent resolver
                    PASS / RESUBMIT / CANCEL_WITHOUT_FAULT / MISCONDUCT
```

PASS means eligible for settlement under the contract guards; it is not proof
of physical-world truth and does not execute a transaction automatically.
Final arbitration PASS is distinct from provisional re-verification acceptance.
The resolver's finality/appeal rule still needs approval.

## 3. Authority boundaries

Follow-up user answers approve a single VERIFIER_ROLE for evidence, challenge
and objective remediation checks. It has five procedural actions, cannot edit
records, adjudicate contested facts or transfer funds. The same person can perform
these checks in MVP but cannot resolve the same dispute as a committee member.
User selected multiple platform-appointed verifier wallets, initially two;
one assigned verifier reviews each submission, without committee voting.
Full approved authority and draft objective checklist:
[Verifier Specification v0.1](../v0.2/FundTogether_Verifier_Specification_v0.1.md).

| Actor | Permitted responsibility | Boundary |
|---|---|---|
| Campaign admission reviewer | Check campaign eligibility before publication | Separate responsibility from resolving milestone disputes |
| Evidence verifier | Check completeness, readability, format and match to committed criteria | ADMISSIBLE does not mean truthful or completed; cannot transfer funds |
| Challenge verifier | Check donor eligibility, timeliness, scope, duplicates and supporting material | ADMISSIBLE does not establish misconduct; ambiguous merits must escalate |
| Organizer | Explain, submit additional evidence and correct work | Cannot dismiss its own challenge, change approved criteria or authorize release |
| Re-verifier | Check the response against fixed criteria; record findings | Contested findings must have an escalation path; no unilateral final monetary verdict |
| Resolver | Decide unresolved disputes with a reasoned permitted verdict | No arbitrary payout recipient, amount or slash percentage |
| Smart contract | Authenticate actors; enforce holds, timers, verdict effects and accounting | Cannot independently establish real-world facts |

Verifier and resolver responsibilities create trusted decision points. Calling
them a "system" does not remove this trust. Automated rules can check objective
properties; AI suggestions or signatures alone do not establish real-world truth.
Domain assessments must disclose who performed them and what was checked.

## 4. Challenges, timing and recoverability

- Keep the agreed 72-hour review duration. In the target flow it starts only when
  the committed evidence version is admitted on-chain. This is implemented in current code.
- A timely challenge must be recorded before expiry and block settlement while
  screening is pending. Otherwise a slow verifier could allow disputed funds out.
  A UI submission timestamp alone does not create this on-chain protection.
- Rejecting an inadmissible challenge records reasons. Donors need a bounded
  way to contest an incorrect dismissal; a verifier must not silently censor it.
- Invalid challenges must not automatically restart the review timer. Abuse,
  pending-hold bounds and appeal timing still need concrete rules; no challenge
  stake is added to the MVP by this document.
- Corrections and RESUBMIT create new immutable versions linked to prior hashes.
  Changed material receives a fresh 72-hour review; original hashes are retained.
  The number of correction rounds must be bounded to prevent endless delay.
- Every waiting stage needs a deadline and permissionless fallback: evidence
  admission, challenge screening, organizer response, re-verification and resolver
  decision. Absence of response is not automatically proof of misconduct.
- Evidence defaults were authorized on 2026-10-04: 30 days for initial evidence,
  72 hours for admission from submission, 7 days for correction and 3 total
  versions, including admissions that expire. A 7-day activation deadline also
  prevents never-started milestones from holding funds indefinitely. Exhaustion
  or organizer inactivity terminates FAILED with proportional refunds of
  unreleased escrow and full bond return, without slash. See
  [timeout defaults](./contract-evidence-timeouts.md).
- Challenge/resolver durations, fallback outcomes and appeal finality remain
  OPEN; misconduct/slash formulas are not inferred from these defaults.

## 5. Resolver composition

The supplied proposal of three independent resolvers with two matching decisions
is the selected MVP direction in the user's follow-up. It is permissioned governance,
not evidence of decentralization or independence by itself. Three wallets can
belong to one person; identity and relationships require off-chain checks.

Require conflict checks against organizer, challenger, vendors and prior
verifiers for the case. Organizational relationships cannot be inferred from
wallet addresses alone. Do not let a resolver self-select a profitable case.

For a 2-of-3 implementation, two approvals must bind to the SAME verdict,
campaign, milestone, dispute ID, evidence/response version, round and contract
context. Two different verdicts are not a quorum. Each member votes once per
round; conflicting votes, recusals, lost access and timeout need explicit handling.
Do not rotate members mid-case without a defined rule.

The threshold is selected as two matching verdicts from three verified members;
membership/conflict replacement and timeout handling remain open. Record individual
votes in ResolverManager; Safe-based resolver execution remains deferred.
A dynamic registry is not needed for MVP. Reuse established primitives where
appropriate rather than inventing signature or threshold cryptography.

Safe documents threshold owner confirmation as a supported execution model:
[Safe smart account overview](https://docs.safe.global/advanced/smart-account-overview).
That mechanism does not validate evidence or prevent member collusion, and using
Safe is not a project dependency decision.

## 6. Verdicts and financial effects

| Proposed verdict | Meaning | Required contract consequence |
|---|---|---|
| PASS | Final dispute outcome accepts milestone | Exact-budget settlement once, subject to approved finality rules |
| RESUBMIT | Correctable evidence deficiency | New committed version; fresh review; bounded rounds/deadline; no immediate release |
| CANCEL_WITHOUT_FAULT | Campaign cannot continue without proven misconduct | Stop; snapshot unspent escrow; return remaining bond under approved terminal rule |
| MISCONDUCT | Reasoned finding of organizer misconduct | Stop; snapshot unspent escrow plus predefined slash allocation |

Do not introduce DEFAULT as an additional financial verdict until its meaning,
proof requirements and distinction from inactivity are approved. Slash amount,
post-funded refund allocation, transfer-failure recovery and dust treatment must
be explicit before implementing terminal outcomes. Already released money is
not automatically recoverable from an organizer wallet.

Evidence/response files and full reasoning live off-chain. Record verdict,
reason code and reasoning commitment with case/version identity for auditing.
If compensation is introduced later, avoid outcome-dependent rewards and sharing
slashed bond with decision makers. No resolver fee is introduced here.

## 7. On-chain and off-chain boundary

```text
Files -> storage
Checks, findings, identity/conflict records -> backend/database
Authorized admission/dismissal/verdict -> contract transaction
Contract state/event -> idempotent indexer -> database projection -> frontend
```

The contract must validate the caller or established attestation mechanism,
case identity, state, version and timing before changing a hold or authorizing
settlement. A backend boolean cannot unlock escrow. A worker submitting a
transaction is not proof it succeeded; expose receipt/confirmation/index status.
Multiple platform-appointed verifier wallets are selected. Grant/revoke,
pending submission assignment/reassignment and admission are implemented;
challenge/appeal and remediation APIs remain to be specified.

## 8. Current implementation versus target

The policy draft, including DEFAULT and vote-context guards, is in
[Dispute Policy and Resolver Committee](../v0.2/FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md).

| Concern | Current code | Target direction |
|---|---|---|
| Campaign approval | Deployer resolver approves after criteria commitment | Separate campaign admission responsibility |
| Evidence | Versioned pending submission; assigned active verifier acceptance starts review | Admission check implemented; objective checks remain off-chain |
| Challenge | Contributing donor immediately enters CHALLENGED | Timely hold, screening, response, re-verification, escalation |
| Corrections | Reject permits a new immutable version; history retained | Challenge remediation and bounded rounds remain planned |
| Settlement | Permissionless unchallenged expiry; exact budget; final bond return | Preserve financial invariants; add authenticated verdict paths |
| Disputes | CHALLENGED has no exit | Bounded escalation and recovery |
| Resolver committee | Not implemented | Selected 2-of-3 verdict voting; identity/conflict checks and policy required |

Evidence admission/versioning is now implemented; event ABI changed to versioned
creation/assignment/decision events. Backend/frontend domain flows remain unimplemented.
Next decisions: challenge hold/appeal semantics; per-stage deadlines/fallbacks;
resolver conflict/replacement rules; terminal financial rules.

## 9. Upgradeable analysis pipeline

[Evidence pipeline v0.1](./evidence-pipeline.md) specifies frozen organizer packages
and separate versioned analysis reports. Optional OCR/AI assists extraction and
flagging; it cannot decide disputed merits or change financial state. Engines
may change without rewriting committed evidence or applying new criteria
retroactively. These specifications are documented, not implemented services.
