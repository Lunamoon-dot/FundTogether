# FundTogether — Digital Comic Download MVP

> **Status:** Approved product scope and local financial policy; R0–R5 implemented with automated local acceptance and main-runtime cutover. Manual wallet/real Creator verification and public launch remain outside that evidence.
> **Updated:** 2026-10-13. **Version:** `reward-comic-download-mvp-v1`.
> **Scope:** `COMICS_ARTBOOK` campaigns only, with one controlled PDF download reward.
> **Priority:** This user-approved scope applies to new Reward campaigns. It does not rewrite a deployed campaign, historic event, entitlement, or pending claim.

## 1. Product boundary

FundTogether MVP is a local MockUSDC crowdfunding pilot for an independent digital comic or artbook. A backer supports a campaign and, after the approved release gate, receives access to one PDF through their authenticated FundTogether account.

The purpose is to evaluate verifiable funding, production-evidence review, and digital-delivery transparency. It is not an investment, marketplace, publishing platform, DRM product, or logistics system.

### Exactly in scope

| Concern | MVP rule |
| --- | --- |
| Campaign category | `COMICS_ARTBOOK` only |
| Reward kind | `DIGITAL_DOWNLOAD` only |
| Deliverable | One final PDF per campaign |
| Public tier | One standard digital-download tier; no collectible/limited variants |
| Entitlement | One non-transferable entitlement per canonical accepted pledge log |
| File delivery | Authenticated short-lived download URL for a private object-store file |
| Pilot payment | Local MockUSDC only |

### Explicitly out of scope

- Other categories: games, software, board games, courses, plugins, asset packs.
- EPUB, game keys, license keys, access portals, subscriptions, DRM, expiry, revocation rules, NFTs and transferability.
- Physical books, printed artbooks, merchandise, shipping, addresses, phone numbers, tracking, fulfilment batches, warehouse or any future-merch voucher.
- Multiple paid tiers, limited inventory, bundles, add-ons, platform fees, fiat, off-ramp and public-chain deployment.

`PHYSICAL_ITEM`, `SHIPPING`, `PHYSICAL_REDEMPTION`, `REDEEM_FOR_MERCH`, `DIGITAL_ACCESS`, and `DIGITAL_LICENSE` are invalid for this policy. The server must reject them at every write boundary; hiding them in the frontend is insufficient.

## 2. MVP journey

```text
Creator verification + IP declaration
  -> draft one COMICS_ARTBOOK campaign
  -> submit sample pages, delivery plan and budget/evidence plan
  -> freeze commitment and Resolver campaign review
  -> 24-hour Resolver review SLA; overdue remains actionable and does not auto-decide
  -> CHANGES_REQUESTED returns to DRAFT for another freeze/submit cycle
  -> publish only after the financial-policy gates permit it
  -> Backer pledges one standard PDF tier on-chain
  -> canonical receipt/event index creates one entitlement per log
  -> production evidence is reviewed
  -> resolver accepts the final PDF release evidence
  -> entitled backer downloads the private PDF
  -> complete, dispute or refund according to approved policy
```

The four trust states must remain distinct:

- `ON_CHAIN_CONFIRMED`: a canonical event proves the token transition.
- `EVIDENCE_REVIEWED`: a Resolver accepted stated evidence; it does not prove every off-chain fact.
- `DOWNLOAD_AVAILABLE`: the authorised backer can obtain the PDF.
- `BACKER_CONFIRMED`: optional backer feedback; it is not inferred from a download request.

## 3. Actors and authority

| Role | May do | May not do |
| --- | --- | --- |
| Creator | Create own draft, submit IP/sample/release evidence, upload final PDF, request an approved financial action | Self-approve identity, campaign, payout, final release or completion |
| Admin | Verify creator identity and IP declaration | Authorise money movement solely by platform role |
| Resolver | Review campaign, evidence, financial requests and disputes | Alter frozen terms, creator wallet or entitlement ownership |
| Backer | Pledge, access own entitlement, report a broken/unavailable file, claim an eligible refund | Create entitlement without canonical receipt |
| Indexer | Project canonical chain events into PostgreSQL | Invent payment, entitlement or fund movement |

