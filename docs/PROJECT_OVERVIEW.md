# FundTogether Project Overview

> Updated: 2026-10-03
> Scope: current repository and verified contract prototype

## Repository boundaries

| Directory | Responsibility | Current implementation |
|---|---|---|
| frontend/ | Forms, wallet interaction, transaction and indexed state | React/TypeScript Vite starter UI with API/Web3 boundaries |
| backend/ | Authentication, metadata, storage and chain projections | NestJS foundation, health and metadata schema; evidence parser/metadata ownership service; no domain routes, SIWE or indexer |
| contracts/ | Financial rules and on-chain campaign state | Funding, bond, pre-funded refunds, sequential evidence/review and unchallenged settlement |
| docs/ | Approved rules, current implementation and history | Protocol, financial rules, state machine and progress |

The evidence parser/metadata ownership service is local work in progress and is
not included in this documentation publication. Published backend code remains
the foundation until that implementation is committed separately.

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
Rejection records a reason and permits a new version while retaining history.
Review lasts a fixed 72 hours from acceptance, not the initial submission.
Donors can challenge strictly before reviewEnd. Anyone can settle an unchallenged
milestone at or after reviewEnd, paying its budget to the organizer. Settlement
advances the index; final settlement completes the campaign and returns bond
atomically. totalReleased records donor funds paid out, excluding bond.

The interface is still evolving: challenge resolution and post-funded recovery
are not implemented. Admission timeout and resubmit limits are absent. CHALLENGED
has no exit and an organizer who never submits
evidence can still leave funds stuck. There are no verified deployment addresses or generated
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

Current contract verification: 129 passing tests across eleven suites, including
four fuzz tests with 256 runs each. Build succeeds with six timestamp lint warnings
and two intentional input-validation loop warnings. This is a prototype, with
standard exact-transfer ERC20 assumptions and incomplete post-funded recovery.
FE/BE builds were not rerun for this contract task.

See [progress and history](./PROJECT_PROGRESS.md) for dated evidence and
[financial rules](./financial-rules.md) for approved accounting behavior.

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

Prototype CHALLENGED has no exit; admission/organizer inactivity recovery and
post-funded refund/slash remain blockers before accepting real funds.
