require('dotenv').config();
const pool = require('../config/db');

const DEFAULT_PLANS = [
  {
    code: 'basic',
    name: 'Basic Listing',
    description: 'Get your business listed',
    priceCents: 999,
    duration: 30,
    features: ['Basic visibility', '30 days listing'],
    isFeatured: false,
    sortOrder: 1
  },
  {
    code: 'premium',
    name: 'Premium Listing',
    description: 'Stand out with premium features',
    priceCents: 2999,
    duration: 90,
    features: ['Top of search', '90 days', 'Featured badge'],
    isFeatured: false,
    sortOrder: 2
  },
  {
    code: 'featured',
    name: 'Featured Listing',
    description: 'Maximum visibility',
    priceCents: 5999,
    duration: 365,
    features: ['Homepage feature', '1 year', 'Priority support'],
    isFeatured: true,
    sortOrder: 3
  }
];

(async () => {
  try {
    for (const plan of DEFAULT_PLANS) {
      await pool.query(
        `INSERT INTO plans (
          code, name, description, price_cents, currency, duration,
          features, is_featured, sort_order,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'USD', $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (code) DO NOTHING`,
        [
          plan.code, plan.name, plan.description,
          plan.priceCents, plan.duration,
          JSON.stringify(plan.features),
          plan.isFeatured, plan.sortOrder
        ]
      );
    }
    console.log('✅ Default plans seeded');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
})();