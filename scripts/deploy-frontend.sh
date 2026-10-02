#!/usr/bin/env bash
# Production frontend deploy for gymly.online.
#
# Vercel's git auto-deploy doesn't fire for this project, and deploys from a
# worktree / detached HEAD get "Blocked" (commit author can't be resolved).
# What works: a fresh clone of `main` from GitHub, with .env and the Vercel
# project link copied in, then a prebuilt production deploy.
#
#   bash scripts/deploy-frontend.sh        # deploys whatever is on origin/main
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${TMPDIR:-/tmp}/gymly-frontend-deploy"
REMOTE="$(git -C "$REPO" remote get-url origin)"

[ -f "$REPO/.env" ] || { echo ".env missing in $REPO — aborting"; exit 1; }
[ -f "$REPO/.vercel/project.json" ] || { echo ".vercel/project.json missing — run 'vercel link' in $REPO first"; exit 1; }

rm -rf "$DIR"
git clone --quiet --branch main "$REMOTE" "$DIR"
cp "$REPO/.env" "$DIR/.env"
mkdir -p "$DIR/.vercel" && cp "$REPO/.vercel/project.json" "$DIR/.vercel/project.json"

cd "$DIR"
echo "Deploying origin/main @ $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
npm ci --no-audit --no-fund
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod --yes
