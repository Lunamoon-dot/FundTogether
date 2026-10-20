# Wallet-only authentication

> Wallet-only authentication proves control of an account key; it does not
> prove one-human identity or grant review authority. Under the new target
> protocol, Judge authority comes from canonical stake/court assignment and
> contract state, not from the account session or an Admin/Resolver role.

> **Status:** Current Phase 1 boundary, 2026-10-20.

FundTogether now uses a connected wallet and a signed SIWE message as its only
login method. Email and password are not an application login path. The
`users.email` and `users.password_hash` columns remain nullable compatibility
fields while the migration is completed; an email label does not authenticate
an account.

## Current flow

```text
Connect wallet
    ↓
GET /auth/nonce
    ↓
Sign SIWE message in the wallet
    ↓
POST /auth/verify
    ↓
Verify origin, domain, chain, one-time nonce and signature
    ↓
Find wallet link, or create a wallet-owned account and link atomically
    ↓
Issue opaque HttpOnly session cookie
```

- An existing wallet link resolves to its original `userId`, roles and
  account projection. It is never merged by email or reassigned by login.
- A valid first SIWE login creates a user with nullable email/password fields,
  links the verified `(chainId, address)` as the primary wallet, and creates
  the session in the same database transaction.
- `chainId + address` is unique. A conflict can never transfer a wallet from
  another account to the current caller.
- Additional wallet linking still requires an authenticated session and a
  second SIWE challenge at `/auth/wallets/link`.

## Security boundary

- The client-provided address is not trusted without SIWE signature recovery.
- Login challenges are one-time, expire after five minutes, and are scoped to
  an unauthenticated login or the current session for wallet linking.
- The backend validates the configured web origin, SIWE domain and auth chain
  before accepting the signature.
- The browser receives an opaque HttpOnly session cookie; the database stores
  only its SHA-256 token hash.
- A wallet already owned by another account produces a conflict; it is not
  silently attached to a second account.

## Transitional behavior

The current first slice removes `POST /auth/register` and `POST /auth/login`
from the controller, API client and Account page. Password-based wallet unlink
confirmation remains only as a temporary compatibility guard for existing
account records; it is not a login or recovery method. Wallet-signature unlink,
wallet rotation, recovery and contract-level identity/roles are separate
follow-up work and are not implied by this change.

## Source of truth and verification

- Backend implementation: `backend/src/modules/auth/auth.service.ts` and
  `backend/src/modules/auth/auth.controller.ts`.
- Frontend entry point: `frontend/src/features/auth/AccountAccess.tsx`.
- Local fixture accounts use the matching unlocked Anvil wallet and SIWE; the
  email column in the generated summary is metadata only.
- Focused verification: `auth.service.spec.ts`, `auth.controller.spec.ts`, and
  `frontend/scripts/campaigns-admin-account.test.mjs`.

Wallet-only authentication proves control of an account key; it does not prove
one-human identity or grant review authority. Under the new target protocol,
Judge authority comes from canonical stake/court assignment and contract state,
not from the account session or an Admin/Resolver role.
