param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRootH = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$outputH = Join-Path $projectRootH '.local\hed'
$envH = Join-Path $outputH 'backend.env'
$manifestPathH = Join-Path $outputH 'generated\deployment.local.json'
$composeH = Join-Path $projectRootH 'infra\hed\compose.yaml'
$nodeH = (Get-Command node.exe).Source

function Run-NodeH([string]$scriptH) {
    & $nodeH (Join-Path $PSScriptRoot $scriptH)
    if ($LASTEXITCODE -ne 0) { throw "HED step failed: $scriptH" }
}
function Has-ListenerH([int]$portH) {
    return [bool](Get-NetTCPConnection -LocalPort $portH -State Listen -ErrorAction SilentlyContinue)
}
function Read-HealthH {
    $healthH = Invoke-RestMethod 'http://127.0.0.1:3002/health' -TimeoutSec 5
    $manifestH = Get-Content -LiteralPath $manifestPathH -Raw | ConvertFrom-Json
    foreach ($keyH in @('protocolKind', 'chainId', 'deploymentId', 'contractAddress', 'tokenAddress', 'policyHash', 'abiVersion', 'resolver', 'backupResolver', 'confirmations')) {
        if ([string]$healthH.context.$keyH -cne [string]$manifestH.$keyH) { throw "Port3002 identity mismatch: $keyH. Existing process preserved." }
    }
    return $healthH
}

Run-NodeH 'initialize-environment.cjs'
& docker compose --env-file $envH -f $composeH up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'HED containers not ready; inspect Docker, keep existing data.' }
& (Join-Path $PSScriptRoot 'start-chain.ps1')
if ($LASTEXITCODE -ne 0) { throw 'HED chain not ready; no automatic reset.' }
Run-NodeH 'migrate-isolated.cjs'
if (-not $SkipBuild) {
    Push-Location (Join-Path $projectRootH 'backend')
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'HED backend build failed.' } }
    finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRootH 'backend\dist\src\disbursement\hed-main.js'))) { throw 'Build HED backend before starting it.' }
$launchedH = @()
if (Has-ListenerH 3002) { Read-HealthH | Out-Null }
else {
    $apiH = Start-Process -FilePath $nodeH -ArgumentList @((Join-Path $PSScriptRoot 'run-backend.cjs')) -WorkingDirectory $projectRootH -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $outputH 'api.log') -RedirectStandardError (Join-Path $outputH 'api-error.log')
    $launchedH += @{ service = 'api'; pid = $apiH.Id; startedAt = $apiH.StartTime.ToUniversalTime().ToString('o'); port = 3002 }
}
if (-not (Has-ListenerH 5175)) {
    $frontendH = Join-Path $projectRootH 'frontend'
    $viteH = Join-Path $frontendH 'node_modules\vite\bin\vite.js'
    $webH = Start-Process -FilePath $nodeH -ArgumentList @($viteH, '--mode', 'hed') -WorkingDirectory $frontendH -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $outputH 'web.log') -RedirectStandardError (Join-Path $outputH 'web-error.log')
    $launchedH += @{ service = 'frontend'; pid = $webH.Id; startedAt = $webH.StartTime.ToUniversalTime().ToString('o'); port = 5175 }
}
if ($launchedH.Count) {
    ConvertTo-Json -InputObject $launchedH | Set-Content -LiteralPath (Join-Path $outputH "service-handles-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')).json")
}
$readyH = $false
for ($attemptH = 0; $attemptH -lt 30; $attemptH++) {
    try { if ((Read-HealthH).status -eq 'ready') { $readyH = $true; break } }
    catch { if ($_.Exception.Message -like '*identity mismatch*') { throw } }
    Start-Sleep -Seconds 1
}
if (-not $readyH) { throw 'HED API/indexer remains pending under its recorded handle. Inspect logs; do not start a duplicate.' }
Write-Output 'HED ready: http://localhost:5175; API http://localhost:3002; RPC9548. Workflow B resources are not used.'
