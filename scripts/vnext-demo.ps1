param(
  [ValidateSet('doctor', 'up', 'status', 'smoke', 'down', 'demo:test-fresh')]
  [string]$Command = 'status',
  [string]$EnvironmentFile,
  [string]$ManifestPath,
  [string]$StateFile,
  [string]$ComposeProject,
  [switch]$FreshTestRuntime
)

$ErrorActionPreference = 'Stop'
$script:Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:ExplicitEnvironmentFile = $PSBoundParameters.ContainsKey('EnvironmentFile')
$script:ComposeFile = Join-Path $script:Root 'infra/vnext-demo/compose.yaml'
$script:EnvironmentFile = if ($EnvironmentFile) { [IO.Path]::GetFullPath($EnvironmentFile) } else { Join-Path $script:Root '.local/fundtogether/vnext-demo.env' }
$script:ManifestPath = if ($ManifestPath) { [IO.Path]::GetFullPath($ManifestPath) } else { Join-Path $script:Root '.local/fundtogether/generated/vnext-deployment.local.json' }
$script:StateFile = if ($StateFile) { [IO.Path]::GetFullPath($StateFile) } else { Join-Path $script:Root '.local/fundtogether/runtime/vnext-demo/launcher-state.json' }
$script:ComposeProject = if ($ComposeProject) { $ComposeProject } else { 'fundtogether-vnext-demo' }
$script:Disposable = [bool]$FreshTestRuntime
$script:RuntimeState = [ordered]@{ composeProject = $script:ComposeProject; processes = @(); containers = @(); freshTest = $script:Disposable }

function Write-Info([string]$Message) { Write-Host "[VNext demo] $Message" }

function Read-DemoEnvironment {
  if (-not (Test-Path -LiteralPath $script:EnvironmentFile)) { return @{} }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $script:EnvironmentFile) {
    if ($line -match '^([^#=]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
  }
  return $values
}

function Protect-EnvironmentFile([string]$Path) {
  try { & icacls.exe $Path /inheritance:r /grant:r "$($env:USERNAME):(F)" | Out-Null } catch { }
}

function Save-RuntimeState {
  $parent = Split-Path -Parent $script:StateFile
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $script:RuntimeState | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $script:StateFile -Encoding utf8
}

function Set-RuntimeConfig([string]$EnvPath, [string]$DeploymentPath, [string]$LauncherStatePath, [string]$ProjectName, [bool]$Disposable) {
  $script:EnvironmentFile = [IO.Path]::GetFullPath($EnvPath)
  $script:ManifestPath = [IO.Path]::GetFullPath($DeploymentPath)
  $script:StateFile = [IO.Path]::GetFullPath($LauncherStatePath)
  $script:ComposeProject = $ProjectName
  $script:Disposable = $Disposable
  $script:RuntimeState = [ordered]@{ composeProject = $ProjectName; processes = @(); containers = @(); freshTest = $Disposable }
  if (Test-Path -LiteralPath $script:StateFile) {
    $state = Get-Content -LiteralPath $script:StateFile -Raw | ConvertFrom-Json -AsHashtable
    if ($state.composeProject -ne $ProjectName) { throw 'Runtime state belongs to another Compose project.' }
    $script:RuntimeState = $state
  }
}

function Load-RuntimeState {
  if (-not (Test-Path -LiteralPath $script:StateFile)) { throw "No launcher-owned runtime state found at $script:StateFile" }
  $state = Get-Content -LiteralPath $script:StateFile -Raw | ConvertFrom-Json -AsHashtable
  if ($state.composeProject -ne $script:ComposeProject) { throw 'Runtime state belongs to a different Compose project; refusing to stop it.' }
  $liveProcesses = @()
  foreach ($entry in $state.processes) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
    if (-not $process) {
      if ($entry.kind -eq 'anvil' -and $entry.marker.Contains('--exec bash -lc')) { $liveProcesses += $entry }
      continue
    }
    if (-not (Test-OwnedProcessIdentity $process $entry)) { throw "PID $($entry.pid) no longer matches the saved $($entry.kind) process identity." }
    $liveProcesses += $entry
  }
  $state.processes = $liveProcesses
  $script:RuntimeState = $state
}

function Test-PortFree([int]$Port) {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
  try { $listener.Start(); return $true } catch { return $false } finally { try { $listener.Stop() } catch { } }
}

function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return [int]$listener.LocalEndpoint.Port } finally { $listener.Stop() }
}

