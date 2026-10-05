const pool = require('../config/db');
const { stripe } = require('../config/stripe');

// Duration validation set
const VALID_DURATIONS = [7, 15, 30, 180, 365];

// ============================================
// 1. Change plan (upgrade/downgrade)
// ============================================
exports.changePlan = async (req, res) => {
  const { placeId } = req.params;
  const { newPlanId, durationDays } = req.body;

  if (!newPlanId) {
    return res.status(400).json({ message: 'newPlanId is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current place
    const placeResult = await client.query(
      `SELECT 
        id, name, owner_id, plan_id, plan_code, plan_name,
        plan_price_cents, plan_duration, status, expires_at,
        auto_renew_enabled
       FROM halal_places
       WHERE id = $1 AND owner_id = $2`,
      [placeId, req.user.id]
    );

    if (!placeResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Place not found' });
    }

    const place = placeResult.rows[0];

    if (place.status === 'pending_payment') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Complete initial payment before changing plan'
      });
    }

    // Get new plan
    const planResult = await client.query(
      `SELECT * FROM plans 
       WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [newPlanId]
    );

    if (!planResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid or inactive plan' });
    }

    const newPlan = planResult.rows[0];

    // Validate duration
    const finalDuration = durationDays || newPlan.duration_days;
    if (!VALID_DURATIONS.includes(finalDuration)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Duration must be one of: ${VALID_DURATIONS.join(', ')} days`
      });
    }

    // Calculate price
    const dailyRate = newPlan.price_cents / newPlan.duration_days;
    const finalPrice = Math.round(dailyRate * finalDuration);

    // Determine action type
    const action = finalPrice > (place.plan_price_cents || 0)
      ? 'upgraded'
      : 'downgraded';

    // Log subscription change
    await client.query(
      `INSERT INTO subscriptions (
        place_id, plan_id, action, previous_plan, new_plan,
        amount_cents, currency, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        place.id, newPlan.id, action,
        place.plan_code, newPlan.code,
        finalPrice, newPlan.currency,
        req.user.id
      ]
    );

    // Update place with new plan snapshot
    await client.query(
      `UPDATE halal_places SET
        plan_id = $1,
        plan_code = $2,
        plan_name = $3,
        plan_price_cents = $4,
        plan_duration = $5,
        plan_features = $6,
        updated_at = NOW()
       WHERE id = $7`,
      [
        newPlan.id, newPlan.code, newPlan.name,
        finalPrice, finalDuration,
        newPlan.features ? JSON.stringify(newPlan.features) : null,
        place.id
      ]
    );

    // Create PaymentIntent for the difference
    let paymentIntent = null;
    const requiresPayment = finalPrice > 0;

    if (requiresPayment) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: finalPrice,
        currency: newPlan.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          placeId: place.id.toString(),
          userId: req.user.id.toString(),
          planId: newPlan.id.toString(),
          action: 'plan_change',
          subscriptionAction: action
        },
        description: `Plan change: ${newPlan.name} (${finalDuration} days)`
      });

      await client.query(
        `INSERT INTO payments (
          user_id, place_id, plan_id, plan_code, plan_name,
          amount, currency, status,
          stripe_payment_intent, client_secret,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, NOW(), NOW())`,
        [
          req.user.id, place.id, newPlan.id, newPlan.code, newPlan.name,
          finalPrice / 100, newPlan.currency,
          paymentIntent.id, paymentIntent.client_secret
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: `Plan change initiated (${action})`,
      action,
      requiresPayment,
      clientSecret: paymentIntent?.client_secret || null,
      paymentIntentId: paymentIntent?.id || null,
      place: { id: place.id, name: place.name },
      newPlan: {
        id: newPlan.id,
        code: newPlan.code,
        name: newPlan.name,
        price: finalPrice,
        priceDisplay: `$${(finalPrice / 100).toFixed(2)}`,
        duration: finalDuration
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('changePlan error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  } finally {
    client.release();
  }
};

// ============================================
// 2. Toggle auto-renew
// ============================================
exports.toggleAutoRenew = async (req, res) => {
  const { placeId } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'enabled (boolean) required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE halal_places SET
        auto_renew_enabled = $1,
        auto_renew_cancelled_at = $2,
        updated_at = NOW()
       WHERE id = $3 AND owner_id = $4
       RETURNING id, name, auto_renew_enabled, auto_renew_cancelled_at, expires_at`,
      [
        enabled,
        enabled ? null : new Date(),
        placeId,
        req.user.id
      ]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Place not found' });
    }

    // Log action
    const action = enabled ? 'reactivated' : 'cancelled';
    await client.query(
      `INSERT INTO subscriptions (
        place_id, action, created_by, created_at
      ) VALUES ($1, $2, $3, NOW())`,
      [placeId, action, req.user.id]
    );

    await client.query('COMMIT');

    res.json({
      message: enabled ? 'Auto-renewal enabled' : 'Auto-renewal disabled',
      place: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('toggleAutoRenew error:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};

// ============================================
// 3. Get subscription history
// ============================================
exports.getSubscriptionHistory = async (req, res) => {
  const { placeId } = req.params;

  try {
    const place = await pool.query(
      'SELECT id FROM halal_places WHERE id = $1 AND owner_id = $2',
      [placeId, req.user.id]
    );

    if (!place.rows.length) {
      return res.status(404).json({ message: 'Place not found' });
    }

    const { rows } = await pool.query(
      `SELECT 
        id, action, previous_plan, new_plan,
        amount_cents, currency, started_at, expires_at, created_at
       FROM subscriptions
       WHERE place_id = $1
       ORDER BY created_at DESC`,
      [placeId]
    );

    res.json({ count: rows.length, history: rows });
  } catch (err) {
    console.error('getSubscriptionHistory error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 4. Get subscription summary for place
// ============================================
exports.getSubscriptionSummary = async (req, res) => {
  const { placeId } = req.params;

  try {
    const place = await pool.query(
      `SELECT 
        id, name, plan_code, plan_name, plan_price_cents, plan_duration,
        status, expires_at, auto_renew_enabled, renewed_at, renewal_count,
        approved_at
       FROM halal_places
       WHERE id = $1 AND owner_id = $2`,
      [placeId, req.user.id]
    );

    if (!place.rows.length) {
      return res.status(404).json({ message: 'Place not found' });
    }

    const p = place.rows[0];

    // Calculate days remaining
    let daysRemaining = null;
    if (p.expires_at) {
      const diff = new Date(p.expires_at).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    res.json({
      placeId: p.id,
      name: p.name,
      plan: {
        code: p.plan_code,
        name: p.plan_name,
        priceCents: p.plan_price_cents,
        priceDisplay: p.plan_price_cents
          ? `$${(p.plan_price_cents / 100).toFixed(2)}` : null,
        durationDays: p.plan_duration
      },
      status: p.status,
      approvedAt: p.approved_at,
      expiresAt: p.expires_at,
      daysRemaining,
      autoRenew: {
        enabled: p.auto_renew_enabled,
        lastRenewedAt: p.renewed_at,
        renewalCount: p.renewal_count
      }
    });
  } catch (err) {
    console.error('getSubscriptionSummary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};