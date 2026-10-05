const pool = require('../config/db');

// ============================================
// 1. Get own verification status
// ============================================
exports.getVerificationStatus = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        verification_status,
        is_verified,
        verified_at,
        rejection_reason
       FROM masjid_profiles
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Masjid profile not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('getVerificationStatus error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 2. Get own full profile
// ============================================
exports.getMyProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        u.id, u.name, u.email, u.role, u.created_at,
        m.phone, m.website, 
        m.street_address, m.city, m.state, m.zip_code,
        m.latitude, m.longitude,
        m.is_verified, m.verification_status, 
        m.verified_at, m.rejection_reason
       FROM users u
       JOIN masjid_profiles m ON u.id = m.user_id
       WHERE u.id = $1 AND u.role = 'masjid'`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('getMyProfile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 3. Update own profile
// ============================================
exports.updateMyProfile = async (req, res) => {
  const {
    name, phone, website,
    streetAddress, city, state, zipCode,
    latitude, longitude
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update user name (if provided)
    if (name) {
      await client.query(
        'UPDATE users SET name = $1 WHERE id = $2',
        [name, req.user.id]
      );
    }

    // Update masjid profile (COALESCE keeps existing if null)
    const result = await client.query(
      `UPDATE masjid_profiles SET
        phone = COALESCE($1, phone),
        website = COALESCE($2, website),
        street_address = COALESCE($3, street_address),
        city = COALESCE($4, city),
        state = COALESCE($5, state),
        zip_code = COALESCE($6, zip_code),
        latitude = COALESCE($7, latitude),
        longitude = COALESCE($8, longitude),
        address = COALESCE($9, address)
       WHERE user_id = $10
       RETURNING user_id`,
      [
        phone, website,
        streetAddress, city, state, zipCode,
        latitude, longitude,
        // Update legacy address field too
        streetAddress && city && state && zipCode
          ? `${streetAddress}, ${city}, ${state} ${zipCode}`
          : null,
        req.user.id
      ]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Profile not found' });
    }

    await client.query('COMMIT');

    res.json({ 
      message: 'Profile updated successfully',
      updated: true
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateMyProfile error:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};