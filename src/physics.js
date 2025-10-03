import { clamp, lerp } from './utils.js';

const MASS = 13000;
const WHEEL_RADIUS = 0.575;
const WHEEL_BASE = 6.2;
const TRACK_WIDTH = 2.6;
const FINAL_DRIVE = 12.0;
const ENGINE_IDLE = 6000;
const ENGINE_MAX = 25000;
const ENGINE_PEAK_TORQUE = 220;
const DRAG_COEF = 0.42;
const ROLLING_RESIST = 120;
const BRAKE_FORCE_SERVICE = 150000;
const BRAKE_FORCE_EMERGENCY = 240000;
const CREEP_FORCE = 2800;
const RETARDER_FORCE_MAX = 65000;
const RETARDER_THRESHOLD_SPEED = 15 / 3.6;
const BRAKE_HOLD_SPEED = 8 / 3.6;
const DEFAULT_WHEEL_LOCK = 900;
const BRAKE_DEADZONE = 0.01;
const BRAKE_PRECOURSE = 0.05;

const gearRatios = [0, 14.5, 9.6, 6.6, 4.7, 3.2, 2.4];
const gearNames = ['N', '1', '2', '3', '4', '5', '6'];
const upshiftRpm = [0, 17500, 18000, 18200, 18800, 19500, 20500];
const downshiftRpm = [0, 11800, 12300, 12800, 13500, 14200, 15000];

const randomRange = (min, max) => min + Math.random() * (max - min);

const defaultState = {
  time: 0,
  speed: 0,
  heading: 0,
  yawRate: 0,
  position: { x: 0, y: 0 },
  acceleration: { long: 0, lat: 0 },
  jerk: { long: 0, lat: 0 },
  pitch: 0,
  roll: 0,
  heave: 0,
  rpm: ENGINE_IDLE,
  targetRpm: ENGINE_IDLE,
  gearIndex: 1,
  gearName: '1',
  gearTrend: '',
  shift: { active: false, timer: 0, phase: 'steady', target: 1, torqueFactor: 1 },
  throttle: 0,
  brake: 0,
  serviceBrakeRatio: 0,
  steering: {
    wheelAngle: 0,
    roadAngle: 0,
    ratio: 20,
  },
  slip: 0,
  tyreSqueal: 0,
  brakeSqueal: 0,
  brakeHiss: 0,
  brakeHold: false,
  retarder: false,
  retarderForce: 0,
  retarderIntensity: 0,
  kIndicator: false,
  stopLamp: false,
  engineLoad: 0,
  kickdownActive: false,
  allowUpshiftTimer: 0,
  kickdownLatchTimer: 0,
  camera: {
    pitch: 0,
    roll: 0,
    yaw: 0,
    surge: 0,
    sway: 0,
    heave: 0,
  },
  resonance: 0,
  rumble: 0,
};

const busState = structuredClone(defaultState);

const wheelCircumference = 2 * Math.PI * WHEEL_RADIUS;

const mapSteering = (wheelAngleDeg, lockRange = DEFAULT_WHEEL_LOCK) => {
  const halfLock = Math.max(1, lockRange / 2);
  const abs = Math.abs(wheelAngleDeg);
  const fineFactor = clamp(Math.pow(abs / halfLock, 0.82), 0, 1);
  const ratio = lerp(23, 12.4, fineFactor);
  const roadAngleDeg = wheelAngleDeg / ratio;
  return { roadAngleDeg, ratio };
};

const computeBrakeForces = (value, speed) => {
  if (value <= BRAKE_DEADZONE) {
    return { total: 0, service: 0, retarder: 0, retarderIntensity: 0 };
  }

  const speedKmh = speed * 3.6;
  let retarderForce = 0;
  let retarderIntensity = 0;
  if (speed > RETARDER_THRESHOLD_SPEED && value > BRAKE_DEADZONE) {
    if (value <= BRAKE_PRECOURSE) {
      retarderIntensity = clamp((value - BRAKE_DEADZONE) / (BRAKE_PRECOURSE - BRAKE_DEADZONE), 0, 1);
    } else {
      retarderIntensity = 1;
    }
    const speedFactor = clamp(speedKmh / 90, 0, 1.15);
    retarderForce = RETARDER_FORCE_MAX * retarderIntensity * speedFactor;
  }

  let serviceForce = 0;
  if (value > BRAKE_PRECOURSE) {
    const serviceValue = Math.min(value, 0.9);
    const serviceNorm = clamp((serviceValue - BRAKE_PRECOURSE) / (0.9 - BRAKE_PRECOURSE), 0, 1);
    serviceForce = lerp(0.14, 1, Math.pow(serviceNorm, 1.12)) * BRAKE_FORCE_SERVICE;
    if (value > 0.9) {
      const emergencyNorm = clamp((value - 0.9) / 0.1, 0, 1);
      serviceForce = BRAKE_FORCE_SERVICE + emergencyNorm * (BRAKE_FORCE_EMERGENCY - BRAKE_FORCE_SERVICE);
    }
  }

  if (speed < 2.2) {
    const holdFactor = clamp((2.2 - speed) / 2.2, 0, 1);
    serviceForce *= lerp(1, 1.18, holdFactor);
  }

  const total = serviceForce + retarderForce;
  return { total, service: serviceForce, retarder: retarderForce, retarderIntensity: clamp(retarderIntensity, 0, 1) };
};

