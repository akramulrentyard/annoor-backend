const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ============================================
// protect — JWT verify + user must still exist
// Sets req.user = { id, role, iat, exp }
// role is taken from the DB (not the token), so role changes
// and deleted accounts take effect immediately.
// ============================================
exports.protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  let decoded;
  try {
    const token = auth.split(' ')[1];
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1', [decoded.id]);

    if (!rows.length) {
      return res.status(401).json({ message: 'Account no longer exists' });
    }

    req.user = { ...decoded, id: rows[0].id, role: rows[0].role };
    next();
  } catch (err) {
    console.error('protect error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// requireRole — Check user's role
// ============================================
exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
};

// ============================================
// requireSuperAdmin — Only superadmin
// ============================================
exports.requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
};

// ============================================
// requireApprovedMasjid — Only approved masjid
// (replaces requireVerifiedMasjid)
// ============================================
exports.requireApprovedMasjid = async (req, res, next) => {
  try {
    if (req.user.role !== 'masjid') {
      return res.status(403).json({ message: 'Not a masjid account' });
    }

    const { rows } = await pool.query(
      `SELECT verification_status, is_verified
       FROM masjid_profiles
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Masjid profile not found' });
    }

    const { verification_status, is_verified } = rows[0];

    if (verification_status !== 'approved' || !is_verified) {
      return res.status(403).json({
        message: 'Masjid account pending approval by super admin',
        status: verification_status
      });
    }

    next();
  } catch (err) {
    console.error('requireApprovedMasjid error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// requireVerifiedMasjid — Legacy (keep for backward compatibility)
// ============================================
exports.requireVerifiedMasjid = exports.requireApprovedMasjid;