# Campaign Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two confirmed security findings from Codex Security scan `b79d4055-a6af-476f-9336-bd0514d3c12b`: the legacy `notify-pledge` ownership leak and stale Backer/Creator review mutations after an Campaign entitlement becomes refunded or orphaned.

**Architecture:** Keep the legacy Reward receipt/indexer flow unchanged except for binding the entitlement lookup to the authenticated Backer. For Campaign review conversations, keep historical reads available but re-check the current indexed entitlement state before Backer/Creator mutations and before escalation. The smart contract remains the authority for funding, refund and payout state; no message or review action moves funds.

**Tech Stack:** NestJS, TypeScript, Zod, Drizzle/PostgreSQL, Jest/Supertest, React 19, TanStack Query, Vite SSR tests, existing Campaign indexer and contract projection.

**Spec:** `docs/specs/2026-10-16-campaign-review-conversation-escalation-design.md` plus the completed Codex Security report at `C:\Users\dell\.codex\state\plugins\codex-security\scans\FundTogether\c6ade895b24ba1ddc0a4994fa08cc16b8475f41f_20261016T103701Z_6apcbia\report.md`.

## Global Constraints

- Campaign remains limited to `COMICS_ARTBOOK`, one digital PDF tier, canonical indexed pledges and private delivery; do not reintroduce physical or legacy charity behavior.
- PostgreSQL entitlement and thread state are indexed/off-chain projections; the contract remains the source of truth for escrow, refunds, disputes and payout eligibility.
- A submitted transaction hash is not proof of ownership; every entitlement response must be bound to the authenticated user or fail without returning the other user's record.
- A refunded or orphaned entitlement may retain historical review data for audit, but it must not authorize new Backer/Creator messages or a new Resolver escalation.
- Resolver actions on an already escalated case remain separate from the former Backer's mutation gate and must not be converted into a financial transition.
- Preserve existing `REWARD` behavior and legacy clients; do not change the public request shape of `notify-pledge`.
- Do not add a database migration unless implementation discovers that an API permission field cannot be derived from existing columns; the recommended design needs no schema change.
- Preserve the current dirty worktree. The existing modified Creator-profile files and migration are unrelated to this remediation and must not be staged.
- Do not commit the implementation until the negative cross-user and refunded/orphaned mutation tests pass.

## Review Focus

- A valid transaction hash submitted by the wrong authenticated user must not return an entitlement, campaign or tier; owned submissions and idempotent retries must continue to work. Test in Task 1.
- A thread created while an entitlement is active must become read-only after `REFUNDED`; its history must remain readable and no new escalation may be created. Test in Task 2.
- A thread whose entitlement becomes non-canonical after a reorg must behave the same as a refunded thread. Test in Task 2.
- UI controls must not continue presenting message/escalation CTAs when the server reports an invalidated entitlement. Test in Task 3.
- No remediation path may change contract state, entitlement financial fields, private PDF access, or indexer replay semantics. Test in Task 4.

## Scope Map

| Area | Files to modify | Files to test | Expected change |
|---|---|---|---|
| Legacy pledge ownership | `backend/src/reward/reward-pledge.service.ts` | `backend/src/reward/reward-http-acceptance.spec.ts` | Add authenticated `backerUserId` predicate to the existing indexed entitlement lookup. |
| Campaign mutation policy | `backend/src/reward/reward-campaigns-review-conversation.policy.ts` | `backend/src/reward/reward-campaigns-review-conversation.policy.spec.ts` | Add a pure active/orphaned/refunded write gate. |
| Campaign conversation service | `backend/src/reward/reward-campaigns-review-conversation.service.ts` | `backend/src/reward/reward-campaigns-delivery-http.spec.ts` | Recheck current entitlement state for participant message/escalation mutations. |
| Read-only UI state | `frontend/src/lib/api/campaigns.ts`, `frontend/src/features/campaigns/ui/CampaignReviewThread.tsx` | `frontend/scripts/campaigns-delivery.test.mjs` | Hide write CTAs and explain read-only history after invalidation. |
| Regression verification | No product source change | Backend/frontend suites and a repeated security diff scan | Confirm ownership, lifecycle, privacy and financial boundaries. |

