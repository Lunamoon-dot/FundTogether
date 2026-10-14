# FundTogether Editions: review, activation, and funding surfaces

## Decision

Keep the existing database campaign statuses and split public behavior by
surface. No database reset and no new status column are required for this
change.

```text
DRAFT → FROZEN → UNDER_REVIEW
                    ├─ public review preview + advisory feedback
                    └─ Resolver decision
                         ├─ CHANGES_REQUESTED → DRAFT
                         ├─ REJECTED → STOPPED
                         └─ APPROVED → activation pending
                                      └─ canonical chain campaign state FUNDING
                                         → funding surface accepts pledge
```

`UNDER_REVIEW` is not a funding state. `APPROVED` is not a funding state
either: it means the reviewed commitment can be activated. The canonical
chain snapshot is the source for whether an approved campaign is actually
open for pledge.

## Public surfaces

The Editions entry page exposes three clearly separated sections:

1. **Đang gây quỹ** — only campaigns with an approved database commitment,
   canonical Editions binding, and chain state `FUNDING` (`state === 0`).
   These cards may link to pledge actions.
2. **Đang thẩm định** — database status `UNDER_REVIEW`. The public can read
   the redacted commitment and submit attributable advisory feedback. No
   pledge action is shown or accepted.
3. **Đã duyệt, chờ Creator kích hoạt** — database status `APPROVED` without a
   canonical funding binding. This explains why a Resolver decision exists but
   pledge is not available yet.

The existing detail route remains available for all public preview statuses.
It must state the surface explicitly and only render pledge controls when the
canonical chain snapshot is in funding state.

## Viewer behavior

- **Backer/community:** can submit feedback only while the campaign is
  `UNDER_REVIEW` or `APPROVED`; the UI labels it as advisory, not a vote or
  approval. Pledge controls appear only for canonical funding campaigns.
- **Creator:** sees the current review/activation status and feedback as a
  read-only panel. The creator does not see a community submission form on
  their own campaign page.
- **Resolver:** sees the private sample/evidence controls and full feedback
  review panel, then makes the only review decision.

Feedback remains off-chain in PostgreSQL, attributable to its author and
visible to the author, Creator, and Resolver according to the existing API
policy. It never changes the campaign status or moves funds.

## API shape

Keep the redacted detail endpoint and add explicit list surfaces rather than
overloading one ambiguous list:

- `GET /v1/reward/public/editions/funding`
- `GET /v1/reward/public/editions/review`
- `GET /v1/reward/public/editions/activation`
- `GET /v1/reward/public/editions/:id`

The funding list is derived from canonical indexed chain bindings, not from a
client-provided status. Existing campaign rows and indexed history are
preserved; the new endpoints are read-model queries only.

## Error and safety rules

- Public preview data remains redacted; private samples, object keys, wallet
  links, IP declarations, and Resolver decision reasons are not exposed.
- A stale or missing indexer binding is not funding-visible.
- Feedback is still rejected outside `UNDER_REVIEW`/`APPROVED`.
- No contract, token, pledge, refund, or entitlement state is changed by this
  UX split.

## Verification

- Backend HTTP tests prove each list surface contains only its intended
  campaigns and that an unbound `APPROVED` campaign is not funding-visible.
- Frontend tests prove section labels and viewer-specific feedback controls.
- Existing review, delivery, indexer, frontend test, build, and lint suites
  remain green.
- The current local campaign remains intact; verification must not reset the
  development database or Anvil state.
