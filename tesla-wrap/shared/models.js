// Shared client helpers for the active Tesla model selection.
// Loaded by every page that cares about which model the user is designing for.
// No imports — works in classic <script> tags too.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'tesla_wrap_model';
  const DEFAULT_MODEL = 'modely';
  const APP_ROOT_DIRS = ['web', 'tesla-wrap'];
  const PAGE_DIRS = ['kid', 'gallery', 'advanced', '3d'];
  let cachedManifest = null;

  async function loadManifest() {
    if (cachedManifest) return cachedManifest;
    const url = (global.WRAP_MODEL_MANIFEST_URL || '').trim() || resolveManifestUrl();
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    cachedManifest = await res.json();
    return cachedManifest;
  }

  function appRootUrl() {
    const parts = global.location.pathname.split('/');
    for (const rootDir of APP_ROOT_DIRS) {
      const idx = parts.lastIndexOf(rootDir);
      if (idx !== -1) {
        const base = parts.slice(0, idx + 1).join('/') + '/';
        return new URL(base, global.location.origin).toString();
      }
    }

    const cleanParts = parts.filter(Boolean);
    const leaf = cleanParts[cleanParts.length - 1] || '';
    const currentDir = leaf.endsWith('.html')
      ? cleanParts[cleanParts.length - 2]
      : leaf;

    if (PAGE_DIRS.includes(currentDir)) {
      return new URL('../', global.location.href).toString();
    }

    return new URL('./', global.location.href).toString();
  }

  function resolveManifestUrl() {
    return new URL('models/manifest.json', appRootUrl()).toString();
  }

  function modelAssetBase(modelId) {
    return new URL(`models/${modelId}/`, appRootUrl()).toString();
  }

  function readQueryModel() {
    const m = new URLSearchParams(global.location.search).get('model');
    return m && /^[a-z0-9-]+$/i.test(m) ? m : null;
  }

  function readStoredModel() {
    try { return global.localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }

  function storeModel(id) {
    try { global.localStorage.setItem(STORAGE_KEY, id); } catch (_) { /* ignore */ }
  }

  // Resolve effective model id with precedence: query > localStorage > manifest.default > 'modely'.
  async function resolveModel() {
    const fromQuery = readQueryModel();
    if (fromQuery) {
      storeModel(fromQuery);
      return fromQuery;
    }
    const fromStore = readStoredModel();
    if (fromStore) return fromStore;
    try {
      const m = await loadManifest();
      return (m && m.default) || DEFAULT_MODEL;
    } catch (_) {
      return DEFAULT_MODEL;
    }
  }

  function buildHref(targetPath, modelId) {
    const u = new URL(targetPath, global.location.href);
    u.searchParams.set('model', modelId);
    return u.toString();
  }

  // Convenience: find a model entry in the manifest.
  function findModel(manifest, id) {
    if (!manifest || !Array.isArray(manifest.models)) return null;
    return manifest.models.find(m => m.id === id) || null;
  }

  function modelDisplayName(entry) {
    if (!entry) return '';
    return entry.year ? `${entry.label} (${entry.year})` : entry.label;
  }

  global.TeslaModels = {
    STORAGE_KEY,
    DEFAULT_MODEL,
    loadManifest,
    resolveModel,
    storeModel,
    readQueryModel,
    readStoredModel,
    modelAssetBase,
    appRootUrl,
    buildHref,
    findModel,
    modelDisplayName
  };
})(window);
