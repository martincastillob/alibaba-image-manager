/* =========================================================
   Gestor de Imágenes para Catálogo Alibaba.com
   Frontend vanilla JS — sin frameworks
========================================================= */

const CONFIG = {
  MAX_FILE_SIZE: 4 * 1024 * 1024, // 4MB (límite de Vercel free)
  MAX_FILE_SIZE_LABEL: '4MB',
  MIN_DIMENSION: 800,
  MIN_PER_GROUP: 3,
  MAX_PER_GROUP: 6,
  ACCEPTED_TYPES: ['image/jpeg', 'image/png'],
  ACCEPTED_EXT_RE: /\.(jpe?g|png)$/i,
};

const state = {
  sessionId: null,
  images: new Map(),   // imageId -> { id, file, name, width, height, groupId, status, url, filename, errorMsg }
  groups: new Map(),   // groupId -> { id, name, order }
  groupOrder: [],      // for stable rendering order
};

let nextImageId = 1;
let nextGroupId = 1;

// ===== Utilities =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message, type = 'info', duration = 3500) {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

function readImageDimensions(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(null);
    };
    img.src = objUrl;
  });
}

function fileToDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ===== Session =====
async function initSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    state.sessionId = data.sessionId;
    $('#session-id-display').textContent = state.sessionId.slice(0, 8);
  } catch (err) {
    toast('No se pudo iniciar la sesión. Recarga la página.', 'error', 6000);
  }
}

// ===== File ingestion =====
async function ingestFiles(fileList) {
  const files = Array.from(fileList);
  const warnings = [];
  const errors = [];
  let added = 0;

  for (const file of files) {
    const validMime = CONFIG.ACCEPTED_TYPES.includes(file.type);
    const validExt = CONFIG.ACCEPTED_EXT_RE.test(file.name);

    if (!validMime && !validExt) {
      errors.push(`${file.name}: formato no soportado (solo JPG o PNG).`);
      continue;
    }

    if (file.size > CONFIG.MAX_FILE_SIZE) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      errors.push(`${file.name}: pesa ${mb}MB (máximo ${CONFIG.MAX_FILE_SIZE_LABEL}).`);
      continue;
    }

    const dims = await readImageDimensions(file);
    if (!dims) {
      errors.push(`${file.name}: no se pudo leer la imagen.`);
      continue;
    }

    const dataUrl = await fileToDataURL(file);
    const imageId = `img-${nextImageId++}`;

    state.images.set(imageId, {
      id: imageId,
      file,
      name: file.name,
      width: dims.width,
      height: dims.height,
      dataUrl,
      groupId: null,
      status: 'pending',
      url: null,
      filename: null,
      errorMsg: null,
    });

    if (dims.width < CONFIG.MIN_DIMENSION || dims.height < CONFIG.MIN_DIMENSION) {
      warnings.push(
        `${file.name}: resolución ${dims.width}×${dims.height} (recomendado mínimo 800×800).`
      );
    }

    added++;
  }

  renderUnassigned();
  renderGroups();
  updateContinueButton();
  showWarnings([...errors, ...warnings], errors.length > 0);

  if (added > 0) {
    toast(`${added} imagen${added !== 1 ? 'es' : ''} añadida${added !== 1 ? 's' : ''}.`, 'success', 2000);
  }
}

function showWarnings(messages, hasErrors) {
  const box = $('#warnings');
  if (messages.length === 0) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  const title = hasErrors
    ? 'Se encontraron problemas con algunos archivos:'
    : 'Avisos (las imágenes igual se subirán):';
  box.innerHTML = `
    <strong>${title}</strong>
    <ul>${messages.map((m) => `<li>${escapeHTML(m)}</li>`).join('')}</ul>
  `;
}

// ===== Group management =====
function addGroup(name = '') {
  const groupId = `g-${nextGroupId++}`;
  const groupName = name || `Producto ${state.groupOrder.length + 1}`;
  state.groups.set(groupId, { id: groupId, name: groupName });
  state.groupOrder.push(groupId);
  renderGroups();
  updateContinueButton();
  return groupId;
}

