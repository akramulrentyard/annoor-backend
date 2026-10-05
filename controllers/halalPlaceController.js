const pool = require('../config/db');

// ═══════════════════════════════════════════════════
// USER — Submit business form (no plan yet)
// ═══════════════════════════════════════════════════
exports.submitHalalPlace = async (req, res) => {
  const {
    name, category, description,
    streetAddress, city, state, zipCode,
    latitude, longitude,
    phone, email, website, photos
  } = req.body;

  // ⚠️ NO planId validation here
  if (!name || !category) {
    return res.status(400).json({ message: 'Name and category required' });
  }
  if (!phone) {
    return res.status(400).json({ message: 'Phone required' });
  }
  if (!streetAddress || !city || !state || !zipCode) {
    return res.status(400).json({ message: 'Complete address required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO halal_places (
        owner_id, name, category, description,
        street_address, city, state, zip_code, latitude, longitude,
        phone, email, website, photos,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending_payment')
       RETURNING id, name, status, created_at`,
      [
        req.user.id, name, category, description || null,
        streetAddress, city, state, zipCode,
        latitude || null, longitude || null,
        phone, email || null, website || null,
        photos ? JSON.stringify(photos) : null
      ]
    );

    res.status(201).json({
      message: 'Business saved. Please select a plan.',
      placeId: rows[0].id,
      place: rows[0],
      nextStep: 'POST /api/payments/create-intent with { placeId, planId }'
    });
  } catch (err) {
    console.error('submitHalalPlace error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};
// ============================================
// 2. Get my places
// ============================================
exports.getMyHalalPlaces = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        id, name, category, description,
        street_address, city, state, zip_code,
        phone, website, photos,
        plan_id, plan_code, plan_name, plan_price_cents, plan_duration,
        status, is_active, rejection_reason,
        approved_at, expires_at, created_at
       FROM halal_places
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      count: rows.length,
      places: rows.map(p => ({
        ...p,
        planDisplay: p.plan_name ? {
          name: p.plan_name,
          price: p.plan_price_cents,
          priceDisplay: p.plan_price_cents 
            ? `$${(p.plan_price_cents / 100).toFixed(2)}` : null,
          duration: p.plan_duration
        } : null
      }))
    });
  } catch (err) {
    console.error('getMyHalalPlaces error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 3. Get my place details
// ============================================
exports.getMyPlaceDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM halal_places WHERE id = $1 AND owner_id = $2`,
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getMyPlaceDetails error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 4. Public places
// ============================================
exports.getPublicHalalPlaces = async (req, res) => {
  const { category, city, search, limit = 20, offset = 0 } = req.query;

  try {
    let query = `
      SELECT 
        id, name, category, description,
        street_address, city, state, zip_code,
        latitude, longitude, phone, website, photos,
        plan_code, approved_at
       FROM halal_places
       WHERE status = 'approved' AND is_active = TRUE
    `;
    const params = [];
    let idx = 1;

    if (category) {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (city) {
      query += ` AND LOWER(city) = LOWER($${idx++})`;
      params.push(city);
    }
    if (search) {
      query += ` AND (LOWER(name) LIKE LOWER($${idx}) OR LOWER(description) LIKE LOWER($${idx}))`;
      params.push(`%${search}%`);
      idx++;
    }

    query += `
      ORDER BY 
        CASE plan_code
          WHEN 'featured' THEN 1
          WHEN 'premium' THEN 2
          ELSE 3
        END,
        approved_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);
    res.json({ count: rows.length, places: rows });
  } catch (err) {
    console.error('getPublicHalalPlaces error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

