#!/usr/bin/env bash
# Run ON THE VM as root, after the code is unpacked into /opt/bio-gateway.
# Idempotent: re-run it to deploy a new version.
set -euo pipefail

if ! command -v node >/dev/null || ! node --version | grep -q '^v24\.'; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

apt-get install -y unattended-upgrades >/dev/null

id biogw >/dev/null 2>&1 || useradd --system --home /opt/bio-gateway --shell /usr/sbin/nologin biogw

cd /opt/bio-gateway
npm ci --omit=dev --no-audit --no-fund
chown -R biogw:biogw /opt/bio-gateway

install -m 644 deploy/bio-gateway.service /etc/systemd/system/bio-gateway.service
install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable bio-gateway caddy
systemctl restart bio-gateway
systemctl reload-or-restart caddy

sleep 3
systemctl --no-pager --lines=5 status bio-gateway
curl -fsS http://127.0.0.1:8080/health && echo
curl -sS -i 'http://127.0.0.1/iclock/cdata?SN=TEST123456&options=all' | head -5
