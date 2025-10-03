import { clamp, lerp } from './utils.js';

const hud = {};
const renderState = {
  canvas: null,
  ctx: null,
  renderScale: 1,
  dpr: 1,
  viewMode: 'cockpit',
  lastWidth: 0,
  lastHeight: 0,
};

export const initRenderer = () => {
  renderState.canvas = document.getElementById('scene-canvas');
  renderState.ctx = renderState.canvas.getContext('2d');
  renderState.dpr = window.devicePixelRatio || 1;
  hud.speed = document.getElementById('hud-speed');
  hud.rpm = document.getElementById('hud-rpm');
  hud.gear = document.getElementById('hud-gear');
  hud.gearTrend = document.getElementById('hud-gear-trend');
  hud.k = document.getElementById('hud-k');
  hud.stop = document.getElementById('hud-stop');
  hud.retarder = document.getElementById('hud-retarder');
  hud.brakeBar = document.getElementById('hud-brake-bar');
  hud.throttleBar = document.getElementById('hud-throttle-bar');
  hud.wheelBar = document.getElementById('hud-wheel-bar');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
};

const resizeCanvas = () => {
  const rect = renderState.canvas.getBoundingClientRect();
  const { width, height } = rect;
  renderState.lastWidth = width;
  renderState.lastHeight = height;
  const scale = renderState.renderScale;
  renderState.canvas.width = Math.max(1, width * renderState.dpr * scale);
  renderState.canvas.height = Math.max(1, height * renderState.dpr * scale);
  renderState.ctx.setTransform(renderState.dpr * scale, 0, 0, renderState.dpr * scale, 0, 0);
};

export const setViewMode = (mode) => {
  renderState.viewMode = mode;
};

export const adjustRenderScale = (avgFrame) => {
  const target = 16.7;
  if (avgFrame > target * 1.15 && renderState.renderScale > 0.75) {
    renderState.renderScale = Math.max(0.6, renderState.renderScale - 0.05);
    resizeCanvas();
  } else if (avgFrame < target * 0.9 && renderState.renderScale < 1) {
    renderState.renderScale = Math.min(1, renderState.renderScale + 0.05);
    resizeCanvas();
  }
};

const updateHud = (busState, controls) => {
  const speedKmh = busState.speed * 3.6;
  hud.speed.textContent = `${speedKmh.toFixed(0)} km/h`;
  hud.rpm.textContent = `${Math.round(busState.rpm).toLocaleString('fr-FR')} tr/min`;
  hud.gear.textContent = busState.gearName;
  hud.gearTrend.dataset.trend = busState.gearTrend || '';
  hud.brakeBar.style.width = `${clamp(controls.brake, 0, 1) * 100}%`;
  hud.throttleBar.style.width = `${clamp(controls.throttle, 0, 1) * 100}%`;
  const wheelLimit = Math.max(1, (controls.wheelLock ?? 900) / 2);
  hud.wheelBar.style.width = `${clamp(Math.abs(controls.wheelAngle) / wheelLimit, 0, 1) * 100}%`;

  hud.k.classList.toggle('active', busState.kIndicator);
  hud.stop.classList.toggle('active', busState.stopLamp);
  hud.retarder.classList.toggle('active', busState.retarder);
};

