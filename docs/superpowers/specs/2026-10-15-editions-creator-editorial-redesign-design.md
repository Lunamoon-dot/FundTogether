# FundTogether Editions: Creator Editorial UI/UX Redesign

## Status

Proposed design. The creator/editorial visual direction was approved in
conversation on 2026-10-15; this document still requires user review before
implementation planning. It defines the cross-surface design and the order of
implementation. It does not change the Editions financial state machine or
contract behavior.

## Design brief

FundTogether Editions should feel like a welcoming comic and artbook studio,
not like a generic admin dashboard. The interface must still make money,
review authority, private evidence, refund eligibility, and the next required
action unambiguous.

The chosen direction is **creator/editorial**:

- Editorial cards, cover-like campaign previews, generous whitespace, and a
  warmer visual rhythm for discovery and campaign storytelling.
- A restrained operations layer for Creator, Resolver, and Admin workspaces.
- Friendly Vietnamese copy that explains the state instead of exposing raw
  enums such as `COMMUNITY_REVIEW` or `REFUND_ELIGIBLE` as the primary label.
- Charts only where the API already provides trustworthy numbers or dates.

## Success criteria

1. A Backer can understand a campaign's story, funding state, risk boundary,
   and next action without opening several unrelated panels.
2. A Creator can see one coherent production pipeline and return to the exact
   step that needs work after `CHANGES_REQUESTED`.
3. A Resolver can process one campaign at a time from a compact queue, while
   keeping current revision data separate from collapsed review history.
4. An Admin can see operational counts and exceptions without confusing
   indexed projections with contract truth.
5. A failed, empty, loading, or stale-indexer state has an explicit message
   and recovery action.
6. Existing hash routes, field names, role guards, financial state
   transitions, and privacy boundaries remain compatible.

## Product boundaries

This redesign applies to the active FundTogether Editions product:

- `COMICS_ARTBOOK`
- one standard digital-download PDF reward
- MockUSDC pledge and escrow flows
- private evidence and PDF release
- Resolver review, production acceptance, disputes, and refunds

Physical fulfilment, shipping, legacy charity flows, new financial policy,
automatic approval, automatic refund execution, and new contract transitions
are out of scope.

The existing legacy reward routes are not redesigned as a second product. They
remain available only where current compatibility requires them.

## Information architecture

Keep the current hash route slugs and primary navigation destinations to avoid
breaking links and user muscle memory. Reorganize the content inside those
routes around role-specific workspaces.

### Shared application shell

Use one responsive shell for all active Editions routes:

- Compact brand mark and environment label.
- Primary navigation: `Khám phá`, `Community Review`, `Phần thưởng của tôi`.
- Conditional workspaces: `Creator Studio`, `Thẩm định Resolver`, and
  `Quản trị Admin` based on the existing role/permission response.
- Account and wallet status at the bottom of the navigation on desktop, and
  in a compact menu on mobile.
- A page header containing a short title, one sentence of context, and only
  the primary action for that page.

The shell uses the existing route destinations from
`frontend/src/features/explore/PublicArea.tsx`; it does not introduce a new
router or duplicate role-specific routes.

### Backer and discovery surfaces

#### Editions feed `/reward`

Organize the page into three editorial shelves, in this order:

1. `Đang gây quỹ` — canonical on-chain funding campaigns only.
2. `Community review` — public advisory review, no pledge CTA.
3. `Đã duyệt, chờ kích hoạt` — approved but not yet canonical on-chain
   funding, with an explanation instead of a misleading empty funding state.

Each campaign card contains a cover/visual anchor, title, pitch, reward type,
funding progress when available, state label, and exactly one primary action.
Technical hashes and internal IDs move to an expandable details area.

Empty shelves use compact inline states, for example “Chưa có campaign đang
gây quỹ”, rather than large dashboard panels with excessive unused height.

#### Campaign detail `/reward/editions/:id`

Use a two-column desktop composition that collapses to one column on mobile:

- Main column: editorial story, product commitment, production plan, evidence
  preview, and a state-aware timeline.
- Side column: sticky campaign summary with goal, current pledge, deadline,
  reward, trust boundary, and the one allowed next action.

The side column must never show a pledge action for review, activation-pending,
refund, or private states. For a failed campaign it shows the refund state and
the Backer's claim action only when the entitlement is actually eligible.

Use progressive disclosure for hashes, storage metadata, review history, and
transaction diagnostics.

