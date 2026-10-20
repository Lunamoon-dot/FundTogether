# FundTogether — Product & Website Surface Map

> **Pre-reset UX snapshot:** This inventory describes the Resolver/Admin
> product surface before the 2026-10-20 protocol reset. The current target
> replaces those decision surfaces with Creator, Backer and Judge court flows;
> see [the target workflows](docs/campaigns/WORKFLOWS_V2_DECENTRALIZED.md) and
> [the VNext protocol specification](docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md).
> Existing UI claims below are not evidence that the new protocol is implemented.

## VNext implementation boundary — 2026-10-20

The current code contains a partial VNext contract core and indexed read-only
surface. The implemented protocol path is now:

```text
Creator draft → freeze commitment → create Judge case
  → three randomly assigned Judges → 2-of-3 quorum
  → Creator createCampaign → FUNDING
```

Creator/Studio metadata is optional and Admin has no approval mutation.
Pre-publication Resolver review and fixed `approveCampaign` signing are removed.
The VNext contract slice also contains milestone evidence, bounded correction,
appeal/retry, challenge, payout and refund hooks, while backend projections and
the read-only VNext page expose canonical state. Creator/Backer/Judge wallet
transactions, full evidence availability handling and fresh runtime E2E remain
deferred. Any Resolver behavior still present after publication is transitional
implementation residue, not target authority. The older inventory below is
retained as a historical UX handoff and must not be used as current acceptance
criteria.

## Current target surface map

The current target replaces centralized decision screens with protocol-facing
surfaces:

| Surface | Target responsibility |
| --- | --- |
| Creator workspace | Create proposal, freeze terms, submit milestone evidence and follow canonical case/payout state |
| Backer campaign detail | Inspect terms, pledge into escrow, observe milestones, challenge where eligible and claim own refund |
| Judge workspace | Inspect assigned dossier, lock stake, cast one vote and follow canonical quorum/result |
| Admin operations | Read-only infrastructure, indexer and projection health; no review or fund authority |
| Public campaign | Show the frozen commitment, court result, escrow state, milestone progress and refund boundary |

The target workflow is permissionless and contract-led. A submitted vote is not
PASS until the canonical court result is resolved; a funding goal is not payout;
and a database status is never a financial authority.

Current product source documents: [scope V2](docs/campaigns/SCOPE_V2_DECENTRALIZED.md),
[workflows V2](docs/campaigns/WORKFLOWS_V2_DECENTRALIZED.md) and
[financial policy V2](docs/campaigns/FINANCIAL_POLICY_V2_DECENTRALIZED.md),
with detailed court and accounting rules in
[Protocol Specification V1](docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md).

> **Tài liệu:** Product inventory, UX handoff và scope contract
> **Cập nhật:** 2026-10-16
> **Phạm vi:** Campaign `COMICS_ARTBOOK` · một `DIGITAL_DOWNLOAD` PDF · MockUSDC local
> **Nguồn chuẩn liên quan:** [Docs index](docs/README.md) · [Campaign scope](docs/campaigns/SCOPE.md) · [Workflow](docs/campaigns/WORKFLOWS.md)

Tài liệu này mô tả toàn bộ bề mặt website, tính năng, vai trò, trạng thái và handoff
của FundTogether. Nó phân biệt hành vi đã thấy trong checkout, chính sách sản phẩm,
đề xuất UX và phần còn phải xác minh; cập nhật tài liệu không tự chứng minh executable behavior.

Status: UX research synthesis for the existing local MVP  
Scope: discover → pledge → track → receive one private PDF  
Primary audience: a backer supporting an independent comic or artbook  
Product language: Vietnamese UI; English domain terms are retained only where the current product already uses them

## Evidence key

- **Confirmed** — visible in the current repository, approved local policy, or verified product workflow.
- **Repository-derived recommendation** — a UX proposal that follows from confirmed product behavior but has not been validated with users or Mobbin evidence.
- **Assumption** — required to make the proposed journey coherent, but not established by the current product.
- **Open question** — requires product or user-research validation before production design is treated as final.

Mobbin access was attempted again on 2026-10-15 through three independent bounded research streams: campaign discovery/detail, pledge and transaction progress, and returning-user library/recovery. Each required first flow search was blocked with `Mobbin MCP requires a paid plan. Upgrade at https://mobbin.com/pricing to continue.` No flow metadata, screen images, or canonical `mobbin_url` values were returned. Therefore this document makes no Mobbin-backed claims and does not fabricate references. Section 8 records the resulting research gap; Section 9 is a research brief rather than a completed reference board.

## 1. Purpose

FundTogether needs a backer experience for supporting one independent digital comic or artbook and later retrieving its private PDF. The journey must help the backer answer four questions at every point:

1. What exactly am I supporting?
2. What must happen before the creator receives the escrowed funds?
3. Has my pledge been recorded, or is the transaction still unresolved?
4. What can I do now: wait, download, report a problem, challenge, or claim a refund?

The experience belongs in the existing product because FundTogether already implements the underlying local workflow: one reviewed `COMICS_ARTBOOK` campaign, one fixed-price `DIGITAL_DOWNLOAD` PDF tier, repeatable quantity-based pledges, evidence review, private release, challenges, and pre-payout refunds. This document defines the backer-facing experience around that verified behavior. It does not redesign the protocol or authorize a public or real-money launch.

## 2. Existing Product Context

### Entry points and navigation

The current web application uses a persistent user-area sidebar.

- `Truyện tranh & Artbook` opens the Campaign feed at `#/campaigns`.
- `Bộ sưu tập của tôi` appears after sign-in and opens the Campaign collection at `#/campaigns/library`; it can hold digital entitlements now and future NFT ownership records.
- `Tài khoản` or `Đăng nhập` opens account access and linked-wallet management at `#/account`.
- Successful historical Campaign records appear in the Campaign feed under the `Đã gây quỹ` filter. Their cards remain read-only historical records and cannot receive new pledges.

### Adjacent role surfaces and handoffs

The backer journey sits inside a larger role-based product. These surfaces are part of the existing application context, but they are not being redesigned by this backer-focused document:

| Surface | Route | Existing responsibility | Handoff to the backer journey |
| --- | --- | --- | --- |
| Account & wallet access | `#/account` | Sign in, connect/link a wallet, show network and balance readiness, and expose role-specific portals | Backer must complete account and linked-wallet readiness before signing a pledge; Creator/Resolver actions must use the correct role wallet |
| Creator Studio | `#/campaigns/creator`, `#/campaigns/creator/draft`, `#/campaigns/creator/new` | Creator profile/IP declaration, Campaign draft preparation, evidence and production submission, freeze/submit, and campaign publication steps | A frozen and Resolver-approved commitment can become a canonical funding campaign visible to backers |
| Admin Console | `#/admin` | Verify creator/IP profiles, monitor lifecycle queues and operational exceptions, and refresh administrative data | Admin verification is a prerequisite for eligible creator work; Admin does not decide financial release or refund transitions |
| Resolver Console | `#/campaigns/resolver` | Review campaign commitments, open/close Community Review, approve/request changes/reject, inspect production/PDF evidence, and resolve eligible disputes | Resolver decisions create the states that determine whether a campaign is pledgeable, downloadable, challengeable, or refundable |
| Community Review | `#/campaigns/review` | Let signed-in community members submit public comments or private issue reports on the currently exposed commitment/evidence | Public comments are anonymized for the community; private issues are visible to their author, Creator and Resolver. Neither type opens pledge, approves funds, or creates entitlement |
| Campaign public / Backer detail | `#/campaigns/:id` | Show the frozen promise, review decision, on-chain funding/production/release state, and the current Backer's pledge/PDF/refund actions | Public discovery and Backer financial/entitlement entry point; it does not mount Creator or Resolver mutations |
| Campaign Creator workspace | `#/campaigns/creator/:id` | Owned campaign dossier, production evidence, final PDF, completion and Creator-owned follow-up requests | Creator-only private workspace; ownership is checked before private reads |
| Campaign Resolver workspace | `#/campaigns/resolver/:id` | Review dossier/evidence, Resolver decisions, eligible funding finalization and settlement review | Resolver-only review/decision workspace; role checks remain server/contract enforced |
| Campaign Admin operations | `#/admin/campaigns/:id` | Publication, indexer, lifecycle and operational exception projection | Admin read-only operations surface; it does not grant Resolver financial authority |
| Campaign library | `#/campaigns/library` | List canonical backer entitlements and their next action | Durable return point for tracking, PDF access, or refund recovery |
| Historical Campaign records | `#/campaigns/history/entitlements` and direct historical detail | Preserve historical campaign records and entitlements | Historical records remain read-only and separate; no new pledge or physical-fulfillment flow is restored |

