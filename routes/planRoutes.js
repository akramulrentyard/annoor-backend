const express = require('express');
const router = express.Router();
const { getActivePlans } = require('../controllers/planController');

// Public endpoint — no auth required
router.get('/plans', getActivePlans);

module.exports = router;