const computeDriveForce = (throttle, gearIndex, rpm, kickdown) => {
  if (gearIndex === 0) {
    return throttle * 1400;
  }
  const ratio = gearRatios[gearIndex];
  const engineFactor = Math.pow(throttle, kickdown ? 1.18 : 1.32);
  const highRpmFactor = lerp(0.58, kickdown ? 1.05 : 0.96, 1 - clamp((rpm - 14000) / 9000, 0, 1));
  const torque = ENGINE_PEAK_TORQUE * engineFactor * highRpmFactor;
  const wheelTorque = torque * ratio * FINAL_DRIVE * 0.92;
  const wheelForce = wheelTorque / WHEEL_RADIUS;
  const kickBoost = kickdown ? 1.55 : 1;
  return wheelForce * kickBoost;
};

const updateTransmission = (dt, controls) => {
  const { throttle, kickdown } = controls;
  const wheelRpm = (busState.speed / wheelCircumference) * 60;
  const gearRatio = gearRatios[busState.gearIndex] || 0;
  let targetRpm = ENGINE_IDLE;
  if (gearRatio > 0) {
    targetRpm = clamp(wheelRpm * gearRatio * FINAL_DRIVE, ENGINE_IDLE, ENGINE_MAX);
  } else {
    targetRpm = ENGINE_IDLE + throttle * 6000;
  }
  busState.targetRpm = targetRpm;

  busState.allowUpshiftTimer = Math.max(0, busState.allowUpshiftTimer - dt);
  busState.kickdownLatchTimer = Math.max(0, busState.kickdownLatchTimer - dt);
  const wasKickdown = busState.kickdownActive;
  if (kickdown) {
    busState.kickdownActive = true;
  } else if (!busState.shift.active || busState.shift.direction !== 'down') {
    busState.kickdownActive = false;
  }
  if (!kickdown && wasKickdown) {
    busState.kickdownLatchTimer = randomRange(0.2, 0.4);
  }

  if (busState.shift.active) {
    busState.shift.timer -= dt;
    if (busState.shift.phase === 'latency') {
      const progress = clamp(1 - busState.shift.timer / busState.shift.latency, 0, 1);
      busState.shift.torqueFactor = lerp(1, 0.25, progress);
      if (busState.shift.timer <= 0) {
        busState.gearIndex = busState.shift.target;
        busState.gearName = gearNames[busState.gearIndex];
        busState.shift.phase = 'engage';
        busState.shift.timer = busState.shift.engage;
        busState.shift.torqueFactor = 0.35;
        busState.gearTrend = busState.shift.direction === 'up' ? '↑' : '↓';
      }
    } else if (busState.shift.phase === 'engage') {
      const progress = clamp(1 - busState.shift.timer / busState.shift.engage, 0, 1);
      busState.shift.torqueFactor = lerp(0.35, 1, progress);
      if (busState.shift.timer <= 0) {
        busState.shift.active = false;
        busState.shift.phase = 'steady';
        busState.shift.torqueFactor = 1;
        busState.gearTrend = '';
      }
    }
  } else {
    busState.shift.torqueFactor = lerp(busState.shift.torqueFactor, 1, dt * 4);
  }

  if (busState.shift.active) {
    return;
  }

  const currentGear = busState.gearIndex;
  const rpm = busState.rpm;
  const upshiftBlocked = kickdown || busState.allowUpshiftTimer > 0 || busState.kickdownLatchTimer > 0;
  const canUpshift = currentGear < gearRatios.length - 1 && !upshiftBlocked;
  const canDownshift = currentGear > 1;

  const requestShift = (target, direction, latencyRange, engageRange = [0.14, 0.2], torqueDip = 0.65) => {
    if (target === currentGear) return;
    busState.shift.active = true;
    busState.shift.phase = 'latency';
    busState.shift.target = target;
    busState.shift.direction = direction;
    busState.shift.latency = randomRange(latencyRange[0], latencyRange[1]);
    busState.shift.engage = randomRange(engageRange[0], engageRange[1]);
    busState.shift.timer = busState.shift.latency;
    busState.shift.torqueFactor = torqueDip;
  };

  if (kickdown && canDownshift) {
    const drop = throttle > 0.95 ? 2 : 1;
    const target = Math.max(1, currentGear - drop);
    if (target !== currentGear) {
      requestShift(target, 'down', [0.3, 0.5], [0.24, 0.32], 0.5);
      busState.kickdownActive = true;
      busState.allowUpshiftTimer = Math.max(busState.allowUpshiftTimer, randomRange(0.45, 0.55));
      busState.kickdownLatchTimer = Math.max(busState.kickdownLatchTimer, randomRange(0.35, 0.5));
      return;
    }
  }

  if (canUpshift && rpm > upshiftRpm[currentGear] && throttle < 0.98) {
    requestShift(currentGear + 1, 'up', [0.12, 0.18]);
    return;
  }

  if (canDownshift && (rpm < downshiftRpm[currentGear] || (rpm < downshiftRpm[currentGear] + 800 && throttle > 0.5))) {
    requestShift(currentGear - 1, 'down', [0.16, 0.24], [0.16, 0.22], 0.58);
    busState.allowUpshiftTimer = Math.max(busState.allowUpshiftTimer, randomRange(0.18, 0.28));
    return;
  }
};

