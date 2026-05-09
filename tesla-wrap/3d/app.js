import { initTeslaWrapViewer } from './viewer.js?v=1';

const status = document.getElementById('status');
const modelName = document.getElementById('model-name');
const btnRotate = document.getElementById('btn-rotate');
const back = document.getElementById('back');
const canvas = document.getElementById('three-canvas');
const credit = document.getElementById('credit');

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
