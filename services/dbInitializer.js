const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

// ============================================
// Run SQL schema file
// ============================================
const runSchema = async () => {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('Schema applied successfully');
};

// ============================================
// Check if a table exists
// ============================================
const tableExists = async (tableName) => {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public'
       AND table_name = $1
     )`,
    [tableName]
  );
  return result.rows[0].exists;
};

// ============================================
// Check if any users exist
// ============================================
const hasAnyUsers = async () => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    return parseInt(result.rows[0].count) > 0;
  } catch {
    return false;
  }
};

// ============================================
// Seed initial data for testing
// ============================================
const seedData = async () => {
  console.log('Seeding initial test data...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert test user
    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ['Test User', 'user@test.com', 'OTP_AUTH_NO_PASSWORD', 'user']
    );

    // Insert test masjid
    const masjidResult = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      ['Test Masjid', 'masjid@test.com', 'OTP_AUTH_NO_PASSWORD', 'masjid']
    );

    // Insert masjid profile if new
    if (masjidResult.rows.length > 0) {
      await client.query(
        `INSERT INTO masjid_profiles (user_id, address, contact_person, is_verified)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [masjidResult.rows[0].id, 'Dhaka, Bangladesh', 'Imam Test', true]
      );
    }

    await client.query('COMMIT');
    console.log('Seed data inserted');
    console.log('User  : user@test.com   (role: user)');
    console.log('Masjid : masjid@test.com (role: masjid, verified)');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ============================================
// Main initializer
// ============================================
exports.initializeDatabase = async () => {
  console.log('');
  console.log('Checking database...');

  try {
    // Step 1: Check if "users" table exists
    const usersTableExists = await tableExists('users');

    if (!usersTableExists) {
      console.log('Tables not found. Running schema...');
      await runSchema();
    } else {
      console.log('Tables already exist');
    }

    // Step 2: Check if any users exist
    const hasUsers = await hasAnyUsers();

    if (!hasUsers) {
      console.log('No users found. Seeding initial data...');
      await seedData();
    } else {
      console.log('Database already has users');
    }

    console.log('Database initialization complete');
    console.log('');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    throw err;
  }
};