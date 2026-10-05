const pool = require('../config/db');

// ============================================
// Helper: Format duration
// ============================================
function formatDuration(days) {
  if (days === 7) return '7 days';
  if (days === 15) return '15 days';
  if (days === 30) return '1 month';
  if (days === 180) return '6 months';
  if (days === 365) return '1 year';
  return `${days} days`;
}

// ============================================
// 1. Public: Get active plans
// ============================================
exports.getActivePlans = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        id, code, name, description,
        price_cents, currency, duration_days,
        features, is_featured, auto_renew_enabled, sort_order
       FROM plans
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY sort_order ASC, price_cents ASC`
    );

    const durationOptions = [
      { label: '7 days', days: 7, code: 'weekly' },
      { label: '15 days', days: 15, code: 'biweekly' },
      { label: '1 month', days: 30, code: 'monthly' },
      { label: '6 months', days: 180, code: 'semi_annual' },
      { label: '1 year', days: 365, code: 'annual' }
    ];

    res.json({
      count: rows.length,
      durationOptions,
      plans: rows.map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        price: p.price_cents,
        priceDisplay: `$${(p.price_cents / 100).toFixed(2)}`,
        currency: p.currency,
        durationDays: p.duration_days,
        durationDisplay: formatDuration(p.duration_days),
        features: p.features,
        isFeatured: p.is_featured,
        autoRenewEnabled: p.auto_renew_enabled
      }))
    });
  } catch (err) {
    console.error('getActivePlans error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ============================================
// 2. Admin: Get all plans
// ============================================
exports.getAllPlans = async (req, res) => {
  const { includeDeleted } = req.query;

  try {
    let query = `
      SELECT 
        p.id, p.code, p.name, p.description,
        p.price_cents, p.currency, p.duration_days,
        p.features, p.is_active, p.is_featured,
        p.auto_renew_enabled, p.sort_order, p.deleted_at,
        p.created_at, p.updated_at,
        c.name AS created_by_name,
        (SELECT COUNT(*) FROM halal_places WHERE plan_id = p.id) AS usage_count
       FROM plans p
       LEFT JOIN users c ON p.created_by = c.id
    `;

    if (includeDeleted !== 'true') {
      query += ' WHERE p.deleted_at IS NULL';
    }
    query += ' ORDER BY p.sort_order ASC, p.created_at DESC';

    const { rows } = await pool.query(query);
    res.json({ count: rows.length, plans: rows });
  } catch (err) {
    console.error('getAllPlans error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ============================================
// 3. Admin: Get single plan
// ============================================
exports.getPlanById = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM halal_places WHERE plan_id = p.id) AS usage_count
       FROM plans p WHERE p.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Plan not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getPlanById error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ============================================
// 4. Admin: Create plan
// ============================================
exports.createPlan = async (req, res) => {
  const {
    code, name, description,
    priceCents, currency = 'USD',
    durationDays,           // ⬅️ renamed from duration
    features, isActive = true, isFeatured = false,
    autoRenewEnabled = true,
    sortOrder = 0
  } = req.body;

  if (!code || !name) return res.status(400).json({ message: 'Code and name required' });
  if (!priceCents || priceCents < 0) return res.status(400).json({ message: 'Valid price required' });
  if (!durationDays || durationDays < 1) return res.status(400).json({ message: 'Duration required' });
  if (!/^[a-z0-9_]+$/.test(code)) {
    return res.status(400).json({ message: 'Code must be lowercase alphanumeric' });
  }

  try {
    const exists = await pool.query('SELECT id FROM plans WHERE code = $1', [code]);
    if (exists.rows.length) return res.status(400).json({ message: 'Plan code exists' });

    const { rows } = await pool.query(
      `INSERT INTO plans (
        code, name, description, price_cents, currency, duration_days,
        features, is_active, is_featured, auto_renew_enabled, sort_order,
        created_by, updated_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, NOW(), NOW())
       RETURNING *`,
      [
        code, name, description || null,
        priceCents, currency, durationDays,
        features ? JSON.stringify(features) : null,
        isActive, isFeatured, autoRenewEnabled, sortOrder,
        req.user.id
      ]
    );

    res.status(201).json({ message: 'Plan created', plan: rows[0] });
  } catch (err) {
    console.error('createPlan error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ============================================
// 5. Admin: Update plan
// ============================================
exports.updatePlan = async (req, res) => {
  const { id } = req.params;
  const {
    name, description, priceCents, currency, durationDays,
    features, isActive, isFeatured, autoRenewEnabled, sortOrder
  } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE plans SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        price_cents = COALESCE($3, price_cents),
        currency = COALESCE($4, currency),
        duration_days = COALESCE($5, duration_days),
        features = COALESCE($6, features),
        is_active = COALESCE($7, is_active),
        is_featured = COALESCE($8, is_featured),
        auto_renew_enabled = COALESCE($9, auto_renew_enabled),
        sort_order = COALESCE($10, sort_order),
        updated_by = $11,
        updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        name, description, priceCents, currency, durationDays,
        features ? JSON.stringify(features) : null,
        isActive, isFeatured, autoRenewEnabled, sortOrder,
        req.user.id, id
      ]
    );

    if (!rows.length) return res.status(404).json({ message: 'Plan not found' });

    res.json({
      message: 'Plan updated',
      plan: rows[0],
      note: 'Existing subscriptions keep original terms'
    });
  } catch (err) {
    console.error('updatePlan error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ============================================
// 6. Admin: Delete plan (soft)
// ============================================
exports.deletePlan = async (req, res) => {
  const { id } = req.params;
  try {
    const usage = await pool.query(
      `SELECT COUNT(*) AS count FROM halal_places
       WHERE plan_id = $1 AND status IN ('approved', 'pending_admin')`,
      [id]
    );
    const usageCount = parseInt(usage.rows[0].count);

    const { rows } = await pool.query(
      `UPDATE plans SET
        is_active = FALSE,
        deleted_at = NOW(),
        updated_by = $1,
        updated_at = NOW()
       WHERE id = $2
       RETURNING id, code, name, deleted_at`,
      [req.user.id, id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Plan not found' });

    res.json({
      message: 'Plan deleted (soft)',
      plan: rows[0],
      activeSubscriptions: usageCount,
      note: usageCount > 0
        ? `${usageCount} subscriptions continue with original terms`
        : 'No active subscriptions affected'
    });
  } catch (err) {
    console.error('deletePlan error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ============================================
// 7. Admin: Restore plan
// ============================================
exports.restorePlan = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE plans SET
        is_active = TRUE,
        deleted_at = NULL,
        updated_by = $1,
        updated_at = NOW()
       WHERE id = $2
       RETURNING id, code, name, is_active`,
      [req.user.id, id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Plan not found' });
    res.json({ message: 'Plan restored', plan: rows[0] });
  } catch (err) {
    console.error('restorePlan error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ============================================
// 8. Admin: Plan usage stats
// ============================================
exports.getPlanStats = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'approved') AS active_count,
        COUNT(*) FILTER (WHERE status = 'pending_admin') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
        COUNT(*) AS total_count
       FROM halal_places WHERE plan_id = $1`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('getPlanStats error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};