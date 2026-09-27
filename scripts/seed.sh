#!/usr/bin/env bash
# Seed the local CMS v1.5 dev server with test data. Run from the repo root
# after cloning cms-server (see docs/dev-server.md). Safe to run once;
# it refuses to run twice on the same database.
set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash on Windows: keep /seed as a container path and give Docker a Windows path.
export MSYS_NO_PATHCONV=1
SEED_DIR="$(pwd -W 2>/dev/null || pwd)/scripts/seed"

docker compose -p cms -f cms-server/docker-compose.dev.yml run --build --rm \
  -v "$SEED_DIR:/seed:ro" \
  devcms wait-for-it devdb:5432 -- bash /seed/inside.sh
