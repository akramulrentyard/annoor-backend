const express = require('express');
const router = express.Router();

const {
  sendUserOtp,
  verifyUserOtp,
  resendOtp,
  sendMasjidOtp,
  verifyMasjidOtp,
  registerMasjid,
  login,
  loginSendOtp,
  loginVerifyOtp
} = require('../controllers/authController');

// ============================================
// Registration Routes
// ============================================
router.post('/send-otp', sendUserOtp);
router.post('/verify-otp', verifyUserOtp);
router.post('/resend-otp', resendOtp);
router.post('/masjid/send-otp', sendMasjidOtp);
router.post('/masjid/verify-otp', verifyMasjidOtp);
router.post('/register/masjid', registerMasjid);

// ============================================
// Login Routes
// ============================================
router.post('/login', login);
router.post('/login/send-otp', loginSendOtp);        
router.post('/login/verify-otp', loginVerifyOtp);    

module.exports = router;