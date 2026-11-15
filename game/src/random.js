// Deterministic random numbers. Every roll the game makes goes through one
// of these so a fixed seed replays the same run: the screenshot scenes and
// the soak test both depend on it.
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // One element of an array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // Angle in [0, 2 PI).
    angle() {
      return next() * Math.PI * 2;
    },
  };
}
