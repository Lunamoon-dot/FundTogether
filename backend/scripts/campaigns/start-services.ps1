param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$environmentFile = Join-Path $projectRoot '.local\fundtogether\backend.env'
$compose = Join-Path $projectRoot 'infra\fundtogether\compose.yaml'
$runtime = Join-Path $projectRoot '.local\fundtogether\runtime'
$manifestFile = Join-Path $projectRoot '.local\fundtogether\generated\campaigns-deployment.local.json'
$identity = Join-Path $PSScriptRoot 'runtime-identity.cjs'
$webIdentityFile = Join-Path $runtime 'web-identity.json'
$apiProcess = $null
$webProcess = $null

function Get-FundTogetherHealth {
    param($Manifest)
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3002/health' -UseBasicParsing -TimeoutSec 2
    & node $identity health $manifestFile $health.status $health.protocolKind $health.chainId $health.contractAddress
    if ($LASTEXITCODE -ne 0) { throw 'FundTogether API health identity does not match the current deployment manifest.' }
    return $health
}

function Wait-FundTogetherHealth {
    param($Manifest)
    $lastError = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { return Get-FundTogetherHealth $Manifest }
        catch { $lastError = $_.Exception.Message; Start-Sleep -Seconds 1 }
    }
    throw "FundTogether API did not become ready: $lastError"
}

function Wait-FundTogetherWeb {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5175' -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { Start-Sleep -Seconds 1 }
    }
    throw 'FundTogether frontend did not become ready on 5175.'
}

function Build-CampaignContract {
    $contractsLinux = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $projectRoot 'contracts')).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $contractsLinux.StartsWith('/')) { throw 'Cannot resolve Campaign contracts path.' }
    & wsl.exe -d Ubuntu-24.04 -- bash -lc "cd '$contractsLinux' && ~/.foundry/bin/forge build"
    if ($LASTEXITCODE -ne 0) { throw 'Campaign Foundry build failed.' }
}

try {
    & node (Join-Path $PSScriptRoot 'initialize-environment.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'FundTogether environment initialization failed.' }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null

    docker compose --env-file $environmentFile -f $compose up -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'Campaign containers did not become healthy.' }

    & (Join-Path $PSScriptRoot 'start-chain.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'FundTogether chain identity did not verify.' }

    if (-not $SkipBuild) {
        Build-CampaignContract
        Push-Location (Join-Path $projectRoot 'backend')
        try {
            npm.cmd run artifacts:campaigns
            if ($LASTEXITCODE -ne 0) { throw 'Campaign artifact generation failed.' }
            npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Campaign backend build failed.' }
        }
        finally { Pop-Location }
        Push-Location (Join-Path $projectRoot 'frontend')
        try { npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'FundTogether frontend build failed.' } }
        finally { Pop-Location }
    }

    & node (Join-Path $PSScriptRoot 'deploy-campaign.cjs') --create
    if ($LASTEXITCODE -ne 0) { throw 'Campaign deployment failed or did not verify.' }
    & node (Join-Path $PSScriptRoot 'migrate-isolated.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'FundTogether database migration failed.' }

    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    $apiListener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
    if ($apiListener) {
        Get-FundTogetherHealth $manifest | Out-Null
        Write-Output 'Reused verified FundTogether API listener.'
    } else {
        $apiProcess = Start-Process -FilePath 'node.exe' -ArgumentList @(Join-Path $PSScriptRoot 'run-backend.cjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'api.log') -RedirectStandardError (Join-Path $runtime 'api-error.log')
        Set-Content -LiteralPath (Join-Path $runtime 'api-pid.txt') -Value $apiProcess.Id
        Wait-FundTogetherHealth $manifest | Out-Null
    }

    $webListener = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue
    if ($webListener) {
        $webOwner = Get-Process -Id $webListener[0].OwningProcess -ErrorAction Stop
        $webStartedAt = $webOwner.StartTime.ToUniversalTime().ToString('o')
        & node $identity web $manifestFile $webIdentityFile $webListener[0].OwningProcess $webStartedAt
        if ($LASTEXITCODE -ne 0) { throw 'Port 5175 is occupied by an unowned or stale listener; it was not stopped.' }
        Write-Output 'Reused verified FundTogether web listener.'
        return
    }
    $vite = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
    $webProcess = Start-Process -FilePath 'node.exe' -ArgumentList @($vite, '--mode', 'fundtogether', '--host', '127.0.0.1', '--port', '5175', '--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'web.log') -RedirectStandardError (Join-Path $runtime 'web-error.log')
    Set-Content -LiteralPath (Join-Path $runtime 'web-pid.txt') -Value $webProcess.Id
    Wait-FundTogetherWeb
    $webListener = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction Stop
    if ($webListener[0].OwningProcess -ne $webProcess.Id) { throw 'FundTogether web listener ownership did not match the process started by this launcher.' }
    @{ protocolKind = 'CAMPAIGNS'; contractAddress = $manifest.contractAddress; pid = $webProcess.Id; startedAt = $webProcess.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress | Set-Content -LiteralPath $webIdentityFile
    Write-Output "FundTogether services ready: API 3002, web 5175, contract $($manifest.contractAddress)"
} catch {
    foreach ($process in @($webProcess, $apiProcess)) {
        if ($null -ne $process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    }
    throw
}
