#!/usr/bin/env bash
# Runs INSIDE the devcms container (called by scripts/seed.sh).
# Creates the DB if needed, an admin, the test contest with 2 tasks,
# 50 users in 5 teams, and ~300 submissions.
set -euo pipefail

PSQL="psql -h devdb -U postgres -d cmsdb -tA"

if ! psql -h devdb -U postgres -lqt | cut -d'|' -f1 | grep -qw cmsdb; then
  echo "==> Creating database"
  createdb -h devdb -U postgres cmsdb
  cmsInitDB
fi

if [ -n "$($PSQL -c "SELECT id FROM contests WHERE name = 'test'")" ]; then
  echo "Contest 'test' already exists. To start over, see 'Reset' in docs/dev-server.md."
  exit 1
fi

echo "==> Admin 'admin' (password 'admin', full access)"
cmsAddAdmin admin -p admin || echo "   (admin already exists)"

# Contest runs from 2 hours ago to 3 hours from now, so it is live while you develop.
START=$(( $(date +%s) - 2*3600 ))
STOP=$(( START + 5*3600 ))
WORK=$(mktemp -d)
cp -r /seed/contest/. "$WORK"
cat > "$WORK/contest.yaml" <<YAML
name: test
description: Test Contest
timezone: Asia/Bangkok
start: $START
stop: $STOP
token_mode: disabled
allow_questions: true
languages: ["C++17 / g++", "Python 3 / CPython"]
tasks: [sum, max]
users: []
YAML

echo "==> Importing contest and tasks"
cmsImportContest -L italy_yaml -i -S -y "$WORK"
CONTEST_ID=$($PSQL -c "SELECT id FROM contests WHERE name = 'test'")

echo "==> Users, teams, participations, submissions (contest id $CONTEST_ID)"
python3 /seed/seed_data.py "$CONTEST_ID" /seed/solutions "$START"

echo
echo "Done. Contest id: $CONTEST_ID"
echo "Start the servers with scripts/dev-server.sh, then log in at http://localhost:8889"
echo "  admin / admin    (full access)"
echo "  viewer / viewer  (read-only)"
