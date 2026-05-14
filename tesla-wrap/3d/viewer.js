// Shared Three.js Tesla wrap viewer. Used by the standalone /3d/ page and
// by the homepage hero stage.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SESSION_WRAP_KEY = 'tesla_wrap_dataurl';
const BODY_MATERIAL_HINTS = ['body', 'paint', 'wrap'];

function setStatus(el, text, hidden = false) {
  if (!el) return;
  el.textContent = text;
  el.hidden = hidden;
}

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value && value.isTexture) value.dispose();
  }
  material.dispose();
}

async function loadWrapTexture(renderer, wrapUrl) {
  const wrapSrc = wrapUrl || sessionStorage.getItem(SESSION_WRAP_KEY);
  if (!wrapSrc) return null;

  const wrapImage = new Image();
  wrapImage.src = wrapSrc;
  await new Promise((resolve, reject) => {
    wrapImage.onload = resolve;
    wrapImage.onerror = reject;
  });

  const texture = new THREE.CanvasTexture(wrapImage);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.flipY = false;
  return texture;
}

function applyWrapTexture(root, wrapTexture) {
  if (!wrapTexture) return 0;
  let replaced = 0;
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach(material => {
      if (!material || !material.name) return;
      const lower = material.name.toLowerCase();
      if (!BODY_MATERIAL_HINTS.some(hint => lower.includes(hint))) return;
      material.map = wrapTexture;
      material.needsUpdate = true;
      replaced++;
    });
  });
  return replaced;
}

function frameObject(root, camera, controls) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return;

  root.position.sub(center);
  const distance = maxDim * 1.55;
  camera.position.set(distance * 0.72, maxDim * 0.42, distance);
  camera.near = Math.max(0.01, maxDim / 100);
  camera.far = maxDim * 40;
  camera.updateProjectionMatrix();
  controls.target.set(0, Math.max(size.y * 0.08, 0), 0);
  controls.update();
}

