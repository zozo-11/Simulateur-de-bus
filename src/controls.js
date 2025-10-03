import { clamp, lerp, wrapDegrees } from './utils.js';

const DEFAULT_WHEEL_LOCK = 900; // degrees lock-to-lock
const MIN_WHEEL_LOCK = 720;
const MAX_WHEEL_LOCK = 1440;
const HANDS_FREE_DELAY = 0.2; // seconds
const BRAKE_DEADZONE = 0.01;
const BRAKE_PRECOURSE = 0.05;
const BRAKE_THRESHOLD = 0.05;
const KICKDOWN_START = 0.85;
const KICKDOWN_RELEASE = 0.82;
const KICKDOWN_PASS = 0.88;
const SPRING_RETURN_GAIN = 8.5;

const getWheelLimit = (lockRange) => clamp(lockRange, MIN_WHEEL_LOCK, MAX_WHEEL_LOCK) / 2;

const controlState = {
  wheel: {
    angle: 0,
    lastAngle: 0,
    velocity: 0,
    lastVelocity: 0,
    acceleration: 0,
    target: 0,
    pointerVelocity: 0,
    pointerAcceleration: 0,
    lastPointerVelocity: 0,
    inputAggression: 0,
    isInteracting: false,
    pointerId: null,
    pointerBaseAngle: 0,
    pointerStartWheel: 0,
    lockRange: DEFAULT_WHEEL_LOCK,
    limit: getWheelLimit(DEFAULT_WHEEL_LOCK),
    lastUpdate: performance.now(),
    lastInteractionTime: performance.now(),
  },
  brake: {
    value: 0,
    lastValue: 0,
    velocity: 0,
    acceleration: 0,
    target: 0,
    isInteracting: false,
    pointerId: null,
    lastUpdate: performance.now(),
    detentActive: false,
    thresholdActive: false,
    keyboardActive: false,
    lastInteractionTime: performance.now(),
  },
  throttle: {
    value: 0,
    lastValue: 0,
    velocity: 0,
    acceleration: 0,
    target: 0,
    isInteracting: false,
    pointerId: null,
    lastUpdate: performance.now(),
    kickdownLatched: false,
    kickdownActive: false,
    keyboardActive: false,
    lastInteractionTime: performance.now(),
  },
  firstInteraction: false,
  listeners: [],
};

const dom = {};

const vibrate = (pattern) => {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (err) {
      /* ignore */
    }
  }
};

const pointerAngleFromEvent = (event, element) => {
  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

const attachWheel = () => {
  const wheel = dom.wheel;

  const updateWheelVisual = () => {
    wheel.style.transform = `rotate(${controlState.wheel.angle}deg)`;
    wheel.setAttribute('aria-valuenow', controlState.wheel.angle.toFixed(0));
    dom.wheelIndicator.textContent = `${controlState.wheel.angle.toFixed(0)}°`;
  };

  const clampWheelTarget = (value) => clamp(value, -controlState.wheel.limit, controlState.wheel.limit);

  const pointerDown = (event) => {
    if (controlState.wheel.pointerId !== null) return;
    controlState.wheel.isInteracting = true;
    controlState.wheel.pointerId = event.pointerId;
    controlState.wheel.pointerBaseAngle = pointerAngleFromEvent(event, wheel);
    controlState.wheel.pointerStartWheel = controlState.wheel.angle;
    controlState.wheel.pointerVelocity = 0;
    controlState.wheel.pointerAcceleration = 0;
    controlState.wheel.lastPointerVelocity = 0;
    controlState.firstInteraction = true;
    controlState.wheel.lastInteractionTime = performance.now();
    controlState.wheel.lastUpdate = performance.now();
    wheel.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event) => {
    if (controlState.wheel.pointerId !== event.pointerId) return;
    const pointerAngle = pointerAngleFromEvent(event, wheel);
    const delta = wrapDegrees(pointerAngle - controlState.wheel.pointerBaseAngle);
    const pointerScale = (controlState.wheel.lockRange / 1080) * 2.2;
    const target = clampWheelTarget(controlState.wheel.pointerStartWheel + delta * pointerScale);
    const now = performance.now();
    const dt = Math.max(1, now - controlState.wheel.lastUpdate);
    const velocity = ((target - controlState.wheel.target) / dt) * 1000;
    controlState.wheel.pointerAcceleration = (velocity - controlState.wheel.pointerVelocity) / (dt / 1000);
    controlState.wheel.pointerVelocity = velocity;
    controlState.wheel.target = target;
    controlState.wheel.lastUpdate = now;
    controlState.wheel.lastInteractionTime = now;
  };

  const pointerUp = (event) => {
    if (controlState.wheel.pointerId !== event.pointerId) return;
    controlState.wheel.pointerId = null;
    controlState.wheel.isInteracting = false;
    controlState.wheel.pointerVelocity = 0;
    controlState.wheel.pointerAcceleration = 0;
    controlState.wheel.lastInteractionTime = performance.now();
    wheel.releasePointerCapture(event.pointerId);
  };

  wheel.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);

  const keyStep = 12;
  wheel.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'a') {
      controlState.wheel.target = clampWheelTarget(controlState.wheel.target - keyStep);
      event.preventDefault();
    }
    if (event.key === 'ArrowRight' || event.key === 'd') {
      controlState.wheel.target = clampWheelTarget(controlState.wheel.target + keyStep);
      event.preventDefault();
    }
    if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(event.key)) {
      controlState.wheel.lastInteractionTime = performance.now();
    }
  });

  wheel.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(event.key)) {
      controlState.wheel.lastInteractionTime = performance.now();
    }
  });

  controlState.listeners.push(updateWheelVisual);
};