The role handoff is therefore:

```text
Creator profile/IP verification
  → Creator Studio freezes and submits the Campaign commitment
  → Resolver reviews and may open Community Review
  → Resolver approves the commitment; Creator and Resolver complete the separate on-chain activation step
  → Backer discovers, pledges, tracks, and receives the private PDF
  → Resolver decisions or deadline transitions determine release, challenge, or refund states
```

### Current discovery journey

The Campaign feed separates campaigns currently funding, successful funded history, and approved dossiers waiting for on-chain activation. Community Review remains a separate review surface. Each campaign card shows:

- title and short pitch;
- creator display name;
- fixed price per PDF;
- plain-language lifecycle status;
- the standard PDF deliverable and, on the funding shelf, an integer-safe funding-progress view.

Community Review is explicitly not a pledge surface. Private sample material exists for review, but the repository does not establish cover art, public sample pages, search, categories, saved items, personalized recommendations, or other public discovery features.

### Current presentation conventions

The user area uses a muted green and neutral palette, white bordered panels, compact status pills, plain-language buttons, and inline status/error messages. Desktop navigation is a persistent left sidebar; at narrow widths it becomes a wrapped horizontal group above the content. Campaign and account content collapses to one column on small screens. The current Campaign experience is primarily text-led, so a prototype should improve hierarchy without inventing unverified campaign media.

### Current campaign detail

The campaign page currently presents the frozen campaign dossier:

- title, pitch, creator, format, and fixed price;
- story and promised PDF description;
- content outline;
- self-funded production budget;
- evidence plan;
- production evidence plan; the release deadline is collected only after the Creator confirms campaign completion;
- funding goal and duration;
- commitment hash and Resolver decisions.

When the campaign exists on chain, the same page also shows the financial and production state, amount raised, escrowed amount, funding deadline, the release deadline only after Creator confirmation, challenge deadline, and open dispute count. The pledge action is displayed during funding even when the signed-in account already has an active entitlement, because the backer may buy more package units.

### Current account and wallet convention

Account identity and wallet authority are separate. A user signs in to a FundTogether account, connects a browser wallet, and proves ownership with a signature before that wallet becomes linked to the account. The current account page shows wallet address, network, gas balance, MockUSDC balance, and whether the browser wallet is linked.

A backer transaction requires the connected wallet to:

- be linked to the signed-in FundTogether account;
- be on local chain `31339`;
- hold enough MockUSDC for the selected quantity;
- hold enough native currency for network fees.

The platform fee is zero. That statement must not be presented as meaning the network transaction has no gas cost.

### Current pledge behavior

The campaign shows one fixed-price pledge preflight with a quantity selector: `Ủng hộ [quantity] gói · [price × quantity] MockUSDC`. Before a wallet request, it checks account sign-in, the linked wallet, local chain `31339`, canonical `FUNDING` state, and MockUSDC balance/allowance for the selected total. An existing entitlement does not block another purchase.

If token allowance is insufficient, the product requests token approval for the selected total first. The wallet then requests one quantity-bearing pledge transaction. The UI keeps the public transaction hash and lifecycle in a versioned browser-local recovery record, reports wallet confirmation, submission, receipt, and canonical indexer confirmation separately, and offers status reconciliation before retrying an uncertain action. A pledge is complete only after canonical synchronization produces the quantity-bearing entitlement. Token approval by itself is not a pledge, and a submitted transaction is not yet a recorded pledge.

### Current returning-user journey

The Campaign library currently lists each entitlement as a panel containing the campaign title, amount paid, plain-language access status, a short explanation, and a state-specific next action. Technical identifiers remain behind a details disclosure. The library is the durable return point after canonical indexing, while campaign detail remains the place for download, refund, challenge, and issue actions.

Download is available on campaign detail only when the entitlement is `DOWNLOAD_ELIGIBLE`. The downloaded bytes are checked against the approved SHA-256 hash before the product hands the file to the browser download mechanism. The product cannot prove that the user saved or opened it. Downloading and optionally confirming that the PDF was checked are separate actions. Neither action alone releases funds.

### Existing product constraints that must remain visible in the UX

- This is a local Anvil/MockUSDC pilot, not a public or real-money service.
- Each campaign offers one standard PDF tier at one fixed unit price.
- Each wallet can buy a positive quantity in one transaction and can submit more pledge transactions later; there are no gifts, transfers, extra tiers, stock limits, shipping, keys, or DRM promises.
- Dossier approval and on-chain campaign publication are separate states.
- The creator receives no advance. Payout occurs only after accepted PDF release, the seven-day challenge period, and resolution of open challenges.
- Production-evidence approval does not make the PDF downloadable.
- A canonical pledge creates the entitlement. A database message or wallet submission alone does not.
- A valid entitlement has no automatic download expiry, although permanent hosting is not promised.
- A report, a formal on-chain challenge, and an eligible refund claim are distinct actions.
- Post-payout issue reporting remains possible, but it does not create an automatic contract refund.

## 3. Target User Experience

The backer should be able to move from interest to support without learning the implementation vocabulary of the protocol. At the same time, the interface must never hide uncertainty about money or access.

The experience should provide:

- **Clarity:** the work, creator, one-PDF promise, fixed price, campaign state, expected release window, and refund boundary are visible before pledge.
- **Confidence:** review decisions, evidence plan, escrow rule, current deadlines, and the exact status of the user's own pledge are explained in plain Vietnamese.
- **Controlled effort:** the product asks for account and wallet work only when the user chooses to support or perform a wallet-authorized recovery action.
- **Visible progression:** token approval, pledge signature, receipt, canonical recording, production, PDF review, challenge period, and availability are presented as distinct steps.
- **Useful feedback:** every consequential action says what happened, what has not happened yet, and what the user should do next.
- **Safe recovery:** an interrupted or uncertain transaction leads to status checking before any new submission. File errors lead to reporting, not a false delivered state.

The intended emotional outcome is informed confidence. The backer should feel that the project is inspectable and that their money and access state are traceable, without being forced to interpret hashes or raw status codes.

## 4. User Journey

