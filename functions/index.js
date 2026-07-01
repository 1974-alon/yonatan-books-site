const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const nodemailer   = require('nodemailer');

const GMAIL_PASS = defineSecret('GMAIL_APP_PASSWORD');

const ALLOWED_ORIGINS = [
  'https://1974-alon.github.io',
  'http://127.0.0.1:5502',
  'http://localhost:5502'
];

exports.sendContactEmail = onRequest(
  { secrets: [GMAIL_PASS], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { name, email, message } = req.body;

    if (!name?.trim() || !message?.trim()) {
      res.status(400).json({ error: 'missing fields' });
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'yonatanbrennerbooks@gmail.com',
        pass: GMAIL_PASS.value()
      }
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
