#!/bin/sh
set -e

# Presence-only checklist (never print secret values) — helps catch wrong Railway service.
presence() {
  # Distinguish unset vs set-but-empty
  if ! printenv "$1" >/dev/null 2>&1; then
    printf '%s=MISSING' "$1"
  elif [ -z "$(printenv "$1")" ]; then
    printf '%s=EMPTY' "$1"
  else
    printf '%s=yes' "$1"
  fi
}

echo "[boot] env presence: $(presence DATABASE_URL) $(presence REDIS_URL) $(presence JWT_SECRET) $(presence JWT_REFRESH_SECRET) $(presence CORS_ORIGIN) $(presence PORT) $(presence ANTHROPIC_API_KEY) $(presence ALLOW_MOCK_EXTRACTION)"

# Non-secret extraction knobs (values are safe to print)
echo "[boot] extraction: EXTRACTION_PROVIDER=${EXTRACTION_PROVIDER:-"(unset)"} ALLOW_MOCK_EXTRACTION=${ALLOW_MOCK_EXTRACTION:-"(unset)"} EXTRACTION_MODEL=${EXTRACTION_MODEL:-"(unset)"}"

# Names only — catch typos like JWT_SECRETS / ANTHROPIC_KEY
echo "[boot] env keys matching JWT|SECRET|ANTHROPIC|EXTRACTION|ALLOW_MOCK:"
printenv | cut -d= -f1 | grep -E 'JWT|SECRET|ANTHROPIC|EXTRACTION|ALLOW_MOCK' | sort | tr '\n' ' ' || true
echo

if [ -z "${JWT_SECRET:-}" ] || [ -z "${JWT_REFRESH_SECRET:-}" ]; then
  echo "[boot] FATAL: JWT_SECRET and JWT_REFRESH_SECRET are not in this container." >&2
  echo "[boot] Railway: open THIS service (logs show @island-ledger/api) → Variables." >&2
  echo "[boot] If variables have a purple/staged background, click Deploy / Apply — staged vars are not live yet." >&2
  echo "[boot] Add via + New Variable (not only Shared), exact names JWT_SECRET and JWT_REFRESH_SECRET, then Deploy." >&2
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
