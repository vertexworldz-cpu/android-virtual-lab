<div class="page-head fm-head">
  <div class="fm-title">
    <nav class="breadcrumb" id="breadcrumb" aria-label="Breadcrumb"></nav>
    <h1 id="fm-heading"><?= e($title) ?></h1>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary" type="button" data-action="new-folder" <?= $driveConnected ? '' : 'disabled' ?>><?= icon('folder-plus') ?><span>New folder</span></button>
    <button class="btn btn-primary" type="button" data-action="upload" <?= $driveConnected ? '' : 'disabled' ?>><?= icon('upload') ?><span>Upload</span></button>
  </div>
</div>

<?php if (!$driveConnected): ?>
  <div class="alert alert-warning"><?= icon('cloud-off') ?><div><strong>Google Drive disconnected.</strong> Browsing works from cached metadata, but uploads, previews and changes are unavailable until Drive is reconnected.</div></div>
<?php endif; ?>

<div class="toolbar" id="toolbar">
  <div class="toolbar-left">
    <div class="search-inline">
      <?= icon('search') ?>
      <input type="search" id="fm-search" placeholder="Filter in this view" aria-label="Filter files" value="<?= e($pageData['q']) ?>">
    </div>
    <label class="select-wrap">
      <span class="sr-only">File type</span>
      <select id="fm-type">
        <option value="">All types</option>
        <?php foreach (\Bladezux\FileTypes::CATEGORIES as $k => $c): ?>
          <option value="<?= e($k) ?>" <?= $pageData['type'] === $k ? 'selected' : '' ?>><?= e($c['label']) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
    <label class="select-wrap">
      <span class="sr-only">Sort by</span>
      <select id="fm-sort">
        <option value="name:asc">Name A–Z</option>
        <option value="name:desc">Name Z–A</option>
        <option value="date:desc">Newest first</option>
        <option value="date:asc">Oldest first</option>
        <option value="size:desc">Largest first</option>
        <option value="size:asc">Smallest first</option>
        <option value="type:asc">Type</option>
      </select>
    </label>
  </div>
  <div class="toolbar-right">
    <div class="segmented" role="group" aria-label="View mode">
      <button type="button" data-view="grid" aria-label="Grid view" title="Grid view"><?= icon('layout-grid') ?></button>
      <button type="button" data-view="list" aria-label="List view" title="List view"><?= icon('list') ?></button>
    </div>
  </div>
</div>

<div class="selection-bar" id="selection-bar" hidden>
  <div><button class="icon-btn sm" type="button" data-action="clear-selection" aria-label="Clear selection"><?= icon('x') ?></button><strong id="selection-count">0 selected</strong></div>
  <div class="selection-actions">
    <button class="btn btn-ghost" type="button" data-action="bulk-download"><?= icon('download') ?><span>Download</span></button>
    <button class="btn btn-ghost" type="button" data-action="bulk-move"><?= icon('folder-input') ?><span>Move</span></button>
    <button class="btn btn-ghost danger" type="button" data-action="bulk-delete"><?= icon('trash-2') ?><span>Delete</span></button>
  </div>
</div>

<section class="fm" id="fm" aria-live="polite">
  <div class="fm-loading" id="fm-loading"><span class="spinner"></span> Loading files…</div>
</section>

<template id="tpl-context">
  <div class="context-menu" role="menu"></div>
</template>
