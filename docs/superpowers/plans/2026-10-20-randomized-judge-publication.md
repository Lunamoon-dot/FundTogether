# Randomized Judge Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or **superpowers:executing-plans** to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed Resolver publication gate with an on-chain three-Judge publication case, remove Studio verification as a funding prerequisite, and preserve the existing escrow lifecycle for later migration.

**Architecture:** The Campaign contract owns Judge eligibility, deterministic local committee selection, votes, quorum, case resolution, and permission to create a campaign. The existing idempotent indexer stores and projects Judge events from chain_events; the backend never chooses Judges or outcomes. The frontend exposes Creator case creation, Judge voting, and Creator campaign creation while production, release, dispute, payout, refund, and completion Resolver paths remain transitional.

**Tech Stack:** Solidity 0.8.24, Foundry/forge-std, NestJS/TypeScript, Drizzle/PostgreSQL, viem, React/TypeScript/Vite, Jest/Vitest, local Anvil chain 31339.

**Spec:** docs/superpowers/specs/2026-10-20-randomized-judge-review-design.md

## Global Constraints

- Use exactly three Judges per publication case and resolve on a two-of-three quorum.
- Treat local deterministic selection as a prototype mechanism, not manipulation-resistant production randomness.
- Do not add PoS weighting, stake, slashing, reviewer rewards, Kleros-style arbitration, or a new token in this phase.
- Do not move, release, refund, or otherwise change escrow funds as a consequence of creating or voting on a publication case.
- Keep fixed Resolver/Backup Resolver authority only for lifecycle actions that have not yet migrated.
- Treat contract events as canonical and keep backend projections idempotent across replay and reorganization.
- Keep the current Reward Crowdfunding scope: one digital PDF tier, MockUSDC, chain 31339, and no physical fulfilment or real-world asset workflow.
- Preserve unrelated dirty work and commit only files belonging to this task.

## Review Focus

- Creator without a Studio profile, or with PENDING/REJECTED profile state, can create and freeze a campaign; tests must prove no status gate remains.
- Creator cannot create a campaign directly without an approved canonical Judge case; the old approveCampaign path cannot bypass it.
- A case cannot contain fewer than three unique Judges or the Creator's own wallet.
- Only an assigned Judge may vote once; votes after resolution or expiry revert.
- Timeout, rejection, stale receipt, or replayed event leaves funding closed and the projection recoverable without duplicate rights.

---

### Task 1: Implement the on-chain publication Judge committee

Files:
- Modify contracts/src/campaigns/FundTogetherCampaign.sol
- Modify contracts/test/unit/Campaigns/CampaignEscrow.t.sol

Interfaces:
- Add createPublicationCase(bytes32,uint256,uint256,uint256) returns (uint256), votePublicationCase(uint256,bool), expirePublicationCase(uint256), publicationCase(uint256), publicationCaseId(bytes32), publicationJudge(uint256,uint8), judgePoolLength(), judgePoolAt(uint256), and isEligibleJudge(address).
- Emit JudgeCaseCreated, JudgeSelected, JudgeVoted, and JudgeCaseResolved.
- Keep resolver, backupResolver, _resolverOrBackup(), and _reviewer() only for non-publication lifecycle methods until later phases.

