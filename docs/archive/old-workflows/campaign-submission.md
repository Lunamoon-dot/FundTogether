# Local campaign submission and organizer bond

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


Implemented 2026-10-04. This slice ends at confirmed bond custody awaiting resolver review. It does not implement a resolver dashboard, publish UI, donor journey or an event indexer.

Scope clarification: the later [publication/indexer slice](./campaign-publication-indexer.md)
adds local campaign approval/publication and indexing. The user-confirmed target
requires system dossier/integrity/criteria checks, organizer corrections, then
submission to resolver/staff for human approval before publication. The checks
in this submission slice cover technical/financial identity, not that complete
review pipeline. Campaign request-changes/rejection/resubmission remain TODO.

## Data flow

Frontend saves private draft -> backend freezes server-owned title, ordered budgets, criteria commitments, representative wallet, configured token/network/deployment and selected funding deadline -> wallet approves the exact bond if needed, then signs atomic submission -> backend reads a single confirmed block and verifies the frozen plan against chain state -> metadata projection records awaiting_review.

Bond = max(budgets); goal = sum(budgets). Amounts are integer strings in USDC base units (six decimals), with bigint arithmetic and uint256 validation. The bond confirmation popup transfers no assets.

## Deployment boundary

Local deployment uses FundTogetherConfigured, derived from the existing financial prototype. supportedToken is immutable; both inherited creation and the keyed creation entry point reject other assets. The base FundTogether remains the unconfigured test prototype. Public criteria configuration and the internal bond-lock routine allow the derived atomic entry point to reuse the existing authorization, accounting and events.

campaignForDraft[organizer][draftKey] stores campaign ID + 1. draftKey is keccak256 of the metadata UUID. Creation rejects an already-used key for that organizer, including after cancellation. A reverted creation consumes no key. The key prevents duplicate on-chain campaigns even if the browser loses a transaction hash.

The canonical ABI and local manifest live in backend/src/blockchain/generated and are imported by both FE and BE. The manifest contains only public deployment information. Backend validates chain 31337, genesis hash, contract/token bytecode hashes and supportedToken. A mismatched deployment fails closed. One confirmation is a local development policy.

## API

- GET /campaigns/:id/submission: frozen plan or empty response when no submission exists; requires campaign owner access.
- POST /campaigns/:id/submission: expectedRevision and fundingDeadline (Unix seconds). Locks the aggregate row and freezes the plan atomically. Repeated requests return the same plan. Requires organization OWNER access and a verified representative wallet on the configured chain.
- POST /campaigns/:id/submission/sync: no caller-supplied proof or financial flags. Resolves the keyed campaign, checks organizer/token/deadline/budgets/criteria and reads bondLocked/bondAmount at one confirmed block. Returns stage, ID and block used.

Organization campaign listing includes drafts and submitted campaigns. A prepared draft cannot be edited through PATCH. Criteria commitments use keccak256 of the version-1 canonical JSON field order: title, description, ordered acceptanceCriteria containing criterionId and description. Their source remains in immutable campaign milestone metadata.

## Wallet journey and recovery

New deployments advertise `atomicSubmission: true` in the shared manifest. Nop campaign & khoa bond saves the current wizard inputs, validates the connected representative wallet, freezes the submission, checks the token balance before requesting a signature and executes exact-amount ERC20 approval if allowance is insufficient -> submitCampaignForDraft. The second transaction creates the keyed campaign, commits every criterion and locks the maximum-budget bond atomically. It remains DRAFT awaiting resolver review. A failed transfer, missing allowance or invalid criterion rolls back the entire submission, including the draft key and events. Approval is a separate transaction and may remain after a failed submission; it does not transfer tokens.

The running local deployment now supports this entry point after the Anvil reset and user-authorized database cleanup on 2026-10-05. The shared manifest has `atomicSubmission: true`. The frontend retains the legacy create/criteria/approve/lock path for manifests without this capability; those campaigns resume only missing steps with balance checks. Existing frozen plans are never rebound to a new contract or token.

Every transaction is simulated, signed by the organizer, checked for receipt success and confirmed before the next stage. The frontend balance check improves feedback; contract transfer checks and a reentrancy guard enforce fund safety if the wallet balance changes after approval.

Wallet confirmation and network-switch requests have a 90-second UI timeout.
An unresolved extension request keeps its connector lock; timeout never cancels
or resends a transaction. A late transaction hash is saved for explicit receipt
reconciliation. Current account/address/chain/connector are checked again before
each prompt, and leaving the screen stops subsequent prompts. The wallet's own
RPC must match the configured genesis and contract/token bytecode; matching
chain ID alone is insufficient. Cancellation replacement markers persist with
pending hashes across receipt timeouts and reloads.

The browser stores its pending hash under deployment/metadata identity. Reload/retry waits for that receipt and then reconciles on-chain state. Database snapshot and keyed campaign survive API restarts. Missing criteria are resumed; a locked bond is never transferred twice. Wallet/chain changes stop signing. User rejection, failed receipts and RPC failures retain the plan for retry.

Funds belong to the organizer before lock; lockBond moves the required amount into contract custody. Only the organizer may lock it, and only once in DRAFT/APPROVED. A failed transfer reverts flags and balances. Moving the remaining wallet balance afterward cannot move escrowed bond. Existing cancellation/failure/completion rules govern return; submission itself neither approves nor publishes. Unpublished bond recovery exists in the contract via cancelCampaign; a cancellation UI remains pending.

Once prepared, the deadline/content are frozen even if the wallet declines. There is no unfreeze/rewrite endpoint in this slice. An expired uncreated plan requires a new private draft; an already-created unpublished campaign can use the existing contract cancellation path. Deployment resets/redeployment require reconciliation of outstanding plans, never silent rebinding.

## Local tooling

- Build contracts with forge build in contracts (Foundry is installed in WSL on this host).
- node backend/scripts/deploy-local.cjs deploys MockUSDC and FundTogetherConfigured only if no saved manifest exists; a valid existing deployment is reused. --redeploy is explicit and requires reconciling prior submissions.
- node backend/scripts/fund-local-wallet.cjs <address> <MockUSDC amount> mints the requested local test amount and supplies 1 test ETH if the address lacks gas funds. No keys are written or displayed.
- Run migrations/build from backend before launching the app. The frontend uses the same deployment manifest.
- From backend, node scripts/campaign-submission-smoke.cjs exercises disposable authenticated accounts, PostgreSQL and real signed Anvil transactions, then cancels its test campaign and removes its temporary metadata/accounts. Cancelled on-chain test records remain as history.

## Verification

6 configured-contract tests passed, including token substitution, organizer-scoped keys, duplicate prevention, reverted-create retry and balance drains before/after bond custody. The configured/bond/milestone focused suites also passed.

32 real API/transaction checks passed, including stale revision, expired deadline, outsider access, immutable metadata, repeated preparation, backend restart, readback, keyed creation, criteria, failed lock after wallet drain, successful custody and no implicit approval/publication.

MetaMask browser signing has not been manually verified. Durable local indexing and approval/publication are now implemented in the next slice; see [publication/indexer](./campaign-publication-indexer.md). Production finality and broader protocol recovery remain separate work.

All 11 backend test suites (42 tests) passed. Backend/frontend builds, frontend lint and git diff whitespace checks passed. Existing large frontend bundle warning remains. The deploy helper reused the existing manifest without sending new deployment transactions; local funding helper was exercised against the unlocked development operator.