```text
Discover Campaign
  → open a campaign
  → understand the work, creator, fixed PDF promise, price, dates and protections
  → choose “Ủng hộ”
  → sign in if needed
  → connect/link the intended wallet if needed
  → review pledge summary and readiness
  → approve exact MockUSDC spending if needed
  → sign the pledge
  → submitted / receipt pending
  → canonical recording pending
  → pledge recorded
  → open “Thư viện PDF Campaign”
  → follow campaign production and release state
  → PDF becomes available
  → download and verify the PDF
  → optionally confirm it was checked
```

Meaningful branches:

```text
Campaign dossier still under review
  → inspect public commitment and feedback count
  → no pledge CTA

Dossier approved but campaign not opened on chain
  → explain “Đã duyệt hồ sơ · chưa mở gây quỹ”
  → no pledge CTA

Wallet/account/network not ready
  → show the unmet prerequisite and direct recovery action
  → return to the same campaign after completion

Funding deadline passed but result is not finalized
  → stop accepting pledges
  → show “Đã hết hạn · chờ chốt kết quả”
  → allow the permissionless result transition without competing with personal actions

Transaction rejected before submission
  → no pledge recorded
  → allow the user to try again

Transaction submitted but outcome unknown
  → retain transaction identity
  → check status first
  → do not present a generic “pay again” action

Funding deadline passes below goal, or an approved timeout condition is reached
  → the permissionless finalization/refunding transition becomes eligible
  → its successful transaction and canonical recording make the entitlement refund eligible
  → reconnect the original pledge wallet
  → claim full pledge amount

PDF unavailable, corrupt, or hash-mismatched
  → no success state and no backer confirmation
  → show a private issue-report action
  → show formal challenge only while eligible before payout

Challenge upheld or Creator cancellation succeeds before payout
  → that successful resolution/cancellation transaction moves the campaign to refunding
  → canonical recording makes each valid entitlement refund eligible
  → each eligible backer claims with the original pledge wallet

Challenge dismissed
  → explain the decision and remaining challenge deadline
  → keep valid download access available

Payout already completed
  → keep valid PDF access and issue reporting
  → state that no automatic contract refund is available
```

## 5. Flow Specification

### Flow A — Discover and evaluate a campaign

**Trigger**  
The user opens `Truyện tranh & Artbook` or follows a campaign link.

**Steps**

1. Scan campaign cards with title, creator, one-PDF price, dossier/campaign state, funding progress when applicable, and release timing.
2. Open a campaign.
3. Read the work promise first: pitch, PDF description, content outline, creator, price, and release window.
4. Review trust and protection information: review decision, evidence plan, funding progress, escrow/payout rule, challenge/refund boundary.
5. Expand technical details only if desired: commitment hash, transaction/deployment identity, and full decision history.

**Decision points**

- Under review: inspect or contribute feedback; cannot pledge.
- Approved but not opened: wait; cannot pledge.
- Funding open: pledge is available.
- Funding deadline passed but the result is not finalized: no pledge; show `Chờ chốt kết quả` and a subordinate `Cập nhật kết quả` action.
- Already pledged: open personal status instead of showing another pledge action.
- Funding closed: show the current production, release, refund, or completion state.

**Exit conditions**

- User leaves without supporting.
- User enters pledge readiness.
- Signed-in user opens their existing entitlement.

**Failure / recovery**

- Feed or detail load failure shows a retry action and keeps navigation available.
- Missing campaign shows a clear not-found state with return to Campaign.

### Flow B — Become pledge-ready

**Trigger**  
The backer chooses the pledge CTA.

**Steps**

1. If signed out, sign in or create an account.
2. Return to the same campaign rather than the general feed.
3. Connect a browser wallet.
4. If not yet linked, sign the ownership proof and verify the link.
5. Check the selected wallet, local network, MockUSDC balance, and network-fee balance.
6. Continue to pledge review when all requirements are satisfied.

**Decision points**

- Connected wallet already linked: continue.
- Different linked wallet required: switch deliberately and re-check readiness.
- Wrong network: switch before transaction review.
- Insufficient MockUSDC or gas: explain which balance is missing; do not open the signing step.

**Exit conditions**

- Ready wallet selected; continue to pledge review.
- User cancels and returns to campaign detail with no financial action.

**Failure / recovery**

- Rejected signature leaves the wallet unlinked and provides a retry.
- Wallet switched during verification invalidates the attempt and requires a fresh check.

### Flow C — Review and submit the pledge

**Trigger**  
The signed-in user has a linked, eligible wallet and chooses to continue.

**Steps**

1. Show a pledge review state with campaign, creator, `Một PDF`, fixed MockUSDC price, selected wallet, network, zero platform fee, possible network gas, and expected release window.
2. Explain whether one or two wallet confirmations may occur:
   - exact-price token spending approval, only when required;
   - the pledge transaction.
3. Ask the user to continue.
4. If required, request token approval and show its separate progress and completion.
5. Request the pledge signature.
6. After submission, show the transaction identity and disable another pledge submission.
7. Progress through receipt confirmation and canonical recording.

**Decision points**

- User rejects token approval: return to review with no pledge recorded.
- Approval succeeds but user rejects pledge: explain that spending permission exists but no pledge was made; allow the pledge step again.
- Pledge reverts: show failure and a safe retry after current state is checked.
- Outcome is unknown: enter the recovery flow.

**Exit conditions**

- Canonical pledge recorded and entitlement visible.
- Definitive failure before a pledge was recorded.
- Unknown outcome requiring status recovery.

**Failure / recovery**

The product must never label token approval, transaction submission, or receipt alone as `Đã ủng hộ`. The completion state is reserved for canonical recording in the account.

### Flow D — Recover an interrupted or uncertain pledge

**Trigger**  
The wallet submitted a pledge but the page was closed, reloaded, timed out, lost network access, or could not confirm canonical recording.

**Steps**

1. Restore the unresolved transaction state and display its transaction identifier.
2. Make `Kiểm tra trạng thái pledge` the primary action.
3. Check for receipt and canonical account recording.
4. Resolve to recorded, failed/reverted, still pending, or not found.
5. Offer a fresh pledge only after a definitive non-recorded result and a current entitlement check.

**Decision points**

- Recorded: continue to success/library.
- Still pending: keep waiting and allow later status checks.
- Failed/reverted: allow retry.
- Not found but outcome remains ambiguous: keep the recovery explanation and avoid a payment CTA.

**Exit conditions**

- Recorded entitlement.
- Definitive safe-to-retry state.
- User leaves with the pending transaction recoverable later.

**Failure / recovery**

The current prototype stores only the public transaction hash, action, campaign/account context, lifecycle stage, and an operator-readable error in browser local storage under a versioned namespace. On return to the same campaign, the interface restores the record, checks the receipt, calls the canonical sync endpoint, and withholds a new pledge CTA while the result is unresolved. A failed/reverted record can be retried after the failed state is explicit; no private key, signature, or secret is stored.

### Flow E — Track a supported work

**Trigger**  
The backer opens `Phần thưởng của tôi` or follows the success link after a pledge.

**Steps**

1. See a library entry that identifies the work by title and creator.
2. Understand personal state in plain language, such as:
   - `Pledge đã ghi nhận`;
   - `Đang sản xuất`;
   - `Bằng chứng sản xuất đã duyệt · chưa có PDF`;
   - `PDF đang chờ duyệt`;
   - `PDF sẵn sàng tải`;
   - `Đang trong thời gian challenge`;
   - `Có thể nhận hoàn tiền`;
   - `Đã hoàn tiền`;
   - `Đã trả Creator`.
