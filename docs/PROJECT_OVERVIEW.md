# FundTogether Project Overview

> Updated: 2026-10-09
> Scope: current repository and local MVP deployment

## Current direction — 2026-10-06

**First read, user-directed on 2026-10-08:** [research direction](./research-direction.md)
records the proposed NCKH title, objectives, six research activities, expected
outputs and flexible business scope. Read it before reasoning or finalizing a
project decision; then verify the relevant baseline and source. On 2026-10-08 the
user selected staged funding before execution, with review before subsequent
funding (flow B), and evidence-verification workflow as the core design focus.
On 2026-10-09 the user approved B-D01–B-D10 for a local/pilot deployment:
no bond, one advance per stage, bounded substantive review/cases, actual returns,
fixed base refunds plus cumulative supplements. B implementation is in progress;
the deployed reimbursement baseline and its bond obligations have not changed.

Preparation for B on 2026-10-09 now includes two synthetic gift campaign plans,
12 original/public fixture packages with byte hashes, eight integer accounting
traces and [an approved pilot specification](./workflow-b-spec.md), with
[financial rules](./workflow-b-financial-rules.md). B-D01–B-D10 are APPROVED_FOR_LOCAL_PILOT;
the offline generator/trace is research tooling, not product financial behavior.
B contract funding/advance/evidence/case/timeout/return/refund is implemented and
unit/fuzz tested. Standalone ABI and local deployment31338/RPC9547 exist, with
genesis/code/anchor/instance/timer verification and atomic snapshots; the final
contract regression280 PASS. B schema/domain/action API, organization/evidence
review, private/redacted storage and isolated event indexer are implemented;
backend152 tests and50 HTTP checks pass. B frontend mode uses a generated API
client and separate deployment context, with gift planning, organizer actions,
evidence reports, staff/resolver review, public case and refund views. Frontend113
tests, lint and A/B builds pass; Edge mocked-API checks14+18 pass. A disposable
fork HTTP journey completed G1 and all three G2 stages (including a supplement),
with38 receipts, canonical indexer projections and balance checks. Additional
failure171/waiting94 receipts pass, including rounding, failed-transfer retry,
bounded review/timeouts and actual unused returns. Cold chain/DB/files recovery
and six controlled A/B contract comparison paths pass. Neutral reviewer PDFs/PNGs
and a local runbook are prepared; human wallet/reviewer acceptance remains pending.
Browser fixture checks do
not constitute manual wallet acceptance. See
[acceptance tracking](./workflow-b-acceptance.md) for verified tooling tests and
the still-pending T01–T18 system/manual acceptance. The
[code implementation plan](./workflow-b-code-plan.md) has been approved as required
by GOAL.md; it targets isolated chain31338/RPC9547 and B DB/storage.

On 2026-10-09 the user clarified that buying/distributing gifts is the first
campaign type, not the definition of all FundTogether campaigns. Keep activity
type separate from recipient/distribution channel and the number of funding
stages. Gift-specific criteria/evidence belong to that type; future types need
their own reviewed business rules. This is a documented design boundary, not
an implemented multi-type workflow or authorization to add speculative machinery.

The user has chosen MVP consolidation and business validation before expanding
post-MVP. The [working plan](./business-validation-and-mvp-hardening.md) records
the questions about working capital, no-slash bond purpose, evidence, resolver
capacity, donor participation and operational recovery, plus exit criteria.
Existing rules remain the approved test baseline; research is TODO and may lead
to explicit revisions. A local test pass does not establish real-world suitability.

| Boundary | Current meaning |
|---|---|
| Application configuration | FundTogetherMvp on 8545 after authorized test-data reset on 2026-10-07; generated manifest remains the identity boundary |
| New MVP source/integration | FundTogetherMvp and BE/storage/indexer/FE; isolated verification recorded on 9545 |
| Browser acceptance | A/B evidence exists; real MetaMask MVP C1–C6 and failure interactions remain pending |
| Expansion/readiness | Separate verifier, committee, appeals, slash and research features deferred; no public-network/real-funds acceptance |

The sections below include dated implementation slices. Where they describe
prototype-only behavior or a historical pending state, use the current lifecycle
documents and dated progress for the later implementation, not a global capability
claim. Prototype obligations do not move to the new contract by editing FE/BE.

## Current implementation summary

