/* =========================================================
   AUTH MODAL
   Phone tab  → real Vonage SMS OTP (admin + customer)
   Email tab  → mock OTP for demo customer
   Admin      → session flag → admin.html
   Customer   → session → account.html
========================================================= */

const CF_BASE = 'https://europe-west1-yonatan-books.cloudfunctions.net';

const MOCK_DB = [
  {
    id: 'cust-001',
    name: 'ישראל ישראלי',
    email: 'israel@test.com',
    phone: '9999999999',
    otp: '123456',
    purchases: [
      {
        id: 'ORD-001',
        bookId: 'book-01',
        bookTitle: 'דמיון לנחמה',
        type: 'digital',
        status: 'הושלם',
        date: '2026-06-01'
      }
    ]
  }
];

function findCustomer(name, contact) {
  const n = name.trim();
  const c = contact.trim().replace(/[-\s()+]/g, '');
  return MOCK_DB.find(cust =>
    cust.name === n &&
    (cust.email.toLowerCase() === c.toLowerCase() || cust.phone === c)
  );
}

function findAdmin(name, phone) {
  if (typeof ADMIN_USERS === 'undefined') return null;
  const clean = phone.replace(/[-\s]/g, '');
  const e164  = clean.startsWith('0') ? '+972' + clean.slice(1) : clean;
  return ADMIN_USERS.find(a => a.name === name.trim() && a.phone === e164) ? e164 : null;
}

async function sendOtp(phone) {
  const res = await fetch(`${CF_BASE}/sendOtp`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone })
  });
  if (!res.ok) throw new Error('sms_failed');
}

async function verifyOtp(phone, code) {
  const res = await fetch(`${CF_BASE}/verifyOtp`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone, code })
  });
  return res.ok;
}

// ── DOM refs ──────────────────────────────────────────────
const authModal          = document.getElementById('auth-modal');
const authModalBox       = authModal.querySelector('.yb-auth-modal__box');
const authOverlay        = document.getElementById('auth-modal-overlay');
const authClose          = document.getElementById('auth-modal-close');
const myAreaBtn          = document.getElementById('my-area-btn');

const stepIdentify       = document.getElementById('auth-step-identify');
const stepOtp            = document.getElementById('auth-step-otp');

const authNameEl         = document.getElementById('auth-name');
const authNameError      = document.getElementById('auth-name-error');

const contactTabs        = authModal.querySelectorAll('.yb-auth-tab');
const emailFieldWrap     = document.getElementById('auth-email-field');
const phoneFieldWrap     = document.getElementById('auth-phone-field');
const authEmailEl        = document.getElementById('auth-email');
const authEmailError     = document.getElementById('auth-email-error');
const authPhoneEl        = document.getElementById('auth-phone');
const authPhoneError     = document.getElementById('auth-phone-error');
const authLookupError    = document.getElementById('auth-lookup-error');
const authIdentifySubmit = document.getElementById('auth-identify-submit');

const otpHintEl          = document.getElementById('otp-hint');
const otpGroup           = document.getElementById('otp-group');
const otpBoxes           = [...otpGroup.querySelectorAll('.yb-otp-box')];
const authOtpError       = document.getElementById('auth-otp-error');
const authOtpSubmit      = document.getElementById('auth-otp-submit');
const authBack           = document.getElementById('auth-back');

let activeTab       = 'email';
let pendingCustomer = null;
let pendingPhone    = null;
let pendingIsAdmin  = false;

// ── Open / Close ──────────────────────────────────────────
function openAuthModal() {
  authModal.hidden = false;
  authModalBox.style.animation = 'none';
  void authModalBox.offsetHeight;
  authModalBox.style.animation = '';
  document.body.style.overflow = 'hidden';
  resetAuthModal();
  authNameEl.focus();
}

function closeAuthModal() {
  authModal.hidden = true;
  document.body.style.overflow = '';
}

function resetAuthModal() {
  showAuthStep('identify');
  clearAuthErrors();
  authNameEl.value      = '';
  authEmailEl.value     = '';
  authPhoneEl.value     = '';
  clearOtpBoxes();
  pendingCustomer       = null;
  pendingPhone          = null;
  pendingIsAdmin        = false;
  activeTab             = 'email';
  emailFieldWrap.hidden = false;
  phoneFieldWrap.hidden = true;
  contactTabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === 'email'));
}

function showAuthStep(step) {
  stepIdentify.hidden = step !== 'identify';
  stepOtp.hidden      = step !== 'otp';
}

// ── OTP boxes ─────────────────────────────────────────────
function clearOtpBoxes() {
  otpBoxes.forEach(b => {
    b.value = '';
    b.classList.remove('is-filled', 'is-popping');
  });
  otpGroup.classList.remove('is-error', 'is-shaking');
  authOtpError.textContent = '';
}

function getOtpValue() {
  return otpBoxes.map(b => b.value).join('');
}

