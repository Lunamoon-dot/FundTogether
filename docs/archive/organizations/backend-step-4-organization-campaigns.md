# Backend step 4 — Organization-owned campaign drafts

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


Updated: 2026-10-04

## Ownership and authority

```text
Authenticated account userId
  -> organization_members: OWNER
  -> campaign_metadata.organizationId
  -> campaign planning and evidence draft APIs
```

Organization ownership is application metadata. It does not grant the wallet an
organizer role in the contract, publish a campaign or move funds.

campaign_metadata now has organizationId and createdByUserId. Organization
campaigns set organizationId from the route and createdByUserId from session;
legacy organizerUserId is null for these campaigns. Creator identity never
overrides organization membership. Personal campaigns retain organizerUserId
and null organizationId; their creator is also recorded for new requests.

Migration 0005_campaign_organization_ownership adds nullable FKs and an
organization lookup index. It copies existing nonnull organizerUserId to
createdByUserId for audit history, leaving organizationId null. Historical rows
without an organizer retain null creator. No draft is transferred to a newly
created organization and no ownership transfer endpoint exists in this slice.

## API

All routes require the existing ft_session cookie. Writes require the configured
browser Origin. Organization IDs in path parameters must be UUIDs.

| Route | Behavior |
|---|---|
| POST /organizations/:organizationId/campaigns | Check OWNER membership, atomically create campaign + ordered milestones |
| GET /organizations/:organizationId/campaigns | Check OWNER membership, list only that organization's draft campaigns |
| POST /campaigns | Retain personal draft creation |
| GET /campaigns | List personal drafts only (organizationId null) |
| GET /campaigns/:campaignId | Personal owner or organization OWNER, depending on campaign ownership |
| PATCH /campaigns/:campaignId | Same authorization; retain expectedRevision and draft/chain/evidence edit restrictions |

Creation reuses the strict campaign evidence-planning schema: title, description,
and nonempty milestones with title, description and acceptanceCriteria. Body
fields organizationId, createdByUserId, organizerUserId and roles are rejected.
Campaign summaries/details include organizationId and createdByUserId.

Missing OWNER membership returns 403, including unavailable organization IDs;
an OWNER with no campaigns receives []. Invalid body/path returns 400.
Campaign/evidence access checks retain 404 for missing campaign and 403 for
unauthorized ownership. Only OWNER is currently supported; do not infer future
CAMPAIGN_MANAGER or EVIDENCE_EDITOR permissions from their proposed names.

## Implementation map

- OrganizationCampaignsController handles scoped routes and Zod parsing.
- CampaignsService accepts an internal organizationId, checks membership and
  writes within the existing transaction. Creation takes a shared membership
  row lock so conflicting membership writes cannot occur before commit.
- campaignAccessCondition centralizes the SQL rule: personal owner for null
  organizationId, otherwise an existing OWNER membership in that organization.
  Campaign reads/writes and evidence queries use this rule at query time.
- EvidenceAccessService keeps explicit ownership error responses and recognizes
  organization ownership. Evidence creation still locks the parent campaign to
  serialize against plan edits; updates retain revision conflict protection.
- Evidence organizerUserId remains the evidence creator field for this slice;
  it does not grant access to an organization campaign without membership.

## Verification and next step

Migration generation/application to local PostgreSQL and backend build passed.
The focused campaign/access/evidence unit suites pass: 3 suites, 9 tests.
scripts/organization-campaign-smoke.cjs passes 22 HTTP/PostgreSQL checks using
two temporary accounts. These cover OWNER creation/read/update, outsider denial,
creator denial after membership removal, personal/org list separation, persisted
reads after login, stable milestone IDs and stale revision rejection (409).
The script removes its own temporary accounts, organization and campaign rows.
These checks do not exercise simultaneous requests or membership-lock contention.

Frontend routes now support list, creation, detail and editing:
/campaigns, /campaigns/new, /campaigns/:id and /campaigns/:id/edit under the
organization workspace. Detail displays ordered milestones and acceptance
criteria; /milestones selects a campaign to inspect. Editing reuses the wizard
and expectedRevision protection. Query keys include account and organization;
detail reads also check organizationId against the current workspace. Failed
saves preserve the form; successful saves refresh the list and open detail.
Frontend build/lint passed. Authenticated browser interactions remain unverified.
Organization evidence routes now select a campaign, then a saved milestone:
/evidence, /evidence/:campaignId and /evidence/:campaignId/milestones/:milestoneId
under the workspace. Campaign detail also links directly to each milestone's
evidence form. The URL uses the saved milestone ID; the API still uses its index.
Only the explicit Evidence draft not found response opens a new form; other
errors show a retry state. The editor supports summary, work dates and results
for saved acceptance criteria. Existing expenses, documents, document references
and outcomes outside the current criteria are preserved when editing the report.
Create/update uses existing session/organization authorization and revision APIs.
Conflict responses retain input and require explicitly loading the latest saved
version before continuing; loading it prompts before replacing entered content.
Draft queries are scoped by account, organization, campaign and milestone.
Frontend build/lint passed for this slice; no tests were added/run in this slice
and authenticated browser saving remains unverified. API routes still identify
drafts by milestone index, but creation now requires the saved milestoneId and
checks campaign/index/ID under the campaign lock. The evidence-upload smoke
verifies stale/foreign IDs and concurrent plan edits versus first draft creation.
Private upload/download is now connected to saved drafts; see backend step 5.
Expense editing, freeze and submission remain separate slices.
Contract organizer addresses, wallet linking, publication and indexing remain
separate work.
