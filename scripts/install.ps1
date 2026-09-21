. "$PSScriptRoot/env.ps1"
$env:HTTP_PROXY = 'http://127.0.0.1:7897'
$env:HTTPS_PROXY = $env:HTTP_PROXY
$env:ELECTRON_GET_USE_PROXY = '1'
$env:GLOBAL_AGENT_HTTP_PROXY = $env:HTTP_PROXY
$env:GLOBAL_AGENT_HTTPS_PROXY = $env:HTTP_PROXY
npm.cmd install --proxy=$env:HTTP_PROXY --https-proxy=$env:HTTPS_PROXY --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
node node_modules/electron/install.js
if ($LASTEXITCODE -ne 0) { throw 'Electron runtime download failed.' }