const updateCamera = (dt) => {
  const lat = busState.acceleration.lat;
  const lon = busState.acceleration.long;
  const jerkLat = busState.jerk.lat;
  const jerkLong = busState.jerk.long;

  const targetRoll = clamp(-lat * 0.9 - jerkLat * 0.04, -6, 6);
  const targetPitch = clamp(-lon * 0.45 - jerkLong * 0.08, -5.5, 5.5);

  busState.camera.roll = lerp(busState.camera.roll, targetRoll, clamp(dt * 5, 0, 1));
  busState.camera.pitch = lerp(busState.camera.pitch, targetPitch, clamp(dt * 4, 0, 1));
  busState.camera.yaw = lerp(busState.camera.yaw, clamp(busState.yawRate * 28, -4, 4), clamp(dt * 3, 0, 1));
  const swayTarget = clamp(lat * 0.08 + jerkLat * 0.02, -0.4, 0.4);
  busState.camera.sway = lerp(busState.camera.sway, swayTarget, clamp(dt * 5, 0, 1));
  const surgeTarget = clamp(-lon * 0.05 - jerkLong * 0.02, -0.45, 0.35);
  busState.camera.surge = lerp(busState.camera.surge, surgeTarget, clamp(dt * 5, 0, 1));
  busState.camera.heave = lerp(busState.camera.heave, busState.heave, clamp(dt * 3, 0, 1));
};

