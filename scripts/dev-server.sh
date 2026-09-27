#!/usr/bin/env bash
# Start CMS v1.5 (AWS :8889, CWS :8888) with the evaluation services.
# With "shell" as the first argument, opens a bash prompt in the container instead.
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

COMPOSE="docker compose -p cms -f cms-server/docker-compose.dev.yml"

if [ "${1:-}" = "shell" ]; then
  exec $COMPOSE run --build --rm --service-ports devcms
fi

exec $COMPOSE run --build --rm --service-ports devcms \
  wait-for-it devdb:5432 -- bash -c 'cmsLogService & sleep 2; exec cmsResourceService -a ALL'