## Decisions Before Implementation

### Legacy `notify-pledge`

Keep the current sequence:

```text
Authenticated request
  -> verify and process receipt through the existing indexer
  -> select entitlement by txHash + authenticated backerUserId
  -> return the owning entitlement/tier/campaign only
```

The server must not trust the client `backerWallet`, `tierId` or `quantity` as ownership evidence. The existing `notify-pledge` body remains `{ txHash }`; the authenticated session remains the only user identity input.

If the receipt is valid but belongs to another account, return the existing generic failure shape without the entitlement object. A foreign transaction hash must not become a different status or response payload that leaks indexed metadata.

### Campaign stale-thread policy

Use **historical read-only** behavior rather than deleting threads or adding a new database status:

```text
ACTIVE canonical entitlement
  -> Backer/Creator may message; Backer may escalate

REFUNDED or non-canonical/orphaned entitlement
  -> participants and Resolver may read history
  -> Backer/Creator message is rejected
  -> Backer escalation is rejected
```

The service should derive the current state from `campaigns_entitlements.refunded`, `campaigns_entitlements.canonical`, and the current Campaign `streamId`. This handles both a contract-indexed refund and a reorg/orphan transition without making the conversation table a second financial state machine.

Do not change the suppressed `RESOLVED` append-only behavior in this remediation. The current product design treats messages as an audit conversation, and changing `RESOLVED` to immutable would be a separate product decision rather than a confirmed security fix.

---

### Task 1: Bind legacy pledge notification to the authenticated Backer

**Files:**
- Modify: `backend/src/reward/reward-pledge.service.ts:34-51`
- Test: `backend/src/reward/reward-http-acceptance.spec.ts` near the existing `notify-pledge` receipt tests
- Read-only compatibility check: `frontend/src/lib/api/reward.ts:226-238`

**Interfaces:**
- Preserve `notifyPledge(userId: string, input: NotifyRewardPledgeInput)` and the request payload `{ txHash }`.
- Preserve the existing indexer call and idempotent receipt processing.
- Return the same owning entitlement/tier/campaign response for the authenticated Backer.
- Return no entitlement data when `txHash` is valid but its indexed `backerUserId` differs from `userId`.

- [ ] **Step 1: Add the failing cross-user HTTP regression test.**

  Reuse the existing Reward acceptance fixture with a pledge made by `backerSessionToken` and an already-created `intruderSessionToken` (or the existing second user). Submit the real pledge transaction hash as the intruder and assert:

  - the response is not `201`;
  - `response.body` does not contain `entitlement`, `tier`, `campaign`, `backerUserId`, `backerWallet` or `amountPaid`;
  - the entitlement count remains unchanged;
  - the real Backer can still submit the same hash successfully afterward;
  - a second submission by the real Backer remains idempotent.

- [ ] **Step 2: Run the focused test and verify it fails for the security reason.**

  Run from `backend`:

  ```powershell
  npm test -- --runInBand src/reward/reward-http-acceptance.spec.ts
  ```

  Expected failure before the fix: the intruder receives the same successful entitlement response because the current query filters only by `txHash`.

- [ ] **Step 3: Add the ownership predicate in `RewardPledgeService.notifyPledge`.**

  Change only the canonical entitlement lookup to combine `txHash` and `backerUserId = userId`, using the existing Drizzle `and`/`eq` style. Keep `processReceipt(txHash)` before the lookup so the endpoint still supports first-time receipt synchronization. Keep the failure response generic enough that a foreign hash does not disclose indexed ownership metadata.

- [ ] **Step 4: Run the focused acceptance test and inspect the response boundary.**

  Confirm the owner-positive, foreign-negative and duplicate-positive cases pass. Confirm the response still contains only the expected legacy entitlement/tier/campaign records for the owner.

