const pool = require('../config/db');
const { stripe } = require('../config/stripe');

// ============================================
// Verify Payment — Called from success page
// ============================================
exports.verifyPayment = async (req, res) => {
  const { session_id, place_id } = req.query;

  if (!session_id || !place_id) {
    return res.status(400).json({ 
      message: 'Missing session_id or place_id' 
    });
  }

  try {
    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    console.log('Payment status:', session.payment_status);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        message: 'Payment not completed',
        status: session.payment_status
      });
    }

    // Update payment
    await pool.query(
      `UPDATE payments 
       SET status = 'succeeded', 
           stripe_payment_intent = $1
       WHERE stripe_session_id = $2`,
      [session.payment_intent, session_id]
    );

    // Update place → pending_admin
    const placeResult = await pool.query(
      `UPDATE halal_places 
       SET status = 'pending_admin', 
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending_payment'
       RETURNING id, name, status, plan_code, plan_name, plan_price_cents, plan_duration`,
      [place_id]
    );

    if (!placeResult.rows.length) {
      const existing = await pool.query(
        'SELECT id, name, status FROM halal_places WHERE id = $1',
        [place_id]
      );
      
      return res.json({
        message: 'Payment already processed',
        place: existing.rows[0] || null
      });
    }

    const place = placeResult.rows[0];
    console.log(`✅ Place ${place_id} → pending_admin`);

    res.json({
      message: 'Payment verified successfully',
      place
    });

  } catch (err) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};