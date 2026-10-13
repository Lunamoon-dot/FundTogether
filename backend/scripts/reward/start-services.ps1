param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$environmentFile = Join-Path $projectRoot '.local\reward\backend.env'
$compose = Join-Path $projectRoot 'infra\reward\compose.yaml'
$runtime = Join-Path $projectRoot '.local\reward\runtime'
$manifestFile = Join-Path $projectRoot '.local\reward\generated\deployment.local.json'
$identity = Join-Path $PSScriptRoot 'runtime-identity.cjs'
$webIdentityFile = Join-Path $runtime 'web-identity.json'
$apiProcess = $null
$webProcess = $null

function Get-RewardHealth {
    param($Manifest)
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3002/health' -UseBasicParsing -TimeoutSec 2
    & node $identity health $manifestFile ($health | ConvertTo-Json -Compress)
    if ($LASTEXITCODE -ne 0) { throw 'Reward API health identity does not match the current deployment manifest.' }
    return $health
}

function Wait-RewardHealth {
    param($Manifest)
    $lastError = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { return Get-RewardHealth $Manifest }
        catch { $lastError = $_.Exception.Message; Start-Sleep -Seconds 1 }
    }
    throw "Reward API did not become ready: $lastError"
}

function Wait-RewardWeb {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5175' -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { Start-Sleep -Seconds 1 }
    }
    throw 'Reward frontend did not become ready on 5175.'
}

try {
    & node (Join-Path $PSScriptRoot 'initialize-environment.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Reward environment initialization failed.' }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null

    docker compose --env-file $environmentFile -f $compose up -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'Reward containers did not become healthy.' }

    & (Join-Path $PSScriptRoot 'start-chain.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Reward chain identity did not verify.' }
    & node (Join-Path $PSScriptRoot 'migrate-isolated.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Reward database migration failed.' }

    if (-not $SkipBuild) {
        Push-Location (Join-Path $projectRoot 'backend')
        try { npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Reward backend build failed.' } }
        finally { Pop-Location }
        Push-Location (Join-Path $projectRoot 'frontend')
        try { npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Reward frontend build failed.' } }
        finally { Pop-Location }
    }

    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    $apiListener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
    if ($apiListener) {
        Get-RewardHealth $manifest | Out-Null
        Write-Output 'Reused verified Reward API listener.'
    } else {
        $apiProcess = Start-Process -FilePath 'node.exe' -ArgumentList @(Join-Path $PSScriptRoot 'run-backend.cjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'api.log') -RedirectStandardError (Join-Path $runtime 'api-error.log')
        Set-Content -LiteralPath (Join-Path $runtime 'api-pid.txt') -Value $apiProcess.Id
        Wait-RewardHealth $manifest | Out-Null
    }

    $webListener = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue
    if ($webListener) {
        $webOwner = Get-Process -Id $webListener[0].OwningProcess -ErrorAction Stop
        $webStartedAt = $webOwner.StartTime.ToUniversalTime().ToString('o')
        & node $identity web $manifestFile $webIdentityFile $webListener[0].OwningProcess $webStartedAt
        if ($LASTEXITCODE -ne 0) { throw 'Port 5175 is occupied by an unowned or stale listener; it was not stopped.' }
        Write-Output 'Reused verified Reward web listener.'
        return
    }
    $vite = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
    $webProcess = Start-Process -FilePath 'node.exe' -ArgumentList @($vite, '--mode', 'reward', '--host', '127.0.0.1', '--port', '5175', '--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'web.log') -RedirectStandardError (Join-Path $runtime 'web-error.log')
    Set-Content -LiteralPath (Join-Path $runtime 'web-pid.txt') -Value $webProcess.Id
    Wait-RewardWeb
    $webListener = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction Stop
    if ($webListener[0].OwningProcess -ne $webProcess.Id) { throw 'Reward web listener ownership did not match the process started by this launcher.' }
    @{ protocolKind = 'REWARD'; contractAddress = $manifest.contractAddress; pid = $webProcess.Id; startedAt = $webProcess.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress | Set-Content -LiteralPath $webIdentityFile
    Write-Output "Reward services ready: API 3002, web 5175, contract $($manifest.contractAddress)"
} catch {
    foreach ($process in @($webProcess, $apiProcess)) {
        if ($null -ne $process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    }
    throw
}
