const express = require('express');
const router = express.Router();
const {
  protect,
  requireSuperAdmin
} = require('../middleware/authMiddleware');

// Controllers (এখনো বানানো হয়নি — পরে বানাতে হবে)
const {
  getPendingMasjids,
  getAllMasjids,
  getMasjidDetails,
  approveMasjid,
  rejectMasjid,
  adminAddMasjid,
  getStats
} = require('../controllers/adminController');

// All admin routes require superadmin
router.use(protect, requireSuperAdmin);

// Stats
router.get('/stats', getStats);

// Masjid management
router.get('/masjids', getAllMasjids);
router.get('/masjids/pending', getPendingMasjids);
router.get('/masjids/:id', getMasjidDetails);
router.post('/masjids/:id/approve', approveMasjid);
router.post('/masjids/:id/reject', rejectMasjid);
router.post('/masjids', adminAddMasjid);  // Admin can add masjid directly

module.exports = router;