// Every sound is generated locally and the graph is created on a gesture.
import { clamp } from './random.js';

const tones = {
  click: [[455, 0, 0.065, 0.10]],
  reload: [[212, 0, 0.045, 0.13], [328, 0.15, 0.055, 0.14]],
  pickup: [[554, 0, 0.17, 0.13], [740, 0.083, 0.21, 0.11]],
  success: [[392, 0, 0.22, 0.14], [494, 0.13, 0.2, 0.13], [587, 0.26, 0.26, 0.12],
    [784, 0.40, 0.39, 0.13]],
  fail: [[415, 0, 0.21, 0.14], [311, 0.16, 0.24, 0.12], [233, 0.31, 0.35, 0.11]],
};

function noiseBuffer(context) {
  const frames = Math.round(context.sampleRate * 0.17);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const decay = Math.exp(-i / (frames * 0.19));
    samples[i] = (Math.random() * 2 - 1) * decay;
  }
  return buffer;
}

function voice(context, output, type, pitch, filter) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = pitch;
  gain.gain.value = 0;
  if (filter) {
    oscillator.connect(filter);
    filter.connect(gain);
  } else {
    oscillator.connect(gain);
  }
  gain.connect(output);
  oscillator.start();
  return { oscillator, gain };
}

function note(context, output, type, pitch, start, length, volume, attack = 0.014) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = pitch;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(start);
  oscillator.stop(start + length + 0.025);
}

function playShot(context, output, noise) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const now = context.currentTime;
  source.buffer = noise;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5300, now);
  filter.frequency.exponentialRampToValueAtTime(375, now + 0.13);
  gain.gain.value = 0.46;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  source.start();
  note(context, output, 'triangle', 83, now, 0.12, 0.13, 0.006);
}

const titleChords = [
  [130.81, 196.00, 261.63, 329.63],
  [110.00, 164.81, 261.63, 329.63],
  [87.31, 130.81, 220.00, 293.66],
  [98.00, 146.83, 196.00, 293.66],
];

function pad(context, output, index) {
  const chord = titleChords[index % titleChords.length];
  for (const [i, pitch] of chord.entries()) {
    const type = i < 2 ? 'sine' : 'triangle';
    note(context, output, type, pitch, context.currentTime + i * 0.10, 3.2, 0.024, 0.55);
  }
}

export function createAudio() {
  let context;
  let output;
  let engine;
  let siren;
  let motorFilter;
  let noise;
  let ambience;
  let nextPad = 0;
  let chord = 0;

  function activate() {
    const Context = window.AudioContext ?? window.webkitAudioContext;
    if (!Context) return;
    try {
      if (!context) initialize(Context);
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {
      context = null;
    }
  }

  function initialize(Context) {
    context = new Context();
    output = context.createGain();
    output.gain.value = 0.35;
    output.connect(context.destination);
    ambience = context.createGain();
    ambience.connect(output);
    motorFilter = context.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 225;
    engine = voice(context, output, 'sawtooth', 44, motorFilter);
    siren = voice(context, output, 'triangle', 530);
    noise = noiseBuffer(context);
  }

  function cue(name) {
    if (!context || context.state !== 'running') return;
    if (name === 'shot') {
      playShot(context, output, noise);
      return;
    }
    const sequence = tones[name] ?? [];
    for (const [pitch, gap, duration, volume] of sequence) {
      const type = name === 'reload' ? 'square' : 'triangle';
      note(context, output, type, pitch, context.currentTime + gap, duration, volume);
    }
  }

  function update(state) {
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    const live = state.screen === 'play' && state.mission.phase !== 'briefing';
    const speed = live ? state.player.car?.speed : null;
    const pitch = 45 + (speed ?? 0) * 0.45;
    engine.oscillator.frequency.setTargetAtTime(pitch, now, 0.08);
    engine.gain.gain.setTargetAtTime(speed == null ? 0 : 0.088, now, 0.10);
    motorFilter.frequency.setTargetAtTime(165 + (speed ?? 0) * 1.24, now, 0.10);
    let distance = Infinity;
    for (const cop of state.law.cops) {
      if (cop.hp <= 0) continue;
      distance = Math.min(distance, Math.hypot(cop.x - state.player.x, cop.y - state.player.y));
    }
    const sirenPitch = Math.floor(now * 3.5) % 2 ? 680 : 505;
    siren.oscillator.frequency.setTargetAtTime(sirenPitch, now, 0.055);
    const volume = live ? clamp(1 - distance / 385, 0, 1) * 0.1 : 0;
    siren.gain.gain.setTargetAtTime(volume, now, 0.10);
    ambience.gain.setTargetAtTime(state.screen === 'title' ? 1 : 0, now, 0.17);
    if (state.screen === 'title' && now >= nextPad) {
      pad(context, ambience, chord++);
      nextPad = now + 2.8;
    }
  }

  return { activate, cue, update };
}