- [ ] Write failing Foundry tests for Creator publication without Studio state, no direct createCampaign before approval, unique non-Creator Judges, non-assigned voter rejection, duplicate-vote rejection, two approvals, two rejections, vote-after-resolution rejection, expiry, and no funds movement.
- [ ] Run forge test --match-path contracts/test/unit/Campaigns/CampaignEscrow.t.sol -vv and verify the new tests fail against the old approvedTerms/Resolver implementation.
- [ ] Add JUDGE_COUNT = 3, JUDGE_QUORUM = 2, JUDGE_VOTING_WINDOW = 7 days, JudgeVote, JudgeCaseStatus, PublicationCase, and a deployment-seeded Judge pool. Reject zero, duplicate, or fewer-than-three pool entries.
- [ ] Implement createPublicationCase with exact-term validation, a recorded local selection seed, deterministic selection of three unique pool members excluding the Creator, stored seats, and creation/selection events.
- [ ] Remove approvedTerms, approveCampaign, and CampaignApproved. Make createCampaign require the exact terms hash to point to an APPROVED case created by the same Creator, then consume the binding exactly once.
- [ ] Implement votePublicationCase with assignment, one-vote, deadline, and resolved-state checks; resolve immediately when either count reaches two. Implement expirePublicationCase after the deadline with approved=false and no escrow mutation.
- [ ] Run the focused tests and then forge test. Expected: all new tests and existing escrow tests pass; production/release/settlement tests still use transitional Resolver paths.
- [ ] Commit as feat: add randomized publication judge cases.

### Task 2: Update local deployment and the verified ABI boundary

Files:
- Modify backend/scripts/campaigns/deploy-campaign.cjs
- Modify backend/scripts/campaigns/generate-campaign-artifacts.cjs
- Modify backend/scripts/campaigns/seed-local-accounts.cjs
- Modify backend/scripts/campaigns/artifact-contract.test.cjs
- Modify backend/src/blockchain/deployment.ts
- Modify backend/src/blockchain/deployment.spec.ts
- Modify frontend/src/lib/web3/deployment-policy.ts
- Modify frontend/src/lib/web3/missing-campaign-deployment.json
- Regenerate backend/src/blockchain/generated/campaigns/fund-together-campaign.abi.json

Interfaces:
- Manifest contains judges: address[], abiVersion campaigns-local-judge-v1, and the new ABI/policy hashes.
- verifyDeploymentManifest verifies judgePoolLength, every judgePoolAt entry, and existing token/resolver/policy identity.

- [ ] Add failing deployment tests for fewer-than-three Judges, duplicate Judges, and a manifest whose Judge pool differs from the chain.
- [ ] Run the focused deployment tests and verify the new manifest checks fail before implementation.
- [ ] Make deploymentRoles return judges: accounts.slice(6, 10); add four local Judge accounts at indexes 6–9 with JUDGE metadata, without treating platform roles as contract authority.
- [ ] Change the contract policy string to campaigns-local-escrow-v7 and manifest ABI version to campaigns-local-judge-v1. Mirror these values in backend and frontend policy validation.
- [ ] Update the artifact signature allowlist to require the Judge functions/events and reject approveCampaign.
- [ ] Run forge build, node backend/scripts/campaigns/generate-campaign-artifacts.cjs, and node --test backend/scripts/campaigns/artifact-contract.test.cjs. Expected: fresh ABI, manifest, role, and Judge-pool checks pass.
- [ ] Commit as chore: bind campaign deployment to judge pool.

### Task 3: Index and expose canonical Judge-case state

Files:
- Create backend/src/modules/campaigns/policies/publication-judge-case.ts
- Modify backend/src/indexer/campaign-indexer.service.ts
- Modify backend/src/modules/campaigns/services/publication.service.ts
- Modify backend/src/modules/campaigns/controllers/chain.controller.ts
- Modify backend/src/modules/campaigns/tests/publication.service.spec.ts
- Modify backend/src/indexer/tests/campaign-indexer.integration.spec.ts
- Modify frontend/src/features/campaigns/api/campaigns.ts

Interfaces:
- Add derivePublicationJudgeCase(events, commitmentHash): PublicationJudgeCase | null. It returns caseId, creator, commitmentHash, voteDeadline, status, judges, votes, approveVotes, rejectVotes, and decisionHash.
- PublicationService.operations accepts creator, judge, resolver, or admin scope. Judge scope filters by linked wallet and canonical assigned seats; it never grants authority from a database role alone.
- Add GET operations/judge and GET campaigns/:id/publication-case.
- CampaignTerms returns publicationCase and keeps onchainApproved only as a compatibility boolean derived from publicationCase.status === APPROVED.

