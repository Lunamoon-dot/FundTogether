# FundTogether — Reward Pass V2: Manual Activation, Transfer Lock & Benefit Entitlements

> **Status:** PRODUCT DECISIONS CONFIRMED, TECHNICAL POLICY PROPOSED — not implemented, not approved for real assets.  
> **Date:** 2026-10-14.  
> **Target:** New Reward Pass V2 campaign/deployment only. **Do not retroactively modify historical Editions/Reward entitlements or deployed financial obligations.**  
> **Repository inspected:** `Lunamoon-dot/FundTogether`, `main` at `d262b8dda87ef950bc493072b828cf8563dd8be8` (reinspect local HEAD/working tree before editing).  
> **Related existing documents:** `docs/reward/FUNDTOGETHER_CAMPAIGN_CONFIG_MVP.md`, `docs/reward/WORKFLOWS.md`, `docs/reward/EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md`, `docs/reward-crowdfunding-adr-001.md`.

## 0. Instructions to the coding agent

This file is a **product/technical specification and implementation handoff**, not permission to deploy or rewrite production/legacy data. Inspect `AGENTS.md`, `docs/research-direction.md`, current git status, deployment manifests, current contract/backend/indexer/frontend, DB migrations, chain balances/obligations before implementation. Newer direct user decisions take precedence over older historical documentation; log any conflicting policies explicitly. Do not equate passing old R0–R5 Editions tests with verification of V2.

**No silent decisions affecting funds, refund claimants, transferability, rights, campaign success or identity.** Do not delete/reset chains, databases, object storage, archives, migrations or legacy contract support. Do not use real USDC or publicly deploy without explicit authorization. Work incrementally with versioned contracts, ABI, projections, and additive schema changes.

## 1. Product vision and confirmed decisions

FundTogether offers reward crowdfunding with one **Reward Pass NFT per individually identifiable pass**, where a pass represents a campaign-specific reward tier and references one or several benefits (digital downloads, license claims, event access; physical redemption post-MVP).

| ID | Decision | Status |
|---|---|---|
| NFT-01 | Secondary transfers are permitted **only after the campaign succeeds at the agreed finality gate**, not merely when the goal is funded. | User confirmed concept; exact state mapping defined below is proposed V2 policy. |
| NFT-02 | Once activated, a Reward Pass NFT is **permanently non-transferable**. Enforcement resides inside the NFT contract, including transfers outside FundTogether. | **CONFIRMED** |
| NFT-03 | No creator royalty on secondary sales (`ERC-2981` not required). | **CONFIRMED** |
| NFT-04 | Activation is **explicit, voluntary, on-chain, irreversible**, initiated by the current owner pressing `Activate NFT` before accessing any protected benefit. | **CONFIRMED — option B** |
| NFT-05 | NFT/token standard for unique activation: ERC-721 per individually identifiable pass (rather than fungible units within an ERC-1155 token ID). | **Architecture recommendation**, not an immutable user decision. |
| NFT-06 | Physical merchandise redemption, on-chain marketplace contracts, fiat payment, mainnet launch are outside this V2 pilot. | Proposed pilot scope aligned with previous digital-only decision. |

**Terminology:** Reward tier = offer/price/benefits; pass NFT = unique transferable credential until activated; benefit = a particular right; redemption = consumption or issuance of a benefit. An activation is **not** consumption of all benefits, but freezes transferability of the *entire pass*. Token is not a currency, equity, profit claim or automatic creator royalty.

## 2. Campaign and NFT state machines

### 2.1 Campaign states and gates

For V2, distinguish:

- `FUNDING`: pledges accepted; goal still undecided.
- `ACTIVE`: funding reached the goal but production/release obligations remain.
- `RELEASED`: independently reviewed reward deliverables are ready; dispute/challenge window may still be open.
- `COMPLETED` / `FINANCIALLY_FINALIZED`: payout performed per the immutable policy, with the challenge/refund gate concluded (in Editions V1 this is after 7-day challenge period with no open challenge). **Only this finality gate unlocks V2 secondary transfer and V2 activation in the recommended conservative rollout.**
- `REFUNDING` / `CANCELLED` / `DISPUTED`: no mint, transfer, activation or new benefits; claims operate only per that campaign's versioned financial policy. An existing NFT must never be used to bypass escrow refunds.

