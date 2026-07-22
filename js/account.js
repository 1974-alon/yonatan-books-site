/* =========================================================
   ACCOUNT PAGE — Personal area
   Reads customer orders from Firestore via Cloud Functions.
========================================================= */

(function () {
  const raw = sessionStorage.getItem('yb-auth-customer');
  if (!raw) { window.location.href = 'index.html'; return; }

  const customer = JSON.parse(raw);
  const CF_BASE  = 'https://europe-west1-yonatan-books.cloudfunctions.net';

  document.getElementById('account-name').textContent = customer.name;

  const list = document.getElementById('purchases-list');
  list.innerHTML = renderPurchaseSkeleton(2);

  let reviewsByOrder = {};

  // ── Custom confirm modal (no native confirm()) ────────────
  const reviewDeleteModal   = document.getElementById('review-delete-modal');
  const reviewDeleteOverlay = document.getElementById('review-delete-overlay');
  const reviewDeleteConfirm = document.getElementById('review-delete-confirm');
  const reviewDeleteCancel  = document.getElementById('review-delete-cancel');
  const reviewDeleteClose   = document.getElementById('review-delete-close');

  function askConfirmDeleteReview() {
    return new Promise(resolve => {
      reviewDeleteModal.hidden = false;

      function cleanup(result) {
        reviewDeleteModal.hidden = true;
        reviewDeleteConfirm.removeEventListener('click', onConfirm);
        reviewDeleteCancel.removeEventListener('click', onCancel);
        reviewDeleteClose.removeEventListener('click', onCancel);
        reviewDeleteOverlay.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onConfirm() { cleanup(true); }
      function onCancel()  { cleanup(false); }

      reviewDeleteConfirm.addEventListener('click', onConfirm);
      reviewDeleteCancel.addEventListener('click', onCancel);
      reviewDeleteClose.addEventListener('click', onCancel);
      reviewDeleteOverlay.addEventListener('click', onCancel);
    });
  }

  // ── Fetch real orders from Firestore ─────────────────────
  fetch(`${CF_BASE}/getCustomerOrders`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(
      customer.phone
        ? { phone: customer.phone }
        : { email: customer.email }
    )
  })
    .then(r => r.json())
    .then(async data => {
      const orders = data.orders || [];
      if (orders.length === 0) {
        list.innerHTML = '<p class="yb-account__no-purchases yb-fade-in">לא נמצאו רכישות בחשבון זה.</p>';
        return;
      }

      try {
        const reviewsRes  = await fetch(`${CF_BASE}/getReviewsForOrders`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ orderIds: orders.map(o => o.id) })
        });
        const reviewsData = await reviewsRes.json();
        reviewsByOrder = Object.fromEntries((reviewsData.reviews || []).map(r => [r.orderId, r]));
      } catch { reviewsByOrder = {}; }

      list.innerHTML = orders.map(renderPurchaseCard).join('');
      setupReviewForms(orders);
      setupDownloadButtons();
    })
    .catch(() => {
      list.innerHTML = '<p class="yb-account__no-purchases yb-fade-in">שגיאה בטעינת הרכישות — נסה לרענן.</p>';
    });

  // ── Render ────────────────────────────────────────────────
  function renderPurchaseSkeleton(count) {
    const card = `
      <div class="yb-account__purchase-card">
        <span class="yb-skeleton" style="width:56px;height:76px;flex-shrink:0;"></span>
        <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
          <span class="yb-skeleton" style="width:55%;height:20px;"></span>
          <span class="yb-skeleton" style="width:35%;height:14px;"></span>
          <span class="yb-skeleton" style="width:100%;max-width:220px;height:38px;margin-top:8px;"></span>
        </div>
      </div>`;
    return card.repeat(count);
  }

  function physicalStatusLabel(status) {
    if (status === 'preparing') return { cls: 'preparing', text: 'מתכונן לשליחה' };
    if (status === 'shipped')   return { cls: 'shipped',   text: 'נשלח' };
    return { cls: 'received', text: 'התקבל' };
  }

  function formatReviewName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return fullName;
    return `${parts[0]}.${parts[1].charAt(0)}`;
  }

  function renderPurchaseCard(p, i) {
    const isDigital     = p.type === 'digital';
    const coverLetter   = p.bookTitle.charAt(0);
    const formattedDate = new Date(p.date).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    const existingReview = reviewsByOrder[p.id];
    const reviewed       = !!existingReview;
    const savedName      = reviewed ? existingReview.name : formatReviewName(customer.name);
    const savedText      = reviewed ? existingReview.text : '';
    const reviewStatusText = !existingReview ? '' : existingReview.status === 'approved'
      ? '✓ הביקורת מאושרת ומוצגת באתר'
      : existingReview.status === 'rejected'
      ? 'הביקורת לא אושרה לפרסום. ניתן לערוך ולשלוח מחדש.'
      : '✓ הביקורת נקלטה במערכת וממתינה לאישור יונתן';

    const MAX_DL    = 3;
    const dlCount   = p.downloads || 0;
    const remaining = MAX_DL - dlCount;
    const exhausted = dlCount >= MAX_DL;

    const physicalStatus = physicalStatusLabel(p.status);

    return `
      <div class="yb-account__purchase-card yb-fade-in" style="animation-delay:${i * 70}ms">
        <div class="yb-account__purchase-cover" aria-hidden="true">${coverLetter}</div>
        <div class="yb-account__purchase-info">
          <h3 class="yb-account__purchase-title">${p.bookTitle}</h3>
          <div class="yb-account__purchase-meta">
            <span class="yb-account__purchase-badge yb-account__purchase-badge--${isDigital ? 'digital' : 'physical'}">
              ${isDigital ? 'הורדה דיגיטלית' : 'משלוח פיזי'}
            </span>
            ${!isDigital ? `<span class="yb-account__status-badge yb-account__status-badge--${physicalStatus.cls}">${physicalStatus.text}</span>` : ''}
            <span class="yb-account__purchase-detail">${formattedDate}</span>
          </div>
          ${isDigital ? `
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
            </p>` : ''}
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
                <p class="yb-account__review-sent${existingReview && existingReview.status === 'rejected' ? ' yb-account__review-sent--rejected' : ''}" id="review-sent-text-${p.id}">${reviewStatusText}</p>
                <button type="button" class="yb-account__review-edit has-ripple"
                  id="review-edit-${p.id}">ערוך</button>
                <button type="button" class="yb-account__review-delete has-ripple"
                  id="review-delete-${p.id}">מחק ביקורת</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  // ── Review forms ──────────────────────────────────────────
  function setupReviewForms(orders) {
    orders.forEach(p => {
      const form      = document.getElementById(`review-form-${p.id}`);
      const toggleBtn = document.getElementById(`review-toggle-${p.id}`);
      const submitBtn = document.getElementById(`review-submit-${p.id}`);
      const statusBar = document.getElementById(`review-status-${p.id}`);
      const editBtn   = document.getElementById(`review-edit-${p.id}`);
      const deleteBtn = document.getElementById(`review-delete-${p.id}`);
      const sentText  = document.getElementById(`review-sent-text-${p.id}`);
      if (!form) return;

      const textEl  = form.querySelector('.yb-account__review-text');
      const nameEl  = form.querySelector('.yb-account__review-name');
      const errorEl = form.querySelector('.yb-field__error');

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

      editBtn.addEventListener('click', () => {
        [nameEl, textEl].forEach(el => { el.disabled = false; });
        submitBtn.hidden = false;
        statusBar.hidden = true;
        textEl.focus();
      });

      form.addEventListener('submit', async e => {
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

        const name = nameEl.value.trim() || customer.name;
        submitBtn.disabled = true;
        try {
          const res = await fetch(`${CF_BASE}/submitReview`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ orderId: p.id, bookId: p.bookId || p.id, bookTitle: p.bookTitle, name, text })
          });
          if (!res.ok) throw new Error('submit_failed');

          reviewsByOrder[p.id] = { orderId: p.id, name, text, status: 'pending' };
          sentText.textContent = '✓ הביקורת נקלטה במערכת וממתינה לאישור יונתן';
          sentText.classList.remove('yb-account__review-sent--rejected');
          [nameEl, textEl].forEach(el => { el.disabled = true; });
          submitBtn.hidden = true;
          if (toggleBtn) toggleBtn.hidden = true;
          statusBar.style.opacity = '0';
          statusBar.hidden = false;
          void statusBar.offsetWidth;
          statusBar.style.transition = 'opacity 220ms';
          statusBar.style.opacity = '1';
        } catch (err) {
          console.error('submitReview failed:', err);
          alert('שליחת הביקורת נכשלה — נסה שוב');
        } finally {
          submitBtn.disabled = false;
        }
      });

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!(await askConfirmDeleteReview())) return;
          deleteBtn.disabled = true;
          try {
            const res = await fetch(`${CF_BASE}/deleteReview`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ orderId: p.id })
            });
            if (!res.ok) throw new Error('delete_failed');

            delete reviewsByOrder[p.id];
            statusBar.hidden = true;
            nameEl.value = formatReviewName(customer.name);
            textEl.value = '';
            [nameEl, textEl].forEach(el => { el.disabled = false; });
            submitBtn.hidden = false;
            form.hidden = true;
            if (toggleBtn) {
              toggleBtn.hidden = false;
              toggleBtn.textContent = 'כתוב ביקורת';
              toggleBtn.classList.remove('is-open');
            }
          } catch (err) {
            console.error('deleteReview failed:', err);
            alert('מחיקת הביקורת נכשלה — נסה שוב');
          } finally {
            deleteBtn.disabled = false;
          }
        });
      }
    });
  }

  // ── Download buttons ──────────────────────────────────────
  function setupDownloadButtons() {
    const STORAGE_PATHS = {
      'book-01': 'books/book02.pdf',
      'book-02': 'books/book01.pdf'
    };

    document.querySelectorAll('.yb-account__download-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        if (btn.getAttribute('aria-disabled') === 'true') return;

        const bookId  = btn.dataset.bookId;
        const orderId = btn.dataset.orderId;
        const path    = STORAGE_PATHS[bookId];
        if (!path || !window.ybStorage) return;

        btn.textContent = 'מכין הורדה...';
        btn.setAttribute('aria-disabled', 'true');

        try {
          // רישום הורדה ב-Firestore
          const trackRes = await fetch(`${CF_BASE}/incrementDownload`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ orderId })
          });

          if (trackRes.status === 403) {
            btn.textContent = 'הספר הורד ✓';
            btn.classList.add('is-done');
            return;
          }

          const trackData = await trackRes.json();

          // הורדה מ-Firebase Storage
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

          const remaining = trackData.remaining || 0;
          const statusEl  = btn.nextElementSibling;
          const note      = btn.closest('.yb-account__download-area')?.nextElementSibling;

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
      const res = await fetch(`${CF_BASE}/sendContactEmail`, {
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
