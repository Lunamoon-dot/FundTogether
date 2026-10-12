# FundTogether — Reward Crowdfunding Pivot: AI Agent Implementation Brief

> Decision date: 2026-10-12. Status: **proposed product direction approved by user for planning**; this document is a change specification, NOT evidence that code has been migrated or that real-money deployment is safe.
> Target: `Lunamoon-dot/FundTogether`. Inspected `main` at `93ea80fc4fe6bddc7f6c704b844e5e8022c4c811`. **Reinspect working tree and latest HEAD before coding.** The inspected main still contains vendor-based HED P1; `docs/verification-first-disbursement-spec.md` was not found. User subsequently described a verification-centric organizer-wallet pivot; treat it as desired direction, not completed implementation.

## 1. Agent mission

Convert the **new-campaign** product direction from charity fundraising to **reward-based crowdfunding** for creators and backers. Differentiate with transparent escrow, evidence-based disbursement, auditable reviewer decisions, and tracked fulfillment of promised rewards. Preserve historical charity A/B/HED deployments and their obligations. Do not merely rename `donor` to `backer` or mint an NFT.

Primary pilot vertical: independent comics/artbooks with digital access and optional physical merchandise. Local MockUSDC only. No equity, yield, governance token, token speculation, NFT marketplace, secondary trading, fiat gateway, or production deployment in this scope.

## 2. Source-of-truth protocol

1. Inspect `AGENTS.md`, `skills/AGENTSKILLS.md`, current `GOAL.md`, `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md`, `docs/PROJECT_PROGRESS.md`, relevant contract/backend/frontend source and migrations.
2. Detect newer user-approved specifications or worktree changes; do not overwrite or assume they are absent merely because the checked GitHub main lacked them.
3. Create/update an explicit decision log and conflict matrix: **historical A/B**, **vendor HED P1**, **verification-centric organizer-wallet proposal**, and **reward crowdfunding target**. Reward target governs *new campaigns only* once implemented and tested.
4. Do not mark unimplemented features DONE. Do not silently change custody, refund rights, recipients, caps, deadlines, or irreversible obligations. Escalate unresolved money/rights/legal decisions with concrete alternatives before implementation.

## 3. Business actors and terminology

- **Creator:** verified individual/team/entity responsible for production, financial substantiation, delivery and support. May reuse organization/account identity infrastructure; do not assume all creators have corporate legal status.
- **Backer:** contributes toward a specific reward tier and receives a conditional entitlement, not equity or a guaranteed investment return.
- **Resolver:** pilot reviewer for campaign, funding requests, evidence, disputes; preserve reasons, evidence references, conflict-of-interest controls and backup/timeouts. Resolver's conclusion is not proof of physical-world truth.
- **Admin:** identity verification and operational controls; must not unilaterally change escrow balances.
- **Platform:** publishes verifiable status and disclosure, not a guarantor of delivery unless an explicit funded/legal guarantee exists.

## 4. Product scope and MVP user journey

1. Creator verifies identity and wallet, submits campaign draft: product description, ownership/right-to-produce declaration, fixed funding goal and deadline, itemized budget, production plan, delivery dates, reward tiers, maximum quantities, shipping coverage/costs, risks and refund policy.
2. Resolver reviews identity/rights evidence, feasibility, budget and fulfillment commitments. Freeze versioned `commitmentHash` and policy identity before publication.
3. Backer selects reward tier and pays MockUSDC to escrow. Persist **contribution AND reward entitlement** tied to wallet/account, tier, quantity, unit price and commitment version; prevent overselling and inconsistent refunds. For MVP, nontransferable entitlements stored in DB and verifiably linked to chain contribution are acceptable; no ERC-721/1155 requirement.
4. Funding succeeds only on published threshold/expiry conditions. If it fails, no rewards become redeemable and backers can claim refundable escrow amounts per policy.
5. Creator requests an evidence-backed disbursement against approved budget. Resolver approves, contract enforces recipient, custody, ceilings, previous outstanding financial obligations and policy. **Target recipient is verified `creatorWallet`/organizer wallet, not vendor Web3.** The wallet-to-fiat/off-chain purchase trail requires separate substantiation; on-chain payout is NOT proof of spending.
6. Creator submits expense evidence; reviewer reconciles amounts, returns genuinely unused tokens to escrow, and records a frozen, reasoned decision.
7. Creator submits production evidence and fulfillment batches. Digital access activates only on the appropriate verified condition. Physical reward fulfillment tracks claim, shipment, delivery confirmation, exceptions and dispute; production complete != each backer received goods.
8. Backers see escrow inflows/outflows, request-level purpose/status, redacted evidence, reviewer decisions, reward entitlement and fulfillment state; can challenge within an explicitly defined window. Public chain data is independently verifiable; bank expenditure and physical delivery remain reviewer-/evidence-dependent.
9. On failure/stop, freeze further disbursement and allocate only funds actually held/returned. Clearly disclose that spent funds are not automatically recoverable; calculate per-backer claims without double payment and account for unfulfilled rewards.