#### My rewards `/reward/my-rewards`

Present entitlements as a bookshelf of editions. Each item has a friendly
status, campaign title, reward type, and next action. Internal entitlement
codes remain available in a technical details disclosure, not as the headline.

## Role workspaces

### Creator Studio `/reward/creator`

Replace the long mixed page with a workspace overview and focused editing
surface:

- Pipeline strip: `Bản nháp`, `Đang thẩm định`, `Được duyệt`, `Đang gây quỹ`,
  `Sản xuất`, `Đã phát hành`.
- “Cần bạn làm” section with one task card per campaign. It must identify the
  reason, the responsible person, and a direct link to the exact wizard step.
- Campaign list cards showing current revision and review cycle count without
  duplicating one campaign for every historical review.
- Focused wizard route/panel for campaign information, funding goal, and
  release plan. The existing three logical steps remain, but the page uses a
  sticky stepper and preserves the active step after save/submit.

The Creator never sees Resolver-only controls. Review history is readable but
collapsed by default. `CHANGES_REQUESTED` returns the Creator to the current
editable revision, not to the first page by default.

### Resolver console `/reward/resolver`

Use a master-detail review workspace:

- Left queue: one row/card per campaign, grouped by `Cần mở review`, `Community
  review`, `Chờ kích hoạt`, and `Cần xử lý sau deadline`.
- Right detail: current snapshot, evidence, feedback, decision panel, and
  activity timeline.
- Historical revisions and decisions live under one collapsed “Lịch sử thẩm
  định” disclosure for the selected campaign.
- The decision panel shows only valid actions for the current state. Each action
  explains its consequence before the wallet transaction begins.
- Transaction feedback follows `Yêu cầu ký → Đã gửi → Đã xác nhận → Đã đồng
  bộ`, and never claims completion from a submitted hash alone.

When the queue is empty, show a compact success/idle state: “Không có hồ sơ
cần thẩm định” with the last synchronization time and a secondary refresh
action. Do not render a large empty card for every unrelated Resolver action.

### Admin console `/admin` and `/reward/admin`

Use an operations overview rather than placing every action in one vertical
column:

- Four compact KPI tiles: review queue, campaigns in funding, pending
  indexation, and refund/delivery exceptions.
- A lifecycle distribution chart derived from the loaded campaigns.
- An exceptions list with severity, owner, last update, and direct action.
- Administrative actions grouped under a secondary “Quản trị hệ thống” panel.

Admin must not expose a financial action merely because it is technically
available. Destructive or fund-moving actions require explicit context,
permission checks, and a confirmation that names the campaign and expected
state transition.

### Account and wallet `/account`

Keep authentication and wallet linking separate in the visual hierarchy:

1. Account session and role.
2. Linked wallet and active network.
3. Token and gas balances.
4. Reconnect/refresh diagnostics.

The page should show a single primary recovery action for each problem, not
several competing “reload” or “connect” buttons. Network errors must identify
whether the failure is API session, wallet provider, or chain/RPC state.

## State presentation model

All active campaign surfaces use the same presentation object:

```ts
type CampaignUiState = {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  summary: string;
  actor: 'creator' | 'resolver' | 'backer' | 'system' | 'none';
  nextAction?: string;
  technicalCode?: string;
};
```

The mapping is UI-only. It must not become a second source of truth or modify
the backend state machine. The primary text explains who acts and why:

```text
DRAFT                  → Bản nháp · Creator cần hoàn thiện
FROZEN                 → Đã khóa hồ sơ · Chờ gửi thẩm định
UNDER_REVIEW_PRIVATE   → Resolver đang thẩm định riêng
COMMUNITY_REVIEW       → Đang mở góp ý cộng đồng · Chưa mở pledge
CHANGES_REQUESTED      → Cần bổ sung · Creator cần cập nhật hồ sơ
APPROVED               → Đã duyệt · Chờ kích hoạt campaign
FUNDING                → Đang gây quỹ · Backer có thể ủng hộ
REFUND_ELIGIBLE       → Có thể nhận hoàn tiền · Backer cần claim
REFUNDED              → Đã hoàn tiền
```

Raw codes remain available in technical details and logs. Every state card
must answer: “Đang ở đâu?”, “Ai cần làm gì?”, and “Điều gì chưa được phép?”.

## Chart and data policy

