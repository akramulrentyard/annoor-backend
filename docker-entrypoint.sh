#!/bin/sh
set -e

# ═══════════════════════════════════════════
# 1. Prisma Migrations
# ═══════════════════════════════════════════
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations complete."

# ═══════════════════════════════════════════
# 2. Start Application
# ═══════════════════════════════════════════
echo ""
echo "Starting application..."
exec "$@"