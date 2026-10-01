# FundTogether — Project Instructions

## Project context

FundTogether is a donation-based charitable crowdfunding protocol. Its core model is:

- Milestone escrow
- Organizer bond with maximum-exposure protection
- Evidence submission and verification
- Challenge-based governance
- Refunds for failed or cancelled campaigns
- Reputation and research layers after the MVP

The design reference is the `v0.2` documentation in:
`C:\Users\dell\OneDrive\Desktop\NCKH\v0.2`.

The current repository is being prepared. At the time this file was created, only the `frontend` directory existed and no backend or smart-contract implementation had been verified.

## Target architecture

The project has three boundaries:

```text
Frontend  ↔  Backend/API  ↔  PostgreSQL / storage / indexer
    │              │
    └──────────────┴────────────── Blockchain / smart contracts
```

- The frontend owns user experience, forms, API state, wallet interaction, and transaction status display.
- The backend owns authentication, wallet linking, metadata, authorization, uploads, API contracts, and blockchain-derived projections.
- Smart contracts own critical financial state: escrow, bond, milestone transitions, settlement, challenge effects, and refunds.
- PostgreSQL is application and projection data; it must not silently replace the blockchain as the source of truth for financial state.
- Frontend and backend communicate through a versioned API contract, preferably OpenAPI-generated client types.
- Frontend/backend and contracts communicate through versioned ABI, chain ID, contract address, and deployment metadata. ABI must not be copied manually in multiple places.

## Recommended technology direction

These are the v0.2 recommendations. Treat them as proposed until the repository contains the actual setup and the team confirms a decision.

### Frontend

- React + TypeScript
- TanStack Query for server state
- Zustand or local React state for client-only state
- React Hook Form + Zod for forms and validation
- Axios or the generated API client for HTTP transport
- Wagmi + Viem for wallet and contract interaction
- RainbowKit if a wallet connection UI is needed
- date-fns and sonner where useful

### Backend

- NestJS + TypeScript
- PostgreSQL + Drizzle
- Zod and/or NestJS DTO validation, following one consistent API convention
- SIWE for wallet authentication if that remains the selected auth design
- Pino for structured logging
- Redis/BullMQ only when the project has a concrete background-job need
- S3-compatible object storage for private evidence
- IPFS/Pinata only for evidence that is intentionally public
- Viem/Ponder for chain reads and event synchronization after the contract event model is stable

### Blockchain preparation

- Keep contract-facing code behind a small typed boundary.
- Use integer-safe token amounts and `bigint`; never use JavaScript floating point for financial values.
- Track transaction lifecycle separately: wallet request, submitted, receipt success/revert, confirmation policy, and indexed.
- Do not mark an operation complete because a transaction was merely submitted or because an API record was created.

## Delivery order

Follow this dependency order when implementation begins:

1. Protocol decisions, state machine, accounting rules, and invariants
2. Smart-contract prototype and tests
3. Contract hardening and ABI/event agreement
4. Backend foundation and database migrations
5. Blockchain event indexing and idempotent synchronization
6. Evidence storage pipeline
7. Frontend vertical journeys
8. End-to-end MVP verification
9. Reputation and research experiments

For the current FE/BE setup phase, focus on clean project structure, type safety, API boundaries, validation, error handling, configuration, and testability. Do not encode unresolved financial rules in UI or backend CRUD logic.

## MVP journeys

The MVP should eventually verify these complete journeys:

- Organizer: connect/login → create draft → define milestones → lock bond → publish
- Donor: view campaign → approve token if needed → donate → see indexed contribution
- Milestone: activate → submit evidence → review → challenge or settle → continue
- Failure: campaign fails or is cancelled → refund becomes claimable → donor claims refund

The UI must distinguish upload success, transaction success, and indexed/confirmed application state.

## Working rules

- Read nearby files and existing configuration before editing.
- Keep changes focused; do not introduce speculative services or dependencies.
- Preserve existing behavior unless the requested task requires a change.
- Validate inputs on the server even when the frontend already validates them.
- Never commit secrets, private keys, real `.env` files, tokens, or complete presigned URLs.
- Use migrations for database schema changes.
- Make event handlers and background jobs idempotent.
- Prefer explicit error states over a generic success or failure toast.
- Add tests for meaningful behavior, especially validation, authorization, financial boundaries, transaction lifecycle, and synchronization.

## Documentation and progress tracking

The v0.2 reference documents describe proposals and learning material; they do not prove that code exists. When this repository gains project documentation, keep these concerns separate:

- `docs/PROJECT_OVERVIEW.md`: current architecture, verified stack, repository map, setup instructions, and approved decisions.
- `docs/PROJECT_PROGRESS.md`: implementation status, evidence of verification, blockers, next actions, and a dated change log.
- `docs/protocol-spec.md`: MVP protocol actors, authority, data ownership, actions and events.
- `docs/state-machine.md`: campaign, milestone, evidence, challenge and refund transitions.
- `docs/financial-rules.md`: token accounting, bond, release, refund and invariants.
- `docs/mvp-scope.md`: MVP journeys, in/out scope, delivery phases and definition of done.
- `docs/web3-conventions.md`: shared network, identifier, amount, ABI, event and transaction conventions.

When working on a task:

1. Read the relevant overview or progress section if it exists.
2. Update progress only after checking the repository, command output, tests, or other concrete evidence.
3. Use `TODO`, `IN_PROGRESS`, `BLOCKED`, and `DONE` consistently.
4. Do not mark a feature `DONE` because it is documented or visually mocked.
5. Update the overview when the actual stack, architecture, public API, or approved protocol decision changes.

## Current status

- Project documentation source: v0.2 exists outside this repository.
- Frontend directory: Vite + React + TypeScript scaffold installed; feature-first structure, API/Web3 boundaries, Tailwind, build, and lint verified.
- Backend directory: NestJS foundation installed; config, Drizzle database boundary, health, blockchain, and indexer boundaries are scaffolded; build, migration generation, and `/health` endpoint verified.
- Contracts directory: Foundry scaffold created; Foundry/Anvil toolchain is not installed or verified yet.
- API currently exposes only the foundation health endpoint; domain API is not yet implemented.
- Database schema, ABI, events, chain configuration, and deployment configuration: not yet verified.
