/* Bladezux Cloud Storage — file manager. */
(function () {
  'use strict';
  const B = window.BZX;
  const { api, toast, el, icon, $, $$, boot, page } = B;

  const state = {
    folder: page.folder || null,
    type: page.type || '',
    view: page.view || '',
    q: page.q || '',
    sort: 'name',
    dir: 'asc',
    mode: 'grid',
    data: null,
    selected: new Set(),
    lastIndex: null,
    loading: null,
  };
  try {
    state.mode = localStorage.getItem('bzx-view') || 'grid';
    const s = (localStorage.getItem('bzx-sort') || 'name:asc').split(':');
    state.sort = s[0]; state.dir = s[1];
  } catch (_) {}
  if (state.view === 'recent') { state.sort = 'date'; state.dir = 'desc'; }

  const fm = $('#fm');
  const crumb = $('#breadcrumb');
  const heading = $('#fm-heading');
  const selBar = $('#selection-bar');
  const sortSel = $('#fm-sort');
  const typeSel = $('#fm-type');
  const searchInput = $('#fm-search');
  sortSel.value = state.sort + ':' + state.dir;

  B.currentFolder = () => (state.view || state.type || state.q ? null : state.folder);
  B.currentFolderName = () => {
    if (!state.data || !state.data.breadcrumb) return 'My Files';
    const crumbs = state.data.breadcrumb;
    return B.currentFolder() ? crumbs[crumbs.length - 1].name : 'My Files';
  };

  const keyOf = (kind, id) => kind + ':' + id;
  const isGlobal = () => !!(state.q || state.type || state.view);

  // ---------------------------------------------------------------- loading
  async function load(opts) {
    opts = opts || {};
    if (state.loading) state.loading.abort();
    const ctrl = new AbortController();
    state.loading = ctrl;
    if (!opts.silent) fm.setAttribute('aria-busy', 'true');
    const query = { sort: state.sort, dir: state.dir };
    if (state.folder && !isGlobal()) query.folder = state.folder;
    if (state.q) query.q = state.q;
    if (state.type) query.type = state.type;
    if (state.view) query.view = state.view;
    try {
      const data = await api('files.list', undefined, { query, signal: ctrl.signal });
      state.data = data;
      const valid = new Set([...data.files.map((f) => keyOf('f', f.id)), ...data.folders.map((f) => keyOf('d', f.id))]);
      state.selected.forEach((k) => { if (!valid.has(k)) state.selected.delete(k); });
      render();
      if (opts.flash) flashItem(opts.flash);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.status === 404 && state.folder) {
        toast('That folder no longer exists.', 'warning');
        navigate({ folder: null });
        return;
      }
      fm.replaceChildren(el('div', { class: 'empty-state' }, [
        el('span', { class: 'empty-art', html: icon('cloud-off') }),
        el('h3', { text: 'Could not load files' }),
        el('p', { text: e.message }),
        el('div', { class: 'page-actions' }, [el('button', { class: 'btn btn-secondary', type: 'button', text: 'Try again', onclick: () => load() })]),
      ]));
    } finally {
      if (state.loading === ctrl) state.loading = null;
      fm.removeAttribute('aria-busy');
    }
  }

  function navigate(next, replace) {
    Object.assign(state, next);
    state.selected.clear();
    const params = new URLSearchParams();
    if (state.folder && !isGlobal()) params.set('folder', state.folder);
    if (state.q) params.set('q', state.q);
    if (state.type) params.set('type', state.type);
    if (state.view) params.set('view', state.view);
    const url = location.pathname + (params.toString() ? '?' + params : '');
    history[replace ? 'replaceState' : 'pushState']({ folder: state.folder, q: state.q, type: state.type, view: state.view }, '', url);
    typeSel.value = state.type;
    if (searchInput.value !== state.q) searchInput.value = state.q;
    const top = $('.search input'); if (top && top.value !== state.q) top.value = state.q;
    updateNav();
    load();
  }

  window.addEventListener('popstate', (e) => {
    const s = e.state || {};
    const params = new URLSearchParams(location.search);
    state.folder = s.folder !== undefined ? s.folder : (params.get('folder') ? Number(params.get('folder')) : null);
    state.q = s.q !== undefined ? s.q : (params.get('q') || '');
    state.type = s.type !== undefined ? s.type : (params.get('type') || '');
    state.view = s.view !== undefined ? s.view : (params.get('view') || '');
    state.selected.clear();
    typeSel.value = state.type;
    searchInput.value = state.q;
    updateNav();
    load();
  });

  function updateNav() {
    const key = state.view === 'recent' ? 'files.php?view=recent' : (state.type ? 'files.php?type=' + state.type : 'files.php');
    $$('.sidebar .nav-link').forEach((a) => {
      const href = a.getAttribute('href');
      const match = href.endsWith('/' + key) && !state.q;
      a.classList.toggle('is-active', match);
      if (match) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // --------------------------------------------------------------- render
  function render() {
    const d = state.data;
    // Heading + breadcrumb
    let title = 'My Files';
    if (state.q) title = 'Results for “' + state.q + '”';
    else if (state.view === 'recent') title = 'Recent uploads';
    else if (state.type) title = page.categories[state.type] || 'Files';
    else if (d.folder) title = d.folder.name;
    heading.textContent = title;
    document.title = title + ' · ' + document.title.split(' · ').slice(-1)[0];

    crumb.replaceChildren();
    if (isGlobal()) {
      crumb.append(el('a', { href: '?', text: 'My Files', onclick: (e) => { e.preventDefault(); navigate({ folder: null, q: '', type: '', view: '' }); } }));
      crumb.insertAdjacentHTML('beforeend', icon('chevron-right'));
      crumb.append(el('span', { text: state.q ? 'Search' : (state.view ? 'Recent' : 'Filtered by type') }));
    } else {
      d.breadcrumb.forEach((c, i) => {
        if (i > 0) crumb.insertAdjacentHTML('beforeend', icon('chevron-right'));
        if (i === d.breadcrumb.length - 1) crumb.append(el('span', { text: c.name, 'aria-current': 'page' }));
        else {
          const a = el('a', { href: c.id ? '?folder=' + c.id : '?', text: c.name, onclick: (e) => { e.preventDefault(); navigate({ folder: c.id }); } });
          makeDropTarget(a, c.id);
          crumb.append(a);
        }
      });
    }

    $$('.segmented button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.mode));

    const folders = d.folders;
    const files = d.files;
    fm.replaceChildren();
    fm.classList.toggle('has-selection', state.selected.size > 0);

    if (!folders.length && !files.length) {
      fm.append(emptyState());
      updateSelection();
      return;
    }

    if (state.mode === 'list') {
      const list = el('div', { class: 'list', role: 'grid', 'aria-label': 'Files' });
      list.append(listHead());
      folders.forEach((f) => list.append(folderRow(f)));
      files.forEach((f, i) => list.append(fileRow(f, i)));
      fm.append(list);
    } else {
      if (folders.length) {
        const g = el('div', { class: 'grid folders' });
        folders.forEach((f) => g.append(folderCard(f)));
        fm.append(el('div', { class: 'fm-section' }, [el('p', { class: 'fm-section-title', text: 'Folders' }), g]));
      }
      if (files.length) {
        const g = el('div', { class: 'grid files' });
        files.forEach((f, i) => g.append(fileCard(f, i)));
        fm.append(el('div', { class: 'fm-section' }, [el('p', { class: 'fm-section-title', text: 'Files · ' + files.length }), g]));
      }
    }
    lazyThumbs();
    updateSelection();
  }

  function emptyState() {
    let title = 'This folder is empty';
    let text = 'Drag and drop files here, or use the upload button. Large files upload in resumable chunks.';
    let art = 'folder-open';
    if (state.q) { title = 'No matches'; text = 'Nothing matches “' + state.q + '”. Try a different search.'; art = 'search-x'; }
    else if (state.type) { title = 'No ' + (page.categories[state.type] || 'files').toLowerCase() + ' yet'; text = 'Files of this type will appear here once uploaded.'; art = 'files'; }
    else if (state.view) { title = 'No uploads yet'; text = 'Recently uploaded files will appear here.'; art = 'clock'; }
    const actions = [];
    if (!isGlobal() && boot.driveConnected) {
      actions.push(el('button', { class: 'btn btn-secondary', type: 'button', 'data-action': 'new-folder', html: icon('folder-plus') + '<span>New folder</span>' }));
      actions.push(el('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'upload', html: icon('upload') + '<span>Upload files</span>' }));
    }
    return el('div', { class: 'empty-state' }, [
      el('span', { class: 'empty-art', html: icon(art) }),
      el('h3', { text: title }),
      el('p', { text: text }),
      actions.length ? el('div', { class: 'page-actions' }, actions) : null,
    ]);
  }

  function checkBox(key) {
    const c = el('span', { class: 'item-check', role: 'checkbox', 'aria-checked': String(state.selected.has(key)), 'aria-label': 'Select', tabindex: '-1', html: icon('check') });
    c.addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(key, e.shiftKey); });
    return c;
  }
  function menuBtn(kind, item) {
    const b = el('button', { class: 'icon-btn sm item-menu', type: 'button', 'aria-label': 'Actions for ' + item.name, html: icon('ellipsis-vertical') });
    b.addEventListener('click', (e) => { e.stopPropagation(); const r = b.getBoundingClientRect(); openMenu(kind, item, r.right - 200, r.bottom + 4); });
    return b;
  }

  function bindItem(node, kind, item, index) {
    const key = keyOf(kind, item.id);
    node.dataset.key = key;
    node.id = kind === 'f' ? 'file-' + item.id : 'folder-' + item.id;
    node.tabIndex = 0;
    if (state.selected.has(key)) node.classList.add('is-selected');
    node.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || (fm.classList.contains('has-selection') && window.matchMedia('(hover: none)').matches)) {
        toggleSelect(key, e.shiftKey);
        return;
      }
      openItem(kind, item);
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); openItem(kind, item); }
      if (e.key === ' ') { e.preventDefault(); toggleSelect(key, e.shiftKey); }
    });
    node.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!state.selected.has(key)) { state.selected.clear(); state.selected.add(key); syncSelectionClasses(); } openMenu(kind, item, e.clientX, e.clientY); });
    // Long press = select (touch devices)
    let timer = null;
    node.addEventListener('touchstart', () => { timer = setTimeout(() => { toggleSelect(key); timer = 'fired'; }, 500); }, { passive: true });
    node.addEventListener('touchend', (e) => { if (timer === 'fired') e.preventDefault(); clearTimeout(timer); timer = null; });
    node.addEventListener('touchmove', () => { clearTimeout(timer); timer = null; }, { passive: true });
    // Internal drag & drop for moving
    node.draggable = true;
    node.addEventListener('dragstart', (e) => {
      if (!state.selected.has(key)) { state.selected.clear(); state.selected.add(key); syncSelectionClasses(); }
      e.dataTransfer.setData('application/x-bzx-items', JSON.stringify(Array.from(state.selected)));
      e.dataTransfer.effectAllowed = 'move';
      node.classList.add('is-dragging');
    });
    node.addEventListener('dragend', () => node.classList.remove('is-dragging'));
    if (kind === 'd') makeDropTarget(node, item.id);
    node.dataset.index = index !== undefined ? index : '';
  }

  function makeDropTarget(node, folderId) {
    const isInternal = (e) => Array.from(e.dataTransfer.types || []).includes('application/x-bzx-items');
    node.addEventListener('dragover', (e) => { if (isInternal(e)) { e.preventDefault(); e.stopPropagation(); node.classList.add('drop-hover'); } });
    node.addEventListener('dragleave', () => node.classList.remove('drop-hover'));
    node.addEventListener('drop', (e) => {
      if (!isInternal(e)) return;
      e.preventDefault(); e.stopPropagation();
      node.classList.remove('drop-hover');
      const keys = JSON.parse(e.dataTransfer.getData('application/x-bzx-items') || '[]');
      if (keys.includes(keyOf('d', folderId))) return;
      moveItems(keys, folderId || null);
    });
  }

  function folderCard(f) {
    const node = el('div', { class: 'item folder-card', role: 'gridcell', 'aria-label': 'Folder ' + f.name }, [
      el('span', { class: 'folder-icon', html: icon('folder') }),
      el('div', { class: 'item-text' }, [
        el('span', { class: 'item-name', title: f.name, text: f.name }),
        el('span', { class: 'item-sub', text: countText(f) }),
      ]),
      checkBox(keyOf('d', f.id)),
      menuBtn('d', f),
    ]);
    bindItem(node, 'd', f);
    return node;
  }

  function countText(f) {
    const parts = [];
    if (f.folder_count) parts.push(f.folder_count + ' folder' + (f.folder_count > 1 ? 's' : ''));
    parts.push(f.file_count + ' file' + (f.file_count === 1 ? '' : 's'));
    if (f.file_count) parts.push(f.size_h);
    return parts.join(' · ');
  }

  function fileCard(f, i) {
    const thumb = el('div', { class: 'thumb' }, [el('span', { class: 'big-icon cat-' + f.category, html: icon(f.icon) })]);
    if (f.thumb && boot.driveConnected) {
      thumb.classList.add('has-img');
      thumb.append(el('img', { alt: '', 'data-src': boot.base + '/thumb.php?id=' + f.id, loading: 'lazy' }));
    }
    if (f.extension) thumb.append(el('span', { class: 'ext-badge', text: f.extension }));
    const node = el('div', { class: 'item file-card', role: 'gridcell', 'aria-label': f.name }, [
      thumb,
      el('div', { class: 'meta' }, [
        el('span', { class: 'item-name', title: f.name, text: f.name }),
        el('span', { class: 'item-sub', text: f.size_h + ' · ' + (isGlobal() ? f.folder_name : f.created_short) }),
      ]),
      checkBox(keyOf('f', f.id)),
      menuBtn('f', f),
    ]);
    bindItem(node, 'f', f, i);
    return node;
  }

  function listHead() {
    const sortBtn = (label, key) => {
      const active = state.sort === key;
      return el('button', { type: 'button', html: label + (active ? icon(state.dir === 'asc' ? 'arrow-up' : 'arrow-down') : ''), onclick: () => {
        const dir = active && state.dir === 'asc' ? 'desc' : (active ? 'asc' : (key === 'name' ? 'asc' : 'desc'));
        setSort(key, dir);
      } });
    };
    const all = el('span', { class: 'item-check', role: 'checkbox', 'aria-label': 'Select all', html: icon('check') });
    all.style.opacity = 1;
    all.addEventListener('click', () => selectAll());
    return el('div', { class: 'list-head' }, [
      all,
      sortBtn('Name', 'name'),
      el('span', { class: 'col-owner', text: isGlobal() ? 'Location' : 'Uploaded by' }),
      sortBtn('Size', 'size'),
      sortBtn('Modified', 'date'),
      el('span'),
    ]);
  }

  function folderRow(f) {
    const node = el('div', { class: 'item', role: 'row' }, [
      checkBox(keyOf('d', f.id)),
      el('div', { class: 'name-cell' }, [el('span', { class: 'folder-icon', html: icon('folder') }), el('div', { class: 'item-text' }, [el('span', { class: 'item-name', text: f.name }), el('span', { class: 'item-sub list-sub', text: countText(f) })])]),
      el('span', { class: 'cell col-owner', text: '—' }),
      el('span', { class: 'cell', text: f.file_count ? f.size_h : '—' }),
      el('span', { class: 'cell', text: f.created_short }),
      menuBtn('d', f),
    ]);
    bindItem(node, 'd', f);
    return node;
  }

  function fileRow(f, i) {
    const node = el('div', { class: 'item', role: 'row' }, [
      checkBox(keyOf('f', f.id)),
      el('div', { class: 'name-cell' }, [el('span', { class: 'file-badge cat-' + f.category, html: icon(f.icon) }), el('div', { class: 'item-text' }, [el('span', { class: 'item-name', title: f.name, text: f.name }), el('span', { class: 'item-sub list-sub', text: f.size_h + ' · ' + f.created_short })])]),
      el('span', { class: 'cell col-owner', text: isGlobal() ? f.folder_name : f.uploader }),
      el('span', { class: 'cell', text: f.size_h }),
      el('span', { class: 'cell', text: f.created_short }),
      menuBtn('f', f),
    ]);
    bindItem(node, 'f', f, i);
    return node;
  }

  function lazyThumbs() {
    const imgs = $$('img[data-src]', fm);
    const load = (img) => {
      img.onload = () => { img.classList.add('is-loaded'); const ic = img.parentElement.querySelector('.big-icon'); if (ic) ic.remove(); };
      img.onerror = () => { img.closest('.thumb').classList.remove('has-img'); img.remove(); };
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    };
    if (!('IntersectionObserver' in window)) { imgs.forEach(load); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); load(en.target); } }), { rootMargin: '200px' });
    imgs.forEach((i) => io.observe(i));
  }

  function flashItem(id) {
    const n = document.getElementById(id);
    if (!n) return;
    n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    n.classList.add('is-flash');
    setTimeout(() => n.classList.remove('is-flash'), 1800);
  }

  // ------------------------------------------------------------ selection
  function allKeys() {
    return [...state.data.folders.map((f) => keyOf('d', f.id)), ...state.data.files.map((f) => keyOf('f', f.id))];
  }
  function toggleSelect(key, range) {
    const keys = allKeys();
    const idx = keys.indexOf(key);
    if (range && state.lastIndex !== null) {
      const [a, b] = [Math.min(idx, state.lastIndex), Math.max(idx, state.lastIndex)];
      for (let i = a; i <= b; i++) state.selected.add(keys[i]);
    } else if (state.selected.has(key)) state.selected.delete(key);
    else state.selected.add(key);
    state.lastIndex = idx;
    syncSelectionClasses();
  }
  function selectAll() {
    const keys = allKeys();
    if (keys.every((k) => state.selected.has(k))) state.selected.clear();
    else keys.forEach((k) => state.selected.add(k));
    syncSelectionClasses();
  }
  function syncSelectionClasses() {
    $$('.item[data-key]', fm).forEach((n) => {
      const on = state.selected.has(n.dataset.key);
      n.classList.toggle('is-selected', on);
      const c = $('.item-check', n); if (c) c.setAttribute('aria-checked', String(on));
    });
    fm.classList.toggle('has-selection', state.selected.size > 0);
    updateSelection();
  }
  function updateSelection() {
    const n = state.selected.size;
    selBar.hidden = n === 0;
    $('#selection-count').textContent = n + ' selected';
    const hasFolders = Array.from(state.selected).some((k) => k.startsWith('d:'));
    $('[data-action="bulk-download"]', selBar).hidden = hasFolders;
  }
  function selection() {
    const files = [], folders = [];
    state.selected.forEach((k) => { const [t, id] = k.split(':'); (t === 'f' ? files : folders).push(Number(id)); });
    return { files, folders };
  }
  const findFile = (id) => state.data.files.find((f) => f.id === id);
  const findFolder = (id) => state.data.folders.find((f) => f.id === id);

  // -------------------------------------------------------------- actions
  function openItem(kind, item) {
    if (kind === 'd') navigate({ folder: item.id, q: '', type: '', view: '' });
    else preview(item);
  }

  function download(f) {
    const a = el('a', { href: boot.base + '/download.php?id=' + f.id, download: '' });
    document.body.append(a); a.click(); a.remove();
  }

  async function renameItem(kind, item) {
    const name = await B.prompt({ title: kind === 'd' ? 'Rename folder' : 'Rename file', label: 'Name', value: item.name, confirm: 'Rename', selectBase: kind === 'f' });
    if (!name || name === item.name) return;
    try {
      await api(kind === 'd' ? 'folders.rename' : 'files.rename', { id: item.id, name });
      toast('Renamed to “' + name + '”.', 'success');
      load({ silent: true });
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteItems(files, folders) {
    const count = files.length + folders.length;
    if (!count) return;
    let msg;
    if (count === 1) {
      const it = files.length ? findFile(files[0]) : findFolder(folders[0]);
      msg = folders.length ? '“' + (it ? it.name : 'This folder') + '” and everything inside it will be moved to the Google Drive trash.' : '“' + (it ? it.name : 'This file') + '” will be moved to the Google Drive trash (recoverable for 30 days).';
    } else msg = count + ' items will be moved to the Google Drive trash (recoverable for 30 days).' + (folders.length ? ' Folders are deleted with their contents.' : '');
    const ok = await B.confirm({ title: count === 1 ? 'Delete item?' : 'Delete ' + count + ' items?', message: msg, confirm: 'Delete', danger: true });
    if (!ok) return;
    try {
      const r = await api('items.delete', { files, folders });
      state.selected.clear();
      if (r.errors && r.errors.length) toast(r.errors[0], 'error');
      if (r.deleted) toast(r.deleted === 1 ? 'Item deleted.' : r.deleted + ' items deleted.', 'success');
      load({ silent: true });
    } catch (e) { toast(e.message, 'error'); }
  }

  async function moveItems(keys, target) {
    const files = [], folders = [];
    keys.forEach((k) => { const [t, id] = k.split(':'); (t === 'f' ? files : folders).push(Number(id)); });
    try {
      const r = await api('items.move', { files, folders, target });
      state.selected.clear();
      if (r.errors && r.errors.length) toast(r.errors[0], 'error');
      if (r.moved) toast(r.moved === 1 ? 'Item moved.' : r.moved + ' items moved.', 'success');
      load({ silent: true });
    } catch (e) { toast(e.message, 'error'); }
  }

  async function moveDialog(files, folders) {
    let tree;
    try { tree = (await api('folders.tree')).folders; } catch (e) { toast(e.message, 'error'); return; }
    const blocked = new Set(folders);
    // Also block descendants of moved folders.
    let changed = true;
    while (changed) { changed = false; tree.forEach((f) => { if (f.parent_id && blocked.has(f.parent_id) && !blocked.has(f.id)) { blocked.add(f.id); changed = true; } }); }
    const target = await B.modal((box, close) => {
      let chosen = undefined;
      const treeEl = el('div', { class: 'move-tree', role: 'listbox' });
      const ok = el('button', { class: 'btn btn-primary', type: 'button', text: 'Move here', disabled: true, onclick: () => close({ id: chosen }) });
      const add = (id, name, depth) => {
        const b = el('button', { type: 'button', role: 'option', style: 'padding-left:' + (10 + depth * 18) + 'px', disabled: blocked.has(id), html: icon(id ? 'folder' : 'house') });
        b.append(document.createTextNode(name));
        b.addEventListener('click', () => { $$('button', treeEl).forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active'); chosen = id; ok.disabled = false; });
        treeEl.append(b);
      };
      add(null, 'My Files', 0);
      tree.forEach((f) => add(f.id, f.name, f.depth));
      box.classList.add('lg');
      box.append(el('div', { class: 'modal-body' }, [
        el('h3', { text: 'Move ' + (files.length + folders.length) + ' item' + (files.length + folders.length > 1 ? 's' : '') }),
        el('p', { class: 'muted', text: 'Choose a destination folder.' }),
        treeEl,
        el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-secondary', type: 'button', text: 'Cancel', onclick: () => close(null) }), ok]),
      ]));
    });
    if (!target) return;
    moveItems([...files.map((i) => 'f:' + i), ...folders.map((i) => 'd:' + i)], target.id);
  }

  async function newFolder() {
    const name = await B.prompt({ title: 'New folder', label: 'Folder name', value: 'Untitled folder', confirm: 'Create' });
    if (!name) return;
    try {
      const r = await api('folders.create', { name, parent_id: B.currentFolder() });
      toast('Folder “' + r.folder.name + '” created.', 'success');
      if (isGlobal()) navigate({ q: '', type: '', view: '' });
      else load({ silent: true, flash: 'folder-' + r.folder.id });
    } catch (e) { toast(e.message, 'error'); }
  }

  // -------------------------------------------------------- context menu
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(kind, item, x, y) {
    closeMenu();
    const sel = selection();
    const multi = state.selected.size > 1 && state.selected.has(keyOf(kind, item.id));
    const entry = (ic, label, fn, danger) => {
      const b = el('button', { class: 'dropdown-item' + (danger ? ' danger' : ''), type: 'button', role: 'menuitem', html: icon(ic), onclick: () => { closeMenu(); fn(); } });
      b.append(el('span', { text: label })); // textContent keeps file names XSS-safe
      return b;
    };
    const items = [];
    const writable = boot.driveConnected;
    if (multi) {
      if (!sel.folders.length) items.push(entry('download', 'Download ' + state.selected.size + ' files', () => bulkDownload()));
      if (writable) items.push(entry('folder-input', 'Move…', () => moveDialog(sel.files, sel.folders)));
      if (writable) items.push(el('hr'), entry('trash-2', 'Delete ' + state.selected.size + ' items', () => deleteItems(sel.files, sel.folders), true));
    } else if (kind === 'd') {
      items.push(entry('folder-open', 'Open', () => openItem('d', item)));
      if (writable) {
        items.push(entry('pencil', 'Rename', () => renameItem('d', item)));
        items.push(entry('folder-input', 'Move…', () => moveDialog([], [item.id])));
        items.push(el('hr'), entry('trash-2', 'Delete', () => deleteItems([], [item.id]), true));
      }
    } else {
      items.push(entry('eye', 'Preview', () => preview(item)));
      items.push(entry('download', 'Download', () => download(item)));
      items.push(entry('info', 'Details', () => details(item)));
      if (writable) {
        items.push(entry('pencil', 'Rename', () => renameItem('f', item)));
        items.push(entry('folder-input', 'Move…', () => moveDialog([item.id], [])));
        items.push(el('hr'), entry('trash-2', 'Delete', () => deleteItems([item.id], []), true));
      }
    }
    menuEl = el('div', { class: 'context-menu', role: 'menu' }, items);
    document.body.append(menuEl);
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    menuEl.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
    const firstBtn = $('button', menuEl); if (firstBtn) firstBtn.focus();
  }
  document.addEventListener('click', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

  // ---------------------------------------------------------------- preview
  function preview(file) {
    const files = state.data.files;
    let index = files.findIndex((f) => f.id === file.id);
    const overlay = el('div', { class: 'preview', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Preview' });
    const title = el('div', { class: 'title' });
    const stage = el('div', { class: 'preview-stage' });
    const prev = el('button', { class: 'preview-nav prev', type: 'button', 'aria-label': 'Previous file', html: icon('chevron-left') });
    const next = el('button', { class: 'preview-nav next', type: 'button', 'aria-label': 'Next file', html: icon('chevron-right') });
    const dl = el('button', { class: 'btn btn-secondary sm', type: 'button', html: icon('download') + '<span>Download</span>' });
    const info = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Details', title: 'Details', html: icon('info') });
    const close = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close preview', html: icon('x') });
    overlay.append(el('div', { class: 'preview-bar' }, [title, dl, info, close]), stage);
    const prevFocus = document.activeElement;

    function show() {
      const f = files[index];
      title.replaceChildren(el('strong', { text: f.name }), el('small', { text: f.size_h + ' · ' + f.mime + ' · ' + f.created }));
      stage.replaceChildren();
      const src = boot.base + '/download.php?id=' + f.id + '&inline=1';
      if (!boot.driveConnected) {
        stage.append(noPreview(f, 'Google Drive is disconnected, so this file cannot be previewed right now.'));
      } else if (f.preview === 'image') {
        stage.append(el('img', { src, alt: f.name }));
      } else if (f.preview === 'video') {
        stage.append(el('video', { src, controls: true, autoplay: true, playsinline: true, preload: 'metadata' }));
      } else if (f.preview === 'audio') {
        stage.append(el('div', { class: 'audio-card' }, [el('span', { class: 'big-icon cat-audio', html: icon('music') }), el('audio', { src, controls: true, autoplay: true })]));
      } else if (f.preview === 'pdf') {
        stage.append(el('iframe', { src, title: f.name }));
      } else {
        stage.append(noPreview(f, 'Preview is not available for this file type. Download it to open it on your device.'));
      }
      if (files.length > 1) stage.append(prev, next);
      dl.onclick = () => download(f);
      info.onclick = () => details(f);
    }
    function noPreview(f, msg) {
      return el('div', { class: 'no-preview' }, [
        el('span', { class: 'big-icon cat-' + f.category, html: icon(f.icon) }),
        el('h3', { text: f.name }),
        el('p', { text: msg }),
        el('dl', { class: 'kv' }, [kv('Type', f.mime), kv('Size', f.size_h), kv('Uploaded', f.created), kv('Uploaded by', f.uploader)]),
        el('button', { class: 'btn btn-primary', type: 'button', html: icon('download') + '<span>Download</span>', onclick: () => download(f) }),
      ]);
    }
    const go = (d) => { index = (index + d + files.length) % files.length; show(); };
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    const onKey = (e) => {
      if (document.querySelector('.drawer')) return;
      if (e.key === 'Escape') shut();
      else if (e.key === 'ArrowLeft' && files.length > 1) go(-1);
      else if (e.key === 'ArrowRight' && files.length > 1) go(1);
    };
    function shut() { document.removeEventListener('keydown', onKey); overlay.remove(); document.body.style.overflow = ''; if (prevFocus) prevFocus.focus(); }
    close.onclick = shut;
    overlay.addEventListener('click', (e) => { if (e.target === stage) shut(); });
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.body.append(overlay);
    show();
    close.focus();
  }

  function kv(k, v) { return el('div', null, [el('dt', { text: k }), el('dd', { text: v === null || v === undefined || v === '' ? '—' : String(v) })]); }

  // ---------------------------------------------------------------- details
  async function details(f) {
    const existing = $('.drawer'); if (existing) existing.remove();
    const body = el('div', { class: 'drawer-body' }, [el('div', { class: 'fm-loading' }, [el('span', { class: 'spinner' })])]);
    const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close details', html: icon('x') });
    const drawer = el('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'File details' }, [
      el('div', { class: 'drawer-head' }, [el('h3', { text: 'File details' }), closeBtn]), body,
    ]);
    const shut = () => { drawer.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
    closeBtn.onclick = shut;
    document.addEventListener('keydown', onKey);
    document.body.append(drawer);
    try {
      const d = (await api('files.details', undefined, { query: { id: f.id } })).file;
      const thumb = el('div', { class: 'drawer-thumb' }, [el('span', { class: 'big-icon cat-' + d.category, html: icon(d.icon) })]);
      if (d.thumb && boot.driveConnected) {
        const img = el('img', { src: boot.base + '/thumb.php?id=' + d.id, alt: '' });
        img.onerror = () => img.remove();
        img.onload = () => { const ic = $('.big-icon', thumb); if (ic) ic.remove(); };
        thumb.append(img);
      }
      const actions = el('div', { class: 'drawer-actions' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', html: icon('eye') + '<span>Preview</span>', onclick: () => { shut(); preview(d); } }),
        el('button', { class: 'btn btn-primary', type: 'button', html: icon('download') + '<span>Download</span>', onclick: () => download(d) }),
      ]);
      body.replaceChildren(thumb, el('div', null, [el('h3', { text: d.name, style: 'overflow-wrap:anywhere' })]), actions,
        el('dl', { class: 'kv' }, [kv('Type', d.mime), kv('Category', page.categories[d.category]), kv('Size', d.size_h + ' (' + d.size.toLocaleString() + ' bytes)'),
          kv('Location', d.path), kv('Uploaded', d.created), kv('Last modified', d.updated), kv('Uploaded by', d.uploader), kv('MD5 checksum', d.md5),
          kv('Storage', 'Google Drive (private)')]));
    } catch (e) { body.replaceChildren(el('p', { class: 'muted', text: e.message })); }
  }

  async function bulkDownload() {
    const { files } = selection();
    if (!files.length) return;
    if (files.length > 1) toast('Starting ' + files.length + ' downloads. Your browser may ask to allow multiple downloads.', 'info');
    for (const id of files) {
      const f = findFile(id);
      if (f) download(f);
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  // ------------------------------------------------------------------ wiring
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const sel = selection();
    switch (a.dataset.action) {
      case 'new-folder': newFolder(); break;
      case 'clear-selection': state.selected.clear(); syncSelectionClasses(); break;
      case 'bulk-delete': deleteItems(sel.files, sel.folders); break;
      case 'bulk-move': moveDialog(sel.files, sel.folders); break;
      case 'bulk-download': bulkDownload(); break;
    }
  });
  $$('.segmented button').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.view;
    try { localStorage.setItem('bzx-view', state.mode); } catch (_) {}
    render();
  }));
  function setSort(sort, dir) {
    state.sort = sort; state.dir = dir;
    sortSel.value = sort + ':' + dir;
    try { localStorage.setItem('bzx-sort', sort + ':' + dir); } catch (_) {}
    load({ silent: true });
  }
  sortSel.addEventListener('change', () => { const [s, d] = sortSel.value.split(':'); setSort(s, d); });
  typeSel.addEventListener('change', () => navigate({ type: typeSel.value, view: '' }));
  let searchTimer;
  searchInput.addEventListener('input', () => {
    // Keep state in sync immediately so a filter change during the debounce uses the new text.
    state.q = searchInput.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => navigate({ q: searchInput.value.trim() }, true), 300);
  });
  // Top-bar search stays on this page instead of reloading.
  const topSearch = $('.topbar .search');
  if (topSearch) topSearch.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('input', topSearch).value.trim();
    searchInput.value = v;
    navigate({ q: v });
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, .modal, dialog, .preview')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected.size && boot.driveConnected) {
      e.preventDefault();
      const s = selection(); deleteItems(s.files, s.folders);
    }
    if (e.key === 'Escape' && state.selected.size) { state.selected.clear(); syncSelectionClasses(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && state.data) { e.preventDefault(); selectAll(); }
    if (e.key === 'F2' && state.selected.size === 1) {
      const [t, id] = Array.from(state.selected)[0].split(':');
      const item = t === 'f' ? findFile(Number(id)) : findFolder(Number(id));
      if (item) renameItem(t, item);
    }
  });

  document.addEventListener('bzx:uploaded', (e) => {
    const fid = e.detail.folderId || null;
    if (isGlobal() || fid === (state.folder || null)) {
      clearTimeout(window.__bzxReload);
      window.__bzxReload = setTimeout(() => load({ silent: true, flash: e.detail.file ? 'file-' + e.detail.file.id : null }), 300);
    }
  });

  history.replaceState({ folder: state.folder, q: state.q, type: state.type, view: state.view }, '', location.href);
  updateNav();
  const hash = location.hash.replace('#', '');
  load({ flash: hash || null });
})();
