import React from 'react';
import { NODE_TYPES } from '../game/engine';

// Pixel-art sprites for the hero, raiders and weapons. Each sprite is a grid of palette keys,
// one row per string, with one or two frames for the idle animation.

const PALETTE = {
  '.': null,
  K: '#141013', // Outline
  W: '#fffdf7', // Highlight white
  S: '#d4dce6', // Steel blade light
  s: '#8b9bb4', // Steel blade shadow
  I: '#4b5563', // Dark iron
  G: '#fbbf24', // Bright gold
  g: '#b45309', // Shadow gold / bronze
  B: '#854d0e', // Oak wood light
  b: '#451a03', // Oak wood dark
  R: '#ef4444', // Crimson red
  r: '#991b1b', // Dark red
  O: '#f97316', // Flame orange
  Y: '#fde047', // Spark yellow
  E: '#65a30d', // Goblin green
  e: '#365314', // Goblin dark green
  M: '#10b981', // Emerald magic
  m: '#065f46', // Dark emerald
  C: '#38bdf8', // Lightning cyan
  c: '#1d4ed8', // Deep mage blue
  F: '#fdba74', // Peach skin
  f: '#c2410c', // Skin shadow
  P: '#a855f7', // Royal purple
};

const PIXEL_MATRICES = {
  // Sir Aldric, the knight in the stage banner
  HERO_IDLE_0: [
    '.....KKKKKK.....',
    '....KRRRRRRK....',
    '.....KSSSSK.....',
    '....KSSSSSSK....',
    '....KSKKKKSSK...',
    '....KSKFFKSSK...',
    '....KSSSSSSSK...',
    '...KKGGGGGGKK...',
    '..KSSRRRRRRSSK..',
    '..KSsRGGGGRsSK..',
    '..KSsRRRRRRsSK..',
    '...KKbbbbbbKK...',
    '....KSSKKSSK....',
    '....KssKKssK....',
    '....KbbKKbbK....',
    '....KKKKKKKK....',
  ],
  HERO_IDLE_1: [
    '................',
    '.....KKKKKK.....',
    '....KRRRRRRK....',
    '.....KSSSSK.....',
    '....KSSSSSSK....',
    '....KSKKKKSSK...',
    '....KSKFFKSSK...',
    '...KKGGGGGGKK...',
    '..KSSRRRRRRSSK..',
    '..KSsRGGGGRsSK..',
    '..KSsRRRRRRsSK..',
    '...KKbbbbbbKK...',
    '....KSSKKSSK....',
    '....KssKKssK....',
    '....KbbKKbbK....',
    '....KKKKKKKK....',
  ],

  // Goblin
  GOBLIN_0: [
    '.....KKKKKK.....',
    '....KssssssK....',
    '...KSSSSSSSSK...',
    '..KKKKKKKKKKKK..',
    '.KEeKYYYYYYKeEK.',
    'KEeeKeKYYKeKeeEK',
    '.KKKKeeeeeeKKKK.',
    '...KeeeeeeeeK...',
    '..KBBBBKKbbbbK..',
    '.KBGGGGBKbbbbSK.',
    '.KBGGGGBKbbbSSK.',
    '..KBBBBKKbbSSK..',
    '...KeeeKKeeeK...',
    '...KeeeKKeeeK...',
    '...KbbbKKbbbK...',
    '...KKKKKKKKKK...',
  ],
  GOBLIN_1: [
    '................',
    '.....KKKKKK.....',
    '....KssssssK....',
    '...KSSSSSSSSK...',
    '..KKKKKKKKKKKK..',
    '.KEeKYYYYYYKeEK.',
    'KEeeKeKYYKeKeeEK',
    '.KKKKeeeeeeKKKK.',
    '..KBBBBKKbbbbK..',
    '.KBGGGGBKbbbSSK.',
    '.KBGGGGBKbbSSSK.',
    '..KBBBBKKbSSK...',
    '...KeeeKKeeeK...',
    '...KeeeKKeeeK...',
    '...KbbbKKbbbK...',
    '...KKKKKKKKKK...',
  ],

  // Sapper (powder keg)
  BOMB_0: [
    '........KKYOY...',
    '.......KbbYWOY..',
    '......Kbb..YOY..',
    '....KKKKKKKK....',
    '...KBBBBBBBBK...',
    '..KssssssssssK..',
    '..KIIIIIIIIIIK..',
    '..KBBbRRRRbBBK..',
    '..KBBROYYORBBK..',
    '..KBBROWWORBBK..',
    '..KBBbRRRRbBBK..',
    '..KssssssssssK..',
    '..KIIIIIIIIIIK..',
    '...KbbbbbbbbK...',
    '....KKKKKKKK....',
    '................',
  ],
  BOMB_1: [
    '.......YOYKK....',
    '......YWOYKb....',
    '......YOYKbb....',
    '....KKKKKKKK....',
    '...KBBBBBBBBK...',
    '..KssssssssssK..',
    '..KIIIIIIIIIIK..',
    '..KBBbOOOOObBK..',
    '..KBBOYYYYOBBK..',
    '..KBBOWWWWOBBK..',
    '..KBBbOOOOObBK..',
    '..KssssssssssK..',
    '..KIIIIIIIIIIK..',
    '...KbbbbbbbbK...',
    '....KKKKKKKK....',
    '................',
  ],

  // Shaman
  CONDUIT_0: [
    '.....KKKKKK.....',
    '....KccccccK...Y',
    '...KccccccccK.YW',
    '..KccKKKKKKccKYW',
    '..KcKKYYYYKKcK.Y',
    '..KcKKKKKKKKcK.K',
    '...KccccccccK..K',
    '..KccGGGGGGccK.K',
    '..KcccCCCCcccKKK',
    '..KccCCWWCCccBbK',
    '...KcccCCcccK.K.',
    '...KccccccccK.K.',
    '....KccccccK..K.',
    '....KccKKccK..K.',
    '....KbbKKbbK..K.',
    '....KKKKKKKK..K.',
  ],
  CONDUIT_1: [
    '..............Y.',
    '.....KKKKKK..YWY',
    '....KccccccK..Y.',
    '...KccccccccK.K.',
    '..KccKKKKKKccKK.',
    '..KcKKWWWWKKcKK.',
    '..KcKKKKKKKKcK.K',
    '..KccGGGGGGccK.K',
    '..KcccYYYYcccKKK',
    '..KccYYWWYYccBbK',
    '...KcccYYcccK.K.',
    '...KccccccccK.K.',
    '....KccccccK..K.',
    '....KccKKccK..K.',
    '....KbbKKbbK..K.',
    '....KKKKKKKK..K.',
  ],

  // Herald
  AMPLIFIER_0: [
    '...KKK..........',
    '..KGGGK.........',
    '...KBKKKKKKKKK..',
    '...KBKMMMMMMMK..',
    '...KBKMGGGGGMK..',
    '...KBKMGWWWGMK..',
    '...KBKMGWWWGMK..',
    '...KBKMGGGGGMK..',
    '...KBKMMMMMMK...',
    '...KBKMMMMMK....',
    '...KBKKKKKK.....',
    '...KBK..........',
    '...KBK..........',
    '..KbbbK.........',
    '.KbbbbbK........',
    '.KKKKKKK........',
  ],
  AMPLIFIER_1: [
    '...KKK..........',
    '..KYYYK.........',
    '...KBKKKKKKKKK..',
    '...KBKmmmmmmmK..',
    '...KBKmYYYYYmK..',
    '...KBKmYWWWYmk..',
    '...KBKmYWWWYmk..',
    '...KBKmYYYYYmK..',
    '...KBKmmmmmmK...',
    '...KBKmmmmmk....',
    '...KBKKKKKK.....',
    '...KBK..........',
    '...KBK..........',
    '..KbbbK.........',
    '.KbbbbbK........',
    '.KKKKKKK........',
  ],

  // Ogre
  BOSS_0: [
    '.KK..KKKKKK..KK.',
    'KWWKKGGGGGGKKWWK',
    'KWssKGGGGGGKssWK',
    '.KssKKKKKKKKssK.',
    '..KSSSSSSSSSSK..',
    '..KSsRRRRRRsSK..',
    '..KSsRWWWWWRsK..',
    '..KSSSSSSSSSSK..',
    '.KKIIIIIIIIIIKK.',
    'KGGGGGGGGGGGGGGK',
    'KRRRRRRRRRRRRRRK',
    'KrrGGGGGGGGGGrrK',
    '.KKIIIIIIIIIIKK.',
    '..KIIIIKKIIIIK..',
    '..KbbbbKKbbbbK..',
    '..KKKKKKKKKKKK..',
  ],
  BOSS_1: [
    '................',
    '.KK..KKKKKK..KK.',
    'KWWKKYYYYYYKKWWK',
    'KWssKGGGGGGKssWK',
    '.KssKKKKKKKKssK.',
    '..KSSSSSSSSSSK..',
    '..KSsOOOOOOsSK..',
    '..KSsOWWWWWOsK..',
    '.KKIIIIIIIIIIKK.',
    'KGGGGGGGGGGGGGGK',
    'KRRRRRRRRRRRRRRK',
    'KrrGGGGGGGGGGrrK',
    '.KKIIIIIIIIIIKK.',
    '..KIIIIKKIIIIK..',
    '..KbbbbKKbbbbK..',
    '..KKKKKKKKKKKK..',
  ],

  // Weapons
  WEAPON_BALLISTA: [
    '.......KK.......',
    '......KWWK......',
    '.....KSSSSK.....',
    '....KKKKKKKK....',
    '..KKGGGGGGGGKK..',
    '.KGGGGKKKKGGGGK.',
    'KGGK..KBBK..KGGK',
    'KGK...KBBK...KGK',
    'KssKKKKKKKKKKssK',
    '.KKKKKKBBKKKKKK.',
    '......KBBK......',
    '......KBBK......',
    '.....KbbbbK.....',
    '.....KGGGGK.....',
    '......KKKK......',
    '................',
  ],

  WEAPON_FLASK: [
    '......KKKK......',
    '.....KBBBBK.....',
    '.....KbbbbK.....',
    '....KKKKKKKK....',
    '.....KSSSSK.....',
    '....KSSOOSSK....',
    '...KSOOOOOOSK...',
    '..KSOOYYYYOOSK..',
    '..KSOYWWWWYOSK..',
    '..KSOYWWWWYOSK..',
    '..KSOOYYYYOOSK..',
    '...KSOOOOOOSK...',
    '....KRRRRRRK....',
    '.....KKKKKK.....',
    '................',
    '................',
  ],

  WEAPON_HAMMER: [
    '....KKKKKKKK....',
    '..KKSSSSSSSSKK..',
    '.KSSGGGGGGGGSSK.',
    '.KSSGYYYYYYGSSK.',
    '.KSSGYWWWWYGSSK.',
    '.KSSGGGGGGGGSSK.',
    '..KKssssssssKK..',
    '....KKKKKKKK....',
    '......KBBK......',
    '......KbbK......',
    '......KBBK......',
    '......KbbK......',
    '......KBBK......',
    '.....KGGGGK.....',
    '......KKKK......',
    '................',
  ],

  WEAPON_SWORD: [
    '............KKK.',
    '...........KWWWK',
    '..........KSSSWK',
    '.........KSSSSK.',
    '........KSSSSK..',
    '.......KSSSSK...',
    '......KSSSSK....',
    '...KKKSSSSK.....',
    '..KGGGSSSK......',
    '...KGGGGK.......',
    '....KBBGGGGK....',
    '...KbbK.KKK.....',
    '..KbbK..........',
    '.KGGK...........',
    '.KKK............',
    '................',
  ],
};

