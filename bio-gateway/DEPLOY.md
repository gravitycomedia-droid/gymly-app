# Biometric deploy runbook (Part 5)

Project `gymly-app-06`. Firestore is in asia-south1. Functions run in us-central1 on Node 22. The gateway VM runs in asia-south1-a.

Run the steps **in order**. Every command is copy-paste ready. Lines starting with `#` are notes.

---

## 0. Accounts (once)

```bash
gcloud auth login                         # YOUR Google account (owner of gymly-app-06)
gcloud auth application-default login     # same account; used by tools/prod-smoke.js
gcloud config set project gymly-app-06
firebase login:list                       # must show the gymly-app-06 owner account
```

## 1. Firestore indexes, then rules (from the repo, on `feature/biometric-zkteco`)

```bash
cd "/Users/vishnuashrith/Desktop/All Proj/GYMLY APP"
firebase deploy --only firestore:indexes --project gymly-app-06
# If it lists indexes/overrides "not in your file" and asks to delete them → answer N.
# Wait until the 3 bio_ indexes show READY: Console → Firestore → Indexes.
firebase deploy --only firestore:rules --project gymly-app-06
```

## 2. Cloud Functions, from a clean worktree

Deploy from a clean worktree so uncommitted local changes (`functions/index.js`, `functions/src/adminControl.js`) do not ship. Copy `.env` in, because a clean checkout does not have it. Without it, the deploy would strip the GA, Razorpay and Zoho variables.

```bash
cd "/Users/vishnuashrith/Desktop/All Proj/GYMLY APP"
git worktree add --detach ../gymly-bio-deploy feature/biometric-zkteco
cp functions/.env ../gymly-bio-deploy/functions/.env
cd ../gymly-bio-deploy/functions && npm ci && cd ..
firebase deploy --project gymly-app-06 --only \
functions:setAttendanceMode,functions:extendMembership,functions:processScan,\
functions:permanentlyDeleteMember,functions:permanentlyDeleteExpired,\
functions:claimBioDevice,functions:syncBioDevice,functions:setBioDeviceStatus,\
functions:requestBioEnroll,functions:queueBioRawCommand,functions:bioOnMemberWrite,\
functions:createSubscription,functions:adminSeedDefaultPlans,\
functions:recomputePlatformStats,functions:backfillPlatformStats
cd "/Users/vishnuashrith/Desktop/All Proj/GYMLY APP" && git worktree remove --force ../gymly-bio-deploy
```

After the deploy, Super Admin → Plans → **Seed default plans** creates the `PREMIUM_PLUS` plan doc.

## 3. GCP: APIs, service account, network

```bash
gcloud services enable compute.googleapis.com monitoring.googleapis.com iap.googleapis.com --project gymly-app-06

# Service account with Firestore access ONLY (no key files are ever created)
gcloud iam service-accounts create bio-gateway --display-name="Gymly bio-gateway VM" --project gymly-app-06
gcloud projects add-iam-policy-binding gymly-app-06 \
  --member=serviceAccount:bio-gateway@gymly-app-06.iam.gserviceaccount.com \
  --role=roles/datastore.user --condition=None

# Static IP
gcloud compute addresses create bio-gateway-ip --region=asia-south1 --project gymly-app-06
gcloud compute addresses describe bio-gateway-ip --region=asia-south1 --project gymly-app-06 --format='value(address)'

# Firewall: device ports open; SSH only through IAP
gcloud compute firewall-rules create bio-gateway-web --network=default --direction=INGRESS \
  --allow=tcp:80,tcp:443,tcp:8081 --target-tags=bio-gateway --source-ranges=0.0.0.0/0 --project gymly-app-06
gcloud compute firewall-rules create bio-gateway-iap-ssh --network=default --direction=INGRESS \
  --allow=tcp:22 --target-tags=bio-gateway --source-ranges=35.235.240.0/20 --project gymly-app-06
# The default network opens SSH/RDP to the whole internet. Nothing else in this
# project uses Compute Engine, so remove those two rules:
gcloud compute firewall-rules delete default-allow-ssh default-allow-rdp --project gymly-app-06 --quiet
```

