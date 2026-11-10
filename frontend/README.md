# FundTogether frontend

The React/Vite frontend contains the current VNext Creator, Backer, Judge,
court, evidence, payout and refund surfaces alongside explicitly historical
Campaign/Resolver routes that remain available during migration.

Runtime deployment identity comes from the ignored local manifest under
`.local/fundtogether/generated/`. Tests opt into a deterministic fixture through
their bootstrap; development and production builds never substitute that
fixture for a real deployment.

## Verify locally

```powershell
cd frontend
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Wallet submission is not financial completion. UI flows distinguish wallet
request, submitted transaction, canonical receipt and indexed projection.
