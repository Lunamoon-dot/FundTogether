$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$deploy = Join-Path $PSScriptRoot 'deploy-campaign.cjs'
$probe = Join-Path $PSScriptRoot 'windows-rpc-probe.cjs'
$env:FUNDTOGETHER_RPC_URL = 'http://127.0.0.1:9548'
$listeners = Get-NetTCPConnection -LocalPort 9548 -State Listen -ErrorAction SilentlyContinue
$responding = $false
try { Invoke-RestMethod -Uri $env:FUNDTOGETHER_RPC_URL -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' -TimeoutSec 2 | Out-Null; $responding = $true }
catch { if ($_.Exception.Response) { $responding = $true } }
if ($listeners -or $responding) {
    & node $probe $env:FUNDTOGETHER_RPC_URL
    if ($LASTEXITCODE -ne 0) { throw 'Campaign listener is not a Windows-reachable chain 31339; it was not stopped or reset.' }
    & node $deploy --verify-only
    if ($LASTEXITCODE -ne 0) { throw 'Campaign listener identity failed; it was not stopped or reset.' }
    Write-Output 'Reused verified FundTogether chain; no second node started.'
    exit 0
}
$output = Join-Path $projectRoot '.local\fundtogether\anvil'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$linuxHome = (& wsl.exe -d Ubuntu-24.04 --exec printenv HOME).Trim()
if ($LASTEXITCODE -ne 0 -or -not $linuxHome.StartsWith('/')) { throw 'Cannot resolve Campaign native state path.' }
$state = "$linuxHome/.local/state/fundtogether/campaigns/anvil/state.json"
$runner = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $PSScriptRoot 'anvil_state_campaign.py')).Trim()
$backup = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $output 'state.json')).Trim()
$manifest = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $projectRoot '.local\fundtogether\generated\campaigns-deployment.local.json')).Trim()
$pidFile = Join-Path $output 'supervisor.pid'
$linuxPidFile = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a $pidFile).Trim()
$process = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', 'Ubuntu-24.04', '--exec', 'python3', '-B', $runner, $state, $backup, $manifest, $linuxPidFile) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'supervisor.log') -RedirectStandardError (Join-Path $output 'supervisor-error.log')
Set-Content -LiteralPath (Join-Path $output 'launcher-pid.txt') -Value $process.Id

function Stop-FundTogetherSupervisor {
    if (Test-Path $pidFile) {
        $linuxPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        if ($linuxPid -match '^\d+$') { & wsl.exe -d Ubuntu-24.04 --exec kill -TERM $linuxPid 2>$null }
    }
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit(5000) | Out-Null
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($process.HasExited) { throw 'Campaign supervisor exited; inspect logs. Saved state preserved.' }
    & node $probe $env:FUNDTOGETHER_RPC_URL --quiet | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Stop-FundTogetherSupervisor
    throw 'FundTogether RPC remained WSL-only. No deployment was created. Set [wsl2] localhostForwarding=true in %UserProfile%\.wslconfig, run wsl --shutdown, reopen Ubuntu/Docker Desktop, then retry.'
}
& node $deploy --create
if ($LASTEXITCODE -ne 0) { throw 'FundTogether deployment failed; keep launched node/state for diagnosis.' }
Write-Output "Campaign ready on 9548; launcher handle $($process.Id), native state $state"
