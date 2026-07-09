const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp }  = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const { Vonage } = require('@vonage/server-sdk');

initializeApp();
const db = getFirestore();

const GMAIL_PASS    = defineSecret('GMAIL_APP_PASSWORD');
const VONAGE_SECRET = defineSecret('VONAGE_API_SECRET');
const PAYME_KEY     = defineSecret('PAYME_API_KEY');
const ADMIN_PHONES  = defineSecret('ADMIN_PHONES');
const VONAGE_KEY    = '4de40fa9';

const ALLOWED_ORIGINS = [
  'https://1974-alon.github.io',
  'http://127.0.0.1:5502',
  'http://localhost:5502'
];

const PAYME_SANDBOX  = false;
const PAYME_URL      = PAYME_SANDBOX
  ? 'https://sandbox.payme.io/api/generate-sale'
  : 'https://live.payme.io/api/generate-sale';
const PAYME_DEMO_ID  = 'MPLDEMO-MPLDEMO-MPLDEMO-1234567'; // רק לסנדבוקס
const RETURN_URL     = 'https://1974-alon.github.io/yonatan-books-site/purchase.html?success=1';
const IPN_URL        = 'https://europe-west1-yonatan-books.cloudfunctions.net/paymeIPN';

const BOOK_PRICES = { 'book-01': 1, 'book-02': 1 }; // TEST — להחזיר ל-79/89
const BOOK_TITLES = { 'book-01': 'דמיון לנחמה', 'book-02': 'דרום מערב' };

// ── OTP helpers ───────────────────────────────────────────
function makeOtp(phone, secret) {
  const win  = Math.floor(Date.now() / (5 * 60 * 1000));
  const hmac = crypto.createHmac('sha256', secret).update(`${phone}:${win}`).digest('hex');
  return String(parseInt(hmac.slice(-6), 16) % 1000000).padStart(6, '0');
}

function checkOtp(phone, code, secret) {
  const now = Math.floor(Date.now() / (5 * 60 * 1000));
  for (let w = now - 1; w <= now; w++) {
    const hmac     = crypto.createHmac('sha256', secret).update(`${phone}:${w}`).digest('hex');
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
        to, from: 'YonatanBook', text: `Your Yonatan Books code: ${otp}`
      });
      if (resp.messages[0].status !== '0') throw new Error(resp.messages[0]['error-text']);
      res.json({ success: true });
    } catch (err) {
      console.error('Vonage sendOtp error:', err);
      res.status(500).json({ error: 'sms_failed' });
    }
  }
);

// ── verifyOtp ─────────────────────────────────────────────
exports.verifyOtp = onRequest(
  { secrets: [VONAGE_SECRET, ADMIN_PHONES], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    const { phone, code } = req.body;
    if (!phone || !code) { res.status(400).json({ error: 'missing_fields' }); return; }

    if (!checkOtp(phone, code, VONAGE_SECRET.value())) {
      res.status(401).json({ error: 'invalid_code' }); return;
    }

    const adminList = (ADMIN_PHONES.value() || '').split(',').map(p => p.trim());
    const isAdmin   = adminList.includes(phone);
    res.json({ success: true, isAdmin });
  }
);

// ── createPayment ─────────────────────────────────────────
exports.createPayment = onRequest(
  { secrets: [PAYME_KEY], cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { bookId, buyerName, buyerEmail, buyerPhone, deliveryType, address } = req.body;

    if (!bookId || !buyerName || !buyerEmail || !buyerPhone) {
      res.status(400).json({ error: 'missing_fields' }); return;
    }

    const price     = BOOK_PRICES[bookId];
    const bookTitle = BOOK_TITLES[bookId];
    if (!price) { res.status(400).json({ error: 'invalid_book' }); return; }

    // Create pending order in Firestore
    const orderRef = await db.collection('orders').add({
      bookId,
      bookTitle,
      buyerName,
      buyerEmail,
      buyerPhone,
      deliveryType: deliveryType || 'digital',
      address:      address || null,
      price,
      currency:     'ILS',
      status:       'pending',
      downloads:    0,
      paymeId:      null,
      createdAt:    FieldValue.serverTimestamp()
    });

    // Create PayMe payment session
    try {
      const paymeRes = await fetch(PAYME_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_payme_id:        PAYME_SANDBOX ? PAYME_DEMO_ID : PAYME_KEY.value(),
          sale_price:             price * 100,
          currency:               'ILS',
          product_name:           bookTitle,
          transaction_id:         orderRef.id,
          sale_send_notification: false,
          sale_return_url:        `${RETURN_URL}&orderId=${orderRef.id}`,
          sale_callback_url:      IPN_URL,
          buyer_name:             buyerName,
          buyer_email:            buyerEmail,
          buyer_phone:            buyerPhone.replace(/[-\s]/g, '')
        })
      });

      const data = await paymeRes.json();
      console.log('PayMe response:', JSON.stringify(data));

      if (!data.sale_url && !data.url) {
        await orderRef.delete();
        res.status(500).json({ error: 'no_sale_url', payme_raw: data });
        return;
      }

      const saleUrl = data.sale_url || data.url;
      const paymeId = data.payme_sale_id || data.id || orderRef.id;
      await orderRef.update({ paymeId });

      res.json({ saleUrl, orderId: orderRef.id });
    } catch (err) {
      console.error('PayMe createPayment error:', err, err.cause);
      await orderRef.delete();
      res.status(500).json({ error: 'payment_init_failed', detail: err.message, cause: String(err.cause) });
    }
  }
);

