export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothDamp = (current, target, velocityRef, smoothTime, maxSpeed, deltaTime) => {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  target = current - change;
  const temp = (velocityRef.value + omega * change) * deltaTime;
  velocityRef.value = (velocityRef.value - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  if ((originalTo - current > 0) === (output > originalTo)) {
    output = originalTo;
    velocityRef.value = (output - originalTo) / deltaTime;
  }
  return output;
};

export const lowPass = (current, target, smoothing, dt) => {
  const alpha = 1 - Math.exp(-smoothing * dt);
  return current + (target - current) * alpha;
};

export const average = (values) => values.reduce((a, b) => a + b, 0) / (values.length || 1);

export const now = () => performance.now();

export const sign = (value) => (value >= 0 ? 1 : -1);

export const wrapDegrees = (deg) => {
  let angle = deg;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
};
