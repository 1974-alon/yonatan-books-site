/* =========================================================
   ADMIN — Orders management
   Data source: Firestore via getAdminOrders Cloud Function
========================================================= */

const CF_ADMIN_ORDERS = 'https://europe-west1-yonatan-books.cloudfunctions.net/getAdminOrders';

let _cachedOrders = [];
let _sortField = 'num';
let _sortDir   = 'desc'; // ברירת מחדל: האחרונה ראשונה
let _page      = 1;
const PAGE_SIZE = 10;

function adminAuthHeaders() {
  const token = sessionStorage.getItem('yb-admin-token') || '';
  return { 'Authorization': `Bearer ${token}` };
}

function handleAdminAuthFailure(res) {
  if (res.status === 401) {
    sessionStorage.removeItem('yb-auth-admin');
    sessionStorage.removeItem('yb-admin-token');
    window.location.href = 'index.html';
    return true;
  }
  return false;
}

// ── Custom confirm modal (no native confirm()) ──────────────
function askAdminConfirm() {
  const modal   = document.getElementById('adm-confirm-modal');
  const overlay = document.getElementById('adm-confirm-overlay');
  const okBtn   = document.getElementById('adm-confirm-ok');
  const cancelBtn = document.getElementById('adm-confirm-cancel');

  return new Promise(resolve => {
    modal.hidden = false;

    function cleanup(result) {
      modal.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk()     { cleanup(true); }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onCancel);
  });
}

function showPendingReviewsAlert(count) {
  const modal   = document.getElementById('adm-review-alert-modal');
  const overlay = document.getElementById('adm-review-alert-overlay');
  const closeBtn = document.getElementById('adm-review-alert-close');
  const text    = document.getElementById('adm-review-alert-text');

  text.textContent = count === 1
    ? 'ממתינה לך ביקורת אחת לאישור. פתח את פרטי ההזמנה המסומנת בכתום כדי לאשר או למחוק אותה.'
    : `ממתינות לך ${count} ביקורות לאישור. פתח את פרטי ההזמנות המסומנות בכתום כדי לאשר או למחוק אותן.`;
  modal.hidden = false;

  function close() { modal.hidden = true; }
  closeBtn.addEventListener('click', close, { once: true });
  overlay.addEventListener('click', close, { once: true });
}

async function fetchOrders() {
  const res = await fetch(CF_ADMIN_ORDERS, { headers: adminAuthHeaders() });
  if (handleAdminAuthFailure(res)) return [];
  const data = await res.json();
  // API מחזיר DESC — הופכים ל-ASC כדי ש-#001 יהיה ראשון
  _cachedOrders = (data.orders || []).reverse();
  return _cachedOrders;
}

function getOrders() {
  return _cachedOrders;
}

function saveOrders(orders) {
  _cachedOrders = orders;
}

function getSortedOrders() {
  const orders = [..._cachedOrders];
  orders.sort((a, b) => {
    let va, vb;
    if (_sortField === 'date') {
      va = new Date(a.date).getTime();
      vb = new Date(b.date).getTime();
    } else {
      // num — לפי סדר ה-index (כרונולוגי)
      va = _cachedOrders.indexOf(a);
      vb = _cachedOrders.indexOf(b);
    }
    return _sortDir === 'asc' ? va - vb : vb - va;
  });
  return orders;
}

