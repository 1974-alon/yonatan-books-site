const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Vonage } = require('@vonage/server-sdk');

const GMAIL_PASS    = defineSecret('GMAIL_APP_PASSWORD');
const VONAGE_SECRET = defineSecret('VONAGE_API_SECRET');
const VONAGE_KEY    = '4de40fa9';

const ALLOWED_ORIGINS = [
  'https://1974-alon.github.io',
  'http://127.0.0.1:5502',
  'http://localhost:5502'
];

// ── OTP helpers (stateless HMAC — no DB needed) ───────────
function makeOtp(phone, secret) {
  const win  = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-min window
  const hmac = crypto.createHmac('sha256', secret).update(`${phone}:${win}`).digest('hex');
  return String(parseInt(hmac.slice(-6), 16) % 1000000).padStart(6, '0');
}

function checkOtp(phone, code, secret) {
  const now = Math.floor(Date.now() / (5 * 60 * 1000));
  for (let w = now - 1; w <= now; w++) {
    const hmac = crypto.createHmac('sha256', secret).update(`${phone}:${w}`).digest('hex');
    const expected = String(parseInt(hmac.slice(-6), 16) % 1000000).padStart(6, '0');
    if (code === expected) return true;
  }
  return false;
}

// ── sendOtp ───────────────────────────────────────────────
exports.sendOtp = onRequest(
  { secrets: [VONAGE_SECRET], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { phone } = req.body;
    if (!phone) { res.status(400).json({ error: 'missing_phone' }); return; }

    const otp    = makeOtp(phone, VONAGE_SECRET.value());
    const vonage = new Vonage({ apiKey: VONAGE_KEY, apiSecret: VONAGE_SECRET.value() });
    const to     = phone.replace(/^\+/, '');

    try {
      const resp = await vonage.sms.send({
        to,
        from: 'YonatanBook',
        text: `Your Yonatan Books code: ${otp}`
      });
      if (resp.messages[0].status !== '0') {
        throw new Error(resp.messages[0]['error-text']);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Vonage sendOtp error:', err);
      res.status(500).json({ error: 'sms_failed' });
    }
  }
);

// ── verifyOtp ─────────────────────────────────────────────
exports.verifyOtp = onRequest(
  { secrets: [VONAGE_SECRET], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { phone, code } = req.body;
    if (!phone || !code) { res.status(400).json({ error: 'missing_fields' }); return; }

    if (checkOtp(phone, code, VONAGE_SECRET.value())) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'invalid_code' });
    }
  }
);

// ── sendContactEmail ──────────────────────────────────────
exports.sendContactEmail = onRequest(
  { secrets: [GMAIL_PASS], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    const { name, email, message } = req.body;
    if (!name?.trim() || !message?.trim()) {
      res.status(400).json({ error: 'missing fields' });
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: 'yonatanbrennerbooks@gmail.com', pass: GMAIL_PASS.value() }
    });

    const replyTo = email?.trim() || null;
    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.7;text-align:right;">
        <p><strong>שם:</strong> ${name.trim()}</p>
        ${replyTo ? `<p><strong>מייל:</strong> <a href="mailto:${replyTo}" dir="ltr" style="direction:ltr;unicode-bidi:embed;">${replyTo}</a></p>` : ''}
        <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;">
        <p><strong>הודעה:</strong></p>
        <p style="white-space:pre-wrap;">${message.trim()}</p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from:    '"יונתן ספרים" <yonatanbrennerbooks@gmail.com>',
        to:      'yonatanbrennerbooks@gmail.com',
        ...(replyTo && { replyTo }),
        subject: `פנייה מהאזור האישי – ${name.trim()}`,
        html
      });
      res.json({ success: true });
    } catch (err) {
      console.error('sendMail error:', err);
      res.status(500).json({ error: 'send failed' });
    }
  }
);
