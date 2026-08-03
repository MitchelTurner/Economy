#!/bin/sh
set -e

# Presence-only checklist (never print secret values) — helps catch wrong Railway service.
presence() {
  if [ -n "$(printenv "$1" 2>/dev/null)" ]; then
    printf '%s=yes' "$1"
  else
    printf '%s=NO' "$1"
  fi
}

echo "[boot] env presence: $(presence DATABASE_URL) $(presence REDIS_URL) $(presence JWT_SECRET) $(presence JWT_REFRESH_SECRET) $(presence CORS_ORIGIN) $(presence PORT) $(presence ALLOW_MOCK_EXTRACTION)"

if [ -z "${JWT_SECRET:-}" ] || [ -z "${JWT_REFRESH_SECRET:-}" ]; then
  echo "[boot] FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be set on this Railway service (Variables → Raw Editor)." >&2
  echo "[boot] They are missing from the process environment — check you edited the API service, not Web/Postgres." >&2
  exit 1
fi

npx prisma migrate deploy

case "${SEED_ON_BOOT:-off}" in
  reference)
    echo "SEED_ON_BOOT=reference — running db:seed:reference"
    SEED_DEMO=0 npx tsx prisma/seed.ts
    ;;
  demo)
    echo "SEED_ON_BOOT=demo — running full demo seed"
    SEED_DEMO=1 npx tsx prisma/seed.ts
    ;;
  off|"")
    ;;
  *)
    echo "Unknown SEED_ON_BOOT=${SEED_ON_BOOT} (use reference|demo|off)" >&2
    exit 1
    ;;
esac

exec node dist/main.js