3. See the next relevant date and one primary action.
4. Open the campaign status for full evidence, decisions, and financial details.

**Decision points**

- PDF ready: download.
- Refund eligible: claim using original pledge wallet.
- Action not yet available: show why and the next expected milestone.
- Entitlement orphaned by canonical-chain change: remove access and explain the state rather than showing a download control.

**Exit conditions**

- User completes the next action or leaves knowing the current state.

**Failure / recovery**

- Library load errors show retry without mixing historical records into Campaign.
- Empty library links back to Campaign discovery.

### Flow F — Download and optionally confirm the PDF

**Trigger**  
The entitlement is eligible and the backer chooses `Tải PDF`.

**Steps**

1. Re-check current entitlement and accepted release.
2. Request and download the private file.
3. Verify the file bytes against the reviewed hash.
4. Hand the verified PDF to the browser download mechanism.
5. Show a completion state that identifies the work, says the verified download was handed to the browser, and explains that downloading is not acceptance and does not authorize payout.
6. Offer the separate optional action `Tôi đã kiểm tra và xác nhận PDF`.

**Decision points**

- Verified download: hand the file to the browser and allow optional confirmation.
- Access expired at the short-lived link: request a new download without implying entitlement expiry.
- Entitlement refunded/orphaned: deny access and explain the state.
- Missing file or hash mismatch: enter issue recovery.

**Exit conditions**

- Verified file handed to the browser download mechanism.
- Download not completed; issue recovery available.

**Failure / recovery**

Never show successful delivery when file verification fails. Preserve a direct route to report the affected release.

### Flow G — Report, challenge, or claim a refund

**Trigger**  
The backer detects an issue, the release is formally challengeable, or the campaign is refund eligible.

**Steps**

1. Explain the available action based on the current policy state:
   - private issue report;
   - formal on-chain challenge before payout;
   - refund claim after the campaign enters refunding.
2. For a report, collect the affected commitment/evidence and detailed description.
3. For a challenge, explain that the report is submitted first and the original pledge wallet must then sign the challenge transaction.
4. Track challenge status and Resolver decision.
5. If refund eligible, reconnect the original pledge wallet, review the full refund amount, submit, and track receipt plus canonical recording.

**Decision points**

- Reporting period only: report does not freeze funds.
- Challenge window active: eligible backer may report and sign a challenge.
- This wallet already challenged: show its existing challenge status; it cannot submit a second challenge, including after dismissal. Issue reporting remains available.
- Challenge upheld: the campaign enters refunding through the successful resolution transaction.
- No accepted release by the frozen release deadline plus seven days, or an unresolved challenge thirty days after the first challenge: show that a permissionless refunding transition is eligible but not yet completed. A successful transaction and canonical recording are still required.
- Challenge dismissed: retain access, show the decision and remaining campaign deadline, and do not restore challenge eligibility for that wallet.
- Payout completed: reporting remains; automatic refund is unavailable.

**Exit conditions**

- Report recorded.
- Challenge recorded and pending/decided.
- Refund recorded.

**Failure / recovery**

If the report succeeds but the challenge transaction is rejected or unresolved, show `Báo cáo đã gửi · challenge chưa được ghi nhận`. Never combine those outcomes into a single success message.

## 6. Screen & State Inventory

### Screen 1 — Campaign discovery

**Purpose**  
Help visitors find a work and understand whether it is inspectable, fundable, or already in production.

**Entry conditions**  
Open `#/campaigns` from the sidebar or a return link.

**Required information**  
Local-pilot notice; title; creator; one-PDF price; dossier/campaign state; funding progress when open; relevant date; feedback count.

**Primary action**  
`Xem campaign`.

**Secondary actions**  
Open existing historical Campaign records; creator entry remains available but visually secondary for the backer journey.

**States**  
Loading, error with retry, empty, under review, approved/not opened, funding, production/release, refunding, completed.

**Exit / transition**  
Campaign detail.

### Screen 2 — Campaign detail: evaluate

**Purpose**  
Make the frozen one-PDF promise, creator context, price, timing, review, and financial protections understandable before support.

**Entry conditions**  
Open a campaign from the feed or a direct link.

**Required information**  
Work summary; creator; PDF promise; fixed price; goal/progress; funding and release dates; current phase; content outline; budget/evidence plans; review result; escrow/challenge/refund explanation.

**Primary action**  
Depends on state: signed-out visitors see `Đăng nhập để ủng hộ`; a ready signed-in backer sees `Ủng hộ`; an existing backer sees `Xem quyền PDF của bạn`; non-fundable states show no pledge action and explain why.

**Secondary actions**  
Sign in; view community-feedback count; expand evidence, decisions, and technical identifiers.

**States**  
Loading; not found; under review; approved/not opened; funding; signed-out funding; already pledged; funding expired/awaiting finalization; production; PDF review; released/challenge; eligible refund transition pending; refunding; paid out.

**Exit / transition**  
Pledge readiness, personal status, report/challenge, or Campaign feed.

### Screen 3 — Account and wallet readiness

**Purpose**  
Establish the account and wallet authority required for the pledge without losing campaign context.

**Entry conditions**  
Backer attempts to pledge while signed out or unready.

**Required information**  
Signed-in account; selected wallet; linked status; local network; MockUSDC balance; gas balance; any unmet prerequisite.

**Primary action**  
The one action that resolves the current blocker: sign in, connect, link, switch network, switch wallet, or continue.

**Secondary actions**  
Cancel and return to campaign.

**States**  
Signed out; connecting; signature requested; verifying; linked; wrong network; wrong wallet; insufficient MockUSDC; insufficient gas; error.

**Exit / transition**  
Return to campaign or pledge review.

### Screen 4 — Pledge review

**Purpose**  
Let the backer verify the financial intent before opening wallet confirmations.

**Entry conditions**  
Account and wallet readiness passed during open funding.

**Required information**  
Campaign and creator; one PDF; exact MockUSDC price; selected wallet; local network; zero platform fee; network-fee note; expected release; refund boundary; number and purpose of possible wallet confirmations.

**Primary action**  
`Tiếp tục trong ví`.

**Secondary actions**  
Change wallet; return to campaign.

**States**  
Ready; allowance already sufficient; token approval required; readiness changed; campaign no longer fundable.

**Exit / transition**  
Transaction progress or campaign detail.

### Screen 5 — Transaction progress and recovery

**Purpose**  
Show exactly which financial step is underway and prevent an uncertain outcome from becoming an accidental repeat submission.

**Entry conditions**  
Pledge review confirmed or an unresolved transaction restored.

**Required information**  
Step name; what the wallet is authorizing; current status; transaction identifier after submission; safe next action.

**Primary action**  
Contextual: confirm in wallet, `Kiểm tra trạng thái pledge`, or retry after definitive failure.

**Secondary actions**  
Copy transaction identifier; return to campaign while keeping pending state recoverable.

**States**  
Token approval requested; token approval submitted/confirmed/failed; pledge requested; pledge submitted; receipt confirmed; canonical recording pending; recorded; rejected; reverted; unknown outcome.

**Exit / transition**  
Pledge success, safe retry, or persistent pending state.

### Screen 6 — Pledge recorded

**Purpose**  
Confirm that the pledge belongs to the account and set expectations for production and PDF access.

**Entry conditions**  
Canonical pledge recording succeeds.

**Required information**  
Campaign; amount; linked pledge wallet; recorded status; what happens next; expected release window; clear statement that PDF is not yet available unless release has already been accepted.

