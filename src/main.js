import { initControls, updateControls, getControlSnapshot, onFrameEnd } from './controls.js';
import { updatePhysics, getBusState } from './physics.js';
import { initRenderer, renderFrame, adjustRenderScale, setViewMode } from './render.js';
import { unlockAudio, updateAudio } from './audio.js';

const frameTimes = [];
const MAX_HISTORY = 120;
let lastTimestamp = performance.now();
let audioUnlocked = false;
let viewMode = 'cockpit';

const controls = initControls();
initRenderer();

const cameraToggle = document.getElementById('camera-toggle');
const touchShield = document.getElementById('touch-shield');

touchShield.addEventListener('touchmove', (event) => {
  event.preventDefault();
}, { passive: false });

const toggleView = () => {
  viewMode = viewMode === 'cockpit' ? 'exterior' : 'cockpit';
  setViewMode(viewMode);
  cameraToggle.textContent = viewMode === 'cockpit' ? 'Vue conducteur' : 'Vue extérieure';
  cameraToggle.setAttribute('aria-pressed', viewMode === 'cockpit');
};

cameraToggle.addEventListener('click', toggleView);
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'v') {
    toggleView();
  }
});

const ensureAudioUnlocked = () => {
  if (!audioUnlocked) {
    audioUnlocked = true;
    unlockAudio();
  }
};

window.addEventListener('pointerdown', ensureAudioUnlocked, { once: true });
window.addEventListener('keydown', ensureAudioUnlocked, { once: true });

const clampDt = (dt) => {
  if (Number.isNaN(dt) || !Number.isFinite(dt)) return 0.016;
  return Math.min(Math.max(dt, 0.001), 0.05);
};

const updateFrameTimes = (frameMs) => {
  frameTimes.push(frameMs);
  if (frameTimes.length > MAX_HISTORY) {
    frameTimes.shift();
  }
  const avg = frameTimes.reduce((acc, value) => acc + value, 0) / frameTimes.length;
  adjustRenderScale(avg);
};

const loop = (timestamp) => {
  const dt = clampDt((timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  const busState = getBusState();
  updateControls(dt, busState);
  const snapshot = getControlSnapshot();
  updatePhysics(dt, snapshot);
  renderFrame(busState, snapshot);
  updateAudio(busState);
  onFrameEnd();

  updateFrameTimes(dt * 1000);
  requestAnimationFrame(loop);
};

requestAnimationFrame(loop);
