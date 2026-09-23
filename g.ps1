$env:API_URL="https://fastblip-e2ba34b072c4.herokuapp.com"
# g.ps1 - open web/index.html in Google Chrome
# Rebuild first so the page (and its Built timestamp) matches the current source.
node (Join-Path $PSScriptRoot 'web\build.mjs') --standalone
if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed'; exit 1 }

$page = Join-Path $PSScriptRoot 'web\index.html'
if (-not (Test-Path $page)) { Write-Error "Not found: $page"; exit 1 }
$url = ([System.Uri](Resolve-Path $page).Path).AbsoluteUri

$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $chrome) { $chrome = 'chrome' }  # fall back to App Paths registration
Start-Process -FilePath $chrome -ArgumentList $url
