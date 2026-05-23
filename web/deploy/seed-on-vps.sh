#!/bin/bash
# Premier admin + schéma DB — à lancer une fois : bash /opt/3dscan/app/web/deploy/seed-on-vps.sh
set -euo pipefail

ROOT="/opt/3dscan"
cd "${ROOT}"
set -a
source .env
set +a

export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public"

docker compose run --rm \
  --network 3dscan_default \
  -e DATABASE_URL \
  -e AUTH_SECRET \
  -e ADMIN_EMAIL \
  -e ADMIN_PASSWORD \
  -v "${ROOT}/app:/src" \
  -w /src \
  node:20-alpine \
  sh -c "npm ci && npx prisma db push && npm run db:seed"

echo "Seed terminé."
