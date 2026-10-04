#!/bin/sh
set -e

echo "═══════════════════════════════════════════════════════"
echo "🚀 Starting Annoor Backend"
echo "═══════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════
# 1. Ensure Extensions & Types
# ═══════════════════════════════════════════
echo "🔧 Ensuring database types..."

node -e "
require('dotenv').config();
const pool = require('./config/db');

(async () => {
  try {
    // Create user_role enum if not exists
    await pool.query(\`
      DO \\\$\\\$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('user', 'masjid');
          RAISE NOTICE 'Created user_role enum';
        ELSE
          RAISE NOTICE 'user_role enum already exists — skipping';
        END IF;
      END
      \\\$\\\$;
    \`);
    console.log('  ✅ Types checked');

    // ═══════════════════════════════════════════
    // 2. Ensure Core Tables
    // ═══════════════════════════════════════════
    console.log('🔧 Ensuring core tables...');

    await pool.query(\`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role user_role NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    \`);
    console.log('  ✅ users table');

    await pool.query(\`
      CREATE TABLE IF NOT EXISTS masjid_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        address TEXT,
        contact_person VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE
      );
    \`);
    console.log('  ✅ masjid_profiles table');

    await pool.query(\`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        payload JSONB,
        is_used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    \`);
    console.log('  ✅ otp_codes table');

    // ═══════════════════════════════════════════
    // 3. Ensure New Columns (idempotent)
    // ═══════════════════════════════════════════
    console.log('🔧 Ensuring new columns...');

    await pool.query(\`
      ALTER TABLE masjid_profiles
        ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
        ADD COLUMN IF NOT EXISTS website VARCHAR(255),
        ADD COLUMN IF NOT EXISTS street_address TEXT,
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20),
        ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
        ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
    \`);
    console.log('  ✅ masjid_profiles columns');

    // ═══════════════════════════════════════════
    // 4. Ensure Indexes
    // ═══════════════════════════════════════════
    console.log('🔧 Ensuring indexes...');

    await pool.query(\`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
      CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);
    \`);
    console.log('  ✅ Indexes');

    console.log('  ✅ All database checks passed');
    process.exit(0);
  } catch (err) {
    console.error('  ❌ Database check failed:', err.message);
    process.exit(1);
  }
})();
"

echo ""

# ═══════════════════════════════════════════
# 5. Prisma Migrate (optional — if migrations exist)
# ═══════════════════════════════════════════
if [ -d "/app/prisma/migrations" ] && [ "$(ls -A /app/prisma/migrations 2>/dev/null | grep -v migration_lock)" ]; then
  echo "🔄 Running Prisma migrations..."
  npx prisma migrate deploy || {
    echo "⚠️  Prisma migrate deploy failed — continuing (tables already ensured)"
  }
  echo "✅ Migrations checked"
  echo ""
fi

# ═══════════════════════════════════════════
# 6. Start Application
# ═══════════════════════════════════════════
echo "🎬 Starting application..."
echo ""

exec "$@"