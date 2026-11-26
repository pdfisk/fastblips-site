#!/usr/bin/env bash
# Linux equivalent of g.ps1: rebuild (what ./c does), then run cp1 and cp2.
#   build -> web/
#   cp1   -> web/ copied into deploy/
#   cp2   -> web/ published to /var/www/fastblips (Apache; needs sudo)
set -euo pipefail
cd "$(dirname "$0")"
if ! node web/build.mjs --standalone; then
  echo 'Build failed' >&2
  exit 1
fi
echo 'Rebuild successfully completed'

bash ./cp1
echo 'Copied web/ to deploy/'

bash ./cp2
echo 'Published web/ to /var/www/fastblips'
