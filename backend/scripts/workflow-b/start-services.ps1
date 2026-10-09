param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRootB = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$outputB = Join-Path $projectRootB '.local\workflow-b'
$envB = Join-Path $outputB 'backend.env'
$manifestPathB = Join-Path $outputB 'generated\deployment.local.json'
$composeB = Join-Path $projectRootB 'infra\workflow-b\compose.yaml'
$nodeB = (Get-Command node.exe).Source

function Run-NodeB([string]$scriptB) {
    & $nodeB (Join-Path $PSScriptRoot $scriptB)
    if ($LASTEXITCODE -ne 0) { throw "Workflow B step failed: $scriptB" }
}
function Has-ListenerB([int]$portB) {
    return [bool](Get-NetTCPConnection -LocalPort $portB -State Listen -ErrorAction SilentlyContinue)
}
function Read-HealthB {
    $healthB = Invoke-RestMethod 'http://127.0.0.1:3001/health' -TimeoutSec 5
    $manifestB = Get-Content -LiteralPath $manifestPathB -Raw | ConvertFrom-Json
    foreach ($keyB in @('protocolKind', 'chainId', 'deploymentId', 'contractAddress', 'tokenAddress', 'workflowPolicy', 'abiVersion', 'resolver', 'confirmations')) {
        if ([string]$healthB.context.$keyB -cne [string]$manifestB.$keyB) { throw "Port3001 identity mismatch: $keyB. Existing process preserved." }
    }
    return $healthB
}

Run-NodeB 'initialize-environment.cjs'
& docker compose --env-file $envB -f $composeB up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'B containers not ready; inspect Docker, keep existing data.' }
& (Join-Path $PSScriptRoot 'start-chain.ps1')
if ($LASTEXITCODE -ne 0) { throw 'B chain not ready; no automatic reset.' }
Run-NodeB 'migrate-isolated.cjs'
if (-not $SkipBuild) {
    Push-Location (Join-Path $projectRootB 'backend')
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'B backend build failed.' } }
    finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRootB 'backend\dist\src\advance\advance-main.js'))) { throw 'Build backend before starting B.' }
$launchedB = @()
if (Has-ListenerB 3001) {
    Read-HealthB | Out-Null
} else {
    $apiB = Start-Process -FilePath $nodeB -ArgumentList @((Join-Path $PSScriptRoot 'run-backend.cjs')) -WorkingDirectory $projectRootB -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $outputB 'api.log') -RedirectStandardError (Join-Path $outputB 'api-error.log')
    $launchedB += @{ service = 'api'; pid = $apiB.Id; startedAt = $apiB.StartTime.ToUniversalTime().ToString('o'); port = 3001 }
}
if (-not (Has-ListenerB 5174)) {
    $frontendB = Join-Path $projectRootB 'frontend'
    $viteB = Join-Path $frontendB 'node_modules\vite\bin\vite.js'
    $webB = Start-Process -FilePath $nodeB -ArgumentList @($viteB, '--mode', 'workflow-b') -WorkingDirectory $frontendB -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $outputB 'web.log') -RedirectStandardError (Join-Path $outputB 'web-error.log')
    $launchedB += @{ service = 'frontend'; pid = $webB.Id; startedAt = $webB.StartTime.ToUniversalTime().ToString('o'); port = 5174 }
}
if ($launchedB.Count) {
    $stampB = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')
    ConvertTo-Json -InputObject $launchedB | Set-Content -LiteralPath (Join-Path $outputB "service-handles-$stampB.json")
}
$readyB = $false
for ($attemptB = 0; $attemptB -lt 30; $attemptB++) {
    try { if ((Read-HealthB).status -eq 'ready') { $readyB = $true; break } }
    catch { if ($_.Exception.Message -like '*identity mismatch*') { throw } }
    Start-Sleep -Seconds 1
}
if (-not $readyB) { throw 'B startup/indexer remains pending under recorded handles. Inspect logs; do not start duplicate services.' }
& $nodeB (Join-Path $projectRootB 'frontend\scripts\advance-manual-setup.mjs')
if ($LASTEXITCODE -ne 0) { throw 'B frontend/API identity verification failed; existing services preserved.' }
Write-Output 'Workflow B ready: http://localhost:5174; API http://localhost:3001; RPC9547. No A service changed.'
