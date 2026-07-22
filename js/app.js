
    /* =========================================================
       GLOBAL JS FOR STATIC SKETCH ONLY
       Future Angular note:
       Replace this with component state and services.
    ========================================================= */

    // ── Editable site content (overrides hardcoded defaults) ──
    (async function () {
      try {
        const res  = await fetch('https://europe-west1-yonatan-books.cloudfunctions.net/getSiteContent');
        const data = await res.json();
        const c = data.content || {};

        const map = {
          'site-intro-text':    c.introText,
          'site-intro-subtext': c.introSubText,
          'site-book1-title': c.book1Title,
          'site-book1-desc':  c.book1Description,
          'site-book2-title': c.book2Title,
          'site-book2-desc':  c.book2Description,
          'site-author-bio':  c.authorBio
        };
        Object.entries(map).forEach(([id, value]) => {
          if (!value) return;
          const el = document.getElementById(id);
          if (el) el.textContent = value;
        });
      } catch (err) {
        console.error('Failed to load site content:', err);
      }
    }());

    // ── Parallax Hero ─────────────────────────────────────
    const heroParallaxImg = document.querySelector('.yb-hero__parallax-img');
    if (heroParallaxImg && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const updateParallax = () => {
        heroParallaxImg.style.transform = `translateY(${window.scrollY * 0.3}px)`;
      };
      window.addEventListener('scroll', updateParallax, { passive: true });
    }

    // ── Hamburger / Mobile Nav ──────────────────────────────
    const hamburger = document.querySelector('.yb-header__hamburger');
    const mobileNav = document.querySelector('#yb-mobile-nav');

    if (hamburger && mobileNav) {
      function closeMobileNav(returnFocus = true) {
        hamburger.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'פתח תפריט ניווט');
        mobileNav.hidden = true;
        mobileNav.setAttribute('aria-hidden', 'true');
        if (returnFocus) hamburger.focus();
      }

      hamburger.addEventListener('click', () => {
        const isOpen = hamburger.classList.toggle('is-open');
        hamburger.setAttribute('aria-expanded', String(isOpen));
        hamburger.setAttribute('aria-label', isOpen ? 'סגור תפריט ניווט' : 'פתח תפריט ניווט');
        mobileNav.hidden = !isOpen;
        mobileNav.setAttribute('aria-hidden', String(!isOpen));

        if (isOpen) {
          const firstLink = mobileNav.querySelector('.yb-mobile-nav__link');
          if (firstLink) firstLink.focus();
        }
      });

      mobileNav.querySelectorAll('.yb-mobile-nav__link').forEach((link) => {
        link.addEventListener('click', () => closeMobileNav(false));
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && hamburger.classList.contains('is-open')) {
          closeMobileNav();
        }
      });
    }

    // ── FAQ Accordion ──────────────────────────────────────
    const faqItems = document.querySelectorAll('.yb-faq__item');

    faqItems.forEach((item) => {
      const button = item.querySelector('.yb-faq__button');

      button.addEventListener('click', () => {
        const isOpen = item.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(isOpen));
      });

      // Close on Escape when button is focused inside an open item
      button.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && item.classList.contains('is-open')) {
          item.classList.remove('is-open');
          button.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // ── Book Cover Tilt on Hover ───────────────────────────
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.yb-book-card').forEach((card) => {
        let tiltTimer;
        card.addEventListener('mouseenter', () => {
          tiltTimer = setTimeout(() => card.classList.add('is-tilted'), 180);
        });
        card.addEventListener('mouseleave', () => {
          clearTimeout(tiltTimer);
          card.classList.remove('is-tilted');
        });
      });
    }

    // ── Unified Ripple ─────────────────────────────────────
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
      document.querySelectorAll('.has-ripple').forEach((el) => {
        el.addEventListener('click', (e) => {
          const rect   = el.getBoundingClientRect();
          const size   = Math.max(rect.width, rect.height);
          const x      = e.clientX - rect.left - size / 2;
          const y      = e.clientY - rect.top  - size / 2;
          const ripple = document.createElement('span');
          ripple.className = 'yb-ripple';
          ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
          el.appendChild(ripple);
          ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
        });
      });
    }

    // ── Buy Buttons (Demo) ─────────────────────────────────
    const buyButtons = document.querySelectorAll('.yb-book-card__buy');
    buyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        window.location.href = `purchase.html?book=${button.dataset.bookId}`;
      });
    });

    // ── Inject approved customer reviews + init carousel ────
    (async function () {
      const track  = document.getElementById('yb-testimonials-track');
      const runner = document.getElementById('yb-testimonials-runner');
      if (!track || !runner) return;

      try {
        const res  = await fetch('https://europe-west1-yonatan-books.cloudfunctions.net/getApprovedReviews');
        const data = await res.json();
        (data.reviews || []).forEach(r => {
          const parts       = r.name.trim().split(/\s+/);
          const displayName = parts.length >= 2 ? `${parts[0]}.${parts[1].charAt(0)}` : r.name;
          const bq = document.createElement('blockquote');
          bq.className = 'yb-testimonial';
          bq.innerHTML =
            `<span class="yb-testimonial__book">${r.bookTitle}</span>` +
            `<p class="yb-testimonial__text">״${r.text}״</p>` +
            `<cite class="yb-testimonial__cite">${displayName}</cite>`;
          track.appendChild(bq);
        });
      } catch (err) {
        console.error('Failed to load approved reviews:', err);
      }

      if (!track.children.length) {
        const section = runner.closest('.yb-testimonials');
        if (section) section.hidden = true;
        return;
      }

      initTestimonialsCarousel(runner, track);
    }());

    // ── Testimonials Carousel ──────────────────────────────
    function initTestimonialsCarousel(runner, track) {
      const GAP         = 36;
      const INTERVAL_MS = 4500;
      let CARD_W, STEP;
      let index  = 0;
      let paused = false;

      const origCards = [...track.querySelectorAll('.yb-testimonial')];

      // ביקורת אחת בלבד — לא מפעילים קרוסלה, רק ממרכזים כרטיס יחיד עם רוחב סביר
      if (origCards.length === 1) {
        track.style.justifyContent = 'center';
        origCards[0].style.width = 'min(520px, 100%)';
        return;
      }
      if (origCards.length < 2) return;

      // Clone first 2 cards so the loop wraps seamlessly
      [0, 1].forEach((i) => {
        const clone = origCards[i].cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });

      function calcDimensions() {
        const w     = runner.clientWidth;
        const count = w < 500 ? 1 : 2;
        CARD_W = Math.floor((w - GAP * (count - 1)) / count);
        STEP   = CARD_W + GAP;
        track.querySelectorAll('.yb-testimonial').forEach((c) => {
          c.style.width = `${CARD_W}px`;
        });
        track.style.transition = 'none';
        track.style.transform  = `translateX(${-(index * STEP)}px)`;
      }

      function advance() {
        index++;
        track.style.transition = 'transform 620ms cubic-bezier(0.4, 0, 0.2, 1)';
        track.style.transform  = `translateX(${-(index * STEP)}px)`;

        if (index >= origCards.length) {
          track.addEventListener('transitionend', () => {
            track.style.transition = 'none';
            index = 0;
            track.style.transform  = 'translateX(0)';
          }, { once: true });
        }
      }

      calcDimensions();

      if (!prefersReducedMotion) {
        runner.addEventListener('mouseenter', () => { paused = true; });
        runner.addEventListener('mouseleave', () => { paused = false; });
        setInterval(() => { if (!paused) advance(); }, INTERVAL_MS);

        let resizeTimer;
        window.addEventListener('resize', () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(calcDimensions, 150);
        });
      }
    }

    // ── Legal modal ────────────────────────────────────────
    (function () {
      const modal    = document.getElementById('legal-modal');
      const overlay  = document.getElementById('legal-modal-overlay');
      const closeBtn = document.getElementById('legal-modal-close');
      const title    = document.getElementById('legal-modal-title');
      if (!modal) return;

      const CONTENT = {
        terms: {
          title: 'תנאי שימוש ומדיניות ביטולים',
          body: `
            <h3>1. כללי והגדרות</h3>
            <ul>
              <li>האתר משמש כחנות וירטואלית למכירת ספרי המחבר.</li>
              <li>כל המבצע פעולה באתר מצהיר כי קרא את התקנון.</li>
              <li>הפעולה באתר מהווה הסכמה מלאה לכל תנאי התקנון.</li>
              <li>תנאים אלו מהווים חוזה מחייב בין המשתמש למוכר.</li>
              <li>המוכר שומר זכותו לשנות את התקנון בכל עת.</li>
            </ul>
            <h3>2. הזמנות ואספקת מוצרים</h3>
            <ul>
              <li>המכירה מיועדת לתושבי ישראל בני 18 ומעלה.</li>
              <li>אספקת ספרים פיזיים תבוצע באמצעות דואר או שליח.</li>
              <li>ימי העסקים לאספקה אינם כוללים שישי, שבת וחגים.</li>
              <li>מוכר לא יישא באחריות לעיכובי חברות השילוח או כוח עליון.</li>
              <li>ספרים דיגיטליים יישלחו כקישור להורדה ישירה לאחר התשלום.</li>
              <li>חל איסור להעביר את הקובץ הדיגיטלי לאדם אחר.</li>
            </ul>
            <h3>3. מדיניות ביטולים והחזרים</h3>
            <ul>
              <li>ביטול עסקה ייעשה בהתאם לחוק הגנת הצרכן.</li>
              <li>ניתן לבטל ספר פיזי תוך 14 ימים מקבלתו.</li>
              <li>תנאי להחזר: הספר יישמר במצבו החדש ללא פגם.</li>
              <li>דמי ביטול יעמדו על 5% מהרכישה.</li>
              <li>עלויות המשלוח חזרה אל המוכר יחולו על הקונה.</li>
              <li>אין זכות ביטול על ספרים דיגיטליים לאחר שליחתם.</li>
            </ul>
            <h3>4. קניין רוחני</h3>
            <ul>
              <li>כל הזכויות בספרים ובאתר שייכות בלעדית למחבר.</li>
              <li>חל איסור מוחלט להעתיק, לשכפל או להפיץ תכנים.</li>
              <li>אין לעשות שימוש מסחרי בטקסטים או בתמונות האתר.</li>
            </ul>
            <h3>5. הגבלת אחריות ושיפוט</h3>
            <ul>
              <li>השירות באתר ניתן כפי שהוא (As Is).</li>
              <li>המוכר אינו אחראי לנזק עקיף כתוצאה מהשימוש באתר.</li>
              <li>סמכות השיפוט הבלעדית תהיה לבתי המשפט המוסמכים בישראל.</li>
            </ul>
          `
        },
        privacy: {
          title: 'מדיניות פרטיות',
          body: `
            <h3>1. איסוף מידע</h3>
            <ul>
              <li>בעת רכישה נאספים: שם, טלפון, מייל וכתובת למשלוח.</li>
              <li>המידע נחוץ לצורך אספקת הספרים וחשבוניות בלבד.</li>
              <li>פרטי אשראי אינם נשמרים ברישומי האתר או המוכר.</li>
              <li>הסליקה מבוצעת על ידי חברת סליקה חיצונית מאובטחת.</li>
            </ul>
            <h3>2. שימוש במידע והעברתו</h3>
            <ul>
              <li>המידע ישמש למשלוח הספרים וליצירת קשר לגבי ההזמנה.</li>
              <li>ניוזלטר או עדכונים יישלחו רק באישור מפורש שלכם.</li>
              <li>המידע לא יימכר או יימסר לצדדים שלישיים.</li>
              <li>המידע יועבר לחברת השילוח רק לצורך ביצוע המשלוח.</li>
            </ul>
            <h3>3. עוגיות (Cookies)</h3>
            <ul>
              <li>האתר עשוי להשתמש בעוגיות לצורך תפעולו השוטף.</li>
              <li>העוגיות מסייעות לשמירת המוצרים בעגלת הקניות שלכם.</li>
              <li>ניתן לחסום עוגיות דרך הגדרות הדפדפן האישי שלכם.</li>
            </ul>
          `
        }
      };

      function openLegal(type) {
        const c = CONTENT[type];
        title.textContent = c.title;
        document.getElementById('legal-modal-body').innerHTML = c.body;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        closeBtn.focus();
      }

      function closeLegal() {
        modal.hidden = true;
        document.body.style.overflow = '';
      }

      document.getElementById('footer-terms-btn')  ?.addEventListener('click', () => openLegal('terms'));
      document.getElementById('footer-privacy-btn') ?.addEventListener('click', () => openLegal('privacy'));
      closeBtn.addEventListener('click', closeLegal);
      overlay.addEventListener('click', closeLegal);
      modal.addEventListener('keydown', e => { if (e.key === 'Escape') closeLegal(); });
    }());

    // ── Author modal ───────────────────────────────────────
    (function () {
      const modal   = document.getElementById('author-modal');
      const overlay = document.getElementById('author-modal-overlay');
      const closeBtn = document.getElementById('author-modal-close');
      const openBtn  = document.getElementById('author-read-more');
      if (!modal || !openBtn) return;

      function openModal() {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        closeBtn.focus();
      }

      function closeModal() {
        modal.classList.add('is-closing');
        setTimeout(() => {
          modal.classList.remove('is-closing');
          modal.hidden = true;
          document.body.style.overflow = '';
          openBtn.focus();
        }, 660);
      }

      openBtn.addEventListener('click', openModal);
      closeBtn.addEventListener('click', closeModal);
      overlay.addEventListener('click', closeModal);
      modal.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    }());
