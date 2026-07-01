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
    setupReviewForms();
    setupDownloadButtons();
  }

  function formatReviewName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return fullName;
    return `${parts[0]}.${parts[1].charAt(0)}`;
  }

  function renderPurchaseCard(p) {
    const isDigital      = p.type === 'digital';
    const coverLetter    = p.bookTitle.charAt(0);
    const formattedDate  = new Date(p.date).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    const storedReviews  = JSON.parse(localStorage.getItem('yb-reviews') || '[]');
    const existingReview = storedReviews.find(r => r.orderId === p.id);
    const reviewed       = !!existingReview;

    const savedName = reviewed ? existingReview.name : formatReviewName(customer.name);
    const savedText = reviewed ? existingReview.text : '';

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
          ${isDigital ? (() => {
              const MAX_DL   = 3;
              const dlData   = JSON.parse(localStorage.getItem('yb-downloads') || '{}');
              const dlCount  = !Array.isArray(dlData) ? (dlData[p.id] || 0) : 0;
              const remaining = MAX_DL - dlCount;
              const exhausted = dlCount >= MAX_DL;
              return `
                <div class="yb-account__download-area">
                  <a class="yb-account__download-btn${exhausted ? ' is-done' : ''}" href="#"
                     data-book-id="${p.bookId || p.id}"
                     data-book-title="${p.bookTitle}"
                     data-order-id="${p.id}"
                     ${exhausted ? 'aria-disabled="true"' : ''}
                     aria-label="הורדת ${p.bookTitle}">
                    ${exhausted ? 'הספר הורד ✓' : 'הורדת הספר'}
                  </a>
                  <span class="yb-account__download-status" ${dlCount > 0 && !exhausted ? '' : 'hidden'}>
                    הורד בהצלחה · נותרו עוד ${remaining} הורדות
                  </span>
                </div>
                <p class="yb-account__download-note" ${exhausted ? '' : 'hidden'}>
                  הספר ירד בהצלחה. נתקלת בבעיה?
                  <a href="#message-form">פנה ליונתן מהאזור האישי</a>
                </p>
                <p class="yb-account__download-hint">
                  נתקלת בבעיה? <a class="yb-account__scroll-link" href="#message-form">פנה ליונתן</a>
                </p>`;
            })() : ''}
          <div class="yb-account__review-section" id="review-section-${p.id}">
            <div class="yb-account__review-header">
              <h4 class="yb-account__review-title">חוות דעת הקורא</h4>
              <p class="yb-account__review-sub">״דעתך משמעותית לי, אשמח לשמוע אותה״</p>
            </div>
            ${!reviewed
              ? `<button type="button" class="yb-account__review-toggle has-ripple" id="review-toggle-${p.id}">כתוב ביקורת</button>`
              : ''}
            <form class="yb-account__review-form" id="review-form-${p.id}" ${reviewed ? '' : 'hidden'} novalidate>
              <div class="yb-field">
                <label class="yb-field__label">שם הספר</label>
                <input class="yb-field__input yb-account__review-book" type="text"
                  value="${p.bookTitle}" readonly tabindex="-1" aria-label="שם הספר (לא לעריכה)" />
              </div>
              <div class="yb-field">
                <label class="yb-field__label" for="review-name-${p.id}">
                  שם לתצוגה <span class="yb-field__note">ניתן לשנות</span>
                </label>
                <input class="yb-field__input yb-account__review-name" type="text"
                  id="review-name-${p.id}" value="${savedName}" ${reviewed ? 'disabled' : ''} />
              </div>
              <div class="yb-field">
                <label class="yb-field__label" for="review-text-${p.id}">
                  הביקורת שלך <span class="yb-field__req">*</span>
                </label>
                <textarea class="yb-field__input yb-field__input--textarea yb-account__review-text"
                  id="review-text-${p.id}"
                  placeholder="שתף את דעתך על הספר..."
                  aria-describedby="review-text-error-${p.id}"
                  ${reviewed ? 'disabled' : ''}>${savedText}</textarea>
                <p class="yb-field__error" id="review-text-error-${p.id}" aria-live="polite"></p>
              </div>
              <div class="yb-account__review-form-actions">
                <button class="primary-button has-ripple" type="submit"
                  id="review-submit-${p.id}" ${reviewed ? 'hidden' : ''}>שלח ביקורת</button>
              </div>
              <div class="yb-account__review-status" id="review-status-${p.id}" ${reviewed ? '' : 'hidden'}>
                <p class="yb-account__review-sent">✓ הביקורת נקלטה במערכת ותתפרסם בהקדם</p>
                <button type="button" class="yb-account__review-edit has-ripple"
                  id="review-edit-${p.id}">ערוך</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  function setupReviewForms() {
    customer.purchases.forEach(p => {
      const form      = document.getElementById(`review-form-${p.id}`);
      const toggleBtn = document.getElementById(`review-toggle-${p.id}`);
      const submitBtn = document.getElementById(`review-submit-${p.id}`);
      const statusBar = document.getElementById(`review-status-${p.id}`);
      const editBtn   = document.getElementById(`review-edit-${p.id}`);
      const textEl    = form.querySelector('.yb-account__review-text');
      const nameEl    = form.querySelector('.yb-account__review-name');
      const errorEl   = form.querySelector('.yb-field__error');

      if (!form) return;

      // Toggle (only present when not yet reviewed)
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const isOpen = !form.hidden;
          if (isOpen) {
            form.hidden = true;
            toggleBtn.textContent = 'כתוב ביקורת';
            toggleBtn.classList.remove('is-open');
          } else {
            form.hidden = false;
            form.classList.remove('is-entering');
            void form.offsetWidth;
            form.classList.add('is-entering');
            form.addEventListener('animationend', () => form.classList.remove('is-entering'), { once: true });
            toggleBtn.textContent = 'סגור';
            toggleBtn.classList.add('is-open');
            textEl.focus();
          }
        });
      }

      // Edit button — re-enables the form for editing
      editBtn.addEventListener('click', () => {
        [nameEl, textEl].forEach(el => { el.disabled = false; });
        submitBtn.hidden = false;
        statusBar.hidden = true;
        textEl.focus();
      });

      // Submit (shared: first send + re-send after edit)
      form.addEventListener('submit', e => {
        e.preventDefault();
        const text = textEl.value.trim();

        errorEl.textContent = '';
        textEl.classList.remove('is-error');

        if (!text) {
          textEl.classList.add('is-error');
          errorEl.textContent = 'נא להזין טקסט ביקורת';
          textEl.focus();
          return;
        }

        // Save or update localStorage
        const reviews = JSON.parse(localStorage.getItem('yb-reviews') || '[]');
        const idx = reviews.findIndex(r => r.orderId === p.id);
        const entry = {
          orderId:   p.id,
          bookId:    p.bookId || p.id,
          bookTitle: p.bookTitle,
          name:      nameEl.value.trim() || customer.name,
          text,
          date:      new Date().toISOString()
        };
        if (idx >= 0) reviews[idx] = entry;
        else reviews.push(entry);
        localStorage.setItem('yb-reviews', JSON.stringify(reviews));

        // Disable fields, hide submit
        [nameEl, textEl].forEach(el => { el.disabled = true; });
        submitBtn.hidden = true;
        if (toggleBtn) toggleBtn.hidden = true;

        // Fade in status bar
        statusBar.style.opacity = '0';
        statusBar.hidden = false;
        void statusBar.offsetWidth;
        statusBar.style.transition = 'opacity 220ms';
        statusBar.style.opacity = '1';
      });
    });
  }

  // ── Download buttons ─────────────────────────────────────
  function setupDownloadButtons() {
    const MAX_DL = 3;
    const STORAGE_PATHS = {
      'book-01': 'books/book02.pdf',
      'book-02': 'books/book01.pdf'
    };

    document.querySelectorAll('.yb-account__download-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        if (btn.getAttribute('aria-disabled') === 'true') return;

        const bookId = btn.dataset.bookId;
        const path   = STORAGE_PATHS[bookId];
        if (!path || !window.ybStorage) return;

        btn.textContent = 'מכין הורדה...';
        btn.setAttribute('aria-disabled', 'true');

        try {
          const url      = await window.ybStorage.ref(path).getDownloadURL();
          const response = await fetch(url);
          const blob     = await response.blob();
          const blobUrl  = URL.createObjectURL(blob);
          const a        = document.createElement('a');
          a.href         = blobUrl;
          a.download     = `${btn.dataset.bookTitle}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

          const orderId = btn.dataset.orderId;
          const dlData  = JSON.parse(localStorage.getItem('yb-downloads') || '{}');
          const saved   = Array.isArray(dlData) ? {} : dlData;
          const newCount = (saved[orderId] || 0) + 1;
          saved[orderId] = newCount;
          localStorage.setItem('yb-downloads', JSON.stringify(saved));

          const remaining = MAX_DL - newCount;
          const statusEl  = btn.nextElementSibling;
          const note      = btn.closest('.yb-account__download-area').nextElementSibling;

          if (remaining > 0) {
            btn.textContent = 'הורדת הספר';
            btn.removeAttribute('aria-disabled');
            if (statusEl) {
              statusEl.textContent = `הורד בהצלחה · נותרו עוד ${remaining} הורדות`;
              statusEl.hidden = false;
            }
          } else {
            btn.textContent = 'הספר הורד ✓';
            btn.classList.add('is-done');
            if (statusEl) statusEl.hidden = true;
            if (note) note.hidden = false;
          }

        } catch {
          btn.textContent = 'שגיאה — נסה שוב';
          setTimeout(() => {
            btn.textContent = 'הורדת הספר';
            btn.removeAttribute('aria-disabled');
          }, 2000);
        }
      });
    });
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

  const CONTACT_FUNCTION = 'https://europe-west1-yonatan-books.cloudfunctions.net/sendContactEmail';

  msgForm.addEventListener('submit', async e => {
    e.preventDefault();
    msgError.textContent = '';
    msgText.classList.remove('is-error');

    if (!msgText.value.trim()) {
      msgText.classList.add('is-error');
      msgError.textContent = 'נא להזין הודעה לפני השליחה';
      msgText.focus();
      return;
    }

    const submitBtn = msgForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'שולח...';

    try {
      const res = await fetch(CONTACT_FUNCTION, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: customer.name, email: customer.email || '', message: msgText.value.trim() })
      });

      if (!res.ok) throw new Error('send failed');

      msgText.value  = '';
      msgSent.hidden = false;
      setTimeout(() => { msgSent.hidden = true; }, 6000);

    } catch {
      msgError.textContent = 'שגיאה בשליחה — נסה שוב או פנה ישירות למייל';
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'שליחת הודעה';
    }
  });
}());
