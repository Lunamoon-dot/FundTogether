# FundTogether Project Overview

> Updated: 2026-10-04
> Scope: current repository and verified contract prototype

For local onboarding, dependencies, PostgreSQL, MinIO, Anvil and FE/BE startup,
follow the root [README](../README.md). It also separates runnable draft journeys
from the pending on-chain integration.

## Repository boundaries

| Directory | Responsibility | Current implementation |
|---|---|---|
| frontend/ | Forms, wallet interaction, transaction and indexed state | React/TypeScript Vite starter UI with API/Web3 boundaries |
| backend/ | Authentication, metadata, storage and chain projections | NestJS, PostgreSQL/Drizzle, account/session auth, SIWE wallet linking and private campaign/evidence draft APIs; indexer remains scaffolded |
| contracts/ | Financial rules and on-chain campaign state | Funding, bond, pre-funded refunds, sequential evidence/review and unchallenged settlement |
| docs/ | Approved rules, current implementation and history | Protocol, financial rules, state machine and progress |

Campaign/evidence draft APIs are committed backend code. Account credentials,
revocable sessions and optional wallet linking are local implementation work;
their verification status is recorded in PROJECT_PROGRESS.md.

Organization creation/list APIs are implemented as a separate account-owned
metadata slice: POST/GET /organizations, transactional OWNER membership and
unverified profile status. Migration 0004 applied locally and backend build
passed; organization creation/list and campaign authorization were exercised by
the 22-check HTTP/PostgreSQL smoke script. On-chain organizer
addresses are unchanged. See
[organization backend step](./backend-step-3-organizations.md).

Organizations now have an optional representative wallet selected from the
creator's SIWE-verified links. PUT /organizations/:id/wallet requires creator
identity and current OWNER membership. Initial selection is persisted and fixed;
MetaMask connection changes cannot replace it. Migration 0006 is applied locally.
The organization list/profile shows and selects the wallet; no publication or
money movement is added. See [organization wallet](./backend-step-6-organization-wallet.md).

The #/organizations frontend route provides account-scoped organization listing
and a create form, with sidebar/workspace links and an anonymous login prompt.
Frontend build/lint passed; authenticated runtime and visual verification remain
pending. Backend organization campaign ownership and frontend create/list
integration and detail/edit routes are implemented. Authenticated API save/read
checks pass; browser save/read interactions remain unverified.

My organizations and #/organizations/:id profile views stay in the user tab.
Organization cards/profile pages open #/organizations/:id/workspace/campaigns
in a separate tab for campaign operations. Workspace has campaign/milestone/
evidence navigation, with no profile overview. Campaign create/list is connected
to organization-scoped APIs. Detail/edit includes ordered milestone plans;
the Milestones view selects a campaign. Evidence navigation selects campaign and
saved milestone, with a report draft editor using the existing evidence APIs.
Report fields, dates and criterion outcomes are editable. Private upload/download
uses local MinIO and the saved draft revision; expense editing, public redaction
and freeze remain pending. The authenticated HTTP/PostgreSQL/MinIO journey passes
63 checks including authorization, persistence and revision races; browser form
interactions remain unverified. Evidence creation requires the current milestoneId
and checks its campaign/index binding under a transaction lock.
See [private evidence upload setup](./backend-step-5-evidence-upload.md).
The personal #/workspace retains access to legacy user-owned drafts.

Organization OWNERs can create/list drafts at /organizations/:id/campaigns.
Campaign detail/update and evidence authorization honor organization membership;
createdByUserId is audit metadata. Migration 0005 applied locally and backend
build passed; 9 focused unit tests and 22 HTTP/PostgreSQL checks pass, including
membership enforcement, persisted edits and stale revision rejection. Existing personal drafts
retain null organizationId. See [campaign ownership](./backend-step-4-organization-campaigns.md).

Blockchain is authoritative for custody, contributions, bond, refund entitlement
and milestone state. PostgreSQL holds application metadata and derived chain
projections. Evidence files belong in storage; financial commitments belong on-chain.

## Contract setup

- Foundry runs through WSL Ubuntu 24.04; Solidity is pinned to 0.8.24.
- Dependencies are pinned Git submodules: OpenZeppelin Contracts v5.4.0 and
  forge-std v1.17.0.
- Protocol source is in contracts/src/; mocks, shared fixtures and suites are
  under contracts/test/.
- Follow [contracts setup](../contracts/README.md) to clone dependencies and run tests.

## Development network and gas

Local integration targets Anvil with ERC20 MockUSDC (6 decimals); native test ETH
pays transaction gas. ERC20 names the token standard, not the network. Arc testnet
is the priority public integration target; Sepolia is an optional fallback. Arc is
the preferred production candidate, pending acceptance. Solidity/EVM
does not imply an Ethereum mainnet deployment. Contract tests do not prove a live
FE/BE integration deployment. See [network and gas specification](../v0.2/FundTogether_Development_Network_and_Gas_v0.1.md)
and [TypeScript conventions](./web3-conventions.md).

