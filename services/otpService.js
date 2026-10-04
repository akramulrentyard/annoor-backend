const pool = require('../config/db');

// 6 Digit OTP
exports.generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// OTP save in DB
exports.saveOtp = async (email, purpose, payload = {}) => {
  const code = exports.generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Clear unused OTP 
  await pool.query(
    'DELETE FROM otp_codes WHERE email = $1 AND purpose = $2 AND is_used = FALSE',
    [email, purpose]
  );

  await pool.query(
    `INSERT INTO otp_codes (email, otp_code, purpose, payload, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, code, purpose, payload, expiresAt]
  );

  return code;
};

// OTP Verify
exports.verifyOtp = async (email, code, purpose) => {
  const result = await pool.query(
    `SELECT * FROM otp_codes
     WHERE email = $1 AND purpose = $2 AND is_used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [email, purpose]
  );

  if (!result.rows.length) {
    return { ok: false, message: 'Not found  OTP | Send Again' };
  }

  const otp = result.rows[0];

  if (new Date(otp.expires_at) < new Date()) {
    return { ok: false, message: 'OTP-Timeout। Send Again' };
  }

  if (otp.otp_code !== code) {
    return { ok: false, message: 'Wrong OTP' };
  }

  // Already used
  await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otp.id]);

  return { ok: true, payload: otp.payload };
};