
    /* =========================================================
       GLOBAL JS FOR STATIC SKETCH ONLY
       Future Angular note:
       Replace this with component state and services.
    ========================================================= */

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

    // Close mobile nav on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && hamburger.classList.contains('is-open')) {
        closeMobileNav();
      }
    });

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

    // ── Buy Buttons (Demo) ─────────────────────────────────
    const buyButtons = document.querySelectorAll('.yb-book-card__buy');

    buyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const bookId = button.dataset.bookId;

        alert(
          `Demo only: כאן בעתיד תתחיל רכישה עבור ${bookId}.\n\nבפיתוח אמיתי: יצירת הזמנה ב-Firebase, מעבר לסליקה, Webhook אחרי תשלום, ואז יצירת קישור הורדה.`
        );
      });
    });
