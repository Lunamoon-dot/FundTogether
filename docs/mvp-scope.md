# FundTogether MVP Scope

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-03
> **Related:** [Protocol specification](./protocol-spec.md), [State machine](./state-machine.md), [Financial rules](./financial-rules.md)

## 1. MVP goal

The MVP proves that FundTogether can protect and account for charitable funds across a complete campaign lifecycle. It is complete only when both a normal path and a failure/refund path can be reproduced end-to-end.

The reviewed [layered verification and dispute design](./verification-and-disputes.md)
records the target evidence admission -> donor review -> organizer response ->
re-verification -> unresolved-case arbitration flow. This is design work, not
completed functionality. Exact verifier/appeal/timing APIs remain open.
A permissioned 2-of-3 matching-verdict committee is selected for MVP in the
user's follow-up. Individual votes are recorded by ResolverManager; not implemented.
Registry, random assignment, resolver fees/reputation and AI remain deferred.

## 2. In scope

### Protocol and contracts

- ERC20 MockUSDC donations and organizer bond.
- Campaign configuration and funding goal/deadline.
- Sequential milestones.
- Maximum-exposure bond based on the largest milestone budget.
- Evidence hash/version commitment.
- Review window and donor-only challenge.
- Permissioned 2-of-3 matching-verdict resolver outcome and individual vote audit trail.
- Milestone settlement and campaign cancellation.
- Refund pool snapshot and individual donor claim.
- Bond return and bounded misconduct allocation.
- Events required by the indexer.
- Unit, negative, fuzz and invariant tests for financial boundaries.

### Backend

- NestJS configuration and health endpoints.
- SIWE wallet authentication and wallet linking.
- PostgreSQL/Drizzle migrations.
- Campaign metadata and milestone metadata.
- Evidence metadata and public upload flow.
- Challenge metadata and resolver records.
- Blockchain projection tables.
- Idempotent event synchronization with checkpoint data.
- OpenAPI documentation and generated frontend client boundary.

### Frontend

- Wallet connection and network guard.
- Campaign list and campaign detail.
- Organizer campaign draft flow.
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
Connect wallet / SIWE
→ create draft
→ define sequential milestones
→ lock bond
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

Do not move a phase to `DONE` because a later phase has a mock or because documentation exists. Record the command, test, transaction or projection that proves completion.

## 7. MVP risks and accepted limitations

- Prototype approval uses one trusted resolver; selected MVP arbitration uses a 2-of-3 committee, not implemented yet.
- Public evidence does not provide privacy.
- Evidence hashes prove integrity, not real-world truth.
- An indexer can lag the chain; the UI must show pending/indexed distinction.
- A permissionless timeout still needs someone to submit the transaction.
- Research claims require comparison data after the MVP has reproducible behavior.

## Arc acceptance gate

Anvil remains local development; Arc testnet is prioritized for public integration.
Production Arc deployment requires validated native/ERC20 accounting and gas UX,
ABI/address/start-block artifacts, finality-aware indexing, complete success and
failure/recovery journeys, and fund-safety review. A passing local suite does not
satisfy this gate. See [milestone review](../v0.2/FundTogether_Milestone_Review_2026-10-03.md).

