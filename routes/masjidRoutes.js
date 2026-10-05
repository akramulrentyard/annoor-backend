const express = require('express');
const router = express.Router();
const {
  protect,
  requireRole
} = require('../middleware/authMiddleware');

// Controllers (এখনো বানানো হয়নি — পরে বানাতে হবে)
const {
  getVerificationStatus,
  getMyProfile,
  updateMyProfile
} = require('../controllers/masjidController');

// All masjid routes require masjid role
router.use(protect, requireRole('masjid'));

// Verification status
router.get('/verification-status', getVerificationStatus);

// Profile
router.get('/profile', getMyProfile);
router.put('/profile', updateMyProfile);

module.exports = router;