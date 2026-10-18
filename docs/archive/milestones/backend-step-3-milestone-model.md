# Backend Step 3 — Campaign milestone draft model

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


The initial slice added database structure. The next slice now saves campaign
and milestones together through `POST /campaigns`, and returns the aggregate
through the organizer-only detail route. The frontend wizard can save a draft
and open its persisted details. Aggregate editing now uses revision locking;
submission remains TODO.

## Relationship

```text
campaign_metadata (one campaign draft)
  id, organizerUserId, title, description, revision
       |
       +-- campaign_milestone_drafts (many milestone drafts)
             id, campaignMetadataId, milestoneIndex
             title, description, acceptanceCriteria
```

Milestone ownership is inherited from the campaign. API authorization
checks the authenticated account against the campaign owner; the milestone
does not store a second owner that could become inconsistent.

## Fields and constraints

| Field | Meaning |
|---|---|
| `id` | Stable local UUID, distinct from an on-chain identifier |
| `campaignMetadataId` | Required foreign key to the campaign draft |
| `milestoneIndex` | Nonnegative integer; 0 is first, 1 is second |
| `title` | Required text, maximum 200 characters |
| `description` | Optional details about the planned work |
| `acceptanceCriteria` | JSONB array of `{ criterionId, description }`; defaults to empty for an unfinished draft |
| `createdAt`, `updatedAt` | Creation and last-update timestamps |

The unique index on `(campaignMetadataId, milestoneIndex)` prevents duplicate
positions within one campaign. The DB checks a nonnegative index and an array
for criteria. TypeScript's `$type` describes JSON to the compiler; it does not
validate criterion objects at runtime. The create API validates trimmed
text, criterion shape and unique criterion IDs within each milestone. It derives
contiguous milestone order from the request array. Although storage permits
unfinished rows, creation currently requires descriptions and nonempty criteria.

Criterion IDs must remain stable when descriptions are edited, because evidence
outcomes refer to `criterionId`. Criteria are planning text at this stage, not
approved criteria or an on-chain commitment. A later publish flow must define
their immutable representation and commitment before verifier use.

`campaign_metadata.revision` starts at 1, including existing campaign rows. The
edit API uses it for optimistic locking of the campaign and its
milestones in one transaction. Adding the column alone does not enable locking.
Updates must explicitly advance revision and updatedAt; the DB defaults apply
only at insertion.

## Migration and existing data

`0002_campaign_milestone_drafts.sql` adds the milestone table and campaign
revision. It does not invent milestones for old campaigns, move or delete
evidence, or assign financial values. Existing campaigns initially have no
milestone definitions.

Evidence drafts currently reference campaign UUID plus an index string. Their
API still accepts any nonnegative index; this slice does not change that.
Before enforcing a milestone foreign key or existence check, inspect legacy
evidence and define how the organizer reconciles it with real milestones.
Do not silently create placeholder milestones, renumber existing evidence or
delete evidence as part of that transition.

Budget, funding goal/deadline, bond, chain criteria hash and review state remain
outside this planning model. Chain financial rules remain authoritative.