**Primary action**  
`Xem trong thư viện`.

**Secondary actions**  
Return to campaign; copy transaction identifier.

**States**  
Recorded; recorded while funding still open; recorded near/after a state transition.

**Exit / transition**  
Campaign library or campaign status.

### Screen 7 — Campaign library

**Purpose**  
Act as the durable home for every current Campaign entitlement and its next action.

**Entry conditions**  
Signed-in user opens `Phần thưởng của tôi` or comes from pledge success.

**Required information**  
Work title; creator; amount paid; plain-language personal status; campaign phase; next relevant date; one primary action.

**Primary action**  
Depends on state: view status, download PDF, resolve access issue, or claim refund.

**Secondary actions**  
Open full campaign details; open historical entitlements through the separate history link.

**States**  
Loading; error/retry; empty; pending release; download eligible; confirmed; refund eligible; refunded; orphaned; paid out with valid access.

**Exit / transition**  
Campaign status, download, report/challenge, or refund.

### Screen 8 — Download result

**Purpose**  
Communicate whether a verified copy was handed to the browser download mechanism and keep optional acknowledgement separate.

**Entry conditions**  
Backer chooses download from an eligible entitlement.

**Required information**  
Work identity; verification progress; browser-handoff result; approved-file identity available under technical details; explanation that the product cannot prove the user saved or opened the file; explanation of optional confirmation.

**Primary action**  
During processing: none. After success: `Quay lại thư viện`. The current product does not establish an inline reader or a reliable browser action for opening the download folder.

**Secondary actions**  
`Tải lại PDF`; `Tôi đã kiểm tra và xác nhận PDF`; report a problem.

**States**  
Requesting access; downloading; verifying; handed to browser; short-lived link expired; access changed; file missing; hash mismatch; network error.

**Exit / transition**  
Library, campaign status, optional confirmation, or issue reporting.

### Screen 9 — Issue report and formal challenge

**Purpose**  
Separate ordinary product feedback from a wallet-authorized action that can block payout.

**Entry conditions**  
Signed-in user reports a commitment/release issue; an entitled backer may be within the challenge window.

**Required information**  
Affected item; report visibility; whether a formal challenge is available; effect of each action; deadline; original pledge wallet requirement.

**Primary action**  
`Gửi báo cáo` or `Gửi báo cáo và tiếp tục challenge`, based on eligibility.

**Secondary actions**  
Cancel; return to campaign; check an existing challenge.

**States**  
Draft; report submitting; report recorded; wallet signature requested; challenge submitted; challenge recorded; rejected; pending Resolver; upheld; dismissed; already challenged; challenge period closed; timeout eligible/transition pending.

**Exit / transition**  
Campaign status or refund flow.

### Screen 10 — Refund review and claim

**Purpose**  
Explain the eligible full refund and ensure it returns to the original pledge wallet.

**Entry conditions**  
Campaign is refunding and the entitlement is refund eligible.

**Required information**  
Reason refunding opened; full refund amount; original pledge wallet; local network; claim status; statement that another account or wallet cannot redirect the claim.

**Primary action**  
`Nhận hoàn tiền vào ví đã pledge`.

**Secondary actions**  
Switch to the required wallet; check claim status.

**States**  
Eligible; wrong wallet; signature requested; submitted; receipt pending; canonical recording pending; refunded; reverted; unknown outcome.

**Exit / transition**  
Refunded library entry or recovery state.

## 7. Interaction Requirements

### Progressive disclosure

The main reading order is work → promise → price/timing → protection → action. Commitment hashes, wallet addresses, transaction hashes, deployment details, raw evidence hashes, and full review history remain accessible under labeled technical detail sections. They must not compete with the pledge decision.

### One primary action per state

Campaign and library surfaces should prioritize the one action available to the current user. Staff or creator actions must not appear in the public backer mode. Permissionless protocol transitions such as finalizing funding or triggering timeout refunds should not compete visually with the backer's pledge, download, challenge, or refund action.

### Human-readable state with canonical detail available

Raw codes such as `ON_CHAIN_CONFIRMED`, `DOWNLOAD_ELIGIBLE`, `REFUND_ELIGIBLE`, `ORPHANED`, and `BACKER_CONFIRMED` require Vietnamese labels and a one-sentence consequence. The raw code may remain in technical detail for auditability.

### Transaction progression

The interface must distinguish:

```text
Wallet request
→ transaction submitted
→ receipt successful or reverted
→ canonical event recorded
→ entitlement/account state updated
```

Token approval is a separate precondition. Its completion must not trigger pledge-success copy. When the outcome is unknown, checking status comes before offering a retry.

### Persistent context

Authentication and wallet linking should return the user to the campaign and action that triggered the detour. A submitted transaction should remain recoverable across navigation or reload. The user must be able to leave a pending state and later resume status checking without submitting again.

### Feedback and timing

- Loading text says what is being checked, not only `Đang xử lý`.
- Wallet-waiting states explain which wallet action is expected.
- Submitted states show a transaction identifier and allow copying it.
- Countdown or deadline displays include an absolute local date/time; relative time may be supplementary.
- Success states say what is now true and what remains pending.
- Errors preserve any completed earlier step. For example, approval succeeded but pledge rejected.

### Download and acceptance

The download action may use a short-lived private access request, but the entitlement itself is not presented as expiring automatically. File verification happens before the browser-handoff result. Optional backer confirmation requires a separate deliberate action and plainly states that it does not authorize payout.

### Issue, challenge, and refund separation

The interaction must label these as different consequences:

- `Gửi báo cáo`: records detail for Creator and Resolver; does not move funds.
- `Challenge bằng ví đã pledge`: a time-limited on-chain action that blocks payout while unresolved.
- `Nhận hoàn tiền`: available only after the campaign enters refunding and returns the full pledge to the original wallet.

Partial completion must remain visible. If the report is saved but the challenge transaction is not recorded, show both facts.
Each pledge wallet can open at most one formal challenge for the campaign. After that attempt is canonically recorded, the interface shows its status and leaves ordinary issue reporting available; dismissal does not re-enable the challenge action.

### Navigation and accessibility

- Keep the existing sidebar vocabulary and separate Campaign from historical records.
- All status changes and errors need programmatic status/alert announcements.
- Keyboard focus moves to the new state heading after a major in-page transition.
- Disabled actions include adjacent explanatory text; disabled appearance alone is insufficient.
- Do not encode funding, release, dispute, or refund states by color alone.
- Respect reduced-motion preferences; no critical information depends on animation.

## 8. UX Patterns & Research Findings

### Mobbin research status

| UX question | Planned research | Result | Classification |
| --- | --- | --- | --- |
| Campaign discovery and one-PDF value proposition | Web crowdfunding discovery → project detail → benefit understanding | Search blocked before results; no images or URLs returned | **RESEARCH PENDING** |
| Wallet pledge and transaction progress | Fixed-price contribution → wallet handoff → pending → confirmed/recovery | Search blocked before results; no images or URLs returned | **RESEARCH PENDING** |
| Returning backer, digital library, download, and issue recovery | Supported-work status → digital delivery → download/problem resolution | Search blocked before results; no images or URLs returned | **RESEARCH PENDING** |

No result can be classified as `ADOPT`, `ADAPT`, `INSPIRATION`, or `REJECT` because no actual Mobbin screen was available for inspection. A future research pass must begin with flows and examine the returned images before attaching any classification.

