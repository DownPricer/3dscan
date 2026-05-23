#!/bin/bash
# Mise à jour SiteReady Scan — /opt/3dscan/deploy.sh
set -euo pipefail

ROOT="/opt/3dscan"
APP="${ROOT}/app"

if [ ! -d "${APP}/.git" ]; then
  echo "Erreur : ${APP} introuvable. Clonez https://github.com/DownPricer/3dscan.git"
  exit 1
fi

echo "==> git pull"
cd "${APP}"
git pull origin main

echo "==> docker compose build & up"
cd "${ROOT}"
docker compose up -d --build

echo "==> connexion nginx au réseau 3dscan"
docker network connect 3dscan_default downpricer-nginx 2>/dev/null || true

echo "==> reload nginx"
docker exec downpricer-nginx nginx -t
docker exec downpricer-nginx nginx -s reload

echo "==> santé locale"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3015/ || true

echo "Terminé."
