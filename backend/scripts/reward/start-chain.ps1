$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$deploy = Join-Path $PSScriptRoot 'deploy-isolated.cjs'
$env:REWARD_RPC_URL = 'http://127.0.0.1:9548'
$listeners = Get-NetTCPConnection -LocalPort 9548 -State Listen -ErrorAction SilentlyContinue
$responding = $false
try { Invoke-RestMethod -Uri $env:REWARD_RPC_URL -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' -TimeoutSec 2 | Out-Null; $responding = $true }
catch { if ($_.Exception.Response) { $responding = $true } }
if ($listeners -or $responding) {
    & node $deploy --verify-only
    if ($LASTEXITCODE -ne 0) { throw 'Reward listener identity failed; it was not stopped or reset.' }
    Write-Output 'Reused verified Reward chain; no second node started.'
    exit 0
}
$output = Join-Path $projectRoot '.local\reward\anvil'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$linuxHome = (& wsl.exe -d Ubuntu-24.04 --exec printenv HOME).Trim()
if ($LASTEXITCODE -ne 0 -or -not $linuxHome.StartsWith('/')) { throw 'Cannot resolve Reward native state path.' }
$state = "$linuxHome/.local/state/fundtogether/reward/anvil/state.json"
$runner = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $PSScriptRoot 'anvil_state_reward.py')).Trim()
$backup = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $output 'state.json')).Trim()
$manifest = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $projectRoot '.local\reward\generated\deployment.local.json')).Trim()
$process = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', 'Ubuntu-24.04', '--exec', 'python3', '-B', $runner, $state, $backup, $manifest) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'supervisor.log') -RedirectStandardError (Join-Path $output 'supervisor-error.log')
Set-Content -LiteralPath (Join-Path $output 'launcher-pid.txt') -Value $process.Id
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($process.HasExited) { throw 'Reward supervisor exited; inspect logs. Saved state preserved.' }
    & node $deploy --rpc-check 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'Reward startup still pending under its original handle; do not launch another node.' }
& node $deploy --create
if ($LASTEXITCODE -ne 0) { throw 'Reward deployment failed; keep launched node/state for diagnosis.' }
Write-Output "Reward ready on 9548; launcher handle $($process.Id), native state $state"
