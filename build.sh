#!/usr/bin/env bash
# Builds and signs the .wgt package, and optionally installs it on a TV.
#   ./build.sh <certificate-profile> [sdb-device-name]
# Requires the Tizen Studio CLI (tizen, sdb) on PATH. See README.md.
set -euo pipefail
cd "$(dirname "$0")"

PROFILE="${1:?usage: ./build.sh <certificate-profile> [device]}"
DEVICE="${2:-}"

rm -rf .buildResult dist
tizen build-web -e ".git/*" -e "dev/*" -e "dist/*" -e "README.md" -e "build.sh" -e ".gitignore" -out .buildResult -- .
tizen package -t wgt -s "$PROFILE" -- .buildResult
mkdir -p dist
mv .buildResult/*.wgt dist/NrkTvPrivat.wgt
rm -rf .buildResult
echo "Built dist/NrkTvPrivat.wgt"

if [ -n "$DEVICE" ]; then
  tizen install -n NrkTvPrivat.wgt -t "$DEVICE" -- dist
  tizen run -p NrkTvPriv1.NrkTv -t "$DEVICE"
fi
