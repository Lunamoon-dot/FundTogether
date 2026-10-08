# FundTogether MVP Scope

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-06
> **Related:** [Protocol specification](./protocol-spec.md), [State machine](./state-machine.md), [Financial rules](./financial-rules.md)

## Current priority — MVP consolidation and business validation

The user-approved direction on 2026-10-06 is to stay with the MVP, study real
charitable campaign operations and improve existing journeys before extending
post-MVP. Follow [business validation and MVP hardening](./business-validation-and-mvp-hardening.md)
for the research questions, acceptance evidence and exit criteria.

Existing approved financial/authority rules remain the test baseline. They are
not evidence of real-world suitability. Business findings may justify revising
them after an explicit decision and an assessment of existing campaign obligations.
Separate verifier, committee, appeals, slashing, reputation and AI remain deferred;
public-network integration is not the automatic next step. No duration is fixed:
progress depends on evidence and bounded decisions, not indefinite perfection.

## 1. MVP goal

The MVP proves that FundTogether can protect and account for charitable funds across a complete campaign lifecycle. It is complete only when both a normal path and a failure/refund path can be reproduced end-to-end.

The reviewed [layered verification and dispute design](./verification-and-disputes.md)
records two user-confirmed MVP flows: campaign system checks/corrections ->
submitted dossier -> resolver approval -> organizer publication, and evidence
checks/admission -> donor review -> challenge checks -> organizer response ->
re-verification -> resolver arbitration only if unresolved/escalated. Authorized
platform staff may perform resolver work. These are target workflows, not claims
that all stages exist. The later minimal milestone policy below governs MVP;
separate verifier/appeal proposals remain deferred research.
The user's latest 2026-10-04 decision moves the 2-of-3 committee to post-MVP.
MVP uses a permissioned resolver and individual decision records. This supersedes
the earlier committee selection; layered verification remains required.
Registry, random assignment, resolver fees/reputation and AI remain deferred.

The approved 2026-10-05 [milestone completion policy](./mvp-milestone-completion.md)
uses the existing resolver for admission and final case decisions. Separate
verifiers, appeals, committee voting and misconduct slashing are post-MVP.
One case per evidence version has 7 days for response and 7 days for resolution:
CONTINUE, RESUBMIT or STOP; STOP/timeout refunds unreleased donor escrow and
returns bond separately without penalty. Earlier slash/appeal proposals below
are superseded for MVP. `FundTogetherMvp` implements the new contract boundary;
after the authorized local test reset on 2026-10-07 the application deploys MVP.
The BE/storage/indexer/FE journey has isolated integration evidence on 9545;
real wallet browser acceptance on the fresh application deployment is pending.
Earlier entries retain their original scope.

## 2. In scope

### Protocol and contracts

- ERC20 MockUSDC donations and organizer bond.
- Campaign configuration and funding goal/deadline.
- Campaign dossier/integrity/criteria checks, correction and mandatory resolver approval before organizer publication.
- Sequential milestones.
- Maximum-exposure bond based on the largest milestone budget.
- Evidence hash/version commitment.
- Review window and donor-only challenge.
- Permissioned resolver outcome and decision audit trail; 2-of-3 voting is post-MVP.
- Milestone settlement and campaign cancellation.
- Refund pool snapshot and individual donor claim.
- Bond return without misconduct allocation; slashing is post-MVP.
- Events required by the indexer.
- Unit, negative, fuzz and invariant tests for financial boundaries.

### Backend

- NestJS configuration and health endpoints.
- SIWE wallet authentication and wallet linking.
- PostgreSQL/Drizzle migrations.
- Campaign metadata and milestone metadata.
- Evidence metadata and public upload flow.
- Challenge metadata and resolver records.
- Versioned verification findings and campaign resolver decisions; screening, response and re-verification before dispute escalation.
- Blockchain projection tables.
- Idempotent event synchronization with checkpoint data.
- OpenAPI documentation and a typed frontend API boundary; client generation
  remains a target, not a claim that the current client is generated.

### Frontend

- Wallet connection and network guard.
- Campaign list and campaign detail.
- Organizer campaign draft flow.
- System-check findings, campaign corrections and authorized resolver review after submission.
- Milestone and evidence views.
- Donor contribution flow.
- Challenge flow for eligible donors.
- Refund claim flow.
- Transaction states: wallet requested, submitted, receipt success/revert, confirmed and indexed.
- Responsive, accessible loading, error and empty states.

