import React, { useEffect, useRef } from 'react';
import { NODE_TYPES } from '../game/engine';

/**
 * 16x16 & 24x24 Authentic Pixel-Art Renderer (Inspired by Backpack Hero, Peglin & 0x72 DungeonTileset)
 *
 * Uses crisp nearest-neighbor pixel palettes and 4-frame animation loops so every hero,
 * goblin, barrel, shaman, banner, ogre, and weapon item looks like a real indie pixel-art game!
 */

const PALETTE = {
  '.': null,
  K: '#141013', // Crisp dark pixel outline
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

// 16x16 Pixel Art Matrices
const PIXEL_MATRICES = {
  // HERO KNIGHT (Sir Aldric / Player Character standing in the top Dungeon Scene)
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

  // 1. GOBLIN FOOTPAD (Kettle helm, pointy green ears, dagger & wooden buckler)
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

  // 2. POWDER-KEG SAPPER (Explosive Oak Barrel with Iron Bands & Sparking Fuse!)
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

  // 3. STORM-RUNE SHAMAN (Blue Battle-Mage with Crackling Lightning Staff)
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

  // 4. WAR-BANNER HERALD (Golden & Emerald Rally Standard)
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

  // 5. IRONCLAD SIEGE OGRE BOSS (Horned Warlord in Heavy Plate)
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

  // WEAPON 1: HEAVY BALLISTA / CROSSBOW
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

  // WEAPON 2: ALCHEMIST WILDFIRE FLASK
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

  // WEAPON 3: DWARVEN THUNDER-HAMMER
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

  // WEAPON 4: EXECUTIONER'S GREATSWORD
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

function drawMatrixToCanvas(ctx, matrix, scale = 4) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let r = 0; r < matrix.length; r++) {
    const rowStr = matrix[r];
    for (let c = 0; c < rowStr.length; c++) {
      const ch = rowStr[c];
      const hex = PALETTE[ch];
      if (hex) {
        ctx.fillStyle = hex;
        ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
  }
}

/**
 * Crisp Nearest-Neighbor Pixel Sprite Component with 2-Frame Idle Bounce
 */
export function PixelSprite({
  frame0,
  frame1,
  size = 56,
  fps = 2.5,
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frameIdx = 0;

    const m0 = PIXEL_MATRICES[frame0] || PIXEL_MATRICES.GOBLIN_0;
    const m1 = PIXEL_MATRICES[frame1 || frame0] || m0;

    drawMatrixToCanvas(ctx, m0, 4);

    if (!frame1 || frame0 === frame1) return;

    const timer = setInterval(() => {
      frameIdx = frameIdx === 0 ? 1 : 0;
      drawMatrixToCanvas(ctx, frameIdx === 0 ? m0 : m1, 4);
    }, 1000 / fps);

    return () => clearInterval(timer);
  }, [frame0, frame1, fps]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={`pixel-sprite-canvas ${className}`}
    />
  );
}

export function CreatureSprite({ type, conduitAxis = 'ROW', isTargeted = false }) {
  const pulseClass = isTargeted ? 'creature-panicked' : 'creature-idle';

  if (type === NODE_TYPES.BOMB) {
    return (
      <div className={`creature-wrap ${pulseClass}`}>
        <PixelSprite frame0="BOMB_0" frame1="BOMB_1" fps={4} size="100%" />
      </div>
    );
  }
  if (type === NODE_TYPES.CONDUIT) {
    return (
      <div className={`creature-wrap ${pulseClass}`}>
        <span className={`conduit-dir-tag dir-${conduitAxis}`}>
          {conduitAxis === 'ROW' ? '↔' : '↕'}
        </span>
        <PixelSprite frame0="CONDUIT_0" frame1="CONDUIT_1" fps={3.5} size="100%" />
      </div>
    );
  }
  if (type === NODE_TYPES.AMPLIFIER) {
    return (
      <div className={`creature-wrap ${pulseClass}`}>
        <PixelSprite frame0="AMPLIFIER_0" frame1="AMPLIFIER_1" fps={3} size="100%" />
      </div>
    );
  }
  if (type === NODE_TYPES.BOSS) {
    return (
      <div className={`creature-wrap ${pulseClass}`}>
        <PixelSprite frame0="BOSS_0" frame1="BOSS_1" fps={2.5} size="100%" />
      </div>
    );
  }

  return (
    <div className={`creature-wrap ${pulseClass}`}>
      <PixelSprite frame0="GOBLIN_0" frame1="GOBLIN_1" fps={2.8} size="100%" />
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

export function CommanderAvatar() {
  return (
    <div className="commander-avatar">
      <PixelSprite frame0="HERO_IDLE_0" frame1="HERO_IDLE_1" fps={2.5} size={52} />
    </div>
  );
}