- [ ] Write reducer tests for open, approved, rejected, and expired cases, different commitments, ordered selection/vote events, and replayed non-canonical events.
- [ ] Implement the pure reducer from canonical chain_events. Return null without a matching JudgeCaseCreated and derive resolution only from JudgeCaseResolved.
- [ ] Add createPublicationCase, votePublicationCase, and expirePublicationCase to transaction-action validation and validate case id, commitment, creator, assigned Judge, and receipt sender.
- [ ] Keep Judge events in the existing idempotent chain_events replay. An approved matching case moves the campaign projection to APPROVED; a rejected/expired matching case returns it to editable DRAFT with the old frozen commitment cleared for a new revision.
- [ ] Replace PublicationService publication lookup and preflight checks with the reducer and exact commitment. Remove campaignReviews and verified-profile checks from publication eligibility. Keep Resolver authorization only for unmigrated lifecycle actions.
- [ ] Allow assigned Judges to read only the frozen publication dossier and evidence needed for that case. Do not create a funding binding from a database review row alone.
- [ ] Run the focused backend/indexer tests from backend and commit as feat: index canonical publication judge cases.

### Task 4: Remove Studio verification and fixed publication workflow gates

Files:
- Modify backend/src/modules/campaigns/services/campaign.service.ts
- Modify backend/src/modules/campaigns/workflow/campaign.service.ts
- Modify backend/src/modules/campaigns/schemas/campaign.schema.ts
- Modify backend/src/modules/campaigns/controllers/campaign.controller.ts
- Modify backend/src/modules/campaigns/workflow/creator.controller.ts
- Modify backend/src/modules/campaigns/workflow/admin.controller.ts
- Modify backend/src/modules/campaigns/workflow/resolver.controller.ts
- Modify backend/src/modules/campaigns/policies/commitment.ts
- Modify backend/src/modules/campaigns/tests/http.spec.ts
- Modify backend/src/modules/campaigns/tests/workflow-campaign.schema.spec.ts
- Modify backend/src/modules/campaigns/tests/workspace-authorization.spec.ts

Interfaces:
- Draft creation, preparation, freeze, and Judge-case preparation require authenticated account ownership and a linked chain-31339 wallet, but no creatorProfiles.status, Studio-wallet verification, Admin approval, or fixed Resolver publication review.
- Retained Creator profile endpoints are optional metadata upserts and do not return or enforce funding permission.
- Post-publication production, release, dispute, payout, refund, and completion retain transitional Resolver authorization.

- [ ] Add failing tests proving a Creator without a profile and with PENDING/REJECTED profile state can create, prepare, freeze, and submit a campaign when the wallet is linked; prove it still cannot fund before a canonical approved Judge case.
- [ ] Remove profile status, original-work approval, and Studio-wallet identity checks from both active and compatibility workflow services. Keep wallet ownership/chain, sample ownership, and file integrity checks. Build the frozen snapshot from optional profile metadata with stable fallback values.
- [ ] Stop using campaignReviews as current publication eligibility. Remove current-path open-community-review/fixed-Resolver publication decisions and ensure no controller turns a database review into on-chain funding permission. Retain historical records and transitional post-publication Resolver endpoints.
- [ ] Update private evidence ACLs so an address linked to an assigned Judge may read the frozen publication dossier, while unrelated accounts remain denied.
- [ ] Run the focused backend tests from backend and commit as refactor: remove studio and fixed publication gates.

### Task 5: Add Creator and Judge UI flows

