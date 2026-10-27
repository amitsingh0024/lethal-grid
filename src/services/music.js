/**
 * Background music: one looping track for the menus and one for battle, from public/music.
 * Both tracks are decoded once and run side by side through Web Audio, so a screen change is a
 * crossfade between two gains: no gap while a file loads, no restart, no clicks at the loop
 * point. Music starts after the first tap or key press (browsers block sound before one) and
 * goes quiet while the tab is hidden or an ad plays.
 */

const BASE = import.meta.env.BASE_URL;
const TRACKS = {
  menu: { url: `${BASE}music/menu.mp3`, loop: 32 },
  // 16 bars at 132 bpm
  battle: { url: `${BASE}music/battle.mp3`, loop: (16 * 4 * 60) / 132 },
};
const VOLUME = 0.32;
const FADE_S = 1.4;

let ctx = null;
const voices = {};
let wanted = null;
let enabled = true;
let paused = false;
let suspendTimer = null;

const isHidden = () => typeof document !== 'undefined' && document.hidden;

// Fetched as soon as the page has settled, so the first crossfade never waits on the network
const bytes = {};
function fetchTracks() {
  for (const [name, { url }] of Object.entries(TRACKS)) {
    bytes[name] ||= fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
  }
}

// Equal-power fade from the gain's current value, so a crossfade has no dip in the middle and a
// fade that is cut short picks up where it was
function fadeGain(param, to) {
  const now = ctx.currentTime;
  const from = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);
  if (Math.abs(from - to) < 0.001) return;
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const v =
      to > from
        ? from + (to - from) * Math.sin((k * Math.PI) / 2)
        : to + (from - to) * Math.cos((k * Math.PI) / 2);
    param.linearRampToValueAtTime(v, now + FADE_S * k);
  }
}

function startVoice(name) {
  if (voices[name]) return;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  voices[name] = { gain, source: null };
  bytes[name]
    .then((data) => (data ? ctx.decodeAudioData(data) : null))
    .then((buffer) => {
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = Math.min(buffer.duration, TRACKS[name].loop);
      source.connect(gain);
      source.start();
      voices[name].source = source;
      sync();
    })
    .catch(() => {
      // Undecodable or blocked: the game plays fine without music
    });
}

function sync() {
  if (!ctx) return;
  clearTimeout(suspendTimer);
  if (paused || isHidden()) {
    // Hidden tab or an ad: freeze at once, and carry on from the same spot afterwards
    ctx.suspend().catch(() => {});
    return;
  }
  ctx.resume().catch(() => {});
  for (const [name, voice] of Object.entries(voices)) {
    fadeGain(voice.gain.gain, enabled && name === wanted && voice.source ? VOLUME : 0);
  }
  // Music switched off or no track wanted: let the fade finish, then stop using the CPU
  if (!enabled || !wanted) {
    suspendTimer = setTimeout(() => ctx.suspend().catch(() => {}), FADE_S * 1000 + 100);
  }
}

// The track the current screen wants: 'menu', 'battle', or null for silence
export function setMusicTrack(name) {
  if (name === wanted) return;
  wanted = name;
  sync();
}

export function setMusicEnabled(value) {
  enabled = value;
  sync();
}

// Held while an ad plays
export function setMusicPaused(value) {
  paused = value;
  sync();
}

if (typeof window !== 'undefined') {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (document.readyState === 'complete') setTimeout(fetchTracks, 500);
  else window.addEventListener('load', () => setTimeout(fetchTracks, 500), { once: true });
  document.addEventListener('visibilitychange', sync);
  const unlock = () => {
    if (ctx || !AudioCtx) return;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    try {
      ctx = new AudioCtx();
    } catch {
      return;
    }
    fetchTracks();
    Object.keys(TRACKS).forEach(startVoice);
    sync();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
