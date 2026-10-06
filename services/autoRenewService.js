const pool = require('../config/db');
const { stripe } = require('../config/stripe');

// ============================================
// CONFIG
// ============================================
const GRACE_PERIOD_MINUTES = 5;
const CRON_LOG = true;

// ============================================
// Process Auto-Renewals
// Runs every 5 min via cron
//
// Logic:
//   Part A: Renewal  — auto_renew=TRUE + past grace + has card
//   Part B: Expire   — auto_renew=TRUE + past grace + NO card
//   Part C: Expire   — auto_renew=FALSE + past expiry
// ============================================
exports.processAutoRenewals = async () => {
  const startedAt = Date.now();

  if (CRON_LOG) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🔄 AUTO-RENEWAL CRON @', new Date().toISOString());
    console.log(`  Grace period: ${GRACE_PERIOD_MINUTES} min`);
    console.log('═══════════════════════════════════════════════════════');
  }

  const client = await pool.connect();
  let renewed = 0;
  let failed = 0;
  let expired = 0;
  let skipped = 0;

  try {
    // ═══════════════════════════════════════
    // PART A + B: Find places PAST GRACE with auto_renew ON
    // ═══════════════════════════════════════
    const pastGrace = await client.query(`
      SELECT 
        hp.id, hp.name, hp.owner_id,
        hp.plan_id, hp.plan_code, hp.plan_name,
        hp.plan_price_cents, hp.plan_duration,
        hp.expires_at,
        u.email AS owner_email,
        p.id AS last_payment_id,
        p.stripe_customer_id,
        p.stripe_payment_method_id
      FROM halal_places hp
      JOIN users u ON hp.owner_id = u.id
      JOIN LATERAL (
        SELECT id, stripe_customer_id, stripe_payment_method_id
        FROM payments
        WHERE place_id = hp.id
          AND status = 'succeeded'
        ORDER BY id DESC
        LIMIT 1
      ) p ON TRUE
      WHERE hp.status = 'approved'
        AND hp.is_active = TRUE
        AND hp.auto_renew_enabled = TRUE
        AND hp.expires_at IS NOT NULL
        AND hp.expires_at <= NOW() - INTERVAL '${GRACE_PERIOD_MINUTES} minutes'
    `);

    if (CRON_LOG) {
      console.log(`  📋 Found ${pastGrace.rows.length} places past grace with auto_renew ON`);
    }

    const withCard = pastGrace.rows.filter(
      r => r.stripe_customer_id && r.stripe_payment_method_id
    );
    const withoutCard = pastGrace.rows.filter(
      r => !r.stripe_customer_id || !r.stripe_payment_method_id
    );

    if (CRON_LOG) {
      console.log(`  💳 ${withCard.length} with card, ${withoutCard.length} without card`);
    }

    // ═══════════════════════════════════════
    // PART A: RENEW (with card)
    // ═══════════════════════════════════════
    for (const place of withCard) {
      try {
        // Validate plan data
        if (!place.plan_price_cents || !place.plan_duration || !place.plan_id) {
          console.warn(`  ⚠️  Skipping place ${place.id}: missing plan data`);
          skipped++;
          continue;
        }

        // 🔴 Stripe off-session charge
        const intent = await stripe.paymentIntents.create(
          {
            amount: place.plan_price_cents,
            currency: 'usd',
            customer: place.stripe_customer_id,
            payment_method: place.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            metadata: {
              placeId: String(place.id),
              userId: String(place.owner_id),
              planId: String(place.plan_id),
              autoRenew: 'true',
              renewal: 'true'
            }
          },
          {
            idempotencyKey: `renew_${place.id}_${Date.now()}`
          }
        );

        // New expiry = max(now, old_expiry) + duration
        const baseDate = new Date(place.expires_at) > new Date()
          ? new Date(place.expires_at)
          : new Date();
        const newExpiry = new Date(
          baseDate.getTime() + place.plan_duration * 24 * 60 * 60 * 1000
        );

        // DB transaction
        await client.query('BEGIN');

        // New payment row
        await client.query(
          `INSERT INTO payments (
            user_id, place_id, plan_id, plan_code, plan_name,
            amount, currency, status,
            stripe_payment_intent, stripe_customer_id,
            stripe_payment_method_id, is_renewal,
            paid_at, expires_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'succeeded',
                    $8, $9, $10, TRUE, NOW(), $11, NOW(), NOW())`,
          [
            place.owner_id, place.id, place.plan_id,
            place.plan_code, place.plan_name,
            place.plan_price_cents / 100, 'USD',
            intent.id,
            place.stripe_customer_id,
            place.stripe_payment_method_id,
            newExpiry
          ]
        );

        // Extend place
        await client.query(
          `UPDATE halal_places SET
            expires_at = $1,
            renewed_at = NOW(),
            renewal_count = COALESCE(renewal_count, 0) + 1,
            updated_at = NOW()
           WHERE id = $2`,
          [newExpiry, place.id]
        );

        // Log subscription
        await client.query(
          `INSERT INTO subscriptions (
            place_id, plan_id, action, new_plan,
            amount_cents, currency, started_at, expires_at,
            metadata, created_by, created_at
          ) VALUES ($1, $2, 'renewed', $3, $4, 'USD', NOW(), $5, $6, $7, NOW())`,
          [
            place.id, place.plan_id, place.plan_code,
            place.plan_price_cents, newExpiry,
            JSON.stringify({ paymentIntentId: intent.id, autoRenew: true }),
            place.owner_id
          ]
        );

        await client.query('COMMIT');
        renewed++;
        console.log(`  ✅ Renewed: ${place.name} → ${newExpiry.toISOString().split('T')[0]}`);

      } catch (err) {
        await client.query('ROLLBACK');
        failed++;
        console.error(`  ❌ Renewal failed for place ${place.id} (${place.name}):`, err.message);

        // Disable auto-renew on failure
        try {
          await pool.query(
            `UPDATE halal_places SET
              auto_renew_enabled = FALSE,
              auto_renew_cancelled_at = NOW(),
              updated_at = NOW()
             WHERE id = $1`,
            [place.id]
          );

          await pool.query(
            `INSERT INTO subscriptions (
              place_id, plan_id, action, previous_plan,
              metadata, created_by, created_at
            ) VALUES ($1, $2, 'cancelled', $3, $4, $5, NOW())`,
            [
              place.id, place.plan_id, place.plan_code,
              JSON.stringify({ reason: 'renewal_failed', error: err.message }),
              place.owner_id
            ]
          );
        } catch (disableErr) {
          console.error('  ⚠️  Failed to disable auto-renew:', disableErr.message);
        }

        // TODO: Send email to place.owner_email
      }
    }

    // ═══════════════════════════════════════
    // PART B: EXPIRE (auto_renew ON but NO card, past grace)
    // ═══════════════════════════════════════
    for (const place of withoutCard) {
      try {
        await client.query(
          `UPDATE halal_places SET
            status = 'expired',
            is_active = FALSE,
            auto_renew_enabled = FALSE,
            auto_renew_cancelled_at = NOW(),
            updated_at = NOW()
           WHERE id = $1`,
          [place.id]
        );

        await client.query(
          `INSERT INTO subscriptions (
            place_id, plan_id, action, previous_plan,
            metadata, created_by, created_at
          ) VALUES ($1, $2, 'expired', $3, $4, $5, NOW())`,
          [
            place.id, place.plan_id, place.plan_code,
            JSON.stringify({ reason: 'no_saved_card' }),
            place.owner_id
          ]
        ).catch(e => console.warn('  ⚠️  Subscription log failed:', e.message));

        expired++;
        console.log(`  ⏰ Expired (no card): ${place.name}`);
      } catch (err) {
        console.error(`  ❌ Failed to expire ${place.name}:`, err.message);
      }
    }

    // ═══════════════════════════════════════
    // PART C: EXPIRE (auto_renew OFF, past expiry)
    // ═══════════════════════════════════════
    const expiredResult = await client.query(
      `UPDATE halal_places SET
        status = 'expired',
        is_active = FALSE,
        updated_at = NOW()
       WHERE status = 'approved'
         AND is_active = TRUE
         AND auto_renew_enabled = FALSE
         AND expires_at IS NOT NULL
         AND expires_at < NOW()
       RETURNING id, name, plan_id, plan_code, owner_id`
    );

    expired += expiredResult.rows.length;

    for (const p of expiredResult.rows) {
      await client.query(
        `INSERT INTO subscriptions (
          place_id, plan_id, action, previous_plan, created_by, created_at
        ) VALUES ($1, $2, 'expired', $3, $4, NOW())`,
        [p.id, p.plan_id, p.plan_code, p.owner_id]
      ).catch(e => console.warn('  ⚠️  Subscription log failed:', e.message));

      console.log(`  ⏰ Expired: ${p.name}`);
    }

    // ═══════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════
    const duration = Date.now() - startedAt;

    if (CRON_LOG) {
      console.log('');
      console.log(`  📊 Summary: ${renewed} renewed, ${failed} failed, ${expired} expired, ${skipped} skipped`);
      console.log(`  ⏱  Took ${duration}ms`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('');
    }

    return { renewed, failed, expired, skipped, duration };

  } catch (err) {
    console.error('❌ Auto-renewal error:', err);
    throw err;
  } finally {
    client.release();
  }
};