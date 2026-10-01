# FundTogether Contracts

This directory will contain the Foundry smart-contract prototype for the MVP.

The first implementation is intentionally a single-campaign prototype. It must prove the state machine and accounting before the protocol is split into separate modules.

## Planned first slice

```text
create campaign
→ lock MockUSDC bond
→ accept contributions
→ finalize funding
→ activate sequential milestone
→ commit evidence hash
→ open/resolve challenge
→ settle milestone
→ create refund pool
→ claim refund
```

## Toolchain

Required tools:

```text
Foundry (forge, cast, anvil)
OpenZeppelin Contracts
```

The current Windows environment does not have Foundry installed and has no configured WSL distribution. Do not treat contract code as verified until `forge build` and the test suite run successfully.

## Directory convention

```text
contracts/
├── src/
├── test/
├── script/
├── lib/
├── foundry.toml
└── README.md
```
