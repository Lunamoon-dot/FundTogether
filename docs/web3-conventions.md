# FundTogether Web3 Conventions

> **Status:** Approved engineering baseline
> **Version:** 0.3
> **Updated:** 2026-10-03
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

- Anvil local versus Arc testnet RPC URL; Sepolia optional fallback;
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
local token       : ERC20 MockUSDC (6 decimals)
local gas         : native test ETH
validation        : Arc testnet prioritized; not integrated/deployed
fallback          : Sepolia optional; not deployed
production        : Arc preferred candidate; acceptance gate open
```

Every environment must identify:

```text
chainId
rpcUrl
nativeCurrency (name, symbol, decimals)
donationTokenAddress
donationTokenDecimals
campaignContractAddress
deploymentBlock
abiVersion
```

Contract addresses must never be hardcoded in feature components. Store deployment metadata in a versioned shared artifact consumed by frontend, backend and indexer.

ERC20 is a token standard, not a network. EVM development does not select
Ethereum mainnet for production. Avalanche C-Chain is a possible target that
requires verification; network changes do not move escrow or refund rights.

Arc testnet is an approved evaluation candidate, not a production selection.
Native gas and donation have different roles but may share one asset/balance
on Arc. See [Arc evaluation](../v0.2/FundTogether_Arc_Evaluation_v0.1.md).

## 4. Identifiers and addresses

- Ethereum addresses are normalized to checksum form at application boundaries and compared case-insensitively where appropriate.
- On-chain IDs use the contract's integer or bytes identifier; API responses may expose a string representation.
- Database records use UUIDs for application entities and retain chain identifiers separately.
- A chain-derived record is identified by `chainId + contractAddress + onchainId`.
- An event record is idempotently identified by `chainId + transactionHash + logIndex`.

## 5. Amounts and numeric types

- Solidity uses integer token units.
- TypeScript uses `bigint` for token amounts and block numbers when precision matters.
- Native balances, gas limits, gas prices and fee totals also use `bigint`.
- JSON API responses serialize large numeric values as decimal strings.
- UI formatting applies token decimals only at the presentation boundary.
- No `number`, floating point arithmetic or implicit decimal conversion is allowed in financial code.

Safe metadata such as token decimals and SDK chain IDs may use `number`.
Never convert financial quantities with Number/parseFloat or serialize bigint
directly in JSON; financial DTO fields must be decimal strings.

Illustrative TypeScript boundary (not a generated artifact or deployed config):

```ts
import type { Address } from 'viem';

type DeploymentMetadata = {
  chainId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  donationToken: { address: Address; symbol: string; decimals: number };
  donationGasBalance: 'independent' | 'shared'; // verified per chain/token, not inferred from symbol
  campaignContractAddress: Address;
  deploymentBlock: bigint;
  abiVersion: string;
};

type FeeQuote = {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  executionFeeCap: bigint; // gasLimit * maxFeePerGas, in native base units
};

type FeeQuoteDto = {
  gasLimit: string;
  maxFeePerGas: string;
  executionFeeCap: string;
};
```

Execution fee cap is not a universal total-fee formula: include reserve,
transaction value and chain-specific additional fees where applicable.

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
MilestoneConfigured
MilestoneCriteriaConfigured
CampaignApproved
BondLocked
CampaignPublished
DonationReceived
FundingFinalized
MilestoneActivated
EvidenceSubmissionCreated
VerifierAssigned
SubmissionVerified
SubmissionRejected
ChallengeOpened
MilestoneSettled
CampaignCompleted
CampaignCancelled
RefundPoolSnapshotted
BondReturned
RefundClaimed
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

## 13. Gas payment and dev assumptions — 2026-10-03

Current dev uses direct EOA execution on Anvil with MockUSDC and native test ETH.
Donation/bond asset and gas asset are separate. Sponsorship is a discussed
extension, not implemented or provider-selected. See
[network and gas design](../v0.2/FundTogether_Development_Network_and_Gas_v0.1.md).

- Check chain, token balance, allowance and native fee budget before direct sends.
  Approve only when allowance is insufficient; track each transaction separately.
- Direct refund/challenge/organizer/verifier actions also need native gas.
- Anvil-funded accounts can hide missing-gas UX; test zero native balance explicitly.
- MockUSDC has no permit/EIP-3009; authorization mocks/guards are required for relayer work.
- Relayers cannot substitute for donor authentication: msg.sender controls rights.
- Operating gas funds are separate from donor escrow and bond. Fee charging or
  sponsorship requires an explicit policy; no automatic deduction from donation.

## 14. Arc priority target and shared USDC balance

Arc native USDC uses 18 decimals; ERC20 USDC uses 6. They expose the same balance.
Keep bigint/unit boundaries explicit and avoid duplicate balance display.
Fee amounts cannot be added to donation units without scaling. For a direct
send, reserve approve/donate gas from the shared balance before determining max
donation; refresh after approval and respect remaining goal/allowance.

Shared balance means native/erc20 balances are not independent affordability
checks. Sponsorship still requires separate implementation if the app pays fees.
Gross refund entitlement must remain separate from the recipient's net balance
change after paying gas. Do not treat direct token/native sends as contributions.

USDC movements may emit native and ERC20 logs for the same transfer. Select the
intended emitter/decimal scale; logIndex deduplication alone does not prevent
double-counting across streams. Index protocol events for contribution/refund
rights. Adapt finality policy per chain and retain receipt/indexing separation.
These are documented requirements, not implemented Arc adapters or verified journeys.

### Arc implementation requirements — TODO

- Read committed block/receipt as final under Arc consensus; require receipt status
  success before projecting a financial action. Final execution can also revert.
- Pending timeout or underpriced transaction without a receipt is unresolved.
  Reconcile hash/nonce with the wallet/RPC before retrying; do not duplicate sends.
- Keep native balance/value/gas in 18-decimal bigint units and ERC20 amounts in
  6-decimal bigint units. A native transfer uses parseUnits(value, 18).
- Configure bounded RPC batches/retry: current public eth_getLogs reference allows
  10,000-block spans, recommends at most 9,999; shrink on -32012 and back off on
  -32014 (load-balanced head mismatch). Recheck limits for the selected provider.
- Current fee floor/reference values are dated network data, not a fixed product
  fee. Query estimates; retain fee reserve for every direct caller.
- Arc Foundry/runtime validation is TODO; regular Anvil does not reproduce native
  USDC, blocklist behavior or system logs.

See [Arc sources and validation gates](../v0.2/FundTogether_Arc_Evaluation_v0.1.md).
No generated chain adapter/configuration is claimed by these conventions.

