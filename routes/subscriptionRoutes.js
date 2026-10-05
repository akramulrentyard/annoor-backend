const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  changePlan,
  toggleAutoRenew,
  getSubscriptionHistory,
  getSubscriptionSummary
} = require('../controllers/subscriptionController');

// All user-protected
router.use(protect, requireRole('user'));

// Summary
router.get('/:placeId/summary', getSubscriptionSummary);

// Change plan
router.post('/:placeId/change-plan', changePlan);

// Auto-renew toggle
router.patch('/:placeId/auto-renew', toggleAutoRenew);

// History
router.get('/:placeId/history', getSubscriptionHistory);

module.exports = router;