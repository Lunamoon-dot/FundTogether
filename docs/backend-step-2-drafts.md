# Backend Step 2 — Campaign and evidence drafts

This step adds private campaign drafts and one editable evidence draft per
milestone. Authentication now comes from the account session described in
[accounts and wallets](./accounts-and-wallets.md); a wallet is optional for drafts.

## Routes

All routes require the `ft_session` cookie.

| Method | Route | Behavior |
|---|---|---|
| `POST` | `/campaigns` | Create a campaign draft for the signed-in user |
| `GET` | `/campaigns` | List the signed-in user's private drafts, newest first |
| `GET` | `/campaigns/:campaignId` | Read a campaign draft; organizer only |
| `PATCH` | `/campaigns/:campaignId` | Replace campaign planning aggregate if the revision matches; organizer only |
| `POST` | `/campaigns/:campaignId/milestones/:milestoneIndex/evidence-draft` | Create the one current draft for that milestone |
| `GET` | `/campaigns/:campaignId/milestones/:milestoneIndex/evidence-draft` | Read the current draft; organizer only |
| `PATCH` | `/campaigns/:campaignId/milestones/:milestoneIndex/evidence-draft` | Replace draft content if the expected revision matches |

Campaign creation accepts required `title`, `description`, and at least one
milestone with a title, planned-work description and at least one acceptance
criterion. Text is trimmed; campaign/milestone titles are limited to 200
characters. Criterion IDs must be nonempty, at most 128 characters and unique
within each milestone. The service takes
`organizerUserId` from `request.account`, which `AuthGuard` populated from the
verified session. The API rejects unknown request fields, including a client
supplied owner.

Campaign and milestones are inserted in one database transaction. If either
insert fails, neither is committed. The server generates milestone UUIDs and
assigns contiguous zero-based indices from request array order; client-supplied
indices are rejected. Creation and detail reads return `revision`, `updatedAt`
and `milestones` in addition to the campaign summary. Detail reads order
milestones by index. Existing campaigns without milestone definitions return an
empty array. Submission remains a separate future slice.

Campaign editing sends the complete planning aggregate plus `expectedRevision`.
Existing milestones carry their returned `id`; new milestones omit it. Unknown
or duplicate milestone IDs are rejected. Retained IDs and creation dates are
preserved, while the server assigns indices from the new array order. The same
validation of text and criteria applies to both creation and editing.

The conditional campaign update checks owner, `draft` status, revision and absent
chain identifiers. It acquires the campaign row lock, advances revision and
updates the timestamp in the same transaction as milestone replacement. A stale
or no-longer-editable draft returns `409` with
`CAMPAIGN_NOT_EDITABLE_OR_STALE`; any later failure rolls back the whole update.
Campaigns with existing evidence return `CAMPAIGN_HAS_EVIDENCE` until their legacy
index references can be reconciled. Evidence creation takes the same parent row
lock to serialize it with planning edits. No chain or financial state is changed.

The frontend opens an edit wizard from campaign details. On a revision conflict,
entered data remains and saving is disabled. View latest fetches a separate
read-only comparison; replacing local input with it requires the explicit
"discard edits and use this version" action. There is no automatic retry or merge.

```json
{
  "title": "Clean water",
  "description": "Provide drinking water for the village",
  "milestones": [
    {
      "title": "Install filter",
      "description": "Install and operate the village filter",
      "acceptanceCriteria": [
        { "criterionId": "C1", "description": "Filter operates" }
      ]
    }
  ]
}
```

Campaign listing returns an array of `id`, `title`, `description`, `status`, and
`createdAt`. The owner filter comes exclusively from the authenticated session;
an owner supplied through query parameters does not change that filter. Only
rows with status `draft` are returned, ordered by `createdAt` then `id`
descending. This first slice returns the full draft list without pagination.

Evidence draft requests contain only `content`:

```json
{
  "content": {
    "report": {
      "summary": "Delivery completed",
      "performedFrom": "2026-10-01",
      "performedTo": "2026-10-02",
      "outcomes": []
    },
    "expenses": [],
    "documents": []
  }
}
```

The server stores `evidenceSchemaVersion: "0.1"` and starts at revision `1`.
`PATCH` requires the revision returned by the last read:

```json
{
  "expectedRevision": 1,
  "content": {
    "report": {
      "summary": "Delivery completed",
      "performedFrom": "2026-10-01",
      "performedTo": "2026-10-02",
      "outcomes": []
    },
    "expenses": [],
    "documents": []
  }
}
```

On a successful update revision increments. If another tab saved first, the
stale update receives `409 Conflict`; fetch the latest draft and reconcile it
before saving again. The database unique constraint enforces one current draft
for each campaign/milestone pair.

## Storage and authority

`campaign_evidence_drafts` stores report, expenses and documents as JSONB to
keep the evolving schema flexible. It also stores the schema version, owner,
campaign, milestone, revision and timestamps. The chain-specific package fields
are not part of a draft because this API does not yet load chain state.

Freeze should create a separate immutable package/version in a later step; it
must not change this draft row into a frozen package. Campaign reads here remain
organizer-only. A future public campaign read model should use a separate route.