export const updatePhysics = (dt, controls) => {
  busState.time += dt;
  busState.throttle = controls.throttle;
  busState.brake = controls.brake;

  updateTransmission(dt, controls);

  const wheelMap = mapSteering(controls.wheelAngle, controls.wheelLock ?? DEFAULT_WHEEL_LOCK);
  const roadAngle = (wheelMap.roadAngleDeg * Math.PI) / 180;
  const yawRateTarget = busState.speed * Math.tan(roadAngle) / WHEEL_BASE;

  const steerAggression = clamp(Math.abs(controls.wheelAcceleration) / 800, 0, 1);
  const latImpulse = clamp(Math.abs(controls.wheelVelocity) / 300, 0, 1);
  const brakeAggression = clamp(Math.abs(controls.brakeAcceleration) * 0.35, 0, 1);

  const yawBlend = clamp(dt * (2 + latImpulse * 6), 0, 1);
  busState.yawRate = lerp(busState.yawRate, yawRateTarget, yawBlend);
  busState.heading += busState.yawRate * dt;
  busState.position.x += Math.cos(busState.heading) * busState.speed * dt;
  busState.position.y += Math.sin(busState.heading) * busState.speed * dt;

  const lateralAccel = busState.speed * busState.yawRate + steerAggression * 1.8 + latImpulse * 0.9;

  const brakeData = computeBrakeForces(busState.brake, busState.speed);
  const driveForceRaw = computeDriveForce(busState.throttle, busState.gearIndex, busState.targetRpm, controls.kickdown);
  const shiftFactor = busState.shift.torqueFactor ?? 1;
  const driveForce = driveForceRaw * shiftFactor;

  const dragForce = DRAG_COEF * busState.speed * busState.speed;
  const rollingForce = ROLLING_RESIST + busState.speed * 65;

  let longForce = driveForce - dragForce - rollingForce;

  if (busState.speed < 2.2) {
    const creep = clamp(1 - busState.speed / 2.2, 0, 1) * CREEP_FORCE;
    const creepFactor = busState.brake > BRAKE_DEADZONE ? 0.25 : 1;
    longForce += creep * creepFactor;
  }

  longForce -= brakeData.total;

  let accelerationLong = longForce / MASS;

  const holdProgress = clamp((BRAKE_HOLD_SPEED - busState.speed) / BRAKE_HOLD_SPEED, 0, 1);
  const holdThreshold = lerp(0.32, 0.48, holdProgress);
  if (holdProgress > 0 && busState.brake > holdThreshold) {
    busState.brakeHold = true;
    const clampTarget = lerp(-0.9, -3.1, holdProgress);
    accelerationLong = Math.min(accelerationLong, clampTarget);
  } else {
    busState.brakeHold = false;
  }

  const prevSpeed = busState.speed;
  busState.speed = clamp(busState.speed + accelerationLong * dt, 0, 38);
  if (busState.brakeHold && busState.speed < 0.05) {
    busState.speed = 0;
  }
  if (busState.speed <= 0.01) {
    busState.speed = 0;
  }

  const actualAccelLong = (busState.speed - prevSpeed) / dt;

  const prevAccelLong = busState.acceleration.long;
  const prevAccelLat = busState.acceleration.lat;

  busState.acceleration.long = actualAccelLong;
  busState.acceleration.lat = lerp(prevAccelLat, lateralAccel, clamp(dt * 6, 0, 1));

  busState.jerk.long = (busState.acceleration.long - prevAccelLong) / dt;
  busState.jerk.lat = (busState.acceleration.lat - prevAccelLat) / dt;

  busState.pitch = lerp(busState.pitch, clamp(-busState.acceleration.long * 1.3 - busState.jerk.long * 0.05, -8, 6), clamp(dt * 4, 0, 1));
  busState.roll = lerp(busState.roll, clamp(busState.acceleration.lat * 1.1 + steerAggression * 2.2, -7, 7), clamp(dt * 5, 0, 1));
  busState.heave = lerp(busState.heave, clamp(-busState.acceleration.long * 0.06 + Math.sin(busState.time * 12) * 0.02, -0.2, 0.2), clamp(dt * 2, 0, 1));

  busState.steering.wheelAngle = controls.wheelAngle;
  busState.steering.roadAngle = wheelMap.roadAngleDeg;
  busState.steering.ratio = wheelMap.ratio;

  busState.engineLoad = clamp(driveForceRaw / (computeDriveForce(1, busState.gearIndex, busState.targetRpm, controls.kickdown) + 0.001), 0, 1);

  const rpmResponse = busState.shift.active ? lerp(busState.targetRpm, busState.targetRpm * 0.82, 0.3) : busState.targetRpm;
  busState.rpm = lerp(busState.rpm, rpmResponse, clamp(dt * (controls.kickdown ? 7 : 5), 0, 1));

  if (busState.shift.active && busState.shift.phase === 'latency') {
    busState.rpm *= 0.98;
  }

  busState.stopLamp = busState.brake > 0.9 || busState.brakeHold;

  const prevK = busState.kIndicator;
  const retarderActive = brakeData.retarder > 1;
  busState.retarder = retarderActive;
  busState.retarderForce = brakeData.retarder;
  busState.retarderIntensity = brakeData.retarderIntensity;
  busState.kIndicator = retarderActive;

  if (busState.kIndicator && !prevK) {
    busState.resonance = 0.8;
  }

  busState.tyreSqueal = clamp(
    Math.max(Math.abs(busState.jerk.lat) * 0.12, Math.abs(busState.acceleration.lat) * 0.08) * (busState.speed > 5 ? 1 : 0) +
      brakeAggression * 0.2 * (busState.speed > 6 ? 1 : 0),
    0,
    1
  );
  const serviceShare = brakeData.service / Math.max(BRAKE_FORCE_SERVICE, 1);
  const retarderShare = brakeData.retarderIntensity;
  busState.serviceBrakeRatio = clamp(serviceShare, 0, 1);
  const retarderNoise = retarderShare * clamp((busState.speed - RETARDER_THRESHOLD_SPEED) / 20, 0, 1);
  busState.brakeHiss = clamp(serviceShare * (busState.speed > 3 ? 1 : 0.5) + retarderNoise * 0.45, 0, 1);
  busState.brakeSqueal = clamp(serviceShare * (busState.speed > 4 ? 1 : 0.6) + brakeAggression * 0.45, 0, 1);

  busState.rumble = lerp(busState.rumble, clamp(busState.speed / 30, 0, 1) + Math.abs(busState.acceleration.long) * 0.05, clamp(dt * 2, 0, 1));
  busState.resonance = lerp(busState.resonance, 0, clamp(dt * 1.4, 0, 1));

  updateCamera(dt);
};

export const getBusState = () => busState;

export const resetPhysics = () => {
  Object.assign(busState, structuredClone(defaultState));
};
