# Private draft deletion

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


## Behavior

Personal and organization campaign lists/details offer **Xóa bản nháp** when
the backend returns `canDelete: true`. The user must confirm the campaign title.
These lists now share one management dashboard: organization campaigns appear
in Campaign, with older unassigned drafts in the section immediately below.
Deleting removes the draft from the workspace and prevents subsequent campaign,
evidence and private-file API access. It is a soft delete: metadata, milestones,
evidence drafts and private objects remain stored. There is no restore UI or
automatic storage purge in this slice. Previously issued short-lived download
URLs retain their existing expiration.

The API is `DELETE /campaigns/:campaignId` with JSON
`{ "expectedRevision": 1 }`. It requires an authenticated personal organizer or
current organization OWNER. Body validation is strict. The operation increments
the revision and sets the existing metadata status to `deleted`; no migration
or blockchain transaction is required.

## Eligibility and concurrency

The same eligibility predicate drives API `canDelete` and the conditional write:

- Status is `draft`; chain ID, contract address and on-chain campaign ID are null.
- No frozen submission plan, chain projection, review, linked replacement history
  or frozen evidence package exists.
- The revision still matches the version confirmed by the user.

Deletion locks the campaign row, as submission preparation does. An organization
membership is rechecked and locked before the write. A changed revision or a
prepared/submitted campaign returns 409. Missing/deleted drafts return 404;
unauthorized access remains forbidden. Repeated deletion does not change data
again. The client blocks duplicate clicks, checks the current account and clears
the deleted draft's list/detail/evidence cache. A timeout requires refreshing
state before retrying; it is not evidence that the server did not delete.

`submission_prepared` is intentionally protected even without an indexed chain
ID: the immutable plan may already be awaiting a wallet transaction. Published
campaigns, escrow, refund rights and chain projections cannot be deleted here.

## Verification on 2026-10-05

- Backend and frontend production builds and frontend lint passed.
- Read-only execution of the actual list/detail service against PostgreSQL
  confirms `canDelete: false` for published `dfa` and submission-prepared
  `dsadfa`/`cxzc`. No user campaign or private object was deleted.
- Authenticated browser confirmation/deletion remains to be exercised with a
  disposable draft saved without preparing submission. This change did not add
  or run behavioral tests.
