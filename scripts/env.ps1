$ErrorActionPreference = 'Stop'
$FlyPetRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $FlyPetRoot
foreach ($name in @('.cache/npm','.cache/electron','.cache/tmp','.cache/pip','.cache/uv','.runtime','output')) {
    New-Item -ItemType Directory -Path (Join-Path $FlyPetRoot $name) -Force | Out-Null
}
$env:npm_config_cache = Join-Path $FlyPetRoot '.cache/npm'
$env:ELECTRON_CACHE = Join-Path $FlyPetRoot '.cache/electron'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:TEMP = Join-Path $FlyPetRoot '.cache/tmp'
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path $FlyPetRoot '.cache/pip'
$env:UV_CACHE_DIR = Join-Path $FlyPetRoot '.cache/uv'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $FlyPetRoot '.cache/browsers'
$env:ELECTRON_RUN_AS_NODE = $null
