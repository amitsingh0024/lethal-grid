/**
 * Synthesized sound effects. Every sound is built from layered oscillators and a shared noise
 * buffer, so there is nothing to download. All voices run through one compressor so a big chain
 * reaction gets louder and denser without clipping.
 */

let audio = null;

const isHidden = () => typeof document !== 'undefined' && document.hidden;

function getAudio() {
  if (typeof window === 'undefined') return null;
  if (audio) {
    if (audio.ctx.state === 'suspended' && !isHidden()) audio.ctx.resume();
    return audio;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  compressor.connect(master);
  master.connect(ctx.destination);

  // One second of white noise, reused by every impact
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  audio = { ctx, out: compressor, noise };
  if (ctx.state === 'suspended') ctx.resume();
  return audio;
}

function envelope(gainNode, t, peak, attack, release) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

function tone(a, { type = 'sine', from, to = from, t, peak, attack = 0.004, release, detune = 0 }) {
  const osc = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + attack + release);
  envelope(gain, t, peak, attack, release);
  osc.connect(gain);
  gain.connect(a.out);
  osc.start(t);
  osc.stop(t + attack + release + 0.02);
}

function noiseBurst(a, { t, peak, release, filter = 'lowpass', freq = 1200, toFreq = freq, q = 0.8 }) {
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  const biquad = a.ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(freq, t);
  if (toFreq !== freq) biquad.frequency.exponentialRampToValueAtTime(toFreq, t + release);
  const gain = a.ctx.createGain();
  envelope(gain, t, peak, 0.003, release);
  src.connect(biquad);
  biquad.connect(gain);
  gain.connect(a.out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + release + 0.05);
}

// A minor pentatonic run, so each chain link climbs a step and long chains still sound musical
const CHAIN_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const semis = (n) => Math.pow(2, n / 12);

const SOUNDS = {
  // Weapon connects: a thud with a crack of noise on top
  hit(a, t, { kills = 0, weapon }) {
    const heavy = weapon === 'nova_bomb';
    tone(a, { type: 'triangle', from: heavy ? 140 : 190, to: 60, t, peak: 0.32, release: 0.16 });
    noiseBurst(a, { t, peak: 0.22, release: 0.09, filter: 'bandpass', freq: heavy ? 900 : 2400, toFreq: 500, q: 1.2 });
    if (kills > 0) {
      // Bright crunch when something dies
      noiseBurst(a, { t: t + 0.015, peak: 0.16, release: 0.14, filter: 'highpass', freq: 1800 });
      tone(a, { type: 'square', from: 520, to: 260, t: t + 0.01, peak: 0.05, release: 0.08 });
    }
  },
  // Chain link explosion; depth raises the pitch so combos build tension
  chain(a, t, { depth = 1, lightning = false }) {
    const step = semis(CHAIN_SCALE[Math.min(depth - 1, CHAIN_SCALE.length - 1)]);
    if (lightning) {
      noiseBurst(a, { t, peak: 0.24, release: 0.16, filter: 'highpass', freq: 3000, toFreq: 1200 });
      tone(a, { type: 'sawtooth', from: 880 * step, to: 220 * step, t, peak: 0.07, release: 0.14 });
    } else {
      tone(a, { type: 'sine', from: 120, to: 38, t, peak: 0.45, attack: 0.006, release: 0.34 });
      noiseBurst(a, { t, peak: 0.3, release: 0.3, freq: 1600, toFreq: 200 });
    }
    // The rising note that makes chains feel like a combo
    tone(a, { type: 'triangle', from: 330 * step, t: t + 0.01, peak: 0.1, release: 0.18 });
    tone(a, { type: 'sine', from: 660 * step, t: t + 0.01, peak: 0.04, release: 0.12 });
  },
  crit(a, t) {
    tone(a, { type: 'square', from: 1320, to: 1760, t, peak: 0.06, release: 0.07 });
    tone(a, { type: 'sine', from: 2640, t: t + 0.02, peak: 0.05, release: 0.18 });
    noiseBurst(a, { t, peak: 0.12, release: 0.05, filter: 'highpass', freq: 4000 });
  },
  lucky(a, t) {
    [0, 4, 7, 12].forEach((n, i) =>
      tone(a, { type: 'triangle', from: 784 * semis(n), t: t + i * 0.045, peak: 0.07, release: 0.12 })
    );
  },
  // Board cleared: big boom, then a brass-like major arpeggio
  clear(a, t) {
    tone(a, { type: 'sine', from: 90, to: 32, t, peak: 0.5, release: 0.5 });
    noiseBurst(a, { t, peak: 0.25, release: 0.45, freq: 2000, toFreq: 150 });
    [0, 4, 7, 12, 16].forEach((n, i) => {
      const at = t + 0.12 + i * 0.085;
      tone(a, { type: 'sawtooth', from: 293.66 * semis(n), t: at, peak: 0.05, attack: 0.01, release: 0.32 });
      tone(a, { type: 'triangle', from: 293.66 * semis(n), t: at, peak: 0.09, attack: 0.01, release: 0.36, detune: 6 });
    });
  },
  // Volleys ran out
  defeat(a, t) {
    [0, -3, -7].forEach((n, i) =>
      tone(a, { type: 'triangle', from: 220 * semis(n), t: t + i * 0.16, peak: 0.1, attack: 0.01, release: 0.3 })
    );
  },
  upgrade(a, t) {
    // Anvil clink: inharmonic partials plus a quick tick of noise
    [1, 2.76, 5.4].forEach((m, i) =>
      tone(a, { type: 'sine', from: 880 * m, t, peak: 0.12 / (i + 1), release: 0.35 / (i + 1) })
    );
    noiseBurst(a, { t, peak: 0.1, release: 0.03, filter: 'highpass', freq: 5000 });
    tone(a, { type: 'triangle', from: 1320, t: t + 0.08, peak: 0.06, release: 0.2 });
  },
  tap(a, t) {
    tone(a, { type: 'triangle', from: 620, to: 480, t, peak: 0.06, release: 0.04 });
  },
};

// Silences the game while a video ad plays, so the two never talk over each other
let paused = false;

function syncAudioState() {
  try {
    if (!audio) return;
    if (paused || isHidden()) audio.ctx.suspend();
    else audio.ctx.resume();
  } catch {
    // Ignore audio state errors
  }
}

export function setSfxPaused(value) {
  paused = value;
  syncAudioState();
}

// Go silent while the tab is hidden; portals test this by switching tabs mid-game
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', syncAudioState);
}

export function playSfx(name, muted, opts = {}) {
  if (muted || paused || isHidden()) return;
  try {
    const a = getAudio();
    const sound = SOUNDS[name];
    if (!a || !sound) return;
    sound(a, a.ctx.currentTime + 0.005, opts);
  } catch {
    // Audio can be blocked until the first user gesture; the game plays fine without it
  }
}
