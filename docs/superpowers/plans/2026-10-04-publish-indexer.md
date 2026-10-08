# Campaign approval, publication and indexing implementation plan

> **For agentic workers:** Execute the accepted publish/indexer design in this session; use isolated file ownership for parallel frontend and integration verification work.

**Goal:** A linked resolver account reviews a frozen, bonded submission and signs approval; its organizer signs publication; the public API/UI exposes the campaign only after canonical event indexing.

**Scope clarification after the user's 2026-10-04 workflow decision:** This
completed plan records the local technical approval/publication/indexer slice.
The target requires system dossier/integrity/criteria checks and corrections
before a submitted campaign reaches resolver/staff approval. The complete
checking/report pipeline and request-changes/rejection are not delivered by this
plan. Evidence/challenge verification, response and re-verification precede
unresolved-case arbitration; that resolver role remains in MVP. See
[the confirmed workflow](../../verification-and-disputes.md).

**Architecture:** Nest/Viem reads bounded confirmed block ranges. PostgreSQL stores an immutable event ledger with canonical flags, a durable deployment checkpoint, and a separate campaign projection. Transactions and a database advisory lock serialize worker commits. Hash changes trigger stream rebuild while preserving orphaned event records. Chain reads and configured deployment validation remain shared with submission.

**Tech stack:** Existing NestJS/Viem/PostgreSQL/Drizzle and React/Wagmi/TanStack Query. No new queue or financial rules.

## Tasks and checks

- [x] Shared chain reader and deployment identity; verify source/token/chain before indexing or wallet actions.
- [x] Migration: indexer streams, event ledger, campaign projection. Keep application metadata separate.
- [x] Worker: bounded polling, confirmed block selection, duplicate log protection, atomic checkpoint/projection writes, cross-process lock, RPC retry, restart/catch-up, hash validation and rebuild.
- [x] Public and resolver APIs with server authorization, immutable-plan matching and no unpublished metadata exposure.
- [x] Resolver approval and organizer publish UI with receipt/revert/rejection/retry handling; distinguish confirmed from indexed.
- [x] Real isolated-Anvil/HTTP/DB verification: role denial, publication guards, public visibility, duplicate replay, failure rollback, restart, catch-up and reorg rebuild. Existing suites/build/lint remain passing.
- [x] Update progress only with observed results and request the working-tree diff in Codex. Review opening is queued until this chat is shown.

## API contract for the frontend

`IndexerStatus`: `{status: 'syncing'|'ready'|'error'|'rebuilding', lastIndexedBlock: string|null, headBlock: string|null, error: string|null}`.

`PublicCampaign`: `{id,title,description,organization:{id,name},chainId,contractAddress,onchainCampaignId,organizer,tokenAddress,goalUnits,requiredBondUnits,bondAmountUnits,totalContributedUnits,state,fundingDeadline,publicationTransactionHash:string|null,indexedBlock,milestones:[{index,title,description,budgetUnits,acceptanceCriteria}]}`. Amounts/IDs/block numbers are lossless decimal strings. `state` uses contract enum names. `fundingDeadline` is Unix seconds.

- `GET /public/campaigns?limit=20&offset=0` -> `{items:PublicCampaign[],sync:IndexerStatus}`. Public, published and matched metadata only.
- `GET /public/campaigns/:metadataId` -> `{campaign:PublicCampaign,sync:IndexerStatus}`; unpublished returns 404. Inconsistent/offline chain returns 503.
- `GET /review/access` -> `{allowed:boolean,resolver:string}`; authenticated session. Allowed only for an account with the configured-chain resolver wallet verified/linked by SIWE.
- `GET /review/campaigns` -> `{items:(PublicCampaign & {plan:SubmissionPlan})[],resolver,sync}`; resolver only. Queue includes DRAFT, all criteria matched, and bond fully locked.
- `GET /review/campaigns/:metadataId` -> `{campaign:PublicCampaign & {plan:SubmissionPlan},resolver,sync}`; resolver only; includes approved rows for transaction reconciliation.
- `GET /campaigns/:metadataId/publication` -> `{state:string|null,indexedBlock:string|null,published:boolean,publicId:string|null,sync}`; owner only. Reads projection, never creates publication.

Approval and publication are wallet-signed `approveCampaign` and `publishCampaign`, using the existing canonical ABI/config. Backend signs no transaction. Approval queue excludes invalid/mismatched plans. Receipt success alone does not claim indexed/public visibility. Pending transaction identity is persisted locally; current chain state is checked before retry.

Observed checks: backend 55 tests, frontend 26 tests, publication/indexer smoke
134 checks, existing submission smoke 32 checks; FE/BE builds, frontend lint and
whitespace checks passed. Manual MetaMask signing remains unverified. Review
findings were fixed and re-reviewed; no remaining material defects reported in
this local scope.

## Recovery and privacy

Indexer starts from block zero for this existing local manifest (no deployment block was previously recorded), then persists its checkpoint. One confirmation is the existing local policy. Batch size is bounded. An indexer never mutates escrow or authorizes financial transitions.

Same-deployment reorgs reset/replay that stream atomically, preserving orphaned logs as noncanonical. Deployment/genesis/code mismatch fails closed rather than rebinding submissions. Public queries validate canonical checkpoint identity, report lag, and suppress stale data during a detected rebuild/error. Production chain finality remains outside this local slice.
