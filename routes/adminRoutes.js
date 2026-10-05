const express = require('express');
const router = express.Router();
const {
  protect,
  requireSuperAdmin
} = require('../middleware/authMiddleware');

// Controllers
const {
  // Masjid management
  getStats,
  getPendingMasjids,
  getAllMasjids,
  getMasjidDetails,
  approveMasjid,
  rejectMasjid,
  adminAddMasjid,

  // Halal Places management
  getPendingHalalPlaces,
  approveHalalPlace,
  rejectHalalPlace,
  getAllHalalPlaces,

  // Subscription management
  adminUpdateSubscription,
  adminGetUserSubscription
} = require('../controllers/adminController');

const {
  // Plans management
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  restorePlan,
  getPlanStats
} = require('../controllers/planController');

// All admin routes require superadmin
router.use(protect, requireSuperAdmin);

// ============================================
// Dashboard
// ============================================
router.get('/stats', getStats);

// ============================================
// Plans Management
// ============================================
router.get('/plans', getAllPlans);
router.get('/plans/:id', getPlanById);
router.post('/plans', createPlan);
router.put('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);
router.post('/plans/:id/restore', restorePlan);
router.get('/plans/:id/stats', getPlanStats);

// ============================================
// Masjid Management
// ============================================
router.get('/masjids', getAllMasjids);
router.get('/masjids/pending', getPendingMasjids);
router.get('/masjids/:id', getMasjidDetails);
router.post('/masjids/:id/approve', approveMasjid);
router.post('/masjids/:id/reject', rejectMasjid);
router.post('/masjids', adminAddMasjid);

// ============================================
// Halal Places Management
// ============================================
router.get('/halal-places', getAllHalalPlaces);
router.get('/halal-places/pending', getPendingHalalPlaces);
router.post('/halal-places/:id/approve', approveHalalPlace);
router.post('/halal-places/:id/reject', rejectHalalPlace);

// ============================================
// Subscription Management
// ============================================
router.get('/halal-places/:placeId/subscription', adminGetUserSubscription);
router.patch('/halal-places/:placeId/subscription', adminUpdateSubscription);

module.exports = router;