/* Bladezux Cloud Storage — core UI helpers (no dependencies). */
(function () {
  'use strict';

  const bootEl = document.getElementById('boot-data');
  const boot = bootEl ? JSON.parse(bootEl.textContent) : {};
  const pageEl = document.getElementById('page-data');
  const page = pageEl ? JSON.parse(pageEl.textContent) : {};

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // only used with trusted, static markup (icons)
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    (children || []).forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return node;
  }

  function icon(name, cls) {
    const safe = String(name).replace(/[^a-z0-9-]/g, '');
    return '<svg class="icon ' + (cls || '') + '" aria-hidden="true" focusable="false"><use href="' + boot.icons + '#' + safe + '"></use></svg>';
  }
  function iconEl(name, cls) {
    const span = document.createElement('span');
    span.innerHTML = icon(name, cls);
    return span.firstChild;
  }

  function fmtBytes(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let i = -1;
    do { bytes /= 1024; i++; } while (bytes >= 1024 && i < units.length - 1);
    return bytes.toFixed(bytes >= 100 ? 0 : 1) + ' ' + units[i];
  }
  function fmtDuration(sec) {
    if (!isFinite(sec) || sec < 0) return '—';
    sec = Math.round(sec);
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
  }

  /* --------------------------------------------------------------- API */
  class ApiError extends Error {
    constructor(message, status, code, data) { super(message); this.status = status; this.code = code; this.data = data; }
  }

  async function api(action, body, opts) {
    opts = opts || {};
    const url = boot.api + '?action=' + encodeURIComponent(action) + (opts.query ? '&' + new URLSearchParams(opts.query).toString() : '');
    const init = {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': boot.csrf },
      credentials: 'same-origin',
      signal: opts.signal,
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ApiError('Network error. Check your connection and try again.', 0, 'network');
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON */ }
    if (res.status === 401) {
      toast('Your session has ended. Redirecting to sign in…', 'warning');
      setTimeout(() => { window.location.href = boot.base + '/login.php'; }, 1200);
    }
    if (!res.ok || !data || data.ok === false) {
      throw new ApiError((data && data.error) || 'Request failed (' + res.status + ').', res.status, data && data.code, data);
    }
    return data;
  }

  /* -------------------------------------------------------------- toasts */
  function toast(message, type) {
    type = type || 'info';
    const stack = $('#toasts');
    if (!stack) return;
    const names = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
    const t = el('div', { class: 'toast ' + type, role: type === 'error' ? 'alert' : 'status' }, [iconEl(names[type] || 'info'), el('span', { text: message })]);
    stack.append(t);
    const ttl = type === 'error' ? 7000 : 4200;
    setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 220); }, ttl);
  }

  /* -------------------------------------------------------------- modals */
  function modal(build) {
    return new Promise((resolve) => {
      const root = $('#modal-root') || document.body;
      const prevFocus = document.activeElement;
      const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
      const backdrop = el('div', { class: 'modal-backdrop' }, [box]);
      const close = (value) => {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        if (e.key === 'Tab') {
          const f = $$('button, input, select, textarea, a[href]', box).filter((n) => !n.disabled);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      };
      backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(null); });
      document.addEventListener('keydown', onKey, true);
      build(box, close);
      root.append(backdrop);
      const first = $('[autofocus], input, .btn-primary, .btn-danger', box);
      if (first) setTimeout(() => { first.focus(); if (first.select && first.tagName === 'INPUT') first.select(); }, 20);
    });
  }

  function confirmDialog(opts) {
    return modal((box, close) => {
      const body = el('div', { class: 'modal-body' }, [
        el('h3', { text: opts.title || 'Are you sure?' }),
        opts.message ? el('p', { class: 'muted', text: opts.message }) : null,
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn btn-secondary', type: 'button', text: opts.cancel || 'Cancel', onclick: () => close(false) }),
          el('button', { class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), type: 'button', text: opts.confirm || 'Confirm', onclick: () => close(true) }),
        ]),
      ]);
      box.append(body);
    }).then((v) => v === true);
  }

  function promptDialog(opts) {
    return modal((box, close) => {
      const input = el('input', { type: 'text', value: opts.value || '', maxlength: 200, autofocus: true, 'aria-label': opts.label || opts.title });
      const err = el('p', { class: 'hint', style: 'color: var(--danger)', hidden: true });
      const form = el('form', { class: 'modal-body' }, [
        el('h3', { text: opts.title }),
        opts.message ? el('p', { class: 'muted', text: opts.message }) : null,
        el('div', { class: 'field' }, [opts.label ? el('label', { text: opts.label }) : null, input, err]),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn btn-secondary', type: 'button', text: 'Cancel', onclick: () => close(null) }),
          el('button', { class: 'btn btn-primary', type: 'submit', text: opts.confirm || 'Save' }),
        ]),
      ]);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) { err.textContent = 'Please enter a name.'; err.hidden = false; return; }
        close(v);
      });
      box.append(form);
      if (opts.selectBase) {
        setTimeout(() => { const dot = input.value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : input.value.length); }, 30);
      }
    });
  }

  /* ------------------------------------------------------------ dropdowns */
  function closeDropdowns(except) {
    $$('[data-dropdown].is-open').forEach((d) => {
      if (d !== except) { d.classList.remove('is-open'); const t = $('[data-dropdown-toggle]', d); if (t) t.setAttribute('aria-expanded', 'false'); }
    });
  }
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-dropdown-toggle]');
    if (toggle) {
      const dd = toggle.closest('[data-dropdown]');
      const open = !dd.classList.contains('is-open');
      closeDropdowns(dd);
      dd.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      return;
    }
    if (!e.target.closest('.dropdown-menu')) closeDropdowns();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdowns(); });

  /* --------------------------------------------------------------- sidebar */
  const shell = $('#shell');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'open-sidebar') shell.classList.add('sidebar-open');
    if (a.dataset.action === 'close-sidebar') shell.classList.remove('sidebar-open');
  });

  /* ----------------------------------------------------- global shortcuts */
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) {
      const s = $('.search input');
      if (s) { e.preventDefault(); s.focus(); }
    }
  });

  /* ---------------------------------------------------------- notifications */
  let notifLoaded = false;
  async function loadNotifications() {
    const list = $('#notif-list');
    if (!list) return;
    try {
      const data = await api('notifications');
      const badge = $('#notif-count');
      if (badge) { badge.hidden = data.unread === 0; badge.textContent = data.unread > 9 ? '9+' : String(data.unread); }
      if (!notifLoaded) return;
      list.replaceChildren();
      if (!data.items.length) { list.append(el('p', { class: 'empty-mini', text: 'You are all caught up.' })); return; }
      data.items.forEach((n) => {
        list.append(el('div', { class: 'notif-item' + (n.unread ? ' is-unread' : '') }, [
          el('span', { class: 'timeline-icon', html: icon(n.icon) }),
          el('div', null, [el('p', { text: n.text }), el('small', { text: n.who + ' · ' + n.when })]),
        ]));
      });
    } catch (e) { if (notifLoaded) list.replaceChildren(el('p', { class: 'empty-mini', text: 'Could not load notifications.' })); }
  }
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action="load-notifications"]');
    if (a) { notifLoaded = true; loadNotifications(); }
    const m = e.target.closest('[data-action="mark-notifications"]');
    if (m) {
      try { await api('notifications.seen', {}); } catch (_) {}
      $$('.notif-item.is-unread').forEach((n) => n.classList.remove('is-unread'));
      const badge = $('#notif-count'); if (badge) badge.hidden = true;
    }
  });
  if ($('#notif-list')) { loadNotifications(); setInterval(loadNotifications, 60000); }

  /* -------------------------------------------------------- forms & dialogs */
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (form.dataset.confirm && !form.dataset.confirmed) {
      e.preventDefault();
      const ok = await confirmDialog({ title: 'Please confirm', message: form.dataset.confirm, confirm: 'Continue', danger: true });
      if (ok) { form.dataset.confirmed = '1'; form.requestSubmit ? form.requestSubmit() : form.submit(); }
      return;
    }
    if (form.hasAttribute('data-busy-form')) {
      const btn = e.submitter || $('[type=submit]', form);
      if (btn) setTimeout(() => btn.classList.add('is-busy'), 0);
    }
  });

  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open-dialog]');
    if (open) { const d = $(open.dataset.openDialog); if (d && d.showModal) d.showModal(); }
    const close = e.target.closest('[data-close-dialog]');
    if (close) { const d = close.closest('dialog'); if (d) d.close(); }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const src = $(copy.dataset.copy);
      if (src) {
        (navigator.clipboard ? navigator.clipboard.writeText(src.value) : Promise.reject()).then(
          () => toast('Copied to clipboard.', 'success'),
          () => { src.select(); document.execCommand('copy'); toast('Copied to clipboard.', 'success'); });
      }
    }
  });
  $$('dialog[data-open-on-load]').forEach((d) => d.showModal && d.showModal());
  $$('dialog.dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // Flash messages from server-side redirects.
  (boot.flashes || []).forEach((f) => toast(f.message, f.type));

  window.BZX = { boot, page, api, ApiError, toast, modal, confirm: confirmDialog, prompt: promptDialog, icon, iconEl, el, $, $$, fmtBytes, fmtDuration };
})();
