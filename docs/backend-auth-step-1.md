# Backend Step 1 — Wallet session and organizer access

This is the first backend implementation step. It adds wallet authentication
and checks whether the signed-in account owns a campaign metadata record. It
does not yet create campaigns or save evidence.

## Request flow

```text
GET /auth/nonce
  -> API creates a random, short-lived nonce

Wallet signs a SIWE message containing that nonce

POST /auth/verify { message, signature }
  -> API checks nonce, domain, URI, chain and wallet signature
  -> API creates or finds the wallet/user link
  -> API sets a signed JWT in an HttpOnly cookie

GET /auth/session
  -> AuthGuard reads and verifies the cookie
  -> request.wallet contains server-verified userId/address/chainId

GET /campaigns/:campaignId/organizer-access
  -> AuthGuard supplies userId
  -> EvidenceAccessService compares it with campaign_metadata.organizer_user_id
```

The frontend must send credentialed requests so the browser includes the
HttpOnly cookie. The wallet address used for authorization comes from the
verified SIWE message, never from a request body.

## NestJS pieces

- `AuthController` defines the HTTP routes and response cookie.
- `AuthService` owns nonce, SIWE, database identity and JWT work.
- `AuthGuard` verifies the session on protected routes and attaches identity to
  the request.
- `CampaignsController` demonstrates applying the guard to an organizer-only
  route.
- `EvidenceAccessService` performs the database ownership check.

## Local configuration

Set `AUTH_JWT_SECRET` to a random value of at least 32 bytes. `AUTH_DOMAIN` must
match the browser origin's host, and `AUTH_CHAIN_ID` must match the wallet chain.
For local defaults these are `localhost:5173` and `31337`.

The nonce store is in process memory for this learning prototype. It has a
five-minute lifetime and is consumed once. It will not work reliably across
multiple backend instances or process restarts; move it to shared storage before
scaling or production. Session JWTs currently last 24 hours.

## Authorization boundary

The campaign check uses the existing `organizerUserId` metadata relation. It
does not yet verify the campaign organizer or milestone criteria from chain
state. Keep the distinction clear: SIWE proves control of a wallet, while the
database relation currently decides which user owns this API resource.
