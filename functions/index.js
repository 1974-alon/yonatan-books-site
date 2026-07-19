const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp }  = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
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
const CF_BASE_URL    = 'https://europe-west1-yonatan-books.cloudfunctions.net';

const BOOK_PRICES = { 'book-01': 10, 'book-02': 10 };
const BOOK_TITLES = { 'book-01': 'דמיון לנחמה', 'book-02': 'דרום מערב' };
// שמות הקבצים הפוכים בכוונה — תואם למיפוי הקיים ב-js/account.js
const STORAGE_PATHS = { 'book-01': 'books/book02.pdf', 'book-02': 'books/book01.pdf' };
const SITE_URL = 'https://1974-alon.github.io/yonatan-books-site';

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

// ── Admin session token ───────────────────────────────────
// מונפק פעם אחת אחרי אימות OTP מוצלח של אדמין, ונדרש בכל בקשה למידע רגיש
function makeAdminToken(secret) {
  const expires = Date.now() + 12 * 60 * 60 * 1000; // 12 שעות
  const hmac    = crypto.createHmac('sha256', secret).update(`admin:${expires}`).digest('hex');
  return `${expires}.${hmac}`;
}

function verifyAdminToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [expiresStr, hmac] = token.split('.');
  const expires = Number(expiresStr);
  if (!expires || Date.now() > expires) return false;
  const expected = crypto.createHmac('sha256', secret).update(`admin:${expires}`).digest('hex');
  return hmac === expected;
}

function requireAdmin(req, res, secret) {
  const authHeader = req.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!verifyAdminToken(token, secret)) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// ── sendOtp ───────────────────────────────────────────────
