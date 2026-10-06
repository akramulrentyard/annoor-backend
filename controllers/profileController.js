const pool = require('../config/db');
const otpService = require('../services/otpService');
const { sendOtpEmail } = require('../utils/sendEmail');
const { deleteUserAccount, AccountError } = require('../services/accountService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (v) => String(v || '').trim().toLowerCase();

// ============================================
// 1. Get my profile  (My Profile screen)
// ============================================
exports.getProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 2. Update name  (Save Changes button)
// ============================================
exports.updateName = async (req, res) => {
  const name = String(req.body.name || '').trim();

  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ message: 'Name must be between 2 and 60 characters' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role',
      [name, req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Name updated successfully', user: rows[0] });
  } catch (err) {
    console.error('updateName error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 3. Change email, step 1: send OTP to the OLD (current) email.
//    The OTP is stored in DB against the old email, together with the
//    requested new email.
//    (Change Email button -> Verify Email popup)
// ============================================
exports.sendEmailChangeOtp = async (req, res) => {
  const newEmail = normalizeEmail(req.body.newEmail);

  try {
    if (!EMAIL_RE.test(newEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const me = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (!me.rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (me.rows[0].email.toLowerCase() === newEmail) {
      return res.status(400).json({ message: 'This is already your current email' });
    }

    const taken = await pool.query(
      'SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2',
      [newEmail, req.user.id]
    );
    if (taken.rows.length) {
      return res.status(400).json({ message: 'This email is already in use' });
    }

    const oldEmail = me.rows[0].email;

    // OTP is saved against the OLD email; payload remembers the requested new email
    const code = await otpService.saveOtp(oldEmail, 'email_change', {
      userId: req.user.id,
      newEmail
    });
    await sendOtpEmail(oldEmail, code);

    res.json({
      message: 'Verification code sent to your current email',
      sentTo: oldEmail,
      newEmail,
      expiresInSeconds: 300
    });
  } catch (err) {
    console.error('sendEmailChangeOtp error:', err);
    res.status(500).json({ message: 'Failed to send verification code' });
  }
};

// ============================================
// 4. Change email, step 2: verify OTP, then update
//    (Verify Email button)
// ============================================
exports.verifyEmailChangeOtp = async (req, res) => {
  const newEmail = normalizeEmail(req.body.newEmail);
  const otp = String(req.body.otp || '').trim();

  const MISMATCH = 'New email or OTP did not match';

  try {
    if (!newEmail || !otp) {
      return res.status(400).json({ message: MISMATCH });
    }

    // Old email always comes from the DB, never from the client
    const me = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (!me.rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    const oldEmail = me.rows[0].email;

    // Check the pending request first, so a typo in newEmail does not burn the OTP
    const pending = await pool.query(
      `SELECT payload FROM otp_codes
       WHERE email = $1 AND purpose = 'email_change' AND is_used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [oldEmail]
    );
    let requested = pending.rows[0]?.payload;
    if (typeof requested === 'string') {
      try {
        requested = JSON.parse(requested);
      } catch (_) {
        requested = null;
      }
    }
    if (
      !requested ||
      Number(requested.userId) !== Number(req.user.id) ||
      requested.newEmail !== newEmail
    ) {
      return res.status(400).json({ message: MISMATCH });
    }

    // Cross-verification: OTP (sent to old email) + the same new email
    const verify = await otpService.verifyOtp(oldEmail, otp, 'email_change');
    if (!verify.ok) {
      return res.status(400).json({ message: MISMATCH, hint: verify.message });
    }

    const taken = await pool.query(
      'SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2',
      [newEmail, req.user.id]
    );
    if (taken.rows.length) {
      return res.status(400).json({ message: 'This email is already in use' });
    }

    const { rows } = await pool.query(
      'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, role',
      [newEmail, req.user.id]
    );

    res.json({ message: 'Email updated successfully', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ message: 'This email is already in use' });
    }
    console.error('verifyEmailChangeOtp error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// 5. Delete my account, step 1: send OTP to my current email
//    (Privacy -> Delete Account -> "Yes, delete my account")
// ============================================
exports.sendDeleteOtp = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const email = rows[0].email;

    const code = await otpService.saveOtp(email, 'account_deletion', {
      userId: req.user.id
    });
    await sendOtpEmail(email, code);

    res.json({
      message: 'Verification code sent to your email',
      email,
      expiresInSeconds: 300
    });
  } catch (err) {
    console.error('sendDeleteOtp error:', err);
    res.status(500).json({ message: 'Failed to send verification code' });
  }
};

// ============================================
// 6. Delete my account, step 2: verify OTP, then delete
// ============================================
exports.confirmDelete = async (req, res) => {
  const otp = String(req.body.otp || '').trim();

  try {
    if (!otp) {
      return res.status(400).json({ message: 'OTP is required' });
    }

    // Email comes from the DB, never from the client
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verify = await otpService.verifyOtp(rows[0].email, otp, 'account_deletion');
    if (!verify.ok || Number(verify.payload?.userId) !== Number(req.user.id)) {
      return res.status(400).json({ message: verify.ok ? 'Invalid OTP' : verify.message });
    }

    await deleteUserAccount(req.user.id);

    res.json({ message: 'Your account has been deleted' });
  } catch (err) {
    if (err instanceof AccountError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('confirmDelete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};