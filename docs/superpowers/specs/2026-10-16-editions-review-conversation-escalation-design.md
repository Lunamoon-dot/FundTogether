# Editions Review Conversation and Escalation Design

## Status

Draft for user review. This document defines the product boundary before an implementation plan is written.

## Goal

Make Editions review lifecycle-aware:

1. Before funding, a `COMMUNITY_REVIEW` campaign accepts advisory feedback against the current frozen snapshot.
2. After a campaign reaches a canonical successful funded/production phase, a confirmed backer can discuss production and delivery concerns with the Creator.
3. If that exchange does not resolve the concern, the Backer can escalate it to a Resolver.
4. The Resolver reviews the complete context, asks the Creator for clarification when needed, and records a separate formal outcome when the issue affects review, production approval, dispute or refund policy.

Creator responses to pre-funding feedback are not new self-feedback records. They are revision-linked responses that may link to one or more concrete Backer/Community feedback records while keeping the written response general.

## Product decision

Resolver is an accountable reviewer and escalation authority, not a hidden moderator of every conversation and not an automatic financial controller.

```text
COMMUNITY_REVIEW (before funding)
  Community/Backer submits advisory feedback
  Creator reads feedback and may respond when submitting a revision
  Resolver uses the feedback and Creator response in the review decision

CANONICAL FUNDED / PRODUCTION PHASE (after funding)
  Confirmed Backer ↔ Creator review conversation
  Backer escalates unresolved concern
  Resolver reviews context and works with Creator
  Formal decision remains a separate audited action
```

## Scope

This applies only to FundTogether Editions (`COMICS_ARTBOOK`). It does not reintroduce legacy charity, physical fulfilment, shipping, inventory, or the legacy Reward dispute UI.

The scope includes:

- advisory feedback on the current pre-funding review snapshot;
- Creator revision responses linked to selected feedback records;
- post-funding Backer-Creator review threads;
- Resolver escalation and resolution records;
- role-aware API and UI surfaces;
- audit-safe snapshot and canonical funding gates.

## Non-goals

- Building a general-purpose social chat system.
- Letting Creator create ordinary feedback against the Creator's own campaign.
- Treating feedback count, thread activity, or an escalation as a vote.
- Automatically moving funds, paying out, refunding, or changing contract state from a message.
- Requiring Creator to answer every feedback item individually.
- Allowing edits or deletion of historical feedback, messages, Creator responses, or Resolver outcomes.

## Lifecycle modes

### Mode A: Community Review before funding

Entry condition: the Editions campaign is in `COMMUNITY_REVIEW`, has a valid frozen snapshot and commitment hash, and has not opened a canonical pledge flow.

Behavior:

- An authenticated non-Creator may submit a bounded `COMMENT` or `ISSUE` against a current commitment or evidence hash.
- Creator and Resolver can see all active feedback for the campaign.
- Other users see only their own feedback, according to the existing privacy rule.
- Creator does not submit through the feedback endpoint.
- Creator may publish one general response when sending a revised campaign snapshot for review.
- The response may link to zero or more existing feedback IDs. These links mean “this response relates to these reviews,” not “each review is resolved.”
- Resolver uses feedback, the Creator response, the new snapshot and review history to approve, request changes or reject.
- Feedback does not open funding, lock money, or alter the Resolver decision automatically.

The current feedback target remains snapshot-scoped. Feedback attached to an older snapshot remains immutable audit history and is not silently treated as active feedback for a new snapshot.

### Mode B: Backer Review after canonical funding success

Entry condition: the campaign has reached the contract-defined successful funded/production phase, and the Backer's pledge has a canonical receipt plus an idempotent indexer projection and active entitlement.

Behavior:

- A confirmed Backer can open a review thread about a current commitment, production evidence, final PDF or delivery concern.
- Creator and the opening Backer can exchange messages in the thread.
- Resolver is not injected into every ordinary thread.
- The Backer can escalate an unresolved thread with a reason and optional evidence reference.
- Escalation exposes the complete immutable thread and relevant current snapshot/evidence to Resolver.
- Resolver can request a Creator response, add an explanation, dismiss an unsupported escalation, resolve the review, or route the issue into the existing formal dispute/financial policy boundary if applicable.
- Only the formal Resolver action and contract/indexer transitions can affect financial eligibility or state.

The exact contract state must be resolved through existing operation/projection policy during implementation. The UI must not enable this mode merely because a displayed amount reached the goal or because a wallet transaction was submitted.

## Role and permission matrix

