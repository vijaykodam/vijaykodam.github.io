// 3D wrap preview. Loads the active model's GLB, applies the wrap PNG
// stashed in sessionStorage (key: tesla_wrap_dataurl) as the diffuse map of
// the body-paint material. Falls back to the model's vehicle_image.png as a
// 2D billboard if no GLB is shipped for the active model.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SESSION_WRAP_KEY = 'tesla_wrap_dataurl';
// Material names in the GLB that should receive the wrap texture. Add more
// as you UV-prep additional Tesla GLBs in Blender. Match by .name on
// THREE.Material — case-insensitive substring.
const BODY_MATERIAL_HINTS = ['body', 'paint', 'wrap'];

const status = document.getElementById('status');
const modelName = document.getElementById('model-name');
const btnRotate = document.getElementById('btn-rotate');
const back = document.getElementById('back');
const canvas = document.getElementById('three-canvas');
const credit = document.getElementById('credit');

function showStatus(text) {
  status.textContent = text;
  status.hidden = false;
}
function hideStatus() { status.hidden = true; }

async function main() {
  if (!window.TeslaModels) { showStatus('Model helper failed to load.'); return; }
  const modelId = await TeslaModels.resolveModel();
  const manifest = await TeslaModels.loadManifest();
  const entry = TeslaModels.findModel(manifest, modelId);
  modelName.textContent = entry ? `· ${TeslaModels.modelDisplayName(entry)}` : '';
  back.href = TeslaModels.buildHref('../kid/', modelId);

  if (!entry || !entry.hasGlb) {
    showStatus(`3D preview not yet available for this model. Drop a UV-matched GLB at web/models/${modelId}/model.glb (see web/3d/README.md).`);
    return;
  }

  const wrapDataUrl = sessionStorage.getItem(SESSION_WRAP_KEY);
  if (!wrapDataUrl) {
    showStatus('No wrap to preview. Save a wrap from Paint Box first, then click "View in 3D".');
    return;
  }

  const base = TeslaModels.modelAssetBase(modelId);
  const glbUrl = base + (entry.glbUrl || 'model.glb');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f7);
  scene.fog = new THREE.Fog(0xeef2f7, 18, 80);

  const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 200);
  camera.position.set(5, 2.4, 7);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(6, 10, 4);
  scene.add(dir);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.55;

  // Build the wrap texture from the stashed data URL.
  const wrapImage = new Image();
  wrapImage.src = wrapDataUrl;
  await new Promise((res, rej) => { wrapImage.onload = res; wrapImage.onerror = rej; });
  const wrapTexture = new THREE.CanvasTexture(wrapImage);
  wrapTexture.colorSpace = THREE.SRGBColorSpace;
  wrapTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  wrapTexture.flipY = false;

  // Load the GLB.
  showStatus('Loading 3D model…');
  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(glbUrl);
  } catch (err) {
    showStatus(`Could not load ${glbUrl}: ${err.message}`);
    return;
  }
  scene.add(gltf.scene);

  // Replace diffuse map on body materials.
  let replaced = 0;
  gltf.scene.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => {
      if (!m || !m.name) return;
      const lower = m.name.toLowerCase();
      if (!BODY_MATERIAL_HINTS.some(h => lower.includes(h))) return;
      m.map = wrapTexture;
      m.needsUpdate = true;
      replaced++;
    });
  });
  if (replaced === 0) {
    console.warn('No body materials matched. Looked for hints:', BODY_MATERIAL_HINTS,
      '— inspect material names in', glbUrl);
  }

  if (entry.credit) {
    const a = document.createElement('a');
    a.href = entry.credit.href || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = entry.credit.text;
    credit.appendChild(a);
    credit.hidden = false;
  }

  hideStatus();

  // Auto-rotate toggle.
  btnRotate.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    controls.autoRotateSpeed = 0.7;
    btnRotate.setAttribute('aria-pressed', String(controls.autoRotate));
  });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (renderer.getSize(new THREE.Vector2()).x !== w) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  new ResizeObserver(resize).observe(canvas);

  function tick() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

main().catch(err => {
  console.error(err);
  showStatus(`Error: ${err.message}`);
});