`FUNDING_SUCCEEDED` is not equivalent to `FINANCIALLY_FINALIZED`. A project can reach the goal and still fail to deliver. **If future V2 uses preproduction advances instead of current Editions no-advance payout, redesign refund/finality gates separately and obtain approval first.**

> **Proposed V2 choice requiring user approval before money-related implementation:** activate *only after* `COMPLETED` to avoid an activation immediately preceding a refundable failed-release state. This intentionally differs from Editions V1, which currently grants PDF download in `RELEASED` and `COMPLETED`. Do not remove/retcon V1 access; create a new versioned V2 policy. If early content access during `RELEASED` is mandatory, explicitly design refundable activation and the consequences; do not silently treat it as equivalent.

### 2.2 Individual pass state machine

```text
PLEDGE_CANONICAL  -> PENDING_PASS (DB projection only; no tradable NFT)
                                    |
                                    | campaign FINANCIALLY_FINALIZED
                                    v
                              CLAIMABLE_PASS
                                    |
                                    | backer claims/mints against canonical eligible pledge
                                    v
                            MINTED_UNACTIVATED  <---->  MINTED_UNACTIVATED
                                    |                    transfer between wallets
                                    | owner signs activate(tokenId)
                                    v
                            ACTIVATION_PENDING  (UI-only, tx not yet confirmed)
                                    |
                                    | canonical chain receipt/event
                                    v
                              ACTIVATED_LOCKED   (permanent on-chain)
                                    |
                                    +--> FILE_ACCESS / LICENSE_CLAIM / EVENT_REGISTRATION
                                          (each benefit has its own lifecycle)
```

- `ACTIVATION_PENDING` is not an on-chain final state. Wallet reject/revert/time-out returns UI to chain-derived state; pending tx is not proof.
- `ACTIVATED_LOCKED` cannot go back to `MINTED_UNACTIVATED`, cannot transfer, burn, bridge or wrap via ordinary owner operations. Disallow burning in V2 to prevent users from discarding rights unintentionally; no administrative unlock.
- The NFT remains in the activating wallet. No `deactivate`, `resetActivated`, `adminMove` or equivalent privileged escape hatch.
- **Minting recommendation:** claim mint only once after finality; one unique tokenId per canonical pledge entitlement. If a separate mint policy is approved, adapt these gates without exposing pre-finality token trading.
- A marketplace cannot override transfer restrictions. A stale off-chain listing may remain visible but settlement MUST revert after activation.

## 3. UX specification

### 3.1 My Rewards / My Passes

Each card shows campaign/title, campaign finality, tier/benefit labels, contract/network/tokenId, immutable ownership link, status badge, and primary action.

| Status | Primary CTA | Secondary action | Explanation |
|---|---|---|---|
| Pledge pending / indexer lag | `Đang xác nhận` (disabled) | View transaction | No NFT yet. |
| Goal reached, pending review | `Chưa thể nhận NFT` | View progress | Goal alone does not unlock transfer or activation. |
| Refunding / failed | `Yêu cầu hoàn tiền` (if eligible) | View decision | Cannot claim/activate/transfer V2 pass. |
| Financially finalized, unclaimed | `Nhận Reward Pass` | View benefits | Claim/mint transaction in wallet, await canonical confirmation. |
| Minted, unactivated | **`Activate NFT`** | `Chuyển nhượng / giao dịch` if market support exists | All protected benefits locked until activation; transfer available while unactivated. |
| Activation pending | `Đang xác nhận kích hoạt` | View transaction | NO download/access/claim yet. |
| Activated, locked | `Xem quyền lợi` | View NFT explorer | NFT remains in wallet forever; transfer and marketplace unavailable. |

