#!/bin/sh
set -e
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