### Repository-derived patterns to prototype

These are product recommendations, not Mobbin findings.

| Pattern | Repository finding | Application to FundTogether | Status |
| --- | --- | --- | --- |
| State-specific primary action | The current page can expose multiple actor/protocol actions near the pledge action | Backer mode shows only pledge, status, download, challenge, or refund as the dominant action for the current state | Prototype recommendation |
| Plain-language status plus audit detail | Current UI exposes raw codes and hashes directly | Put Vietnamese status/consequence first; keep raw identifiers in expandable technical detail | Prototype recommendation |
| Explicit multi-step transaction progress | Token approval, pledge, receipt, and canonical indexing are distinct facts | Show each step independently; reserve success for canonical entitlement recording | Confirmed product requirement; presentation unvalidated |
| Unknown-outcome recovery | Current transaction state is in component memory and reload recovery is not demonstrated | Retain transaction identity and make status checking primary before retry | Prototype recommendation |
| Library as durable return point | Current library exists but lacks work identity and next-action hierarchy | Show title, creator, personal state, next date, and one action per entitlement | Prototype recommendation |
| Separate download, confirmation, and payout | Current behavior deliberately separates all three | Keep distinct controls and explanatory copy; never infer acceptance from download | Confirmed product requirement |
| Separate report, challenge, and refund | Current workflow assigns different authority and financial effect to each | Use separate labels, eligibility explanations, and success states | Confirmed product requirement |

### Patterns to reject based on product constraints

These rejections come from confirmed FundTogether scope, not from Mobbin comparison.

- Tier selection, cart, add-ons, gifting, and upsells. The funding surface has only a quantity selector for the single standard tier.
- Shipping, delivery address, tracking, physical inventory, or fulfillment confirmation.
- Treating token approval as payment success.
- Treating wallet submission as a recorded pledge.
- Showing PDF access immediately after pledge or production-evidence approval.
- Generic `Thử lại` payment copy while a submitted outcome is unknown.
- Public exposure of private sample files, final PDF, access links, identity material, or detailed private reports.
- Claims of DRM, permanent hosting, unique-human enforcement, public-chain readiness, legal acceptance, or automatic post-payout refunds.

## 9. Visual / Interaction Reference Board

Mobbin did not return references because the connected account requires a paid plan. The table below specifies the exact references still needed. It is a research queue for a later pass and must not be interpreted as evidence.

| Our screen/state | Mobbin reference | What to inspect when access is available | Intended usage |
| --- | --- | --- | --- |
| Campaign discovery | **Unavailable — research pending** | How campaign cards balance title, creator, progress, price/benefit, status, and deadline without becoming dense | Compare for Adapt |
| Campaign detail: evaluate | **Unavailable — research pending** | Story hierarchy, trust/evidence placement, sticky contribution summary, separation of core promise from policy detail | Compare for Adapt |
| Account/wallet readiness | **Unavailable — research pending** | How a task resumes after authentication and how prerequisites are resolved one at a time | Compare for Adapt |
| Pledge review | **Unavailable — research pending** | Fixed contribution summary, total/cost clarity, wallet handoff expectation, cancellation | Compare for Adapt |
| Transaction progress | **Unavailable — research pending** | Multi-step wallet progress, submitted identifiers, pending/unknown outcome, recovery after interruption | Compare for Adopt/Adapt |
| Pledge recorded | **Unavailable — research pending** | Success acknowledgement, durable receipt, and next action toward owned content | Compare for Adapt |
| Campaign library | **Unavailable — research pending** | Purchased/supported content cards, delivery readiness, one next action, empty state | Compare for Adapt |
| Verified download | **Unavailable — research pending** | Download preparation, integrity/error feedback, retry, separate acknowledgement | Compare for Adapt |
| Issue/challenge | **Unavailable — research pending** | Consequence explanation, deadline visibility, confirmation for a consequential escalation | Compare for Adapt |
| Refund claim | **Unavailable — research pending** | Eligible amount, destination, pending transaction, completion, and safe retry | Compare for Adapt |

For the future Mobbin pass, use low result counts and investigate one journey at a time. Candidate query intents:

- `crowdfunding browse projects and open campaign benefit detail`
- `crypto contribution confirm in wallet then pending transaction and success`
- `digital purchase library item pending release then download`
- `transaction submitted outcome unknown check status`
- `digital download failed report a problem`
- `crypto refund claim with wallet confirmation`

Only canonical links returned by Mobbin may be added. Actual images must be inspected before recording what a reference demonstrates.

## 10. Product Decisions

The following decisions are intentional for the first backer prototype:

1. The backer journey covers one `COMICS_ARTBOOK`, one fixed-price standard PDF tier, quantity selection, and one private entitlement record per canonical pledge log.
2. The feed and detail page distinguish dossier review, on-chain publication, funding, production, PDF review, challenge, refunding, and payout.
3. Campaign detail leads with the creative promise and backer decision information. Hashes and protocol identifiers remain available through progressive disclosure.
4. During funding, a signed-out visitor sees `Đăng nhập để ủng hộ`, preserving the campaign as the return destination. A signed-in account may pledge even when it already owns an active entitlement.
5. Pledge review shows the selected quantity, exact `price × quantity` token amount, selected linked wallet, local network, zero platform fee, separate network-fee requirement, and expected release.
6. Token spending approval and pledge signing are presented as separate wallet actions when both are required.
7. `Đã ủng hộ` is shown only after the pledge is canonically recorded and the entitlement belongs to the account.
8. A submitted but unresolved transaction enters a recoverable pending state. Status checking is primary; repeat submission is withheld until a definitive safe-to-retry result.
9. Pledge success links directly to `Thư viện PDF Campaign`, which is the durable return point for the backer.
10. Library entries use work identity, plain-language personal state, next relevant date, and one state-specific primary action instead of leading with raw codes.
11. Production-evidence approval never displays a PDF download action.
12. PDF download succeeds only after byte/hash verification. A failed verification is an issue state.
13. Download and optional backer confirmation remain distinct. Neither is described as payout authorization.
14. Report, formal challenge, and refund claim remain separate flows with different eligibility and consequences.
15. Each pledge wallet can submit at most one formal challenge per campaign; dismissal does not restore that action.
16. Deadline arrival and refund eligibility do not imply that the contract state already changed. The UX shows the pending transition until its transaction succeeds and is canonically recorded.
17. A verified PDF handed to the browser is not described as proven saved, opened, or accepted.
18. Valid entitlements are not described as automatically expiring; the product does not promise permanent hosting.
19. Historical Campaign records stay visibly separate and cannot collect new pledges.
20. No cover art, public sample reader, favorites, social sharing, notification subscription, inline PDF reader, or recommendation system is required by this UX scope.

## 11. Assumptions & Open Questions

### Confirmed

- The current product is a local chain `31339` / MockUSDC pilot.
- A campaign offers one fixed-price PDF tier and a wallet may pledge a positive quantity repeatedly.
- Resolver decisions and community feedback have different authority.
- No creator advance or platform fee exists in the approved local policy.
- Accepted PDF release starts a seven-day challenge period.
- Valid download access is account-bound and re-checked against canonical state.
- Backer confirmation is optional and does not authorize payout.
- Eligible refunds are full pre-payout refunds claimed by the original pledge wallet.

### Evidence-backed recommendation

None. No Mobbin evidence was returned, and no user study was supplied.

### Repository-derived recommendation

