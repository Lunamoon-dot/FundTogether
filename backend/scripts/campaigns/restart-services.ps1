param([switch]$Build)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$stopScript = Join-Path $PSScriptRoot 'stop-services.ps1'
$startScript = Join-Path $PSScriptRoot 'start-services.ps1'

& $stopScript
if ($LASTEXITCODE -ne 0) { throw 'FundTogether service shutdown failed.' }

$startArguments = @()
if (-not $Build) { $startArguments += '-SkipBuild' }
& $startScript @startArguments
if ($LASTEXITCODE -ne 0) { throw 'FundTogether service restart failed.' }