- [ ] **Step 5: Run adjacent legacy pledge tests.**

  ```powershell
  npm test -- --runInBand src/reward/reward-pledge.schema.spec.ts src/reward/reward-http-acceptance.spec.ts
  npm run build
  ```

- [ ] **Step 6: Commit the isolated fix when executing the plan.**

  ```powershell
  git add backend/src/reward/reward-pledge.service.ts backend/src/reward/reward-http-acceptance.spec.ts
  git commit -m "fix(reward): bind pledge notification to authenticated backer"
  ```

### Task 2: Enforce current Campaign entitlement state on thread mutations

**Files:**
- Modify: `backend/src/reward/reward-campaigns-review-conversation.policy.ts`
- Test: `backend/src/reward/reward-campaigns-review-conversation.policy.spec.ts`
- Modify: `backend/src/reward/reward-campaigns-review-conversation.service.ts:74-153`
- Test: `backend/src/reward/reward-campaigns-delivery-http.spec.ts` near the existing refund/orphan and conversation scenarios
- Do not modify: `contracts/src/reward/FundTogetherCampaign.sol`
- Do not add: a migration or new thread status

**Interfaces:**
- Add a pure policy function with an explicit result, for example:

  ```ts
  type CampaignReviewThreadWriteState = 'ACTIVE' | 'REFUNDED' | 'ORPHANED';

  function deriveCampaignReviewThreadWriteState(input: {
    canonical: boolean;
    refunded: boolean;
    entitlementStreamId: string;
    currentStreamId: string;
  }): CampaignReviewThreadWriteState;
  ```

- `ACTIVE` requires `canonical === true`, `refunded === false`, and the entitlement stream to equal `this.indexer.streamId()`.
- `REFUNDED` takes precedence when `refunded === true`.
- `ORPHANED` covers `canonical === false` or a stream mismatch.
- The service continues to use existing participant and thread-status checks. The new policy is an additional lifecycle gate, not a replacement for authentication or role authorization.

- [ ] **Step 1: Add pure policy tests before touching the service.**

  Cover:

  - canonical/current stream/not refunded → `ACTIVE`;
  - refunded/current stream → `REFUNDED`;
  - non-canonical/current stream → `ORPHANED`;
  - canonical/old stream → `ORPHANED`;
  - refunded plus old stream → `REFUNDED`.

- [ ] **Step 2: Run the policy test and verify the new function is absent.**

  ```powershell
  npm test -- --runInBand src/reward/reward-campaigns-review-conversation.policy.spec.ts
  ```

- [ ] **Step 3: Implement the minimal pure lifecycle gate.**

  Keep it database- and RPC-free. Do not encode contract numeric states in this helper; the helper only answers whether an already-created entitlement is still canonical and active for conversation writes.

- [ ] **Step 4: Add a service helper to load the thread entitlement and apply the gate.**

  In `RewardCampaignReviewConversationService`, after `authorizedThread` confirms the thread and participant, load `campaignsEntitlements` by `thread.entitlementId`. Compare its `canonical`, `refunded` and `streamId` fields with the current `this.indexer.streamId()` and call the pure policy function.

  Apply this helper to:

  - `message`: before inserting a Backer or Creator message;
  - `escalate`: before inserting a Backer escalation.

  Reject invalidated writes with a `ConflictException` and a stable reason that the frontend can map to a read-only state. Preserve historical `GET` access. Keep Resolver-only `requestCreatorResponse` and `resolveEscalation` available for an already-open case so Resolver can finish the audit record; those actions must remain off-chain.

- [ ] **Step 5: Add the refunded existing-thread HTTP test.**

  Arrange a canonical funded entitlement and create an ordinary `OPEN` review thread before refund. Then perform the existing contract/indexer refund flow and assert:

  - `GET /review-threads/:threadId` remains `200` for the Backer, Creator and authorized Resolver;
  - Backer `POST /messages` returns `409`;
  - Creator `POST /messages` returns `409`;
  - Backer `POST /escalate` returns `409`;
  - no new message or escalation row is inserted;
  - entitlement access is still `REFUNDED` and no contract financial field changes because of the rejected review writes.