Use terms understandable without NFT knowledge, e.g. `Chưa sử dụng · Có thể chuyển nhượng`, `Đã kích hoạt · Không thể chuyển nhượng`, `Chờ xác nhận trên mạng`.

### 3.2 Activation confirmation dialog

1. User clicks **Activate NFT** on a token confirmed as owned by currently connected, SIWE-linked wallet.
2. App refreshes canonical/on-chain `ownerOf(tokenId)`, `activated(tokenId)`, V2 contract deployment, chain ID and campaign finality before showing the confirmation. If mismatch: disable and ask wallet switch/reload; do not auto-connect another account or network without user initiation.
3. A modal displays the exact contract/token ID, chain, number and names of available benefits, and gas denomination/estimate when available. It explicitly warns:

   > **Kích hoạt là vĩnh viễn.** Sau khi xác nhận, NFT này **không thể bán, tặng hoặc chuyển sang ví khác**, kể cả trên marketplace bên ngoài. Bạn vẫn có thể sử dụng những quyền lợi còn hiệu lực theo cam kết của campaign. Hành động này yêu cầu ký giao dịch blockchain và có thể tốn phí mạng.

4. Checkbox **`Tôi hiểu NFT sẽ bị khóa chuyển nhượng vĩnh viễn`** is mandatory; no prechecked defaults. Show primary `Xác nhận kích hoạt` and secondary `Hủy`.
5. Wallet prompts an actual state-changing transaction `activate(tokenId)` (not only SIWE or signMessage). If smart account/gas sponsorship is used later, show who pays fees without claiming gas-free unless verified.
6. UI shows `WAITING_FOR_WALLET`, `SUBMITTED`, `CONFIRMED_WAITING_INDEXER`, and `ACTIVATED`. Only canonical confirmation plus a trustworthy on-chain ownership/activation read grants benefits; backend projector must catch up. Expose `Thử đồng bộ lại` for indexer lag (read-only retry).
7. If wallet rejects or tx reverts, return to `MINTED_UNACTIVATED` and show cause; do not say activated. If reorg invalidates confirmation, revoke provisional access and resync canonical state.
8. When confirmed: `Đã kích hoạt`, transfer/marketplace CTAs removed/disabled, benefits become accessible according to benefit-specific rules.

Never combine activation with an automatic first download, key reveal or meeting registration without a separate explicit product decision and UX confirmation; avoid users mistakenly consuming a benefit in the same click.

### 3.3 Benefits UX after activation

- **DIGITAL_DOWNLOAD:** `Tải file` generates an authenticated, scoped, short-lived URL. Verify ownership/activated/finality/canonical deployment **again at download request and at file-serving time**. A downloaded PDF cannot be remotely deleted; do not promise DRM.
- **DIGITAL_LICENSE:** `Nhận key` issues *at most one* entitled license from private inventory, committed transactionally/idempotently to a particular `tokenId + benefitId`. Never store the plaintext key on-chain or send it in logs; a previously exposed key cannot be revoked merely by moving/burning NFT.
- **EVENT_ACCESS:** `Đăng ký` creates a per-event right; issuing a QR/one-time ticket is separate from marking it used. Check-in is atomic and replay-safe; do not place a shared meeting URL/password in public NFT metadata.
- **PHYSICAL_REDEMPTION:** phase after MVP, and NOT accepted by V2 API until separately approved.
- On used-up benefits, show `Đã sử dụng` per benefit. Activation locks pass **at first explicit activation, not when the last benefit is consumed**. Benefit expiry (if any) follows frozen tier terms, not token transfer rules.

### 3.4 Market / transfer UX

