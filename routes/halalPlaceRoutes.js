const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const { uploadPlacePhotosR2 } = require('../middleware/uploadR2');
const halalPlaceController = require('../controllers/halalPlaceController');
const photoController = require('../controllers/photoController');

// ═══════════════════════════════════════════
// Public
// ═══════════════════════════════════════════
router.get(
  '/halal-places/public',
  halalPlaceController.getPublicHalalPlaces
);

// ═══════════════════════════════════════════
// User (auth required)
// ═══════════════════════════════════════════
router.post(
  '/halal-places',
  protect,
  requireRole('user'),
  halalPlaceController.submitHalalPlace
);

router.get(
  '/halal-places',
  protect,
  halalPlaceController.getMyHalalPlaces
);

router.get(
  '/halal-places/:placeId',
  protect,
  halalPlaceController.getMyPlaceDetails
);

// ═══════════════════════════════════════════
// Photo routes (R2)
// ═══════════════════════════════════════════
router.post(
  '/halal-places/:placeId/photos',
  protect,
  requireRole('user'),
  uploadPlacePhotosR2,
  photoController.uploadPlacePhotos
);

router.get(
  '/halal-places/:placeId/photos',
  protect,
  photoController.listPlacePhotos
);

router.delete(
  '/halal-places/:placeId/photos',
  protect,
  photoController.deletePlacePhoto
);

module.exports = router;
