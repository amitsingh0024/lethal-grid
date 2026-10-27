/**
 * Background music: one looping track for the menus and one for battle, from public/music.
 * Music starts after the first tap or key press (browsers block sound before one) and goes
 * quiet while the tab is hidden or an ad plays.
 */

const BASE = import.meta.env.BASE_URL;
const TRACKS = {
  menu: `${BASE}music/menu.mp3`,
  battle: `${BASE}music/battle.mp3`,
};
const VOLUME = 0.32;
const FADE_MS = 700;

const players = {};
let wanted = null;
let enabled = true;
let paused = false;
let unlocked = false;

const isHidden = () => typeof document !== 'undefined' && document.hidden;

// Starting a fade cancels the element's previous one
function fadeTo(el, to, done) {
  const from = el.volume;
  const start = performance.now();
  const id = (el.fadeId = (el.fadeId || 0) + 1);
  const step = (now) => {
    if (el.fadeId !== id) return;
    const k = Math.min(1, (now - start) / FADE_MS);
    el.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function getPlayer(name) {
  if (!players[name]) {
    const el = new Audio(TRACKS[name]);
    el.loop = true;
    el.volume = 0;
    el.preload = 'auto';
    players[name] = el;
  }
  return players[name];
}

function sync() {
  if (typeof window === 'undefined') return;
  const audible = enabled && unlocked && !paused && !isHidden();
  for (const [name, el] of Object.entries(players)) {
    if (name === wanted && audible) continue;
    // Hidden tab or an ad: stop at once. A track change: fade the old one out.
    if (!audible) el.pause();
    else if (!el.paused) fadeTo(el, 0, () => name !== wanted && el.pause());
  }
  if (!audible || !wanted) return;
  const el = getPlayer(wanted);
  if (el.paused) {
    el.play()
      .then(() => fadeTo(el, VOLUME))
      .catch(() => {
        // Blocked or failed to load: the game plays fine without music
      });
  } else {
    fadeTo(el, VOLUME);
  }
}

// The track the current screen wants: 'menu', 'battle', or null for silence
export function setMusicTrack(name) {
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
  document.addEventListener('visibilitychange', sync);
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    sync();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
