#!/bin/sh
set -e

if [ -f ./prisma/schema.prisma ] && [ -n "${DATABASE_URL}" ]; then
  echo "[entrypoint] prisma db push (${DATABASE_URL%%@*}@...)..."
  npx prisma db push --skip-generate || {
    echo "[entrypoint] prisma db push a échoué — vérifier DATABASE_URL et la DB"
    exit 1
  }
fi

exec node server.js