function updateSortIcons() {
  ['num', 'date'].forEach(field => {
    const el = document.getElementById(`sort-icon-${field}`);
    if (!el) return;
    if (field === _sortField) {
      el.textContent = _sortDir === 'asc' ? '↑' : '↓';
      el.classList.add('is-active');
    } else {
      el.textContent = '↕';
      el.classList.remove('is-active');
    }
  });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function statusLabel(order) {
  if (order.type === 'digital') {
    if (order.status === 'paid' || order.status === 'pending') return { cls: 'adm-status--pending',    text: 'ממתין להורדה' };
    if (order.status === 'downloaded')                         return { cls: 'adm-status--downloaded', text: 'הורד' };
  } else {
    if (order.status === 'paid' || order.status === 'waiting')  return { cls: 'adm-status--waiting',    text: 'התקבל' };
    if (order.status === 'preparing')                           return { cls: 'adm-status--preparing',  text: 'מתכונן לשליחה' };
    if (order.status === 'shipped')                             return { cls: 'adm-status--shipped',    text: 'נשלח' };
  }
  return { cls: '', text: order.status };
}

function renderSummary(orders) {
  document.getElementById('adm-total').textContent   = orders.length;
  document.getElementById('adm-revenue').textContent = '₪' + orders.reduce((s, o) => s + o.price, 0);
  document.getElementById('adm-pending').textContent = orders.filter(o => o.type === 'physical' && o.status === 'waiting').length;
}

function renderPager(totalOrders) {
  const totalPages = Math.ceil(totalOrders / PAGE_SIZE);
  let pager = document.getElementById('adm-pager');
  if (!pager) return;

  if (totalPages <= 1) { pager.innerHTML = ''; return; }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  pager.innerHTML = `
    <button class="adm-pager-btn" data-page="${_page - 1}" ${_page === 1 ? 'disabled' : ''}>הקודם <span dir="ltr">&#x2039;</span></button>
    ${pages.map(p => `<button class="adm-pager-btn ${p === _page ? 'is-active' : ''}" data-page="${p}">${p}</button>`).join('')}
    <button class="adm-pager-btn" data-page="${_page + 1}" ${_page === totalPages ? 'disabled' : ''}><span dir="ltr">&#x203a;</span> הבא</button>
  `;

  pager.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p < 1 || p > totalPages || p === _page) return;
      _page = p;
      renderTable(_cachedOrders);
    });
  });
}

function renderReviewSection(o) {
  const r = o.review;
  let statusBlock = '';
  if (r.status === 'pending') {
    statusBlock = `
      <div class="adm-review__actions">
        <button class="adm-btn adm-btn--approve" data-id="${o.id}" data-action="approve-review">אשר</button>
        <button class="adm-btn adm-btn--reject" data-id="${o.id}" data-action="reject-review">מחק</button>
      </div>`;
  } else if (r.status === 'approved') {
    statusBlock = '<span class="adm-review__badge adm-review__badge--approved">✓ מאושרת ומוצגת באתר</span>';
  } else {
    statusBlock = '<span class="adm-review__badge adm-review__badge--rejected">הביקורת נמחקה</span>';
  }

  return `
    <div class="adm-review">
      <span class="adm-detail__label">ביקורת לקוח</span>
      <div class="adm-review__body${r.status === 'rejected' ? ' adm-review__body--rejected' : ''}">
        <p class="adm-review__text">"${r.text}"</p>
        <p class="adm-review__by">— ${r.name}</p>
      </div>
      ${statusBlock}
    </div>`;
}

