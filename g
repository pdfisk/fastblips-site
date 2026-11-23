#!/usr/bin/env bash
# Linux equivalent of g.ps1: rebuild (what ./c does), then run cp1 and cp2.
# ./c is PowerShell, so its build step is done here directly.
set -euo pipefail
cd "$(dirname "$0")"
if ! node web/build.mjs --standalone; then
  echo 'Build failed' >&2
  exit 1
fi
echo 'Rebuild successfully completed'