| Action | Community user | Confirmed Backer | Creator | Resolver |
|---|---:|---:|---:|---:|
| Read public Community Review | Yes | Yes | Yes | Yes |
| Submit pre-funding feedback | Yes | Yes | No | Policy decision; not required for review |
| Read all pre-funding feedback | No, own only | No, own only unless separately public | Yes | Yes |
| Send Creator revision response | No | No | Yes | No |
| Open post-funding review thread | No | Yes | No | No |
| Reply in Backer-Creator thread | No | Yes, own thread | Yes, campaign owner | Only after escalation/context access |
| Escalate thread to Resolver | No | Yes, own thread | No | N/A |
| Read escalated thread | No | Participants | Yes | Yes |
| Record formal review/dispute outcome | No | No | No | Yes, with reason and role guard |

The Resolver role is scoped to review authority. It must not be inferred from a client-provided address, and no message endpoint may bypass the existing authenticated user and role checks.

## Creator response semantics

Creator response is a separate append-only record created at revision submission, not a feedback row authored by the Creator.

The submission surface should contain:

- a general response body, for example: “Cảm ơn mọi người đã góp ý. Mình đã rà soát lại kế hoạch và bổ sung tài liệu cho revision này.”;
- a multi-select of existing feedback records, rendered as clickable chips/cards containing human-readable excerpts;
- the new revision/snapshot reference, assigned server-side;
- no per-feedback resolution status.

The server validates that every linked feedback ID belongs to the campaign and is visible in the current or immediately preceding review context. A response cannot link to another campaign, alter the feedback body, or claim a Resolver decision.

When the Creator submits a correction/revision for review, the response is stored in the same transaction as the new frozen snapshot or submission record. A normal draft save does not require the response. This avoids orphan responses and makes the review package self-contained.

## Post-funding thread and escalation semantics

Recommended thread states:

```text
OPEN
  ↓ Creator replies or Backer adds context
AWAITING_CREATOR_RESPONSE
  ↓ unresolved by Backer
ESCALATED_TO_RESOLVER
  ↓ Resolver asks for more information
AWAITING_CREATOR_RESPONSE
  ↓ Resolver decision
RESOLVED / DISMISSED / FORMAL_DISPUTE
```

The implementation should not create a second financial state machine. `FORMAL_DISPUTE` is only a handoff to the existing Editions financial policy and contract-backed workflow; it is not a free-form message status that moves funds.

Messages and escalation metadata are immutable. A later correction is a new message or new Resolver outcome, never an update that erases the original record.

## Data model direction

Do not overload the existing `editions_feedback` row as a chat message. Keep it as an attributable observation/report with its current target-hash validation.

Add the smallest separate records needed:

1. `editions_creator_responses`
   - `id`, `campaign_id`, `creator_user_id`;
   - `body`, `revision`, `commitment_hash` or snapshot reference;
   - `created_at`.
2. `editions_creator_response_feedback`
   - `response_id`, `feedback_id`;
   - unique pair constraint and campaign consistency validation in the service.
3. `editions_backer_review_threads`
   - `id`, `campaign_id`, `backer_user_id`, target/snapshot reference;
   - `status`, `created_at`, `updated_at`, optional `escalated_at`.
4. `editions_backer_review_messages`
   - `id`, `thread_id`, `author_user_id`, role-at-write, body, created_at;
   - append-only ordering and no update/delete API.
5. `editions_review_escalations`
   - `id`, `thread_id`, `opened_by`, reason, status;
   - Resolver assignment/outcome/reason/timestamps;
   - optional linkage to the formal dispute record only after policy review.

Before migration, audit whether the existing `rewardDisputes` table is legacy-only or safe for Editions. Reuse is allowed only if its authorization, status semantics and contract linkage match this design; otherwise keep an Editions-specific escalation table rather than silently changing legacy behavior.

## API direction

Preserve the existing feedback endpoints for Mode A, with response data extended only after authorization is defined.

Proposed endpoints:

- `GET /v1/reward/editions/campaigns/:id/feedback`
  - returns role-appropriate feedback and Creator responses;
  - Resolver and Creator receive all current active feedback plus audit-linked records they are allowed to see.
- `POST /v1/reward/editions/campaigns/:id/submit-review`
  - accepts the existing revision token plus an optional/required-on-resubmit Creator response and linked feedback IDs;
  - stores snapshot and response atomically.
- `POST /v1/reward/editions/campaigns/:id/review-threads`
  - Backer-only after canonical funded/entitlement gate.
- `GET /v1/reward/editions/review-threads/:threadId`
  - participant access; Resolver access after escalation.
- `POST /v1/reward/editions/review-threads/:threadId/messages`
  - Backer/Creator participant access; Resolver access according to escalation state.
