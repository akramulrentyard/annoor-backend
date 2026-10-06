const pool = require('../config/db');
const { stripe } = require('../config/stripe');

const isProd = process.env.NODE_ENV === 'production';

class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ============================================
// CONFIG: what happens to the user's data
// ============================================

// Rows DELETED together with the user (halal place subscription is part of
// halal_places + payments). Table/column names are constants, never user input.
const DELETE_WITH_USER = [
  { table: 'payments', column: 'user_id' },
  { table: 'halal_places', column: 'owner_id' }
  // add more here, e.g. { table: 'saved_events', column: 'user_id' }
];

// Rows KEPT (mosques the user added). They are only detached from the user.
// The column MUST be nullable. Fill this in after running the FK query.
const KEEP_BUT_DETACH = [
  // { table: 'masjids', column: 'added_by' }
];

// ============================================
// Delete one user account (single transaction)
// ============================================
async function deleteUserAccount(userId) {
  const client = await pool.connect();
  let stripeCustomerId = null;
  const summary = {};

  try {
    await client.query('BEGIN');

    const u = await client.query(
      'SELECT id, email, role, stripe_customer_id FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!u.rows.length) {
      throw new AccountError(404, 'User not found');
    }

    const user = u.rows[0];

    // Only general user accounts. Superadmin and mosque accounts are never removed here.
    if (user.role !== 'user') {
      throw new AccountError(403, 'Only general user accounts can be deleted');
    }

    stripeCustomerId = user.stripe_customer_id;

    // Payments of the user's places first (payments reference places)
    await client.query(
      `DELETE FROM payments
       WHERE place_id IN (SELECT id FROM halal_places WHERE owner_id = $1)`,
      [userId]
    );

    for (const { table, column } of DELETE_WITH_USER) {
      const r = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
      summary[table] = r.rowCount;
    }

    // Mosques are kept, only detached from the deleted user
    for (const { table, column } of KEEP_BUT_DETACH) {
      const r = await client.query(
        `UPDATE ${table} SET ${column} = NULL WHERE ${column} = $1`,
        [userId]
      );
      summary[`${table}_kept`] = r.rowCount;
    }

    await client.query('DELETE FROM otp_codes WHERE email = $1', [user.email]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }

    if (err instanceof AccountError) throw err;

    // Foreign key violation: a table links to this user but is not listed above.
    // Nothing was deleted (rolled back).
    if (err.code === '23503') {
      console.error('deleteUserAccount FK block:', err.table, err.constraint, err.detail);
      throw new AccountError(
        409,
        isProd
          ? 'Account has linked data that cannot be removed yet'
          : `Linked data blocks deletion: ${err.detail || err.message}`
      );
    }

    throw err;
  } finally {
    client.release();
  }

  // After commit: remove the saved card/customer at Stripe (best effort)
  if (stripeCustomerId) {
    try {
      await stripe.customers.del(stripeCustomerId);
    } catch (e) {
      console.error('Stripe customer delete failed:', stripeCustomerId, e.message);
    }
  }

  return summary;
}

module.exports = { deleteUserAccount, AccountError };