function fillBoxes(digits) {
  digits.slice(0, otpBoxes.length).split('').forEach((d, i) => {
    if (!otpBoxes[i]) return;
    otpBoxes[i].value = d;
    otpBoxes[i].classList.add('is-filled');
    otpBoxes[i].classList.remove('is-popping');
    void otpBoxes[i].offsetWidth;
    otpBoxes[i].classList.add('is-popping');
    otpBoxes[i].addEventListener('animationend', () =>
      otpBoxes[i].classList.remove('is-popping'), { once: true }
    );
  });
  const next = Math.min(digits.length, otpBoxes.length - 1);
  otpBoxes[next].focus();
}

otpBoxes.forEach((box, i) => {
  box.addEventListener('focus', () => box.select());

  box.addEventListener('keydown', e => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (box.value) {
        box.value = '';
        box.classList.remove('is-filled');
      } else if (i > 0) {
        otpBoxes[i - 1].value = '';
        otpBoxes[i - 1].classList.remove('is-filled');
        otpBoxes[i - 1].focus();
      }
      otpGroup.classList.remove('is-error');
      authOtpError.textContent = '';
    }
    if (e.key === 'ArrowLeft'  && i > 0)                   { e.preventDefault(); otpBoxes[i - 1].focus(); }
    if (e.key === 'ArrowRight' && i < otpBoxes.length - 1) { e.preventDefault(); otpBoxes[i + 1].focus(); }
  });

  box.addEventListener('input', () => {
    const raw = box.value.replace(/\D/g, '');

    if (raw.length > 1) {
      box.value = '';
      fillBoxes(raw);
      if (raw.length >= otpBoxes.length) handleOtp();
      return;
    }

    box.value = raw;
    otpGroup.classList.remove('is-error');
    authOtpError.textContent = '';

    if (raw) {
      box.classList.add('is-filled');
      box.classList.remove('is-popping');
      void box.offsetWidth;
      box.classList.add('is-popping');
      box.addEventListener('animationend', () => box.classList.remove('is-popping'), { once: true });
      if (i < otpBoxes.length - 1) {
        otpBoxes[i + 1].focus();
      } else if (getOtpValue().length === otpBoxes.length) {
        handleOtp();
      }
    } else {
      box.classList.remove('is-filled');
    }
  });

  box.addEventListener('paste', e => {
    e.preventDefault();
    const text   = (e.clipboardData || window.clipboardData).getData('text');
    const digits = text.replace(/\D/g, '');
    if (!digits) return;
    fillBoxes(digits);
    if (digits.length >= otpBoxes.length) handleOtp();
  });
});

// ── Tab toggle ────────────────────────────────────────────
contactTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    contactTabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === activeTab));
    emailFieldWrap.hidden = activeTab !== 'email';
    phoneFieldWrap.hidden = activeTab !== 'phone';
    clearAuthErrors();
  });
});

// ── Error helpers ─────────────────────────────────────────
function clearAuthErrors() {
  [authNameError, authEmailError, authPhoneError, authOtpError].forEach(el => {
    el.textContent = '';
  });
  authLookupError.hidden = true;
  authLookupError.textContent = '';
  [authNameEl, authEmailEl, authPhoneEl].forEach(el => el.classList.remove('is-error'));
  otpGroup.classList.remove('is-error', 'is-shaking');
}

function showAuthFieldError(inputEl, errorEl, msg) {
  inputEl.classList.add('is-error');
  errorEl.textContent = msg;
}

function showOtpError(msg) {
  authOtpError.textContent = msg;
  otpGroup.classList.add('is-error', 'is-shaking');
  otpGroup.addEventListener('animationend', () => {
    otpGroup.classList.remove('is-shaking');
    clearOtpBoxes();
    otpBoxes[0].focus();
  }, { once: true });
}

