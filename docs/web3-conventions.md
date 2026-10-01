# FundTogether Web3 Conventions

> **Status:** Approved engineering baseline
> **Version:** 0.1
> **Updated:** 2026-10-02
> **Purpose:** Shared conventions for contracts, backend, indexer and frontend

This document defines shared technical conventions. It does not replace protocol rules in `protocol-spec.md`, `state-machine.md` or `financial-rules.md`.

## 1. What must be fixed before contract implementation

These items cannot be deferred because they change financial truth or authorization:

- donation and bond asset;
- campaign and milestone states;
- who may call each transition;
- milestone ordering;
- release and refund accounting;
- challenge outcome and bond allocation;
- double-call protection;
- event names and indexed identifiers;
- token amount and rounding rules.

## 2. What may be configured later

These items may remain environment or deployment configuration as long as their effect is documented:

- Anvil versus Sepolia RPC URL;
- contract addresses per environment;
- confirmation depth;
- resolver address or resolver role assignment;
- review and resolver timeout durations, once their outcomes are fixed;
- storage provider endpoint;
- indexer polling interval and batch size.

Changing any configurable value that changes user rights or financial outcomes requires a protocol decision and migration plan.

## 3. Networks and deployment

```text
local development : Anvil
validation        : Sepolia
production        : not selected yet
```

Every environment must identify:

```text
chainId
rpcUrl
donationTokenAddress
campaignContractAddress
deploymentBlock
abiVersion
```

Contract addresses must never be hardcoded in feature components. Store deployment metadata in a versioned shared artifact consumed by frontend, backend and indexer.

## 4. Identifiers and addresses

- Ethereum addresses are normalized to checksum form at application boundaries and compared case-insensitively where appropriate.
- On-chain IDs use the contract's integer or bytes identifier; API responses may expose a string representation.
- Database records use UUIDs for application entities and retain chain identifiers separately.
- A chain-derived record is identified by `chainId + contractAddress + onchainId`.
- An event record is idempotently identified by `chainId + transactionHash + logIndex`.

## 5. Amounts and numeric types

- Solidity uses integer token units.
- TypeScript uses `bigint` for token amounts and block numbers when precision matters.
- JSON API responses serialize large numeric values as decimal strings.
- UI formatting applies token decimals only at the presentation boundary.
- No `number`, floating point arithmetic or implicit decimal conversion is allowed in financial code.

Example API shape:

```json
{
  "amount": "1000000",
  "decimals": 6,
  "symbol": "mUSDC"
}
```

## 6. Contract naming and events

Use PascalCase for Solidity types and events, camelCase for functions and variables, and explicit action names:

```text
CampaignCreated
ContributionReceived
FundingFinalized
BondLocked
MilestoneActivated
EvidenceSubmitted
ChallengeOpened
MilestoneSettled
CampaignCancelled
RefundAvailable
RefundClaimed
BondReturned
BondSlashed
```

Events must include identifiers needed by the indexer. Prefer explicit event fields over requiring the indexer to reconstruct meaning from unrelated calls.

## 7. Transaction lifecycle

Every layer uses the same conceptual lifecycle:

```text
IDLE
→ WALLET_REQUESTED
→ USER_REJECTED or SUBMITTED(txHash)
→ INCLUDED_SUCCESS or INCLUDED_REVERTED
→ CONFIRMED
→ INDEXED
```

These states have different meanings:

- `SUBMITTED`: a transaction hash is known; final outcome is unknown.
- `INCLUDED_SUCCESS`: the receipt succeeded in a block.
- `CONFIRMED`: the application confirmation policy is satisfied.
- `INDEXED`: the backend projection has processed the relevant event.

No API or UI may report a financial operation as complete from `SUBMITTED` alone.

## 8. Contract, backend and indexer boundaries

```text
BlockchainService
→ public client, contract reads, transaction/receipt access

IndexerService
→ block ranges, event decoding, checkpoint, retry, idempotent projection

Domain service
→ metadata workflow and authorization; never replaces contract guards

Frontend
→ wallet UX, API projection, transaction state and retry guidance
```

The backend may create a draft or publish intent. The wallet sends the user-authorized transaction. The contract decides whether it is valid. The indexer makes the result queryable.

## 9. Errors and retries

Classify errors at the boundary:

```text
USER_REJECTED
CONTRACT_REVERTED
NETWORK_ERROR
API_ERROR
INDEXING_PENDING
INVALID_STATE
UNAUTHORIZED
```

Do not blindly retry a transaction after an HTTP timeout. First check whether a transaction hash was broadcast and query its receipt or chain state.

Indexer jobs must be safe to run again. A duplicate event must not duplicate a contribution, refund, bond or milestone transition in PostgreSQL.

## 10. ABI and versioning

- ABI is generated from the contract build artifact.
- Frontend, backend and indexer consume the same versioned ABI.
- Contract address and ABI version are recorded together.
- A public event or function change requires an ABI version review.
- Never edit generated ABI files manually.

## 11. Security baseline

Every financial action must have:

```text
authorization check
state check
deadline check
amount bound
reentrancy consideration
double-call protection
event emission
```

Admin or resolver powers must be explicit in the protocol and visible in the threat model. A backend role or hidden UI button is not an on-chain permission.

## 12. Deferred decisions

The following are intentionally outside the first Web3 core iteration:

- EIP-712 verifier signatures;
- multisig resolver governance;
- private evidence encryption;
- multiple assets and native ETH;
- cross-chain deployment;
- on-chain reputation registry;
- Merkle batching for evidence commitments.

They may be added only after the single-campaign prototype, tests and event model are stable.

