const pool = require('../config/db');
const { stripe } = require('../config/stripe');

const isProd = process.env.NODE_ENV === 'production';

// Stripe/DB error detail is exposed only outside production
const errDetail = (err) => (isProd ? undefined : err.message);

const safeRollback = async (client) => {
  try {
    await client.query('ROLLBACK');
  } catch (_) {
    /* no active transaction */
  }
};

// ============================================
// Helper: get or create Stripe Customer for a user
// (needed so the card can be saved for cron auto-renew)
// ============================================
async function getOrCreateStripeCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: String(user.id) }
  });

  // Only set if still empty (protects against two parallel requests)
  const upd = await pool.query(
    `UPDATE users SET stripe_customer_id = $1
     WHERE id = $2 AND stripe_customer_id IS NULL
     RETURNING stripe_customer_id`,
    [customer.id, user.id]
  );
  if (upd.rowCount) return customer.id;

  const cur = await pool.query(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [user.id]
  );
  return cur.rows[0].stripe_customer_id;
}

// ============================================
// 1. Get Stripe publishable key (public)
// ============================================
exports.getPublishableKey = async (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
};

// ============================================
// 2. Create PaymentIntent
// ============================================
exports.createPaymentIntent = async (req, res) => {
  const { placeId, planId } = req.body;
  const autoRenew = req.body.autoRenew === undefined ? true : req.body.autoRenew === true || req.body.autoRenew === 'true';

  if (!placeId || !planId) {
    return res.status(400).json({ message: 'placeId and planId required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch place (must belong to user)
    const placeResult = await client.query(
      `SELECT * FROM halal_places
       WHERE id = $1 AND owner_id = $2
       FOR UPDATE`,
      [placeId, req.user.id]
    );

    if (!placeResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Place not found' });
    }

    const place = placeResult.rows[0];

    if (place.status !== 'pending_payment') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Cannot pay: status is '${place.status}'`
      });
    }

    // 2. Fetch plan (price always comes from DB, never from the client)
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

    // 3. Stripe Customer (so the card can be saved for renewals)
    const userResult = await client.query(
      'SELECT id, name, email, stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }
    const customerId = await getOrCreateStripeCustomer(userResult.rows[0]);

    // 4. Snapshot plan into place + save auto-renew preference
    await client.query(
      `UPDATE halal_places SET
        plan_id = $1,
        plan_code = $2,
        plan_name = $3,
        plan_price_cents = $4,
        plan_duration = $5,
        plan_features = $6,
        auto_renew_enabled = $7,
        updated_at = NOW()
       WHERE id = $8`,
      [
        plan.id, plan.code, plan.name,
        plan.price_cents, plan.duration_days,
        plan.features ? JSON.stringify(plan.features) : null,
        autoRenew,
        placeId
      ]
    );

    // 5. Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: plan.price_cents,
      currency: plan.currency.toLowerCase(),
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      // Card is saved to the customer for cron auto-renew
      setup_future_usage: autoRenew ? 'off_session' : undefined,
      metadata: {
        placeId: placeId.toString(),
        userId: req.user.id.toString(),
        planId: plan.id.toString(),
        autoRenew: autoRenew.toString()
      },
      description: `${plan.name} - ${place.name}`
    });

    // 6. Save payment record
    await client.query(
      `INSERT INTO payments (
        user_id, place_id, plan_id, plan_code, plan_name,
        amount, currency, status,
        stripe_payment_intent, client_secret,
        stripe_customer_id,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, NOW(), NOW())`,
      [
        req.user.id, placeId, plan.id, plan.code, plan.name,
        plan.price_cents / 100, plan.currency,
        paymentIntent.id, paymentIntent.client_secret,
        customerId
      ]
    );

    await client.query('COMMIT');

    res.json({
      message: 'PaymentIntent ready',
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: plan.price_cents,
      currency: plan.currency,
      autoRenew,
      place: {
        id: placeId,
        name: place.name,
        plan: {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          price: plan.price_cents,
          duration: plan.duration_days
        }
      }
    });
  } catch (err) {
    await safeRollback(client);
    console.error('createPaymentIntent error:', err);
    res.status(500).json({ message: 'Server error', detail: errDetail(err) });
  } finally {
    client.release();
  }
};

// ============================================
// 3. Confirm payment (after Stripe succeeds)
// ============================================
exports.confirmPayment = async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({ message: 'paymentIntentId is required' });
  }

  const client = await pool.connect();

  try {
    // 1. Verify with Stripe (source of truth, no webhook needed)
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (stripeErr) {
      if (stripeErr.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ message: 'Invalid payment' });
      }
      throw stripeErr;
    }

    // 2. The payment must belong to the logged-in user
    if (paymentIntent.metadata.userId !== String(req.user.id)) {
      return res.status(403).json({ message: 'This payment does not belong to you' });
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        message: 'Payment not completed',
        status: paymentIntent.status
      });
    }

    const placeId = paymentIntent.metadata.placeId;
    if (!placeId) {
      return res.status(400).json({ message: 'Invalid payment metadata' });
    }

    await client.query('BEGIN');

    // 3. Lock the place row (prevents double confirm race) + ownership check
    const placeCheck = await client.query(
      `SELECT * FROM halal_places
       WHERE id = $1 AND owner_id = $2
       FOR UPDATE`,
      [placeId, req.user.id]
    );

    if (!placeCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Place not found' });
    }

    const current = placeCheck.rows[0];

    // Already processed (idempotent case)
    if (current.status !== 'pending_payment') {
      await client.query('ROLLBACK');
      return res.json({
        message: 'Payment already confirmed',
        place: { id: current.id, name: current.name, status: current.status }
      });
    }

    // 4. Amount and plan must match what the server snapshotted
    if (
      paymentIntent.amount !== Number(current.plan_price_cents) ||
      String(current.plan_id) !== String(paymentIntent.metadata.planId)
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Payment does not match this listing' });
    }

    // 5. Expiry from the plan duration snapshot
    const durationDays = Number(current.plan_duration) || 90;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    // Customer + saved card (used by the renewal cron)
    const customerId = paymentIntent.customer || null;
    const paymentMethodId = paymentIntent.payment_method || null;

    // 6. Update payment record
    await client.query(
      `UPDATE payments
       SET status = 'succeeded',
           paid_at = NOW(),
           expires_at = $1,
           stripe_customer_id = $2,
           stripe_payment_method_id = $3,
           updated_at = NOW()
       WHERE stripe_payment_intent = $4`,
      [expiresAt, customerId, paymentMethodId, paymentIntentId]
    );

    // 7. Place → pending_admin
    const placeResult = await client.query(
      `UPDATE halal_places
       SET status = 'pending_admin',
           expires_at = $1,
           updated_at = NOW()
       WHERE id = $2 AND status = 'pending_payment'
       RETURNING id, name, status, plan_code, plan_name,
                 plan_price_cents, plan_duration, expires_at`,
      [expiresAt, placeId]
    );

    await client.query('COMMIT');

    console.log(
      `Payment confirmed: place ${placeId} -> pending_admin (until ${expiresAt.toISOString()})`
    );

    res.json({
      message: 'Payment confirmed successfully',
      place: placeResult.rows[0]
    });
  } catch (err) {
    await safeRollback(client);
    console.error('confirmPayment error:', err);
    res.status(500).json({ message: 'Server error', detail: errDetail(err) });
  } finally {
    client.release();
  }
};

// ============================================
// 4. Get payment status for a place
// ============================================
exports.getPaymentStatus = async (req, res) => {
  const { placeId } = req.params;

  try {
    // Verify ownership
    const place = await pool.query(
      'SELECT id FROM halal_places WHERE id = $1 AND owner_id = $2',
      [placeId, req.user.id]
    );

    if (!place.rows.length) {
      return res.status(404).json({ message: 'Place not found' });
    }

    const { rows } = await pool.query(
      `SELECT
        id, amount, currency, status,
        stripe_payment_intent, created_at, updated_at,
        paid_at, expires_at, is_renewal
       FROM payments
       WHERE place_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [placeId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No payment found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('getPaymentStatus error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};