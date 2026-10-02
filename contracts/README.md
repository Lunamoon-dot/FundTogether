# FundTogether Contracts

This directory contains the Foundry contract prototype. `FundTogether` manages
multiple campaigns with separate accounting in one contract. Implemented flows
include approval, publication, token donations, organizer bond locking and
pre-funded cancellation/failure refunds. Unpublished drafts and approved campaigns
can also be cancelled to recover their bond, including after the deadline.
Milestones and slashing remain planned.

## Toolchain

Foundry runs in WSL Ubuntu 24.04 on this workspace. Dependencies are pinned Git
submodules in `lib/`: OpenZeppelin Contracts v5.4.0 and forge-std v1.17.0.
`foundry.toml` pins Solidity 0.8.24.

## Directory convention

```text
contracts/
├── src/
│   └── FundTogether.sol             # Protocol implementation
├── test/
│   ├── mocks/
│   │   ├── MockUSDC.sol             # Mintable test token
│   │   └── RefundCallbackToken.sol  # Adversarial token callback fixture
│   └── unit/
│       ├── MockUSDC.t.sol
│       └── FundTogether/
│           ├── FundTogether.t.sol
│           ├── FundTogetherErc20.t.sol
│           ├── FundTogetherBond.t.sol
│           ├── FundTogetherFunding.t.sol
│           ├── FundTogetherCancellation.t.sol
│           └── FundTogetherRefund.t.sol
├── lib/                            # External dependencies
├── foundry.toml
├── foundry.lock
└── README.md
```

`src/` contains protocol code. Test tokens and adversarial fixtures belong in
`test/mocks/`; test suites are grouped by the contract and behavior they verify.
Small caller helpers used by one suite remain next to that suite. `out/` and
`cache/` are generated and ignored by Git.

Deployment scripts will go in `script/` when an actual deployment flow is added.
The single protocol contract keeps state transitions and fund custody together;
splitting it into modules requires a concrete ownership and authority design.

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
