# Accounts and wallets — development implementation

Updated: 2026-10-05

## One account, optional wallets

```text
Email + password
       |
       v
FundTogether userId + server session
       |
       +--> Create/edit private campaign and evidence drafts
       |
       +--> Connect external wallet --> sign SIWE --> wallet_links
```

A wallet is not required to register, sign in or save metadata drafts. Wallet
ownership and application account identity are separate. Wallet linking does not
grant an on-chain role, prove organizer approval or publish a campaign. The
contract remains authoritative for financial state and permissions.

Wallet linking signs with the selected address and rechecks account, address and
chain around the nonce and signature requests. A wallet that does not answer
within 90 seconds releases the form and displays a recovery message. A signature
arriving after that timeout cannot continue to the linking endpoint. Close the
old extension request before retrying. The selected connector remains locked until
that request settles, so timeout does not start a duplicate signature request.
Switching connector, account or chain invalidates the proof. Leaving the form
prevents a late result from changing the application's active session. A wallet
already linked on the selected chain displays “Ví đã liên kết”. The account page shows the configured
resolver address for staff; a PostgreSQL RESOLVER role does not grant that
address's contract permissions.

The linking form reads the selected connector client under an 8-second bound
before reporting a signature request, then bounds nonce loading to 20 seconds.
Signing uses that prepared client and a 90-second countdown. Stop waiting aborts
the local proof before backend verification; it does not cancel an extension
request. Disconnect/change-wallet and session linkage recheck provide recovery.
The generic default Browser Wallet option was removed to avoid ambiguity with
named Brave/MetaMask/Rabby providers; discovered wallets remain available.
Backend verification is a separate stage. Signing is bound to the connector
selected at the start of the request. A resource-unavailable wallet response explains how to
resolve pending extension requests. These messages do not prove that an extension
popup opened; native MetaMask signing still needs manual confirmation.

The account UI separates linked wallets returned by `/auth/session` from the
browser's currently connected wallet. Automatic reconnect on page load is
disabled. On initial session load or an account change, connections not matching
that account's linked address and chain are disconnected; logout disconnects all
connections. An explicit connection made within the same account remains usable
while the user signs to link it. Registering an email account does not link a
remembered browser wallet. Linking requires the explicit button, a valid signature
and the authenticated API route. No wallet-link records are deleted by disconnect.

## Implemented API

| Endpoint | Behavior |
|---|---|
| `POST /auth/register` | Normalized email + 12–128 character password; create account/session |
| `POST /auth/login` | Verify password; create a new session and revoke the cookie's previous session |
| `GET /auth/session` | Return `{ userId, email, wallets }`; no wallet required |
| `POST /auth/logout` | Revoke the cookie's session in DB and clear cookie; repeat calls are safe |
| `POST /auth/wallets/nonce` | Authenticated, five-minute SIWE challenge bound to the current session |
| `POST /auth/wallets/link` | Verify signature/domain/URI/chain/nonce, attach wallet to current account |
| `GET /auth/nonce`, `POST /auth/verify` | SIWE login for an already linked wallet, including legacy wallet accounts |

Browser writes require `Origin` equal to `WEB_ORIGIN`; command-line calls must
also send that header. Credential routes allow 10 requests per minute per IP per
route; other auth routes allow 60. Limits are process-local and need shared
storage/proxy configuration before a multi-instance deployment.

Passwords use Argon2id (19 MiB, two iterations, parallelism one). The browser
holds a 256-bit opaque token in an HttpOnly, SameSite=Lax cookie, with Secure in
production. PostgreSQL stores its SHA-256 hash and 24-hour expiry. Logout revokes
the application session. Existing JWT cookies must sign in again.

SIWE challenges persist across backend restarts and are consumed atomically.
Another session cannot consume a linking nonce. A wallet belonging to another
account returns 409; the system never silently moves it. Repeated linking with
a fresh proof is safe. Address-only payloads are not accepted as proof.

Existing users and wallet links are preserved by additive migration
`backend/drizzle/0003_bored_warlock.sql`. Their email/password fields are nullable.
Legacy accounts can still sign in using their linked wallet. Registering an
email separately creates a separate account; automatic merging and attaching
credentials to legacy accounts are not implemented.

## Embedded wallets outside the current scope

On 2026-10-04 the user chose to remove the Privy integration entirely. Its SDK,
provider/panel, token/JWKS endpoints, configuration, local development key and
provider-specific checks were removed. No embedded wallet provider is installed.

Future integration can reuse the internal `userId`, server session and signed
wallet-linking flow. A provider must follow the application session, create a
wallet only through an explicit action and prove wallet control before linking.
Provider authentication, logout, recovery and transaction signing require their
own verification when that work is requested. No speculative adapter is added.

The current browser wallet network is local Foundry (31337). Arc deployment,
RPC acceptance and chain-specific transaction behavior remain a separate slice.

## Run and verify

```powershell
cd C:\Users\dell\Desktop\FundTogether\backend
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run build
npm.cmd test -- --runInBand
node scripts/auth-smoke.cjs
```

The smoke script starts a separate local HTTP listener, uses the configured
development PostgreSQL database, creates uniquely named test accounts/drafts,
and removes only its own records. It also checks that removed provider routes
return 404. It signs with generated disposable wallets; no on-chain transaction
occurs. No external wallet-provider credentials are needed.

```powershell
cd C:\Users\dell\Desktop\FundTogether\frontend
npm.cmd ci
npm.cmd run build
npm.cmd run lint
npm.cmd run dev
```

Open `http://localhost:5173/#/account`. The frontend uses Wagmi/Viem and RainbowKit
for external browser wallets. Provider-only Solana/Stripe dependencies and the
legacy peer-resolution override have been removed.

## Remaining production work

- Email ownership verification, password recovery and account recovery policy.
- HTTPS cookie deployment and production session configuration.
- Shared rate limits, expired-session cleanup and deployment monitoring.
- Frontend dependency audit remediation and bundle-size review; do not apply a
  breaking dependency upgrade without testing the wallet integrations.

This slice does not claim to be a production-complete identity system.