function renderTable(orders) {
  const tbody  = document.getElementById('adm-tbody');
  const sorted = getSortedOrders();
  const total  = _cachedOrders.length;

  updateSortIcons();

  const start   = (_page - 1) * PAGE_SIZE;
  const pageOrders = sorted.slice(start, start + PAGE_SIZE);

  renderPager(total);

  tbody.innerHTML = pageOrders.map((o) => {
    const idx = _cachedOrders.indexOf(o);
    const orderNum = String(idx + 1).padStart(3, '0');
    const st      = statusLabel(o);
    const dlText  = o.type === 'digital' ? `${o.downloads}/3` : '—';
    const addr    = o.address || '—';

    let actionBtn = '';
    if (o.type === 'digital') {
      actionBtn = `<button class="adm-btn adm-btn--grant" data-id="${o.id}" data-action="grant">הענק 3 הורדות</button>`;
    } else if (o.status === 'shipped') {
      actionBtn = `<button class="adm-btn adm-btn--done" disabled>נשלח ✓</button>`;
    } else if (o.status === 'preparing') {
      actionBtn = `<button class="adm-btn adm-btn--ship" data-id="${o.id}" data-action="ship">סמן כנשלח</button>`;
    } else {
      actionBtn = `<button class="adm-btn adm-btn--prepare" data-id="${o.id}" data-action="prepare">התחל הכנה למשלוח</button>`;
    }

    const pendingReview = o.review && o.review.status === 'pending';

    return `
      <tr class="adm-row${pendingReview ? ' adm-row--review-pending' : ''}" data-id="${o.id}" tabindex="0" role="button" aria-expanded="false">
        <td>${o.adminNotes ? '<span class="adm-note-flag" title="קיימת הערת אדמין להזמנה זו">★</span>' : ''}${pendingReview ? '<span class="adm-review-flag" title="ביקורת ממתינה לאישור">★</span>' : ''}<span class="adm-order-id">#${orderNum}</span></td>
        <td>${o.name}</td>
        <td>${formatDate(o.date)}</td>
        <td><strong>${o.bookTitle}</strong></td>
        <td>₪${o.price}</td>
        <td><span class="adm-badge adm-badge--${o.type}">${o.type === 'digital' ? 'דיגיטלי' : 'פיזי'}</span></td>
        <td><span class="adm-status ${st.cls}">${st.text}</span></td>
        <td><span class="adm-dl">${dlText}</span></td>
        <td class="adm-toggle-cell"><span class="adm-toggle-icon" aria-hidden="true">▼</span></td>
      </tr>
      <tr class="adm-detail-row" data-for="${o.id}">
        <td colspan="9" class="adm-detail-td">
          <div class="adm-detail-inner">
            <div class="adm-detail">
              <div class="adm-detail__fields">
                <div class="adm-detail__field">
                  <span class="adm-detail__label">מייל</span>
                  <a class="adm-email-link" href="mailto:${o.email}">${o.email}</a>
                </div>
                <div class="adm-detail__field">
                  <span class="adm-detail__label">טלפון</span>
                  <span dir="ltr">${o.phone}</span>
                </div>
                <div class="adm-detail__field">
                  <span class="adm-detail__label">כתובת</span>
                  <span>${addr && addr !== 'null' ? addr : '—'}</span>
                </div>
                ${o.notes ? `<div class="adm-detail__field adm-detail__field--full">
                  <span class="adm-detail__label">הערות</span>
                  <span>${o.notes}</span>
                </div>` : ''}
              </div>
              <div class="adm-detail__actions">
                ${actionBtn}
              </div>
            </div>
            <div class="adm-notes">
              <span class="adm-detail__label">הערות אדמין</span>
              <input type="text" class="adm-notes__textarea" data-id="${o.id}" placeholder="הערה פנימית — לא מוצגת ללקוח" value="${(o.adminNotes || '').replace(/"/g, '&quot;')}">

              <div class="adm-notes__row">
                <span class="adm-notes__saved" data-for="${o.id}"></span>
                <button class="adm-btn adm-btn--notes" data-id="${o.id}" data-action="save-notes">שמור הערה</button>
              </div>
            </div>
            ${o.review ? renderReviewSection(o) : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.adm-row').forEach(row => {
    row.addEventListener('click', () => toggleDetail(row));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggleDetail(row); });
  });

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const orders = getOrders();
      const order  = orders.find(o => o.id === btn.dataset.id);
      if (!order) return;

      if (btn.dataset.action === 'grant') {
        const dlData = JSON.parse(localStorage.getItem('yb-downloads') || '{}');
        dlData[order.id] = 0;
        localStorage.setItem('yb-downloads', JSON.stringify(dlData));
        order.downloads = 0;
        order.status    = 'pending';
        saveOrders(orders);
        renderTable(orders);
        renderSummary(orders);
      }

      if (btn.dataset.action === 'save-notes') {
        const textarea = document.querySelector(`.adm-notes__textarea[data-id="${order.id}"]`);
        const savedEl  = document.querySelector(`.adm-notes__saved[data-for="${order.id}"]`);
        const adminNotes = textarea.value;
        btn.disabled = true;
        try {
          const res = await fetch(`${CF_ADMIN_ORDERS.replace('getAdminOrders', 'updateOrderNotes')}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
            body:    JSON.stringify({ orderId: order.id, adminNotes })
          });
          if (handleAdminAuthFailure(res)) return;
          if (!res.ok) throw new Error('update_failed');
          order.adminNotes = adminNotes;
          saveOrders(orders);
          const orderIdCell = document.querySelector(`.adm-row[data-id="${order.id}"] td:first-child`);
          if (orderIdCell) {
            const hasFlag = !!orderIdCell.querySelector('.adm-note-flag');
            if (adminNotes && !hasFlag) {
              orderIdCell.insertAdjacentHTML('afterbegin', '<span class="adm-note-flag" title="קיימת הערת אדמין להזמנה זו">★</span>');
            } else if (!adminNotes && hasFlag) {
              orderIdCell.querySelector('.adm-note-flag').remove();
            }
          }
          if (savedEl) {
            savedEl.textContent = 'נשמר ✓';
            setTimeout(() => { savedEl.textContent = ''; }, 2000);
          }
        } catch (err) {
          console.error('updateOrderNotes failed:', err);
          alert('שמירת ההערה נכשלה — נסה שוב');
        } finally {
          btn.disabled = false;
        }
      }

      if (btn.dataset.action === 'approve-review' || btn.dataset.action === 'reject-review') {
        const newStatus = btn.dataset.action === 'approve-review' ? 'approved' : 'rejected';
        if (newStatus === 'rejected' && !(await askAdminConfirm())) return;

        btn.disabled = true;
        try {
          const res = await fetch(`${CF_ADMIN_ORDERS.replace('getAdminOrders', 'updateReviewStatus')}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
            body:    JSON.stringify({ orderId: order.id, status: newStatus })
          });
          if (handleAdminAuthFailure(res)) return;
          if (!res.ok) throw new Error('update_failed');
          order.review.status = newStatus;
          saveOrders(orders);
          renderTable(orders);
        } catch (err) {
          console.error('updateReviewStatus failed:', err);
          btn.disabled = false;
          alert('העדכון נכשל — נסה שוב');
        }
      }

      if (btn.dataset.action === 'prepare' || btn.dataset.action === 'ship') {
        const newStatus = btn.dataset.action === 'prepare' ? 'preparing' : 'shipped';
        btn.disabled = true;
        try {
          const res = await fetch(`${CF_ADMIN_ORDERS.replace('getAdminOrders', 'updateOrderStatus')}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
            body:    JSON.stringify({ orderId: order.id, status: newStatus })
          });
          if (handleAdminAuthFailure(res)) return;
          if (!res.ok) throw new Error('update_failed');
          order.status = newStatus;
          saveOrders(orders);
          renderTable(orders);
          renderSummary(orders);
        } catch (err) {
          console.error('updateOrderStatus failed:', err);
          btn.disabled = false;
          alert('עדכון הסטטוס נכשל — נסה שוב');
        }
      }
    });
  });
}

