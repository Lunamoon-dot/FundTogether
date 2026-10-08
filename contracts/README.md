# FundTogether Contracts

## Approved MVP milestone boundary — 2026-10-05

`src/FundTogetherMvp.sol` is a new-deployment variant of the prototype described
below. The existing resolver admits evidence and handles one final case per
version with fixed 7-day response and 7-day resolution windows. CONTINUE keeps
the original review, RESUBMIT requires a fresh version/admission/review, and
STOP/timeout refunds unreleased donor escrow while returning bond without slash.
Legacy verifier entrypoints revert in this variant; separate verifier actors,
appeals and penalties are post-MVP. See [the approved policy](../docs/mvp-milestone-completion.md).

New recovery source credits bond for organizer-only `claimBond` separately from
terminal transitions. `refundAccounting` distinguishes dust from unclaimed rights
without donor loops. Constructor requires a nonzero public deployment ID. See
[financial recovery](../docs/financial-recovery.md).

Source and prepared regression tests compile; behavior is not yet tested for
this variant. The existing application deployment/ABI is unchanged. Evidence
storage, case indexing and signing UI must be integrated before enabling it.

## Existing prototype

This directory contains the Foundry contract prototype. `FundTogether` manages
multiple campaigns with separate accounting in one contract. Implemented flows
include approval, publication, token donations, organizer bond locking and
pre-funded cancellation/failure refunds. Unpublished drafts and approved campaigns
can also be cancelled to recover their bond, including after the deadline.
Milestone budgets are fixed at creation; goal is their sum and bond is their
maximum. The funded organizer can activate the first milestone without moving
tokens. Organizers commit each milestone's acceptance criteria hash while DRAFT;
approval requires all criteria and freezes them. Criteria content stays off-chain.
Evidence creates an immutable pending version. OpenZeppelin AccessControl lets
the deployer admin grant/revoke verifier roles and assign/reassign pending reviews.
Only the assigned active verifier can accept/reject the exact version/hash;
organizers cannot review their own campaigns. Rejection permits a new version
without deleting history. Acceptance starts a fixed 72-hour review. Donors can challenge before expiry;
anyone can settle an unchallenged review at/after expiry. Settlement pays the
milestone budget to the organizer, advances sequentially and returns bond on
final completion. Activation has 7 days, initial evidence 30 days, admission
72 hours and corrections 7 days, with at most 3 versions per milestone. Anyone
can execute eligible timeouts. Rejection/expiry of the final version or organizer
inactivity ends FAILED, refunds unreleased escrow proportionally and returns bond
without slash. See [defaults and recovery](../docs/contract-evidence-timeouts.md).
Dispute resolution/slashing remain planned; CHALLENGED still has no exit.
Permanent token transfer failure is another unresolved recovery limitation.

## Toolchain

Foundry runs in WSL Ubuntu 24.04 on this workspace. Dependencies are pinned Git
submodules in `lib/`: OpenZeppelin Contracts v5.4.0 and forge-std v1.17.0.
`foundry.toml` pins Solidity 0.8.24.

## Directory convention

```text
contracts/
├── src/
│   ├── FundTogether.sol             # Composes the protocol modules
│   ├── FundTogetherConfigured.sol   # Token restriction and atomic draft submission
│   └── modules/
│       ├── FundTogetherBase.sol     # Shared storage, roles, events and accounting helpers
│       ├── FundTogetherFunding.sol  # Creation, approval, bond, donations and refunds
│       ├── FundTogetherMilestones.sol # Activation, challenge and settlement
│       └── FundTogetherEvidence.sol # Evidence versions, verification and timeouts
├── test/
│   ├── mocks/
│   │   ├── MockUSDC.sol             # Mintable test token
│   │   ├── RefundCallbackToken.sol  # Adversarial token callback fixture
│   │   └── SettlementCallbackToken.sol # Release callback/transfer failure fixture
│   ├── helpers/
│   │   └── CampaignFixtures.sol    # Shared test budget fixtures
│   └── unit/
│       ├── MockUSDC.t.sol
│       └── FundTogether/
│           ├── FundTogether.t.sol
│           ├── FundTogetherErc20.t.sol
│           ├── FundTogetherBond.t.sol
│           ├── FundTogetherFunding.t.sol
│           ├── FundTogetherCancellation.t.sol
│           ├── FundTogetherMilestone.t.sol
│           ├── FundTogetherCriteria.t.sol
│           ├── FundTogetherSettlement.t.sol
│           ├── FundTogetherVerifier.t.sol
│           ├── FundTogetherRefund.t.sol
│           ├── FundTogetherTimeout.t.sol
│           └── FundTogetherConfigured.t.sol
├── lib/                            # External dependencies
├── foundry.toml
├── foundry.lock
└── README.md
```

`src/` contains protocol code. Test tokens and adversarial fixtures belong in
`test/mocks/`; test suites are grouped by the contract and behavior they verify.
Small caller helpers used by one suite remain next to that suite. `out/` and
`cache/` are generated and ignored by Git.

The prototype creation API is `createCampaign(name, token, deadline, budgets)`.
Manual goal/bond arguments were replaced by the committed budget list. The ABI
is still under development until dispute resolution and recovery are
implemented; generated integration artifacts must track the exact contract build.

Local deployment uses `../backend/scripts/deploy-local.cjs` and targets
`FundTogetherConfigured`. The modules are abstract Solidity base contracts,
compiled into that single deployed contract. They share one storage instance,
one AccessControl role store and one ReentrancyGuard. They are not separately
deployed services, proxies or external library calls.

Keep all storage declarations and enum ordering in `FundTogetherBase`.
Funding, milestones and evidence inherit this common base directly; they do not
inherit one another. The base owns the internal deadline, refund snapshot and
bond return helpers needed by multiple flows. New behavior belongs in its
responsible module; shared helpers belong in the base only when needed across
flows. Solidity callers reference enums through `FundTogetherBase.CampaignState`
(and the other base enums); instance calls still use `FundTogether`.

Donor escrow and organizer bond remain separately accounted for at one address.
Only authorized, state-checked entry points can move funds: organizer bond
locking, donor contribution/refund, eligible milestone settlement and terminal
bond return. Failed transfers revert the complete transaction; claim flags and
state transitions prevent repeat payments. CHALLENGED recovery and persistent
token transfer failures remain the limitations described above.

The 2026-10-05 module refactor preserves function/event/error ABI encoding and
storage layout. Enum `internalType` names now identify `FundTogetherBase`.
Runtime instructions are identical to the pre-refactor build after removing
compiler metadata, but metadata changes the full bytecode hash. Existing local
deployment manifests and their ABI remain tied to the existing deployment;
regenerate them together only when intentionally deploying a new build.

## Run locally

Clone with dependencies:

```bash
git clone --recurse-submodules https://github.com/Lunamoon-dot/FundTogether.git
```

For an existing checkout, initialize the pinned dependencies from the repository root:

```bash
git submodule update --init --recursive
```

In WSL:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd /mnt/c/Users/dell/Desktop/FundTogether/contracts
forge build
forge test -vv
```

Run only the refund suite:

```bash
forge test --match-contract FundTogetherRefundTest -vv
```

Foundry discovers `.t.sol` files recursively, so the nested folders need no
configuration change. Tests execute the real protocol contract against test
tokens; neither the test suites nor mocks are production deployment targets.

See [project progress](../docs/PROJECT_PROGRESS.md) for verified results and
remaining limitations, and [financial rules](../docs/financial-rules.md) for
the approved accounting behavior.