Charts are explanatory components, not decoration. The first implementation
uses lightweight CSS/SVG primitives already compatible with the frontend;
adding a chart library is not part of this redesign unless the existing data
volume proves it necessary.

| Surface | Chart | Source | Empty behavior |
| --- | --- | --- | --- |
| Feed/detail | pledge vs goal progress | canonical/indexed campaign totals | show “Chưa có pledge” and goal text |
| Creator | campaign lifecycle timeline | campaign/review/evidence timestamps | show milestones without invented durations |
| Resolver | queue by lifecycle state | current Resolver list response | show counts as zero with idle message |
| Admin | lifecycle distribution and exceptions | loaded admin/indexer projections | show “Chưa đủ dữ liệu tổng hợp” |
| Backer | pledge outcome timeline | pledge receipt, refund, entitlement | show only known events |

No chart may imply investment return, profit, community voting power, or
financial completion when the API only has a status or an unindexed
transaction. Labels distinguish `on-chain`, `indexed`, and `application`
data where that distinction matters.

## Component boundaries

Create focused shared primitives only when they are used by multiple active
surfaces:

- `AppShell` and responsive navigation.
- `EditionStatusBadge` and state presentation mapping.
- `CampaignProgress` and `CampaignTimeline`.
- `NextActionCard`.
- `EditorialCampaignCard`.
- `ReviewQueue` and `ReviewHistoryDisclosure`.
- Lightweight chart primitives with accessible text summaries.

Keep business queries and wallet transaction hooks in their current feature
modules. Do not move contract calls into presentational components. Existing
feature files may be split only where a file is already responsible for both
page composition and unrelated state/data logic.

## Loading, error, and synchronization behavior

- Use page-level skeleton structure for the shell and card-level skeletons for
  secondary panels.
- Preserve loaded data while a refresh is in flight; show a small “Đang cập
  nhật” indicator instead of blanking the page.
- After a wallet transaction, show the lifecycle explicitly and invalidate the
  relevant TanStack Query keys only after the canonical receipt is available.
- If the indexer is behind, say so and provide “Kiểm tra lại trạng thái”; do
  not silently present stale application state as on-chain truth.
- All empty states include context and one useful next step.

## Accessibility and responsive behavior

- Preserve visible keyboard focus and semantic headings.
- Tabs, accordions, drawers, and queue selection expose correct ARIA state.
- Charts include a text summary and are not the only way to understand a
  number.
- Maintain readable contrast for the warm editorial palette.
- At widths below 768px, the shell becomes a compact top navigation, the
  campaign side column moves below the story header, and Resolver master-detail
  becomes queue-first navigation with a back affordance.
- Respect `prefers-reduced-motion`; motion is limited to page transitions,
  status feedback, and non-essential editorial hover states.

## Implementation phases

The redesign is intentionally split into independently testable phases:

1. **Foundation:** design tokens, app shell, status presentation, shared empty
   and transaction states.
2. **Backer/editorial:** Editions feed, campaign detail, community review, and
   library.
3. **Creator workspace:** pipeline overview, current-task cards, and focused
   wizard navigation.
4. **Resolver workspace:** compact queue, master-detail review, history
   disclosure, and transaction lifecycle presentation.
5. **Admin and account:** operational KPI/chart surfaces, exceptions, wallet
   diagnostics, and consistency pass.

Each phase must leave the app buildable and must run the relevant frontend
tests, lint, and build. Backend/API changes are added only when an existing
response lacks data required for a truthful surface; UI-only projections must
not be persisted as new financial state.

## Verification strategy

- Extend existing frontend script tests for route rendering, state-to-copy
  mapping, one-primary-action behavior, and empty states.
- Add component-level tests for chart summaries and state presentation.
- Add browser checks for desktop/mobile collapse of the campaign detail and
  Resolver queue.
- Keep `npm test`, frontend lint/build, backend Jest suites, and Foundry tests
  as regression gates.
- Verify at least one real flow per role against the local runtime: Creator
  submits, Resolver reviews, Backer pledges/refunds, and the indexer updates
  the projection.

## Explicit non-goals

- No database reset or campaign deletion as part of visual work.
- No new token, pledge, refund, payout, or sweep semantics.
- No automatic Resolver decisions or deadline automation.
- No fabricated analytics, social proof, ratings, or community vote counts.
- No blanket replacement of all existing copy or route URLs.
- No chart dependency installation until a phase proves the lightweight
  primitives insufficient.
