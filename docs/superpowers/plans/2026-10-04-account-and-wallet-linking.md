# Account and wallet linking implementation plan

**Current scope amendment — 2026-10-04:** User requested full removal of Privy.
Step 4 and provider-specific execution notes below are historical and superseded.
The current implementation has independent accounts/sessions and signed external
wallet linking, with no embedded wallet SDK, JWT bridge or provider configuration.

**Goal:** Register/login to one FundTogether account without a wallet, then explicitly link a wallet to that account. Application sessions remain independent of wallet providers.

**Architecture:** Email/password -> Argon2id -> PostgreSQL user -> opaque HttpOnly session cookie. Store session token hashes and expiring SIWE challenges in PostgreSQL. Wallet links prove control; they do not grant smart-contract permissions. Existing wallet-only users and campaign ownership remain intact.

## Steps and verification

1. Add nullable account credentials, session and challenge tables; generate an additive migration. Verify with Drizzle generation and local migration.
2. Implement registration, login, revoked/expired sessions and authenticated SIWE linking. Keep SIWE login for already linked wallets. Verify account-without-wallet, invalid credentials, nonce replay, cross-account linking and logout tests.
3. Replace wallet-first account UI with register/login and explicit wallet linking. Preserve open workspace forms when only wallet links change. Verify TypeScript/build/lint.
4. Integrate Privy custom authentication only with a supplied public App ID and enabled JWT integration. Signing keys stay outside Git. Verify the bridge locally; dashboard acceptance and actual embedded-wallet creation require live Privy configuration.
5. Run backend tests and a local HTTP/PostgreSQL smoke journey; update overview/progress with exact evidence and remaining work.

## Boundaries

- No contract, chain or escrow changes.
- No automatic merging by email or wallet address.
- Email ownership verification/password recovery need a mail delivery configuration; this slice must not claim they exist.
- Existing JWT cookies become invalid; signing in again obtains a revocable session.
- Unsafe browser requests require the configured frontend Origin. Rate limits protect credential and signature endpoints; distributed limits remain a deployment concern.
- Preserve unrelated working-tree changes. Execute inline in the existing checkout; do not commit or publish during this task.

## Execution record

- 2026-10-04 final scope: Privy fully removed, including SDK/bridge, local key,
  environment settings and SDK-only tests/dependencies. Fresh verification:
  backend build, 23 tests/nine suites, 40 HTTP/PostgreSQL smoke response checks,
  frontend build/lint. Removed routes return 404 on the restarted local backend.
  Earlier retained-code/disabled-flag notes below are historical.

- 2026-10-04 scope update: user deferred Privy due to activation cost. Current
  delivery covers account/session and external wallet linking. SDK flag stays
  false and inactive Privy UI is hidden; future activation is a separate decision.

- Steps 1–3: implemented. Additive migration applied; backend build and 23
  tests pass. Frontend build/lint/TypeScript pass. Login UI observed locally.
- Step 4: code and local App ID/development signing key configured. Local RS256
  JWT verification passes. SDK activation stays off pending dashboard custom-auth
  setup and a public verification endpoint; live wallet creation is not verified.
- Step 5: HTTP/PostgreSQL smoke passes 41 response checks plus token, ownership and
  JWT assertions; test rows removed. Overview/progress/setup guides updated.
- Ruling: declare SDK bundle peers and use legacy peer resolution for its unused
  optional smart-account peer; required EVM behavior compiles. Solana/Stripe
  product features are not added. Bundle and dependency audit work remains TODO.
- Ruling: retain legacy linked-wallet login to preserve access to existing drafts;
  new unlinked wallets must register and link through an authenticated account.
- Browser control timed out after observing the login form; interactive UI flows
  are not claimed verified. No commit/push was performed.
- Final fresh review found a stale Privy JWT getter on login. Added an ordering
  regression test (failed before fix), then made the getter stable with a live
  session ref updated before SDK effects. Nine suites / 23 tests pass after fix.
