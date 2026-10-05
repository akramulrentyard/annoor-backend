const pool = require('../config/db');

// ============================================
// 1. Get dashboard statistics
// ============================================
exports.getStats = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'masjid') AS total_masjids,
        (SELECT COUNT(*) FROM masjid_profiles WHERE verification_status = 'pending') AS pending_masjids,
        (SELECT COUNT(*) FROM masjid_profiles WHERE verification_status = 'approved') AS approved_masjids,
        (SELECT COUNT(*) FROM masjid_profiles WHERE verification_status = 'rejected') AS rejected_masjids,
        (SELECT COUNT(*) FROM otp_codes WHERE is_used = FALSE AND expires_at > NOW()) AS active_otps
    `);

    // Convert strings to numbers
    const stats = rows[0];
    Object.keys(stats).forEach(k => {
      stats[k] = parseInt(stats[k]);
    });

    res.json(stats);
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 2. Pending masjids
// ============================================
exports.getPendingMasjids = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        u.id, u.name, u.email, u.created_at,
        m.phone, m.website,
        m.street_address, m.city, m.state, m.zip_code,
        m.latitude, m.longitude,
        m.verification_status,
        u.created_at AS registered_at
       FROM users u
       JOIN masjid_profiles m ON u.id = m.user_id
       WHERE u.role = 'masjid' 
         AND m.verification_status = 'pending'
       ORDER BY u.created_at ASC`
    );

    res.json({
      count: rows.length,
      masjids: rows
    });
  } catch (err) {
    console.error('getPendingMasjids error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 3. Get all masjids (with optional status filter)
// ============================================
exports.getAllMasjids = async (req, res) => {
  const { status } = req.query; // 'pending' | 'approved' | 'rejected'

  try {
    let query = `
      SELECT 
        u.id, u.name, u.email,
        m.phone, m.street_address, m.city, m.state,
        m.verification_status, m.verified_at, m.rejection_reason,
        v.name AS verified_by_name
      FROM users u
      JOIN masjid_profiles m ON u.id = m.user_id
      LEFT JOIN users v ON m.verified_by = v.id
      WHERE u.role = 'masjid'
    `;

    const params = [];
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query += ' AND m.verification_status = $1';
      params.push(status);
    }

    query += ' ORDER BY u.created_at DESC';

    const { rows } = await pool.query(query, params);

    res.json({
      count: rows.length,
      filter: status || 'all',
      masjids: rows
    });
  } catch (err) {
    console.error('getAllMasjids error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 4. Get masjid details
// ============================================
exports.getMasjidDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT 
        u.id, u.name, u.email, u.created_at,
        m.user_id, m.phone, m.website,
        m.street_address, m.city, m.state, m.zip_code,
        m.latitude, m.longitude,
        m.is_verified, m.verification_status,
        m.verified_at, m.rejection_reason,
        v.id AS verified_by_id,
        v.name AS verified_by_name,
        v.email AS verified_by_email
       FROM users u
       JOIN masjid_profiles m ON u.id = m.user_id
       LEFT JOIN users v ON m.verified_by = v.id
       WHERE u.id = $1 AND u.role = 'masjid'`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Masjid not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('getMasjidDetails error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 5. Approve masjid
// ============================================
exports.approveMasjid = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE masjid_profiles SET
        is_verified = TRUE,
        verification_status = 'approved',
        verified_by = $1,
        verified_at = NOW(),
        rejection_reason = NULL
       WHERE user_id = $2
       RETURNING user_id, verification_status, verified_at, verified_by`,
      [req.user.id, id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Masjid not found' });
    }

    res.json({
      message: 'Masjid approved successfully',
      masjid: rows[0]
    });
  } catch (err) {
    console.error('approveMasjid error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 6. Reject masjid (with reason)
// ============================================
exports.rejectMasjid = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ message: 'Rejection reason is required' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE masjid_profiles SET
        is_verified = FALSE,
        verification_status = 'rejected',
        verified_by = $1,
        verified_at = NOW(),
        rejection_reason = $2
       WHERE user_id = $3
       RETURNING user_id, verification_status, rejection_reason, verified_at`,
      [req.user.id, reason.trim(), id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Masjid not found' });
    }

    res.json({
      message: 'Masjid rejected',
      masjid: rows[0]
    });
  } catch (err) {
    console.error('rejectMasjid error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 7. Admin adds masjid directly (auto-approved)
// ============================================
exports.adminAddMasjid = async (req, res) => {
  const {
    name, email, phone, website,
    streetAddress, city, state, zipCode,
    latitude, longitude
  } = req.body;

  // Validation
  if (!name || !email || !phone) {
    return res.status(400).json({ 
      message: 'Name, email, and phone are required' 
    });
  }
  if (!streetAddress || !city || !state || !zipCode) {
    return res.status(400).json({ 
      message: 'Complete address is required' 
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check email exists
    const exists = await client.query(
      'SELECT 1 FROM users WHERE email = $1',
      [email]
    );
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Step 1: Insert user
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, 'OTP_AUTH_NO_PASSWORD', 'masjid')
       RETURNING id, name, email, role`,
      [name, email]
    );
    const user = userResult.rows[0];

    // Step 2: Insert masjid profile (auto-approved)
    await client.query(
      `INSERT INTO masjid_profiles (
        user_id, phone, website,
        street_address, city, state, zip_code,
        latitude, longitude,
        is_verified, verification_status,
        verified_by, verified_at,
        address, contact_person
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        TRUE, 'approved',
        $10, NOW(),
        $11, $12
      )`,
      [
        user.id, phone, website,
        streetAddress, city, state, zipCode,
        latitude || null, longitude || null,
        req.user.id,
        `${streetAddress}, ${city}, ${state} ${zipCode}`,
        name
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Masjid added and auto-approved',
      masjid: user,
      auto_verified: true
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('adminAddMasjid error:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};