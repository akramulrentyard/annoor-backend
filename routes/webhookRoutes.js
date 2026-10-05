const express = require('express');
const router = express.Router();
const { verifyPayment } = require('../controllers/webhookController');

// Verify payment endpoint
router.get('/verify-payment', verifyPayment);

module.exports = router;