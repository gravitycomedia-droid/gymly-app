#!/usr/bin/env bash
# Deploy the biometric-related Cloud Functions from a CLEAN worktree of
# feature/biometric-zkteco, so uncommitted local changes never ship.
# functions/.env (gitignored) is copied in; without it the deploy would strip
# the GA / Razorpay / Zoho variables from the deployed functions.
#
#   bash bio-gateway/deploy/deploy-functions.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WT="$REPO/../gymly-bio-deploy"
BRANCH="feature/biometric-zkteco"
FUNCS="setAttendanceMode,extendMembership,processScan,permanentlyDeleteMember,permanentlyDeleteExpired,claimBioDevice,syncBioDevice,setBioDeviceStatus,requestBioEnroll,queueBioRawCommand,bioOnMemberWrite,createSubscription,adminSeedDefaultPlans,recomputePlatformStats,backfillPlatformStats"

cd "$REPO"
[ -f functions/.env ] || { echo "functions/.env missing — aborting"; exit 1; }

git worktree prune
rm -rf "$WT"
git worktree add --detach "$WT" "$BRANCH"
trap 'cd "$REPO" && git worktree remove --force "$WT" 2>/dev/null || true' EXIT

cp functions/.env "$WT/functions/.env"
(cd "$WT/functions" && npm ci --no-audit --no-fund)

ONLY=$(echo "$FUNCS" | sed 's/[^,]*/functions:&/g')
echo "Deploying from $(git -C "$WT" rev-parse --short HEAD): $ONLY"
(cd "$WT" && firebase deploy --project gymly-app-06 --only "$ONLY")

# Callables need allUsers → roles/cloudfunctions.invoker (auth is checked
# inside each function). Firebase only sets it when it CREATES a function, so a
# function first created by a failed deploy never gets it and every browser call
# fails with "internal". Report any callable that is missing it.
echo "Checking invoker permission on callables…"
for f in setAttendanceMode extendMembership processScan permanentlyDeleteMember claimBioDevice syncBioDevice setBioDeviceStatus requestBioEnroll queueBioRawCommand adminSeedDefaultPlans; do
  if ! gcloud functions get-iam-policy "$f" --region=us-central1 --project gymly-app-06 --format=json 2>/dev/null | grep -q allUsers; then
    echo "  MISSING on $f — fix: gcloud functions add-iam-policy-binding $f --region=us-central1 --project gymly-app-06 --member=allUsers --role=roles/cloudfunctions.invoker"
  fi
done
echo "Invoker check done."