export async function initTeslaWrapViewer(options) {
  const {
    canvas,
    status,
    modelName,
    back,
    rotateButton,
    lighting,
    credit,
    modelId,
    wrapUrl = null,
    requireWrap = true,
    autoRotate = false,
    transparent = false,
    disableAutoOnInteract = false,
    onAutoRotateChange = null
  } = options;

  if (!canvas) throw new Error('Missing viewer canvas.');
  if (!window.TeslaModels) throw new Error('Model helper failed to load.');

  const resolvedModelId = modelId || await TeslaModels.resolveModel();
  const manifest = await TeslaModels.loadManifest();
  const entry = TeslaModels.findModel(manifest, resolvedModelId);

  if (modelName) modelName.textContent = entry ? `· ${TeslaModels.modelDisplayName(entry)}` : '';
  if (back) {
    const root = new URL(TeslaModels.appRootUrl());
    root.searchParams.set('model', resolvedModelId);
    back.href = root.toString();
  }

  if (!entry || !entry.hasGlb) {
    throw new Error(`3D preview not yet available for this model. Drop a UV-matched GLB at web/models/${resolvedModelId}/model.glb.`);
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (transparent) renderer.setClearColor(0x000000, 0);

  let wrapTexture = null;
  try {
    wrapTexture = await loadWrapTexture(renderer, wrapUrl);
  } catch (err) {
    renderer.dispose();
    throw new Error(`Could not load wrap texture: ${err.message}`);
  }
  if (!wrapTexture && requireWrap) {
    renderer.dispose();
    throw new Error('No wrap to preview. Save a wrap from Paint Box first, then click "View in 3D".');
  }

  const scene = new THREE.Scene();
  if (!transparent) {
    scene.background = new THREE.Color(0xeef2f7);
    scene.fog = new THREE.Fog(0xeef2f7, 18, 80);
  }

  const camera = new THREE.PerspectiveCamera(35, (canvas.clientWidth || 1) / (canvas.clientHeight || 1), 0.1, 200);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(6, 10, 4);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 1);
  fill.position.set(-5, 3, -5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1);
  rim.position.set(-3, 4, 6);
  scene.add(rim);

  const STUDIO_DEFAULTS = {
    opaque:      { exposure: 1.45, hemi: 1.25, dir: 1.85, fill: 0.95, rim: 0.75 },
    transparent: { exposure: 1.28, hemi: 1.45, dir: 2.05, fill: 1.25, rim: 0.95 }
  };
  const lightingDefaults = transparent ? STUDIO_DEFAULTS.transparent : STUDIO_DEFAULTS.opaque;
  function applyLighting(preset) {
    renderer.toneMappingExposure = preset.exposure;
    hemi.intensity = preset.hemi;
    dir.intensity = preset.dir;
    fill.intensity = preset.fill;
    rim.intensity = preset.rim;
  }
  applyLighting(lightingDefaults);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.58;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.7;

  let userTookControl = false;
  const disableAuto = () => {
    if (!disableAutoOnInteract || userTookControl || !controls.autoRotate) return;
    userTookControl = true;
    controls.autoRotate = false;
    if (rotateButton) rotateButton.setAttribute('aria-pressed', 'false');
    onAutoRotateChange && onAutoRotateChange(false);
  };
  controls.addEventListener('start', disableAuto);

  if (rotateButton) {
    rotateButton.setAttribute('aria-pressed', String(controls.autoRotate));
    rotateButton.addEventListener('click', () => {
      controls.autoRotate = !controls.autoRotate;
      userTookControl = !controls.autoRotate;
      rotateButton.setAttribute('aria-pressed', String(controls.autoRotate));
      onAutoRotateChange && onAutoRotateChange(controls.autoRotate);
    });
  }

  let onChipClick = null;
  let onDocumentClick = null;
  const sliderHandlers = [];
  let onResetClick = null;
  if (lighting && lighting.chip && lighting.panel && lighting.sliders) {
    const { chip, panel, sliders, values, reset } = lighting;
    const closePanel = () => {
      panel.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
    };
    const openPanel = () => {
      panel.hidden = false;
      chip.setAttribute('aria-expanded', 'true');
    };
    onChipClick = (evt) => {
      evt.stopPropagation();
      panel.hidden ? openPanel() : closePanel();
    };
    onDocumentClick = (evt) => {
      if (panel.hidden) return;
      if (panel.contains(evt.target) || chip.contains(evt.target)) return;
      closePanel();
    };
    chip.addEventListener('click', onChipClick);
    document.addEventListener('click', onDocumentClick);

    // UI key -> scene knob mapping. Sliders use "key" for the main directional light (named `dir` in the scene).
    const apply = (uiKey, num) => {
      if (uiKey === 'exposure') renderer.toneMappingExposure = num;
      else if (uiKey === 'hemi') hemi.intensity = num;
      else if (uiKey === 'key')  dir.intensity  = num;
      else if (uiKey === 'fill') fill.intensity = num;
      else if (uiKey === 'rim')  rim.intensity  = num;
      if (values && values[uiKey]) values[uiKey].textContent = num.toFixed(2);
    };
    const sliderValueFor = (uiKey, preset) => uiKey === 'key' ? preset.dir : preset[uiKey];
    const initialise = (preset) => {
      for (const uiKey of ['exposure', 'hemi', 'key', 'fill', 'rim']) {
        const num = sliderValueFor(uiKey, preset);
        if (sliders[uiKey]) sliders[uiKey].value = String(num);
        apply(uiKey, num);
      }
    };
    initialise(lightingDefaults);
    for (const uiKey of ['exposure', 'hemi', 'key', 'fill', 'rim']) {
      const slider = sliders[uiKey];
      if (!slider) continue;
      const handler = () => {
        const num = parseFloat(slider.value);
        if (Number.isFinite(num)) apply(uiKey, num);
      };
      slider.addEventListener('input', handler);
      sliderHandlers.push([slider, handler]);
    }
    if (reset) {
      onResetClick = () => initialise(lightingDefaults);
      reset.addEventListener('click', onResetClick);
    }
  }

  setStatus(status, 'Loading 3D model...');
  const glbUrl = TeslaModels.modelAssetBase(resolvedModelId) + (entry.glbUrl || 'model.glb');
  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(glbUrl);
  } catch (err) {
    renderer.dispose();
    throw new Error(`Could not load ${glbUrl}: ${err.message}`);
  }

  scene.add(gltf.scene);
  frameObject(gltf.scene, camera, controls);

  const replaced = applyWrapTexture(gltf.scene, wrapTexture);
  if (wrapTexture && replaced === 0) {
    console.warn('No body materials matched. Looked for hints:', BODY_MATERIAL_HINTS, 'in', glbUrl);
  }

  if (credit && entry.credit) {
    const a = document.createElement('a');
    a.href = entry.credit.href || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = entry.credit.text;
    credit.replaceChildren(a);
    credit.hidden = false;
  }

  setStatus(status, '', true);
  onAutoRotateChange && onAutoRotateChange(controls.autoRotate);

  const size = new THREE.Vector2();
  function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.getSize(size);
    if (size.x === width && size.y === height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let raf = 0;
  let disposed = false;
  function tick() {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    entry,
    controls,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.removeEventListener('start', disableAuto);
      if (lighting && lighting.chip && onChipClick) lighting.chip.removeEventListener('click', onChipClick);
      if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
      for (const [slider, handler] of sliderHandlers) slider.removeEventListener('input', handler);
      if (lighting && lighting.reset && onResetClick) lighting.reset.removeEventListener('click', onResetClick);
      controls.dispose();
      scene.traverse(obj => {
        if (!obj.isMesh) return;
        if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
        else disposeMaterial(obj.material);
        if (obj.geometry) obj.geometry.dispose();
      });
      if (wrapTexture) wrapTexture.dispose();
      renderer.dispose();
    }
  };
}
