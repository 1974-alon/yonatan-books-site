/* =========================================================
   ADMIN — Orders management
   Data source: localStorage['yb-orders'] (future: Firestore)
========================================================= */

const MOCK_ORDERS = [
  {
    id: 'ORD-2026-001',
    date: '2026-06-14',
    bookId: 'book-01',
    bookTitle: 'דמיון לנחמה',
    price: 79,
    type: 'digital',
    status: 'downloaded',
    downloads: 2,
    name: 'רחל כהן',
    email: 'rachel.cohen@gmail.com',
    phone: '052-111-2233',
    address: 'רחוב הרצל 24, תל אביב, 6543210',
    shippingAddress: null
  },
  {
    id: 'ORD-2026-002',
    date: '2026-06-19',
    bookId: 'book-02',
    bookTitle: 'דרום מערב',
    price: 89,
    type: 'physical',
    status: 'waiting',
    downloads: 0,
    name: 'דוד לוי',
    email: 'david.levi@gmail.com',
    phone: '054-333-4455',
    address: 'שדרות בן גוריון 8, חיפה, 3200001',
    shippingAddress: 'שדרות בן גוריון 8, חיפה, 3200001'
  },
  {
    id: 'ORD-2026-003',
    date: '2026-06-22',
    bookId: 'book-01',
    bookTitle: 'דמיון לנחמה',
    price: 79,
    type: 'physical',
    status: 'shipped',
    downloads: 0,
    name: 'מרים אברהם',
    email: 'miriam.a@walla.co.il',
    phone: '053-567-8899',
    address: 'רחוב ביאליק 5, ירושלים, 9350100',
    shippingAddress: 'רחוב ביאליק 5, ירושלים, 9350100'
  },
  {
    id: 'ORD-2026-004',
    date: '2026-06-27',
    bookId: 'book-02',
    bookTitle: 'דרום מערב',
    price: 89,
    type: 'digital',
    status: 'pending',
    downloads: 0,
    name: 'יוסי גרין',
    email: 'yossi.green@hotmail.com',
    phone: '050-987-6543',
    address: 'רחוב העצמאות 17, באר שבע, 8443220',
    shippingAddress: null
  }
];

function getOrders() {
  const stored = localStorage.getItem('yb-orders');
  if (!stored) {
    localStorage.setItem('yb-orders', JSON.stringify(MOCK_ORDERS));
    return MOCK_ORDERS;
  }
  return JSON.parse(stored);
}

function saveOrders(orders) {
  localStorage.setItem('yb-orders', JSON.stringify(orders));
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function statusLabel(order) {
  if (order.type === 'digital') {
    if (order.status === 'pending')    return { cls: 'adm-status--pending',    text: 'ממתין להורדה' };
    if (order.status === 'downloaded') return { cls: 'adm-status--downloaded', text: 'הורד' };
  } else {
    if (order.status === 'waiting') return { cls: 'adm-status--waiting', text: 'ממתין לשליחה' };
    if (order.status === 'shipped') return { cls: 'adm-status--shipped', text: 'נשלח' };
  }
  return { cls: '', text: order.status };
}

function renderSummary(orders) {
  document.getElementById('adm-total').textContent   = orders.length;
  document.getElementById('adm-revenue').textContent = '₪' + orders.reduce((s, o) => s + o.price, 0);
  document.getElementById('adm-pending').textContent = orders.filter(o => o.type === 'physical' && o.status === 'waiting').length;
}

function renderTable(orders) {
  const tbody = document.getElementById('adm-tbody');

  tbody.innerHTML = orders.map(o => {
    const st      = statusLabel(o);
    const dlText  = o.type === 'digital' ? `${o.downloads}/3` : '—';
    const addr    = o.shippingAddress || o.address;

    let actionBtn = '';
    if (o.type === 'digital') {
      actionBtn = `<button class="adm-btn adm-btn--grant" data-id="${o.id}" data-action="grant">הענק 3 הורדות</button>`;
    } else {
      actionBtn = o.status === 'shipped'
        ? `<button class="adm-btn adm-btn--done" disabled>נשלח ✓</button>`
        : `<button class="adm-btn adm-btn--ship" data-id="${o.id}" data-action="ship">סמן כנשלח</button>`;
    }

    return `
      <tr class="adm-row" data-id="${o.id}" tabindex="0" role="button" aria-expanded="false">
        <td><span class="adm-order-id">${o.id}</span></td>
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
                  <span>${addr}</span>
                </div>
              </div>
              <div class="adm-detail__actions">
                ${actionBtn}
              </div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.adm-row').forEach(row => {
    row.addEventListener('click', () => toggleDetail(row));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggleDetail(row); });
  });

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
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

      if (btn.dataset.action === 'ship') {
        order.status = 'shipped';
        saveOrders(orders);
        renderTable(orders);
        renderSummary(orders);
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

(function () {
  const orders = getOrders();
  renderSummary(orders);
  renderTable(orders);
}());