## 4. The VM

```bash
gcloud compute instances create bio-gateway --project gymly-app-06 \
  --zone=asia-south1-a --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-balanced \
  --address=bio-gateway-ip --tags=bio-gateway \
  --service-account=bio-gateway@gymly-app-06.iam.gserviceaccount.com --scopes=cloud-platform \
  --metadata=enable-oslogin=TRUE \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring

# Weekly snapshot, kept 4 weeks
gcloud compute resource-policies create snapshot-schedule bio-gateway-weekly --project gymly-app-06 \
  --region=asia-south1 --weekly-schedule=sunday --start-time=20:30 \
  --max-retention-days=28 --on-source-disk-delete=keep-auto-snapshots
gcloud compute disks add-resource-policies bio-gateway --zone=asia-south1-a \
  --resource-policies=bio-gateway-weekly --project gymly-app-06
```

## 5. DNS (Vercel DNS; an explicit A record overrides the wildcard)

```bash
vercel dns add gymly.online bio A <STATIC_IP_FROM_STEP_3>
dig +short bio.gymly.online            # must print the static IP (wait a minute if not)
```

## 6. Install and start the gateway

Run this from the repo root. The same steps deploy every later version.

```bash
cd "/Users/vishnuashrith/Desktop/All Proj/GYMLY APP"
git archive --format=tar.gz -o /tmp/bio-gateway.tgz feature/biometric-zkteco bio-gateway
gcloud compute scp /tmp/bio-gateway.tgz bio-gateway:/tmp/bio-gateway.tgz \
  --zone=asia-south1-a --tunnel-through-iap --project gymly-app-06
gcloud compute ssh bio-gateway --zone=asia-south1-a --tunnel-through-iap --project gymly-app-06 --command \
  'sudo mkdir -p /opt/bio-gateway && sudo tar -xzf /tmp/bio-gateway.tgz -C /opt/bio-gateway --strip-components=1 && sudo bash /opt/bio-gateway/deploy/setup-vm.sh'
```

## 7. Uptime check and alert

```bash
gcloud monitoring uptime create bio-gateway-health --project gymly-app-06 \
  --resource-type=uptime-url --resource-labels=host=bio.gymly.online,project_id=gymly-app-06 \
  --protocol=https --port=443 --path=/health --period=5 --timeout=10 \
  --matcher-content='"ok":true' --matcher-type=contains-string
```

Then create the email alert in the Console: **Monitoring → Uptime checks → bio-gateway-health → Create alert**, and add an email notification channel.

## 8. Prove it works

```bash
curl -si 'http://bio.gymly.online/iclock/cdata?SN=TEST123456&options=all' | head -5        # 200, text/plain, no 30x
curl -si 'http://bio.gymly.online:8081/iclock/cdata?SN=TEST123456&options=all' | head -5   # same on 8081
curl -si 'https://bio.gymly.online/iclock/cdata?SN=TEST123456&options=all' | head -5       # same on https
curl -s  https://bio.gymly.online/health                                                    # {"ok":true}

# Simulator round trip against prod, using a TEST device under a TEST gym
cd bio-gateway && npm ci
node tools/prod-smoke.js claim --gym <TEST_GYM_ID> --sn GYMLYTEST01 --yes
node tools/simulate-device.js --url http://bio.gymly.online --sn GYMLYTEST01 --polls 3 --interval 3000 --no-replay
node tools/prod-smoke.js verify --sn GYMLYTEST01          # → ROUND TRIP OK ✓
node tools/prod-smoke.js disable --sn GYMLYTEST01 --yes
```

## Operations

- **Logs:**
  ```bash
  gcloud compute ssh bio-gateway --zone=asia-south1-a --tunnel-through-iap --command 'sudo journalctl -u bio-gateway -n 200 --no-pager'
  ```
- **Restart:**
  ```bash
  … --command 'sudo systemctl restart bio-gateway'
  ```
- **Roll back:** redeploy the previous commit with step 6, using `git archive <sha> bio-gateway`.
- **Cost:** about ₹1,100/month (≈ $13: e2-small + static IP + 20 GB disk + snapshots).