- [ ] **Step 6: Add the orphaned existing-thread HTTP test.**

  Arrange the same thread, revert the pledge event or otherwise use the existing reorg fixture so the entitlement becomes non-canonical/`ORPHANED`. Assert the same read-only behavior and verify the historical messages remain intact.

- [ ] **Step 7: Run focused backend tests.**

  ```powershell
  npm test -- --runInBand src/reward/reward-campaigns-review-conversation.policy.spec.ts src/reward/reward-campaigns-review-http.spec.ts src/reward/reward-campaigns-delivery-http.spec.ts
  ```

- [ ] **Step 8: Commit the backend Campaign lifecycle fix when executing the plan.**

  ```powershell
  git add backend/src/reward/reward-campaigns-review-conversation.policy.ts backend/src/reward/reward-campaigns-review-conversation.policy.spec.ts backend/src/reward/reward-campaigns-review-conversation.service.ts backend/src/reward/reward-campaigns-delivery-http.spec.ts
  git commit -m "fix(reward): block stale Campaign review mutations"
  ```

### Task 3: Keep the review UI honest after entitlement invalidation

**Files:**
- Modify: `backend/src/reward/reward-campaigns-review-conversation.service.ts` only if a viewer-specific permission DTO is needed
- Modify: `frontend/src/lib/api/campaigns.ts:52-60`
- Modify: `frontend/src/features/campaigns/ui/CampaignReviewThread.tsx:100-120`
- Test: `frontend/scripts/campaigns-delivery.test.mjs`
- Update affected frontend fixtures in `frontend/scripts/campaigns-studio.test.mjs` if the thread DTO gains a required permission field

**Interfaces:**
- Extend the thread detail DTO with server-derived permissions rather than asking the browser to infer canonical state, for example:

  ```ts
  permissions: {
    canMessage: boolean;
    canEscalate: boolean;
    readOnlyReason: 'REFUNDED' | 'ORPHANED' | 'CLOSED' | 'RESOLVED' | null;
  };
  ```

- `canMessage` and `canEscalate` must be derived from the authenticated viewer, participant role, thread status and current indexed entitlement. The client must not be able to set these values.
- If changing the response DTO is judged unnecessary during implementation, the fallback is to keep the backend rejection authoritative and add a frontend error-state test; do not duplicate entitlement calculations in React.

- [ ] **Step 1: Add the failing SSR/UI test for invalidated history.**

  Render an existing thread with `permissions.canMessage === false`, `permissions.canEscalate === false` and `readOnlyReason === 'REFUNDED'` (repeat once for `ORPHANED`). Assert:

  - messages remain visible;
  - the message composer is absent;
  - the escalation composer is absent;
  - a short read-only explanation is visible;
  - funding, refund and transfer CTAs are not introduced.

- [ ] **Step 2: Run the focused frontend test and verify it fails.**

  ```powershell
  npm test
  ```

  Expected failure before the fix: `CampaignReviewThread` renders the participant composer whenever status is not `CLOSED`, regardless of entitlement lifecycle.

- [ ] **Step 3: Add server-derived permission data to thread details.**

  Reuse the same lifecycle gate from Task 2. Do not expose private storage keys or PDF/evidence bytes. Keep Resolver case context readable even when the entitlement is invalidated.

- [ ] **Step 4: Gate the React composers and escalation action.**

  Render the message form only when `selected.permissions.canMessage` is true. Render the Backer escalation form only when `selected.permissions.canEscalate` is true. For invalidated history, show a concise Vietnamese notice such as `Trao đổi này chỉ còn xem vì quyền pledge đã bị hoàn lại hoặc không còn thuộc chain hiện tại.`

- [ ] **Step 5: Update active-thread fixtures and run all frontend tests.**

  Active fixtures must explicitly set both permissions to true; resolved/closed fixtures must preserve their existing status behavior. Run:

  ```powershell
  npm test
  npm run build
  npm run lint
  ```