The current direct-wallet flow requires native gas and allowance where applicable.
MockUSDC has no permit/EIP-3009; relayer/paymaster support is not implemented.
Anvil account funding must not hide zero-native-balance cases in future UX tests.

Arc testnet is now the prioritized evaluation target while local Anvil stays the dev
baseline. Arc USDC shares its native gas balance (18 decimals) and ERC20 balance
(6 decimals); fee reserve and indexer duplicate-stream handling need dedicated
validation. See [Arc evaluation plan](../v0.2/FundTogether_Arc_Evaluation_v0.1.md).
No Arc deployment, adapter or production network selection is claimed.

## Current contract interface

```solidity
createCampaign(string name, address token, uint256 deadline, uint256[] budgets)
approveCampaign(uint256 campaignId)
configureMilestoneCriteria(uint256 campaignId, uint256 milestoneIndex, bytes32 criteriaHash)
lockBond(uint256 campaignId)
publishCampaign(uint256 campaignId)
donate(uint256 campaignId, uint256 amount)
activateMilestone(uint256 campaignId, uint256 milestoneIndex)
submitEvidence(uint256 campaignId, uint256 milestoneIndex, bytes32 evidenceHash)
grantRole(bytes32 role, address account) / revokeRole(bytes32 role, address account)
assignVerifier(uint256 campaignId, uint256 milestoneIndex, uint256 version, address verifier)
verifySubmission(uint256 campaignId, uint256 milestoneIndex, uint256 version, bytes32 evidenceHash)
rejectSubmission(uint256 campaignId, uint256 milestoneIndex, uint256 version, bytes32 evidenceHash, bytes32 reasonHash)
expireSubmission(uint256 campaignId, uint256 milestoneIndex, uint256 version)
finalizeMilestoneTimeout(uint256 campaignId, uint256 milestoneIndex)
openChallenge(uint256 campaignId, uint256 milestoneIndex, bytes32 reasonHash)
settleMilestone(uint256 campaignId, uint256 milestoneIndex)
cancelCampaign(uint256 campaignId)
finalizeFundingFailure(uint256 campaignId)
claimRefund(uint256 campaignId)
```

Goal equals the sum of positive budgets; required bond equals their maximum.
The deployer is the trusted resolver. Only the organizer can lock the campaign
bond, publish the approved campaign or activate its next pending milestone.
The organizer commits a nonzero criteria hash for every milestone while DRAFT;
approval requires all hashes and freezes them. Full criteria content remains
off-chain; a hash does not verify delivery. Resolver approval is a separate contract action. Organizer and donor transfers
require their respective ERC20 allowances.

Donations stop at the deadline or when the goal is reached. Pre-funded organizer
cancellation and deadline failure return any bond and create independent donor
claims. Activating a milestone changes state without releasing funds.

Submission creates a pending immutable evidence version without starting review.
The deployer holds AccessControl DEFAULT_ADMIN_ROLE initially and can grant/revoke
VERIFIER_ROLE for multiple wallets. Admin assigns/reassigns only current pending
submissions; organizer cannot review their own campaign. The assigned verifier
must retain the role and accept the exact hash/version before review begins.
Rejection records a reason and permits a new version while retaining history,
up to three total submissions per milestone, including expired admissions.
Review lasts a fixed 72 hours from acceptance, not the initial submission.
Donors can challenge strictly before reviewEnd. Anyone can settle an unchallenged
milestone at or after reviewEnd, paying its budget to the organizer. Settlement
advances the index; final settlement completes the campaign and returns bond
atomically. totalReleased records donor funds paid out, excluding bond.

The interface is still evolving. Activation/evidence/admission timeout recovery
now uses defaults of 7 days / 30 days / 72 hours, with 7 days for corrections.
Reassignment does not extend admission. Eligible permissionless timeout calls
or a final rejection/expiry terminate FAILED, snapshot unreleased escrow for
proportional donor claims and return the bond without slash. See
[timeout defaults](./contract-evidence-timeouts.md). Challenge resolution and
misconduct recovery remain pending; CHALLENGED still has no exit. Permanently
failed organizer token transfers can still prevent terminal recovery.
There are no verified deployment addresses or generated
shared ABI artifacts for FE/BE yet.

## Integration checkpoints

The reviewed target [verification/dispute flow](./verification-and-disputes.md)
adds admission, challenge screening, organizer response and re-verification before
unresolved cases reach an independent resolver. Admission/versioning is implemented;
challenge screening, response and remediation are not.
Three resolvers with two matching verdicts is the selected MVP direction;
the contract currently has one immutable deployer resolver address.