const setWheelLockRange = (lockRange) => {
  const sanitized = clamp(Math.round(lockRange / 30) * 30, MIN_WHEEL_LOCK, MAX_WHEEL_LOCK);
  controlState.wheel.lockRange = sanitized;
  controlState.wheel.limit = getWheelLimit(sanitized);
  controlState.wheel.angle = clamp(controlState.wheel.angle, -controlState.wheel.limit, controlState.wheel.limit);
  controlState.wheel.target = clamp(controlState.wheel.target, -controlState.wheel.limit, controlState.wheel.limit);
  dom.wheel.setAttribute('aria-valuemin', (-controlState.wheel.limit).toFixed(0));
  dom.wheel.setAttribute('aria-valuemax', controlState.wheel.limit.toFixed(0));
  controlState.wheel.lastInteractionTime = performance.now();
  if (dom.wheelLockSelect && dom.wheelLockSelect.value !== `${sanitized}`) {
    dom.wheelLockSelect.value = `${sanitized}`;
  }
};

const attachWheelLockSelector = () => {
  if (!dom.wheelLockSelect) return;
  dom.wheelLockSelect.value = `${DEFAULT_WHEEL_LOCK}`;
  const handleChange = (event) => {
    const value = parseInt(event.target.value, 10);
    setWheelLockRange(Number.isFinite(value) ? value : DEFAULT_WHEEL_LOCK);
    vibrate([8]);
  };
  dom.wheelLockSelect.addEventListener('change', handleChange);
};

const attachSlider = (element, state, options) => {
  const handle = element.querySelector('.slider-handle');
  const fill = element.querySelector('.slider-fill');
  const valueLabel = element.querySelector('.slider-value');
  const type = options.type;

  const setVisual = () => {
    fill.style.height = `${state.value * 100}%`;
    const handleHeight = handle.offsetHeight || 56;
    const pos = (1 - state.value) * (element.clientHeight - handleHeight - 28) + 14;
    handle.style.top = `${pos}px`;
    valueLabel.textContent = `${Math.round(state.value * 100)}%`;
    element.setAttribute('aria-valuenow', Math.round(state.value * 100));
  };

  const sliderRect = () => element.getBoundingClientRect();

  const pointerDown = (event) => {
    if (state.pointerId !== null) return;
    state.pointerId = event.pointerId;
    state.isInteracting = true;
    element.setPointerCapture(event.pointerId);
    controlState.firstInteraction = true;
    state.keyboardActive = false;
    state.lastInteractionTime = performance.now();
    state.lastUpdate = performance.now();
    handleInput(event.clientY);
  };

  const pointerMove = (event) => {
    if (state.pointerId !== event.pointerId) return;
    handleInput(event.clientY);
  };

  const pointerUp = (event) => {
    if (state.pointerId !== event.pointerId) return;
    state.pointerId = null;
    state.isInteracting = false;
    state.keyboardActive = false;
    state.target = 0;
    state.lastInteractionTime = performance.now();
    state.lastUpdate = performance.now();
    element.releasePointerCapture(event.pointerId);
  };

  const handleInput = (clientY) => {
    const rect = sliderRect();
    const relative = clamp((clientY - rect.top) / rect.height, 0, 1);
    const inverse = 1 - relative;
    state.target = inverse;
    const now = performance.now();
    const dt = Math.max(1, now - state.lastUpdate);
    const velocity = ((state.target - state.value) / dt) * 1000;
    state.acceleration = (velocity - state.velocity) / (dt / 1000);
    state.velocity = velocity;
    state.lastUpdate = now;
    state.lastInteractionTime = now;
  };

  element.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);

  const keyboardStep = options.keyboardStep ?? 0.04;
  element.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'w') {
      state.target = clamp(state.target + keyboardStep, 0, 1);
      event.preventDefault();
    }
    if (event.key === 'ArrowDown' || event.key === 's') {
      state.target = clamp(state.target - keyboardStep, 0, 1);
      event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(event.key)) {
      state.isInteracting = true;
      state.keyboardActive = true;
      state.lastInteractionTime = performance.now();
    }
  });

  element.addEventListener('keyup', (event) => {
    if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(event.key)) {
      state.isInteracting = false;
      state.keyboardActive = false;
      state.target = 0;
      state.lastInteractionTime = performance.now();
    }
  });

  controlState.listeners.push(setVisual);
};

