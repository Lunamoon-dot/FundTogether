# Backend step 6 — Organization representative wallet

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


Updated: 2026-10-04

## Scope and data flow

An organization initially uses a verified wallet belonging to its creator as its
representative wallet. Account identity and OWNER membership remain separate from
wallet control. Organization and metadata-draft creation require no wallet.
No new wallet, private key or custody service is created.

```text
Account signs SIWE -> wallet_links
Creator with current OWNER membership selects one linked address + chain
  -> PUT /organizations/:organizationId/wallet
  -> lock organization, membership and verified wallet link
  -> persist representative_wallet_link_id
GET /organizations -> representativeWallet { address, chainId } or null
```

## API and authorization

PUT requires session and configured browser Origin. Strict UUID/body validation
rejects malformed or additional fields. Body:

```json
{ "address": "0x1111111111111111111111111111111111111111", "chainId": 31337 }
```

- Only the creator with current OWNER membership can select.
- Address/chain must match a stored SIWE-verified wallet link owned by the creator.
  Client-provided addresses alone do not prove control.
- Inaccessible organizations, removed membership and missing/foreign links return
  403. Malformed input returns 400.
- Initial selection returns 200 with organizationId and representativeWallet.
  Repeating the same selection returns 200 without changing timestamps. Selecting
  a different wallet after binding returns 409.
- Organization row locking serializes competing selections; membership/wallet
  share locks preserve authorization until commit. Failure rolls back selection.

## Persistence and chain boundaries

Migration 0006_organization_wallet adds a nullable FK to wallet_links. Existing
organizations remain unbound. The same creator wallet may represent multiple
organizations. The FK prevents deleting a referenced wallet link; future unlink
and replacement flows must explicitly handle these references.

Selection is fixed in this initial slice. Changing MetaMask account/network,
adding a personal wallet or signing in again does not change it. Membership does
not transfer a private key or on-chain authority.

Contract createCampaign currently records msg.sender as campaign organizer.
Future publication must require the selected representative wallet to sign and
verify the mined organizer before binding metadata. Existing on-chain campaign
organizers do not follow profile changes. Publication, deployment, wallet rotation
and campaign binding remain pending. Donations/bonds stay in escrow; this API
moves no funds.

## Frontend

My organizations shows the saved wallet or unbound status. View profile opens the
wallet section. The creator chooses from /auth/session's verified wallets and
explicitly confirms. A single wallet is suggested; multiple wallets need a choice.
No linked wallet shows an account-linking shortcut. Refresh supports linking in
another tab. Browser-wallet state is not treated as the saved organization wallet.
Pending/error states are explicit.

## Verification

- Smoke failed before implementation because the response had no wallet state.
  After migration/build, 32 HTTP checks pass using disposable signed wallets.
- Covers wallet-free creation, anonymous/outsider rejection, signed ownership,
  wrong chain, malformed input, revoked membership, another OWNER, idempotency,
  immutable selection, persistence across login and concurrent initial picks.
- Seven added unit checks; full backend suite: 32 tests/10 suites pass.
- Existing campaign smoke: 22 checks; evidence/PostgreSQL/MinIO smoke: 63 checks.
  Temporary accounts, organizations, wallet links and storage fixtures removed.
- Frontend lint and TypeScript/Vite build pass; existing bundle warning remains.
  Live backend OpenAPI exposes the new PUT route. Interactive browser/MetaMask
  selection remains unverified; API checks do not constitute a browser journey.
