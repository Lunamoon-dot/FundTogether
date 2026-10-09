$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$deploy = Join-Path $PSScriptRoot 'deploy-isolated.cjs'
$listeners = Get-NetTCPConnection -LocalPort 9547 -State Listen -ErrorAction SilentlyContinue
# WSL's localhost forwarding need not appear in Get-NetTCPConnection.
$respondingB = $false
try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:9547' -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' -TimeoutSec 2 | Out-Null
    $respondingB = $true
} catch {
    if ($_.Exception.Response) { $respondingB = $true }
}
if ($listeners -or $respondingB) {
    & node $deploy --verify-only
    if ($LASTEXITCODE -ne 0) { throw 'Workflow B listener identity failed; it was not stopped or reset.' }
    Write-Output 'Reused verified Workflow B chain; no second node started.'
    exit 0
}
$output = Join-Path $projectRoot '.local\workflow-b\anvil'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$linuxHomeB = (& wsl.exe -d Ubuntu-24.04 --exec printenv HOME).Trim()
if ($LASTEXITCODE -ne 0 -or -not $linuxHomeB.StartsWith('/')) { throw 'Cannot resolve B native state path.' }
$stateB = "$linuxHomeB/.local/state/fundtogether/workflow-b/anvil/state.json"
$runnerB = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $PSScriptRoot 'anvil_state_b.py')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve B supervisor path.' }
$backupB = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $output 'state.json')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve B backup path.' }
$manifestB = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $projectRoot '.local\workflow-b\generated\deployment.local.json')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve B manifest path.' }
$processB = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', 'Ubuntu-24.04', '--exec', 'python3', '-B', $runnerB, $stateB, $backupB, $manifestB) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'supervisor.log') -RedirectStandardError (Join-Path $output 'supervisor-error.log')
Set-Content -LiteralPath (Join-Path $output 'launcher-pid.txt') -Value $processB.Id
$readyB = $false
for ($attemptB = 0; $attemptB -lt 30; $attemptB++) {
    if ($processB.HasExited) { throw 'B supervisor exited; inspect its logs. Saved state preserved.' }
    & node $deploy --rpc-check 2>$null
    if ($LASTEXITCODE -eq 0) { $readyB = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $readyB) { throw 'B startup still pending under its original handle; do not launch another node.' }
& node $deploy --create
if ($LASTEXITCODE -ne 0) { throw 'B deployment failed; keep the launched node/state for diagnosis.' }
Write-Output "Workflow B ready on9547; launcher handle $($processB.Id), native state $stateB"
