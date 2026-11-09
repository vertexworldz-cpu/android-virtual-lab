/* Dashboard charts — rendered as lightweight inline SVG/HTML from live data. */
(function () {
  'use strict';
  const { page, el, fmtBytes, api, toast, $ } = window.BZX;
  const COLORS = {
    image: '#DB2777', video: '#EA580C', audio: '#0D9488', document: '#2563EB', pdf: '#DC2626',
    archive: '#CA8A04', spreadsheet: '#16A34A', presentation: '#9333EA', other: '#64748B',
  };
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  function legendRow(color, label, value) {
    return el('div', { class: 'legend-row' }, [el('span', { class: 'swatch', style: 'background:' + color }), el('span', { text: label }), el('span', { class: 'val', text: value })]);
  }

  // Storage usage: Drive quota split into this app / other Drive data / free.
  (function storage() {
    const host = $('#storage-chart');
    if (!host) return;
    const s = page.storage;
    const usage = s.usage;
    const limit = s.limit;
    const app = s.app;
    if (usage === null || usage === undefined) {
      host.append(el('p', { class: 'storage-big' }, [fmtBytes(app), el('small', { text: ' stored by this app' })]));
      host.append(el('p', { class: 'muted', text: 'Connect Google Drive to see the account quota.' }));
      return;
    }
    const other = Math.max(0, usage - app);
    const total = limit || Math.max(usage, 1);
    const free = limit ? Math.max(0, limit - usage) : 0;
    const big = el('p', { class: 'storage-big' }, [fmtBytes(usage), el('small', { text: limit ? ' of ' + fmtBytes(limit) + ' used' : ' used · unlimited quota' })]);
    const bar = el('div', { class: 'stack-bar', role: 'img', 'aria-label': 'Storage usage' }, [
      el('span', { style: 'width:' + (app / total * 100) + '%;background:#4338CA' }),
      el('span', { style: 'width:' + (other / total * 100) + '%;background:#A5B4FC' }),
    ]);
    host.append(big, bar, el('div', { class: 'legend' }, [
      legendRow('#4338CA', 'Bladezux files', fmtBytes(app)),
      legendRow('#A5B4FC', 'Other Drive, Gmail and Photos data', fmtBytes(other)),
      limit ? legendRow('var(--border-strong)', 'Available', fmtBytes(free)) : null,
    ]));
  })();

  // Category donut (share of bytes).
  (function categories() {
    const host = $('#category-chart');
    if (!host) return;
    const cats = page.categories.filter((c) => c.count > 0);
    const totalBytes = cats.reduce((a, c) => a + c.bytes, 0);
    const totalCount = cats.reduce((a, c) => a + c.count, 0);
    const r = 58, stroke = 20, C = 2 * Math.PI * r;
    const chart = svg('svg', { viewBox: '0 0 150 150', class: 'donut', role: 'img', 'aria-label': 'File categories by size' });
    chart.append(svg('circle', { cx: 75, cy: 75, r, fill: 'none', stroke: 'var(--surface-hover)', 'stroke-width': stroke }));
    let offset = 0;
    cats.forEach((c) => {
      const frac = totalBytes > 0 ? c.bytes / totalBytes : c.count / totalCount;
      const len = Math.max(0, frac * C - (cats.length > 1 ? 2 : 0));
      const seg = svg('circle', { cx: 75, cy: 75, r, fill: 'none', stroke: COLORS[c.key], 'stroke-width': stroke,
        'stroke-dasharray': len + ' ' + (C - len), 'stroke-dashoffset': -offset, transform: 'rotate(-90 75 75)' });
      const t = svg('title', {});
      t.textContent = c.label + ': ' + c.count + ' files, ' + fmtBytes(c.bytes);
      seg.append(t);
      chart.append(seg);
      offset += frac * C;
    });
    const t1 = svg('text', { x: 75, y: 76, 'text-anchor': 'middle', class: 'donut-center' });
    t1.textContent = totalCount.toLocaleString();
    const t2 = svg('text', { x: 75, y: 93, 'text-anchor': 'middle', class: 'donut-sub' });
    t2.textContent = totalCount === 1 ? 'file' : 'files';
    chart.append(t1, t2);
    const legend = el('div', { class: 'legend' });
    if (!cats.length) legend.append(el('p', { class: 'muted', text: 'No files yet. Categories appear after your first upload.' }));
    cats.sort((a, b) => b.bytes - a.bytes).forEach((c) => legend.append(legendRow(COLORS[c.key], c.label + ' (' + c.count + ')', fmtBytes(c.bytes))));
    host.append(chart, legend);
  })();

  // Uploads per day.
  (function daily() {
    const host = $('#daily-chart');
    if (!host) return;
    const days = page.daily;
    const max = Math.max(1, ...days.map((d) => d.count));
    days.forEach((d, i) => {
      const h = d.count ? Math.max(4, (d.count / max) * 100) : 2;
      host.append(el('div', { class: 'bar-col' }, [
        el('div', { class: 'bar' + (d.count ? '' : ' is-zero'), style: 'height:' + h + '%', 'data-tip': d.label + ': ' + d.count + ' file' + (d.count === 1 ? '' : 's') + (d.bytes ? ' · ' + fmtBytes(d.bytes) : ''), role: 'img', 'aria-label': d.label + ': ' + d.count + ' uploads' }),
        // Day-of-month under each bar (full date in the tooltip).
        el('small', { text: String(Number(d.date.slice(8))) }),
      ]));
    });
  })();

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action="refresh-quota"]');
    if (!b) return;
    b.disabled = true;
    try { await api('drive.refresh', {}); location.reload(); } catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });
  // Refresh figures after uploads finish from the dashboard's quick-upload button.
  document.addEventListener('bzx:uploaded', () => {
    clearTimeout(window.__bzxDash);
    window.__bzxDash = setTimeout(() => { if (!window.BZX.uploads.hasActive()) location.reload(); }, 2500);
  });
})();