Backend metadata and frontend wallet/form foundations can proceed independently.
Before integrating contract actions, agree the relevant ABI/events, generate
shared artifacts, deploy locally and test the intended journey. Chain state then
flows through events to an idempotent indexer and database projection.

The first integrated journeys are create/publish, donate and pre-funded refund.
Evidence and settlement screens follow tested milestone actions. Transaction
receipt success and indexed application state must remain distinct.

## Verification and limits

Historical contract verification before the timeout slice: 129 passing tests
across eleven suites, including four fuzz tests with 256 runs each. The
2026-10-04 timeout slice compiles successfully; automated tests have not been
added or run for it, and no deployment is claimed. Timestamp comparisons and
intentional input-validation loops produce lint warnings. This is a prototype,
with standard exact-transfer ERC20 assumptions and incomplete dispute recovery.
FE/BE builds were not rerun for this contract task.

See [progress and history](./PROJECT_PROGRESS.md) for dated evidence and
[financial rules](./financial-rules.md) for approved accounting behavior.

## Private draft dashboard — 2026-10-04

The default frontend entry is now a public Explore feed, accessible without
authentication. Hash routes cover `/`, `/account`, `/contributions`,
`/campaigns/:id` and `/workspace`, so refresh/back work without server rewrites.
The public campaign detail route currently shows an unavailable state; it has
no funding, milestone or evidence data yet. Search/filter are disabled until
public data is connected. Contributions/refunds show an explicit pending state.
Account now uses independent email/password registration and login, with optional
external-wallet linking after login. SIWE login remains available for already
linked wallets. Embedded wallet integration was removed by user decision on
2026-10-04. Current code supports external browser wallets through signed linking;
future providers can reuse the same account identity and linking flow. See
[accounts and wallets](./accounts-and-wallets.md).
Public navigation uses a left sidebar with
Explore and Contributions above, and Account/Organizer workspace below; on small
screens it becomes compact navigation above the content.
No public campaign API, chain projection, donor transaction or mock dataset is
introduced by this UI slice. Private drafts never become public feed content.
Private list queries run only in the authenticated workspace, which stays mounted
while browsing public pages to preserve entered wizard data within the session.

The signed-in dashboard separates Overview, Recent campaigns and Evidence.
Creation opens from a Create campaign button inside Recent campaigns; it has no
sidebar entry. Its frontend wizard covers campaign details, incremental milestone
entry, and review/confirmation. Review offers a Save draft action that persists
the campaign and all milestones atomically. Unsaved input stays in React state;
submission is disabled until its separate workflow exists. The private
`GET /campaigns` endpoint lists only drafts owned by the authenticated account,
newest first; selecting a draft opens its campaign and milestone details. The list has no
pagination yet. Campaign creation still stores off-chain metadata; publishing,
evidence upload and submission are separate pending journeys.

Backend builds use `tsconfig.build.json` to exclude specs (including the SIWE
spec importing frontend source) and keep the runtime at `dist/src/main.js`.

Milestone planning storage now uses `campaign_milestone_drafts`, linked to
`campaign_metadata`, with unique zero-based positions and JSONB draft criteria.
Migration `0002_campaign_milestone_drafts` also adds campaign revision. The
create/detail APIs now validate and persist the planning aggregate. Owner comes
from the authenticated session, and milestone indices come from array order.
Aggregate editing now requires the last-read revision and saves the full plan in
one transaction. A stale writer gets 409; the UI preserves input and offers a
read-only latest-version comparison before an explicit discard/reload action.
Edits are limited to unlinked private drafts without existing evidence until
legacy evidence references are reconciled. Evidence creation shares the campaign
row lock. Evidence-to-milestone existence checks remain TODO.

The legacy index-based evidence editor has been removed from the UI. Evidence
shows a placeholder until saved milestones can be selected explicitly; existing
backend evidence endpoints and stored evidence are unchanged.

## Evidence preparation — 2026-10-03

The user moved the design corpus into repository `v0.2/`. The
[evidence pipeline specification](./evidence-pipeline.md) links Evidence Schema,
Verification Report and a synthetic worked example. Immutable organizer packages
are separate from rerunnable rule/OCR/AI reports. These are design artifacts;
upload, report generation and verifier screens are not implemented yet.

## Milestone review and Arc readiness

The [dated milestone review](../v0.2/FundTogether_Milestone_Review_2026-10-03.md)
separates implemented slices from target design across all ten milestones.
Arc Foundry, runtime/USDC validation, shared deployment artifacts, idempotent
indexing and integrated journeys are TODO. Contract settings pin Solidity 0.8.24;
an Arc-compatible compiler/EVM target has not been verified.

Prototype CHALLENGED has no exit. Admission/organizer inactivity recovery and
unreleased-escrow refunds now compile but need runtime verification; dispute
resolution, slash and permanent transfer-failure recovery remain blockers.