Before activation and after campaign financial finality: `Transfer`, `List` possible. A pending listing is not a guarantee of executable purchase; UI/marketplace must re-check contract ownership, `activated`, campaign gate at settlement. During activation pending, immediately warn and suppress local listing actions even though only confirmed on-chain state can finally block settlement. Show known outstanding listing/approval warning before confirmation; do **not** promise listing cancellation has already occurred. After activation, show token as `Soulbound after activation` or `Không thể chuyển nhượng` without calling the token a universal soulbound NFT from mint.

## 4. Smart contract design proposal (ERC-721 V2)

Use OpenZeppelin ERC721 v5 and override the actual centralized transfer hook (`_update` in OZ v5) after inspecting the installed OpenZeppelin version. **All transfer entrypoints including `transferFrom` and `safeTransferFrom` must funnel through the same guard.** Contract-side `ownerOf`, status, campaign mapping and activation event are authoritative. Backend flag/UI validation are never substitutes.

```solidity
// Illustrative pseudocode; adapt to actual OZ version, deployment identity and audit.
// Keep financial escrow contract unchanged in the initial pass-NFT slice.
contract FundTogetherRewardPassV2 is ERC721 {
    mapping(uint256 => bool) public activated;
    mapping(uint256 => uint256) public campaignOf;

    function activate(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "ONLY_CURRENT_OWNER");
        require(!activated[tokenId], "ALREADY_ACTIVATED");
        require(isFinanciallyFinalized(campaignOf[tokenId]), "CAMPAIGN_NOT_FINALIZED");
        // Non-reversible write; should not call unknown/untrusted external contracts.
        activated[tokenId] = true;
        emit RewardPassActivated(tokenId, msg.sender);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address from)
    {
        from = _ownerOf(tokenId);
        if (from != address(0)) {
            require(to != address(0), "BURN_DISABLED");
            require(!activated[tokenId], "ACTIVATED_SOULBOUND");
            require(isFinanciallyFinalized(campaignOf[tokenId]), "TRANSFER_LOCKED");
        }
        return super._update(to, tokenId, auth);
    }

    // Mint entrypoint MUST verify uniquely eligible canonical pledge/claim
    // and prevent duplicate mint, forged entitlement, or creator-driven mint.
    // No public function may set activated=false, forcibly transfer, or burn.
}
```

**Important:** `isFinanciallyFinalized` must be a trustworthy chain-state gate on the actual versioned escrow contract (or a provably synchronized on-chain finality anchor). Never trust an API-provided boolean or an unauthenticated resolver assertion to unlock transfer. `approve` or `setApprovalForAll` do not confer power to transfer an activated token: guard must still reject settlement. Optional: reject *new* approvals after activation to reduce confusion, but revoked approvals cannot be assumed without explicit action. Existing approvals may linger; they cannot bypass the guard. ERC-721 `_update` is version-sensitive; if using OZ v4, inspect extension points and avoid overriding an outdated hook.

### 4.1 Claim/mint provenance

Link `(chainId, escrowContract, escrowCampaignId, txHash, logIndex, tierId)` of a **canonical accepted pledge** to exactly one eligible `tokenId`. Where several pledges could occur in one transaction, include `logIndex` (and other versioned identifiers needed for domain separation). For V2, define frozen campaign-tier terms and quantity; existing Editions V1 has one pledge/wallet/one tier and MUST NOT automatically gain new multi-tier policy.

A backer should be able to claim the token to their recorded pledge wallet after finality, or provide a proven, signed beneficiary designation **only if explicitly approved later**. A direct admin mint based solely on a database entry is forbidden. Double claims, chain/replay/domain mixups and mint without finalization are forbidden. If a separate NFT contract cannot safely validate eligibility by reading on-chain escrow state, design a reviewable claim registry/commitment verification rather than introducing unchecked backend-controlled mint authority; require approval of the trust tradeoff.

### 4.2 Ownership, activation and lifetime semantics

