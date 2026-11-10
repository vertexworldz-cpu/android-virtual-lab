/* Auth pages: password visibility, strength meter, busy buttons. */
(function () {
  'use strict';
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle-password]');
    if (!t) return;
    const input = t.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    const use = t.querySelector('use');
    if (use) use.setAttribute('href', use.getAttribute('href').replace(/#.*/, show ? '#eye-off' : '#eye'));
  });

  function score(pw) {
    let s = 0;
    if (pw.length >= 10) s++;
    if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s);
  }
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-strength]')) return;
    const bar = e.target.closest('.field').querySelector('.strength span');
    if (!bar) return;
    const s = score(e.target.value);
    const colors = ['#DC2626', '#DC2626', '#F59E0B', '#16A34A', '#16A34A'];
    bar.style.width = (e.target.value ? Math.max(10, s * 25) : 0) + '%';
    bar.style.background = colors[s];
  });

  document.addEventListener('submit', (e) => {
    if (!e.target.hasAttribute('data-busy-form')) return;
    const btn = e.submitter || e.target.querySelector('[type=submit]');
    if (btn) setTimeout(() => { btn.classList.add('is-busy'); btn.disabled = true; }, 0);
  });
})();
