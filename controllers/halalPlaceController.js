const pool = require('../config/db');
const { deleteR2Keys, deleteR2Prefix } = require('../utils/r2Helper');

const isProd = process.env.NODE_ENV === 'production';

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
    res.status(500).json({
      message: 'Server error',
      detail: isProd ? undefined : err.message
    });
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
// Route: GET /halal-places/:placeId
// ============================================
exports.getMyPlaceDetails = async (req, res) => {
  const { placeId } = req.params;

  if (!/^\d+$/.test(placeId)) {
    return res.status(404).json({ message: 'Not found' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM halal_places WHERE id = $1 AND owner_id = $2`,
      [placeId, req.user.id]
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
// Route: GET /halal-places/public
// ============================================
exports.getPublicHalalPlaces = async (req, res) => {
  const { category, city, search } = req.query;

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

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
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    res.json({ count: rows.length, places: rows });
  } catch (err) {
    console.error('getPublicHalalPlaces error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════
// 5. DELETE place + all R2 photos  [NEW]
// Route: DELETE /halal-places/:placeId
// ═══════════════════════════════════════════════════
exports.deleteHalalPlace = async (req, res) => {
  const { placeId } = req.params;

  if (!/^\d+$/.test(placeId)) {
    return res.status(404).json({ message: 'Not found' });
  }

  try {
    // 1. Verify ownership
    const placeResult = await pool.query(
      `SELECT id, name, photos, status
       FROM halal_places
       WHERE id = $1 AND owner_id = $2`,
      [placeId, req.user.id]
    );

    if (!placeResult.rows.length) {
      return res.status(404).json({ message: 'Place not found' });
    }

    const place = placeResult.rows[0];
    const photos = place.photos || [];

    // 2. Collect R2 keys
    const r2Keys = photos.map(p => p.key).filter(Boolean);

    // 3. Detach Stripe cards (best-effort)
    try {
      const { stripe } = require('../config/stripe');
      const savedCards = await pool.query(
        `SELECT DISTINCT stripe_payment_method_id
         FROM payments
         WHERE place_id = $1
           AND stripe_payment_method_id IS NOT NULL`,
        [placeId]
      );

      for (const row of savedCards.rows) {
        try {
          await stripe.paymentMethods.detach(row.stripe_payment_method_id);
          console.log(`✅ Stripe PM detached: ${row.stripe_payment_method_id}`);
        } catch (stripeErr) {
          if (stripeErr.code !== 'resource_missing') {
            console.warn('⚠️  Stripe detach:', stripeErr.message);
          }
        }
      }
    } catch (stripeErr) {
      console.warn('⚠️  Stripe cleanup failed:', stripeErr.message);
    }

    // 4. DB transaction — delete all related records
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `DELETE FROM subscriptions WHERE place_id = $1`,
        [placeId]
      );

      await client.query(
        `DELETE FROM payments WHERE place_id = $1`,
        [placeId]
      );

      await client.query(
        `DELETE FROM halal_places WHERE id = $1`,
        [placeId]
      );

      await client.query('COMMIT');
      console.log(`✅ Place "${place.name}" (id=${placeId}) deleted from DB`);

    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // 5. R2 cleanup (best-effort, after commit)
    let photosDeleted = 0;
    try {
      if (r2Keys.length > 0) {
        photosDeleted = await deleteR2Keys(r2Keys);
      }
      // Fallback: prefix delete catches orphans
      const prefixDeleted = await deleteR2Prefix(`places/${placeId}/`);
      if (prefixDeleted > photosDeleted) {
        console.log(`🧹 Orphan cleanup: +${prefixDeleted - photosDeleted}`);
        photosDeleted = prefixDeleted;
      }
    } catch (r2Err) {
      console.error('⚠️  R2 cleanup failed (DB already deleted):', r2Err.message);
    }

    res.json({
      message: 'Halal place deleted successfully',
      placeId: Number(placeId),
      name: place.name,
      deleted: {
        photos: photosDeleted,
        photosQueued: r2Keys.length
      }
    });

  } catch (err) {
    console.error('deleteHalalPlace error:', err);
    res.status(500).json({
      message: 'Server error',
      detail: isProd ? undefined : err.message
    });
  }
};