## 5. Four verification flows

| Stage | Decision | Evidence | Authority |
|---|---|---|---|
| V1 Creator | Who can raise funds and control wallet? | Identity, wallet signature, creator/team rights and conflicts | Admin |
| V2 Campaign + Reward | Is plan/budget/reward promise feasible and clear? | Budget, schedule, tier supply, delivery terms, IP declarations, frozen commitment | Resolver |
| V3 Expenditure + Production | Is requested spend justified; what was actually paid/produced? | Request, invoice/receipt, payment trail, output evidence, unused returns | Resolver + backer visibility |
| V4 Fulfillment | Was each promised entitlement fulfilled? | Access activation, shipment, delivery confirmation, disputes and redacted proof | Resolver for contested outcomes; backer acknowledgement/challenge |

Separate `FINANCIALLY_SETTLED`, `PRODUCTION_VERIFIED`, and `FULFILLMENT_COMPLETE`. One must not imply another.

## 6. State and accounting design — specify before coding

- Campaign: `DRAFT -> IN_REVIEW -> APPROVED -> FUNDING -> FUNDED | FUNDING_FAILED -> ACTIVE -> COMPLETED | STOPPED` (derive exact transitions/guards and timeout actors).
- Funding request: `DRAFT -> SUBMITTED -> APPROVED -> DISBURSED -> EVIDENCE_SUBMITTED -> FINANCIALLY_SETTLED | DISPUTED | STOPPED` (define rejection/resubmission paths).
- Reward entitlement: `PENDING_FUNDING -> ACTIVE -> REDEEM_REQUESTED -> FULFILLING -> DELIVERED -> CONFIRMED` with `DISPUTED`, `CANCELLED`, `REFUND_ELIGIBLE` paths. Do not burn/revoke solely on redemption request. Digital access may use separate `ACCESS_GRANTED` state.
- Immutable snapshots: tier price/quantity, promised contents, expected delivery, shipping policy, creator wallet, commitment version, reviewer policy, recipient of refunds and wallet-link proof.
- Core custody conservation (no fees): `contributions + actual_returns = payouts + refunds_paid + escrow_balance`. `reserved` and `refund_liability` are **subsets/classifications of escrow**, never extra assets. Define base/supplement refunds, rounding/dust, late returns, partial deliveries, charge/refund overlap and reorg semantics.
- Track `reward_liability` separately: count/value of outstanding promised items by tier, deliveries and exceptions. Monetary escrow balance alone does not settle delivery obligations.
- Choose exposure guards based on pilot scenarios. **Do not hard-code the previously discussed 25% request cap or 50% outcome exposure as final user-approved rules**; production print runs may require deposits. Explicitly decide sequential-vs-parallel requests, maximum unresolved financial exposure, fulfillment reserve, dispute handling, and timeouts before financial contract edits.
- Resolve backer identity/transfer/refund conflicts: MVP entitlements nontransferable, wallet changes require verified linkage, one redemption per entitlement, prevent refund plus delivered reward without a policy decision.

## 7. Architecture / migration approach

