const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  getProfile,
  updateName,
  sendEmailChangeOtp,
  verifyEmailChangeOtp,
  sendDeleteOtp,
  confirmDelete
} = require('../controllers/profileController');

// Limits are per logged-in user (these routes always run after protect)
const sendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { message: 'Too many requests. Try again later.' }
});

const verifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { message: 'Too many attempts. Try again later.' }
});

// General users only
router.use(protect, requireRole('user'));

router.get('/', getProfile);
router.patch('/name', updateName);

// Change email
router.post('/email/send-otp', sendLimiter, sendEmailChangeOtp);
router.post('/email/verify-otp', verifyLimiter, verifyEmailChangeOtp);

// Delete my account
router.post('/delete/send-otp', sendLimiter, sendDeleteOtp);
router.post('/delete/confirm', verifyLimiter, confirmDelete);

module.exports = router;