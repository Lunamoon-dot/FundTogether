$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$existingListener = Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
    & node (Join-Path $PSScriptRoot 'configure-local-mining.cjs')
    if ($LASTEXITCODE -eq 2) {
        Write-Warning 'Existing deployment was verified and mining advances, but the chain clock differs from the machine. Time was not changed; deadlines still use chain time.'
    } elseif ($LASTEXITCODE -ne 0) {
        throw 'Existing RPC verification or mining check failed. See the diagnostic above. The node was not stopped or reset.'
    }
    Write-Output 'Reused the existing Anvil. Its current process still owns the chain; no second node was started.'
    exit 0
}
$stateDirectory = Join-Path $projectRoot '.local\anvil'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$statePath = Join-Path $stateDirectory 'state.json'
$windowsStateInWsl = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a $statePath).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the Windows backup path.' }
$linuxHome = (& wsl.exe -d Ubuntu-24.04 --exec printenv HOME).Trim()
if ($LASTEXITCODE -ne 0 -or -not $linuxHome.StartsWith('/')) { throw 'Could not resolve the WSL home directory.' }
$linuxStateDirectory = "$linuxHome/.local/state/fundtogether/anvil"
$linuxStatePath = "$linuxStateDirectory/state.json"
& wsl.exe -d Ubuntu-24.04 --exec mkdir -p -- $linuxStateDirectory
if ($LASTEXITCODE -ne 0) { throw 'Could not create the native Linux state directory.' }
& wsl.exe -d Ubuntu-24.04 --exec test -f $linuxStatePath
if ($LASTEXITCODE -ne 0 -and (Test-Path -LiteralPath $statePath)) {
    Write-Output 'Migrating the Windows state backup to native Linux storage (first start only).'
    & wsl.exe -d Ubuntu-24.04 --exec cp -- $windowsStateInWsl "$linuxStatePath.importing"
    if ($LASTEXITCODE -ne 0) { throw 'Could not import the saved chain. Anvil was not started.' }
    & wsl.exe -d Ubuntu-24.04 --exec mv -- "$linuxStatePath.importing" $linuxStatePath
    if ($LASTEXITCODE -ne 0) { throw 'Could not finish importing the saved chain. Anvil was not started.' }
}
Write-Output "Anvil active state (WSL): $linuxStatePath"
Write-Output "Windows backup after a clean exit: $statePath"
Write-Output 'Loading saved history may take time. Validated autosave: 60 seconds; mining: 5 seconds.'
$runnerPath = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -a (Join-Path $PSScriptRoot 'anvil_state.py')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the snapshot supervisor path.' }
# Anvil writes a pending file; the supervisor validates a copy before atomic promotion.
& wsl.exe -d Ubuntu-24.04 --exec python3 -B $runnerPath $linuxStatePath
if ($LASTEXITCODE -ne 0) { throw 'Anvil or snapshot validation failed. Read the diagnostic above; saved state was retained. Do not delete state or start an empty chain.' }
& wsl.exe -d Ubuntu-24.04 --exec cp -- $linuxStatePath "$windowsStateInWsl.copying"
if ($LASTEXITCODE -ne 0) { throw 'Anvil stopped, but the Windows backup could not be updated. The WSL state remains authoritative.' }
Move-Item -LiteralPath "$statePath.copying" -Destination $statePath -Force
