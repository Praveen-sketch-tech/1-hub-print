#!/usr/bin/env bash

echo "=== Running migration on LOCAL database (checking for anything pending) ==="
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
git commit -m "feat: phase 5 - windows print agent backend (pairing, heartbeat, atomic job claim, printers)" || echo "(Nothing new to commit)"
git push

echo ""
echo "================================================"
echo " DONE — Phase 5 backend applied"
echo "================================================"
echo "No new npm packages needed for this phase (crypto is built into Node)."
echo ""
echo "Local test:"
echo "  1. npm run dev --workspace=api/server"
echo "  2. Follow the curl test steps in the guide"
echo ""
echo "Production:"
echo "  https://1-hub-print.vercel.app  (wait ~60s for Vercel redeploy)"