const updateBrakeValue = (state, dt) => {
  const prevValue = state.value;
  const engaged = state.isInteracting || state.keyboardActive;
  let target = engaged ? clamp(state.target, 0, 1) : 0;

  let gain = engaged ? 7.2 : SPRING_RETURN_GAIN;
  if (engaged && target <= BRAKE_PRECOURSE) {
    const zone = clamp((target - BRAKE_DEADZONE) / Math.max(0.0001, BRAKE_PRECOURSE - BRAKE_DEADZONE), 0, 1);
    target = BRAKE_DEADZONE + zone * (BRAKE_PRECOURSE - BRAKE_DEADZONE);
    gain = lerp(2.8, 5.6, zone);
  } else if (!engaged && state.value < BRAKE_PRECOURSE) {
    gain = Math.max(gain, 7.5);
  }

  state.value += clamp(target - state.value, -gain * dt, gain * dt);
  state.value = clamp(state.value, 0, 1);

  const crossedPre = prevValue < BRAKE_DEADZONE && state.value >= BRAKE_DEADZONE;
  const crossedThreshold = prevValue < BRAKE_THRESHOLD && state.value >= BRAKE_THRESHOLD;
  if (crossedPre || crossedThreshold) {
    vibrate([10]);
  }

  state.detentActive = state.value >= BRAKE_DEADZONE && state.value <= BRAKE_PRECOURSE;
  state.thresholdActive = state.value >= BRAKE_THRESHOLD;
};

const updateThrottleValue = (state, dt) => {
  const engaged = state.isInteracting || state.keyboardActive;
  let target = engaged ? clamp(state.target, 0, 1) : 0;
  const approachingKickdown = engaged && target >= KICKDOWN_START && target < KICKDOWN_PASS;
  const crossingKickdown = engaged && target >= KICKDOWN_PASS;
  const baseGain = engaged ? 8.2 : SPRING_RETURN_GAIN;
  let gain = baseGain;

  if (approachingKickdown && !state.kickdownLatched) {
    const fraction = clamp((target - KICKDOWN_START) / (KICKDOWN_PASS - KICKDOWN_START), 0, 1);
    const slowGain = lerp(2.6, baseGain, fraction);
    gain = Math.min(gain, slowGain);
  }

  if (crossingKickdown) {
    state.kickdownLatched = true;
    gain = 10.2;
  }

  if (!engaged && state.value < KICKDOWN_RELEASE) {
    state.kickdownLatched = false;
  }

  state.value += clamp(target - state.value, -gain * dt, gain * dt);
  state.value = clamp(state.value, 0, 1);

  const wasActive = state.kickdownActive;
  state.kickdownActive = state.value >= KICKDOWN_PASS;
  if (!engaged && state.value < KICKDOWN_RELEASE) {
    state.kickdownActive = false;
  }

  if (state.kickdownActive && !wasActive) {
    vibrate([20, 20, 20]);
  }

  if (!state.kickdownActive && wasActive && state.value < KICKDOWN_START) {
    vibrate([12]);
  }
};

const recenterProfiles = [
  { maxSpeed: 0.2, stiffness: 0, damping: 7.2, maxRate: 140 },
  { maxSpeed: 10, stiffness: 0.55, damping: 6.5, maxRate: 160 },
  { maxSpeed: 20, stiffness: 1.1, damping: 6.8, maxRate: 200 },
  { maxSpeed: 40, stiffness: 1.9, damping: 7.4, maxRate: 240 },
  { maxSpeed: 70, stiffness: 2.8, damping: 7.9, maxRate: 300 },
  { maxSpeed: Infinity, stiffness: 3.6, damping: 8.4, maxRate: 340 },
];

const getRecenterProfile = (speedKmh) => {
  const profile = recenterProfiles.find((entry) => speedKmh <= entry.maxSpeed);
  return profile || recenterProfiles[recenterProfiles.length - 1];
};