const drawCockpit = (ctx, width, height, busState) => {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1b2535');
  gradient.addColorStop(0.5, '#0a0d14');
  gradient.addColorStop(1, '#05070b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const horizonY = height * 0.45 + busState.camera.surge * 30;
  const roadWidth = width * 0.7;
  const laneOffset = busState.camera.sway * 60;

  ctx.fillStyle = '#1a1f27';
  ctx.beginPath();
  ctx.moveTo(-width * 0.2 + laneOffset, horizonY);
  ctx.lineTo(width * 0.2 + laneOffset, height);
  ctx.lineTo(width * 0.8 + laneOffset, height);
  ctx.lineTo(width * 0.4 + laneOffset, horizonY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2a303c';
  ctx.beginPath();
  ctx.moveTo(width * 0.4 + laneOffset, horizonY);
  ctx.lineTo(width * 0.8 + laneOffset, height);
  ctx.lineTo(width * 0.85 + laneOffset, height);
  ctx.lineTo(width * 0.45 + laneOffset, horizonY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#f5faff';
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 30]);
  ctx.beginPath();
  ctx.moveTo(width * 0.5 + laneOffset, horizonY);
  ctx.lineTo(width * 0.6 + laneOffset, height);
  ctx.stroke();
  ctx.setLineDash([]);

  const dashTop = height * 0.58;
  ctx.fillStyle = '#0c121a';
  ctx.beginPath();
  ctx.roundRect(width * 0.05, dashTop, width * 0.9, height * 0.42, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(82,168,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(width * 0.12, dashTop + 26, width * 0.36, height * 0.18, 18);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.roundRect(width * 0.54, dashTop + 18, width * 0.36, height * 0.2, 18);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.roundRect(width * 0.32, dashTop + 140, width * 0.24, height * 0.16, 16);
  ctx.fill();

  const rpmBarWidth = lerp(width * 0.18, width * 0.26, clamp((busState.rpm - 6000) / 19000, 0, 1));
  ctx.fillStyle = 'rgba(82,168,255,0.45)';
  ctx.fillRect(width * 0.58, dashTop + 40, rpmBarWidth, 12);
  ctx.fillStyle = 'rgba(30,122,255,0.7)';
  ctx.fillRect(width * 0.58, dashTop + 60, rpmBarWidth * clamp(busState.throttle, 0, 1), 10);

  const brakeBar = width * 0.2 * clamp(busState.brake, 0, 1);
  ctx.fillStyle = 'rgba(255,79,109,0.6)';
  ctx.fillRect(width * 0.18, dashTop + 64, brakeBar, 8);

  ctx.restore();
};

const drawExterior = (ctx, width, height, busState) => {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#0f1e33');
  sky.addColorStop(1, '#05070b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#1a202b';
  ctx.fillRect(0, height * 0.6, width, height * 0.4);

  const busX = width * 0.5 + Math.sin(busState.time * 0.6) * 10;
  const busY = height * 0.65;
  const busWidth = width * 0.36;
  const busHeight = height * 0.22;

  ctx.save();
  ctx.translate(busX, busY);
  ctx.rotate(busState.roll * (Math.PI / 180) * 0.2);
  ctx.translate(-busWidth / 2, -busHeight / 2);

  ctx.fillStyle = '#1d2a3a';
  ctx.fillRect(0, 0, busWidth, busHeight);
  ctx.fillStyle = '#25364d';
  ctx.fillRect(busWidth * 0.05, busHeight * 0.15, busWidth * 0.9, busHeight * 0.4);
  ctx.fillStyle = '#1f2d40';
  ctx.fillRect(busWidth * 0.05, busHeight * 0.56, busWidth * 0.9, busHeight * 0.34);
  ctx.fillStyle = '#101822';
  ctx.fillRect(busWidth * 0.07, busHeight * 0.64, busWidth * 0.18, busHeight * 0.15);
  ctx.fillRect(busWidth * 0.75, busHeight * 0.64, busWidth * 0.18, busHeight * 0.15);

  ctx.fillStyle = 'rgba(82,168,255,0.75)';
  const rpmBar = clamp((busState.rpm - 6000) / 19000, 0, 1);
  ctx.fillRect(busWidth * 0.12, busHeight * 0.18, busWidth * 0.22, busHeight * 0.12 * rpmBar);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(busX - busWidth * 0.3, busY + busHeight * 0.4, busWidth * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(busX + busWidth * 0.3, busY + busHeight * 0.4, busWidth * 0.2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
};

const applyCameraTransform = (busState) => {
  const { canvas } = renderState;
  const pitch = busState.camera.pitch * 0.65;
  const roll = busState.camera.roll * 0.7;
  const yaw = busState.camera.yaw * 0.8;
  const surge = busState.camera.surge * 30;
  const sway = busState.camera.sway * 40;
  const heave = busState.camera.heave * 26;
  canvas.style.transform = `translate3d(${sway.toFixed(2)}px, ${(heave + surge).toFixed(2)}px, 0) rotateX(${pitch.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg) rotateZ(${roll.toFixed(3)}deg)`;
};

export const renderFrame = (busState, controls) => {
  if (!renderState.ctx) return;
  const width = renderState.lastWidth;
  const height = renderState.lastHeight;
  if (renderState.viewMode === 'cockpit') {
    drawCockpit(renderState.ctx, width, height, busState);
    applyCameraTransform(busState);
  } else {
    drawExterior(renderState.ctx, width, height, busState);
    renderState.canvas.style.transform = 'none';
  }

  updateHud(busState, controls);
};