// ── paymeIPN ──────────────────────────────────────────────
exports.paymeIPN = onRequest(
  { secrets: [PAYME_KEY], cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    const { payme_sale_id, sale_status } = req.body;

    if (!payme_sale_id || sale_status !== 'completed') {
      res.json({ status: 'ignored' }); return;
    }

    try {
      const snap = await db.collection('orders')
        .where('paymeId', '==', payme_sale_id)
        .limit(1)
        .get();

      if (snap.empty) {
        console.error('IPN: order not found for paymeId', payme_sale_id);
        res.status(404).json({ error: 'order_not_found' }); return;
      }

      await snap.docs[0].ref.update({ status: 'paid' });
      res.json({ status: 'ok' });
    } catch (err) {
      console.error('paymeIPN error:', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// ── confirmPayment ────────────────────────────────────────
exports.confirmPayment = onRequest(
  { cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { bookId, buyerName, buyerEmail, buyerPhone, deliveryType, address, notes, paymeToken } = req.body;

    if (!bookId || !buyerName || !buyerEmail || !buyerPhone || !paymeToken) {
      res.status(400).json({ error: 'missing_fields' }); return;
    }

    const price     = BOOK_PRICES[bookId];
    const bookTitle = BOOK_TITLES[bookId];
    if (!price) { res.status(400).json({ error: 'invalid_book' }); return; }

    try {
      const orderRef = await db.collection('orders').add({
        bookId,
        bookTitle,
        buyerName,
        buyerEmail,
        buyerPhone,
        deliveryType: deliveryType || 'digital',
        address:      address || null,
        notes:        notes || null,
        price,
        currency:     'ILS',
        status:       'paid',
        downloads:    0,
        paymeId:      paymeToken,
        createdAt:    FieldValue.serverTimestamp()
      });

      res.json({ orderId: orderRef.id });
    } catch (err) {
      console.error('confirmPayment error:', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// ── getAdminOrders ────────────────────────────────────────
exports.getAdminOrders = onRequest(
  { cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'GET') { res.status(405).end(); return; }

    try {
      const snap = await db.collection('orders')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      const orders = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id:              doc.id,
          bookId:          d.bookId,
          bookTitle:       d.bookTitle,
          name:            d.buyerName,
          email:           d.buyerEmail,
          phone:           d.buyerPhone,
          type:            d.deliveryType || 'digital',
          address:         d.address || null,
          notes:           d.notes  || null,
          price:           d.price,
          status:          d.status,
          downloads:       d.downloads || 0,
          paymeId:         d.paymeId || null,
          date:            d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };
      });

      res.json({ orders });
    } catch (err) {
      console.error('getAdminOrders error:', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// ── getCustomerOrders ─────────────────────────────────────
exports.getCustomerOrders = onRequest(
  { cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { phone, email } = req.body;
    if (!phone && !email) { res.status(400).json({ error: 'missing_identifier' }); return; }

    try {
      const field = phone ? 'buyerPhone' : 'buyerEmail';
      const value = phone
        ? phone.replace(/[-\s]/g, '').replace(/^\+972/, '0')
        : email.toLowerCase().trim();

      const snap = await db.collection('orders')
        .where(field, '==', value)
        .get();

      const orders = snap.docs
        .filter(doc => doc.data().status === 'paid')
        .sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0))
        .map(doc => {
        const d = doc.data();
        return {
          id:        doc.id,
          bookId:    d.bookId,
          bookTitle: d.bookTitle,
          type:      d.deliveryType || 'digital',
          status:    d.status,
          downloads: d.downloads || 0,
          date:      d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };
      });

      res.json({ orders });
    } catch (err) {
      console.error('getCustomerOrders error:', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// ── incrementDownload ─────────────────────────────────────
exports.incrementDownload = onRequest(
  { cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { orderId } = req.body;
    if (!orderId) { res.status(400).json({ error: 'missing_orderId' }); return; }

    try {
      const ref = db.collection('orders').doc(orderId);
      const doc = await ref.get();
      if (!doc.exists) { res.status(404).json({ error: 'not_found' }); return; }

      const current = doc.data().downloads || 0;
      if (current >= 3) {
        res.status(403).json({ error: 'max_downloads_reached' }); return;
      }

      await ref.update({ downloads: FieldValue.increment(1) });
      res.json({ downloads: current + 1, remaining: 3 - (current + 1) });
    } catch (err) {
      console.error('incrementDownload error:', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// ── getOrder ──────────────────────────────────────────────
exports.getOrder = onRequest(
  { cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    const { orderId } = req.query;
    if (!orderId) { res.status(400).json({ error: 'missing_orderId' }); return; }

    const doc = await db.collection('orders').doc(orderId).get();
    if (!doc.exists) { res.status(404).json({ error: 'not_found' }); return; }

    const data = doc.data();
    if (data.status !== 'paid') { res.status(402).json({ error: 'not_paid' }); return; }

    res.json({ orderId: doc.id, ...data });
  }
);

// ── sendContactEmail ──────────────────────────────────────
exports.sendContactEmail = onRequest(
  { secrets: [GMAIL_PASS], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    const { name, email, message } = req.body;
    if (!name?.trim() || !message?.trim()) {
      res.status(400).json({ error: 'missing fields' }); return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: 'yonatanbrennerbooks@gmail.com', pass: GMAIL_PASS.value() }
    });

    const replyTo = email?.trim() || null;
    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.7;text-align:right;">
        <p><strong>שם:</strong> ${name.trim()}</p>
        ${replyTo ? `<p><strong>מייל:</strong> <a href="mailto:${replyTo}">${replyTo}</a></p>` : ''}
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
