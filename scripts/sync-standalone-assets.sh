#!/bin/sh
# Run this after every `npm run build`, before starting the standalone
# server outside Docker (the systemd unit's ExecStartPre already does this
# automatically). Next's `output: "standalone"` does NOT include public/ or
# .next/static in its output — this copies them in. Idempotent: safe to
# run repeatedly.
set -e
cd "$(dirname "$0")/.."

rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