function Wait-Until([scriptblock]$Check, [string]$Description, [int]$Attempts = 90) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    try { if (& $Check) { return } } catch { }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for $Description. Check the service log under .local/fundtogether/runtime."
}

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory = $script:Root) {
  Push-Location $WorkingDirectory
  try {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

function Invoke-Compose([string[]]$Arguments) {
  $composeArguments = @('compose', '--env-file', $script:EnvironmentFile, '-f', $script:ComposeFile, '-p', $script:ComposeProject) + $Arguments
  Write-Info "Compose command: docker $($composeArguments -join ' ')"
  $previous = Get-NodeEnvironment (Read-DemoEnvironment)
  try { Invoke-Checked 'docker' $composeArguments } finally { Restore-NodeEnvironment $previous }
}

function Get-ComposeContainerIds {
  $ids = & docker ps -a -q --filter "label=com.docker.compose.project=$script:ComposeProject"
  if ($LASTEXITCODE -ne 0) { return @() }
  return @($ids | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Get-DockerProjectIds([string]$Kind) {
  $ids = & docker $Kind ls -q --filter "label=com.docker.compose.project=$script:ComposeProject"
  if ($LASTEXITCODE -ne 0) { return @() }
  return @($ids | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Ensure-Docker {
  try { & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { return } } catch { }
  $desktopCandidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe')
  )
  $desktop = $desktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $desktop) { throw 'Docker Desktop is required; install or start it, then rerun this command.' }
  Write-Info 'Starting Docker Desktop and waiting for its engine.'
  Start-Process -FilePath $desktop -WindowStyle Hidden | Out-Null
  Wait-Until { & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null; $LASTEXITCODE -eq 0 } 'Docker Engine' 120
}

function Get-NodeEnvironment([hashtable]$Values) {
  $keys = @($Values.Keys) + @('FUNDTOGETHER_VNEXT_ENV_PATH', 'FUNDTOGETHER_VNEXT_MANIFEST_PATH', 'FUNDTOGETHER_PROTOCOL', 'FUNDTOGETHER_VNEXT_INDEXER_ENABLED')
  $previous = @{}
  foreach ($key in ($keys | Select-Object -Unique)) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    if ($Values.ContainsKey($key)) { [Environment]::SetEnvironmentVariable($key, [string]$Values[$key], 'Process') }
  }
  [Environment]::SetEnvironmentVariable('FUNDTOGETHER_VNEXT_ENV_PATH', $script:EnvironmentFile, 'Process')
  [Environment]::SetEnvironmentVariable('FUNDTOGETHER_VNEXT_MANIFEST_PATH', $script:ManifestPath, 'Process')
  [Environment]::SetEnvironmentVariable('FUNDTOGETHER_PROTOCOL', 'FUNDTOGETHER_VNEXT', 'Process')
  [Environment]::SetEnvironmentVariable('FUNDTOGETHER_VNEXT_INDEXER_ENABLED', 'true', 'Process')
  return $previous
}

function Restore-NodeEnvironment([hashtable]$Previous) {
  foreach ($key in $Previous.Keys) { [Environment]::SetEnvironmentVariable($key, $Previous[$key], 'Process') }
}

function Start-OwnedProcess([string]$Kind, [string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory, [string]$LogName, [hashtable]$Environment = @{}, [switch]$MinimalEnvironment, [switch]$SuppressOutput) {
  $logDirectory = Join-Path $script:Root '.local/fundtogether/runtime'
  New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
  $ownedLogName = "$($script:ComposeProject)-$LogName"
  $previous = if ($MinimalEnvironment) { Get-NodeEnvironment @{} } else { Get-NodeEnvironment (Read-DemoEnvironment) }
  try {
    foreach ($key in $Environment.Keys) { [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process') }
    $quotedArguments = @($Arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ([string]$_).Replace('"', '\"') + '"' } else { [string]$_ } }) -join ' '
    if ($SuppressOutput) {
      $process = Start-Process -FilePath $Executable -ArgumentList $quotedArguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput 'NUL' -RedirectStandardError (Join-Path $logDirectory "$ownedLogName.err.log")
    } else {
      $process = Start-Process -FilePath $Executable -ArgumentList $quotedArguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "$ownedLogName.out.log") -RedirectStandardError (Join-Path $logDirectory "$ownedLogName.err.log")
    }
  } finally { Restore-NodeEnvironment $previous }
  $entry = [ordered]@{ kind = $Kind; pid = $process.Id; executable = [IO.Path]::GetFileName($Executable); marker = ($Arguments -join ' '); log = if ($SuppressOutput) { $null } else { "$ownedLogName.out.log" } }
  $script:RuntimeState.processes += $entry
  Save-RuntimeState
  if ($entry.log) { Write-Info "Started $Kind (PID $($process.Id)); log: $($entry.log)" } else { Write-Info "Started $Kind (PID $($process.Id)); output suppressed." }
}

function Get-RpcChainId([string]$RpcUrl) {
  $response = Invoke-RestMethod -Method Post -Uri $RpcUrl -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' -TimeoutSec 4
  return [int][Convert]::ToInt64($response.result.Substring(2), 16)
}

function Wait-Rpc([string]$RpcUrl) {
  Wait-Until { (Get-RpcChainId $RpcUrl) -eq 31339 } "Anvil RPC on chain 31339 at $RpcUrl"
}

function Get-AnvilPath {
  $native = Get-Command anvil -ErrorAction SilentlyContinue
  if ($native) { return @{ mode = 'native'; path = $native.Source } }
  $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if (-not $wsl) { throw 'Anvil is required. Install Foundry on Windows or in an installed WSL distribution.' }
  $found = (& wsl.exe -d Ubuntu-24.04 --exec bash -lc 'if command -v anvil >/dev/null 2>&1; then command -v anvil; elif test -x /home/dell/.foundry/bin/anvil; then echo /home/dell/.foundry/bin/anvil; fi' 2>$null | Select-Object -First 1).Trim()
  if (-not $found) { throw 'Anvil is missing from WSL Ubuntu-24.04. Install Foundry in that distribution, then rerun doctor.' }
  return @{ mode = 'wsl'; path = $found }
}

function Start-Anvil([string]$AnvilPath, [int]$RpcPort, [string]$ChainStatePath) {
  $parent = Split-Path -Parent $ChainStatePath
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $existing = @($script:RuntimeState.processes | Where-Object { $_.kind -eq 'anvil' })
  if ($existing.Count) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($existing[0].pid)" -ErrorAction SilentlyContinue
    if ($process -and (Test-OwnedProcessIdentity $process $existing[0])) { Wait-Rpc "http://127.0.0.1:$RpcPort"; return }
    $script:RuntimeState.processes = @($script:RuntimeState.processes | Where-Object { $_.kind -ne 'anvil' })
  }
  if ($AnvilPath.StartsWith('/')) {
    $linuxState = (& wsl.exe -d Ubuntu-24.04 --exec wslpath -u $ChainStatePath).Trim()
    if ($AnvilPath.Contains("'") -or $linuxState.Contains("'")) { throw 'Anvil and chain-state paths cannot contain a single quote.' }
    $quotedPath = "'$AnvilPath'"
    $quotedState = "'$linuxState'"
    $command = "exec '$quotedPath' --host 0.0.0.0 --port $RpcPort --chain-id 31339 --accounts 10 --balance 1000000 --state '$quotedState' >/dev/null 2>&1"
    $args = @('-d', 'Ubuntu-24.04', '--exec', 'bash', '-lc', $command)
    Start-OwnedProcess 'anvil' (Get-Command wsl.exe).Source $args $script:Root 'vnext-demo-anvil' @{} -MinimalEnvironment -SuppressOutput
  } else {
    $args = @('--host', '127.0.0.1', '--port', "$RpcPort", '--chain-id', '31339', '--accounts', '10', '--balance', '1000000', '--state', $ChainStatePath)
    Start-OwnedProcess 'anvil' $AnvilPath $args $script:Root 'vnext-demo-anvil' @{} -MinimalEnvironment -SuppressOutput
  }
  Wait-Rpc "http://127.0.0.1:$RpcPort"
}

function Test-OwnedProcessIdentity($Process, $Entry) {
  if ($Process.ExecutablePath -notlike "*$($Entry.executable)") { return $false }
  if ($Entry.kind -eq 'anvil' -and $Entry.marker.Contains('--exec bash -lc')) {
    $statePath = [regex]::Match($Entry.marker, '/mnt/[^\s'']+\.json').Value
    return $statePath -and $Process.CommandLine.Contains('/anvil') -and $Process.CommandLine.Contains($statePath)
  }
  return $Process.CommandLine.Contains($Entry.marker)
}

function Get-OwnedWslAnvilPids([string]$Marker) {
  $statePath = [regex]::Match($Marker, '/mnt/[^'']+\.json').Value
  if (-not $statePath -or $statePath.Contains("'")) { throw 'Saved WSL Anvil state path is missing or invalid.' }
  $lines = & wsl.exe -d Ubuntu-24.04 --exec bash -lc "ps -eo pid=,args= | grep -F '$statePath' | grep -v grep" 2>$null
  $pids = @()
  foreach ($line in $lines) {
    if ($line -match '^\s*(\d+)\s+(.+)$') {
      $arguments = $Matches[2]
      $executable = ($arguments -split '\s+', 2)[0].Trim('"')
      if ((Split-Path -Leaf $executable) -eq 'anvil' -and $arguments.Contains('--state') -and $arguments.Contains($statePath)) { $pids += [int]$Matches[1] }
    }
  }
  return $pids
}

function Stop-OwnedWslAnvil($Entry, [int]$RpcPort, [switch]$Disposable) {
  $pids = @(Get-OwnedWslAnvilPids $Entry.marker)
  foreach ($linuxPid in $pids) {
    & wsl.exe -d Ubuntu-24.04 --exec kill -TERM "$linuxPid" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Could not send SIGTERM to launcher-owned WSL Anvil PID $linuxPid." }
  }
  if ($pids.Count) {
    try { Wait-Until { @(Get-OwnedWslAnvilPids $Entry.marker).Count -eq 0 } 'launcher-owned WSL Anvil process shutdown' 20 }
    catch {
      if (-not $Disposable) { throw }
      foreach ($linuxPid in @(Get-OwnedWslAnvilPids $Entry.marker)) {
        & wsl.exe -d Ubuntu-24.04 --exec kill -KILL "$linuxPid" 2>$null
        if ($LASTEXITCODE -ne 0) { throw "Could not stop disposable launcher-owned WSL Anvil PID $linuxPid." }
      }
      Wait-Until { @(Get-OwnedWslAnvilPids $Entry.marker).Count -eq 0 } 'disposable launcher-owned WSL Anvil process shutdown' 20
    }
  }
  $launcherProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($Entry.pid)" -ErrorAction SilentlyContinue
  if ($launcherProcess) {
    if (-not (Test-OwnedProcessIdentity $launcherProcess $Entry)) { throw "PID $($Entry.pid) no longer matches the saved Anvil launcher identity." }
    Stop-Process -Id ([int]$Entry.pid) -Force -ErrorAction SilentlyContinue
    Wait-Until { -not (Get-CimInstance Win32_Process -Filter "ProcessId = $($Entry.pid)" -ErrorAction SilentlyContinue) } "Anvil launcher process $($Entry.pid) shutdown" 20
  }
  Wait-Until { Test-PortFree $RpcPort } "Anvil RPC listener on port $RpcPort shutdown" 40
}

function Ensure-Environment {
  if (-not (Test-Path -LiteralPath $script:EnvironmentFile)) {
    if ($script:ExplicitEnvironmentFile -and -not $script:Disposable) { throw "The specified environment file does not exist: $script:EnvironmentFile" }
    $initializer = Join-Path $script:Root 'backend/scripts/campaigns/initialize-vnext-demo.cjs'
    $null = Invoke-Checked 'node' @($initializer, $script:EnvironmentFile)
    Protect-EnvironmentFile $script:EnvironmentFile
  }
  $values = Read-DemoEnvironment
  foreach ($key in @('POSTGRES_PORT', 'MINIO_API_PORT', 'MINIO_CONSOLE_PORT', 'FUNDTOGETHER_RPC_URL', 'PORT', 'VITE_FUNDTOGETHER_WEB_PORT')) {
    if (-not $values.ContainsKey($key)) { throw "Missing $key in the VNext demo environment file." }
  }
  Write-Info "Loaded demo environment with $($values.Count) keys; PostgreSQL $($values.POSTGRES_PORT), RPC $($values.FUNDTOGETHER_RPC_URL)."
  $rpc = [Uri]$values.FUNDTOGETHER_RPC_URL
  if ($rpc.Scheme -notin @('http', 'https') -or $rpc.Host -notin @('127.0.0.1', 'localhost')) { throw 'The VNext demo RPC must use a local loopback address.' }
  return $values
}

function Ensure-ComposeServices([hashtable]$Values) {
  Write-Info "Using isolated service configuration $script:EnvironmentFile"
  $before = @(Get-ComposeContainerIds)
  foreach ($portName in @('POSTGRES_PORT', 'MINIO_API_PORT', 'MINIO_CONSOLE_PORT')) {
    $port = [int]$Values[$portName]
    if (-not (Test-PortFree $port) -and -not $before.Count) { throw "Required local port $port is already in use by an unknown service." }
  }
  try { Invoke-Compose @('up', '-d', '--build', '--wait', '--wait-timeout', '180') } catch {
    $partial = @(Get-ComposeContainerIds)
    $script:RuntimeState.containers = @($script:RuntimeState.containers) + @($partial | Where-Object { $_ -notin $before -and $_ -notin $script:RuntimeState.containers })
    Save-RuntimeState
    throw
  }
  $after = @(Get-ComposeContainerIds)
  $script:RuntimeState.containers = @($script:RuntimeState.containers) + @($after | Where-Object { $_ -notin $before -and $_ -notin $script:RuntimeState.containers })
  Save-RuntimeState
  Wait-Until {
    $containers = Get-ComposeContainerIds
    $containers.Count -ge 2 -and @($containers | ForEach-Object { (docker inspect --format '{{.State.Health.Status}}' $_ 2>$null).Trim() } | Where-Object { $_ -eq 'healthy' }).Count -ge 1
  } 'PostgreSQL and MinIO containers'
  Wait-Until { $response = Invoke-WebRequest -Uri "$($Values.S3_ENDPOINT)/minio/health/ready" -TimeoutSec 3 -UseBasicParsing; $response.StatusCode -eq 200 } 'MinIO readiness'
}

function Ensure-VNextDeployment([hashtable]$Values, [string]$AnvilPath) {
  $rpcUrl = $Values.FUNDTOGETHER_RPC_URL
  $rpcPort = [int]([Uri]$rpcUrl).Port
  $chainState = Join-Path (Split-Path -Parent $script:StateFile) 'anvil-state.json'
  $identityFile = Join-Path (Split-Path -Parent $script:StateFile) 'anvil-genesis.json'
  if (Test-Path -LiteralPath $script:ManifestPath) {
    $chainId = $null
    try { $chainId = Get-RpcChainId $rpcUrl } catch { }
    if ($chainId -ne 31339) {
      if (-not (Test-PortFree $rpcPort)) { throw "RPC port $rpcPort is occupied but does not identify chain 31339; existing manifest will be left untouched." }
      Start-Anvil $AnvilPath $rpcPort $chainState
    }
    $manifest = Get-Content -LiteralPath $script:ManifestPath -Raw | ConvertFrom-Json
    if ($manifest.protocolKind -ne 'FUNDTOGETHER_VNEXT' -or [int]$manifest.chainId -ne 31339 -or $manifest.rpcUrl -ne $rpcUrl) { throw 'Existing deployment manifest identity or RPC differs from this local runtime; it will not be overwritten.' }
    $previous = Get-NodeEnvironment $Values
    try {
      [Environment]::SetEnvironmentVariable('FUNDTOGETHER_VNEXT_MANIFEST_PATH', $script:ManifestPath, 'Process')
      Invoke-Checked 'node' @((Join-Path $script:Root 'backend/scripts/campaigns/verify-vnext-runtime.cjs'), $script:ManifestPath)
    } finally { Restore-NodeEnvironment $previous }
    return
  }

  $occupied = $false
  try { $null = Get-RpcChainId $rpcUrl; $occupied = $true } catch { }
  if ($occupied) { throw "RPC $rpcUrl already responds but there is no VNext manifest to verify. Refusing deployment." }
  if (-not (Test-PortFree $rpcPort)) { throw "Required local RPC port $rpcPort is already occupied by an unidentified listener." }
  if ((Test-Path -LiteralPath $chainState) -and -not (Test-Path -LiteralPath $identityFile)) { throw 'An Anvil state file exists without this launcher identity record; refusing to reuse or replace it.' }
  Start-Anvil $AnvilPath $rpcPort $chainState
  $genesis = Invoke-RestMethod -Method Post -Uri $rpcUrl -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0",false]}'
  $genesisHash = $genesis.result.hash
  if (Test-Path -LiteralPath $identityFile) {
    $known = Get-Content -LiteralPath $identityFile -Raw | ConvertFrom-Json
    if ($known.genesisHash -ne $genesisHash) { throw 'Anvil state does not match this launcher identity; refusing deployment.' }
  } else {
    @{ genesisHash = $genesisHash; chainId = 31339 } | ConvertTo-Json | Set-Content -LiteralPath $identityFile -Encoding utf8
  }
  $previous = Get-NodeEnvironment $Values
  try {
    [Environment]::SetEnvironmentVariable('FUNDTOGETHER_VNEXT_MANIFEST_PATH', $script:ManifestPath, 'Process')
    Invoke-Checked 'node' @((Join-Path $script:Root 'backend/scripts/campaigns/deploy-vnext.cjs'))
    Invoke-Checked 'node' @((Join-Path $script:Root 'backend/scripts/campaigns/verify-vnext-runtime.cjs'), $script:ManifestPath)
  } finally { Restore-NodeEnvironment $previous }
}

function Test-FrontendResponse([int]$Port) {
  try {
    $page = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -TimeoutSec 3 -UseBasicParsing
    return $page.StatusCode -eq 200 -and $page.Content.Contains('/src/main.tsx')
  } catch { return $false }
}

function Start-ApiAndFrontend([hashtable]$Values) {
  $apiPort = [int]$Values.PORT
  $webPort = [int]$Values.VITE_FUNDTOGETHER_WEB_PORT
  $healthUrl = "http://127.0.0.1:$apiPort/health"
  $manifest = Get-Content -LiteralPath $script:ManifestPath -Raw | ConvertFrom-Json
  $apiIsReady = $false
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    $apiIsReady = $health.status -eq 'ok' -and $health.protocolKind -eq 'FUNDTOGETHER_VNEXT' -and [int]$health.chainId -eq 31339 -and $health.contractAddress -eq $manifest.campaignEscrow
  } catch { }
  if (-not $apiIsReady) {
    if (-not (Test-PortFree $apiPort)) { throw "API port $apiPort is occupied by a service that is not this VNext runtime." }
    $apiEnvironment = @{ FUNDTOGETHER_VNEXT_MANIFEST_PATH = $script:ManifestPath; FUNDTOGETHER_VNEXT_ENV_PATH = $script:EnvironmentFile; FUNDTOGETHER_PROTOCOL = 'FUNDTOGETHER_VNEXT'; FUNDTOGETHER_VNEXT_INDEXER_ENABLED = 'true' }
    Start-OwnedProcess 'backend' (Get-Command node).Source @('dist/src/main.js') (Join-Path $script:Root 'backend') 'vnext-demo-backend' $apiEnvironment
    Wait-Until {
      $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
      $health.status -eq 'ok' -and $health.protocolKind -eq 'FUNDTOGETHER_VNEXT' -and [int]$health.chainId -eq 31339 -and $health.contractAddress -eq $manifest.campaignEscrow
    } 'VNext API identity'
  }
  if (-not (Test-FrontendResponse $webPort)) {
    if (-not (Test-PortFree $webPort)) { throw "Frontend port $webPort is occupied by an unknown service." }
    $vite = Join-Path $script:Root 'frontend/node_modules/vite/bin/vite.js'
    $frontEnvironment = @{ VITE_FUNDTOGETHER_API_URL = "http://127.0.0.1:$apiPort" }
    Start-OwnedProcess 'frontend' (Get-Command node).Source @($vite, '--host', '127.0.0.1', '--port', "$webPort", '--strictPort') (Join-Path $script:Root 'frontend') 'vnext-demo-frontend' $frontEnvironment -MinimalEnvironment
    Wait-Until { Test-FrontendResponse $webPort } 'VNext frontend'
  }
}

function Invoke-Doctor {
  $checks = [ordered]@{}
  $node = (& node --version 2>$null)
  $nodeMajor = if ($node -match '^v(\d+)') { [int]$Matches[1] } else { 0 }
  $checks.Node = @{ available = ($nodeMajor -ge 24); version = $node; requirement = 'Node.js 24+' }
  $checks.Npm = @{ available = [bool](Get-Command npm -ErrorAction SilentlyContinue); version = (& npm --version 2>$null) }
  try { $dockerInfo = (& docker info --format '{{.ServerVersion}}' 2>$null); $checks.Docker = @{ available = ($LASTEXITCODE -eq 0); version = $dockerInfo } } catch { $checks.Docker = @{ available = $false; detail = 'Docker Desktop engine is stopped or missing' } }
  try { $anvil = Get-AnvilPath; $checks.Anvil = @{ available = $true; mode = $anvil.mode; path = $anvil.path } } catch { $checks.Anvil = @{ available = $false; detail = $_.Exception.Message } }
  $checks.Dependencies = @{ backend = Test-Path (Join-Path $script:Root 'backend/node_modules'); frontend = Test-Path (Join-Path $script:Root 'frontend/node_modules'); contracts = Test-Path (Join-Path $script:Root 'contracts/out/CampaignEscrowVNext.sol/CampaignEscrowVNext.json'); playwright = Test-Path (Join-Path $script:Root 'backend/node_modules/playwright') }
  $checks.Ports = @{}
  foreach ($port in @(15436, 19202, 19203, 9548, 3002, 5187)) { $checks.Ports["$port"] = if (Test-PortFree $port) { 'free' } else { 'occupied; up will verify ownership before reuse' } }
  $checks | ConvertTo-Json -Depth 5 | Write-Output
  $required = $checks.Node.available -and $checks.Npm.available -and $checks.Docker.available -and $checks.Anvil.available -and $checks.Dependencies.backend -and $checks.Dependencies.frontend -and $checks.Dependencies.contracts -and $checks.Dependencies.playwright
  if (-not $required) { throw 'One or more required local demo prerequisites are missing.' }
}

function Invoke-Up {
  $startupTimer = [Diagnostics.Stopwatch]::StartNew()
  if (Test-Path -LiteralPath $script:StateFile) { Load-RuntimeState } else { Save-RuntimeState }
  $values = Ensure-Environment
  foreach ($dependency in @(
    (Join-Path $script:Root 'backend/node_modules'),
    (Join-Path $script:Root 'frontend/node_modules'),
    (Join-Path $script:Root 'contracts/out/CampaignEscrowVNext.sol/CampaignEscrowVNext.json'),
    (Join-Path $script:Root 'backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json')
  )) { if (-not (Test-Path -LiteralPath $dependency)) { throw "Required project dependency is missing: $dependency. Install packages and build the contracts first." } }
  Ensure-Docker
  $anvil = Get-AnvilPath
  Ensure-ComposeServices $values
  $migrator = Join-Path $script:Root 'backend/scripts/campaigns/migrate-vnext-demo.cjs'
  Invoke-Checked 'node' @($migrator, $script:EnvironmentFile)
  Invoke-Checked 'npm' @('run', 'build') (Join-Path $script:Root 'backend')
  Ensure-VNextDeployment $values $anvil.path
  Start-ApiAndFrontend $values
  $status = Join-Path $script:Root 'backend/scripts/campaigns/vnext-demo-status.cjs'
  Wait-Until {
    $output = & node $status $script:EnvironmentFile $script:ManifestPath $values.PORT $values.VITE_FUNDTOGETHER_WEB_PORT $script:StateFile 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    $report = ($output -join "`n") | ConvertFrom-Json
    $report.status -eq 'READY' -and $report.database.indexer.status -eq 'synced'
  } 'canonical VNext indexer checkpoint'
  $startupTimer.Stop()
  $script:RuntimeState.startupMs = $startupTimer.ElapsedMilliseconds
  Save-RuntimeState
  Invoke-Status
}

function Invoke-Status {
  $values = Read-DemoEnvironment
  if (-not $values.Count) { throw "VNext demo environment is not initialized. Run: scripts/vnext-demo.ps1 up" }
  $status = Join-Path $script:Root 'backend/scripts/campaigns/vnext-demo-status.cjs'
  Invoke-Checked 'node' @($status, $script:EnvironmentFile, $script:ManifestPath, $values.PORT, $values.VITE_FUNDTOGETHER_WEB_PORT, $script:StateFile)
}

function Invoke-Down([switch]$RemoveDisposableResources) {
  Load-RuntimeState
  foreach ($entry in $script:RuntimeState.processes) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
    if ($entry.kind -eq 'anvil' -and $entry.marker.Contains('--exec bash -lc')) {
      $values = Read-DemoEnvironment
      $rpcPort = [int]([Uri]$values.FUNDTOGETHER_RPC_URL).Port
      if ($process -and -not (Test-OwnedProcessIdentity $process $entry)) { throw "PID $($entry.pid) no longer matches the saved Anvil launcher identity; refusing cleanup." }
      Stop-OwnedWslAnvil $entry $rpcPort -Disposable:$RemoveDisposableResources
      continue
    }
    if (-not $process) { continue }
    if (-not (Test-OwnedProcessIdentity $process $entry)) { throw "PID $($entry.pid) no longer matches the saved $($entry.kind) process identity; refusing cleanup." }
    Stop-Process -Id ([int]$entry.pid) -Force -ErrorAction SilentlyContinue
    Wait-Until { -not (Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue) } "$($entry.kind) process $($entry.pid) shutdown" 20
  }
  foreach ($id in $script:RuntimeState.containers) {
    $projectLabel = (& docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' $id 2>$null).Trim()
    if ($projectLabel -ne $script:ComposeProject) { continue }
    if ($RemoveDisposableResources -and $script:RuntimeState.freshTest -and $script:ComposeProject -match '^fundtogether-vnext-test-[a-f0-9]{32}-(direct|browser)$') {
      & docker rm -f -v $id | Out-Null
    } else { & docker stop $id | Out-Null }
  }
  if ($RemoveDisposableResources -and $script:RuntimeState.freshTest -and $script:ComposeProject -match '^fundtogether-vnext-test-[a-f0-9]{32}-(direct|browser)$') {
    foreach ($volume in (Get-DockerProjectIds 'volume')) { & docker volume rm $volume | Out-Null }
    foreach ($network in (Get-DockerProjectIds 'network')) { & docker network rm $network | Out-Null }
    & docker image rm "$script:ComposeProject-minio:latest" 2>$null | Out-Null
    $logDirectory = [IO.Path]::GetFullPath((Join-Path $script:Root '.local/fundtogether/runtime'))
    foreach ($log in Get-ChildItem -LiteralPath $logDirectory -Filter "$script:ComposeProject-*.log" -File -ErrorAction SilentlyContinue) {
      if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($log.FullName)) -eq $logDirectory) { Remove-Item -LiteralPath $log.FullName -Force }
    }
  }
  if ($RemoveDisposableResources -and $script:RuntimeState.freshTest) { Write-Info 'Removed the isolated disposable test stack.' }
  else { Write-Info 'Stopped only launcher-recorded processes and containers. Persistent Docker volumes were retained.' }
}

