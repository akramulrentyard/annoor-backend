const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  getPublishableKey,
  createPaymentIntent,
  confirmPayment,
  getPaymentStatus
} = require('../controllers/paymentController');

// Public
router.get('/publishable-key', getPublishableKey);

// User protected
router.post('/create-intent', protect, requireRole('user'), createPaymentIntent);
router.post('/confirm', protect, requireRole('user'), confirmPayment);
router.get('/status/:placeId', protect, requireRole('user'), getPaymentStatus);

module.exports = router;