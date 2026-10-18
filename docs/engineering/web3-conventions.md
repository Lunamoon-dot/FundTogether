# FundTogether Web3 conventions

> **Status:** Current engineering conventions for the Campaign local pilot.

## Sources of truth

- Smart contract state owns pledge, escrow, release, dispute, payout and refund transitions.
- PostgreSQL stores application metadata and indexed projections; it does not override canonical chain state.
- MinIO stores private evidence and final PDF bytes; their recorded SHA-256 values bind reviewed content.
- Frontend state is a view and recovery surface, never proof that a transaction finalized.

## Transaction lifecycle

```text
wallet request
  -> submitted transaction hash
  -> successful canonical receipt
  -> required event decoded
  -> idempotent indexer projection
  -> product action complete
```

A rejected wallet request, reverted receipt, wrong contract/event, orphaned log or
missing projection is not success. Post-receipt indexer delay is a recoverable
`indexing` state, not permission to submit the financial action again blindly.

## Identity and authorization

- Never trust a wallet address supplied by the client as authentication.
- Link wallets and authenticate protected actions with SIWE/signature verification.
- Role checks and wallet checks are separate: a Resolver account must also use the contract-authorized Resolver wallet where a signature is required.
- Compare EVM addresses case-insensitively after validation; never expose private keys or seed phrases.

## Amounts and time

- Token values use integer base units and `bigint`; never floating point.
- MockUSDC has 6 decimals in the local pilot.
- Contract deadlines use chain timestamps. Passing a deadline does not itself submit a transaction or update an indexer projection.
- UI dates are display values; policy eligibility comes from canonical contract state.

## Events and indexing

Indexer identity is `(chainId, contractAddress, transactionHash, logIndex)`.
Handlers must be idempotent, preserve orphan/reorg history and avoid duplicate
entitlements, refunds or payouts. Historical contract state is decoded through
its explicit historical indexer; never mix it with the current Campaign state
enum merely because numeric values overlap.

## Delivery

An accepted release is downloadable only when the authenticated account has a
current canonical, non-refunded entitlement and the PDF/release/production hash
metadata matches. Missing or mismatched metadata is `DELIVERY_UNAVAILABLE`, not
an implicit success. Download tickets must be short-lived and recheck access.

## Naming boundary

Keep `/v1/fundtogether`, `campaigns`, `CampaignModule`, `FUNDTOGETHER_V1`, Campaign
deployment manifests, ABI symbols and stream identities stable. Historical records
use an explicit `historical` namespace and never leak into the current Campaign
wire routes.

