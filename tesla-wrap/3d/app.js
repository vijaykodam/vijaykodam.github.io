import { initTeslaWrapViewer } from './viewer.js?v=4';

const SESSION_WRAP_KEY = 'tesla_wrap_dataurl';

const status = document.getElementById('status');
const modelName = document.getElementById('model-name');
const btnRotate = document.getElementById('btn-rotate');
const btnLighting = document.getElementById('btn-lighting');
const lightingPanel = document.getElementById('lighting-panel');
const btnDownload = document.getElementById('btn-download');
const back = document.getElementById('back');
const canvas = document.getElementById('three-canvas');
const credit = document.getElementById('credit');

const lightingControls = lightingPanel ? {
  chip: btnLighting,
  panel: lightingPanel,
  sliders: {
    exposure: document.getElementById('lighting-exposure'),
    hemi: document.getElementById('lighting-hemi'),
    key: document.getElementById('lighting-key'),
    fill: document.getElementById('lighting-fill'),
    rim: document.getElementById('lighting-rim'),
  },
  values: {
    exposure: lightingPanel.querySelector('[data-for="exposure"]'),
    hemi: lightingPanel.querySelector('[data-for="hemi"]'),
    key: lightingPanel.querySelector('[data-for="key"]'),
    fill: lightingPanel.querySelector('[data-for="fill"]'),
    rim: lightingPanel.querySelector('[data-for="rim"]'),
  },
  reset: document.getElementById('lighting-reset'),
} : null;

function filenameForModel(modelId) {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeModel = (modelId || 'modely').replace(/[^A-Za-z0-9_-]+/g, '_');
  return `MyWrap_${safeModel}_${stamp}.png`;
}

function initDownloadButton() {
  const wrapDataUrl = sessionStorage.getItem(SESSION_WRAP_KEY);
  if (!btnDownload || !wrapDataUrl) return;

  btnDownload.disabled = false;
  btnDownload.addEventListener('click', async () => {
    const modelId = window.TeslaModels ? await TeslaModels.resolveModel() : new URLSearchParams(location.search).get('model');
    const a = document.createElement('a');
    a.href = wrapDataUrl;
    a.download = filenameForModel(modelId);
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

initDownloadButton();

initTeslaWrapViewer({
  canvas,
  status,
  modelName,
  back,
  rotateButton: btnRotate,
  lighting: lightingControls,
  credit,
  requireWrap: true,
  autoRotate: false,
  transparent: false
}).catch(err => {
  status.textContent = err.message;
  status.hidden = false;
});
