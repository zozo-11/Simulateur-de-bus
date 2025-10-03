import { clamp, lerp } from './utils.js';

let audioContext;
let masterGain;
let engineOsc;
let engineGain;
let engineFilter;
let noiseNode;
let noiseGain;
let brakeNoiseGain;
let brakeNoiseFilter;
let retarderNoiseGain;
let retarderFilter;
let tyreNoiseGain;
let tyreFilter;
let resonanceGain;
let started = false;

const createNoiseBuffer = (context) => {
  const buffer = context.createBuffer(1, context.sampleRate * 1.5, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

const ensureAudio = async () => {
  if (started) return;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.8;
  masterGain.connect(audioContext.destination);

  engineOsc = audioContext.createOscillator();
  engineOsc.type = 'sawtooth';
  engineGain = audioContext.createGain();
  engineGain.gain.value = 0;
  engineFilter = audioContext.createBiquadFilter();
  engineFilter.type = 'bandpass';
  engineFilter.Q.value = 1.6;
  engineFilter.frequency.value = 200;

  engineOsc.connect(engineGain);
  engineGain.connect(engineFilter);
  engineFilter.connect(masterGain);

  const noiseBuffer = createNoiseBuffer(audioContext);
  noiseNode = audioContext.createBufferSource();
  noiseNode.buffer = noiseBuffer;
  noiseNode.loop = true;
  noiseGain = audioContext.createGain();
  noiseGain.gain.value = 0.02;
  noiseNode.connect(noiseGain);
  noiseGain.connect(masterGain);

  brakeNoiseGain = audioContext.createGain();
  brakeNoiseGain.gain.value = 0;
  brakeNoiseFilter = audioContext.createBiquadFilter();
  brakeNoiseFilter.type = 'highpass';
  brakeNoiseFilter.frequency.value = 1200;
  brakeNoiseFilter.Q.value = 0.7;
  noiseNode.connect(brakeNoiseFilter);
  brakeNoiseFilter.connect(brakeNoiseGain);
  brakeNoiseGain.connect(masterGain);

  retarderNoiseGain = audioContext.createGain();
  retarderNoiseGain.gain.value = 0;
  retarderFilter = audioContext.createBiquadFilter();
  retarderFilter.type = 'bandpass';
  retarderFilter.frequency.value = 600;
  retarderFilter.Q.value = 2.2;
  noiseNode.connect(retarderFilter);
  retarderFilter.connect(retarderNoiseGain);
  retarderNoiseGain.connect(masterGain);

  tyreNoiseGain = audioContext.createGain();
  tyreNoiseGain.gain.value = 0;
  tyreFilter = audioContext.createBiquadFilter();
  tyreFilter.type = 'bandpass';
  tyreFilter.frequency.value = 1400;
  tyreFilter.Q.value = 4;
  noiseNode.connect(tyreFilter);
  tyreFilter.connect(tyreNoiseGain);
  tyreNoiseGain.connect(masterGain);

  resonanceGain = audioContext.createGain();
  resonanceGain.gain.value = 0;
  const resonanceFilter = audioContext.createBiquadFilter();
  resonanceFilter.type = 'lowpass';
  resonanceFilter.frequency.value = 320;
  resonanceFilter.Q.value = 1.2;
  noiseNode.connect(resonanceFilter);
  resonanceFilter.connect(resonanceGain);
  resonanceGain.connect(masterGain);

  engineOsc.start();
  noiseNode.start();
  started = true;
};

export const unlockAudio = () => {
  ensureAudio().catch(() => {});
};

export const updateAudio = (busState) => {
  if (!started || !audioContext) return;
  const rpm = busState.rpm;
  const throttle = busState.throttle;
  const gearFactor = busState.shift.active ? 0.6 : 1;
  const load = busState.engineLoad;

  const freq = lerp(70, 520, clamp((rpm - 6000) / 19000, 0, 1));
  engineOsc.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.05);
  const filterTarget = lerp(280, 1400 + (busState.kickdownActive ? 160 : 0), clamp((rpm - 8000) / 17000, 0, 1));
  engineFilter.frequency.setTargetAtTime(filterTarget, audioContext.currentTime, 0.06);
  const gainValue = clamp(lerp(0.08, 0.28 + (busState.kickdownActive ? 0.05 : 0), throttle) * gearFactor + load * 0.22, 0, 0.46);
  engineGain.gain.setTargetAtTime(gainValue, audioContext.currentTime, 0.08);

  const serviceNoise = clamp(busState.serviceBrakeRatio * (busState.speed > 3 ? 1 : 0.6), 0, 1);
  const hiss = clamp(busState.brakeHiss * (busState.speed > 4 ? 1 : 0.6), 0, 1);
  brakeNoiseGain.gain.setTargetAtTime((serviceNoise * 0.35 + hiss * 0.18), audioContext.currentTime, 0.05);

  const retarderLevel = clamp(busState.retarderIntensity * clamp((busState.speed * 3.6 - 15) / 45, 0, 1.1), 0, 1);
  retarderNoiseGain.gain.setTargetAtTime(retarderLevel * 0.4, audioContext.currentTime, 0.08);
  retarderFilter.frequency.setTargetAtTime(lerp(520, 1100, retarderLevel), audioContext.currentTime, 0.08);

  const squeal = clamp(busState.brakeSqueal + busState.tyreSqueal * 0.6, 0, 1);
  tyreNoiseGain.gain.setTargetAtTime(squeal * 0.5, audioContext.currentTime, 0.05);
  tyreFilter.frequency.setTargetAtTime(lerp(900, 2300, clamp(busState.tyreSqueal, 0, 1)), audioContext.currentTime, 0.04);

  resonanceGain.gain.setTargetAtTime(clamp(busState.resonance * 0.5, 0, 0.35), audioContext.currentTime, 0.2);

  const ambience = clamp(busState.rumble * 0.06 + busState.speed * 0.002, 0, 0.12);
  noiseGain.gain.setTargetAtTime(ambience, audioContext.currentTime, 0.2);
};