- `activated[tokenId]` is one-way `false -> true` and cannot be overridden, even by owner/admin/resolver/upgrade authority.
- After activation `ownerOf(tokenId)` must remain the activating wallet under all public owner/operator transfer functions. No burn or bridge in V2; ordinary key loss means no self-service wallet migration. **This is a serious UX risk: show it clearly.** Recoverable smart wallets could mitigate key loss, but cannot silently alter token ownership or bypass the policy.
- Transfer before activation follows current owner/operator authorization and transfer gate; after transfer, former owner loses benefit access. Since no protected benefit can be used before activation, there cannot be a spent-but-tradable V2 pass through normal flows.
- A partial-used/pass-relisting state is impossible in V2 by construction; benefits may still have individual usage records after activation.
- Pass activation does not implicitly mint new benefits or modify escrow balances.
- If later designs enable refunds after `COMPLETED`, reconsider V2 transfer and activation rules; do not add arbitrary post-finality refund while assuming all rights are settled.

## 5. Backend, database, indexer and storage design

Recommended additive modules/tables (names illustrative):

- `reward_pass_claims`: deployment identity, canonical pledge key, campaign/tier, intended owner, tokenId, mintTx hash, status. Unique canonical pledge, unique `(chainId, passContract, tokenId)`.
- `reward_pass_projection`: event-sourced owner, activated, activationTxHash/blockHash, canonical flag, last synchronized block, contract version. DB is a projection only.
- `reward_benefits`: frozen typed benefit terms, ids, stock/expiry/redeem model and evidence release hash. No secrets/keys or private URLs in public metadata.
- `reward_benefit_claims`: `(passContract, tokenId, benefitId, claimKind)` identity, idempotency/usage state, encrypted secret reference or ticket reference, canonical owner at grant time, audit fields. Unique constraints for one-time consumption; transactional reservation/commit for key inventories.
- `reward_download_tickets`: short-lived, account-scoped, token/benefit-scoped access tokens stored hashed; GET revalidates ownership + activation + canonical chain status.

Indexer consumes `Transfer`, `RewardPassActivated`, pledge/claim and relevant financial-finality events using exact deployment/chain identity. Replay idempotently; detect chain reorg, remove orphaned projections and access decisions and re-read state where necessary. Wallet signature/session proves wallet control, not entitlement: `ownerOf(tokenId)` is independently checked. When old owners have still-valid download tickets, server must revalidate ownership before streaming. Do not expose PDF, meeting key, game key or private identity in token URI/metadata.

For Arc, confirm deployed chain ID, contract bytecode, USDC denomination/gas details, RPC consistency and indexer event semantics on Arc testnet; normal local Anvil alone does not establish Arc-specific correctness. No public market integration is required for V2 correctness: any standards-compliant transfer route must be safe independently.

## 6. Invariants: smart-contract-level (MUST enforce and property-test)

| ID | Invariant / assertion |
|---|---|
| **ACT-01** | `activate(tokenId)` can succeed iff caller is `ownerOf(tokenId)`, pass exists, not activated, campaign is financially finalized, and transfer/release gates permit activation. Approved operator is not owner for this call. |
| **ACT-02** | `activated(tokenId)` is monotonic: `false -> true` exactly once; no sequence of authorized/unprivileged calls restores `false`. Repeat activation reverts. |
| **ACT-03** | For activated token `t`, `transferFrom`, both `safeTransferFrom` overloads, operator transfers and any admin/marketplace transfer route revert. |
| **ACT-04** | Activated token cannot burn/bridge/wrap through supported V2 methods; mint-only `from=0` and normal pre-activation transfers behave under their explicit guards. |
| **ACT-05** | Until the campaign's *on-chain* `FINANCIALLY_FINALIZED` gate, no token transfers or activations succeed, regardless of database/URL/listing state. |
| **ACT-06** | On successful activation, `ownerOf(t)` immediately before and after is unchanged and exactly one `RewardPassActivated(t, owner)` event is emitted in that successful transaction. |
| **ACT-07** | There is at most one NFT claim/mint for each unique eligible canonical pledge entitlement under the frozen policy. No mint for missing/refunded/orphaned/wrong deployment pledges. |
| **ACT-08** | Once activated, no public role (owner, operator, admin, creator, resolver, upgrade authority) can unfreeze it; upgrades capable of doing so are prohibited or subject to explicitly approved, auditable constraints. |
| **ACT-09** | A wallet owning NFT `t` while unactivated may transfer it only if campaign gate is open; old owner ceases to have current ownership and corresponding gated access. |
| **ACT-10** | No activation, mint, benefit redemption or NFT transfer changes escrow conservation, payout recipient/amount, or refund claims. |
| **ACT-11** | No reentrant/callback path can both transfer and activate a token in a way inconsistent with final owner/activated state. Test adversarial receiver contracts and marketplace order races. |
| **ACT-12** | A listing signed before activation cannot successfully settle after activation, even if its UI/cache claims the NFT is available; on-chain transfer must revert. |

