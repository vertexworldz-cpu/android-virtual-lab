<input type="file" id="upload-input" multiple hidden>
<div class="drop-overlay" id="drop-overlay" hidden>
  <div class="drop-overlay-inner"><?= icon('cloud-upload') ?><p>Drop files to upload</p><span class="muted" id="drop-target-label">to My Files</span></div>
</div>
<section class="upload-panel" id="upload-panel" hidden aria-label="Uploads">
  <header class="upload-panel-head">
    <div>
      <strong id="upload-title">Uploads</strong>
      <span class="muted" id="upload-summary"></span>
    </div>
    <div class="upload-panel-actions">
      <button class="icon-btn sm" type="button" data-action="upload-pause-all" title="Pause all" aria-label="Pause all"><?= icon('pause') ?></button>
      <button class="icon-btn sm" type="button" data-action="upload-resume-all" title="Resume all" aria-label="Resume all"><?= icon('play') ?></button>
      <button class="icon-btn sm" type="button" data-action="upload-collapse" title="Collapse" aria-label="Collapse"><?= icon('chevron-down') ?></button>
      <button class="icon-btn sm" type="button" data-action="upload-close" title="Close" aria-label="Close"><?= icon('x') ?></button>
    </div>
  </header>
  <div class="upload-list" id="upload-list"></div>
</section>
