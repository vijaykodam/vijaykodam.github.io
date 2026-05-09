(() => {
  'use strict';

  const SIZE = 1024;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_HISTORY = 30;
  const PALETTE = [
    '#000000', '#ffffff', '#9aa0a6', '#5b6166',
    '#ef4444', '#f97316', '#facc15', '#84cc16',
    '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#a16207', '#92400e',
    '#1e3a8a', '#064e3b', '#9d174d', '#4c1d95'
  ];

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const guide = document.getElementById('guide');
  const sizeInput = document.getElementById('size');
  const swatchesEl = document.getElementById('swatches');
  const stickersEl = document.getElementById('stickers');
  const colorPicker = document.getElementById('color-picker');
  const btnGuide = document.getElementById('btn-guide');
  const btnHighlight = document.getElementById('btn-highlight');
  const btn3d = document.getElementById('btn-3d');
  const highlight = document.getElementById('highlight');
  const modelNameEl = document.getElementById('model-name');
  const btnClear = document.getElementById('btn-clear');
  const btnSave = document.getElementById('btn-save');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const saveDialog = document.getElementById('save-dialog');
  const wrapName = document.getElementById('wrap-name');
  const saveDownload = document.getElementById('save-download');
  const saveClose = document.getElementById('save-close');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const state = {
    tool: 'brush',
    color: '#3b82f6',
    size: 24,
    sticker: null,
    drawing: false,
    last: null,
    start: null,
    snapshotBeforeShape: null,
    rainbowHue: 0
  };

  const history = [];
  const future = [];

  // Active Tesla model. Resolved before any guide/mask asset is touched.
  // Falls back to the page-local template.png if shared/models.js or the
  // manifest is unavailable (e.g. running this page outside web/).
  let activeModelId = (window.TeslaModels && window.TeslaModels.DEFAULT_MODEL) || 'modely';
  let activeModelEntry = null;

  async function initModel() {
    if (!window.TeslaModels) return;
    try {
      activeModelId = await window.TeslaModels.resolveModel();
      const manifest = await window.TeslaModels.loadManifest();
      activeModelEntry = window.TeslaModels.findModel(manifest, activeModelId);
      const base = window.TeslaModels.modelAssetBase(activeModelId);
      const templateUrl = `${base}template.png`;
      guide.src = templateUrl;
      // Override the hardcoded mask in styles.css with the model-specific
      // template so Highlight works correctly when the user changes model.
      highlight.style.webkitMaskImage = `url("${templateUrl}")`;
      highlight.style.maskImage = `url("${templateUrl}")`;
      if (modelNameEl) {
        modelNameEl.textContent = window.TeslaModels.modelDisplayName(activeModelEntry);
      }
      if (btn3d && activeModelEntry && activeModelEntry.hasGlb) {
        btn3d.hidden = false;
      }
    } catch (err) {
      // Stay on the local fallback assets; surface the failure quietly.
      console.warn('Model init failed, using local template.png', err);
    }
  }
  initModel();

  if (btn3d) {
    btn3d.addEventListener('click', async () => {
      const blob = await exportBlob();
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          sessionStorage.setItem('tesla_wrap_dataurl', reader.result);
        } catch (e) {
          // Quota exceeded — at 1024x1024 PNG ~< 1 MB this should be fine, but warn anyway.
          console.warn('sessionStorage write failed', e);
        }
        const url = window.TeslaModels
          ? window.TeslaModels.buildHref('../3d/', activeModelId)
          : `../3d/?model=${encodeURIComponent(activeModelId)}`;
        window.location.href = url;
      };
      reader.readAsDataURL(blob);
    });
  }

  function pushHistory() {
    if (history.length >= MAX_HISTORY) history.shift();
    history.push(ctx.getImageData(0, 0, SIZE, SIZE));
    future.length = 0;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    btnUndo.disabled = history.length === 0;
    btnRedo.disabled = future.length === 0;
    btnUndo.style.opacity = btnUndo.disabled ? '0.3' : '1';
    btnRedo.style.opacity = btnRedo.disabled ? '0.3' : '1';
  }
  updateHistoryButtons();

  function undo() {
    if (!history.length) return;
    future.push(ctx.getImageData(0, 0, SIZE, SIZE));
    ctx.putImageData(history.pop(), 0, 0);
    updateHistoryButtons();
  }
  function redo() {
    if (!future.length) return;
    history.push(ctx.getImageData(0, 0, SIZE, SIZE));
    ctx.putImageData(future.pop(), 0, 0);
    updateHistoryButtons();
  }

  // Build palette + stickers ------------------------------------------
  PALETTE.forEach((hex, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex;
    b.dataset.color = hex;
    b.setAttribute('aria-pressed', i === 11 ? 'true' : 'false');
    b.addEventListener('click', () => selectColor(hex, b));
    swatchesEl.appendChild(b);
  });

  function selectColor(hex, btn) {
    state.color = hex;
    colorPicker.value = hex;
    document.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', s === btn ? 'true' : 'false'));
  }
  colorPicker.addEventListener('input', e => {
    state.color = e.target.value;
    document.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', 'false'));
  });

  // SVG sticker buttons built via DOM, not innerHTML.
  (window.STICKERS || []).forEach(sticker => {
    const b = document.createElement('button');
    b.className = 'sticker';
    b.dataset.id = sticker.id;
    b.title = sticker.label;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', sticker.path);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    b.appendChild(svg);
    b.addEventListener('click', () => selectSticker(sticker, b));
    stickersEl.appendChild(b);
  });

  function selectSticker(sticker, btn) {
    state.tool = 'sticker';
    state.sticker = sticker;
    document.querySelectorAll('.tool[data-tool]').forEach(t => t.setAttribute('aria-pressed', 'false'));
    document.querySelectorAll('.sticker').forEach(s => s.setAttribute('aria-pressed', s === btn ? 'true' : 'false'));
  }

  // Tool selection ----------------------------------------------------
  document.querySelectorAll('.tool[data-tool]').forEach(t => {
    t.addEventListener('click', () => {
      state.tool = t.dataset.tool;
      state.sticker = null;
      document.querySelectorAll('.tool[data-tool]').forEach(other => other.setAttribute('aria-pressed', other === t ? 'true' : 'false'));
      document.querySelectorAll('.sticker').forEach(s => s.setAttribute('aria-pressed', 'false'));
    });
  });

  sizeInput.addEventListener('input', e => { state.size = parseInt(e.target.value, 10); });
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnGuide.addEventListener('click', () => {
    const showing = !guide.hidden;
    guide.hidden = showing;
    btnGuide.setAttribute('aria-pressed', String(!showing));
  });
  btnHighlight.addEventListener('click', () => {
    const showing = !highlight.hidden;
    highlight.hidden = showing;
    btnHighlight.setAttribute('aria-pressed', String(!showing));
  });
  btnClear.addEventListener('click', () => {
    if (!confirm('Clear the whole canvas?')) return;
    pushHistory();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
  });

  // Drawing ------------------------------------------------------------
  function pointerPos(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = SIZE / rect.width;
    const sy = SIZE / rect.height;
    return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
  }

  canvas.addEventListener('pointerdown', ev => {
    canvas.setPointerCapture(ev.pointerId);
    const p = pointerPos(ev);
    state.drawing = true;
    state.last = p;
    state.start = p;
    pushHistory();

    if (state.tool === 'fill') {
      floodFill(Math.round(p.x), Math.round(p.y), state.color);
      state.drawing = false;
      return;
    }
    if (state.tool === 'sticker' && state.sticker) {
      stampSticker(p);
      state.drawing = false;
      return;
    }
    if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'circle') {
      state.snapshotBeforeShape = ctx.getImageData(0, 0, SIZE, SIZE);
      return;
    }
    drawSegment(p, p);
  });

  canvas.addEventListener('pointermove', ev => {
    if (!state.drawing) return;
    const p = pointerPos(ev);
    if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'circle') {
      ctx.putImageData(state.snapshotBeforeShape, 0, 0);
      drawShapePreview(state.start, p);
      return;
    }
    drawSegment(state.last, p);
    state.last = p;
  });

  function endStroke(ev) {
    if (!state.drawing) return;
    state.drawing = false;
    state.snapshotBeforeShape = null;
    if (ev && ev.pointerId !== undefined && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', ev => { if (ev.buttons === 0) endStroke(ev); });

  function drawSegment(a, b) {
    ctx.lineWidth = state.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (state.tool === 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff';
    } else if (state.tool === 'rainbow') {
      state.rainbowHue = (state.rainbowHue + 6) % 360;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `hsl(${state.rainbowHue}, 90%, 55%)`;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = state.color;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawShapePreview(a, b) {
    ctx.lineWidth = state.size;
    ctx.strokeStyle = state.color;
    ctx.fillStyle = state.color;
    ctx.globalCompositeOperation = 'source-over';
    if (state.tool === 'line') {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (state.tool === 'rect') {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      ctx.strokeRect(x, y, w, h);
    } else if (state.tool === 'circle') {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function stampSticker(p) {
    if (!state.sticker) return;
    const path = new Path2D(state.sticker.path);
    const scale = state.size / 24;
    const targetSize = 100 * scale;
    ctx.save();
    ctx.translate(p.x - targetSize / 2, p.y - targetSize / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = state.color;
    ctx.fill(path);
    ctx.restore();
  }

  // Iterative scanline flood fill -------------------------------------
  function floodFill(sx, sy, hexColor) {
    if (sx < 0 || sy < 0 || sx >= SIZE || sy >= SIZE) return;
    const img = ctx.getImageData(0, 0, SIZE, SIZE);
    const data = img.data;
    const idx = (x, y) => (y * SIZE + x) * 4;
    const r0 = data[idx(sx, sy)], g0 = data[idx(sx, sy) + 1], b0 = data[idx(sx, sy) + 2], a0 = data[idx(sx, sy) + 3];
    const target = parseHex(hexColor);
    if (r0 === target.r && g0 === target.g && b0 === target.b && a0 === 255) return;

    const matches = (x, y) => {
      const i = idx(x, y);
      return data[i] === r0 && data[i + 1] === g0 && data[i + 2] === b0 && data[i + 3] === a0;
    };
    const set = (x, y) => {
      const i = idx(x, y);
      data[i] = target.r; data[i + 1] = target.g; data[i + 2] = target.b; data[i + 3] = 255;
    };

    const stack = [[sx, sy]];
    while (stack.length) {
      let [x, y] = stack.pop();
      while (x >= 0 && matches(x, y)) x--;
      x++;
      let spanAbove = false, spanBelow = false;
      while (x < SIZE && matches(x, y)) {
        set(x, y);
        if (y > 0) {
          const above = matches(x, y - 1);
          if (!spanAbove && above) { stack.push([x, y - 1]); spanAbove = true; }
          else if (spanAbove && !above) spanAbove = false;
        }
        if (y < SIZE - 1) {
          const below = matches(x, y + 1);
          if (!spanBelow && below) { stack.push([x, y + 1]); spanBelow = true; }
          else if (spanBelow && !below) spanBelow = false;
        }
        x++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function parseHex(hex) {
    let s = hex.replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  }

  // Save flow ---------------------------------------------------------
  btnSave.addEventListener('click', () => {
    if (!wrapName.value) {
      const stamp = new Date().toISOString().slice(0, 10);
      const tag = activeModelId ? `_${activeModelId}` : '';
      wrapName.value = `MyWrap${tag}_${stamp}`;
    }
    if (typeof saveDialog.showModal === 'function') saveDialog.showModal();
    else saveDialog.setAttribute('open', '');
  });
  saveClose.addEventListener('click', () => saveDialog.close());

  function safeName() {
    const raw = (wrapName.value || 'MyWrap').trim();
    return raw.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'MyWrap';
  }

  async function exportBlob() {
    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
  }

  saveDownload.addEventListener('click', async () => {
    const blob = await exportBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  // Resize for crisp drawing on HiDPI displays without changing internal SIZE.
  function fit() {
    const wrap = canvas.parentElement;
    const pad = 24;
    const maxW = wrap.clientWidth - pad;
    const maxH = wrap.clientHeight - 80;
    const dim = Math.max(64, Math.min(maxW, maxH));
    canvas.style.width = canvas.style.height = `${dim}px`;
    if (guide && guide.style) guide.style.width = guide.style.height = `${dim}px`;
    if (highlight && highlight.style) highlight.style.width = highlight.style.height = `${dim}px`;
  }
  new ResizeObserver(fit).observe(document.body);
  window.addEventListener('load', fit);

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });
})();