Files:
- Modify frontend/src/features/campaigns/creator/Studio.tsx
- Modify frontend/src/features/campaigns/creator/CampaignWorkspacePage.tsx
- Modify frontend/src/features/campaigns/creator/CampaignActions.tsx
- Modify frontend/src/features/campaigns/creator/Profile.tsx
- Modify frontend/src/features/campaigns/admin/AdminConsole.tsx
- Modify frontend/src/features/campaigns/api/campaigns.ts
- Modify frontend/src/features/campaigns/transactions/useTransaction.ts
- Modify frontend/src/features/campaigns/transactions/recovery.ts
- Create frontend/src/features/campaigns/judge/JudgeConsole.tsx
- Create frontend/src/features/campaigns/judge/JudgePublicationPanel.tsx
- Modify frontend/src/features/campaigns/resolver/CampaignReviewPage.tsx
- Modify frontend/src/features/campaigns/shared/workspace/WorkspaceShell.tsx
- Modify frontend/src/features/explore/AppShell.tsx
- Modify frontend/src/features/explore/campaignRoutes.ts

Interfaces:
- useTransaction accepts createPublicationCase, votePublicationCase, and expirePublicationCase and reconciles each against its canonical event.
- JudgePublicationPanel consumes PublicationJudgeCase and shows vote controls only for an assigned linked wallet with no recorded vote.
- Creator workspace displays NOT_CREATED, OPEN, APPROVED, REJECTED, and EXPIRED separately and enables createCampaign only after canonical APPROVED.

- [ ] Add failing frontend tests for draft CTA without profile verification, Creator case creation before createCampaign, submitted vote versus resolved state, unassigned wallet denial, and approved-case campaign creation.
- [ ] Replace Studio verification onboarding with optional profile metadata copy and allow draft creation for any authenticated Creator with a valid linked wallet. Remove Admin Console cards/actions that claim Studio verification is required.
- [ ] Add Creator case status and createPublicationCase controls. Keep createCampaign disabled until indexed canonical APPROVED.
- [ ] Add Judge route and publication panel showing assigned seat, dossier, deadline, current vote, and explicit submitted/receipt/indexed/canonical transaction states.
- [ ] Remove publication approveCampaign controls and old publication copy from the Resolver workspace. Keep Resolver UI only for transitional production, release, dispute, payout, completion, and refund work.
- [ ] Run npm test from frontend and commit as feat: add creator and judge publication flows.

### Task 6: Align current documentation and remove stale publication claims

Files:
- Modify docs/research-direction.md
- Modify docs/PROJECT_OVERVIEW.md
- Modify PRODUCT.md
- Modify docs/PROJECT_PROGRESS.md
- Modify docs/README.md
- Modify docs/campaigns/MANUAL_TEST_GUIDE.md

- [ ] Search the listed docs for Studio, verification, Resolver, approveCampaign, and publication claims.
- [ ] Document Creator → on-chain JudgeCase → three Judge votes → two-of-three resolution → campaign creation. Mark fixed Resolver authority as transitional and Studio profile as optional metadata.
- [ ] Remove manual steps that require Admin Studio verification or fixed Resolver approveCampaign. Keep historical plans and auth/runtime documents labeled historical or operational; do not delete them merely because they mention old context.
- [ ] Run existing documentation link checks and git diff --check, then commit as docs: describe randomized judge publication.

### Task 7: Verify the integrated migration boundary

Files:
- Modify only if verification exposes a failure in Tasks 1–6.
- Test existing backend/scripts/campaigns deployment, reset, seed, and browser checks.

- [ ] Run forge test, artifact generation, backend Jest, and frontend tests. Expected: escrow, indexer idempotency, wallet identity, private evidence ACL, and transaction lifecycle checks remain green.
- [ ] Use the documented disposable local-chain/database reset path, deploy the new contract with the Judge pool, migrate the isolated database, seed Creator/Backer/Judge accounts, and update/run the browser scenario with three Judge voters.
- [ ] Verify Creator creates a draft without Studio verification, creates a JudgeCase, three selected Judges are canonical, two approve, Creator creates the campaign, and Backers pledge through unchanged escrow.
- [ ] Verify direct createCampaign, old fixed Resolver publication calls, unassigned/duplicate/late votes, expired cases, database-only approvals, stale receipts, and replayed events fail closed.
- [ ] Run git diff --check and git status --short. Confirm unrelated pre-existing dirty files remain untouched and commit only narrowly scoped verification fixes.
