const pool = require('../config/db');

// ============================================
// 1. Submit halal place (create only)
// ============================================
exports.submitHalalPlace = async (req, res) => {
  const {
    name, category, description,
    streetAddress, city, state, zipCode, latitude, longitude,
    phone, email, website,
    photos,
    planId
  } = req.body;

  if (!name || !category) return res.status(400).json({ message: 'Name and category required' });
  if (!phone) return res.status(400).json({ message: 'Phone required' });
  if (!streetAddress || !city || !state || !zipCode) {
    return res.status(400).json({ message: 'Complete address required' });
  }
  if (!planId) return res.status(400).json({ message: 'Plan is required' });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const planResult = await client.query(
      `SELECT * FROM plans 
       WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [planId]
    );

    if (!planResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid or inactive plan' });
    }

    const plan = planResult.rows[0];

    const placeResult = await client.query(
      `INSERT INTO halal_places (
        owner_id, name, category, description,
        street_address, city, state, zip_code, latitude, longitude,
        phone, email, website, photos,
        plan_id, plan_code, plan_name, plan_price_cents, plan_duration, plan_features,
        status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        'pending_payment'
      ) RETURNING id, name, plan_code, plan_name, plan_price_cents, plan_duration`,
      [
        req.user.id, name, category, description || null,
        streetAddress, city, state, zipCode,
        latitude || null, longitude || null,
        phone, email || null, website || null,
        photos ? JSON.stringify(photos) : null,
        plan.id, plan.code, plan.name,
        plan.price_cents, plan.duration_days,
        plan.features ? JSON.stringify(plan.features) : null
      ]
    );

    const place = placeResult.rows[0];

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Listing created, proceed to payment',
      placeId: place.id,
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        price: plan.price_cents,
        priceDisplay: `$${(plan.price_cents / 100).toFixed(2)}`,
        duration: plan.duration
      },
      place: { id: place.id, name: place.name },
      nextStep: 'POST /api/payments/create-intent'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('submitHalalPlace error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  } finally {
    client.release();
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