Wallet authentication proves wallet control; it does not replace creator identity/IP review. Financial truth remains:

```text
Smart contract event -> canonical receipt -> idempotent indexer -> database projection -> UI
```

## 4. Campaign and reward configuration

Every new MVP campaign must freeze a typed, versioned configuration with these fields:

| Field | Rule |
| --- | --- |
| `mode` | `REWARD_V1` |
| `policyVersion` | `reward-comic-download-mvp-v1` |
| `category` | Exactly `COMICS_ARTBOOK` |
| Creator | Server-owned creator identity plus verified linked payout wallet |
| Content evidence | Sample pages, content outline, authorship/publication-right declaration, planned PDF release window |
| Reward | Exactly one `DIGITAL_DOWNLOAD` item describing one PDF; no alternate delivery form |
| Tier | Exactly one standard tier; no finite/collectible/later-merch semantics |
| Financial fields | Goal and duration are integer/base-unit values and remain subject to the open gates below |
| Commitment | Hash canonical frozen campaign terms, standard tier terms, evidence references and policy version |

The final PDF is not assumed to exist at draft time. Before it becomes downloadable, the Creator uploads it to private storage and the system records its content hash, MIME type and immutable release evidence. The commitment must state the promised format and release terms; the release review binds the delivered file hash.

Do not collect address, telephone, carrier, shipping or physical-recipient data. No shipping columns, APIs, forms, batches or physical entitlement states belong to a new `REWARD_V1` implementation.

## 5. Download entitlement

```text
PAYMENT_PENDING
  -> PENDING_GOAL
  -> ACTIVE
  -> DOWNLOAD_AVAILABLE
  -> DOWNLOADED (audit event only)

Alternative: DISPUTED -> REFUND_ELIGIBLE -> REFUNDED
```

- The canonical pledge identity is `(chainId, contractAddress, txHash, logIndex)`.
- A receipt, HTTP success or wallet popup never grants a right by itself.
- The private PDF is served only after entitlement projection is `DOWNLOAD_AVAILABLE` and the requesting account owns that entitlement.
- A download audit event proves a file was made available/requested; it does not prove the backer read, accepted or enjoyed it.
- There is no DRM claim, one-time-key promise, expiry rule or automatic post-download refund rule in this MVP.

## 6. Evidence and release review

| Stage | Required evidence | Decision |
| --- | --- | --- |
| Creator verification | Identity, IP declaration, sample pages | Admin verifies/rejects creator |
| Campaign review | Frozen campaign, one PDF reward, sample/content plan, budget/evidence plan | Resolver approves/rejects publication eligibility |
| Production review | Progress evidence and any approved spending evidence | Resolver accepts/rejects evidence without equating it to delivery |
| Digital release review | Private PDF, content hash, format/openability check, release summary | Resolver marks eligible entitlements `DOWNLOAD_AVAILABLE` |

Public reporting may expose approved decisions, hashes, campaign/tier terms, escrow movements and aggregate entitlement/download/dispute counts. It must not expose raw identity documents, the private PDF, access URLs, wallet-private information or sensitive disputes.

## 7. Financial and rights gates

The table below records the current decision gates. On 2026-10-13 the user approved
the complete local proposal in [EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md](EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md),
with Resolver making decisions and community participating in checking detailed
requests. D02–D05 and D07–D12 now have an approved local implementation policy;
D06 remains deferred. Local implementation and verification results are recorded
in [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md). Public/real-asset launch is still prohibited.

No agent may silently substitute the legacy advance/refund rules for this versioned
policy. Approval and automated local test evidence do not imply public-launch acceptance.