function Invoke-FreshAcceptance {
  $runId = [Guid]::NewGuid().ToString('N')
  $testRoot = Join-Path $script:Root ".local/fundtogether/runtime/demo-test-fresh-$runId"
  $results = [ordered]@{ runId = $runId; status = 'PASS'; phases = @() }
  $retainRuntime = $false
  $restoreDefault = $false
  New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
  try {
    $defaultEnvironment = Join-Path $script:Root '.local/fundtogether/vnext-demo.env'
    $defaultManifest = Join-Path $script:Root '.local/fundtogether/generated/vnext-deployment.local.json'
    $defaultState = Join-Path $script:Root '.local/fundtogether/runtime/vnext-demo/launcher-state.json'
    if ((Test-Path -LiteralPath $defaultEnvironment) -and (Test-Path -LiteralPath $defaultManifest) -and (Test-Path -LiteralPath $defaultState)) {
      $restoreDefault = $true
      Set-RuntimeConfig $defaultEnvironment $defaultManifest $defaultState 'fundtogether-vnext-demo' $false
      Invoke-Down
    }
    $stopPhases = $false
    foreach ($phase in @('direct', 'browser')) {
      $phaseRoot = Join-Path $testRoot $phase
      New-Item -ItemType Directory -Force -Path $phaseRoot | Out-Null
      $EnvironmentFile = Join-Path $phaseRoot 'demo.env'
      $ManifestPath = Join-Path $phaseRoot 'vnext-deployment.local.json'
      $StateFile = Join-Path $phaseRoot 'launcher-state.json'
      $ComposeProject = "fundtogether-vnext-test-$runId-$phase"
      $FreshTestRuntime = $true
      $phaseCleanupFailed = $false
      Set-RuntimeConfig $EnvironmentFile $ManifestPath $StateFile $ComposeProject $true
      $ports = @((Get-FreePort), (Get-FreePort), (Get-FreePort), 9548, (Get-FreePort), (Get-FreePort))
      $initializer = Join-Path $script:Root 'backend/scripts/campaigns/initialize-vnext-demo.cjs'
      Invoke-Checked 'node' (@($initializer, $EnvironmentFile) + $ports)
      Protect-EnvironmentFile $EnvironmentFile
      try {
        Invoke-Up
        $envValues = Read-DemoEnvironment
        $previous = Get-NodeEnvironment $envValues
        try {
          [Environment]::SetEnvironmentVariable('FUNDTOGETHER_VNEXT_ENV_PATH', $EnvironmentFile, 'Process')
          [Environment]::SetEnvironmentVariable('FUNDTOGETHER_VNEXT_MANIFEST_PATH', $ManifestPath, 'Process')
          [Environment]::SetEnvironmentVariable('FUNDTOGETHER_RPC_URL', $envValues.FUNDTOGETHER_RPC_URL, 'Process')
          $runner = if ($phase -eq 'direct') { 'vnext-scenarios-e2e.cjs' } else { 'vnext-browser-e2e.cjs' }
          $scriptPath = Join-Path $script:Root "backend/scripts/campaigns/$runner"
          $startedAt = Get-Date
          Push-Location (Join-Path $script:Root 'backend')
          try { & node $scriptPath; $exitCode = $LASTEXITCODE } finally { Pop-Location }
          $phaseResult = [ordered]@{ phase = $phase; status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }; durationSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2); exitCode = $exitCode }
          $results.phases += $phaseResult
          if ($exitCode -ne 0) { $results.status = 'FAIL'; break }
        } finally { Restore-NodeEnvironment $previous }
      } finally {
        try { Invoke-Down -RemoveDisposableResources } catch { Write-Warning $_.Exception.Message; $results.status = 'FAIL'; $retainRuntime = $true; $phaseCleanupFailed = $true }
      }
      if ($phaseCleanupFailed) { $stopPhases = $true; break }
    }
  } catch {
    $results.status = 'FAIL'
    $results.error = $_.Exception.Message
  } finally {
    if ($restoreDefault -and -not $retainRuntime) {
      try {
        $defaultEnvironment = Join-Path $script:Root '.local/fundtogether/vnext-demo.env'
        $defaultManifest = Join-Path $script:Root '.local/fundtogether/generated/vnext-deployment.local.json'
        $defaultState = Join-Path $script:Root '.local/fundtogether/runtime/vnext-demo/launcher-state.json'
        Set-RuntimeConfig $defaultEnvironment $defaultManifest $defaultState 'fundtogether-vnext-demo' $false
        Invoke-Up
        $results.defaultRuntimeRestored = $true
      } catch {
        $results.status = 'FAIL'
        $results.defaultRuntimeRestored = $false
        $results.restoreError = $_.Exception.Message
      }
    }
    $output = Join-Path $script:Root '.local/fundtogether/runtime/vnext-demo-test-fresh.json'
    $results | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $output -Encoding utf8
    $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
    $expectedPrefix = [IO.Path]::GetFullPath((Join-Path $script:Root '.local/fundtogether/runtime')) + [IO.Path]::DirectorySeparatorChar
    if (-not $retainRuntime -and $resolvedTestRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTestRoot)) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
    if ($retainRuntime) { $results.cleanup = 'FAILED; disposable runtime state retained for manual recovery' }
    Write-Output ($results | ConvertTo-Json -Depth 10)
    Write-Info "Fresh acceptance report: $output"
  }
  if ($results.status -ne 'PASS') { throw 'One or more fresh VNext acceptance phases failed or were blocked.' }
}

try {
  if (-not $FreshTestRuntime) { Set-RuntimeConfig $script:EnvironmentFile $script:ManifestPath $script:StateFile $script:ComposeProject $false }
  switch ($Command) {
    'doctor' { Invoke-Doctor }
    'up' { Invoke-Up }
    'status' { Invoke-Status }
    'smoke' { Invoke-Status }
    'down' { if ($script:Disposable) { Invoke-Down -RemoveDisposableResources } else { Invoke-Down } }
    'demo:test-fresh' { Invoke-FreshAcceptance }
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
