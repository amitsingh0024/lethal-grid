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

// Decoded images are kept so the browser doesn't drop them before the CSS uses them
const kept = [];

function load(url) {
  const img = new Image();
  img.src = url;
  kept.push(img);
  return img.decode().catch(() => {
    // A failed image just shows late; never block the game on it
  });
}

export function preloadArt() {
  const first = Promise.all(FIRST.map(load));
  const timeout = new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS));
  return Promise.race([first, timeout]).then(() => {
    LATER.forEach(load);
  });
}
