
    /* =========================================================
       GLOBAL JS FOR STATIC SKETCH ONLY
       Future Angular note:
       Replace this with component state and services.
    ========================================================= */

    const faqItems = document.querySelectorAll('.yb-faq__item');

    faqItems.forEach((item) => {
      const button = item.querySelector('.yb-faq__button');

      button.addEventListener('click', () => {
        const isOpen = item.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(isOpen));
      });
    });

    const buyButtons = document.querySelectorAll('.yb-book-card__buy');

    buyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const bookId = button.dataset.bookId;

        alert(
          `Demo only: כאן בעתיד תתחיל רכישה עבור ${bookId}.\n\nבפיתוח אמיתי: יצירת הזמנה ב-Firebase, מעבר לסליקה, Webhook אחרי תשלום, ואז יצירת קישור הורדה.`
        );
      });
    });