function removeGroup(groupId) {
  // Move images back to unassigned
  for (const img of state.images.values()) {
    if (img.groupId === groupId) {
      img.groupId = null;
    }
  }
  state.groups.delete(groupId);
  state.groupOrder = state.groupOrder.filter((id) => id !== groupId);
  renderUnassigned();
  renderGroups();
  updateContinueButton();
}

function renameGroup(groupId, newName) {
  const g = state.groups.get(groupId);
  if (g) {
    g.name = newName.trim() || g.name;
  }
  updateContinueButton();
}

function removeImage(imageId) {
  state.images.delete(imageId);
  renderUnassigned();
  renderGroups();
  updateContinueButton();
}

function assignImageToGroup(imageId, groupId) {
  const img = state.images.get(imageId);
  if (!img) return;
  img.groupId = groupId;
  renderUnassigned();
  renderGroups();
  updateContinueButton();
}

function imagesInGroup(groupId) {
  return Array.from(state.images.values()).filter((i) => i.groupId === groupId);
}

function unassignedImages() {
  return Array.from(state.images.values()).filter((i) => i.groupId === null);
}

// ===== Rendering =====
function renderUnassigned() {
  const grid = $('#unassigned-grid');
  const items = unassignedImages();
  $('#unassigned-count').textContent = String(items.length);
  $('#clear-unassigned').hidden = items.length === 0;

  if (items.length === 0) {
    grid.classList.add('empty');
    grid.innerHTML = '<p class="muted center">Aún no hay imágenes sin asignar.</p>';
    return;
  }

  grid.classList.remove('empty');
  grid.innerHTML = items.map(thumbHTML).join('');
  attachThumbHandlers(grid);
}

function renderGroups() {
  const list = $('#groups-list');
  if (state.groupOrder.length === 0) {
    list.innerHTML =
      '<p class="muted center" id="no-groups-msg">Crea un grupo para empezar a organizar tus imágenes por producto.</p>';
    return;
  }

  list.innerHTML = state.groupOrder
    .map((groupId) => {
      const g = state.groups.get(groupId);
      const imgs = imagesInGroup(groupId);
      const count = imgs.length;
      let cls = '';
      let meta = '';

      if (count === 0) {
        meta = 'Vacío — añade entre 3 y 6 imágenes';
      } else if (count >= CONFIG.MIN_PER_GROUP && count <= CONFIG.MAX_PER_GROUP) {
        cls = 'valid';
        meta = `✓ ${count} imágenes`;
      } else {
        cls = 'warn';
        meta =
          count < CONFIG.MIN_PER_GROUP
            ? `⚠ ${count} imágenes (mínimo ${CONFIG.MIN_PER_GROUP})`
            : `⚠ ${count} imágenes (máximo ${CONFIG.MAX_PER_GROUP})`;
      }

      return `
        <div class="group ${cls}" data-group-id="${g.id}">
          <div class="group-header">
            <input
              class="group-name-input"
              type="text"
              value="${escapeHTML(g.name)}"
              placeholder="Nombre del producto"
              data-group-id="${g.id}"
            />
            <span class="group-meta">${meta}</span>
            <div class="group-actions">
              <button class="btn btn-danger btn-sm" data-action="remove-group" data-group-id="${g.id}">Eliminar</button>
            </div>
          </div>
          <div class="image-grid ${count === 0 ? 'empty' : ''}" data-group-id="${g.id}">
            ${count === 0 ? '<p class="muted center">Arrastra imágenes aquí.</p>' : imgs.map(thumbHTML).join('')}
          </div>
        </div>
      `;
    })
    .join('');

  // Attach handlers
  $$('.group-name-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      renameGroup(e.target.dataset.groupId, e.target.value);
      renderGroups();
    });
    input.addEventListener('blur', (e) => {
      renameGroup(e.target.dataset.groupId, e.target.value);
      renderGroups();
    });
  });

  $$('[data-action="remove-group"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const groupId = e.target.dataset.groupId;
      const imgs = imagesInGroup(groupId);
      if (imgs.length > 0) {
        if (!confirm(`Este grupo tiene ${imgs.length} imágenes. ¿Eliminarlo? Las imágenes volverán a "sin asignar".`)) {
          return;
        }
      }
      removeGroup(groupId);
    });
  });

  $$('.group .image-grid').forEach((grid) => {
    attachDropTarget(grid, grid.dataset.groupId);
    attachThumbHandlers(grid);
  });
}

