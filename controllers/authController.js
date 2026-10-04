const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const generateToken = require('../utils/generateToken');
const { sendOtpEmail } = require('../utils/sendEmail');
const otpService = require('../services/otpService');

// ============================================
// 1. Send OTP — User Registration
// ============================================
exports.sendUserOtp = async (req, res) => {
  const { name, email, agreedToTerms } = req.body;

  try {
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    if (!agreedToTerms) {
      return res.status(400).json({ message: 'You must agree to the terms' });
    }

    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(400).json({ message: 'An account already exists with this email. Please login.' });
    }

    const otpCode = await otpService.saveOtp(email, 'user_registration', { name, email });
    await sendOtpEmail(email, otpCode);

    res.json({
      message: 'OTP sent successfully',
      email,
      expiresInSeconds: 300
    });
  } catch (err) {
    console.error('sendUserOtp error:', err);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

// ============================================
// 2. Verify OTP — Create User
// ============================================
exports.verifyUserOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const verify = await otpService.verifyOtp(email, otp, 'user_registration');
    if (!verify.ok) {
      return res.status(400).json({ message: verify.message });
    }

    const { name } = verify.payload;

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, name, email, role`,
      [name, email, 'OTP_AUTH_NO_PASSWORD']
    );

    const user = result.rows[0];

    res.status(201).json({
      ...user,
      token: generateToken(user.id, user.role)
    });
  } catch (err) {
    console.error('verifyUserOtp error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 3. Resend OTP
// ============================================
exports.resendOtp = async (req, res) => {
  const { email, purpose = 'user_registration' } = req.body;

  try {
    const verify = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1',
      [email, purpose]
    );

    if (!verify.rows.length) {
      return res.status(400).json({ message: 'No pending registration found' });
    }

    const newCode = await otpService.saveOtp(email, purpose, verify.rows[0].payload);
    await sendOtpEmail(email, newCode);

    res.json({ message: 'New OTP sent successfully' });
  } catch (err) {
    console.error('resendOtp error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 4. Send OTP — Masjid Registration
// ============================================
exports.sendMasjidOtp = async (req, res) => {
  const { name, email, address, contactPerson, agreedToTerms } = req.body;

  try {
    if (!name || !email) {
      return res.status(400).json({ message: 'Masjid name and email are required' });
    }

    if (!address || !contactPerson) {
      return res.status(400).json({ message: 'Address and contact person are required' });
    }

    if (!agreedToTerms) {
      return res.status(400).json({ message: 'You must agree to the terms' });
    }

    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(400).json({ message: 'This email is already registered. Please login.' });
    }

    const otpCode = await otpService.saveOtp(email, 'masjid_registration', {
      name,
      email,
      address,
      contactPerson
    });

    await sendOtpEmail(email, otpCode);

    res.json({
      message: 'OTP sent successfully',
      email,
      expiresInSeconds: 300
    });
  } catch (err) {
    console.error('sendMasjidOtp error:', err);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

// ============================================
// 5. Verify OTP — Create Masjid
// ============================================
exports.verifyMasjidOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const verify = await otpService.verifyOtp(email, otp, 'masjid_registration');
    if (!verify.ok) {
      return res.status(400).json({ message: verify.message });
    }

    const { name, address, contactPerson } = verify.payload;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'masjid')
         RETURNING id, name, email, role`,
        [name, email, 'OTP_AUTH_NO_PASSWORD']
      );
      const user = userResult.rows[0];

      await client.query(
        `INSERT INTO masjid_profiles (user_id, address, contact_person)
         VALUES ($1, $2, $3)`,
        [user.id, address, contactPerson]
      );

      await client.query('COMMIT');

      res.status(201).json({
        ...user,
        token: generateToken(user.id, user.role)
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('verifyMasjidOtp error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 6. Register — Masjid (Legacy password-based, optional)
// ============================================
exports.registerMasjid = async (req, res) => {
  const { name, email, password, address, contactPerson } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const exists = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'masjid')
       RETURNING id, name, email, role`,
      [name, email, hash]
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO masjid_profiles (user_id, address, contact_person)
       VALUES ($1, $2, $3)`,
      [user.id, address || null, contactPerson || null]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ...user,
      token: generateToken(user.id, user.role)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('registerMasjid error:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};

// ============================================
// 7. Login
// ============================================
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!result.rows.length) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id, user.role)
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
// ============================================
// 8. Login — Send OTP
// ============================================
exports.loginSendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE email = $1',
      [email]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    const user = result.rows[0];

    const otpCode = await otpService.saveOtp(email, 'login', {
      userId: user.id,
      role: user.role
    });

    await sendOtpEmail(email, otpCode);

    res.json({
      message: 'Login OTP sent successfully',
      email,
      role: user.role,
      expiresInSeconds: 300
    });
  } catch (err) {
    console.error('loginSendOtp error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 9. Login — Verify OTP
// ============================================
exports.loginVerifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const verify = await otpService.verifyOtp(email, otp, 'login');
    if (!verify.ok) {
      return res.status(400).json({ message: verify.message });
    }

    const { userId } = verify.payload;

    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id, user.role)
    });
  } catch (err) {
    console.error('loginVerifyOtp error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};