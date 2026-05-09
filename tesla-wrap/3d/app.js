import { initTeslaWrapViewer } from './viewer.js?v=1';

const SESSION_WRAP_KEY = 'tesla_wrap_dataurl';

const status = document.getElementById('status');
const modelName = document.getElementById('model-name');
const btnRotate = document.getElementById('btn-rotate');
const btnDownload = document.getElementById('btn-download');
const back = document.getElementById('back');
const canvas = document.getElementById('three-canvas');
const credit = document.getElementById('credit');

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
  credit,
  requireWrap: true,
  autoRotate: false,
  transparent: false
}).catch(err => {
  status.textContent = err.message;
  status.hidden = false;
});
