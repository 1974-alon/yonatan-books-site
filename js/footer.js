/* =========================================================
   FOOTER COMPONENT
   To update the footer across all pages — edit this file only.
   Future Angular: replace with <app-footer> component.
========================================================= */

(function () {
  const root = document.getElementById('yb-footer-root');
  if (!root) return;

  root.outerHTML = `
    <footer class="yb-footer">
      <div class="site-container">
        <div class="yb-footer__inner">

          <div class="yb-footer__end">
            <span class="yb-footer__copy">© 2026 יונתן ספרים, כל הזכויות שמורות.</span>
            <div class="yb-footer__links">
              <button class="yb-footer__legal-btn" id="footer-terms-btn" type="button">תנאי שימוש</button>
              <span class="yb-footer__pipe" aria-hidden="true">|</span>
              <button class="yb-footer__legal-btn" id="footer-privacy-btn" type="button">מדיניות ופרטים</button>
              <span class="yb-footer__pipe" aria-hidden="true">|</span>
              <a class="yb-footer__contact" href="mailto:yonatanbrennerbooks@gmail.com" aria-label="שלח מייל ליונתן">
                יצירת קשר
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </a>
            </div>
          </div>

          <span class="yb-footer__credit">אתר זה נבנה ועוצב ע״י <a href="https://suntree.co.il" class="yb-footer__credit-link" target="_blank" rel="noopener">suntree</a></span>

        </div>
      </div>
    </footer>

    <div class="yb-legal-modal" id="legal-modal" hidden role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
      <div class="yb-legal-modal__overlay" id="legal-modal-overlay"></div>
      <div class="yb-legal-modal__box">
        <button class="yb-legal-modal__close" id="legal-modal-close" aria-label="סגור">✕</button>
        <h2 id="legal-modal-title" class="yb-legal-modal__title"></h2>
        <div id="legal-modal-body" class="yb-legal-modal__body"><p>תוכן זה יעודכן בקרוב.</p></div>
      </div>
    </div>
  `;
}());
