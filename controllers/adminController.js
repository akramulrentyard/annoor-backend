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
        (SELECT COUNT(*) FROM otp_codes WHERE is_used = FALSE AND expires_at > NOW()) AS active_otps,
        (SELECT COUNT(*) FROM halal_places WHERE status = 'pending_admin') AS pending_halal_places,
        (SELECT COUNT(*) FROM halal_places WHERE status = 'approved') AS approved_halal_places
    `);

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
// 3. Get all masjids
// ============================================
exports.getAllMasjids = async (req, res) => {
  const { status } = req.query;

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
// 6. Reject masjid
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
// 7. Admin adds masjid directly
// ============================================
exports.adminAddMasjid = async (req, res) => {
  const {
    name, email, phone, website,
    streetAddress, city, state, zipCode,
    latitude, longitude
  } = req.body;

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

    const exists = await client.query(
      'SELECT 1 FROM users WHERE email = $1',
      [email]
    );
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Email already exists' });
    }

    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, 'OTP_AUTH_NO_PASSWORD', 'masjid')
       RETURNING id, name, email, role`,
      [name, email]
    );
    const user = userResult.rows[0];

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

// ============================================
// 8. Pending halal places
// ============================================
exports.getPendingHalalPlaces = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        h.id, h.name, h.category, h.description,
        h.street_address, h.city, h.state, h.zip_code,
        h.phone, h.email, h.website, h.photos,
        h.plan_code, h.plan_name, h.plan_price_cents, h.plan_duration,
        h.status, h.created_at,
        u.id AS owner_id, u.name AS owner_name, u.email AS owner_email
       FROM halal_places h
       JOIN users u ON h.owner_id = u.id
       WHERE h.status = 'pending_admin'
       ORDER BY h.created_at ASC`
    );

    res.json({ count: rows.length, places: rows });
  } catch (err) {
    console.error('getPendingHalalPlaces error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 9. Approve halal place
// ============================================
exports.approveHalalPlace = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE halal_places SET
        status = 'approved',
        is_active = TRUE,
        approved_at = NOW(),
        approved_by = $1,
        rejection_reason = NULL,
        expires_at = NOW() + (COALESCE(plan_duration, 30) * INTERVAL '1 day'),
        updated_at = NOW()
       WHERE id = $2 AND status = 'pending_admin'
       RETURNING 
         id, name, status, approved_at, expires_at,
         plan_code, plan_name, plan_duration, auto_renew_enabled`,
      [req.user.id, id]
    );

    if (!rows.length) {
      return res.status(404).json({ 
        message: 'Place not found or not in pending_admin status' 
      });
    }

    // Log subscription approval
    await pool.query(
      `INSERT INTO subscriptions (
        place_id, action, created_by, created_at
      ) VALUES ($1, 'created', $2, NOW())`,
      [id, req.user.id]
    );

    res.json({
      message: 'Halal place approved successfully',
      place: rows[0]
    });
  } catch (err) {
    console.error('approveHalalPlace error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 10. Reject halal place
// ============================================
exports.rejectHalalPlace = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ message: 'Rejection reason required' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE halal_places SET
        status = 'rejected',
        is_active = FALSE,
        rejection_reason = $1,
        approved_by = $2,
        approved_at = NOW(),
        updated_at = NOW()
       WHERE id = $3 AND status = 'pending_admin'
       RETURNING id, name, status, rejection_reason`,
      [reason.trim(), req.user.id, id]
    );

    if (!rows.length) {
      return res.status(404).json({ 
        message: 'Place not found or not in pending_admin status' 
      });
    }

    res.json({
      message: 'Halal place rejected',
      place: rows[0]
    });
  } catch (err) {
    console.error('rejectHalalPlace error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 11. All halal places
// ============================================
exports.getAllHalalPlaces = async (req, res) => {
  const { status } = req.query;

  try {
    let query = `
      SELECT 
        h.id, h.name, h.category,
        h.city, h.state,
        h.plan_code, h.plan_name, h.plan_price_cents,
        h.status, h.is_active, h.auto_renew_enabled,
        h.approved_at, h.expires_at, h.rejection_reason,
        u.name AS owner_name, u.email AS owner_email
       FROM halal_places h
       JOIN users u ON h.owner_id = u.id
       WHERE 1=1
    `;

    const params = [];
    if (status) {
      query += ' AND h.status = $1';
      params.push(status);
    }

    query += ' ORDER BY h.created_at DESC LIMIT 100';

    const { rows } = await pool.query(query, params);
    res.json({ count: rows.length, places: rows });
  } catch (err) {
    console.error('getAllHalalPlaces error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 12. Admin: Update user subscription
// ============================================
exports.adminUpdateSubscription = async (req, res) => {
  const { placeId } = req.params;
  const {
    planId,
    expiresAt,
    autoRenewEnabled,
    status
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const place = await client.query(
      `SELECT id, name, plan_id, plan_code FROM halal_places WHERE id = $1`,
      [placeId]
    );

    if (!place.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Place not found' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (planId) {
      const plan = await client.query(
        'SELECT * FROM plans WHERE id = $1',
        [planId]
      );
      if (!plan.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid plan' });
      }

      const p = plan.rows[0];

      updates.push(`plan_id = $${idx++}`);
      params.push(planId);
      updates.push(`plan_code = $${idx++}`);
      params.push(p.code);
      updates.push(`plan_name = $${idx++}`);
      params.push(p.name);
      updates.push(`plan_price_cents = $${idx++}`);
      params.push(p.price_cents);
      updates.push(`plan_duration = $${idx++}`);
      params.push(p.duration_days);
      if (p.features) {
        updates.push(`plan_features = $${idx++}`);
        params.push(JSON.stringify(p.features));
      }
    }

    if (expiresAt) {
      updates.push(`expires_at = $${idx++}`);
      params.push(new Date(expiresAt));
    }

    if (typeof autoRenewEnabled === 'boolean') {
      updates.push(`auto_renew_enabled = $${idx++}`);
      params.push(autoRenewEnabled);
      updates.push(`auto_renew_cancelled_at = $${idx++}`);
      params.push(autoRenewEnabled ? null : new Date());
    }

    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
    }

    if (!updates.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(placeId);

    const result = await client.query(
      `UPDATE halal_places SET ${updates.join(', ')}
       WHERE id = $${idx}
       RETURNING id, name, plan_code, plan_name, status, expires_at, auto_renew_enabled`,
      params
    );

    // Log admin action
    await client.query(
      `INSERT INTO subscriptions (
        place_id, action, metadata, created_by, created_at
      ) VALUES ($1, 'upgraded', $2, $3, NOW())`,
      [
        placeId,
        JSON.stringify({ admin_action: true, changes: req.body }),
        req.user.id
      ]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Subscription updated by admin',
      place: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('adminUpdateSubscription error:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};

// ============================================
// 13. Admin: Get user subscription details
// ============================================
exports.adminGetUserSubscription = async (req, res) => {
  const { placeId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT 
        h.id, h.name, h.category,
        h.plan_id, h.plan_code, h.plan_name, h.plan_price_cents, h.plan_duration,
        h.status, h.is_active, h.expires_at,
        h.auto_renew_enabled, h.auto_renew_cancelled_at,
        h.approved_at, h.renewed_at, h.renewal_count,
        u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
        (SELECT COUNT(*) FROM subscriptions WHERE place_id = h.id) AS total_actions
       FROM halal_places h
       JOIN users u ON h.owner_id = u.id
       WHERE h.id = $1`,
      [placeId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Place not found' });
    }

    const history = await pool.query(
      `SELECT id, action, previous_plan, new_plan,
        amount_cents, currency, created_at
       FROM subscriptions
       WHERE place_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [placeId]
    );

    res.json({
      place: rows[0],
      history: history.rows
    });
  } catch (err) {
    console.error('adminGetUserSubscription error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};