- `POST /v1/reward/editions/review-threads/:threadId/escalate`
  - opening Backer only; idempotent for the same unresolved escalation where possible.
- Resolver-only escalation list/detail and outcome endpoints under the existing Resolver module boundary.

All endpoints must use server-side role and campaign ownership checks, validate current snapshot/entitlement state, and return explicit statuses rather than treating a submitted request as a completed indexed or financial transition.

## UI direction

### Creator Studio

- `COMMUNITY_REVIEW` task opens the campaign feedback area.
- Existing feedback cards show readable author/time/type/target information.
- When Creator edits and resubmits, show “Phản hồi góp ý cho revision này”.
- Feedback chips link to the selected Backer/Community reviews.
- The response editor is general text; there is no forced one-to-one answer list.

### Backer campaign view

- Before funding: show advisory Community Review feedback form and no escalation CTA.
- After canonical funding: show “Trao đổi với Creator” for eligible Backers.
- Show thread status and “Yêu cầu Resolver xem xét” only after a real unresolved exchange.
- Keep funding, entitlement, download, and financial status surfaces separate from the conversation.

### Resolver Console

- Show escalated threads as actionable review cases, not ordinary feedback noise.
- Display the original thread, linked commitment/evidence, Creator responses, current snapshot, and canonical funding/entitlement context.
- Provide a separate formal outcome panel with mandatory reason.
- Do not let a message or simple acknowledgment silently mutate contract or payout state.

## Security, consistency and fund-safety rules

- Feedback, responses, messages and escalation outcomes are append-only audit records.
- Current target hashes and snapshot references are validated server-side.
- A backer gate requires canonical receipt, indexed pledge and active non-refunded entitlement; wallet-submitted is insufficient.
- A post-funding thread cannot be opened for a campaign or entitlement on an orphaned indexer stream.
- Resolver authorization is role-backed and independent of a client-supplied wallet address.
- No message operation moves funds. Contract state remains the financial authority.
- Duplicate retries must be idempotent for submissions and escalation creation where a stable request key is available.
- Private samples and final PDF bytes remain behind existing storage authorization; conversation records do not expose private object keys.

## Verification and acceptance criteria

### Pre-funding

1. A non-Creator can create feedback only on `COMMUNITY_REVIEW`/approved current targets according to the existing policy.
2. Creator cannot create feedback through the feedback endpoint.
3. Creator can submit one general response linked to zero or more current feedback IDs while creating a new revision.
4. The response is stored with the revision and cannot modify or delete linked feedback.
5. Resolver can read the feedback, response, old snapshot and new snapshot before deciding.
6. A response does not open funding or change contract state.

### Post-funding

7. A submitted transaction alone cannot open a thread.
8. A canonical indexed pledge with an active entitlement can open a Backer-Creator thread after the funded/production gate.
9. A non-participant cannot read or post to the private thread.
10. Backer can escalate; Creator cannot self-escalate the thread on behalf of the Backer.
11. Resolver receives the complete immutable context and can request Creator clarification.
12. Resolver outcome is recorded separately from messages and does not mutate financial state unless an existing explicit policy/contract transition is invoked.
13. Refunded, orphaned, or non-canonical entitlements cannot open new post-funding threads.

### Regression

14. Existing Community Review feedback, Creator read-only visibility and Resolver review tests remain valid.
15. Existing funding, indexer, entitlement, PDF release, dispute and refund tests remain green.
16. Frontend route/build/lint and backend migration/build/Jest suites pass.

## Implementation staging recommendation

Implementation should be split into independently verifiable stages:

1. **Contract and lifecycle policy audit** — identify exact canonical funded/production gate and safe entitlement statuses; no schema changes.
2. **Creator response model** — migration, server validation, atomic revision submission, API DTOs and tests.
3. **Creator/Resolver UI** — show linked feedback and revision response without changing funding surfaces.
4. **Backer-Creator threads** — migration, authorization, append-only messages, participant tests and UI.
5. **Escalation/Resolver case handling** — escalation records, Resolver actions, formal outcome boundary and audit tests.
6. **End-to-end verification** — fresh migration, canonical indexer scenarios, refund/orphaned entitlement scenarios, frontend SSR/UI tests and manual browser flow.

Each stage must preserve existing on-chain state authority and must not be implemented by treating the current `editions_feedback` table as a general chat table.

## Open product decision for review

This design assumes that pre-funding Creator responses are created when submitting a new revision, while post-funding Backer-Creator threads are the full conversational workflow. It also assumes that “funded successfully” means the canonical contract/indexer transition into the production-eligible phase, not merely a displayed funding percentage.