## 7. Invariants: backend / UX / benefit security

| ID | Assertion / testable outcome |
|---|---|
| **BEN-01** | No new benefit may be delivered until on-chain activation has succeeded and current owner + chain/deployment state are validated. HTTP return/tx hash/UI state alone are insufficient. |
| **BEN-02** | An activated pass can use all not-yet-consumed benefits allowed by frozen tier terms. Activating once does **not** automatically consume any benefit. |
| **BEN-03** | One-time game key/ticket can be granted/consumed no more than once per `(tokenId, benefitId, policyVersion)` under retries and concurrency. |
| **BEN-04** | File URL and download GET must recheck chain-derived ownership, activation, campaign and release hash, token/ticket expiry and account wallet authorization; transfer/reorg/refund cannot leave a usable stale capability. |
| **BEN-05** | No sensitive content, secrets, private meeting URLs, raw PII or plaintext license keys are exposed on-chain, in NFT metadata or application logs. |
| **BEN-06** | Wallet rejection, transaction revert, dropped transaction, pending state or indexer lag do not cause false `ACTIVATED` or premature content access. |
| **BEN-07** | A reorg invalidating an activation/transfer/mint revokes projection-based access until canonical state is reconfirmed; duplicate event replay causes no duplicated privileges. |
| **BEN-08** | Activation dialog never has its irreversible-action checkbox preselected. The app displays wallet/network, token identity, transfer-lock consequence and gas before prompting the transaction. |
| **BEN-09** | A user cannot activate another wallet's pass by changing token ID, account identity, request body, SIWE session or approved operator allowance. |
| **BEN-10** | Existing V1 PDF users continue to access/refund according to frozen `reward-comic-download-mvp-v1`, without being forced to mint or activate a new NFT. |
| **BEN-11** | Activation is not proof of reading a PDF, joining an event, receiving merch, or accepting the work. Delivery and confirmation remain separate facts. |
| **BEN-12** | An activated pass does not falsely promise recoverability to a different wallet if the owner loses their private key. |

## 8. Tests and adversarial acceptance checklist

**Foundry unit/fuzz/invariant:**

1. Mint using verified unique claim, then activate as current owner; check one event and unchanged owner.
2. Attempt to activate before finalization, nonexistent token, another user's token, a refunded pledge and already activated token: all revert.
3. Transfer unactivated finalized token A→B→C; only C activates and accesses benefits; A/B cannot.
4. Activate and attempt `transferFrom`, both safe transfer methods, approved operator transfer, burn, operator-based marketplace transfer and owner/creator/admin escape: all revert.
5. Place/sign off-chain listing while unactivated; activation mined first; order settlement reverts. Reverse order: transfer settles first; former owner activation reverts, new owner may activate.
6. Test malicious ERC721Receiver callback, attempted reentrant movement, same-block ordering and reorg/replay scenarios using a deterministic chain fixture.
7. Assert escrow accounting unchanged in all NFT operations; no creator royalty transfer/fee logic occurs.

**Backend and UI:**

