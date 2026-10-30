/**
 * Loads the game's big painted images before the first screen shows, so backgrounds and board
 * frames never pop in. The menu and battle backdrops and the first two board sizes are awaited
 * (up to a time limit); the larger boards load right after, before the player can reach them.
 */
import worldBg from '../assets/medieval_world_bg.webp';
import dungeonBg from '../assets/dungeon_stage_bg.webp';
import board3 from '../assets/board_3x3.webp';
import board4 from '../assets/board_4x4.webp';
import board5 from '../assets/board_5x5.webp';
import board6 from '../assets/board_6x6.webp';
import board7 from '../assets/board_7x7.webp';
import board8 from '../assets/board_8x8.webp';

const FIRST = [worldBg, dungeonBg, board3, board4];
const LATER = [board5, board6, board7, board8];
const MAX_WAIT_MS = 4000;
// A failed image is tried again after these waits, for a dropped connection on mobile
const RETRY_DELAYS_MS = [400, 1200];

// Decoded images are kept so the browser doesn't drop them before the CSS uses them
const kept = [];

function load(url, attempt = 0) {
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => {
      kept.push(img);
    },
    () => {
      // Out of retries, the image just shows late; never block the game on it
      if (attempt >= RETRY_DELAYS_MS.length) return;
      return new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt])).then(() =>
        load(url, attempt + 1)
      );
    }
  );
}

// Fills the loading bar in index.html. The page and the game's script are the first slice; each
// awaited image adds an equal share of the rest.
function setProgress(fraction) {
  const bar = document.querySelector('.boot-bar');
  if (!bar) return;
  bar.style.setProperty('--boot-progress', String(fraction));
  bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
}

export function preloadArt() {
  const SCRIPT_SHARE = 0.25;
  let done = 0;
  setProgress(SCRIPT_SHARE);
  const first = Promise.all(
    FIRST.map((url) =>
      load(url).then(() => {
        done += 1;
        setProgress(SCRIPT_SHARE + ((1 - SCRIPT_SHARE) * done) / FIRST.length);
      })
    )
  );
  const timeout = new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS));
  return Promise.race([first, timeout]).then(() => {
    setProgress(1);
    LATER.forEach((url) => load(url));
  });
}
