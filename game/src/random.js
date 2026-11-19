import { TAU } from './config.js';

// Mulberry32 keeps world populations and capture runs reproducible.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function roll() {
    state = (state + 0x6d2b79f5) >>> 0;
    let bits = Math.imul(state ^ (state >>> 15), state | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + (max - min) * rng();
}

export function integer(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

export function choice(rng, values) {
  return values[integer(rng, 0, values.length - 1)];
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function mix(a, b, weight) {
  return a + (b - a) * weight;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angleDelta(from, to) {
  const delta = (to - from) % TAU;
  if (delta > Math.PI) return delta - TAU;
  if (delta < -Math.PI) return delta + TAU;
  return delta;
}

export function lengthSquared(x, y) {
  return x * x + y * y;
}
