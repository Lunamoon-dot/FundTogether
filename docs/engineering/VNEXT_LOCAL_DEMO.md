# FundTogether VNext local demo

This launcher runs the existing VNext implementation on a local Anvil chain. It
does not change the campaign, review, payout or refund policy. Contract events
remain the financial source of truth; PostgreSQL contains indexed projections,
and MinIO contains private evidence bytes.

## 1. Requirements

- Windows 11 with PowerShell 7.
- Node.js 24+ and npm.
- Docker Desktop with the Linux container engine and Docker Compose.
- Foundry `anvil` installed on Windows or in WSL distribution `Ubuntu-24.04`.
- Repository dependencies and VNext contract artifacts built locally.

Run `scripts/vnext-demo.ps1 doctor` to check the tools, dependencies and default
ports before startup. The default ports are PostgreSQL 15436, MinIO 19202 and
19203, RPC 9548, API 3002 and frontend 5187. The launcher checks ownership
before reusing an occupied port.

## 2. Install prerequisites

From the repository root:

```powershell
git submodule update --init --recursive
Push-Location backend; npm ci; Pop-Location
Push-Location frontend; npm ci; Pop-Location
Push-Location contracts; forge build; Pop-Location
```

The launcher does not install system tools or project dependencies for you.

## 3. Start the demo

```powershell
scripts/vnext-demo.ps1 doctor
scripts/vnext-demo.ps1 up
```

`up` creates `.local/fundtogether/vnext-demo.env` only when absent, starts the
dedicated `fundtogether-vnext-demo` PostgreSQL and MinIO Compose project,
migrates its VNext database, starts or verifies Anvil chain 31339, deploys or
verifies the VNext contracts, then starts the API and frontend. Generated
credentials, Anvil state and the deployment manifest stay under `.local`.
Existing files and unrelated containers are left alone.

The runtime uses MockUSDC (6 decimals), CampaignEscrowVNext, JuryReview and
JuryRegistry. The canonical VNext indexer is part of the API runtime.

## 4. Check runtime identity and health

```powershell
scripts/vnext-demo.ps1 status
scripts/vnext-demo.ps1 smoke
```

Both commands check API health and VNext protocol identity, frontend HTTP
response, RPC chain ID, MinIO readiness, database connectivity and indexer
checkpoint/lag. The report also prints contract addresses and indexed campaign
IDs. `smoke` is read-only.

Default URLs:

- Frontend: <http://127.0.0.1:5187>
- API health: <http://127.0.0.1:3002/health>
- RPC: <http://127.0.0.1:9548> (chain ID 31339)
- MinIO API: <http://127.0.0.1:19202>
- MinIO console: <http://127.0.0.1:19203>

The MinIO credentials are generated in the local environment file. Do not copy
that file into a commit or share it.

## 5. Stop the runtime safely

```powershell
scripts/vnext-demo.ps1 down
```

`down` stops only launcher-recorded processes and containers. It preserves the
PostgreSQL and MinIO volumes, Anvil state and deployment manifest so that a
later `up` can resume the same local deployment. It does not delete data.

## 6. Run isolated fresh acceptance

```powershell
scripts/vnext-demo.ps1 demo:test-fresh
```

The command first stops the launcher-owned default runtime, then creates unique
direct-contract and browser test stacks with separate Compose projects,
databases, MinIO volumes and chain state. It runs the two phases sequentially,
removes only those disposable resources, and restores the default runtime when
cleanup succeeds. Results are written to
`.local/fundtogether/runtime/vnext-demo-test-fresh.json`. If cleanup fails,
use the run ID in that report to find the retained run directory and the exact
paths printed by the launcher.

Do not stop the command while a phase is running. If cleanup fails, do not reuse
that RPC until the recorded processes have been stopped.

## 7. Prepare a manual wallet

