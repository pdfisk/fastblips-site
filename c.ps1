# g.ps1 - open web/index.html in Google Chrome
# Rebuild first so the page (and its Built timestamp) matches the current source.
node (Join-Path $PSScriptRoot 'web\build.mjs') --standalone
if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed'; exit 1 }
echo 'Rebuild successfully completed'
