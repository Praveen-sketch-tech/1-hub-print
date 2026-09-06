#!/usr/bin/env bash

echo "=== Installing express-rate-limit ==="
npm install express-rate-limit --workspace=api/server

echo ""
echo "=== Generating CRON_SECRET (if missing) ==="
if ! grep -q "^CRON_SECRET=" .env 2>/dev/null; then
  CRON_SECRET_NEW=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
  cat >> .env << ENVEOF

# Cron endpoint protection
CRON_SECRET=$CRON_SECRET_NEW
ENVEOF
  echo "Generated and added CRON_SECRET to .env"
  echo "$CRON_SECRET_NEW" | vercel env add CRON_SECRET production 2>/dev/null || echo "(CRON_SECRET may already exist on Vercel — check with: vercel env ls)"
else
  echo ".env already has CRON_SECRET, skipping generation"
fi

if ! grep -q "^CRON_SECRET=" .env.example 2>/dev/null; then
  cat >> .env.example << 'ENVEOF'

# Cron endpoint protection
CRON_SECRET=replace_with_random_string
ENVEOF
fi

echo ""
echo "=== Running migration on LOCAL database ==="
npm run migrate

echo ""
echo "=== Running migration on PRODUCTION (Neon) database ==="
if [ -f .env.vercel.local ]; then
  NEON_URL=$(grep '^DATABASE_URL=' .env.vercel.local | head -1 | cut -d'=' -f2- | tr -d '"')
  if [ -n "$NEON_URL" ]; then
    DATABASE_URL="$NEON_URL" node scripts/migrate.js
  else
    echo "WARNING: Could not extract DATABASE_URL from .env.vercel.local"
  fi
else
  echo "WARNING: .env.vercel.local not found — run production migration manually if needed"
fi

echo ""
echo "=== Committing and pushing ==="
git add -A
git commit -m "feat: phase 6 - stale job recovery, file cleanup cron, rate limiting" || echo "(Nothing new to commit)"
git push

echo ""
echo "================================================"
echo " DONE — Phase 6 applied"
echo "================================================"
echo "Your CRON_SECRET (save this, needed for the next step):"
grep "^CRON_SECRET=" .env
echo ""
echo "IMPORTANT: Set up an external cron service (see guide) to call these"
echo "every few minutes — Vercel's free-tier cron only runs once a day,"
echo "which is too infrequent for stale-job recovery:"
echo "  GET https://1-hub-print.vercel.app/api/system/cron/recover-stale-jobs"
echo "  GET https://1-hub-print.vercel.app/api/system/cron/cleanup-expired-files"
echo "  Header: Authorization: Bearer <your CRON_SECRET>"