const FRAME_PX = 64;
const spriteSheetCache = new Map();

function drawMatrix(ctx, matrix, offsetX, scale = 4) {
  for (let r = 0; r < matrix.length; r++) {
    const rowStr = matrix[r];
    for (let c = 0; c < rowStr.length; c++) {
      const hex = PALETTE[rowStr[c]];
      if (hex) {
        ctx.fillStyle = hex;
        ctx.fillRect(offsetX + c * scale, r * scale, scale, scale);
      }
    }
  }
}

/**
 * Rasterizes a sprite's frames side by side into one image, once per sprite for the whole session.
 * Every tile showing that creature reuses the same image, so idle animation costs no JS or canvas work.
 */
function getSpriteSheet(frame0, frame1) {
  const key = `${frame0}|${frame1 || ''}`;
  const cached = spriteSheetCache.get(key);
  if (cached) return cached;

  const m0 = PIXEL_MATRICES[frame0] || PIXEL_MATRICES.GOBLIN_0;
  const m1 = frame1 && frame1 !== frame0 ? PIXEL_MATRICES[frame1] || m0 : null;
  const frames = m1 ? 2 : 1;

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_PX * frames;
  canvas.height = FRAME_PX;
  const ctx = canvas.getContext('2d');
  drawMatrix(ctx, m0, 0);
  if (m1) drawMatrix(ctx, m1, FRAME_PX);

  const sheet = { url: canvas.toDataURL('image/png'), frames };
  spriteSheetCache.set(key, sheet);
  return sheet;
}