The approved [MVP milestone completion policy](./mvp-milestone-completion.md)
uses the existing resolver for evidence admission and bounded case decisions,
with no slashing or appeals. `contracts/src/FundTogetherMvp.sol` is the new
deployment boundary; it now replaces the discarded local prototype test chain. The contract, canonical
indexer, authenticated evidence API/storage and FE signing controls are now
connected and verified on a separate Anvil 9545. See
[milestone lifecycle](./milestone-lifecycle.md) for authority, storage and test
coverage. Old prototype campaigns were discarded, not migrated. Actual
MetaMask acceptance on this new application deployment remains pending.

[Financial recovery](./financial-recovery.md) adds organizer-only pull bond claims,
refund/dust counters, mined deployment identity and a local permissionless timeout
worker. Pull bond UI/indexing and failure recovery pass isolated combined
verification. The application now uses the new variant; running
the local worker continuously remains a separate step.

For local onboarding, dependencies, PostgreSQL, MinIO, Anvil and FE/BE startup,
follow the root [README](../README.md). It also separates runnable draft journeys
from the pending on-chain integration.

The minimal internal campaign dashboard is available at `#/internal/campaigns`.
Application staff roles are separate from SIWE wallet links and contract rights.
Review records include a reason, actor, dossier digest/revision and checked block;
approval intent requires a resolver transaction and indexed confirmation.
Request-changes/rejection preserves the old commitment, with organizer cancellation
and confirmed bond return before one linked editable replacement draft.
Migration 0010 adds these records. See [Internal review](./internal-campaign-review.md).
The latest user decision defers the separate verifier, appeals and 2-of-3
committee to post-MVP. MVP dispute outcomes are CONTINUE, RESUBMIT and STOP,
with permissionless timeout recovery and no bond slashing.

Authenticated `GET /refunds` and `GET /refunds/:id` now expose account-linked donor
rights at a canonical indexed checkpoint. Public campaign detail supports refund
claims, organizer cancellation during funding, funding failure finalization and
activation/evidence timeout finalization. `#/contributions` includes canonical
refund history. See [refund lifecycle](./refund-lifecycle.md) for authority,
accounting, transaction recovery and manual browser checks. Contract accounting,
ABI and database schema are unchanged by this slice.

Refund hardening now covers stateful cross-campaign escrow conservation,
multi-donor proportional refunds, duplicate claims, failed-transfer retries,
full-precision arithmetic and claim gas independent of donor enumeration.
Forced indexer replay compares canonical events, financial projections and
account-scoped API history across restart, reorg and failed-batch retry.
The fixed MVP dust policy is indefinite escrow custody without a sweep or
claim expiry; unclaimed obligations are not classified as dust.

Public campaign detail now includes a `workflow` object read at the canonical
indexed checkpoint: chain timestamp, current milestone, deadlines, refund pool,
released amount and the current milestone's indexed activation hash. The public
and organizer campaign pages explain the next actor, action and required wallet.
Donation, activation and refund controls show their blocking reason and distinguish
wallet request, submitted hash, verified receipt and indexed completion. Refund
entitlements remain in the authenticated account-linked API, never public workflow
data. Existing resolver staff use `#/internal/milestones` for evidence admission
and case decisions; donors and organizers act from campaign/evidence pages.
The separate verifier remains post-MVP. Controls require the verified MVP
deployment policy, account authorization and a SIWE-linked signing wallet.

## Repository boundaries

Editable private drafts support organizer/OWNER-authorized soft deletion with
revision checking and an explicit UI confirmation. Prepared submissions and
chain/review records remain protected; original files are retained privately.
See [draft deletion](./draft-deletion.md) for eligibility and retention.

| Directory | Responsibility | Current implementation |
|---|---|---|
| frontend/ | Forms, wallet interaction, transaction and indexed state | React/TypeScript Vite, account/organization/draft UI, resolver/publication wallet actions and indexed public feed/detail |
| backend/ | Authentication, metadata, storage and chain projections | NestJS, PostgreSQL/Drizzle, account/session auth, SIWE wallet linking, private drafts, resolver/public APIs and durable local event indexing |
| contracts/ | Financial rules and on-chain campaign state | Prototype funding/refunds; separate MVP adds resolver admission, bounded challenges, sequential settlement, proportional refunds and pull bond |
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