Use an isolated wallet intended only for local testing. Add the Anvil network
with RPC `http://127.0.0.1:9548`, chain ID `31339`, and native currency `ETH`.
Use only disposable Anvil accounts and test MockUSDC. Never connect a wallet
holding real assets to the demo. The launcher does not import accounts or write
wallet data. The automated browser acceptance injects a test-only provider and
does not use a user's browser wallet.

## 8. Creator walkthrough

1. Open the VNext page and connect the local Creator wallet.
2. Create a campaign with a payout address, goal, duration, acceptance-criteria
   hash and publication-evidence hash.
3. Track wallet request, submitted transaction, successful receipt and
   canonical indexer confirmation separately.
4. Wait for the publication Judge case to pass and settle. Funding opens only
   after `Finalize publication` is mined and canonical.
5. After a successful funding finalization, open the milestone dashboard and
   use the Evidence Wizard to select a PDF, calculate SHA-256, confirm the
   exact hash on-chain, and upload the exact bytes to private MinIO storage.
6. Verify the evidence projection reports `AVAILABLE` and policy `READY`.

## 9. Backer walkthrough

1. Open the campaign and connect a local Backer wallet.
2. Enter a human-readable MockUSDC amount in Funding Checkout.
3. Approve the exact allowance shown by the UI, then contribute.
4. Verify the receipt, canonical `ContributionReceived` event, indexed raised
   amount and CampaignEscrow token custody.

Funding success alone does not pay the Creator.

## 10. Judge walkthrough

1. Open the VNext Judge workspace and connect an eligible local test Judge.
2. Stake and enroll when the case permits it; wait for assignment.
3. Inspect the authorized evidence and choose PASS or FAIL.
4. Generate the vote salt in the UI, save the explicit backup outside the app,
   and commit the vote.
5. Reload the Judge page, import the saved backup, verify the recomputed
   commitment, reveal, and confirm the canonical vote event.
6. Finalize the court and complete bounded settlement when enabled.

Never put a vote salt or its backup into logs or shared reports.

## 11. Payout and refund walkthroughs

For payout, complete milestone review, final ruling, settlement and the active
challenge condition. Submit `Pay milestone` only when the contract enables it.
Check `MilestonePaid`, exact Creator balance change, CampaignEscrow custody and
campaign state against contract reads and canonical indexed events.

For refund, use a separate campaign funded below goal. After the deadline,
finalize funding, freeze refund allocations in bounded batches and claim as the
Backer. Check `BackerRefundClaimed`, entitlement, exact balance change, zero
Creator payout and rejection of a duplicate claim.

## 12. Troubleshooting

- **`doctor` fails:** install the missing dependency it reports, then rerun it.
- **A port is occupied:** inspect the process before stopping anything. The
  launcher will not bind over an unidentified listener.
- **Manifest identity mismatch:** preserve the manifest and Anvil state; check
  chain ID, RPC and runtime owner before deciding how to recover.
- **Indexer lag:** check API health and RPC availability, then inspect
  `status`. A submitted transaction is not indexed financial truth.
- **Evidence is not `READY`:** verify the canonical evidence event, uploaded
  file hash, API access and MinIO health.
- **Wallet action fails:** check chain 31339, active account, token balance and
  allowance. Do not repeat a transaction until its receipt has been checked.
- **Fresh cleanup fails:** use the report's run ID and the exact paths printed
  by the launcher; do not delete containers or volumes by broad name filters.

Service logs and launcher ownership records are under
`.local/fundtogether/runtime/`.

## 13. Known limitations

- This is an Anvil/MockUSDC demo, not a public-chain or real-money deployment.
- The automated wallet is a Playwright fixture; manual wallet acceptance is a
  separate step.
- Some publication, milestone and settlement operations remain direct contract
  calls in browser acceptance where the requested UI action is not available.
  The acceptance report marks these separately from UI transactions.
- One successful local run does not establish production readiness or a
  statistically meaningful performance baseline.