// ── Step 1: Identify ──────────────────────────────────────
async function handleIdentify() {
  clearAuthErrors();
  let valid = true;

  const name = authNameEl.value.trim();
  if (!name) {
    showAuthFieldError(authNameEl, authNameError, 'נא להזין שם מלא');
    valid = false;
  }

  const contactEl  = activeTab === 'email' ? authEmailEl : authPhoneEl;
  const contactErr = activeTab === 'email' ? authEmailError : authPhoneError;
  const contact    = contactEl.value.trim();
  if (!contact) {
    showAuthFieldError(contactEl, contactErr,
      activeTab === 'email' ? 'נא להזין כתובת אימייל' : 'נא להזין מספר טלפון'
    );
    valid = false;
  }

  if (!valid) return;

  // ── Phone tab: admin or customer with real OTP ────────
  if (activeTab === 'phone') {
    const adminPhone = findAdmin(name, contact);
    const customer   = !adminPhone ? findCustomer(name, contact) : null;

    if (!adminPhone && !customer) {
      authLookupError.textContent = 'לא נמצאה רכישה עם הפרטים שהוזנו.';
      authLookupError.hidden = false;
      return;
    }

    // Mock customer (demo) — skip Vonage, use mock OTP
    if (customer && customer.otp) {
      pendingCustomer = customer;
      otpHintEl.textContent = `שלחנו קוד אימות למספר שלך`;
      showAuthStep('otp');
      otpBoxes[0].focus();
      return;
    }

    const phone = adminPhone || (() => {
      const c = contact.replace(/[-\s]/g, '');
      return c.startsWith('0') ? '+972' + c.slice(1) : c;
    })();

    authIdentifySubmit.disabled = true;
    try {
      await sendOtp(phone);
      pendingPhone    = phone;
      pendingIsAdmin  = !!adminPhone;
      pendingCustomer = customer || null;
      otpHintEl.textContent = 'שלחנו קוד אימות לטלפון שלך';
      showAuthStep('otp');
      otpBoxes[0].focus();
    } catch {
      authLookupError.textContent = 'שגיאה בשליחת קוד — נסה שוב';
      authLookupError.hidden = false;
    } finally {
      authIdentifySubmit.disabled = false;
    }
    return;
  }

  // ── Email tab: mock customer only ─────────────────────
  const customer = findCustomer(name, contact);
  if (!customer) {
    authLookupError.textContent = 'לא נמצאה רכישה עם הפרטים שהוזנו.';
    authLookupError.hidden = false;
    return;
  }

  pendingCustomer = customer;
  otpHintEl.textContent = `שלחנו קוד אימות ל${contactEl.value.trim()}`;
  showAuthStep('otp');
  otpBoxes[0].focus();
}

authIdentifySubmit.addEventListener('click', handleIdentify);
[authNameEl, authEmailEl, authPhoneEl].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') handleIdentify(); })
);

// ── Step 2: OTP ───────────────────────────────────────────
async function handleOtp() {
  const otp = getOtpValue();
  if (otp.length < otpBoxes.length) {
    otpGroup.classList.add('is-error');
    authOtpError.textContent = `נא להזין קוד בן ${otpBoxes.length} ספרות`;
    otpBoxes.find(b => !b.value)?.focus();
    return;
  }

  // ── Real Vonage OTP (admin or phone-tab customer) ────
  if (pendingPhone) {
    authOtpSubmit.disabled = true;
    try {
      const ok = await verifyOtp(pendingPhone, otp);
      if (!ok) { showOtpError('הקוד שגוי. נסה שוב.'); return; }

      if (pendingIsAdmin) {
        sessionStorage.setItem('yb-auth-admin', '1');
        window.location.href = 'admin.html';
      } else {
        sessionStorage.setItem('yb-auth-customer', JSON.stringify(pendingCustomer));
        window.location.href = 'account.html';
      }
    } catch {
      showOtpError('שגיאת תקשורת — נסה שוב.');
    } finally {
      authOtpSubmit.disabled = false;
    }
    return;
  }

  // ── Mock OTP (email-tab customer) ────────────────────
  if (otp !== pendingCustomer.otp) {
    showOtpError('הקוד שגוי. נסה שוב.');
    return;
  }

  sessionStorage.setItem('yb-auth-customer', JSON.stringify(pendingCustomer));
  window.location.href = 'account.html';
}

authOtpSubmit.addEventListener('click', handleOtp);

// ── Back ──────────────────────────────────────────────────
authBack.addEventListener('click', () => {
  clearAuthErrors();
  clearOtpBoxes();
  pendingCustomer = null;
  pendingPhone    = null;
  pendingIsAdmin  = false;
  showAuthStep('identify');
  authNameEl.focus();
});

// ── Auto-open if redirected from another page ─────────────
if (window.location.hash === '#my-area') {
  history.replaceState(null, '', window.location.pathname);
  openAuthModal();
}

// ── Triggers ──────────────────────────────────────────────
function handleMyAreaClick() {
  const hamburger = document.querySelector('.yb-header__hamburger');
  const mobileNav = document.getElementById('yb-mobile-nav');
  if (hamburger && mobileNav && !mobileNav.hidden) {
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.hidden = true;
    mobileNav.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (sessionStorage.getItem('yb-auth-customer')) {
    window.location.href = 'account.html';
  } else {
    openAuthModal();
  }
}

myAreaBtn.addEventListener('click', handleMyAreaClick);

const myAreaMobileBtn = document.getElementById('my-area-mobile-btn');
if (myAreaMobileBtn) myAreaMobileBtn.addEventListener('click', handleMyAreaClick);

const faqAccountLink = document.getElementById('faq-account-link');
if (faqAccountLink) faqAccountLink.addEventListener('click', e => { e.preventDefault(); handleMyAreaClick(); });
authClose.addEventListener('click', closeAuthModal);
authOverlay.addEventListener('click', closeAuthModal);
authModal.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuthModal(); });
