# HED-MVP-1 local runbook

HED is a local MockUSDC deployment only. It does not deploy to a public chain,
does not move real funds, and does not replace the historical baseline or
Workflow B deployments.

## Start and verify

From the repository root in PowerShell:

```powershell
& .\backend\scripts\hed\start-services.ps1 -SkipBuild
Invoke-RestMethod http://127.0.0.1:3002/health
npm.cmd --prefix backend run smoke:hed
```

The expected health context is `protocolKind: HED`, `chainId: 31339`, and
`status: ready`. The script owns the isolated Postgres port 5435, MinIO port
9200, API port 3002, frontend port 5175 and Anvil RPC port 9548. Do not start
a second Anvil process on that RPC port.

`smoke:hed` verifies the local contract deployment, then executes a chain
journey: full funding, activation, purchase request, delivery challenge,
final payment, transport request in the same activity, its final payment, and
outcome verification. It checks vendor token balances and the selected
delivery/outcome report hashes.

## Roles and routes

- OWNER creates and freezes campaign/activity/request records at
  `#/workspace`, then sends only the frozen commitments to HED chain.
- ADMIN verifies a vendor at `#/internal/vendors` before the OWNER can select
  it for a request.
- RESOLVER reviews request, delivery and outcome evidence at
  `#/internal/requests`; saving a review does not move funds.
- A vendor with the locked recipient wallet acknowledges frozen terms at
  `#/vendor`.
- A donor uses a public HED campaign at `#/hed/campaigns/<id>` to donate,
  inspect the connected-wallet contribution, challenge a candidate during its
  window, or claim a refund after a refund snapshot.

Original evidence is private. Public evidence is a separate redacted upload;
the server derives its hash, and the public download route serves it only
while that exact hash is the selected on-chain delivery or outcome report.

## Technical checks

```powershell
wsl.exe -d Ubuntu-24.04 --exec sh -lc 'cd /mnt/c/Users/dell/Desktop/FundTogether/contracts && forge test --match-contract HedFundingAndReservationTest'
npm.cmd --prefix backend run artifacts:hed
node backend/scripts/hed/artifact-contract.test.cjs
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
```

These checks do not constitute human review. Brave/MetaMask walkthroughs,
independent evidence assessment, vendor acceptance of the timing/deposit
model, and real-money/legal/custody readiness remain outside HED-MVP-1 local
verification.
