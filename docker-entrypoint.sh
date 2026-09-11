#!/bin/sh
set -e

echo "Sincronizando el esquema con la base de datos..."
npx prisma db push --skip-generate --accept-data-loss

echo "Sembrando datos base..."
npx tsx prisma/seed.ts

echo "Iniciando el servidor..."
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