function thumbHTML(img) {
  const warnClass = img.width < CONFIG.MIN_DIMENSION || img.height < CONFIG.MIN_DIMENSION ? 'warn' : '';
  const statusClass = `status-${img.status}`;
  return `
    <div class="thumb ${warnClass} ${statusClass}" draggable="true" data-image-id="${img.id}">
      <img src="${img.dataUrl}" alt="${escapeHTML(img.name)}" />
      <div class="thumb-info">${escapeHTML(img.name)}</div>
      <button class="thumb-remove" data-action="remove-image" data-image-id="${img.id}" title="Eliminar">×</button>
      <div class="thumb-progress"></div>
    </div>
  `;
}

function attachThumbHandlers(root) {
  $$('.thumb', root).forEach((thumb) => {
    thumb.addEventListener('dragstart', (e) => {
      thumb.classList.add('dragging');
      e.dataTransfer.setData('text/plain', thumb.dataset.imageId);
      e.dataTransfer.effectAllowed = 'move';
    });
    thumb.addEventListener('dragend', () => {
      thumb.classList.remove('dragging');
    });
  });

  $$('[data-action="remove-image"]', root).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(e.target.dataset.imageId);
    });
  });
}

function attachDropTarget(el, groupIdOrNull) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drop-target');
  });
  el.addEventListener('dragleave', () => {
    el.classList.remove('drop-target');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drop-target');
    const imageId = e.dataTransfer.getData('text/plain');
    if (!imageId) return;
    assignImageToGroup(imageId, groupIdOrNull);
  });
}

// ===== Continue button state =====
function updateContinueButton() {
  const btn = $('#btn-to-upload');
  const total = state.images.size;
  // Permite continuar mientras haya al menos una imagen (en grupo o sin asignar)
  btn.disabled = total === 0;
}

// ===== Dropzone for initial file load =====
function setupDropzone() {
  const dz = $('#dropzone');
  const input = $('#file-input');

  dz.addEventListener('click', (e) => {
    if (e.target.closest('label')) return;
    input.click();
  });

  input.addEventListener('change', (e) => {
    if (e.target.files?.length) {
      ingestFiles(e.target.files);
      input.value = '';
    }
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      // only highlight if files are being dragged (not a thumb)
      if (e.dataTransfer.types?.includes('Files')) {
        dz.classList.add('drag-over');
      }
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('drag-over');
    })
  );
  dz.addEventListener('drop', (e) => {
    if (e.dataTransfer.files?.length) {
      ingestFiles(e.dataTransfer.files);
    }
  });

  // Drop zone for unassigned grid
  const unassignedGrid = $('#unassigned-grid');
  attachDropTarget(unassignedGrid, null);
}

