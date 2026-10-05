const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  changePlan,
  toggleAutoRenew,
  getSubscriptionHistory,
  getSubscriptionSummary,
  runRenewalsManually               // 👈 NEW
} = require('../controllers/subscriptionController');

// All user-protected
router.use(protect, requireRole('user'));

// Summary
router.get('/:placeId/summary', getSubscriptionSummary);

// Change plan
router.post('/:placeId/change-plan', changePlan);

// Auto-renew toggle (ON → card save, OFF → card delete)
router.patch('/:placeId/auto-renew', toggleAutoRenew);

// History
router.get('/:placeId/history', getSubscriptionHistory);

// ═══════════════════════════════════════════
// Manual trigger for cron (testing — admin only in production)
// ═══════════════════════════════════════════
router.post('/run-renewals', runRenewalsManually);   // 👈 NEW

module.exports = router;