const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  submitHalalPlace,
  getMyHalalPlaces,
  getMyPlaceDetails,
  getPublicHalalPlaces
} = require('../controllers/halalPlaceController');
const { getActivePlans } = require('../controllers/planController');

// Public
router.get('/plans', getActivePlans);
router.get('/public/halal-places', getPublicHalalPlaces);

// User protected
router.post('/halal-places', protect, requireRole('user'), submitHalalPlace);
router.get('/halal-places/my', protect, requireRole('user'), getMyHalalPlaces);
router.get('/halal-places/my/:id', protect, requireRole('user'), getMyPlaceDetails);

module.exports = router;