/* =========================================================
   ACCOUNT PAGE — Personal area
   Reads customer data from sessionStorage after auth flow.
   Future: replace with Firebase Auth session check + Firestore.
========================================================= */

(function () {
  const raw = sessionStorage.getItem('yb-auth-customer');
  if (!raw) {
    window.location.href = 'index.html';
    return;
  }

  const customer = JSON.parse(raw);

  // ── Name ─────────────────────────────────────────────────
  document.getElementById('account-name').textContent = customer.name;

  // ── Purchases ─────────────────────────────────────────────
  const list = document.getElementById('purchases-list');

  if (!customer.purchases || customer.purchases.length === 0) {
    list.innerHTML = '<p class="yb-account__no-purchases">לא נמצאו רכישות בחשבון זה.</p>';
  } else {
    list.innerHTML = customer.purchases.map(renderPurchaseCard).join('');
  }

  function renderPurchaseCard(p) {
    const isDigital    = p.type === 'digital';
    const coverLetter  = p.bookTitle.charAt(0);
    const formattedDate = new Date(p.date).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    return `
      <div class="yb-account__purchase-card">
        <div class="yb-account__purchase-cover" aria-hidden="true">${coverLetter}</div>
        <div class="yb-account__purchase-info">
          <h3 class="yb-account__purchase-title">${p.bookTitle}</h3>
          <div class="yb-account__purchase-meta">
            <span class="yb-account__purchase-badge yb-account__purchase-badge--${isDigital ? 'digital' : 'physical'}">
              ${isDigital ? 'הורדה דיגיטלית' : 'משלוח פיזי'}
            </span>
            <span class="yb-account__purchase-detail">סטטוס: ${p.status}</span>
            <span class="yb-account__purchase-detail">${formattedDate}</span>
          </div>
          ${isDigital
            ? `<a class="yb-account__download-btn" href="#" aria-label="הורדת ${p.bookTitle}">הורדת הספר</a>`
            : ''}
        </div>
      </div>
    `;
  }

  // ── Logout ────────────────────────────────────────────────
  document.querySelectorAll('.js-logout').forEach(btn =>
    btn.addEventListener('click', () => {
      sessionStorage.removeItem('yb-auth-customer');
      window.location.href = 'index.html';
    })
  );

  // ── Message form ──────────────────────────────────────────
  const msgForm  = document.getElementById('message-form');
  const msgText  = document.getElementById('msg-text');
  const msgError = document.getElementById('msg-text-error');
  const msgSent  = document.getElementById('msg-sent');

  msgForm.addEventListener('submit', e => {
    e.preventDefault();
    msgError.textContent = '';
    msgText.classList.remove('is-error');

    if (!msgText.value.trim()) {
      msgText.classList.add('is-error');
      msgError.textContent = 'נא להזין הודעה לפני השליחה';
      msgText.focus();
      return;
    }

    msgText.value  = '';
    msgSent.hidden = false;
    setTimeout(() => { msgSent.hidden = true; }, 6000);
  });
}());