// ===== Navigation between views =====
function showView(viewName) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${viewName}`).classList.add('active');

  const stepMap = { organize: 1, upload: 2, download: 3 };
  const stepNum = stepMap[viewName];
  $$('.step').forEach((s) => {
    const n = Number(s.dataset.step);
    s.classList.toggle('active', n === stepNum);
    s.classList.toggle('done', n < stepNum);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Upload phase =====
async function startUploadPhase() {
  const groupsToUpload = state.groupOrder
    .map((id) => ({ id, name: state.groups.get(id).name, images: imagesInGroup(id) }))
    .filter((g) => g.images.length > 0);

  const unassigned = unassignedImages();

  // Aviso si algún grupo está fuera del rango 3–6 (no bloquea)
  const invalid = groupsToUpload.filter(
    (g) => g.images.length < CONFIG.MIN_PER_GROUP || g.images.length > CONFIG.MAX_PER_GROUP
  );
  if (invalid.length > 0) {
    const names = invalid.map((g) => g.name).join(', ');
    const ok = confirm(
      `Los siguientes grupos no cumplen el rango 3–6 imágenes: ${names}\n\n¿Continuar con la subida igualmente?`
    );
    if (!ok) return;
  }

  showView('upload');
  renderUploadUI(groupsToUpload, unassigned);

  // Cola unificada: imágenes de grupos + imágenes sueltas
  const groupItems = groupsToUpload.flatMap((g) =>
    g.images.map((img, idx) => ({
      ...img,
      productName: g.name,
      indexInProduct: idx + 1,
    }))
  );
  const unassignedItems = unassigned.map((img) => ({
    ...img,
    productName: img.name.replace(/\.[^.]+$/, ''),
    indexInProduct: 1,
  }));
  const allImages = [...groupItems, ...unassignedItems];

  updateGlobalProgress(0, allImages.length);

  let done = 0;
  const CONCURRENCY = 3;
  const queue = [...allImages];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      await uploadOne(item);
      done++;
      updateGlobalProgress(done, allImages.length);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  finishUploadPhase();
}

function renderUploadUI(groups, unassigned = []) {
  const root = $('#upload-groups');
  const groupsHTML = groups
    .map((g) => `
      <div class="card">
        <h3>${escapeHTML(g.name)} <span class="muted small">— ${g.images.length} imágenes</span></h3>
        <div class="image-grid">
          ${g.images.map(thumbHTML).join('')}
        </div>
      </div>
    `)
    .join('');

  const unassignedHTML =
    unassigned.length > 0
      ? `
        <div class="card">
          <h3>Sin asignar <span class="muted small">— ${unassigned.length} imágenes individuales</span></h3>
          <p class="muted small">Cada una aparecerá como fila propia en el Excel, identificada por el nombre del archivo.</p>
          <div class="image-grid">
            ${unassigned.map(thumbHTML).join('')}
          </div>
        </div>
      `
      : '';

  root.innerHTML = groupsHTML + unassignedHTML;
}

function setImageStatus(imageId, status, extra = {}) {
  const img = state.images.get(imageId);
  if (!img) return;
  img.status = status;
  Object.assign(img, extra);

  // Update DOM
  $$(`#view-upload .thumb[data-image-id="${imageId}"]`).forEach((thumb) => {
    thumb.classList.remove('status-pending', 'status-uploading', 'status-done', 'status-error');
    thumb.classList.add(`status-${status}`);

    let overlay = thumb.querySelector('.status-overlay');
    if (status === 'done') {
      if (overlay) overlay.remove();
    } else {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'status-overlay';
        thumb.appendChild(overlay);
      }
      if (status === 'pending') overlay.textContent = 'En cola';
      if (status === 'uploading') overlay.textContent = 'Subiendo…';
      if (status === 'error') {
        overlay.innerHTML = `
          <div>Error</div>
          <button class="retry-btn" data-action="retry-image" data-image-id="${imageId}">Reintentar</button>
        `;
        overlay.querySelector('.retry-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          retryImage(imageId);
        });
      }
    }
  });
}

async function uploadOne(item) {
  const imageId = item.id;
  setImageStatus(imageId, 'uploading');

  try {
    const fd = new FormData();
    fd.append('image', item.file, item.name);
    fd.append('sessionId', state.sessionId);
    fd.append('productName', item.productName);
    fd.append('index', String(item.indexInProduct));

    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Error desconocido');
    }

    setImageStatus(imageId, 'done', { url: data.url, filename: data.filename, errorMsg: null });
  } catch (err) {
    setImageStatus(imageId, 'error', { errorMsg: err.message });
  }
}

async function retryImage(imageId) {
  const img = state.images.get(imageId);
  if (!img) return;

  let productName;
  let indexInProduct;
  if (img.groupId === null) {
    productName = img.name.replace(/\.[^.]+$/, '');
    indexInProduct = 1;
  } else {
    const group = state.groups.get(img.groupId);
    if (!group) return;
    const imgsInGroup = imagesInGroup(img.groupId);
    indexInProduct = imgsInGroup.findIndex((i) => i.id === imageId) + 1;
    productName = group.name;
  }

  await uploadOne({ ...img, productName, indexInProduct });
  updateGlobalCountsAfterRetry();
}