1. MockUSDC pledge → canonical entitlement → finalized campaign → claim/mint → unactivated transferable pass → explicit dialog → wallet confirmation → activation event indexed → benefit unlocked.
2. Try downloading before clicking Activate, after modal but before signing, after tx submitted but before confirmed, and after failed tx: all blocked.
3. Double-click Activate, parallel requests, retry, stale indexer, RPC errors and reorg: no duplicate activation or leaked benefit.
4. Two parallel claims for one game license: only one key assigned; key never exposed in logs; meeting code replay prevented.
5. Stale marketplace listing not executable after activation; old owner loses access after valid pre-activation transfer.
6. V1 PDF release/download and refund regression **unchanged**; tests include legacy archived physical claims that have not become real refunds merely because DB says `REFUND_ELIGIBLE`.
7. Test deployment identity mismatch: Arc testnet vs Anvil, contract address version, token ID and chain reorganization.

All results must be reproducible with specific commit, deployment manifest and chain snapshot/canonical head. No resetting stateful local chain/DB without checking obligations and making verified backups. Do not count passing tests as real-wallet or real-user acceptance.

## 9. Implementation phases, boundaries, and exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| **V2-0 design** | Map V1 policy/schema/ABIs, freeze V2 campaign+benefit metadata, identify user-approval gates | No unresolved money/right conflict; separate legacy vs V2 migration strategy |
| **V2-1 contract** | New ERC-721 RewardPassV2, claim provenance, irreversible activation + universal transfer guard | ACT-01..12 property/fuzz tests pass; no escrow regression |
| **V2-2 projection/API** | Additive tables, canonical indexer, wallet-bound activation reads, entitlement checks | BEN-01..07,09,10 tests pass; correct replay/reorg |
| **V2-3 frontend UX** | My Passes, claim, two-step confirmation, pending/revert states, benefit gating | BEN-08,11,12 UX checks and E2E happy/failure paths |
| **V2-4 Arc pilot** | Isolated Arc testnet contracts, gas/read/write/indexer/wallet/marketplace compatibility tests | Explicitly recorded test receipts and limitations; no real-money launch |
| **Post-MVP** | Secondary marketplace UI/contracts, physical redemption, bundle voucher split, delegated activation, wallet recovery mechanism | Separate product/security/legal decisions |

**Initial implementation MUST NOT silently change `FundTogetherEditions.sol` or its policy:** it currently pays creator only after accepted PDF, 7-day challenge and no open dispute, and has V1 PDF entitlements accessible at `RELEASED`. V2 Activation must not wipe V1 rights or transform existing NFTs automatically. For any new V2 campaign, freeze all relevant terms and benefit policy version before pledge/mint.

## 10. Decisions deliberately not silently finalized

1. Whether NFT mint/claim is paid by backer or sponsored by the platform (gas UX). A user-authorized mint after finalized escrow is the starting recommendation.
2. If V2 will eventually allow activation before full financial finality to support early content access (requires a new dispute/refund design).
3. Which benefit types beyond PDF are in the immediate pilot, and whether digital licenses/events require external contracts or private provider integrations.
4. Whether smart wallets, lost-key recovery or delegated operators are supported: irrevocable owner-bound passes create a real risk if keys are lost.
5. Marketplace fee policy and marketplace operator; **creator royalty remains zero** under user decision, but marketplace fees are not automatically authorized.
6. Whether future advances replace Editions V1 no-advance escrow; if so, payout, transfer and refund must be redesigned and separately signed off.

### Short agent instruction

> Implement **design V2 only after policy review**, using an isolated versioned RewardPass ERC-721. NFT becomes transferable only after campaign financial finality. User must explicitly click Activate and confirm irreversible transfer-lock in wallet; only a successful canonical on-chain activation opens protected benefits. After activation all owner/operator/marketplace transfers revert at the contract layer. No creator royalty. Keep Editions V1 PDF/download/refund paths intact. Derive claims from canonical pledge evidence, write invariant and E2E adversarial tests, and do not alter live custody or existing obligations.
