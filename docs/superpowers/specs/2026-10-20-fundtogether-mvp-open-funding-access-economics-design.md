# FundTogether MVP — Open Funding, Refundable Review Reserve, Milestone Disputes & Digital Access

> **Status:** DRAFT DESIGN FOR REVIEW — not yet an adopted financial policy, not implemented.
> **Date:** 2026-10-20
> **Baseline reviewed:** main at ab93b7027071849b4f945711606d50bc165f1f91 (PR #10).
> **Scope:** local Anvil chain 31339 + MockUSDC; one end-to-end digital-access campaign.
> **Supersession:** This design PROPOSES future changes to research-direction.md, SCOPE_V2_DECENTRALIZED.md, WORKFLOWS_V2_DECENTRALIZED.md, FINANCIAL_POLICY_V2_DECENTRALIZED.md, STATE_MACHINE_VNEXT.md and parameters-v2-remediation.md. Those documents remain authoritative until a separate adoption decision and versioned migration. Do not silently reinterpret existing deployed campaign commitments.

## 0. Executive intent and MVP boundary

FundTogether remains a permissionless, stake-backed, decentralized crowdfunding protocol. The product must not be permanently locked to comics, artbooks or PDFs. The reference MVP demonstrates **one digital-access entitlement**: after verified project completion, a Backer can claim an **NFT Access Pass** and use it for a specified digital access service/content endpoint. A user-facing NFT card may be displayed on the Backer profile. An NFT is an access credential, not proof of real-world delivery, authorship or availability.

**MVP IN:** permissionless creator proposals; publication jury; open contributions until funding deadline; overfunding; explicitly funded production and review reserve; sequential milestone verification; multi-court review, commit–reveal, bounded appeal/challenge with existing bond baseline; payout after protocol authorization; conservation/refund; a single Access Pass mode; local E2E and economic experiments.

**MVP OUT:** multi-category marketplace, token trading/resale, secondary royalties, generalized NFT product minting, physically delivered rewards, token governance, KYC, AI verification, subscription billing, DAO treasury, cross-chain, production randomness, public mainnet custody, fee marketplace, generalized pooled objection, dispute crowdsourcing and arbitrary policy-builder UI.

**Product extensibility is an architectural constraint, not an MVP feature count.** Model a campaign using a generic deliverable/access commitment. Ship and validate only ONE reference digital-access journey. No promise of supporting all game/course/software integrations in the MVP.

### 0.1 Decision register

| ID | Decision / intent | Classification |
| --- | --- | --- |
| M01 | Funding remains open after goal is reached, and closes only at frozen fundingDeadline; a permissionless transaction materializes finalization afterward. | User-agreed target change; NOT current runtime |
| M02 | Goal includes a frozen production budget plus a frozen base review budget. | User-agreed target change; NOT current runtime |
| M03 | Contributions above goal are accepted. Surplus temporarily augments refundable review reserve, not automatic Creator income. | User-agreed direction; requires exact policy implementation |
| M04 | On completion or terminal cancellation/failure, every unit of campaign escrow remaining after independently accrued/settled valid obligations is allocated to Backers pro-rata, not platform/Creator. | User-agreed target rule |
| M05 | A milestone's evidence submission triggers base review; submission deadline passing with no evidence triggers a permissionless timeout path, not an unnecessary jury case. | Agreed direction; state guards required |
| M06 | Challenge/appeal bonds are retained as a temporary anti-spam baseline. No pooled objection or new anti-spam mechanism is implemented in this MVP. | Agreed temporary design; numeric challenge bond unsettled |
| M07 | NFT is an Access Pass; optional showcase/profile display. It is not a tradable reward marketplace in MVP. | User-agreed product choice |
| M08 | Judge fee distribution, service fee rate, slashing redistribution and per-case pricing are NOT scientifically finalized. | Research/open decision |
| M09 | No trusted Resolver/Admin can approve a financial transition or rewrite frozen terms. | Existing decentralized protocol requirement |

**Not agreed as protocol facts:** nonzero challenge bond amount; source of pre-funding publication fees in a paid system; exact Judge fee schedule; final Access Pass transferability/activation policy beyond the narrow MVP assumption in §8; launch category strategy; post-PASS challenge PROTOCOL_FAIL terminal policy.

## 1. Architecture and trust boundaries

### 1.1 Context and responsibility

| Boundary | Responsibilities | MUST NOT |
| --- | --- | --- |
| Campaign escrow contract | Accept contributions, frozen terms, balance partition, deadline-based funding finalization, milestone payout, terminal pool/snapshot and Backer claims | Exceed authorized budgets; delegate payment decisions to backend |
| JuryReview / JuryRegistry | Freeze review case identity, selection/assignment, commit/reveal, ruling, appeal/retry, stake settlement, slash/rewards | Treat hashes, stake or coherence as proof of actual truth |
| Review reserve / reward accounting | Track vested Judge fees, separate from production funds and from refund pool | Double count reserved money as paid or refundable |
| Access Pass contract or narrowly scoped entitlement module | One claimable access credential per eligible contributor under the frozen access policy | Grant refund rights by trading/minting an NFT |
| Backend / indexer | SIWE, metadata, evidence delivery, canonical event projections, read-only transaction tracking | Mint financial rights from a database row or unconfirmed transaction |
| Storage/access gateway | Store content/evidence, verify hashes, check wallet/token before serving access | Represent access availability as an on-chain fact merely because NFT exists |

Canonical chain state owns custody and authorization. PostgreSQL is a read model, not a judge. Users may call eligible state transitions without platform intervention. Creator verification/profile remains optional metadata, never a prerequisite to permissionless protocol use.

### 1.2 MVP bounded contexts

**Campaign Terms**, **Funding & Accounting**, **Milestone Verification**, **Dispute/Appeal**, **Judge Economics**, **Access Entitlement**. These share immutable identifiers, not one mutable JSON configuration blob.

Recommended commitment anchors: campaignId; creator/payoutWallet; token/chain; goal; fundingDeadline; productionMilestoneBudgets; baseReviewBudget; reviewReserveRules; evidence acceptance criteria hashes; accessPolicyHash; protocolVersion; policyVersion. Bytes of confidential evidence and content remain off-chain; hashes do not validate factual correctness.

## 2. Campaign funding and frozen terms

### 2.1 Campaign configuration

A creator supplies:

| Field | Meaning | Rule |
| --- | --- | --- |
| goal | Minimum total contributed to succeed | MUST equal sum(productionMilestoneBudgets) + baseReviewBudget |
| productionMilestoneBudgets[] | Exact payout budgets for sequential milestones | Positive integer units; immutable once published |
| baseReviewBudget | Minimum earmarked review-fee budget inside goal | Explicit token units; no implicit platform tax |
| fundingDeadline | Absolute chain-time closing boundary | Immutable; reaching goal does NOT close funding |
| acceptanceCriteriaHashes[] | Per-milestone adjudication standard | Frozen; correction cannot silently relax it |
| deliverable/access commitment | Scope and actual Access Pass promise | Frozen summary and content/availability criterion |
| surplusRule | Over-goal contributions enlarge refundable reserve | Fixed in terms; no owner/admin reallocation |
| reviewFee/appeal/challenge policy id | Applicable bounded case economics | Frozen; no post-pledge fee surprises |

No category whitelist is inherent to financial custody. The MVP frontend may feature one demo digital-access offering. A protocol policy or UI can reject incompatible deliverables in a particular deployment, but must not claim universal off-chain verification capability.

### 2.2 Open funding rule

~~~text
PUBLICATION_FINAL_PASS
  -> FUNDING
  -> raised < goal or raised >= goal: continue receiving contributions
  -> block.timestamp >= fundingDeadline
  -> anyone may call finalizeFunding() exactly once/idempotently
     -> if raised >= goal: FUNDED, activate first milestone
     -> otherwise: REFUNDING (all accepted Backer contributions)
~~~

After deadline, new contributions revert even if no caller has finalized yet. Until that materialization, the chain may still display FUNDING; UI should show "deadline elapsed / awaiting finalize" accurately. Goal is a minimum, NEVER a hard cap. Cancellation before deadline requires a separate agreed rule and must not be introduced implicitly.

### 2.3 Reserve accounting

Let:

- G = frozen goal
- B = baseReviewBudget inside goal
- M = total frozen production milestone budget, so G = M + B
- R = total confirmed Backer contributions at funding finalization
- S = max(R - G, 0), only for successfully funded campaigns
- Q = cumulative legitimate review fees **transferred or irrevocably allocated to isolated Judge reward custody**
- P = total executed Creator milestone payout
- F = total executed Backer refunds
- E = remaining campaign escrow custody

The proposed review spending capacity is **B + S**, but this is an authorization cap, NOT money already spent and NOT Judge-owned money at creation. Unspent reserves remain Backer-fundable escrow and are returned at completion/cancellation.

**Global conservation (Backer funds):**

~~~text
R = P + Q + F + E
0 <= P <= M
0 <= Q <= B + S
Q cannot consume funds allocated to outstanding production milestone obligations.
~~~

An initially reserved but not yet vested/paid review fee is still part of E. If a Judge earns a fee but has not claimed it, finalize and isolate the fee into reward-vault custody before the campaign refund snapshot, so E remains unambiguously refundable. Unclaimed **Judge stake and appeal/challenge bonds are separate ledgers/assets**, not additional Backer contributions; use distinct conservation identities to avoid double counting.

If a payable Creator milestone or vested review fee exists when terminal processing starts, the protocol must **settle the already earned immutable obligation first or delay snapshot in a bounded, deterministic state**. It cannot promise that same unit to Creator/Judge and to Backers. Do not grant new discretionary expenditures in terminal state.

### 2.4 Numeric examples (MockUSDC)

**Success and overfunding:**

~~~text
Production M = 1,000
Base review B = 100
Goal G = 1,100
Raised R = 1,400
Surplus S = 300
Review fee actually settled Q = 150
Creator payouts P = 1,000
Remaining E at terminal = 250
Final Backer refunds F = 250
Proof: 1,400 = 1,000 + 150 + 250 + 0
~~~

**Terminal failure after partial payout:**

~~~text
Raised R = 1,400
Previously executed Creator payout P = 400
Already settled Judge fees Q = 60
Escrow still held E = 940
Refund snapshot pool = 940
After all Backer claims F = 940, E = 0
~~~

**Funding failure:** R < G after deadline, production payout P = 0 and no review spending charged to unfulfilled Backer fundraising unless explicitly pledged in a separately versioned policy. All R remains refundable. Publication review already performed before funding cannot silently take a cut from failed Backers.

### 2.5 Fee funding timing (important MVP exception)

Publication review occurs BEFORE Backers have funded the campaign, so it cannot be paid from money that has not arrived. On current local VNext the review service fee is zero. For the MVP prototype: **retain zero local publication service fee unless an explicit experimental funding fixture is introduced**. A future paid design must separately specify Creator-prefunded publication fee or transparent external subsidy; do not make a fictitious debt against future pledges or promise sustainability from overfunding.

Per-case review fee budget must be bounded by frozen policy. A larger R or larger multi-court jury does NOT authorize unlimited fees, bonus payouts, unnecessary retries or unlimited dispute cases. Overfunding changes *available reserve*, not unconstrained right to spend it.

## 3. Milestone review and dispute lifecycle

### 3.1 Separate the operations

- **Base Review**: ordinary verification that automatically follows a Creator's immutable evidence submission for the active milestone. This is NOT an adversarial dispute request.
- **Challenge**: eligible actor disputes a canonical PASS during the challenge window, bound to the exact milestone and evidence revision.
- **Appeal**: eligible party contests a provisional review ruling within the appeal window. Separate Judge pool and bounded rounds.
- **Protocol Retry**: deterministic recovery for invalid/tied/no-quorum/randomness failure; NOT a second chance to overturn a substantive PASS/FAIL.
- **Timeout**: deadline violation with on-chain preconditions; where no subjective fact is required, permissionless transition without wasting Judge fees.

### 3.2 Required flow

~~~text
ACTIVE MILESTONE
  |-- Creator submits evidence before submissionDeadline
  |      -> freeze evidenceRevision + evidenceHash + acceptanceCriteriaHash
  |      -> create Base Review case -> enrollment -> random courts
  |      -> commit -> reveal -> aggregate -> provisional ruling
  |      -> bounded appeal / retry -> final ruling
  |          |-- FINAL_PASS -> challenge window
  |          |     |-- no eligible challenge -> milestone payout when eligible
  |          |     '-- bounded challenge case -> final challenge disposition
  |          |-- VERDICT_FAIL -> bounded correction -> resubmit or terminal
  |          '-- PROTOCOL_FAIL -> explicit fail-closed terminal policy
  '-- submissionDeadline elapsed with no submission
         -> permissionless timeout -> terminal/refund path
~~~

Creator may submit early. Deadline is the **latest accepted submission timestamp**, not an instruction to delay review until that date. Only an ACTIVATED milestone with an initialized nonzero deadline can expire. Future pending milestones with deadline zero, CREATED campaigns and completed campaigns may NOT be forced to refund by a public caller. Exact guard regression tests are mandatory.

For the MVP, **one active challenge per milestone evidence revision** remains the current baseline. Do not turn unlimited off-chain comments into unlimited on-chain paid review cases. A challenge must have an actual evidence commitment, one bounded window, replay guard, fixed policy id and review-fee budget exposure. The challenge case's evidence and outcome must bind the precise challenged revision.

### 3.3 Retain bonds for MVP; defer pooled objections

- Existing local reference: **appealBond = 1 MockUSDC** in the VNext registry; **challengeBond = 0** in parameter registry V1; the current implementation's challenge path does not transfer a challenge bond.
- User direction: **keep a bond-based anti-spam mechanism for now**, do not implement pooled objection or a new token-voting threshold in this MVP.
- A funded, fee-paying challenge requires an expressly versioned **challenge-bond amount, payer, lock/return/slash conditions and disposition** before it can be enabled; amount is deliberately NOT approved by this design. A high bond cannot be assumed affordable merely because there are many courts.
- Judge stake is NOT challenge bond; neither should automatically scale one-to-one with number of courts.
- One active paid challenge/case per revision; appeal count, retries, deadlines and per-case fee caps are bounded. Replay, arbitrary repeated opening and duplicate settlement must revert.
- Evidence aggregation, permissionless objection by any external wallet, pooled disputes, community bond crowdfunding and a richer secondary escalation model are **deferred research**. Do not state these as accepted MVP policy.

**Failure hazard:** The current contract resolves any challenge result other than FINAL_PASS to refund, including PROTOCOL_FAIL. That is a liveness/griefing risk: a failed court does not prove Creator misconduct. This design does not silently overwrite the existing rule. A revised challenge-failure policy and corresponding adversarial proof are an **acceptance gate before fee-bearing/public deployments**; keep explicit status and cost exposure in local tests.

### 3.4 Who may act

| Action | Authorized actor or guard |
| --- | --- |
| Create campaign | Any wallet |
| Open publication base review | Protocol as consequence of creator's frozen proposal |
| Pledge | Any wallet within funding window |
| Finalize funding | Any caller AFTER frozen deadline |
| Submit/revise active milestone evidence | Frozen Creator wallet, within policy deadline/correction allowance |
| Trigger deadline timeout | Any caller, active initialized deadline only |
| Enroll as Judge | Permissionless stake/eligibility/conflict guards |
| Vote | Assigned Judge only, commit/reveal deadline |
| Open challenge | Eligible Backer with required bond/valid window/revision (MVP baseline) |
| Appeal | Creator/Backer per existing outcome guard and bond |
| Payout eligible milestone | Any caller, canonical conditions |
| Open/snapshot terminal refunds | Any caller after obligations/guards settle |
| Claim own refund | The contributing wallet, exactly once |
| Mint/claim Access Pass | Eligible Backer wallet under access-release policy |

No backend user role, Admin or Resolver signature is a financial review authority.

## 4. Terminal transition and Backer refunds

### 4.1 Fundamental promise

When a campaign is **COMPLETED** or **terminally FAILED/CANCELLED**, every unspent token remaining in **campaign custody** belongs to the refundable Backer pool, *after legitimate already-earned obligations are isolated or irrevocably accounted for*. No "leftover to Creator" transfer, Admin sweep or treasury siphon.

**E is a point-in-time balance, not protocol revenue.** While a campaign is ACTIVE, E is locked for unfinished production and fee obligations. At terminal refund snapshot, the entire net E is assigned to Backers; during claim processing the actual E decreases and F increases. Do not describe E=0 immediately upon opening refunds: pull-based claims are pending until each Backer executes them. If a claimant never calls, the corresponding token must remain claimable; do not silently seize it.

### 4.2 Snapshot allocation

For confirmed contribution c_i and frozen total R, let V = refundable terminal snapshot pool, where V includes unused production allocations and unused review reserve/surplus.

~~~text
BackerShare_i = pro-rata(V, c_i, R)
sum(BackerShare_i) = V (including deterministic dust allocation)
Refunded_i <= BackerShare_i
No wallet can redirect another wallet's share
No double claim, no order-dependent rounding
~~~

Use the existing deterministic prefix-share or an equivalent total-conserving algorithm. Snapshot exactly once; batch processing must be bounded in gas. All funds must be allocated even when one share rounds to zero. Distinguish allocation (accounting entitlement) from actual token transfer.

**Access and refund are independent:** A successful Backer can receive the Access Pass and a refund of *unused reserve*. This is NOT a reversal of their access rights. Failed/cancelled campaigns do not automatically grant an Access Pass. A partial-loss refund only returns funds still held, not money already legitimately paid to Creator/Judges.

### 4.3 Priority at terminal

1. Stop new funding, milestone submissions, payout proposals and paid dispute openings.
2. Resolve or deterministically close existing review/case commitments under bounded retry/timeout rules.
3. Account for and isolate **vested** Judge compensation and already-earned immutable payouts; unearned future fees are canceled, not charged.
4. Freeze exact residual campaign balance and contribution snapshot; allocate 100% to Backer claims.
5. Allow each wallet to withdraw its claim safely and idempotently; report unclaimed liabilities without expiration-based confiscation in MVP.

Where already-earned Creator payout conflicts with a cancellation transition, require a specific deterministic transition and test. "Anyone can refund remaining balance now" must not cause insolvency to previously authorized payments.

## 5. Digital Access Pass (single MVP use case)

### 5.1 Meaning, NOT a PDF replacement field

An Access Pass represents the right to access a **specified digital resource/service**, as committed in the campaign terms. It is not the underlying product, proof of IP ownership, an on-chain copy of files or an automatic real-world guarantee. Do NOT reuse old PDF-specific product assumptions as universal entitlement rules.

Reference MVP: one project-specific access credential type per completed campaign, at most **one pass per contributing wallet**. A wallet can contribute multiple times; its amount affects pro-rata refund, not the number of passes. Eligibility derives from canonical contribution and successful verified final-deliverable state. A minimal positive contribution rule is the initial demonstration behavior; dust/Sybil/infrastructure abuse are explicit accepted risks to measure, not reasons to impose KYC.

### 5.2 Access Pass lifecycle

~~~text
Verified funding + confirmed Backer contribution
  -> entitlement pending (no mint and no claimable access yet)
  -> final deliverable evidence/hash accepted by jury
  -> appeal/challenge conditions fulfilled
  -> campaign COMPLETED + access availability commitment satisfied
  -> backer may claim/mint one Access Pass
  -> access gateway checks connected wallet + NFT ownership
  -> display Access Pass on Backer profile (optional showcase)
~~~

For MVP simplicity, **nontransferable/pass-locked credentials are a temporary design assumption** until the team decides how secondary transfers interact with perpetual/expiring access, refund identity and content revocation. Do not quietly revive archived NFT activation-lock/marketplace requirements. If implementing, record explicit token standard, nontransferability rules and method of enforcing claim uniqueness in a separate ERC design.

An availability hash verifies specific bytes/metadata, not uptime or factual validity of content. Define a concrete MVP access endpoint and simple availability acceptance test; do not assert decentralized storage when MinIO/gateway remain trusted for serving bytes.

### 5.3 Delivery failure

If final deliverable is not verifiably available at the required gate, the final payout/access enablement must **fail closed** or enter an explicitly bounded correction/dispute route. A campaign cannot receive the last immutable payout merely because a judge marked a generic hash as PASS if Access Pass holders cannot be served the promised resource under the frozen verification criteria.

No generic multi-service integration framework is required. One access journey with wallet authorization is sufficient to validate MVP.

## 6. Research and economic questions NOT finalized by MVP

Research Judge incentives independently of the functional MVP:

- What is the smallest sustainable fee for a 3-Judge court? What changes when K = floor(N/3) courts?
- Compare **slash-only**, **flat review fee + slash**, **risk-adjusted fee + slash**.
- How often is review reserve exhausted under ordinary milestone review versus adversarial challenge/appeal?
- Can malicious Backer/Judge collusion extract more review fees than its bond/stake loss?
- Does an open funding window with refundable surplus improve conversion or only create more unused locked capital?
- How do submission deadlines, juror non-reveal, invalid court and PROTOCOL_FAIL affect expected refund and time-to-completion?

Primary research metrics: Judge participation, actual court cost, gas per round/settlement, rate of substantive vs PROTOCOL_FAIL, appeal/challenge rate, fraction of funding spent on review, refundable fraction after partial failure, time to settlement, and attack profitability. No claim of Sybil/collusion/bribery resistance without explicit threat-model assumptions and evidence.

MVP numeric amounts (other than the already-versioned local test policy) must remain **experimental parameters**. Do not assign a production fee rate, bond floor or maximum court count without measurements and a new policy version.

## 7. Current repository gap audit (main ab93b702)

| Area | Existing behavior confirmed in source | Required MVP design delta |
| --- | --- | --- |
| Funding | CampaignEscrowVNext.contribute rejects raised + amount > goal | Allow overfunding; cap no longer equals goal |
| Funding termination | finalizeFunding may succeed immediately when raised >= goal | Require block.timestamp >= fundingDeadline even when funded |
| Campaign budgets | createCampaign requires sum(milestoneBudgets) == goal | Define goal = production budgets + base review budget; never pay reserved review funds as production |
| Review-fee funding | Local registry baseReviewFee=0 and challengeBond=0; appealBond=1 MockUSDC | Freeze source, caps, bond flow and separate Judge fee ledger before enabling paid reviews |
| Refunds | Current conservation is R = P + F + E; refund allocations are pro-rata on existing terminal policy | Extend to R = P + Q + F + E and support successful-completion residual refunds |
| Review triggers | submitMilestoneEvidence creates review case; challenge after PASS; bounded appeal/retry present | Clarify triggers, fee caps, exact evidence binding and challenge failure semantics |
| Deadline safety | PENDING milestone initializes submissionDeadline=0; earlier review found permissionless expiry vulnerability | Re-audit active deadline guard on changed branch and add regressions before implementing new policy |
| Digital product | Prior product is COMICS_ARTBOOK / STANDARD / PDF, old delivery.policy is PDF-aware | One generic digital access commitment + NFT Access Pass; no marketplace |
| User journeys | VNext API/protocol page are read-only; Creator/Backer/Judge legacy surfaces coexist | Build one full wallet-based VNext MVP journey and replay acceptance |
| Spec | Current research-direction/SCOPE/FINANCIAL_POLICY and registry describe old fixed PDF scope, overfunding rejected | Adopt new versioned policy documents ONLY after design approval |

Relevant source anchors:
- [CampaignEscrowVNext.sol](../../../contracts/src/campaigns/CampaignEscrowVNext.sol) (createCampaign, contribute, finalizeFunding, submitMilestoneEvidence, payMilestone, openChallenge, resolveChallenge).
- [JuryReview.sol](../../../contracts/src/jury/JuryReview.sol) and [JuryRegistry.sol](../../../contracts/src/jury/JuryRegistry.sol).
- [parameters-v1.md](../../protocol/parameters-v1.md), [parameters-v2-remediation.md](../../protocol/parameters-v2-remediation.md).
- [FINANCIAL_POLICY_V2_DECENTRALIZED.md](../../campaigns/FINANCIAL_POLICY_V2_DECENTRALIZED.md).
- [VNext project overview](../../PROJECT_OVERVIEW.md).

The last reviewed main SHA is not independent verification of a user's unmerged local patches. This document proposes semantics; it does not claim deployments/tests passed.

## 8. MVP acceptance matrix (documentation requirements, not test results)

| ID | Scenario | Expected protocol result |
| --- | --- | --- |
| T01 | Raised reaches goal 3 days before deadline | Funding remains open and continues accepting contributions |
| T02 | Raised exceeds goal, before deadline | Contribution accepted; surplus tracked under refundable reserve |
| T03 | Anyone tries finalize before deadline, even with raised >= goal | Revert; no premature FUNDED transition |
| T04 | Deadline passed, raised >= goal | Permissionless single funding finalization; milestones active |
| T05 | Deadline passed, raised < goal | Full R allocated to Backers; no Creator/review fee deduction from failed raise |
| T06 | Success R=1,400; M=1,000; B=100; Q=150 | Terminal refund V=250 after production completion |
| T07 | Partial P=400; Q=60; R=1,400 then terminal failure | Refund pool V=940; sum shares exactly 940 |
| T08 | 3+ Backers with rounding dust and varying claim order | Every snapshot unit allocated once, no double claim or lost dust |
| T09 | Created campaign or future milestone with deadline=0 | Permissionless expiry prohibited |
| T10 | Creator submits active milestone evidence before deadline | Exactly one bound base case for that revision |
| T11 | Active milestone deadline passes without evidence | Permissionless timeout; no fee-burning phantom review |
| T12 | Multiple challengers for same milestone revision | At most one active challenge case; no duplicate review fee allocation |
| T13 | Challenge/appeal bond return or slash | Exactly-once, separately conserved from Backer funds |
| T14 | Jury no quorum/PROTOCOL_FAIL after challenge | Deterministic policy, never mistaken for proof of Creator wrongdoing; griefing costs tested |
| T15 | Finalizable Judge fee is accrued but not claimed | Isolate fee ownership before Backer snapshot; no double liability |
| T16 | All milestones passed and access availability verified | Eligible Backer can mint once and use Access Pass |
| T17 | Successful campaign has unspent review budget | Backer can claim surplus refund without losing valid Access Pass |
| T18 | Failed campaign after partial production payout | No pass mint; remaining escrow is fully refundable pro-rata |
| T19 | Backend/MinIO unavailable or stale indexer | No unilateral fund release; UI shows availability/settlement uncertainty |
| T20 | Full fresh Anvil + PostgreSQL + MinIO journey | Canonical receipts, indexer projections, payout, fee allocation, NFT claim and refund reconcile |

Required methods when implemented: Foundry unit/fuzz/invariant tests, state-machine adversarial tests, deterministic local timestamp controls, indexed-event replay tests, wallet journey acceptance and bounded gas tests for multi-court/large Backer sets. **No new test has been run for this design document.**

## 9. Next design/adoption gates (not an implementation plan)

1. **Review this document as a proposal.** Confirm campaign goal partition, overfunding treatment, terminal pool ownership and NFT eligibility.
2. Resolve exactly the blocking policies before changing a fund-moving contract: paid challenge bond flow/amount; per-round fee budget and fee insufficiency behavior; dispute PROTOCOL_FAIL disposition; handling of previously earned but unsettled milestone obligations; Access Pass transferability rule; publication review fee source when no Backer funds exist.
3. Write a *new* versioned economic policy/parameter registry. Explicit migration boundary: existing campaign terms remain unchanged.
4. Only then reconcile the active source-of-truth docs and write an implementation plan (Foundry/state accounting -> indexer -> API -> wallet UIs -> local E2E).
5. Keep anti-spam pooled objection, NFT resale, multi-product marketplace and public-chain parameters strictly post-MVP/research until separately approved.

## 10. One-sentence product promise

**A Backer funds a permissionless project, knows the frozen production and verification budgets, may scrutinize milestone evidence, receives a verifiable NFT access right on successful delivery, and can reclaim their exact pro-rata share of every unspent campaign-escrow unit at completion or terminal failure.**