function updateGlobalCountsAfterRetry() {
  const all = Array.from(state.images.values());
  const done = all.filter((i) => i.status === 'done').length;
  updateGlobalProgress(done, all.length);
  $('#btn-to-download').disabled = !(done === all.length && all.length > 0);
}

function updateGlobalProgress(done, total) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  $('#global-progress-fill').style.width = `${pct}%`;
  $('#global-progress-text').textContent = `${done} / ${total} imágenes subidas`;
}

function finishUploadPhase() {
  const all = Array.from(state.images.values());
  const errors = all.filter((i) => i.status === 'error').length;
  const done = all.filter((i) => i.status === 'done').length;

  $('#btn-to-download').disabled = done !== all.length || done === 0;

  if (errors > 0) {
    toast(
      `${errors} imagen${errors !== 1 ? 'es' : ''} fallaron. Reinténtalas antes de descargar el Excel.`,
      'error',
      6000
    );
  } else {
    toast('Todas las imágenes se subieron correctamente.', 'success', 4000);
  }
}

// ===== Download phase =====
async function downloadExcel() {
  const groups = state.groupOrder
    .map((id) => ({
      name: state.groups.get(id).name,
      images: imagesInGroup(id)
        .filter((i) => i.status === 'done')
        .map((i) => ({ filename: i.filename, url: i.url })),
    }))
    .filter((g) => g.images.length > 0);

  const unassigned = unassignedImages()
    .filter((i) => i.status === 'done')
    .map((i) => ({ filename: i.filename, url: i.url }));

  if (groups.length === 0 && unassigned.length === 0) {
    toast('No hay imágenes subidas para exportar.', 'error');
    return;
  }

  try {
    const btn = $('#btn-download-excel');
    btn.disabled = true;
    btn.textContent = 'Generando Excel…';

    const res = await fetch('/api/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups, unassigned }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al generar el Excel');
    }

    const blob = await res.blob();
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alibaba-imagenes-${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);

    btn.disabled = false;
    btn.textContent = '⬇ Descargar Excel';
    toast('Excel descargado correctamente.', 'success');
  } catch (err) {
    toast(err.message, 'error', 5000);
    const btn = $('#btn-download-excel');
    btn.disabled = false;
    btn.textContent = '⬇ Descargar Excel';
  }
}

function showDownloadSummary() {
  const groups = state.groupOrder
    .map((id) => imagesInGroup(id).filter((i) => i.status === 'done'))
    .filter((g) => g.length > 0);
  const unassigned = unassignedImages().filter((i) => i.status === 'done');
  const totalImgs = groups.reduce((sum, g) => sum + g.length, 0) + unassigned.length;

  const parts = [];
  if (groups.length > 0) {
    parts.push(`${groups.length} producto${groups.length !== 1 ? 's' : ''}`);
  }
  if (unassigned.length > 0) {
    parts.push(
      `${unassigned.length} imagen${unassigned.length !== 1 ? 'es' : ''} sin asignar`
    );
  }

  $('#summary-text').textContent = `${parts.join(' + ')} · ${totalImgs} imagen${
    totalImgs !== 1 ? 'es' : ''
  } subida${totalImgs !== 1 ? 's' : ''} correctamente.`;
}

// ===== Restart =====
function restart() {
  if (!confirm('¿Empezar una nueva sesión? Se perderá el trabajo actual.')) return;
  location.reload();
}

// ===== Bootstrap =====
document.addEventListener('DOMContentLoaded', () => {
  initSession();
  setupDropzone();

  $('#add-group').addEventListener('click', () => addGroup());

  $('#clear-unassigned').addEventListener('click', () => {
    if (!confirm('¿Eliminar todas las imágenes sin asignar?')) return;
    for (const img of Array.from(state.images.values())) {
      if (img.groupId === null) state.images.delete(img.id);
    }
    renderUnassigned();
    updateContinueButton();
  });

  $('#btn-to-upload').addEventListener('click', startUploadPhase);

  $('#btn-to-download').addEventListener('click', () => {
    showView('download');
    showDownloadSummary();
  });

  $('#btn-download-excel').addEventListener('click', downloadExcel);
  $('#btn-restart').addEventListener('click', restart);
});
