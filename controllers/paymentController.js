const pool = require('../config/db');
const { stripe } = require('../config/stripe');

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
  const { placeId } = req.body;

  if (!placeId) {
    return res.status(400).json({ message: 'placeId is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get place details
    const placeResult = await client.query(
      `SELECT 
        id, name, owner_id,
        plan_id, plan_code, plan_name, plan_price_cents, plan_duration,
        status
       FROM halal_places
       WHERE id = $1 AND owner_id = $2`,
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
        message: `Cannot pay: place status is '${place.status}'` 
      });
    }

    if (!place.plan_price_cents || place.plan_price_cents < 50) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid plan price' });
    }

    // Check if payment already exists (pending)
    const existingPayment = await client.query(
      `SELECT id, client_secret, stripe_payment_intent
       FROM payments
       WHERE place_id = $1 AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
      [place.id]
    );

    let paymentIntent;

    if (existingPayment.rows.length && existingPayment.rows[0].client_secret) {
      // Reuse existing intent
      paymentIntent = {
        id: existingPayment.rows[0].stripe_payment_intent,
        client_secret: existingPayment.rows[0].client_secret
      };
      console.log('♻️  Reusing existing payment intent');
    } else {
      // Create new
      paymentIntent = await stripe.paymentIntents.create({
        amount: place.plan_price_cents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          placeId: place.id.toString(),
          userId: req.user.id.toString(),
          planId: place.plan_id?.toString() || '',
          planCode: place.plan_code || ''
        },
        description: `${place.plan_name} - ${place.name}`
      });

      // Save
      await client.query(
        `INSERT INTO payments (
          user_id, place_id, plan_id, plan_code, plan_name,
          amount, currency, status,
          stripe_payment_intent, client_secret,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, 'pending',
          $8, $9,
          NOW(), NOW()
        )`,
        [
          req.user.id, place.id, place.plan_id, place.plan_code, place.plan_name,
          place.plan_price_cents / 100, 'USD',
          paymentIntent.id, paymentIntent.client_secret
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'PaymentIntent ready',
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: place.plan_price_cents,
      currency: 'USD',
      place: {
        id: place.id,
        name: place.name,
        plan: {
          code: place.plan_code,
          name: place.plan_name,
          price: place.plan_price_cents,
          duration: place.plan_duration
        }
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createPaymentIntent error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
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
    // Verify with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

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

    // Update payment
    await client.query(
      `UPDATE payments 
       SET status = 'succeeded', updated_at = NOW()
       WHERE stripe_payment_intent = $1`,
      [paymentIntentId]
    );

    // Update place
    const placeResult = await client.query(
      `UPDATE halal_places 
       SET status = 'pending_admin', updated_at = NOW()
       WHERE id = $1 AND status = 'pending_payment'
       RETURNING id, name, status, plan_code, plan_name, plan_price_cents, plan_duration`,
      [placeId]
    );

    await client.query('COMMIT');

    if (!placeResult.rows.length) {
      const existing = await pool.query(
        'SELECT id, name, status FROM halal_places WHERE id = $1',
        [placeId]
      );
      return res.json({
        message: 'Payment already confirmed',
        place: existing.rows[0] || null
      });
    }

    const place = placeResult.rows[0];
    console.log(`✅ Payment confirmed: place ${placeId} → pending_admin`);

    res.json({
      message: 'Payment confirmed successfully',
      place
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('confirmPayment error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
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
        stripe_payment_intent, created_at, updated_at
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