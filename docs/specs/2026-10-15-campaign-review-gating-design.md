# Campaign Review Gating Design

## Goal

Separate private Resolver intake from public community review so a Creator submission is not visible to Backers until a Resolver explicitly opens community review.

## Scope

This change applies only to FundTogether (`COMICS_ARTBOOK`). The legacy Reward workflow continues to use its existing `UNDER_REVIEW` status and behavior.

## State machine

```text
DRAFT
  │ Creator saves and locks the immutable commitment
  ▼
FROZEN
  │ Creator submits to Resolver
  ▼
UNDER_REVIEW_PRIVATE
  │ Resolver explicitly opens community review
  ▼
COMMUNITY_REVIEW
  │ Resolver decides
  ├── APPROVED
  ├── CHANGES_REQUESTED → DRAFT
  └── REJECTED → STOPPED
```

`UNDER_REVIEW_PRIVATE` is the Resolver queue. It is never returned by public Campaign endpoints. `COMMUNITY_REVIEW` is the public, non-pledge review surface. `APPROVED` remains the only status eligible for the later publication/funding flow.

## Required behavior

- Creator submission changes Campaign `FROZEN` to `UNDER_REVIEW_PRIVATE`.
- A Resolver-only action changes `UNDER_REVIEW_PRIVATE` to `COMMUNITY_REVIEW`.
- Resolver decision is accepted only from `COMMUNITY_REVIEW`.
- Community review and sample access are allowed only for `COMMUNITY_REVIEW` and `APPROVED` Campaign campaigns.
- Public review listing and preview expose `COMMUNITY_REVIEW`, never `UNDER_REVIEW_PRIVATE`.
- Community review does not open pledge or move funds.
- No automatic 24-hour deadline is introduced; Resolver controls when to open and decide.
- Existing Campaign rows with status `UNDER_REVIEW` are migrated to `COMMUNITY_REVIEW` because they were already publicly exposed under the previous behavior. Legacy non-Campaign rows remain unchanged.
- Review outcomes remain `APPROVED`, `CHANGES_REQUESTED`, and `REJECTED`; the resulting campaign statuses remain `APPROVED`, `DRAFT`, and `STOPPED` respectively.
- A campaign keeps one canonical `reward_campaigns` row across all correction cycles. Each new frozen submission replaces the current snapshot and increments `revision`; prior Resolver decisions remain append-only history in `reward_reviews`.
- Resolver queue rendering is one card per campaign. The card shows the current status/revision; prior review decisions are a collapsed history, never separate queue cards.
- Feedback remains stored for audit, but active feedback is scoped to the current commitment hash and current snapshot evidence hashes. Feedback from an older snapshot is visible only in review history and cannot be submitted against the current round.

## UI behavior

- Creator sees a waiting message for `UNDER_REVIEW_PRIVATE` and no public/community link.
- Resolver sees an explicit `Mở community review` action for `UNDER_REVIEW_PRIVATE`.
- Resolver sees community feedback and decision controls only for `COMMUNITY_REVIEW`.
- Resolver sees one current campaign card with a collapsed prior-review history; a correction cycle never creates a duplicate campaign card.
- Backer feed labels `COMMUNITY_REVIEW` as “Đang lấy ý kiến cộng đồng — chưa được Resolver duyệt” and does not show a pledge action.
- Existing approved/funding copy remains unchanged except for status labels needed to distinguish the review phases.

## Data and security boundaries

- The status remains database-backed and server-authoritative.
- The new Resolver transition requires the existing Resolver role guard and locks the campaign row in the service transaction.
- Public endpoints fail closed for `UNDER_REVIEW_PRIVATE`.
- Frozen commitment, private samples, and identity data remain protected by the existing snapshot and storage ACLs.

## Acceptance criteria

1. A newly submitted Campaign campaign is `UNDER_REVIEW_PRIVATE`, absent from public review endpoints, and visible in the Resolver queue.
2. A non-Resolver cannot open community review.
3. A Resolver can open community review exactly once from the private state.
4. After opening, public review endpoints return the campaign as `COMMUNITY_REVIEW`, while pledge/funding endpoints remain empty.
5. Resolver decision is blocked in the private state and succeeds in the community state.
6. A `CHANGES_REQUESTED` cycle reuses the same campaign ID, increments revision, and exposes only the new snapshot's feedback in the active round.
7. Existing legacy `UNDER_REVIEW` tests and transitions remain valid.
