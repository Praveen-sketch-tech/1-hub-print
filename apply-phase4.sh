#!/usr/bin/env bash

echo "=== Phase 4: Installing qrcode dependency ==="
npm install qrcode --workspace=api/server

echo ""
echo "=== Adding BASE_URL to .env (if missing) ==="
if ! grep -q "^BASE_URL=" .env 2>/dev/null; then
  cat >> .env << 'ENVEOF'

# Base URL (used for QR code generation)
BASE_URL=http://localhost:3000
ENVEOF
  echo "Added BASE_URL to .env"
else
  echo ".env already has BASE_URL, skipping"
fi

if ! grep -q "^BASE_URL=" .env.example 2>/dev/null; then
  cat >> .env.example << 'ENVEOF'

# Base URL (used for QR code generation)
BASE_URL=http://localhost:3000
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
    echo "Run manually: DATABASE_URL=\"your_neon_url\" node scripts/migrate.js"
  fi
else
  echo "WARNING: .env.vercel.local not found — run production migration manually"
fi

echo ""
echo "=== Setting BASE_URL on Vercel (production) ==="
echo "https://1-hub-print.vercel.app" | vercel env add BASE_URL production 2>/dev/null || echo "(BASE_URL may already exist on Vercel — check with: vercel env ls)"

echo ""
echo "=== Committing and pushing ==="
git add -A
git commit -m "feat: phase 4 - shop dashboard with login, stats, jobs, QR code" || echo "(Nothing new to commit, or already committed)"
git push

echo ""
echo "================================================"
echo " DONE — Phase 4 applied"
echo "================================================"
echo "Local test:"
echo "  1. npm run dev --workspace=api/server"
echo "  2. http://localhost:3000/dashboard/login.html"
echo ""
echo "Production (wait ~60s for Vercel redeploy):"
echo "  https://1-hub-print.vercel.app/dashboard/login.html"