function toggleDetail(row) {
  const id        = row.dataset.id;
  const inner     = document.querySelector(`.adm-detail-row[data-for="${id}"] .adm-detail-inner`);
  const isOpen    = row.classList.contains('is-open');

  document.querySelectorAll('.adm-row').forEach(r => {
    r.classList.remove('is-open');
    r.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('.adm-detail-inner').forEach(el => {
    el.style.maxHeight = '0';
  });

  if (!isOpen) {
    row.classList.add('is-open');
    row.setAttribute('aria-expanded', 'true');
    inner.style.maxHeight = inner.scrollHeight + 'px';
  }
}

function renderTableSkeleton(rows) {
  const cell = '<td><span class="yb-skeleton" style="width:70%;height:14px;"></span></td>';
  const row  = `<tr>${cell.repeat(9)}</tr>`;
  return row.repeat(rows);
}

(async function () {
  const tbody = document.getElementById('adm-tbody');
  if (tbody) tbody.innerHTML = renderTableSkeleton(6);

  try {
    const orders = await fetchOrders();
    renderSummary(orders);
    renderTable(orders);
    if (tbody) tbody.classList.add('yb-fade-in');

    const pendingCount = orders.filter(o => o.review && o.review.status === 'pending').length;
    if (pendingCount > 0) showPendingReviewsAlert(pendingCount);
  } catch (err) {
    console.error('Failed to load orders:', err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#c0392b;">שגיאה בטעינת ההזמנות</td></tr>';
  }

  document.querySelectorAll('.adm-th-sort').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (_sortField === field) {
        _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _sortField = field;
        _sortDir   = 'desc';
      }
      _page = 1;
      renderTable(_cachedOrders);
    });
  });
}());

