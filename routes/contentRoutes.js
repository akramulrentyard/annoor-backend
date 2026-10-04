const express = require('express');
const router = express.Router();
const {
  protect,
  requireRole,
  requireVerifiedMasjid
} = require('../middleware/authMiddleware');

// Public
router.get('/public/prayer-times', (req, res) => {
  res.json({ message: 'Public prayer times' });
});

// Any logged-in user
router.get('/prayer-times', protect, (req, res) => {
  res.json({ message: 'Prayer times for logged-in user' });
});

// Only general users
router.get('/bookmarks', protect, requireRole('user'), (req, res) => {
  res.json({ message: 'Your personal bookmarks' });
});

// Only masjid accounts
router.post('/events', protect, requireRole('masjid'), (req, res) => {
  res.json({ message: 'Event created by masjid' });
});

// Only VERIFIED masjid accounts
router.post(
  '/events/publish',
  protect,
  requireRole('masjid'),
  requireVerifiedMasjid,
  (req, res) => {
    res.json({ message: 'Event published publicly' });
  }
);

module.exports = router;