## 3. Out of scope

The following are explicitly deferred:

```text
native ETH donations
multiple stablecoins
direct bank-transfer donations and fiat-to-USDC conversion
private evidence encryption
EIP-712 verifier signatures
Safe-based resolver execution and general multisig governance
DAO/community voting
on-chain reputation registry
advanced reputation scoring and badges
cross-chain support
AI fraud detection
recommendation engine
social feed
mobile app
complex admin analytics
controlled vendor withdrawals
```

Bank transfer support is intentionally deferred from the protocol MVP. A later
payment bridge may accept settled fiat payments, convert or source MockUSDC or
the selected production token, and submit an on-chain contribution through a
treasury or custodial flow. That bridge must define payment reconciliation,
donor attribution, refund payout and failure recovery before implementation.

## 4. Required user journeys

### Organizer

```text
Register/login to application account
→ link external wallet with SIWE
→ create draft
→ define sequential milestones
→ system dossier/integrity/criteria checks and corrections
→ submit completed campaign dossier
→ lock bond
→ resolver campaign approval
→ publish campaign
→ activate milestone
→ submit evidence
→ see settlement or challenge outcome
```

### Donor

```text
Browse campaign
→ connect wallet
→ approve MockUSDC if needed
→ donate
→ see receipt and indexed contribution
→ inspect evidence
→ challenge if eligible
→ claim refund if available
```

### Failure path

```text
Funding failure or valid cancellation
→ refund pool snapshot
→ donor sees claimable amount
→ donor claims once
→ indexer confirms final state
```

## 5. Definition of done

A feature is not done because its page renders. It is done when the relevant checks below pass:

```text
[ ] Business need, actor and accepted trust assumption documented
[ ] Protocol rule documented
[ ] State transition documented
[ ] Contract guard implemented
[ ] Happy path tested
[ ] Invalid caller/state tested
[ ] Duplicate call tested
[ ] Financial invariant impact tested
[ ] Event emitted with indexer identifiers
[ ] Indexer projection updated idempotently
[ ] Backend authorization enforced
[ ] Frontend pending/success/failure/indexed states shown
[ ] Refresh reconstructs state from backend/chain data
[ ] Real wallet browser journey verified on the intended deployment
[ ] Relevant outage/restart/recovery verified and limitations recorded
```

## 6. Delivery phases

```text
Phase 0  Protocol decisions and four specification files
Phase 1  Single-campaign contract prototype
Phase 2  Contract tests and hardening
Phase 3  Backend database/auth/API foundation
Phase 4  Event indexer and projections
Phase 5  Restricted originals and public redacted evidence pipeline
Phase 6  Frontend vertical journeys
Phase 7  End-to-end MVP and security review
```

The phases describe dependencies, not a requirement to keep adding features.
Current work returns to business assumptions and consolidation across phases
0–7. The [consolidation exit criteria](./business-validation-and-mvp-hardening.md#7-điều-kiện-kết-thúc-giai-đoạn-này)
apply before selecting the next expansion. Do not move a phase to `DONE` because
a later phase has a mock or documentation. Record the evidence and environment.

## 7. MVP risks and accepted limitations

- Resolver is in MVP: system checks precede campaign approval. The existing
  resolver admits evidence and decides bounded cases under the approved 7+7-day,
  CONTINUE/RESUBMIT/STOP, no-slash policy. Real-world independence, staffing and
  suitable durations still need validation; a separate verifier/committee is deferred.
- Milestone activation pays nothing; settlement follows evidence/review. Organizer
  working capital and the purpose/cost of a no-slash bond need business validation.
- Refunds cover only snapshotted unreleased escrow; bond is not donor insurance.
- Public evidence does not provide privacy.
- Evidence hashes prove integrity, not real-world truth.
- An indexer can lag the chain; the UI must show pending/indexed distinction.
- A permissionless timeout still needs someone to submit the transaction.
- Research claims require comparison data after the MVP has reproducible behavior.

## Arc acceptance gate

Anvil remains local development. Arc retains its earlier candidate priority if
public integration is subsequently selected; it is deferred during consolidation.
Production Arc deployment requires validated native/ERC20 accounting and gas UX,
ABI/address/start-block artifacts, finality-aware indexing, complete success and
failure/recovery journeys, and fund-safety review. A passing local suite does not
satisfy this gate. See [milestone review](../v0.2/FundTogether_Milestone_Review_2026-10-03.md).

