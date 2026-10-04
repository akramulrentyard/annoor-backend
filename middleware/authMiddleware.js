const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// protect — JWT যাচাই করে req.user সেট করে
exports.protect = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// requireRole — নির্দিষ্ট role আছে কিনা
exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
};

// requireVerifiedMasjid — শুধু verified masjid
exports.requireVerifiedMasjid = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT is_verified FROM masjid_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (!rows.length || !rows[0].is_verified) {
      return res.status(403).json({ message: 'Masjid account pending verification' });
    }
    next();
  } catch (err) {
    console.error('requireVerifiedMasjid error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};