const updateWheel = (wheel, dt, busState) => {
  const prevAngle = wheel.angle;
  const prevVelocity = wheel.velocity;
  wheel.target = clamp(wheel.target, -wheel.limit, wheel.limit);
  const now = performance.now();
  const speedKmh = busState.speed * 3.6;
  const profile = getRecenterProfile(speedKmh);
  const handsFree = !wheel.isInteracting && (now - wheel.lastInteractionTime) / 1000 > HANDS_FREE_DELAY;
  const normalizedAngle = Math.min(1, Math.abs(wheel.angle) / Math.max(1, wheel.limit));
  const pointerActivity = clamp(Math.abs(wheel.pointerAcceleration) / 2000, 0, 1);

  if (wheel.isInteracting) {
    wheel.inputAggression = lerp(wheel.inputAggression, pointerActivity, 0.12);
    const lockFactor = clamp(wheel.lockRange / MAX_WHEEL_LOCK, 0.6, 1.1);
    const maxRate = lerp(240, 660 * lockFactor, clamp(Math.abs(wheel.pointerVelocity) / 360, 0, 1));
    const desired = clamp(wheel.target, -wheel.limit, wheel.limit);
    const delta = clamp(desired - wheel.angle, -maxRate * dt, maxRate * dt);
    wheel.angle += delta;
    wheel.lastInteractionTime = now;
  } else {
    const stiffness = handsFree ? profile.stiffness * (0.7 + normalizedAngle * 0.6) : 0;
    const damping = profile.damping;
    const torque = -wheel.angle * stiffness - wheel.velocity * damping;
    const torqueLimit = profile.maxRate * 6;
    wheel.velocity += clamp(torque, -torqueLimit, torqueLimit) * dt;
    wheel.velocity = clamp(wheel.velocity, -profile.maxRate, profile.maxRate);
    wheel.angle += wheel.velocity * dt;
    if (!handsFree) {
      wheel.velocity *= 1 - clamp(dt * 5, 0, 0.6);
    }
    wheel.target = clamp(wheel.angle, -wheel.limit, wheel.limit);
    wheel.inputAggression = lerp(wheel.inputAggression, 0, clamp(dt * 5, 0, 1));
    if (Math.abs(wheel.angle) < 0.05 && Math.abs(wheel.velocity) < 0.25) {
      wheel.angle = 0;
      wheel.velocity = 0;
    }
  }

  wheel.angle = clamp(wheel.angle, -wheel.limit, wheel.limit);
  wheel.velocity = (wheel.angle - prevAngle) / dt;
  wheel.acceleration = (wheel.velocity - prevVelocity) / dt;
};

const updateSliderKinematics = (state, dt) => {
  state.velocity = (state.value - state.lastValue) / dt;
  state.acceleration = (state.velocity - (state.lastVelocity ?? 0)) / dt;
  state.lastVelocity = state.velocity;
  state.lastValue = state.value;
};

export const initControls = () => {
  dom.wheel = document.getElementById('wheel');
  dom.wheelIndicator = document.getElementById('wheel-angle-indicator');
  dom.brakeSlider = document.getElementById('brake-slider');
  dom.throttleSlider = document.getElementById('throttle-slider');
  dom.wheelLockSelect = document.getElementById('wheel-lock-select');

  setWheelLockRange(DEFAULT_WHEEL_LOCK);
  attachWheel();
  attachWheelLockSelector();
  attachSlider(dom.brakeSlider, controlState.brake, { type: 'brake' });
  attachSlider(dom.throttleSlider, controlState.throttle, { type: 'throttle' });

  return controlState;
};

export const updateControls = (dt, busState) => {
  updateWheel(controlState.wheel, dt, busState);
  updateBrakeValue(controlState.brake, dt);
  updateThrottleValue(controlState.throttle, dt);
  updateSliderKinematics(controlState.brake, dt);
  updateSliderKinematics(controlState.throttle, dt);

  controlState.listeners.forEach((cb) => cb());
};

export const getControlSnapshot = () => ({
  wheelAngle: controlState.wheel.angle,
  wheelVelocity: controlState.wheel.velocity,
  wheelAcceleration: controlState.wheel.acceleration,
  wheelAggression: controlState.wheel.inputAggression,
  wheelLock: controlState.wheel.lockRange,
  brake: controlState.brake.value,
  brakeVelocity: controlState.brake.velocity,
  brakeAcceleration: controlState.brake.acceleration,
  brakeDetent: controlState.brake.detentActive,
  brakeThreshold: controlState.brake.thresholdActive,
  throttle: controlState.throttle.value,
  throttleVelocity: controlState.throttle.velocity,
  throttleAcceleration: controlState.throttle.acceleration,
  kickdown: controlState.throttle.kickdownActive,
  kickdownLatched: controlState.throttle.kickdownLatched,
  userInteracting: controlState.firstInteraction,
});

export const setWheelExternal = (angle) => {
  controlState.wheel.angle = clamp(angle, -controlState.wheel.limit, controlState.wheel.limit);
  controlState.wheel.target = controlState.wheel.angle;
};

export const onFrameEnd = () => {
  controlState.wheel.lastAngle = controlState.wheel.angle;
  controlState.wheel.lastVelocity = controlState.wheel.velocity;
};
