param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$runtime = Join-Path $projectRoot '.local\fundtogether\runtime'

function Stop-OwnedProcess {
    param(
        [int]$ProcessId,
        [string]$Marker
    )

    if ($ProcessId -le 0) { return }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $processInfo) { return }
    if ([string]::IsNullOrWhiteSpace($processInfo.CommandLine) -or $processInfo.CommandLine -notlike "*$Marker*") {
        Write-Warning "Process $ProcessId was not recognized as FundTogether ($Marker); it was not stopped."
        return
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped FundTogether process $ProcessId ($Marker)."
}

function Stop-OwnedListener {
    param(
        [int]$Port,
        [string]$Marker
    )

    Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-OwnedProcess -ProcessId $_ -Marker $Marker }
}

$apiPidFile = Join-Path $runtime 'api-pid.txt'
if (Test-Path $apiPidFile) {
    $apiPid = (Get-Content -LiteralPath $apiPidFile -Raw).Trim()
    if ($apiPid -match '^\d+$') { Stop-OwnedProcess -ProcessId ([int]$apiPid) -Marker 'run-backend.cjs' }
}

$webIdentityFile = Join-Path $runtime 'web-identity.json'
if (Test-Path $webIdentityFile) {
    $webIdentity = Get-Content -LiteralPath $webIdentityFile -Raw | ConvertFrom-Json
    if ($webIdentity.pid -is [int] -or "$($webIdentity.pid)" -match '^\d+$') {
        Stop-OwnedProcess -ProcessId ([int]$webIdentity.pid) -Marker 'vite.js'
    }
}

# Recover from stale or missing PID files without touching unrelated listeners.
Stop-OwnedListener -Port 3002 -Marker 'run-backend.cjs'
Stop-OwnedListener -Port 5175 -Marker 'vite.js'

Remove-Item -LiteralPath $apiPidFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $webIdentityFile -Force -ErrorAction SilentlyContinue
Write-Output 'FundTogether API and web services stopped. Anvil, PostgreSQL, and MinIO were left running.'
