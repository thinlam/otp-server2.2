import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import cors from 'cors';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ============================
   Firebase Admin init
   ============================ */
if (!process.env.SERVICE_ACCOUNT_KEY) {
  throw new Error('Missing SERVICE_ACCOUNT_KEY in .env');
}
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

// Fix xuống dòng private_key nếu lưu trong .env có \\n
if (serviceAccount.private_key?.includes('\\n')) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/* ============================
   Email (Math Master ONLY)
   ============================ */
function createTransporter() {
  const user = process.env.EMAIL_USER2 || process.env.EMAIL_USER; // fallback nếu bạn chỉ set 1 biến
  const pass = process.env.EMAIL_PASS2 || process.env.EMAIL_PASS;
  if (!user || !pass) throw new Error('Missing EMAIL_USER2/EMAIL_PASS2 (or fallback EMAIL_USER/EMAIL_PASS)');
  return {
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    }),
    fromName: `Math Master <${user}>`,
    user,
  };
}

/* ============================
   Utils
   ============================ */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ============================
   Health check
   ============================ */
app.get('/health', (_, res) => {
  res.json({ ok: true, app: 'otp-server-mathmaster', now: Date.now() });
});

/* ============================
   API: Gửi OTP (Math Master)
   body: { email: string }
   ============================ */
app.post('/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, message: 'Missing email' });

  const otp = generateOTP();

  try {
    const { transporter, fromName, user } = createTransporter();

    const mailOptions = {
      from: fromName,
      to: email,
      subject: 'Mã xác thực OTP của bạn',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <h2 style="color: #6C63FF;">🔐 Xác minh tài khoản Math Master</h2>
          <p>Chào bạn,</p>
          <p>Bạn vừa yêu cầu mã OTP để xác thực tài khoản.</p>
          <p style="margin: 20px 0; font-size: 18px;">
            Mã xác thực của bạn là:
            <br/>
            <span style="display: inline-block; margin-top: 10px; padding: 12px 24px; background-color: #f4f4f4; border-radius: 8px; font-size: 26px; font-weight: bold; color: #6C63FF;">
              ${otp}
            </span>
          </p>
          <p>Không chia sẻ mã này với bất kỳ ai.</p>
          <hr style="margin: 30px 0;" />
          <p style="font-size: 14px; color: #999;">
            Trân trọng,<br/>Đội ngũ Math Master
          </p>
        </div>
      `,
    };

    console.log(`✅ Gửi OTP đến ${email} bằng ${user}`);
    await transporter.sendMail(mailOptions);

    // ⚠️ KHÔNG trả OTP về client khi production
    const payload = { success: true, message: 'Đã gửi OTP' };
    if (process.env.NODE_ENV !== 'production') {
      payload.otp = otp;
    }
    return res.json(payload);
  } catch (err) {
    console.error('❌ Lỗi gửi OTP:', err);
    return res.status(500).json({ success: false, message: 'Không gửi được OTP' });
  }
});

/* ============================
   API: Reset mật khẩu Firebase
   body: { email: string, newPassword: string }
   ============================ */
app.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body || {};
  if (!email || !newPassword) {
    return res.status(400).json({ success: false, message: 'Missing email or newPassword' });
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: newPassword });
    return res.json({ success: true, message: 'Đã cập nhật mật khẩu thành công' });
  } catch (error) {
    console.error('❌ Lỗi cập nhật mật khẩu:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Update failed' });
  }
});

/* ============================
   Start server
   ============================ */
const PORT = process.env.PORT || 8081; // server t2 chạy cổng khác
app.listen(PORT, () => {
  console.log(`✅ Math Master OTP server is running on port ${PORT}`);
});
