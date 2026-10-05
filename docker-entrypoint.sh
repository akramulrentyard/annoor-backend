#!/bin/sh
set -e

# ═══════════════════════════════════════════
# 1. Prisma Migrations
# ═══════════════════════════════════════════
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations complete."

# ═══════════════════════════════════════════
# 2. SuperAdmin Auto-Create (OTP-only)
#    - Email + name hardcoded below
#    - No password (OTP login only)
#    - Existing থাকলে কিছুই হবে না
#    - Login: POST /api/auth/login/send-otp
# ═══════════════════════════════════════════
echo ""
echo "Checking SuperAdmin..."
node -e "
require('dotenv').config();
const pool = require('./config/db');

const SUPERADMIN_EMAIL = 'akramul@rentyard.com';
const SUPERADMIN_NAME = 'Akramul Hasan';

(async () => {
  try {
    const email = SUPERADMIN_EMAIL;
    const name = SUPERADMIN_NAME;

    // Check if exists
    const existing = await pool.query(
      'SELECT id, role FROM users WHERE email = \$1',
      [email]
    );

    if (existing.rows.length === 0) {
      // Create new SuperAdmin with NO password (OTP-only login)
      const r = await pool.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES (\$1, \$2, \$3, \$4) RETURNING id, email, role',
        [name, email, 'OTP_AUTH_NO_PASSWORD', 'superadmin']
      );

      console.log('  ✅ SuperAdmin created (OTP-only):', r.rows[0].email);
      console.log('     Login: POST /api/auth/login/send-otp');
    } else if (existing.rows[0].role !== 'superadmin') {
      // Upgrade existing user → superadmin
      await pool.query(
        'UPDATE users SET role = \$1, name = \$2 WHERE email = \$3',
        ['superadmin', name, email]
      );
      console.log('  ✅ SuperAdmin role updated:', email);
    } else {
      // Already exists as superadmin — do nothing
      console.log('  ✅ SuperAdmin already exists:', email);
    }

    process.exit(0);
  } catch (e) {
    console.error('  ❌ SuperAdmin check failed:', e.message);
    process.exit(1);
  }
})();
"

# ═══════════════════════════════════════════
# 3. Optional Seed (RUN_SEED=true হলে)
# ═══════════════════════════════════════════
if [ "$RUN_SEED" = "true" ]; then
  echo ""
  echo "Running seed..."
  npx prisma db seed
  echo "Seed complete."
fi

# ═══════════════════════════════════════════
# 4. Start Application
# ═══════════════════════════════════════════
echo ""
echo "Starting application..."
exec "$@"