- Introduce pledge review before wallet confirmation.
- Present transaction progress as separate approval, pledge, receipt, and canonical-recording stages.
- Make unresolved transactions recoverable and status-first.
- Replace raw library codes with plain-language status, consequences, and next actions.
- Use progressive disclosure for audit identifiers and protocol detail.

### Assumptions

- Backers benefit from returning to the exact campaign after account or wallet setup.
- A dedicated pledge review and transaction-progress presentation is preferable to inline text notices.
- The product can retain enough unresolved-transaction context to let the user check status after navigation or reload.
- The design agent can reuse the existing green/neutral visual language and responsive sidebar/header conventions without defining a new brand system.

### Open questions

1. Should a campaign have public cover art? No verified public-cover field or asset workflow was found.
2. Should any sample pages be public? Existing sample evidence is private; exposing it would be a product/privacy change.
3. Should users receive release notifications outside the application? Email, push, and wallet notifications are outside current scope.
4. Which Vietnamese user-facing labels should be finalized for every contract and entitlement state? The prototype should test comprehension before these become stable product vocabulary.
5. What is the expected support path after payout when a file later becomes unavailable? The policy allows reporting but does not define a service-level promise or automatic refund.
6. How should mobile wallet handoff behave? The current repository verifies the browser-wallet flow, not a mobile deep-link experience.
7. Does the product need an external transaction-explorer link for the local pilot, or is copyable transaction identity sufficient?
8. Which campaign information most affects backer trust: creator verification, outline, budget, evidence plan, Resolver decision, community feedback, or escrow rule? This requires user research.
9. Which proposed hierarchy and interaction patterns should be adopted after actual Mobbin images are available? The reference board remains incomplete until paid access or equivalent authorized research access is provided.

## 12. Non-goals

This UX exercise does not define or implement:

- smart contracts, indexer behavior, API endpoints, storage, database schema, or React components;
- public-chain, real-asset, legal, tax, KYC, AML, consumer-rights, or public-launch acceptance;
- creator or Resolver workspace redesign;
- financial-policy changes, creator advances, fees, partial refunds, post-payout contract refunds, or transferable entitlements;
- additional campaign categories, benefit tiers, quantities, gifting, shipping, keys, licenses, or DRM;
- cover-art production, public sample reading, an inline PDF reader, permanent hosting, notifications, recommendations, favorites, or social features;
- visual branding, design tokens, component specifications, or `DESIGN.md`;
- changes to historical Campaign obligations or records.

## Quality-gate result

- Another design agent can understand the intended backer experience, required states, transitions, branches, and product constraints from this document.
- Confirmed behavior, repository-derived recommendations, assumptions, and open questions are separated.
- Important money, transaction, access, challenge, and refund states are represented.
- The proposed journey remains within the current FundTogether local MVP.
- No Mobbin claim or link has been invented.
- **Outstanding research limitation:** actual Mobbin images could not be inspected and canonical references could not be attached because the MCP returned a paid-plan access block. Section 9 defines the bounded follow-up research needed to close this gap.

## 13. Complete website surface inventory

### 13.1 Application shell

Shared shell quanh mọi Campaign page:

- brand block: FundTogether + `Campaign · Comics & Artbooks`;
- sidebar gồm `Khám phá` và signed-in `Không gian làm việc`;
- account entry đổi giữa `Đăng nhập` và `Tài khoản`;
- network context: `Mạng thử nghiệm · MockUSDC`;
- role-aware links cho Creator, Resolver và Admin;
- footer ghi local development environment và Anvil chain `31339`;
- hash routing giữ campaign context qua authentication và wallet handoff;
- mobile menu không được che current state hoặc primary action.

### 13.2 Route và page matrix

| Route | Trang / surface | Người dùng chính | Chức năng chính |
| --- | --- | --- | --- |
| `#/` / `#/campaigns` | Campaign discovery/feed | Public, Backer | Filter shelf, campaign card, mở detail |
| `#/campaigns/review` | Community Review | Community, Resolver | Đọc hồ sơ review, gửi comment/issue |
| `#/campaigns/:id` | Campaign detail public | Public, Backer | Creative promise, ledger, pledge, delivery |
| `#/campaigns/creator/:id` | Campaign Creator workspace | Creator | Owned dossier, evidence, production, completion, Creator requests |
| `#/campaigns/resolver/:id` | Campaign Resolver workspace | Resolver | Review, evidence, activation, challenge, settlement decisions |
| `#/admin/campaigns/:id` | Campaign Admin operations | Admin | Publication/indexer/lifecycle inspection; no Resolver decisions |
| `#/campaigns/library` | Campaign Library | Backer | Entitlement, PDF/refund recovery |
| `#/account` / `#/workspace` | Account và wallet | All | Session, SIWE, linked wallets, roles |
| `#/campaigns/creator` | Creator Studio | Creator | Draft gate, workflow, submission |
| `#/campaigns/creator/profile` | Studio Profile | Creator | Bio, IP declaration, publications |
| `#/campaigns/resolver` | Resolver Console | Resolver | Queue, dossier, review, exceptions |
| `#/admin` / `#/campaigns/admin` | Admin Console | Admin | IP verification, KPI, exceptions |
| `#/campaigns/history*` / `#/campaigns/:id` | Historical Campaign | Historical backer | Read-only historical data |

### 13.3 Discovery và campaign card

Feed gồm filter `Tất cả`, `Đang gây quỹ`, `Đã gây quỹ`, `Chờ kích hoạt`; shelf/grid;
loading/error/empty state; card title, creator, category, pitch, state, price, progress,
deadline và một CTA. Chỉ canonical Campaign binding với contract state `FUNDING` mới có
CTA pledge. `APPROVED + NOT_PUBLISHED` là `Chờ kích hoạt`, không phải `Đang gây quỹ`.
Historical funded card có nhãn lịch sử và không nhận pledge mới. Không có cart,
multi-tier, shipping, inventory hoặc physical fulfillment; funding chỉ có quantity selector
cho tier standard hiện tại.

### 13.4 Campaign detail

Trang detail có hai vùng: Folio/content và Notarial ledger. Bốn tab là:

| Tab | Nội dung |
| --- | --- |
| `Tổng quan (Folio)` | Title, creator, pitch, story, benefit promise, trust dossier, entitlement |
| `Sản xuất & Bằng chứng` | Production evidence, final PDF, hashes, upload/review |
| `Cam kết & Tiến trình` | Timeline, application/publication/contract states, decisions |
| `Góp ý & Thẩm định` | Comment, issue, challenge và decision context |

Backer signed-out chỉ đọc và thấy `Đăng nhập để ủng hộ`; signed-in thấy exact price,
wallet, network và preflight. `PENDING_RELEASE` không có download. `DOWNLOAD_ELIGIBLE`
có ticket/download. Report, formal challenge và refund là ba action khác nhau.

Creator được upload evidence/PDF đúng gate nhưng không tự approve hoặc tự bật download.
Resolver được xem private evidence, review đúng object, activate exact frozen terms và
resolve challenge. Sai Resolver wallet/deployment phải chặn signing.

### 13.5 Pledge preflight và transaction

Preflight chỉ ready khi campaign là `ON_CHAIN_CONFIRMED` + `FUNDING`, session/wallet
đúng, chain/deployment/token đúng, balance đủ, allowance đủ hoặc cần approve, và không
có unresolved transaction/active entitlement trùng campaign.