`#/workspace`, organization profiles and existing organization workspace URLs now
use one management dashboard in the same tab. The sidebar selects the owned
organization and exposes Campaign/Milestones/Evidence/My organizations. Campaign
lists also show legacy unassigned drafts with detail/edit/delete access. New
campaigns are created directly in the selected organization; no stored draft is
silently reassigned. Campaign create/list is connected
to organization-scoped APIs. Detail/edit includes ordered milestone plans.
The Campaign list groups records into Drafts, Frozen dossiers and Public, with
counts/empty states. Public placement uses the indexed publication API; older
unassigned drafts are nested under Drafts. Published entries link to their public
detail page. Approval intent by itself does not qualify as publication.
The Milestones view selects a campaign. Evidence navigation selects campaign and
saved milestone, with a report draft editor using the existing evidence APIs.
Report fields, dates and criterion outcomes are editable. Private upload/download
uses local MinIO and the saved draft revision. This private-editor slice left
expense editing pending; freeze and explicit public redaction were subsequently
connected in the separate MVP lifecycle described above. The historical
authenticated HTTP/PostgreSQL/MinIO journey passes
63 checks including authorization, persistence and revision races; browser form
interactions remain unverified. Evidence creation requires the current milestoneId
and checks its campaign/index binding under a transaction lock.
See [private evidence upload setup](./backend-step-5-evidence-upload.md).
Legacy user-owned drafts remain accessible within this shared dashboard.

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
- `FundTogether` composes three abstract modules: funding/bond/refunds,
  milestone activation/challenge/settlement, and evidence/verification/timeouts.
  They share `FundTogetherBase` storage, roles, reentrancy protection and internal
  accounting helpers. `FundTogetherConfigured` remains the deployment boundary;
  all modules compile into one contract holding the funds. See the
  [source map and custody rules](../contracts/README.md#directory-convention).
- Follow [contracts setup](../contracts/README.md) to clone dependencies and run tests.

## Development network and gas

Local integration targets Anvil with ERC20 MockUSDC (6 decimals); native test ETH
pays transaction gas. ERC20 names the token standard, not the network. Arc testnet
remains the earlier candidate for later public evaluation; this work is deferred
during MVP consolidation. Sepolia is an optional fallback proposal. Arc is
the preferred production candidate, pending acceptance. Solidity/EVM
does not imply an Ethereum mainnet deployment. Contract tests do not prove a live
FE/BE integration deployment. See [network and gas specification](../v0.2/FundTogether_Development_Network_and_Gas_v0.1.md)
and [TypeScript conventions](./web3-conventions.md).

The current direct-wallet flow requires native gas and allowance where applicable.
MockUSDC has no permit/EIP-3009; relayer/paymaster support is not implemented.
Anvil account funding must not hide zero-native-balance cases in future UX tests.

Local Anvil stays the dev baseline. The existing Arc evaluation proposal describes
a shared native gas balance (18 decimals) and ERC20 balance
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
In the current prototype the deployer is the trusted resolver. Target MVP staff
resolver responsibilities are campaign approval after system checks and
arbitration after evidence/challenge checks, response and re-verification fail
to resolve the case. Only the organizer can lock the campaign
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
This paragraph describes the prototype limitation: its CHALLENGED state has no
exit. The separate MVP implements bounded case recovery and pull bond credit.
FE/BE share generated artifacts under `backend/src/blockchain/generated`;
after the authorized test reset on 2026-10-07 the application manifest identifies
the new MVP. The prototype limitations above are historical.

## Integration checkpoints

The user-confirmed [verification/resolver workflow](./verification-and-disputes.md)
requires system checks and organizer corrections before submitted campaign
dossiers reach an authorized resolver, who may be platform staff. Resolver
approval is required before organizer publication. Evidence and challenge each
have checks; response/re-verification precede arbitration of unresolved or
deadline-escalated disputes. Resolver participates in MVP.

Campaign review/request-changes/rejection and publication are connected locally.
The newer MVP evidence/case/response/decision integration has isolated test
evidence; real browser acceptance and a separate application MVP deployment
remain pending. The configured resolver is immutable. Earlier committee and
verifier proposals are deferred; they are not actors required by the current MVP.

Backend metadata and frontend wallet/form foundations can proceed independently.
Before integrating contract actions, agree the relevant ABI/events, generate
shared artifacts, deploy locally and test the intended journey. Chain state then
flows through events to an idempotent indexer and database projection.

Create/publish, donate and pre-funded refund are integrated journeys. Evidence
and settlement controls require the separately verified MVP capabilities. Transaction
receipt success and indexed application state must remain distinct.

## Verification and limits

Historical contract verification (2026-10-05): the module refactor passed 165 tests
across thirteen suites, with 256 runs per fuzz test, before and after extraction.
All 28 original function/constructor bodies are preserved. Both deployment
targets retain ABI encoding, selectors and storage layout (20/21 entries);
runtime bytecode excluding compiler metadata is identical. Enum source names
move to `FundTogetherBase`, requiring test reference changes only. The existing
deployment and generated integration artifacts were not replaced.
Existing Foundry lint warnings remain. This is a prototype with standard
exact-transfer ERC20 assumptions, incomplete dispute recovery and persistent
token transfer failure limitations. FE/BE builds were not rerun for this task.

See [progress and history](./PROJECT_PROGRESS.md) for dated evidence and
[financial rules](./financial-rules.md) for approved accounting behavior.

## Private draft dashboard — 2026-10-04

Historical slice below: the separate personal dashboard was replaced on
2026-10-05 by the unified management dashboard described above. It no longer
stays mounted behind public pages. Leaving its wizard discards unsaved React
input; saved drafts and persisted wallet transaction recovery remain available.

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

This is the historical 2026-10-03 planning checkpoint. The current priority is
MVP consolidation. Later local indexing and milestone verification are recorded
above and in progress; they do not satisfy public-network acceptance.

The [dated milestone review](../v0.2/FundTogether_Milestone_Review_2026-10-03.md)
separates implemented slices from target design across all ten milestones.
Arc Foundry, runtime/USDC validation, shared deployment artifacts, idempotent
indexing and integrated journeys are TODO. Contract settings pin Solidity 0.8.24;
an Arc-compatible compiler/EVM target has not been verified.

Prototype CHALLENGED has no exit. Admission/organizer inactivity recovery and
unreleased-escrow refunds now compile but need runtime verification; dispute
resolution, slash and permanent transfer-failure recovery remain blockers.

Campaign private drafts now store nullable budgetUnits (USDC base units, string over the API). New/updated drafts require positive budgets and a uint256-safe sum; legacy drafts require budget completion. The wizard derives goal and maximum-budget bond using bigint and asks for bond confirmation in a popup after milestones. Local wallet submission, bond locking and approval/publication integration are implemented; manual browser signing remains unverified.

## Linked wallet information — 2026-10-04

The account page now displays cards for verified linked wallets: full address,
copy action, configured network/chain ID and native balance read from the RPC.
Each card reads the stored address and chain independently of the current browser
connection. Loading/error/unsupported-network states, manual refresh and 30-second
polling are present; RPC errors do not imply a zero balance. Cache keys include
account identity. The configured local RPC is8545 for A or9547 for B, with an
eight-second timeout. As of2026-10-09, each card also reads MockUSDC from the
active deployment's token address with6 decimals, separately from ETH for gas.
Token loading/errors and zero balances are distinguished; an unsupported chain
does not read the active deployment's token. Refresh updates both balances.
Bond information
belongs to organizer campaign management; it is not part of this personal view.

Local campaign submission now uses FundTogetherConfigured with an immutable configured MockUSDC and organizer-scoped draft keys. FE/BE share generated ABI/deployment files under backend/src/blockchain/generated. Authenticated submission prepare/get/sync endpoints freeze private draft metadata and verify campaign/bond state directly on chain; campaign listing retains submitted entries. Resolver review and organizer publication use wallet signatures. Canonical CampaignPublished indexing gates the public feed/detail. See [campaign submission](./campaign-submission.md) and [publication/indexer](./campaign-publication-indexer.md). Donate/refund UI and the full evidence/dispute journey remain pending.

## Atomic campaign submission — 2026-10-05

New FundTogetherConfigured artifacts expose submitCampaignForDraft(draftKey, name,
deadline, budgets, criteriaHashes). It creates the organizer-scoped campaign,
commits all milestone hashes and transfers the maximum-budget bond in one guarded
transaction. ERC20 allowance approval remains separate. Existing events and
prepare/get/sync API contracts are preserved; financial state remains on-chain.
The shared deployment manifest enables this path with atomicSubmission: true.
The running local deployment now enables this path after Anvil reset and
user-authorized database cleanup. Its genesis is
0x5c9db063266c0e809a48728aa5ec67c86edd9b4985eea071b6bd804f4bccdf5f;
existing frozen plans were removed during cleanup rather than rebound.
At this historical checkpoint the launcher saved `.local/anvil/state.json` every
five seconds. After the 2026-10-06 recovery, active snapshots are in native Ubuntu
storage with 60-second autosave; the Windows file is a backup copied after clean
exit when the launcher continues. See README for current startup/restore semantics.
Genesis, block hash, receipt and code were
verified across a real restart; backend indexer is ready at block 2/2.
