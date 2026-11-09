/* Settings + administrator management page behaviour. */
(function () {
  'use strict';
  const { $, $$ } = window.BZX;

  // Require the current password only when the email is being changed.
  const email = $('[data-email-original]');
  const confirmBox = $('[data-email-confirm]');
  if (email && confirmBox) {
    email.addEventListener('input', () => { confirmBox.hidden = email.value.trim().toLowerCase() === email.dataset.emailOriginal; });
  }

  // Suggest the conventional port when SMTP encryption changes.
  const enc = $('[data-port-target]');
  if (enc) {
    enc.addEventListener('change', () => {
      const port = $(enc.dataset.portTarget);
      const map = { ssl: '465', tls: '587', none: '25' };
      if (port && ['465', '587', '25', ''].includes(port.value)) port.value = map[enc.value];
    });
  }

  // Show/hide sections bound to radio buttons.
  $$('[data-toggle-target]').forEach((r) => r.addEventListener('change', () => {
    const t = $(r.dataset.toggleTarget);
    if (t && r.checked) t.hidden = r.dataset.toggleShow !== '1';
  }));

  // Password strength meters.
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-strength]')) return;
    const field = e.target.closest('.field');
    const bar = field && field.querySelector('.strength span');
    if (!bar) return;
    const pw = e.target.value;
    let s = 0;
    if (pw.length >= 10) s++;
    if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    s = Math.min(4, s);
    bar.style.width = (pw ? Math.max(10, s * 25) : 0) + '%';
    bar.style.background = ['#DC2626', '#DC2626', '#F59E0B', '#16A34A', '#16A34A'][s];
  });
})();