Preflight phải hiển thị title, standard PDF, exact MockUSDC amount, wallet rút gọn,
chain ID, zero platform fee, network fee riêng và thông báo pledge chỉ hoàn tất sau
receipt + canonical event + indexer + entitlement. Approval thành công không phải pledge.

```text
Preflight → Awaiting signature → Submitted(hash)
         → Receipt confirmed → Indexing → Canonical entitlement
         → Failed / rejected / unknown
```

Khi unknown outcome, primary action là `Kiểm tra trạng thái`; không tự động retry.
Transaction hash phải copy được và context phải còn sau reload/navigation.

### 13.6 Account, SIWE và wallet

Account gồm đăng nhập/tạo tài khoản, SIWE, session errors, link/unlink wallet,
disconnect/change wallet, linked wallet list, role badges và return-to-origin.
Client address không được trusted nếu chưa verify signature. Resolver wallet phải
so sánh case-insensitive với deployment Resolver trước nonce/challenge/signature.
Wrong wallet bị chặn nhưng disconnect/change-wallet vẫn hoạt động.

### 13.7 Campaign Library

Library card phải có campaign title, creator, amount paid, plain-language access state,
consequence, next date, transaction disclosure và một CTA chính.

| Access | Cách nói | CTA |
| --- | --- | --- |
| `PENDING_RELEASE` | Pledge canonical, PDF đang chờ duyệt | Theo dõi campaign |
| `DOWNLOAD_ELIGIBLE` | PDF đã sẵn sàng | Tải PDF riêng tư |
| `DELIVERY_UNAVAILABLE` | File cần Resolver kiểm tra | Xem sự cố / báo lỗi |
| `REFUND_ELIGIBLE` | Có thể nhận full refund | Claim bằng ví đã pledge |
| `REFUNDED` | Refund đã canonical | Không cần thêm action |
| `ORPHANED` | Quyền lợi không còn hợp lệ | Xem chi tiết |

Download flow: entitlement check → fresh canonical check → short-lived private ticket
→ URL validation → blob → byte/hash verification → browser handoff. Ticket expiry không
phải entitlement expiry; không hứa permanent hosting hoặc DRM.

### 13.8 Creator Studio và Studio Profile

Creator flow bắt buộc: profile/IP declaration → Admin verification → draft validation
→ sample/content/budget/evidence plan → freeze → Resolver review → correction loop
→ approval/activation → production evidence → final PDF/hash → release review.

Draft chỉ nhận `COMICS_ARTBOOK`, một standard `DIGITAL_DOWNLOAD` PDF, goal/price/duration
integer-safe, không nhận ngày phát hành trong commitment. Creator chỉ chốt release deadline
sau khi xác nhận hoàn thành campaign và production evidence đã được Resolver duyệt. Không quantity tier, inventory, bundle,
shipping hoặc physical promise. `CHANGES_REQUESTED` quay về editable `DRAFT` nhưng giữ history.

Studio Profile có display name, bio, IP declaration, status, publications, validation và
rejection reason. Profile chưa `VERIFIED` thì Studio chỉ hiển thị gate và không cho submit.

### 13.9 Resolver và Admin

Resolver queue tách frozen/private review, community review, activation, funding, production,
release, challenge/dispute, refund/payout và orphaned/indexer exception. Dossier có creator
profile, frozen snapshot, tier terms, plans, evidence, feedback và decision history.

Resolver actions phải ghi đúng object: `Approve campaign`, `Yêu cầu chỉnh sửa`, `Reject campaign`,
`Duyệt bằng chứng sản xuất`, `Duyệt PDF cuối`, `Chấp nhận khiếu nại`, `Bác khiếu nại`,
`Mở hoàn tiền khi quá hạn policy` và `Trả Creator khi đủ điều kiện`.

Admin Console gồm KPI review queue/funding/pending sync/exceptions, lifecycle distribution,
exception list, creator/IP tabs và confirmation trước approve/reject. Admin chỉ verify
creator/IP và theo dõi vận hành; không approve release, payout, refund hoặc sửa canonical state.

## 14. Capability catalog

| Capability | Chi tiết phải có | Authority |
| --- | --- | --- |
| Auth/session | Wallet-only SIWE, one-time nonce, opaque session cookie, return-to-origin | Backend + signature verification |
| Wallet linking | Link/unlink, chain check, Resolver guard, recovery | Backend + wallet signature |
| Creator profile | Bio, IP declaration, status, rejection reason | Admin review |
| Draft/review | Typed config, revision, save, freeze, submit, correction | Backend + Resolver |
| Activation | Exact terms, binding, deployment check, orphan recovery | Campaign contract + indexer |
| Pledge | Balance/allowance, approve, fixed pledge, one wallet | Campaign contract |
| Indexing | Receipt, event, idempotent projection, entitlement | Indexer + DB projection |
| Evidence/delivery | Private evidence, final PDF, SHA-256, ticket, byte verification | Storage + Resolver + Backend |
| Feedback/challenge | Comment, issue, formal challenge, uphold/dismiss | App + contract |
| Refund/payout | Eligibility, original wallet, claim, release/challenge gates | Campaign contract/policy |
| Operations | Summary, KPI, queue, exception, indexer lag | Role-specific read models |

## 15. State and source-of-truth matrix

| Dimension | Ví dụ state | Nguồn chính | Website consequence |
| --- | --- | --- | --- |
| Application | DRAFT, FROZEN, UNDER_REVIEW_PRIVATE, APPROVED | PostgreSQL review/application | Edit/review visibility |
| Publication | NOT_PUBLISHED, ORPHANED, ON_CHAIN_CONFIRMED | Campaign binding/indexer | Pledge visibility |
| Contract | FUNDING, PRODUCTION, RELEASE_REVIEW, RELEASED, REFUNDING, SETTLED | Smart contract snapshot | Financial eligibility |
| Entitlement | PENDING_RELEASE, DOWNLOAD_ELIGIBLE, DELIVERY_UNAVAILABLE, REFUND_ELIGIBLE, REFUNDED | Indexed entitlement | Library CTA |
| Transaction | Awaiting signature, submitted, receipt, indexing, canonical | Browser + receipt + indexer | Recovery copy |
| File | Uploaded, hashed, accepted, ticketed, verified | Storage + Resolver decision | Evidence/PDF access |

Browser local state chỉ là recovery hint; không cấp quyền tiền hoặc file nếu canonical source chưa xác nhận.

## 16. Product and safety rules

- Approval thành công không phải pledge thành công.
- Receipt thành công không phải canonical entitlement.
- Deadline đến không phải contract transition đã mined.
- `REFUND_ELIGIBLE` không phải `REFUNDED`.
- Production evidence approval không phải PDF download availability.
- Report, formal challenge và refund claim là ba flow khác nhau.
- Download handoff không chứng minh file đã lưu hoặc mở.
- Mọi disabled action cần lý do cạnh button; không dùng màu là tín hiệu duy nhất.

## 17. Final documentation status

`PRODUCT.md` hiện bao quát Backer journey, Creator Studio, Studio Profile, Resolver Console,
Admin Console, Account/Wallet, Community Review, Campaign Library và Historical Campaign.
Đây là documentation-only update; không sửa frontend, backend, contract, database hoặc
deployment. Các thay đổi code đang dirty trong checkout được giữ nguyên.

Mobbin research vẫn **PENDING** vì paid-plan gate; không có screenshot, canonical URL
hoặc Mobbin classification nào được bịa. Các pattern trong file là repository-derived
recommendations và phải được kiểm tra bằng user research/Mobbin khi có quyền truy cập.
