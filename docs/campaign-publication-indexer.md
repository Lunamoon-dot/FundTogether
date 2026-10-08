# Campaign publication and local event indexer

Updated: 2026-10-04. Scope: the configured Anvil deployment, chain 31337,
MockUSDC with six decimals. This is local integration, not production finality.

## User journey

The target MVP journey starts with system checks of campaign dossier, integrity,
budgets and criteria. Organizers correct findings before submitting a complete
dossier to an authorized resolver, who may be platform staff. Resolver approval
is required before organizer publication; passing system checks alone is
insufficient. Campaign review and unresolved-dispute arbitration are two
responsibilities of this role. See [the confirmed workflow](./verification-and-disputes.md).

The local implemented path below checks budgets, frozen-plan/criteria identity,
deployment and bond custody. A complete dossier/report checking pipeline and
campaign request-changes/rejection/resubmission are not implemented; this local
path must not be described as the complete target workflow.

```text
Organizer: saved/frozen draft -> criteria committed -> bond locked in escrow
Resolver: linked account -> #/review -> inspect -> sign approveCampaign
Organizer: organization campaign detail -> sign publishCampaign
Contract: CampaignPublished -> confirmed block -> indexer -> PostgreSQL
Public: #/ -> campaign card -> #/campaigns/:metadataId
```

The resolver account must have an explicitly provisioned RESOLVER application
role and the contract's resolver wallet linked through SIWE on the configured
chain. ADMIN alone and a browser connection grant no review authority.
The review queue and direct DRAFT detail both require matching criteria and a
fully locked bond. The backend does not sign approval or publication.

Approval/publication do not transfer another bond. The organizer's already
locked tokens remain in contract custody, subject to existing financial rules.
Failed/repeated transactions revert under contract state guards. Publication
requires APPROVED, locked bond and an unexpired deadline. Cancellation/bond
return still use the contract rules; this slice adds no cancellation UI.

The UI distinguishes a sent transaction, successful confirmed receipt, and an
indexed state. Pending hashes survive reload. Matching completed chain state
reconciles an obsolete hash. Explicit discard/retry checks fresh identity and
chain state; the UI explains that an old pending transaction may still mine and
a competing transaction may revert with extra gas. A cached campaign identity must
match fresh authorization and the current keyed on-chain campaign before signing.
The public API requires an indexed canonical publication event; an APPROVED
campaign or successful receipt alone is insufficient.

## Data and synchronization

| Location | Responsibility |
|---|---|
| Contract | Bond/escrow, organizer authority, contributions and financial state |
| Application tables | Account ownership, organization, frozen draft and milestone metadata |
| indexer_streams | Deployment-specific durable checkpoint, block hash and synchronization phase |
| chain_events | Decoded event ledger and canonical/orphaned status |
| campaign_chain_projection | Block-pinned chain snapshot and verified metadata association |
| MinIO | Private evidence files; the public campaign API does not return them |

The stream identity contains chain ID, contract address and genesis hash. Before
reads the service verifies genesis, chain, contract/token bytecode hashes and
supportedToken against the shared manifest. A reset/redeployment fails closed;
outstanding submission plans are never silently rebound.

Every two seconds the worker reads at most 100 confirmed blocks. The local
manifest's one-confirmation policy permits the mined head. It starts at block
zero because the existing manifest has no deployment block, then resumes its
persisted checkpoint. No Redis/BullMQ dependency was added.

```text
Acquire PostgreSQL transaction advisory lock for this stream
  -> check previous checkpoint hash
  -> fetch logs and validate block hashes
  -> insert ledger rows keyed by stream + tx hash + log index + block hash
  -> read touched campaigns at the batch-end block
  -> verify frozen plan and campaignForDraft association
  -> validate batch/checkpoint hashes again
  -> commit ledger + projections + checkpoint atomically
```

Retries/replayed logs update the same incarnation rather than incrementing
financial totals. Snapshots read contract totals; two worker processes serialize
commits through the database lock. A failed RPC or database write does not
advance the checkpoint. Worker retry retains the failure/rebuild phase.

A changed checkpoint hash marks old events noncanonical and rebuilds this
deployment from zero. Orphaned events remain for audit/debugging. Public/review
queries validate the checkpoint hash and reject inconsistent, errored or
rebuilding data with HTTP 503. A partial initial catch-up returns its indexed
checkpoint and `syncing`; a partial reorg rebuild stays unavailable until complete.

Unpublished cancelled campaigns remain private. Previously published campaigns
remain public history after cancellation. Public metadata must match the frozen
title, ordered budgets and recomputed milestone criteria commitments. Unkeyed
on-chain campaigns cannot borrow another draft's metadata.

## API

- GET /public/campaigns?limit=20&offset=0: public published items and sync checkpoint.
- GET /public/campaigns/:metadataId: indexed public detail; unpublished/mismatched returns 404.
- GET /review/access: authenticated staff roles and resolver-wallet eligibility.
- GET /review/campaigns: resolver-only bonded DRAFT queue.
- GET /review/campaigns/:metadataId: resolver-only matching detail, including approved state for retry reconciliation.
- GET /campaigns/:metadataId/publication: owner-only indexed publication status.
- POST /review/campaigns/:metadataId/decision: immutable human review and reason.
- GET /review/campaigns/:metadataId/approval: fresh role, conflict and matching-review authorization before signing.
- POST /campaigns/:metadataId/revision: one linked editable draft after reviewed unpublished cancellation and confirmed bond return.

The dedicated UI is `#/internal/campaigns`. Review queue retains unsigned
approval intents; history retains decisions after approval, rejection or
cancellation. See [Internal campaign review](./internal-campaign-review.md).

All amounts, on-chain IDs and block numbers are decimal strings. API deadlines
are Unix seconds. A submitted transaction is never accepted as client proof.

## Local operation and checks

Apply migrations and build the backend before startup. Migration 0009 creates
the three indexing tables. Indexing starts with the Nest application; setting
INDEXER_ENABLED=false disables automatic polling for isolated verification.

From backend:

```powershell
npm.cmd run db:migrate
npm.cmd run build
node scripts/publish-indexer-smoke.cjs
```

The smoke script starts its own Anvil on unused port 9545, deploys test contracts,
uses disposable SIWE-linked accounts, and removes its own database rows/process.
It refuses an occupied test port and never resets the application's 8545 chain.

Verified: 134 real HTTP/transaction checks cover role denial, full-bond review,
approval/publication, receipt-before-index privacy, cancelled history, metadata
mismatch, unkeyed isolation, duplicate replay, concurrent worker instances,
restart/catch-up, RPC and PostgreSQL rollback, mid-batch fork rejection, retained
orphan events, and interrupted multi-batch reorg recovery. Backend build and all
12 suites / 55 tests passed. Frontend build/lint and 26 lifecycle/snapshot/render
tests passed. The existing submission smoke also passed 32 checks after the shared
chain-reader change. The live 3000 public API returned 200 with a ready
checkpoint at block 52; no published application campaign currently appears.

Manual donor wallet signing remains unverified. Donation UI and indexed donor
history are implemented for linked wallets; refund UI, evidence freeze/submission/review/challenge, and broader contract
recovery remain required before claiming a complete MVP.