- **Preserve/reuse:** SIWE, auth, wallet link, identity and role checks, NestJS + PostgreSQL/Drizzle, private/redacted evidence storage, Foundry/Anvil, MockUSDC, event indexer with deployment identity/reorg/replay, React/TypeScript/Wagmi UI.
- **New domain:** `creator_profiles` (or reuse verified identity safely), `reward_campaigns`, `reward_tiers`, `backer_entitlements`, `fulfillment_orders`, `fulfillment_events`, `reward_disputes`, `production_evidence`, and review/audit links. Use names consistent with actual schema and avoid duplicating generic infrastructure.
- **Contract:** design a **new policy/version and isolated local deployment** for new reward campaigns. Implement escrow and authoritative rights/financial transitions; decide whether entitlement is represented by an event/on-chain mapping or an indexed off-chain record with on-chain commitment. Never pretend DB entitlement is independently transferable or fully trustless.
- **Backend:** enforce tier availability, idempotent order creation, account-wallet binding, evidence ACL/redaction, state guards, reviewer authority, refund eligibility and indexer reconciliation. Do not trust client-submitted price/recipient/hash.
- **Frontend:** creator campaign builder, tier configuration, backer checkout, public fund ledger, evidence/review history, "My Rewards", digital-access gate, redemption/fulfillment tracker and dispute/refund UX. Distinguish submitted, confirmed, indexed and reconciled transactions.
- **Vendor cleanup:** inspect dependency graph before removing vendor routes, controllers, columns or historical data. No destructive migration on applied tables; isolate old HED mode. No forced migration of existing charity obligations.

## 8. Implementation sequence and gates

**Phase 0 — audit and decisions.** Inventory deployed/local policies, state diagrams, actor/action/guard matrix, exact accounting and fulfillment/refund edge cases. Produce an ADR. Request user approval only for unresolved irreversible financial/legal decisions.

**Phase 1 — spec + tests.** Freeze reward tier and entitlement semantics; add deterministic scenario fixtures and contract invariant tests before implementing payout logic.

**Phase 2 — isolated contract and migrations.** Build new reward escrow policy, ABI/events/deployment manifest and additive DB migrations. Validate exact balances and access rights.

**Phase 3 — backend/indexer.** Implement reward campaign/tier/entitlement, requests, evidence, fulfillment, disputes, refunds, canonical chain replay and API authorization.

**Phase 4 — frontend.** Creator and backer journeys with transparent financial/evidence views, reward access/redemption, proper transaction and error states.

**Phase 5 — verification.** Run end-to-end local campaigns with digital-only, physical-only and mixed tiers; underfunded, oversubscribed, partial fulfillment, late delivery, invalid evidence, duplicate redemption, failed payout, reviewer absence, challenge, stop, late return, refund rounding, chain reorg, restart and account switching. Independently check balances, obligations and projections. Manual wallet/reviewer acceptance is a separate TODO until performed.

**Phase 6 — docs.** Update `GOAL.md`, `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md`, `docs/PROJECT_PROGRESS.md`, `README.md`, runbook and user-facing policy; preserve historical A/B/HED docs clearly labeled archival/baseline. Report actual test commands and results, not assumed PASS.

## 9. Research and startup validation

Research question: *Can evidence-gated disbursement plus publicly auditable funding and reward-fulfillment obligations reduce uncontrolled exposure and improve backer understanding compared with creator-controlled payout or fixed milestone escrow?*

Compare scenarios under equal goal/budget/fulfillment assumptions. Measure: unreconciled payout exposure, outstanding reward liability, invalid-approval detection, false rejections, processing time, reviewer cost ratio, refund recoverability, fulfillment rate and backer ability to correctly identify fund/production/delivery status. Interview actual creators and backers; do not claim adoption from local technical tests.

Pilot vertical: independent comic/artbook projects. Start with a few simple digital and physical tiers; no token tradability. USDC-only local prototype does not prove mainstream Vietnam payments or legal suitability.

## 10. Hard constraints and definition of done

- No public-chain deployment, real money, real-user PII in fixtures, fiat conversion or token speculation without separate approval and legal review.
- Do not delete/reset existing chain, DB, files, wallet, migrations, or legacy obligations. Do not auto-push/merge.
- Hashes prove integrity of submitted bytes, not authenticity of invoices, intellectual-property rights, manufacture or physical delivery.
- A transaction hash alone is not success. Require receipt, events, indexed canonical state and ledger reconciliation.
- Refund only actual custody and actual returns; never guarantee full reimbursement or physical delivery.
- Explicit user-facing risk disclosures and privacy protection for identity, addresses and shipping data.
- Mark DONE only when reproducible source/tests/evidence demonstrate the behavior; keep human validation and production/legal readiness separate.

### Immediate agent instruction

**First inspect the current repository and produce a concrete dependency-aware migration plan and decision matrix. Do not immediately delete vendor code or modify financial contracts.** Once open money/rights decisions are resolved, implement in phases, preserving historical deployments and providing test evidence at each gate.