/**
 * One shared clock flips every sprite between its two frames by toggling an attribute on <html>.
 * A per-sprite CSS animation or timer is re-evaluated every frame for each of up to 64 tiles;
 * this costs one style pass three times a second. It stays still for reduced-motion users.
 */
const SPRITE_FPS = 3;
let spriteClockStarted = false;

function ensureSpriteClock() {
  if (spriteClockStarted || typeof window === 'undefined') return;
  spriteClockStarted = true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement;
  setInterval(() => {
    if (document.hidden) return;
    root.dataset.spriteFrame = root.dataset.spriteFrame === '1' ? '0' : '1';
  }, 1000 / SPRITE_FPS);
}

export function PixelSprite({
  frame0,
  frame1,
  size = 56,
  className = '',
}) {
  const sheet = getSpriteSheet(frame0, frame1);
  const animated = sheet.frames > 1;
  if (animated) ensureSpriteClock();

  return (
    <span
      className={`pixel-sprite-canvas ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src={sheet.url}
        alt=""
        draggable={false}
        className={`pixel-sprite-sheet ${animated ? 'animated' : ''}`}
      />
    </span>
  );
}

const CREATURE_SPRITES = {
  [NODE_TYPES.BOMB]: 'BOMB',
  [NODE_TYPES.CONDUIT]: 'CONDUIT',
  [NODE_TYPES.AMPLIFIER]: 'AMPLIFIER',
  [NODE_TYPES.BOSS]: 'BOSS',
};

export function CreatureSprite({ type, conduitAxis = 'ROW', isTargeted = false }) {
  const sprite = CREATURE_SPRITES[type] || 'GOBLIN';
  return (
    <div className={`creature-wrap ${isTargeted ? 'creature-panicked' : 'creature-idle'}`}>
      {type === NODE_TYPES.CONDUIT && (
        <span className={`conduit-dir-tag dir-${conduitAxis}`}>
          {conduitAxis === 'ROW' ? '↔' : '↕'}
        </span>
      )}
      <PixelSprite frame0={`${sprite}_0`} frame1={`${sprite}_1`} size="100%" />
    </div>
  );
}

export function WeaponPixelIcon({ id, size = 40 }) {
  const map = {
    rail_beam: 'WEAPON_BALLISTA',
    nova_bomb: 'WEAPON_FLASK',
    arc_chain: 'WEAPON_HAMMER',
    overclock_pulse: 'WEAPON_SWORD',
  };
  return <PixelSprite frame0={map[id] || 'WEAPON_SWORD'} size={size} />;
}