| Gate | Status | Approved local behaviour |
| --- | --- | --- |
| `D01` Digital comic PDF only | **APPROVED** | Enforce the exact scope above everywhere |
| `D02` Early creator payout/exposure | **APPROVED LOCAL** | No advance; payout only after accepted PDF, 7-day challenge period and no open challenge |
| `D03` Resolver/backup authority and dispute escalation | **APPROVED LOCAL** | Primary Resolver decides; backup after 7 days; community reports are advisory; unresolved challenge after 30 days opens refunds |
| `D04` Late/failed delivery and refunds after download | **APPROVED LOCAL** | Full pre-payout refunds for approved failure/cancellation/deadline/challenge paths; no automatic post-payout refund |
| `D05` Overfunding | **APPROVED LOCAL** | Allowed until funding deadline under the same frozen terms |
| `D06` Physical delivery | **DEFERRED** | No physical data, UI, API or state machine |
| `D07` Pledge limits/order policy | **APPROVED LOCAL** | One fixed-price pledge per wallet; no inventory, quantities or extra tiers |
| `D08` Download duration/revocation | **APPROVED LOCAL** | No automatic expiry/unilateral revocation for valid entitlements; refunded/orphaned pledges lose access; no permanent-hosting promise |
| `D09` Platform fees | **APPROVED LOCAL** | Zero fee |
| `D10` Consumer/copyright/crypto legal rules | **LOCAL ONLY; PUBLIC DEFERRED** | MockUSDC on chain 31339; no real-money/public launch or legal acceptance claim |
| `D11` Goal and duration bounds | **APPROVED LOCAL** | 1–60 days, positive uint256 amounts, price no greater than goal, release deadline after funding |
| `D12` Cancellation/material change | **APPROVED LOCAL** | Creator can cancel before payout for full refunds; frozen terms and accepted PDF remain immutable |

Historical contracts follow their own versioned rules. Their claims and accounting are not relabelled as Editions.

## 8. Migration boundary

The digital slice passed automated local acceptance before physical API/UI, active shipping columns, runtime address encryption and batch workflows were retired. Migration 0005 is applied to the main local DB: eight reconciled test fixtures and their delivery history are archived; all 32 live financial rows and historical contract balances remain unchanged. Regression tests cover the archive and rejected physical routes.

Do not retroactively relabel existing records or mutate a deployed contract. Editions uses its own contract/deployment, ABI and indexer stream for the approved state machine. Archived private history and financial compatibility paths remain available under the retention policy in [WORKFLOWS.md](WORKFLOWS.md).

## 9. Acceptance criteria

- Only `COMICS_ARTBOOK` with one `DIGITAL_DOWNLOAD` PDF reward can be drafted, submitted and published under this policy.
- Direct API payloads containing another category, another reward kind, a physical obligation, address, shipping, tracking or future-merch language fail closed.
- Creator A cannot modify Creator B's campaign; ADMIN cannot bypass Resolver money authority; Resolver cannot rewrite frozen terms.
- Two frozen configurations with different PDF/reward terms have different commitments.
- A reverted, wrong-chain, wrong-contract, duplicate or non-canonical pledge event creates zero entitlements.
- Each accepted canonical pledge log creates exactly one entitlement for the correct backer and campaign.
- An account without that entitlement cannot download the private PDF; an active entitlement cannot access the file before digital release review.
- A broken/unavailable file is represented as a dispute, not silently marked delivered.
- No new Reward workflow requests or persists shipping/physical fulfilment data.

## 10. Implementation order

1. **R0 — Scope audit:** map physical code/data/tests to retire and record the policy/code gap.
2. **R1 — Draft and validation:** add server-authoritative `COMICS_ARTBOOK`/`DIGITAL_DOWNLOAD` validation and tests; no monetary-policy change.
3. **R2 — Freeze and review:** commit the single-tier PDF terms and evidence references; enforce ACL and redaction.
4. **R3 — Financial design:** resolve D02–D12 that affect custody/rights, then review/version contract, indexer and refund behaviour.
5. **R4 — Digital vertical slice:** private PDF release, entitlement-gated download, dispute representation and browser acceptance.
6. **R5 — Retirement:** remove physical Reward surface only after R4 passes and no active data obligation depends on it.

## 11. Completion reporting

Report actual branch/SHA, changed files, migrations, deployment/ABI version, commands run and exact results. Distinguish this approved scope from code actually completed, manual wallet testing, real creator verification and any legal/public-launch claim.