// ── Content management modal ─────────────────────────────────
(function () {
  const btn      = document.getElementById('adm-content-btn');
  const modal    = document.getElementById('adm-content-modal');
  const overlay  = document.getElementById('adm-content-overlay');
  const closeBtn = document.getElementById('adm-content-close');
  const saveBtn  = document.getElementById('adm-content-save');
  const savedEl  = document.getElementById('adm-content-saved');
  if (!btn || !modal) return;

  const FIELD_MAP = {
    introText:        'adm-content-intro',
    introSubText:     'adm-content-intro-subtext',
    book1Title:       'adm-content-book1-title',
    book1Description: 'adm-content-book1-desc',
    book2Title:       'adm-content-book2-title',
    book2Description: 'adm-content-book2-desc',
    authorBio:        'adm-content-author'
  };

  // מזהי האלמנטים המקבילים באתר החי — לשליפת התוכן הנוכחי בפועל,
  // כדי שהטופס יציג תמיד את מה שבאמת מוצג באתר ולא יישאר ריק אם עוד לא נשמרה החלפה
  const LIVE_ID_MAP = {
    introText:        'site-intro-text',
    introSubText:     'site-intro-subtext',
    book1Title:       'site-book1-title',
    book1Description: 'site-book1-desc',
    book2Title:       'site-book2-title',
    book2Description: 'site-book2-desc',
    authorBio:        'site-author-bio'
  };

  async function openContentModal() {
    modal.hidden = false;

    let saved = {};
    try {
      const res  = await fetch(CF_ADMIN_ORDERS.replace('getAdminOrders', 'getSiteContent'));
      const data = await res.json();
      saved = data.content || {};
    } catch (err) {
      console.error('getSiteContent failed:', err);
    }

    let live = {};
    try {
      const htmlRes  = await fetch('index.html');
      const htmlText = await htmlRes.text();
      const liveDoc  = new DOMParser().parseFromString(htmlText, 'text/html');
      Object.entries(LIVE_ID_MAP).forEach(([key, liveId]) => {
        const el = liveDoc.getElementById(liveId);
        if (el) live[key] = el.textContent.trim();
      });
    } catch (err) {
      console.error('Failed to load live site content:', err);
    }

    Object.entries(FIELD_MAP).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.value = saved[key] || live[key] || '';
    });
  }

  function closeContentModal() {
    modal.hidden = true;
  }

  btn.addEventListener('click', openContentModal);
  closeBtn.addEventListener('click', closeContentModal);
  overlay.addEventListener('click', closeContentModal);

  saveBtn.addEventListener('click', async () => {
    const body = {};
    Object.entries(FIELD_MAP).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) body[key] = el.value;
    });

    saveBtn.disabled = true;
    try {
      const res = await fetch(`${CF_ADMIN_ORDERS.replace('getAdminOrders', 'updateSiteContent')}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body:    JSON.stringify(body)
      });
      if (handleAdminAuthFailure(res)) return;
      if (!res.ok) throw new Error('update_failed');
      savedEl.textContent = 'נשמר ✓';
      setTimeout(() => { savedEl.textContent = ''; }, 2500);
    } catch (err) {
      console.error('updateSiteContent failed:', err);
      alert('שמירת התוכן נכשלה — נסה שוב');
    } finally {
      saveBtn.disabled = false;
    }
  });
}());
