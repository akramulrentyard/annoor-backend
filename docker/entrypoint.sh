#!/bin/sh
set -e

echo "═══════════════════════════════════════════════════════"
echo "Starting Annoor Backend"
echo "═══════════════════════════════════════════════════════"
echo ""

# ============================================
# 1. Check DATABASE_URL
# ============================================
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set!"
  exit 1
fi

echo "DATABASE_URL is set"
echo ""

# ============================================
# 2. Wait for PostgreSQL (if using depends_on)
# ============================================
echo "⏳ Waiting for PostgreSQL..."

MAX_RETRIES=30
RETRY_COUNT=0

until npx prisma db execute --stdin <<< "SELECT 1" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "PostgreSQL not reachable after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "   Attempt $RETRY_COUNT/$MAX_RETRIES — retrying in 2s..."
  sleep 2
done

echo "PostgreSQL is ready"
echo ""

# ============================================
# 3. Apply Prisma Migrations
# ============================================
echo "Applying Prisma migrations..."
echo ""

if npx prisma migrate deploy; then
  echo ""
  echo "Migrations applied successfully"
else
  echo ""
  echo "Migration failed!"
  echo "   Container will exit to prevent running in an inconsistent state."
  exit 1
fi

echo ""

# ============================================
# 4. (Optional) Run seed in development
# ============================================
if [ "$NODE_ENV" = "development" ] && [ "$RUN_SEED" = "true" ]; then
  echo "🌱 Running seed (development only)..."
  npx prisma db seed || echo "Seed failed (continuing anyway)"
  echo ""
fi

# ============================================
# 5. Start the server
# ============================================
echo "═══════════════════════════════════════════════════════"
echo "Starting Node.js server..."
echo "═══════════════════════════════════════════════════════"
echo ""

exec "$@"