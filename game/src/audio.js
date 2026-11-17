// Synthesised sound: every effect and the music loop are built from raw
// oscillators and filtered noise, so the game ships no audio files. Audio
// only starts after a user gesture (or never, in screenshot mode).
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  // A short bass pulse + sparse arp: 8 steps a bar at 132 BPM.
  const BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 73.42, 0, 82.41, 0];
  const ARP = [220, 277.18, 329.63, 440, 329.63, 277.18, 0, 0, 220, 277.18, 392, 440, 523.25, 440, 392, 0];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, duration, type, volume, slideTo, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function noise(duration, volume, filterFreq, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  function musicStep() {
    if (!ctx || muted) return;
    const index = step % 16;
    const bass = BASS[index];
    if (bass) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = bass;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
    const arp = ARP[index];
    if (arp && step % 2 === 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = arp * 2;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    }
    step += 1;
  }

  return {
    get muted() { return muted; },
    unlock() {
      if (ensure()) {
        if (!musicTimer) musicTimer = window.setInterval(musicStep, 113);
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() { tone(880, 0.07, 'square', 0.10, 320); },
    enemyShoot() { tone(220, 0.12, 'sawtooth', 0.06, 140); },
    snipe() {
      // The Longshot's bolt: a crack that drops in pitch as it passes.
      tone(1500, 0.11, 'square', 0.10, 240);
      noise(0.06, 0.06, 3200);
    },
    dash() {
      // A whoosh of displaced air, bright and quick.
      noise(0.16, 0.16, 2400);
      tone(280, 0.16, 'sine', 0.14, 920);
    },
    explode(big) {
      noise(big ? 0.5 : 0.28, big ? 0.5 : 0.3, big ? 900 : 1400);
      tone(big ? 120 : 160, 0.25, 'sine', 0.35, 40);
    },
    pickup() { tone(660 + Math.random() * 120, 0.09, 'sine', 0.12, 990); },
    hurt() {
      tone(140, 0.22, 'sawtooth', 0.3, 60);
      noise(0.15, 0.2, 600);
    },
    levelUp() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.16, 'triangle', 0.2, null, i * 0.07));
    },
    comboUp(mult) {
      // A rising blip that climbs with the multiplier it celebrates.
      const base = 440 + mult * 110;
      tone(base, 0.1, 'triangle', 0.18, base * 1.5);
      tone(base * 1.5, 0.12, 'triangle', 0.14, base * 2, 0.05);
    },
    bossAlarm() {
      tone(98, 0.5, 'sawtooth', 0.25, 196);
      tone(98, 0.5, 'sawtooth', 0.25, 196, 0.55);
    },
    gameOver() {
      [392, 311.13, 233.08, 155.56].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, null, i * 0.16));
    },
    click() { tone(1200, 0.05, 'sine', 0.12, 900); },
  };
}
