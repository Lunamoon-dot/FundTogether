# FundTogether Campaign Namespace and Documentation Restructure

## Status

Implemented on 2026-10-17 as a breaking reset-compatible rename. The local
database and Anvil chain were reset, so the retired product namespace was
removed instead of being kept behind compatibility aliases.

## Decision

The retired product label made the domain harder to read. The canonical domain
is now `campaign`/`campaigns`: campaign creation, review,
pledges, production evidence, delivery, and settlement.

The active frontend lives under `frontend/src/features/campaigns`; backend
domain code lives under `backend/src/modules/campaigns`, `delivery`, `review`,
and `pledges`. The contract is `FundTogetherCampaign`, and generated artifacts
use the same name.

MockUSDC is a dependency of the Campaign deployment, not a separate product
namespace. No `reward` technical namespace is retained in the active runtime.

## Target structure

```text
frontend/src/features/
├─ campaigns/
│  ├─ public/
│  ├─ creator/
│  ├─ resolver/
│  ├─ backer/
│  ├─ transactions/
│  └─ shared/
├─ auth/
└─ explore/

backend/src/
├─ app.module.ts
├─ modules/
│  ├─ campaigns/
│  │  ├─ workflow/
│  │  ├─ controllers/
│  │  ├─ policies/
│  │  ├─ schemas/
│  │  ├─ services/
│  │  └─ tests/
│  ├─ delivery/
│  ├─ pledges/
│  ├─ review/
│  └─ auth/
├─ indexer/
└─ blockchain/
```

There is no active `frontend/src/features/reward` or `backend/src/reward`
product tree. Local campaign scripts live under `backend/scripts/campaigns`.

## Reset boundary

Because this was performed after resetting the disposable local runtime, the
following identifiers were renamed together:

```text
current browser routes     -> #/campaigns/*
backend wire routes        -> /v1/fundtogether/*
current database tables    -> campaigns_* / historical_*
current contract           -> FundTogetherCampaign
current artifacts          -> fund-together-campaign.*
current protocol/env       -> CAMPAIGNS / FUNDTOGETHER_*
```

Old routes, old schema names, old migration files, old contract artifacts, and
old deployment manifests are not supported. A fresh local migration and fresh
campaign contract deployment are required after the reset. No production chain
or production database is changed by this local refactor.

## Naming rules

- New code and docs use `campaign` for one campaign and `campaigns` for the
  domain/module namespace.
- User-facing copy says `FundTogether`, `campaign`, `ấn phẩm`, or `PDF`.
- The retired product label must not appear in source, paths, artifacts, route
  names, migration names, protocol labels, environment variables, or current
  documentation.
- Do not create a second product namespace for the funding model. Use
  `benefit`/`entitlement` for the PDF right and `campaign`/`campaigns` for the
  domain.
- Avoid duplicate names such as `CampaignCampaign`; filename and export names
  should describe the concrete surface once.

## Acceptance criteria

- No retired product namespace content or path remains outside generated/cache
  data.
- Active frontend code is discoverable under `frontend/src/features/campaigns`.
- Backend registration starts from `backend/src/app.module.ts` and current
  domain code is grouped under `backend/src/modules`.
- Contract, ABI, protocol, manifest, and database baseline names are aligned
  with `Campaign`/`campaigns`.
- Frontend tests/build, backend build/tests, Foundry tests, and namespace scans
  pass.