- [ ] **Step 6: Commit the UI consistency fix when executing the plan.**

  ```powershell
  git add frontend/src/lib/api/campaigns.ts frontend/src/features/campaigns/ui/CampaignReviewThread.tsx frontend/scripts/campaigns-delivery.test.mjs frontend/scripts/campaigns-studio.test.mjs backend/src/reward/reward-campaigns-review-conversation.service.ts
  git commit -m "fix(frontend): show invalidated review threads as read-only"
  ```

### Task 4: Full verification, security re-scan and handoff

**Files:**
- No additional product source files expected.
- Optional: update `docs/PROJECT_PROGRESS.md` only with verified results after implementation.

**Interfaces:**
- The completed implementation must preserve the existing request/response contracts except for the explicitly documented thread permission fields.
- The final security scan must cover the new remediation diff and must not include unrelated dirty working-tree files.

- [ ] **Step 1: Run the complete backend Campaign verification.**

  From `backend`:

  ```powershell
  npm run test:campaigns
  npm run build
  ```

  Expected: all existing Campaign tests plus the new ownership and stale-mutation tests pass.

- [ ] **Step 2: Run the complete frontend verification.**

  From `frontend`:

  ```powershell
  npm test
  npm run build
  npm run lint
  ```

- [ ] **Step 3: Run repository hygiene checks.**

  From the repository root:

  ```powershell
  git diff --check
  git status --short
  ```

  Confirm only intended remediation files are staged/committed. Do not stage the pre-existing Creator-profile or migration changes.

- [ ] **Step 4: Execute the manual lifecycle checklist against the local Reward runtime.**

  1. Backer A pledges and notifies with the own transaction hash: success.
  2. Backer B submits Backer A's hash: generic failure and no entitlement metadata.
  3. Backer A repeats the own hash: idempotent success.
  4. A funded Backer opens a thread and exchanges messages with Creator.
  5. Refund is indexed: the thread remains readable but message/escalation controls are rejected/read-only.
  6. A reorg makes the entitlement orphaned: the same read-only behavior applies.
  7. Resolver can inspect existing case context and finish an already-open off-chain outcome.
  8. No review request changes contract state, payout eligibility, refund state, PDF access or indexer canonicality.

- [ ] **Step 5: Repeat the Codex Security diff scan after fixes.**

  Use the new remediation head as the scan head, include only the intended remediation commits, and verify that:

  - the legacy `notify-pledge` IDOR is closed by a negative cross-user test;
  - stale post-refund/orphan thread mutations are rejected;
  - no new finding appears in entitlement, private delivery, resolver authorization or contract boundaries.

- [ ] **Step 6: Update progress documentation only from evidence.**

  Record exact test counts, build/lint results and the security scan ID. Keep the original findings and any remaining product decision about `RESOLVED` append-only threads separate from the implemented fix.

## Completion Contract

The remediation is complete only when:

1. `notify-pledge` cannot return another user's entitlement metadata from a known transaction hash.
2. Owned `notify-pledge` calls remain idempotent and existing legacy clients keep working.
3. Existing Campaign threads remain readable after `REFUNDED` or `ORPHANED` transitions.
4. Backer/Creator message and Backer escalation writes are rejected after those transitions, both server-side and in the UI.
5. Resolver handling of an already-open case remains available and off-chain.
6. Backend, frontend, build, lint, diff hygiene and repeated security scan verification are green.
7. No Solidity, escrow, payout, refund or physical-delivery behavior is changed by this remediation.

## Deferred Product Decisions

- Whether a `RESOLVED` thread should become fully immutable is not part of this security fix. The current implementation and tests describe append-only conversation history; change it only through a separate product decision and migration/API review.
- Whether `FORMAL_DISPUTE` should invoke an on-chain challenge/refund workflow remains a separate financial-policy decision. This plan keeps it as an off-chain Resolver outcome.
