/*
 * Bladezux Cloud Storage — resumable upload manager.
 *
 * 1. upload.init   → PHP validates the file and opens a Google Drive resumable session.
 * 2. PUT chunks    → the browser sends chunks straight to the Drive session URI (CORS),
 *                    so large files never pass through PHP's upload handling.
 *    Fallback      → if the browser cannot reach the session URI directly, chunks are
 *                    relayed through upload.relay (one chunk at a time, never stored).
 * 3. upload.status → PHP asks Google for the authoritative byte offset (resume/recovery)
 *                    and, once complete, verifies the file and records it in MySQL.
 */
(function () {
  'use strict';
  const { api, toast, el, icon, iconEl, $, fmtBytes, fmtDuration, boot } = window.BZX;

  const CONCURRENCY = 2;
  const MAX_RETRIES = 8;
  const RETRY_DELAYS = [1, 2, 4, 8, 15, 30, 30, 60];
  const QUANTUM = 256 * 1024;
  const RELAY_KEY = 'bzx-upload-mode';

  const EXT_CATS = {
    image: 'jpg jpeg png gif webp bmp svg tif tiff heic heif avif ico psd',
    video: 'mp4 m4v mov avi mkv webm wmv flv mpeg mpg 3gp',
    audio: 'mp3 wav ogg oga flac aac m4a wma opus aiff',
    pdf: 'pdf',
    archive: 'zip rar 7z tar gz tgz bz2 xz iso dmg',
    spreadsheet: 'xls xlsx xlsm csv ods numbers tsv',
    presentation: 'ppt pptx odp key pps ppsx',
    document: 'doc docx odt rtf txt md pages tex epub json xml html',
  };
  const CAT_ICONS = { image: 'image', video: 'film', audio: 'music', pdf: 'file-type', archive: 'file-archive', spreadsheet: 'file-spreadsheet', presentation: 'presentation', document: 'file-text', other: 'file' };
  function categoryOf(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    for (const [cat, list] of Object.entries(EXT_CATS)) if (list.split(' ').includes(ext)) return cat;
    return 'other';
  }

  function preferRelay() {
    try { return sessionStorage.getItem(RELAY_KEY) === 'relay'; } catch (_) { return false; }
  }
  function setPreferRelay() {
    try { sessionStorage.setItem(RELAY_KEY, 'relay'); } catch (_) {}
  }

  async function readHead(file) {
    const buf = await file.slice(0, 4096).arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class UploadItem {
    constructor(file, folderId, manager) {
      this.file = file;
      this.folderId = folderId;
      this.manager = manager;
      this.name = file.name;
      this.size = file.size;
      this.state = 'queued';
      this.offset = 0;
      this.loadedInChunk = 0;
      this.retries = 0;
      this.mode = preferRelay() ? 'relay' : 'direct';
      this.directConfirmed = false;
      this.samples = [];
      this.conflict = null;
      this.message = 'Waiting…';
      this.render();
    }

    get uploaded() { return Math.min(this.size, this.offset + this.loadedInChunk); }
    get percent() { return this.size ? Math.floor((this.uploaded / this.size) * 100) : 0; }

    render() {
      const cat = categoryOf(this.name);
      this.progressEl = el('span');
      this.metaEl = el('div', { class: 'upload-meta' });
      this.actionsEl = el('div', { class: 'upload-actions' });
      this.node = el('div', { class: 'upload-item' }, [
        el('span', { class: 'file-badge cat-' + cat, html: icon(CAT_ICONS[cat]) }),
        el('div', { class: 'upload-info' }, [
          el('div', { class: 'upload-name', title: this.name, text: this.name }),
          el('div', { class: 'progress' }, [this.progressEl]),
          this.metaEl,
        ]),
        this.actionsEl,
      ]);
      this.update();
    }

    setState(state, message) {
      this.state = state;
      if (message !== undefined) this.message = message;
      this.update();
      this.manager.refreshSummary();
    }

    speed() {
      const now = performance.now();
      this.samples = this.samples.filter((s) => now - s.t < 6000);
      if (this.samples.length < 2) return 0;
      const first = this.samples[0];
      const last = this.samples[this.samples.length - 1];
      const dt = (last.t - first.t) / 1000;
      return dt > 0 ? (last.b - first.b) / dt : 0;
    }

    update() {
      const n = this.node;
      n.className = 'upload-item is-' + this.state;
      const pct = this.state === 'done' ? 100 : this.percent;
      this.progressEl.style.width = pct + '%';
      const meta = [];
      if (this.state === 'uploading') {
        const sp = this.speed();
        meta.push(el('span', { text: pct + '%' }));
        meta.push(el('span', { text: fmtBytes(this.uploaded) + ' / ' + fmtBytes(this.size) }));
        if (sp > 0) {
          meta.push(el('span', { text: fmtBytes(sp) + '/s' }));
          meta.push(el('span', { text: fmtDuration((this.size - this.uploaded) / sp) + ' left' }));
        }
        if (this.mode === 'relay') meta.push(el('span', { text: 'via server', title: 'Direct browser-to-Drive upload was unavailable, chunks are relayed through the server.' }));
      } else if (this.state === 'done') {
        meta.push(el('span', { class: 'ok', text: 'Uploaded · ' + fmtBytes(this.size) }));
      } else if (this.state === 'error') {
        meta.push(el('span', { class: 'err', text: this.message }));
      } else {
        meta.push(el('span', { text: this.message + (this.uploaded > 0 && this.state !== 'skipped' ? ' · ' + pct + '%' : '') }));
      }
      this.metaEl.replaceChildren(...meta);

      const btn = (name, label, fn) => el('button', { class: 'icon-btn sm', type: 'button', title: label, 'aria-label': label + ' ' + this.name, html: icon(name), onclick: fn });
      const actions = [];
      if (['uploading', 'retrying', 'preparing', 'queued'].includes(this.state)) actions.push(btn('pause', 'Pause', () => this.pause()));
      if (this.state === 'paused') actions.push(btn('play', 'Resume', () => this.resume()));
      if (this.state === 'error') actions.push(btn('rotate-ccw', 'Retry', () => this.retry()));
      if (!['done', 'cancelled', 'skipped'].includes(this.state)) actions.push(btn('x', 'Cancel', () => this.cancel()));
      else actions.push(btn('check', 'Remove from list', () => this.manager.remove(this)));
      this.actionsEl.replaceChildren(...actions);
    }

    // ------------------------------------------------------------ lifecycle
    async start() {
      this.setState('preparing', 'Preparing…');
      try {
        if (!this.uploadId) {
          const ok = await this.init();
          if (!ok) return;
        } else {
          // Resuming after pause/error: Google is the source of truth for the offset.
          this.setState('preparing', 'Checking progress…');
          const st = await api('upload.status', { upload_id: this.uploadId });
          if (st.complete) { this.offset = this.size; this.finish(st.file); return; }
          this.offset = st.offset;
        }
        if (this.state === 'paused' || this.state === 'cancelled') return;
        await this.loop();
      } catch (e) {
        this.fail(e);
      } finally {
        this.manager.finished(this);
      }
    }

    async init(conflictChoice) {
      const head = await readHead(this.file);
      const payload = {
        folder_id: this.folderId,
        name: this.name,
        size: this.size,
        mime: this.file.type || '',
        last_modified: this.file.lastModified || 0,
        head,
      };
      if (conflictChoice) payload.conflict = conflictChoice;
      else if (this.manager.conflictForAll) payload.conflict = this.manager.conflictForAll;
      const res = await api('upload.init', payload);
      if (res.conflict) {
        this.setState('conflict', 'Name already exists');
        const choice = await this.manager.askConflict(this, res.existing);
        if (!choice || choice === 'skip') { this.setState('skipped', 'Skipped'); return false; }
        return this.init(choice);
      }
      if (res.skipped) { this.setState('skipped', 'Skipped (already exists)'); return false; }
      if (res.complete) { this.offset = this.size; this.finish(res.file); return false; }
      this.uploadId = res.upload_id;
      this.sessionUri = res.session_uri;
      this.offset = res.offset || 0;
      this.chunkSize = res.chunk_size;
      this.relayChunkSize = res.relay_chunk_size;
      if (res.name && res.name !== this.name) {
        this.name = res.name;
        this.node.querySelector('.upload-name').textContent = res.name;
      }
      if (res.resumed && this.offset > 0) toast('Resuming "' + this.name + '" from ' + this.percent + '%.', 'info');
      return true;
    }

    async loop() {
      this.setState('uploading', 'Uploading…');
      while (this.state === 'uploading' && this.offset < this.size) {
        const size = this.mode === 'relay' ? this.relayChunkSize : this.chunkSize;
        const end = Math.min(this.offset + size, this.size);
        const blob = this.file.slice(this.offset, end);
        let result;
        try {
          result = this.mode === 'relay' ? await this.sendRelay(blob) : await this.sendDirect(blob, end);
        } catch (err) {
          if (this.state !== 'uploading') return; // paused or cancelled
          const recovered = await this.recover(err);
          if (!recovered) return;
          continue;
        }
        this.retries = 0;
        this.loadedInChunk = 0;
        if (result.complete) {
          this.offset = this.size;
          if (result.file) { this.finish(result.file); return; }
          // Direct upload finished at Google; ask PHP to verify and record it.
          this.setState('uploading', 'Verifying…');
          const res = await this.withRetry(() => api('upload.complete', { upload_id: this.uploadId }));
          if (res && res.complete) { this.finish(res.file); return; }
          if (res) this.offset = res.offset;
          continue;
        }
        this.offset = result.offset;
      }
    }

    sendDirect(blob, end) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        this.xhr = xhr;
        xhr.open('PUT', this.sessionUri, true);
        xhr.setRequestHeader('Content-Range', 'bytes ' + this.offset + '-' + (end - 1) + '/' + this.size);
        xhr.upload.onprogress = (e) => this.onProgress(e.loaded);
        xhr.onload = () => {
          this.xhr = null;
          if (xhr.status === 308) {
            this.directConfirmed = true;
            // Only read Range if Google exposed it (avoids "unsafe header" console errors).
            const exposed = /^range:/im.test(xhr.getAllResponseHeaders());
            const range = exposed ? xhr.getResponseHeader('Range') : null;
            const m = range && range.match(/bytes=0-(\d+)/);
            resolve({ complete: false, offset: m ? Number(m[1]) + 1 : end });
          } else if (xhr.status === 200 || xhr.status === 201) {
            this.directConfirmed = true;
            resolve({ complete: true });
          } else {
            reject({ status: xhr.status, direct: true });
          }
        };
        xhr.onerror = () => { this.xhr = null; reject({ status: 0, direct: true }); };
        xhr.onabort = () => { this.xhr = null; reject({ status: -1, aborted: true }); };
        xhr.send(blob);
      });
    }

    sendRelay(blob) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        this.xhr = xhr;
        xhr.open('POST', boot.api + '?action=upload.relay', true);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-CSRF-Token', boot.csrf);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('X-Upload-Id', this.uploadId);
        xhr.setRequestHeader('X-Upload-Offset', String(this.offset));
        xhr.upload.onprogress = (e) => this.onProgress(e.loaded);
        xhr.onload = () => {
          this.xhr = null;
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch (_) {}
          if (xhr.status === 200 && data && data.ok) resolve(data);
          else reject({ status: xhr.status, message: data && data.error, code: data && data.code });
        };
        xhr.onerror = () => { this.xhr = null; reject({ status: 0 }); };
        xhr.onabort = () => { this.xhr = null; reject({ status: -1, aborted: true }); };
        xhr.send(blob);
      });
    }

    onProgress(loaded) {
      if (this.state !== 'uploading') return;
      this.loadedInChunk = loaded;
      this.samples.push({ t: performance.now(), b: this.uploaded });
      const now = performance.now();
      if (!this.lastPaint || now - this.lastPaint > 250) { this.lastPaint = now; this.update(); this.manager.refreshSummary(); }
    }

    /**
     * Error recovery: ask the server for the real offset. Returns false when the
     * upload should stop (fatal error or paused).
     */
    async recover(err) {
      this.loadedInChunk = 0;
      const fatalCodes = ['expired', 'cancelled', 'inactive', 'quota_exceeded', 'disconnected', 'not_found', 'verify_failed'];
      if (err && err.code && fatalCodes.includes(err.code)) { this.fail(err); return false; }
      if (err && err.status === 413) {
        // Relay chunk too large for the server: halve it (keep a 256 KiB multiple).
        this.relayChunkSize = Math.max(QUANTUM, Math.floor(this.relayChunkSize / 2 / QUANTUM) * QUANTUM);
      }
      while (this.state === 'uploading') {
        if (!navigator.onLine) {
          this.setState('uploading', 'Waiting for network…');
          await this.manager.waitOnline();
          if (this.state !== 'uploading') return false;
        }
        try {
          const st = await api('upload.status', { upload_id: this.uploadId });
          if (st.complete) { this.offset = this.size; this.finish(st.file); return false; }
          // Server reachable but the direct PUT failed at the network level:
          // the browser cannot talk to Google directly (CORS/firewall) → relay mode.
          if (err && err.direct && err.status === 0 && !this.directConfirmed && this.mode === 'direct') {
            this.mode = 'relay';
            setPreferRelay();
          }
          this.offset = st.offset;
          this.message = 'Uploading…';
          if (err && (err.status === 0 || err.status >= 500 || err.status === 429)) {
            if (this.retries > 0) await this.backoff();
          }
          this.retries++;
          if (this.retries > MAX_RETRIES) { this.fail({ message: 'Upload interrupted after several retries. Click retry to continue from ' + this.percent + '%.' }); return false; }
          return this.state === 'uploading';
        } catch (e) {
          if (e && ['expired', 'cancelled', 'quota_exceeded', 'disconnected', 'not_found'].includes(e.code)) { this.fail(e); return false; }
          this.retries++;
          if (this.retries > MAX_RETRIES) { this.fail({ message: 'Upload interrupted: ' + (e.message || 'network error') + '. Click retry to resume.' }); return false; }
          await this.backoff();
        }
      }
      return false;
    }

    async backoff() {
      const delay = RETRY_DELAYS[Math.min(this.retries, RETRY_DELAYS.length - 1)] * 1000;
      const until = Date.now() + delay;
      while (Date.now() < until && this.state === 'uploading') {
        this.message = 'Connection problem — retrying in ' + Math.ceil((until - Date.now()) / 1000) + 's';
        this.metaEl.replaceChildren(el('span', { text: this.message + ' · ' + this.percent + '%' }));
        await Promise.race([sleep(500), this.manager.onlineSignal()]);
        if (this.manager.justCameOnline) break;
      }
    }

    async withRetry(fn) {
      for (let i = 0; i < 5 && this.state === 'uploading'; i++) {
        try { return await fn(); } catch (e) {
          if (e.code && ['expired', 'verify_failed', 'not_found'].includes(e.code)) throw e;
          await sleep(1000 * (i + 1));
        }
      }
      return null;
    }

    finish(file) {
      this.loadedInChunk = 0;
      this.setState('done', 'Uploaded');
      this.manager.completed.push(file);
      document.dispatchEvent(new CustomEvent('bzx:uploaded', { detail: { file, folderId: this.folderId } }));
    }

    fail(err) {
      if (this.state === 'cancelled' || this.state === 'paused') return;
      const msg = (err && (err.message || (err.status ? 'Upload failed (HTTP ' + err.status + ')' : ''))) || 'Upload failed.';
      if (err && err.code === 'expired') this.uploadId = null; // must start a fresh session
      this.setState('error', msg);
    }

    pause() {
      if (this.state === 'queued') { this.setState('paused', 'Paused'); return; }
      this.loadedInChunk = 0; // only bytes Google has confirmed count after a pause
      this.setState('paused', 'Paused');
      if (this.xhr) this.xhr.abort();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.retries = 0;
      this.setState('queued', 'Waiting…');
      this.manager.pump();
    }

    retry() {
      this.retries = 0;
      this.setState('queued', 'Waiting…');
      this.manager.pump();
    }

    async cancel() {
      const prev = this.state;
      this.setState('cancelled', 'Cancelled');
      if (this.xhr) this.xhr.abort();
      if (this.uploadId && prev !== 'done') {
        try { await api('upload.cancel', { upload_id: this.uploadId }); } catch (_) {}
      }
    }
  }

  class UploadManager {
    constructor() {
      this.items = [];
      this.active = new Set();
      this.completed = [];
      this.conflictForAll = null;
      this.justCameOnline = false;
      this.onlineWaiters = [];
      this.panel = $('#upload-panel');
      this.list = $('#upload-list');
      this.input = $('#upload-input');
      this.bind();
    }

    bind() {
      if (!this.panel) return;
      document.addEventListener('click', (e) => {
        const a = e.target.closest('[data-action]');
        if (!a) return;
        switch (a.dataset.action) {
          case 'upload':
            if (!boot.driveConnected) { toast('Google Drive is disconnected. Uploads are unavailable.', 'error'); return; }
            this.input.click();
            break;
          case 'upload-pause-all': this.items.forEach((i) => ['uploading', 'queued', 'retrying', 'preparing'].includes(i.state) && i.pause()); break;
          case 'upload-resume-all': this.items.forEach((i) => i.state === 'paused' && i.resume()); break;
          case 'upload-collapse': this.panel.classList.toggle('is-collapsed'); break;
          case 'upload-close':
            if (this.hasActive()) { toast('Uploads are still running. Pause or cancel them first.', 'warning'); return; }
            this.items = []; this.list.replaceChildren(); this.panel.hidden = true; break;
        }
      });
      this.input.addEventListener('change', () => {
        this.add(Array.from(this.input.files || []));
        this.input.value = '';
      });

      // Drag & drop anywhere on the page.
      let depth = 0;
      const overlay = $('#drop-overlay');
      const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      window.addEventListener('dragenter', (e) => {
        if (!hasFiles(e) || !boot.driveConnected) return;
        depth++;
        const label = $('#drop-target-label');
        if (label) label.textContent = 'to ' + (window.BZX.currentFolderName ? window.BZX.currentFolderName() : 'My Files');
        overlay.hidden = false;
      });
      window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
      window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
      window.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        overlay.hidden = true;
        if (!boot.driveConnected) { toast('Google Drive is disconnected. Uploads are unavailable.', 'error'); return; }
        const files = Array.from(e.dataTransfer.files || []).filter((f) => f.size > 0 || f.type);
        if (!files.length) { toast('Folders cannot be dropped directly. Create a folder, then drop its files inside.', 'warning'); return; }
        this.add(files);
      });

      window.addEventListener('online', () => {
        this.justCameOnline = true;
        this.onlineWaiters.splice(0).forEach((r) => r());
        setTimeout(() => { this.justCameOnline = false; }, 1500);
        if (this.hasActive()) toast('Back online — resuming uploads.', 'success');
      });
      window.addEventListener('offline', () => { if (this.hasActive()) toast('Connection lost. Uploads will resume automatically.', 'warning'); });
      window.addEventListener('beforeunload', (e) => {
        if (this.hasActive()) { e.preventDefault(); e.returnValue = ''; }
      });
    }

    waitOnline() { return navigator.onLine ? Promise.resolve() : new Promise((r) => this.onlineWaiters.push(r)); }
    onlineSignal() { return new Promise((r) => this.onlineWaiters.push(r)); }

    hasActive() { return this.items.some((i) => ['uploading', 'queued', 'preparing', 'retrying', 'conflict'].includes(i.state)); }

    add(files) {
      if (!files.length) return;
      const folderId = window.BZX.currentFolder ? window.BZX.currentFolder() : (boot.currentFolder || null);
      this.panel.hidden = false;
      this.panel.classList.remove('is-collapsed');
      this.conflictForAll = null;
      files.forEach((f) => {
        if (f.size === 0) { toast('"' + f.name + '" is empty and was skipped.', 'warning'); return; }
        const item = new UploadItem(f, folderId, this);
        this.items.push(item);
        this.list.append(item.node);
      });
      this.refreshSummary();
      this.pump();
    }

    pump() {
      for (const item of this.items) {
        if (this.active.size >= CONCURRENCY) break;
        if (item.state === 'queued' && !this.active.has(item)) {
          this.active.add(item);
          item.start();
        }
      }
    }

    finished(item) {
      this.active.delete(item);
      this.refreshSummary();
      this.pump();
      if (!this.hasActive() && this.completed.length) {
        const n = this.completed.length;
        this.completed = [];
        toast(n === 1 ? 'Upload complete.' : n + ' files uploaded successfully.', 'success');
      }
    }

    remove(item) {
      this.items = this.items.filter((i) => i !== item);
      item.node.remove();
      if (!this.items.length) this.panel.hidden = true;
      this.refreshSummary();
    }

    refreshSummary() {
      const total = this.items.length;
      const done = this.items.filter((i) => i.state === 'done').length;
      const failed = this.items.filter((i) => i.state === 'error').length;
      const running = this.items.filter((i) => ['uploading', 'preparing'].includes(i.state));
      const title = $('#upload-title');
      const summary = $('#upload-summary');
      if (title) title.textContent = running.length ? 'Uploading ' + running.length + ' file' + (running.length > 1 ? 's' : '') : 'Uploads';
      if (summary) summary.textContent = done + ' of ' + total + ' complete' + (failed ? ' · ' + failed + ' failed' : '');
    }

    askConflict(item, existing) {
      return window.BZX.modal((box, close) => {
        const all = el('input', { type: 'checkbox' });
        const choose = (v) => { if (all.checked) this.conflictForAll = v; close(v); };
        box.append(el('div', { class: 'modal-body' }, [
          el('h3', { text: 'File already exists' }),
          el('p', { class: 'muted', text: '"' + existing.name + '" (' + existing.size_h + ', uploaded ' + existing.created + ') already exists in this folder.' }),
          el('label', { class: 'check' }, [all, 'Apply to all remaining conflicts']),
          el('div', { class: 'modal-actions' }, [
            el('button', { class: 'btn btn-secondary', type: 'button', text: 'Skip', onclick: () => choose('skip') }),
            el('button', { class: 'btn btn-secondary', type: 'button', text: 'Replace', onclick: () => choose('replace') }),
            el('button', { class: 'btn btn-primary', type: 'button', text: 'Keep both', onclick: () => choose('rename') }),
          ]),
        ]));
      });
    }
  }

  window.BZX.uploads = new UploadManager();
})();
