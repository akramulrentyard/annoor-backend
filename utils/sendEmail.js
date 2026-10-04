const nodemailer = require('nodemailer');

// ============================================
// SMTP Transporter
// ============================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ============================================
// Send OTP Email
// - Sends real email via SMTP
// - Prints plain OTP to terminal in one line
// ============================================
exports.sendOtpEmail = async (to, otpCode) => {
  try {
    await transporter.sendMail({
      from: `"Annoor" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject: 'Your Annoor Verification Code',
      text: `Your Annoor verification code is: ${otpCode}\n\nValid for 5 minutes. Do not share it with anyone.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px;">
          <h2 style="color: #16a34a; margin: 0 0 16px;">Annoor Verification</h2>
          <p style="color: #374151;">Your verification code:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                      background: #f0fdf4; color: #16a34a;
                      padding: 20px; text-align: center; border-radius: 12px;
                      margin: 20px 0;">
            ${otpCode}
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            This code is valid for 5 minutes. Do not share it with anyone.
          </p>
        </div>
      `
    });

    //  Terminal-এ শুধু এই এক লাইন
    console.log(`OTP sent to email: ${to}  OTP: ${otpCode}`);

  } catch (err) {
    console.error(`Failed to send OTP: ${err.message}`);
  }
};