exports.sendOtp = onRequest(
  { secrets: [VONAGE_SECRET, GMAIL_PASS], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    const { phone, email } = req.body;
    if (!phone && !email) { res.status(400).json({ error: 'missing_identifier' }); return; }

    if (email) {
      const to  = email.toLowerCase().trim();
      const otp = makeOtp(to, VONAGE_SECRET.value());
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: 'yonatanbrennerbooks@gmail.com', pass: GMAIL_PASS.value() }
      });
      try {
        await transporter.sendMail({
          from:    '"יונתן ספרים" <yonatanbrennerbooks@gmail.com>',
          to,
          subject: 'קוד האימות שלך — יונתן ספרים',
          html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;color:#222;">
                   <p>קוד האימות שלך לאזור האישי:</p>
                   <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${otp}</p>
                   <p style="color:#777;font-size:13px;">הקוד בתוקף ל-5 דקות.</p>
                 </div>`
        });
        res.json({ success: true });
      } catch (err) {
        console.error('sendOtp email error:', err);
        res.status(500).json({ error: 'email_failed' });
      }
      return;
    }

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
// רשימת האדמינים בפורמט "שם:טלפון,שם:טלפון" — חייבים להצליב שם ומספר טלפון יחד,
// אחרת מי שמקליד את הטלפון של אדמין (עם כל שם) היה מתחזה ומקבל הרשאות אדמין.
function parseAdminList(raw) {
  return (raw || '').split(',').map(entry => {
    const idx = entry.indexOf(':');
    if (idx === -1) return null;
    return { name: entry.slice(0, idx).trim(), phone: entry.slice(idx + 1).trim() };
  }).filter(Boolean);
}

// בודקים אם השם כבר שימש בעבר עבור אותו טלפון/מייל — לא רק מול הזמנה אחת אקראית,
// אלא מול כל השמות שאי-פעם נרשמו לאותם פרטי קשר (ייתכנו כמה, בעיקר מבדיקות).
// מחזיר true = אי-התאמה (חוסמים), false = תקין (לקוח חדש, או שם שכבר שימש בעבר)
async function nameMismatchesHistory(field, value, name) {
  const snap = await db.collection('orders').where(field, '==', value).limit(20).get();
  if (snap.empty) return false;
  const usedNames = new Set(snap.docs.map(d => (d.data().buyerName || '').trim()));
  return !usedNames.has((name || '').trim());
}

// מייל אישור רכישה — משותף לתשלום בכרטיס (מיידי) ולתשלום בביט (אחרי אישור ה-IPN).
// לא זורק — כשל בשליחת מייל לא אמור להפיל את התהליך שקרא לפונקציה.
async function sendPurchaseEmail({ buyerEmail, bookTitle, isDigital, downloadToken }) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: 'yonatanbrennerbooks@gmail.com', pass: GMAIL_PASS.value() }
    });

    const accountUrl = `${SITE_URL}/index.html#my-area`;

    const bodyHtml = isDigital
      ? `<p>ניתן להוריד את הספר עכשיו בקישור החד־פעמי המצורף:</p>
         <p><a href="${CF_BASE_URL}/downloadBook?token=${downloadToken}" style="color:#3c6020;font-weight:bold;">להורדת הספר</a></p>
         <p>אפשר גם להוריד את הספר בכל עת מהאזור האישי באתר, עד שלוש הורדות.
            נכנסים עם השם והטלפון או האימייל שאיתם בוצעה הרכישה, ומאמתים עם קוד חד־פעמי שיישלח אליכם.</p>
         <p><a href="${accountUrl}" style="color:#3c6020;font-weight:bold;">כניסה לאזור האישי</a></p>`
      : `<p>הספר יארז ויישלח בדואר תוך עד שבעה ימי עבודה מרגע אישור ההזמנה.</p>
         <p>אפשר לעקוב בכל שלב אחרי סטטוס המשלוח, החל מ״התקבל״ ועד ״נשלח״, ישירות מהאזור האישי באתר.
            נכנסים עם השם והטלפון או האימייל שאיתם בוצעה הרכישה, ומאמתים עם קוד חד־פעמי שיישלח אליכם.</p>
         <p><a href="${accountUrl}" style="color:#3c6020;font-weight:bold;">כניסה לאזור האישי</a></p>`;

    await transporter.sendMail({
      from:    '"יונתן ספרים" <yonatanbrennerbooks@gmail.com>',
      to:      buyerEmail,
      subject: `תודה שרכשת את "${bookTitle}", יונתן ספרים`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.8;">
               <p>תודה שרכשת את "${bookTitle}"!</p>
               ${bodyHtml}
             </div>`
    });
  } catch (mailErr) {
    console.error('sendPurchaseEmail error:', mailErr);
  }
}

exports.verifyOtp = onRequest(
  { secrets: [VONAGE_SECRET, ADMIN_PHONES], cors: ALLOWED_ORIGINS, region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    const { phone, email, code, name } = req.body;
    const identifier = phone || (email ? email.toLowerCase().trim() : null);
    if (!identifier || !code) { res.status(400).json({ error: 'missing_fields' }); return; }

    if (!checkOtp(identifier, code, VONAGE_SECRET.value())) {
      res.status(401).json({ error: 'invalid_code' }); return;
    }

    const adminList  = parseAdminList(ADMIN_PHONES.value());
    const isAdmin    = !!(phone && name && adminList.some(a => a.phone === phone && a.name === name.trim()));

    // חסימת כניסה עם שם שלא תואם ללקוח שכבר קיים תחת הטלפון/מייל הזה
    // (רק אם יש כבר הזמנה קודמת עם פרטי הקשר האלו — לקוח חדש לגמרי תמיד עובר)
    if (!isAdmin && name) {
      const field = phone ? 'buyerPhone' : 'buyerEmail';
      const value = phone
        ? phone.replace(/[-\s]/g, '').replace(/^\+972/, '0')
        : identifier;
      if (await nameMismatchesHistory(field, value, name)) {
        res.status(409).json({ error: 'name_mismatch' });
        return;
      }
    }

    const adminToken = isAdmin ? makeAdminToken(VONAGE_SECRET.value()) : null;
    res.json({ success: true, isAdmin, adminToken });
  }
);

// ── createPayment ─────────────────────────────────────────
// ── createBitPayment ───────────────────────────────────────
// תשלום בביט לא נתמך ב-hosted fields (זה כרטיסים בלבד) — במקום זה מפנים
// את הקונה לדף התשלום המאורח של PayMe עצמה (QR/פתיחת אפליקציה), והיא חוזרת
// אלינו עם sale_return_url. ה-IPN (paymeIPN) הוא זה שבאמת מסמן "שולם" ושולח מייל,
// ה-return רק בודק מול getOrder אם זה כבר קרה — כמו בכרטיס, אין הודעת הצלחה לפני אישור אמיתי.
exports.createBitPayment = onRequest(
  { secrets: [PAYME_KEY], cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { bookId, buyerName, buyerEmail, buyerPhone, deliveryType, address, notes } = req.body;

    if (!bookId || !buyerName || !buyerEmail || !buyerPhone) {
      res.status(400).json({ error: 'missing_fields' }); return;
    }

    const price     = BOOK_PRICES[bookId];
    const bookTitle = BOOK_TITLES[bookId];
    if (!price) { res.status(400).json({ error: 'invalid_book' }); return; }

    // אותה חסימה כמו בתשלום בכרטיס — לא יוצרים הזמנה בכלל אם הנייד/מייל
    // כבר קיימים במערכת תחת שם אחר
    const phoneValue = buyerPhone.replace(/[-\s]/g, '').replace(/^\+972/, '0');
    const emailValue = buyerEmail.toLowerCase().trim();
    const [phoneMismatch, emailMismatch] = await Promise.all([
      nameMismatchesHistory('buyerPhone', phoneValue, buyerName),
      nameMismatchesHistory('buyerEmail', emailValue, buyerName)
    ]);
    if (phoneMismatch || emailMismatch) {
      res.status(409).json({ error: 'name_mismatch' });
      return;
    }

    // הזמנה ב"ממתין" — עוד לא שולם, ה-IPN יעדכן ל-paid כשהתשלום באמת יאושר
    const orderRef = await db.collection('orders').add({
      bookId,
      bookTitle,
      buyerName,
      buyerEmail,
      buyerPhone,
      deliveryType: deliveryType || 'digital',
      address:      address || null,
      notes:        notes   || null,
      price,
      currency:     'ILS',
      status:       'pending',
      downloads:    0,
      paymeId:      null,
      downloadToken: null,
      downloadTokenUsed: false,
      createdAt:    FieldValue.serverTimestamp()
    });

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
          sale_payment_method:    'bit',
          sale_send_notification: false,
          sale_return_url:        `${RETURN_URL}&orderId=${orderRef.id}&book=${bookId}`,
          sale_callback_url:      IPN_URL,
          buyer_name:             buyerName,
          buyer_email:            buyerEmail,
          buyer_phone:            buyerPhone.replace(/[-\s]/g, '')
        })
      });

      const data = await paymeRes.json();
      console.log('PayMe createBitPayment response:', JSON.stringify(data));

      if (!data.sale_url) {
        await orderRef.delete();
        res.status(500).json({ error: 'no_sale_url', payme_raw: data });
        return;
      }

      await orderRef.update({ paymeId: data.payme_sale_id });

      res.json({ saleUrl: data.sale_url, orderId: orderRef.id });
    } catch (err) {
      console.error('PayMe createBitPayment error:', err, err.cause);
      await orderRef.delete();
      res.status(500).json({ error: 'payment_init_failed', detail: err.message });
    }
  }
);

// ── paymeIPN ──────────────────────────────────────────────
exports.paymeIPN = onRequest(
  { secrets: [PAYME_KEY, GMAIL_PASS], cors: true, region: 'europe-west1', invoker: 'public' },
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

      const doc  = snap.docs[0];
      const data = doc.data();

      // אידמפוטנטיות — אם ה-IPN כבר טופל בעבר (יכול להגיע יותר מפעם אחת), לא שולחים מייל שוב
      if (data.status === 'paid' || data.status === 'preparing' || data.status === 'shipped') {
        res.json({ status: 'ok' }); return;
      }

      const isDigital     = (data.deliveryType || 'digital') === 'digital';
      const downloadToken = isDigital ? crypto.randomBytes(24).toString('hex') : null;

      await doc.ref.update({ status: 'paid', downloadToken, downloadTokenUsed: false });
      await sendPurchaseEmail({
        buyerEmail: data.buyerEmail,
        bookTitle:  data.bookTitle,
        isDigital,
        downloadToken
      });

      res.json({ status: 'ok' });
    } catch (err) {
      console.error('paymeIPN error:', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// ── confirmPayment ────────────────────────────────────────
exports.confirmPayment = onRequest(
  { secrets: [PAYME_KEY, GMAIL_PASS], cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { bookId, buyerName, buyerEmail, buyerPhone, deliveryType, address, notes, paymeToken } = req.body;

    if (!bookId || !buyerName || !buyerEmail || !buyerPhone || !paymeToken) {
      res.status(400).json({ error: 'missing_fields' }); return;
    }

    // וידוא פורמט טוקן PayMe — חייב להתחיל ב-BUYER
    if (!/^BUYER\d+-.+-.+$/.test(paymeToken)) {
      res.status(400).json({ error: 'invalid_token' }); return;
    }

    const price     = BOOK_PRICES[bookId];
    const bookTitle = BOOK_TITLES[bookId];
    if (!price) { res.status(400).json({ error: 'invalid_book' }); return; }

    try {
      // הערה: אין כאן דה-דופ לפי buyerToken בכוונה — ה-buyer_key של PayMe צמוד לכרטיס האשראי
      // ולא ייחודי לכל ניסיון תשלום, אז כרטיס ששימש בעבר עלול לקבל אותו טוקן שוב בעסקה חדשה ולגמרי תקינה.
      // הגנה מפני לחיצה כפולה בטעות כבר קיימת בצד הלקוח (הכפתור ננעל בזמן עיבוד).

      // חסימת רכישה חדשה עם נייד/מייל שכבר קיימים במערכת תחת שם אחר —
      // נבדק לפני החיוב, כדי שלא לחייב כרטיס על רכישה חסומה
      const phoneValue = buyerPhone.replace(/[-\s]/g, '').replace(/^\+972/, '0');
      const emailValue = buyerEmail.toLowerCase().trim();
      const [phoneMismatch, emailMismatch] = await Promise.all([
        nameMismatchesHistory('buyerPhone', phoneValue, buyerName),
        nameMismatchesHistory('buyerEmail', emailValue, buyerName)
      ]);
      if (phoneMismatch || emailMismatch) {
        res.status(409).json({ error: 'name_mismatch' });
        return;
      }

      // חיוב בפועל דרך PayMe API
      const txId = crypto.randomUUID();
      const chargeBody = {
        seller_payme_id: PAYME_KEY.value(),
        sale_price:      price * 100,
        currency:        'ILS',
        product_name:    bookTitle,
        transaction_id:  txId,
        buyer_key:       paymeToken
      };
      console.log('PayMe charge request:', JSON.stringify({ ...chargeBody, seller_payme_id: '[REDACTED]' }));

      const chargeRes = await fetch(PAYME_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(chargeBody)
      });

      const chargeRaw  = await chargeRes.text();
      console.log('PayMe charge response (raw):', chargeRaw);
      const chargeData = JSON.parse(chargeRaw);

      // שמירת תגובת PayMe ל-debug בFirestore
      await db.collection('debug_payme').add({
        txId, chargeData, buyerToken: paymeToken, createdAt: FieldValue.serverTimestamp()
      });

      if (!chargeData.payme_sale_id) {
        console.error('PayMe charge failed:', chargeData);
        res.status(402).json({
          error:  'payment_declined',
          detail: chargeData.status_additional_info || chargeData.status_error_details || chargeData.status
        });
        return;
      }

      // שמירה ב-Firestore רק אחרי חיוב מוצלח
      const isDigital    = (deliveryType || 'digital') === 'digital';
      const downloadToken = isDigital ? crypto.randomBytes(24).toString('hex') : null;

      const orderRef = await db.collection('orders').add({
        bookId,
        bookTitle,
        buyerName,
        buyerEmail,
        buyerPhone,
        deliveryType: deliveryType || 'digital',
        address:      address || null,
        notes:        notes   || null,
        price,
        currency:     'ILS',
        status:       'paid',
        downloads:    0,
        paymeId:      chargeData.payme_sale_id,
        buyerToken:   paymeToken,
        downloadToken,
        downloadTokenUsed: false,
        createdAt:    FieldValue.serverTimestamp()
      });

      await sendPurchaseEmail({ buyerEmail, bookTitle, isDigital, downloadToken });

      res.json({ orderId: orderRef.id });
    } catch (err) {
      console.error('confirmPayment error:', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// ── downloadBook ──────────────────────────────────────────
// קישור חד-פעמי שנשלח במייל האישור — נועל את עצמו אחרי הורדה ראשונה
exports.downloadBook = onRequest(
  { region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    const token = req.query.token;
    if (!token) { res.status(400).send('קישור לא תקין.'); return; }

    try {
      const snap = await db.collection('orders').where('downloadToken', '==', token).limit(1).get();
      if (snap.empty) {
        res.status(404).send('הקישור אינו תקין.');
        return;
      }

      const doc   = snap.docs[0];
      const order = doc.data();

      if (order.downloadTokenUsed) {
        res.status(410).send('הקישור החד-פעמי כבר נוצל. ניתן להוריד את הספר עד 3 פעמים נוספות מהאזור האישי באתר.');
        return;
      }

      const path = STORAGE_PATHS[order.bookId];
      if (!path) { res.status(500).send('שגיאה באיתור הקובץ.'); return; }

      const [buffer] = await getStorage().bucket().file(path).download();
      await doc.ref.update({ downloadTokenUsed: true });

      const filename = encodeURIComponent(`${order.bookTitle}.pdf`);
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="book.pdf"; filename*=UTF-8''${filename}`);
      res.send(buffer);
    } catch (err) {
      console.error('downloadBook error:', err);
      res.status(500).send('שגיאה בהורדת הקובץ — נסה שוב או פנה אלינו.');
    }
  }
);

// ── getAdminOrders ────────────────────────────────────────
exports.getAdminOrders = onRequest(
  { secrets: [VONAGE_SECRET], cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'GET') { res.status(405).end(); return; }
    if (!requireAdmin(req, res, VONAGE_SECRET.value())) return;

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
        .filter(doc => ['paid', 'preparing', 'shipped'].includes(doc.data().status))
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

// ── checkCustomerExists ───────────────────────────────────
// חיווי בלבד (לא חוסם) — בודק אם טלפון/מייל כבר שימשו לרכישה קודמת תחת שם אחר,
// כדי להציג הודעה ידידותית בטופס הרכישה. לא חושף שם או היסטוריית רכישות, רק true/false.
exports.checkCustomerExists = onRequest(
  { cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const { phone, email, name } = req.body;
    if (!phone && !email) { res.status(400).json({ error: 'missing_identifier' }); return; }

    try {
      const field = phone ? 'buyerPhone' : 'buyerEmail';
      const value = phone
        ? phone.replace(/[-\s]/g, '').replace(/^\+972/, '0')
        : email.toLowerCase().trim();

      const snap = await db.collection('orders')
        .where(field, '==', value)
        .limit(20)
        .get();

      if (snap.empty) { res.json({ exists: false }); return; }

      const usedNames = new Set(snap.docs.map(d => (d.data().buyerName || '').trim()));
      const matches = !!(name && usedNames.has(name.trim()));
      res.json({ exists: true, matches });
    } catch (err) {
      console.error('checkCustomerExists error:', err);
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

// ── updateOrderStatus ─────────────────────────────────────
const ALLOWED_STATUSES = ['preparing', 'shipped'];

exports.updateOrderStatus = onRequest(
  { secrets: [VONAGE_SECRET], cors: true, region: 'europe-west1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    if (!requireAdmin(req, res, VONAGE_SECRET.value())) return;

    const { orderId, status } = req.body;
    if (!orderId || !ALLOWED_STATUSES.includes(status)) {
      res.status(400).json({ error: 'invalid_request' }); return;
    }

    try {
      const ref = db.collection('orders').doc(orderId);
      const doc = await ref.get();
      if (!doc.exists) { res.status(404).json({ error: 'not_found' }); return; }

      await ref.update({ status });
      res.json({ success: true });
    } catch (err) {
      console.error('updateOrderStatus error:', err);
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
    if (!['paid', 'preparing', 'shipped'].includes(data.status)) { res.status(402).json({ error: 'not_paid' }); return; }

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
