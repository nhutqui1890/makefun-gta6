// Solmar Nights — deterministic seeded random numbers.
// The city, traffic colours and pedestrian routes all draw from one seeded
// stream, so the same seed always builds the same Solmar Bay (and the
// screenshot scenes stage identically every run).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1337) {
    this.next = mulberry32(seed);
  }
  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }
  // Integer in [min, max] inclusive.
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  // One element of an array.
  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }
  // True with probability p.
  chance(p) {
    return this.next() < p;
  }
}

// Clamp a value into [min, max].
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Linear interpolation.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed angular difference between two headings, in radians.
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Ease-out curve for camera blends and UI pops.
export function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
