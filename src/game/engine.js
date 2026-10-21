/**
 * SIEGE OF EMBERKEEP — Medieval Tactical Chain-Reaction & Snowball Incremental Engine
 *
 * Implements:
 * - Mulberry32 deterministic PRNG for 100% client-side Daily Siege seeds
 * - Dynamic Courtyard Scaling (3x3 -> 4x4 -> 5x5 -> 6x6 -> 7x7 -> 8x8) with Wave + Gold Milestones
 * - Progressive Weapon Unlocks (Start with Ballista; unlock Wildfire Flask, Thunder-Hammer & Greatsword)
 * - Luck / "One-Hit Miracle" Jackpot System:
 *   - Lucky Fuse Ignition: Any hit (even 1 DMG vs 500 HP) can spark a Powder-Keg or Shaman fuse for an instant detonation!
 *   - Critical Cascades (3x Damage) + % Max-HP Chain Shred so chain reactions scale against high-HP waves
 *   - Goblin Barrel Contagion (Standard Goblins can explode on death) & Momentum Volley Refunds
 */

export const NODE_TYPES = {
  EMPTY: 'EMPTY',
  STANDARD: 'STANDARD',
  BOMB: 'BOMB',
  CONDUIT: 'CONDUIT',
  AMPLIFIER: 'AMPLIFIER',
  BOSS: 'BOSS',
};

export const NODE_META = {
  STANDARD: {
    label: 'Goblin Footpad',
    short: 'GOBLIN',
    color: 'cyan',
    desc: 'Shield-bearing goblin raider. Drops Gold Crowns when slain.',
  },
  BOMB: {
    label: 'Powder-Keg Sapper',
    short: 'KEG',
    color: 'rose',
    desc: 'Carries an unstable black-powder barrel! Explodes in a 3×3 fireball when slain or Lucky-Ignited!',
  },
  CONDUIT: {
    label: 'Storm-Rune Shaman',
    short: 'SHAMAN',
    color: 'amber',
    desc: 'Unleashes a crackling Runic Lightning bolt across its entire Row or Column when slain or Lucky-Ignited!',
  },
  AMPLIFIER: {
    label: 'War-Banner Herald',
    short: 'BANNER',
    color: 'emerald',
    desc: 'Slaying this herald rallies your defenders, boosting ALL damage this turn by +50%!',
  },
  BOSS: {
    label: 'Ironclad Siege Ogre',
    short: 'OGRE',
    color: 'violet',
    desc: 'Towering iron-plated warlord. Drops 5× Gold Crowns and triggers a 5×5 shockwave on death!',
  },
};

export const ABILITIES = [
  {
    id: 'rail_beam',
    name: 'Heavy Ballista Volley',
    hotkey: '1',
    icon: 'Crosshair',
    color: 'amber',
    unlockCost: 0,
    minSector: 1,
    baseDesc: 'Fires iron-tipped bolts across the entire Row & Column (+ shape).',
    getStats: (level) => {
      const dmg = Math.floor(1 + level * 1.4);
      const radius = level >= 6 ? 1 : 0;
      return {
        damage: dmg,
        radius,
        tierLabel:
          level >= 6
            ? 'Tier III: Dragon-Piercer Bolts + 3×3 Shrapnel'
            : level >= 3
            ? 'Tier II: Tempered Iron Bolts'
            : 'Tier I: Castle Wall Ballista (+)',
      };
    },
  },
  {
    id: 'nova_bomb',
    name: 'Alchemist Wildfire Flask',
    hotkey: '2',
    icon: 'Flame',
    color: 'rose',
    unlockCost: 180,
    minSector: 3,
    baseDesc: 'Hurls a volatile glass potion that shatters into a 3×3 wildfire blast.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.7);
      const range = level >= 7 ? 2 : 1;
      return {
        damage: dmg,
        range,
        tierLabel:
          level >= 7
            ? 'Tier III: 5×5 Dragonfire Cauldron'
            : level >= 3
            ? 'Tier II: Volatile Pitch Flask (3×3)'
            : 'Tier I: Alchemist Fire Flask (3×3)',
      };
    },
  },
  {
    id: 'arc_chain',
    name: 'Dwarven Thunder-Hammer',
    hotkey: '3',
    icon: 'Zap',
    color: 'cyan',
    unlockCost: 850,
    minSector: 7,
    baseDesc: 'Hurls a runic warhammer that ricochets to the highest-HP enemies.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.5);
      const bounces = 3 + Math.floor(level * 1.1);
      return {
        damage: dmg,
        bounces,
        tierLabel: `Tier ${level >= 6 ? 'III' : level >= 3 ? 'II' : 'I'}: Ricochets to ${bounces} Foes`,
      };
    },
  },
  {
    id: 'overclock_pulse',
    name: "Executioner's Greatsword",
    hotkey: '4',
    icon: 'Sparkles',
    color: 'violet',
    unlockCost: 3600,
    minSector: 12,
    baseDesc: 'Cleaves diagonals (X-slash) and sunders enemy armor (2× damage taken).',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.6);
      return {
        damage: dmg,
        weakenMultiplier: level >= 5 ? 2.5 : 2,
        tierLabel:
          level >= 5
            ? 'Tier II: Royal Whirlwind Cleave (2.5× Sunder)'
            : 'Tier I: Diagonal Steel Cleave (2× Sunder)',
      };
    },
  },
];

const GRID_EXPANSION_COSTS = [120, 650, 3200, 16000, 85000];
const GRID_EXPANSION_SECTORS = [3, 7, 12, 18, 25];

const EXTRA_CHARGE_COSTS = [160, 900, 4800, 24000, 120000];
const EXTRA_CHARGE_SECTORS = [4, 9, 15, 22, 30];

export const UPGRADE_CATALOG = [
  {
    id: 'grid_size',
    name: 'Expand Castle Courtyard',
    category: 'BF_EXPANSION',
    maxLevel: 5,
    baseCost: 120,
    costScale: 4.8,
    customCosts: GRID_EXPANSION_COSTS,
    requiredSectors: GRID_EXPANSION_SECTORS,
    getEffectText: (lvl) => {
      const size = 3 + lvl;
      const next = Math.min(8, size + 1);
      return lvl >= 5
        ? `MAX: ${size}×${size} Grand Citadel Courtyard`
        : `${size}×${size} → ${next}×${next} Stone Courtyard (+More Raiders & Bigger Chains!)`;
    },
  },
  {
    id: 'max_charges',
    name: 'Extra Siege Volley',
    category: 'BF_EXPANSION',
    maxLevel: 5,
    baseCost: 160,
    costScale: 5.0,
    customCosts: EXTRA_CHARGE_COSTS,
    requiredSectors: EXTRA_CHARGE_SECTORS,
    getEffectText: (lvl) => `${2 + lvl} → ${3 + lvl} Weapon Attacks per 1-Turn Siege Wave`,
  },
  {
    id: 'lucky_spark',
    name: "Fortune's Spark (Luck & Crit)",
    category: 'LUCK_SNOWBALL',
    maxLevel: 25,
    baseCost: 28,
    costScale: 1.55,
    getEffectText: (lvl) =>
      `${8 + Math.round(lvl * 1.8)}% → ${8 + Math.round((lvl + 1) * 1.8)}% Lucky Instant-Detonate on High-HP Kegs/Shamans + ${8 + Math.round((lvl + 1) * 1.5)}% 3× Crit Chance!`,
  },
  {
    id: 'contagion',
    name: 'Goblin Barrel Contagion',
    category: 'LUCK_SNOWBALL',
    maxLevel: 20,
    baseCost: 45,
    costScale: 1.65,
    getEffectText: (lvl) =>
      `${lvl * 4}% → ${(lvl + 1) * 4}% chance slain Goblins explode 3×3 + ${12 + (lvl + 1) * 3}% chance 5-Kills refund +1 Volley!`,
  },
  {
    id: 'chain_amp',
    name: 'Refined Black Powder',
    category: 'SYNERGY',
    maxLevel: 40,
    baseCost: 20,
    costScale: 1.48,
    getEffectText: (lvl) =>
      `+${lvl * 20}% → +${(lvl + 1) * 20}% Chain Blast DMG & melts ${18 + (lvl + 1) * 1.5}% of target Max HP!`,
  },
  {
    id: 'shard_mult',
    name: 'Royal Tax & Plunder Charter',
    category: 'SYNERGY',
    maxLevel: 50,
    baseCost: 24,
    costScale: 1.52,
    getEffectText: (lvl) =>
      `×${(1 + lvl * 0.2).toFixed(2)} → ×${(1 + (lvl + 1) * 0.2).toFixed(2)} Gold Crowns Looted`,
  },
  {
    id: 'volatile_spawn',
    name: 'Saboteur Ambush Traps',
    category: 'SYNERGY',
    maxLevel: 15,
    baseCost: 55,
    costScale: 1.75,
    getEffectText: (lvl) =>
      `+${lvl * 3}% → +${(lvl + 1) * 3}% extra Powder-Kegs, Shamans & Banners on every wave`,
  },
  {
    id: 'auto_drone',
    name: 'Battlement Archer Garrison',
    category: 'AUTOMATION',
    maxLevel: 25,
    baseCost: 65,
    costScale: 1.72,
    getEffectText: (lvl) =>
      lvl === 0
        ? 'Hire Castle Archers that physically shoot random enemies on the board every 2.2s!'
        : `Archers shoot ${1 + Math.floor((lvl + 1) / 5)} arrows every 2.2s (${2 + lvl * 2} DMG + can trigger Lucky Ignitions!)`,
  },
];

export function createSeededRandom(seedString) {
  let h = 2166136261 >>> 0;
  const str = String(seedString);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function random() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getTodayDateSeed() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getUpgradeCost(upgradeDef, currentLevel) {
  if (upgradeDef.customCosts && upgradeDef.customCosts[currentLevel] !== undefined) {
    return upgradeDef.customCosts[currentLevel];
  }
  return Math.floor(upgradeDef.baseCost * Math.pow(upgradeDef.costScale, currentLevel));
}

export function getUpgradeRequiredSector(upgradeDef, currentLevel) {
  if (upgradeDef.requiredSectors && upgradeDef.requiredSectors[currentLevel] !== undefined) {
    return upgradeDef.requiredSectors[currentLevel];
  }
  return 1;
}

export function getAbilityUpgradeCost(abilityIndex, currentLevel) {
  const base = 25 + abilityIndex * 35;
  return Math.floor(base * Math.pow(1.72, currentLevel - 1));
}

export const TUTORIAL_LESSONS = [
  {
    step: 1,
    title: 'Lesson I: The Powder-Keg Sapper',
    commanderSpeech:
      'Hail, Commander! Behold that reckless Goblin hugging a Black-Powder Keg in the center of our courtyard. Loose a Ballista Bolt at the center stone (Row 2, Col 2) to detonate his barrel and rout all 5 raiders in ONE shot!',
    recommendedAbility: 'rail_beam',
    highlightCell: { row: 1, col: 1 },
  },
  {
    step: 2,
    title: 'Lesson II: Storm-Rune Chain Lightning',
    commanderSpeech:
      'A glorious blast! Now spy the hooded Storm-Rune Shaman on the left—slaying him unleashes a lightning bolt across his entire row, igniting the Powder-Keg on the right! Strike the Shaman at Row 2, Col 1!',
    recommendedAbility: 'rail_beam',
    highlightCell: { row: 1, col: 0 },
  },
  {
    step: 3,
    title: 'Lesson III: The War-Banner Rally',
    commanderSpeech:
      'Final trial! An Ironclad Siege Ogre approaches the gate! Strike the emerald War-Banner at the top (Row 1, Col 2) first—shattering their banner grants +50% Rally Damage and sets off a chain reaction that fells the Ogre!',
    recommendedAbility: 'rail_beam',
    highlightCell: { row: 0, col: 1 },
  },
];

export function generateTutorialBoard(step = 1) {
  const gridSize = 3;
  const makeCell = (r, c, type = NODE_TYPES.EMPTY, hp = 0, conduitAxis = 'ROW') => ({
    id: `tut-${step}-${r}-${c}`,
    row: r,
    col: c,
    type,
    hp,
    maxHp: hp,
    vulnerable: 1,
    conduitAxis,
    justHit: false,
    destroyedByChain: false,
  });

  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      cells.push(makeCell(r, c));
    }
  }

  if (step === 1) {
    cells[1 * 3 + 1] = makeCell(1, 1, NODE_TYPES.BOMB, 3);
    cells[0 * 3 + 1] = makeCell(0, 1, NODE_TYPES.STANDARD, 3);
    cells[2 * 3 + 1] = makeCell(2, 1, NODE_TYPES.STANDARD, 3);
    cells[1 * 3 + 0] = makeCell(1, 0, NODE_TYPES.STANDARD, 3);
    cells[1 * 3 + 2] = makeCell(1, 2, NODE_TYPES.STANDARD, 3);
  } else if (step === 2) {
    cells[1 * 3 + 0] = makeCell(1, 0, NODE_TYPES.CONDUIT, 3, 'ROW');
    cells[1 * 3 + 2] = makeCell(1, 2, NODE_TYPES.BOMB, 3);
    cells[0 * 3 + 2] = makeCell(0, 2, NODE_TYPES.STANDARD, 3);
    cells[2 * 3 + 2] = makeCell(2, 2, NODE_TYPES.STANDARD, 3);
    cells[0 * 3 + 0] = makeCell(0, 0, NODE_TYPES.STANDARD, 3);
  } else {
    cells[0 * 3 + 1] = makeCell(0, 1, NODE_TYPES.AMPLIFIER, 2);
    cells[1 * 3 + 1] = makeCell(1, 1, NODE_TYPES.BOMB, 3);
    cells[2 * 3 + 1] = makeCell(2, 1, NODE_TYPES.BOSS, 6);
    cells[2 * 3 + 0] = makeCell(2, 0, NODE_TYPES.STANDARD, 4);
    cells[2 * 3 + 2] = makeCell(2, 2, NODE_TYPES.STANDARD, 4);
  }

  return cells;
}

export function generateBoard({
  gridSize = 3,
  sector = 1,
  volatileBonusLevel = 0,
  seedString = null,
  isDaily = false,
}) {
  const rng = createSeededRandom(seedString || `sector-${sector}-${Date.now()}-${Math.random()}`);
  const totalCells = gridSize * gridSize;
  const cells = [];

  // Steep enemy HP scaling on higher waves so flat attack alone struggles,
  // making Chain Synergies, % Max-HP Shred, and Lucky Fuse Ignitions thrilling!
  const baseHp = isDaily
    ? 6
    : Math.max(
        3,
        Math.floor(2 + (sector - 1) * 2.1 + Math.pow(sector, 1.38) * 0.65)
      );

  const specialChanceBonus = volatileBonusLevel * 0.025;

  const guaranteedBombIdx = Math.floor(rng() * totalCells);
  let guaranteedConduitIdx = Math.floor(rng() * totalCells);
  if (guaranteedConduitIdx === guaranteedBombIdx) {
    guaranteedConduitIdx = (guaranteedBombIdx + 1) % totalCells;
  }

  const isBossSector = !isDaily && sector % 5 === 0;
  const bossIdx = isBossSector ? Math.floor(totalCells / 2) : -1;

  for (let i = 0; i < totalCells; i++) {
    const r = Math.floor(i / gridSize);
    const c = i % gridSize;
    const roll = rng();

    let type = NODE_TYPES.STANDARD;
    let maxHp = baseHp;

    if (i === bossIdx) {
      type = NODE_TYPES.BOSS;
      maxHp = Math.floor(baseHp * 2.8);
    } else if (i === guaranteedBombIdx) {
      type = NODE_TYPES.BOMB;
      maxHp = Math.max(2, Math.floor(baseHp * 0.8));
    } else if (i === guaranteedConduitIdx) {
      type = NODE_TYPES.CONDUIT;
      maxHp = Math.max(2, Math.floor(baseHp * 0.85));
    } else if (roll < 0.14 && totalCells > 6) {
      type = NODE_TYPES.EMPTY;
      maxHp = 0;
    } else if (roll < 0.31 + specialChanceBonus) {
      type = NODE_TYPES.BOMB;
      maxHp = Math.max(2, Math.floor(baseHp * (0.75 + rng() * 0.25)));
    } else if (roll < 0.46 + specialChanceBonus) {
      type = NODE_TYPES.CONDUIT;
      maxHp = Math.max(2, Math.floor(baseHp * (0.8 + rng() * 0.25)));
    } else if (roll < 0.55 + specialChanceBonus * 0.8) {
      type = NODE_TYPES.AMPLIFIER;
      maxHp = Math.max(2, Math.floor(baseHp * 0.7));
    } else {
      type = NODE_TYPES.STANDARD;
      maxHp = Math.max(2, Math.floor(baseHp * (0.9 + rng() * 0.35)));
    }

    cells.push({
      id: `cell-${r}-${c}`,
      row: r,
      col: c,
      type,
      hp: maxHp,
      maxHp,
      vulnerable: 1,
      conduitAxis: rng() > 0.5 ? 'ROW' : 'COL',
      justHit: false,
      destroyedByChain: false,
      luckyIgnited: false,
      critHit: false,
    });
  }

  return cells;
}

export function getAbilityPreviewIndices({
  abilityId,
  abilityLevel,
  targetRow,
  targetCol,
  gridSize,
  cells,
}) {
  if (targetRow === null || targetCol === null) return new Set();
  const indices = new Set();
  const toIdx = (r, c) => r * gridSize + c;

  if (abilityId === 'rail_beam') {
    const { radius } = ABILITIES[0].getStats(abilityLevel);
    for (let i = 0; i < gridSize; i++) {
      indices.add(toIdx(targetRow, i));
      indices.add(toIdx(i, targetCol));
    }
    if (radius > 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = targetRow + dr;
          const nc = targetCol + dc;
          if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
            indices.add(toIdx(nr, nc));
          }
        }
      }
    }
  } else if (abilityId === 'nova_bomb') {
    const { range } = ABILITIES[1].getStats(abilityLevel);
    for (let dr = -range; dr <= range; dr++) {
      for (let dc = -range; dc <= range; dc++) {
        const nr = targetRow + dr;
        const nc = targetCol + dc;
        if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
          indices.add(toIdx(nr, nc));
        }
      }
    }
  } else if (abilityId === 'arc_chain') {
    const { bounces } = ABILITIES[2].getStats(abilityLevel);
    const primaryIdx = toIdx(targetRow, targetCol);
    indices.add(primaryIdx);

    const aliveCandidates = cells
      .map((cell, idx) => ({ cell, idx }))
      .filter(({ cell, idx }) => idx !== primaryIdx && cell.type !== NODE_TYPES.EMPTY && cell.hp > 0)
      .sort((a, b) => b.cell.hp - a.cell.hp)
      .slice(0, bounces - 1);

    aliveCandidates.forEach(({ idx }) => indices.add(idx));
  } else if (abilityId === 'overclock_pulse') {
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (Math.abs(r - targetRow) === Math.abs(c - targetCol)) {
          indices.add(toIdx(r, c));
        }
      }
    }
  }

  return indices;
}

export function executeAbilityAndResolveChains({
  cells,
  gridSize,
  targetRow,
  targetCol,
  abilityId,
  abilityLevel,
  chainAmpLevel = 0,
  shardMultLevel = 0,
  luckySparkLevel = 0,
  contagionLevel = 0,
  adBoostMultiplier = 1,
  sector = 1,
  turnAmplifierBonus = 1,
  isTutorial = false,
  isAutoArcherShot = false,
}) {
  const nextCells = cells.map((c) => ({
    ...c,
    justHit: false,
    destroyedByChain: false,
    luckyIgnited: false,
    critHit: false,
  }));

  const events = [];
  const vfxAnimations = [];
  let totalDamageDealt = 0;
  let nodesDestroyed = 0;
  let chainDepth = 0;
  let luckyProcsCount = 0;
  let critHitsCount = 0;
  let dynamicAmp = turnAmplifierBonus;

  const chainExplosionQueue = [];
  const triggeredIndices = new Set();

  // Flat chain damage + % of target's Max HP so chain explosions stay lethal on high-HP waves!
  const baseChainDamage = Math.max(
    2,
    Math.floor((2 + sector * 0.95) * (1 + chainAmpLevel * 0.2))
  );
  const maxHpShredRatio = isTutorial ? 1.0 : 0.18 + chainAmpLevel * 0.015;

  // Luck & Crit Probabilities (disabled during Tutorial so tutorial is 100% deterministic)
  const critChance = isTutorial ? 0 : 0.08 + luckySparkLevel * 0.015;
  const luckyFuseIgniteChance = isTutorial ? 0 : 0.08 + luckySparkLevel * 0.018;
  const luckyExecuteChance = isTutorial ? 0 : 0.04 + luckySparkLevel * 0.01;
  const contagionExplodeChance = isTutorial ? 0 : contagionLevel * 0.04;

  // Enqueue Primary Weapon Animation for the 60FPS Canvas VFX Layer
  const bounceTargets = [];
  if (!isAutoArcherShot && abilityId === 'arc_chain') {
    const { bounces } = ABILITIES[2].getStats(abilityLevel);
    const primaryIdx = targetRow * gridSize + targetCol;
    cells
      .map((cell, idx) => ({ cell, idx }))
      .filter(({ cell, idx }) => idx !== primaryIdx && cell.type !== NODE_TYPES.EMPTY && cell.hp > 0)
      .sort((a, b) => b.cell.hp - a.cell.hp)
      .slice(0, bounces - 1)
      .forEach(({ cell }) => bounceTargets.push({ row: cell.row, col: cell.col }));
  }

  vfxAnimations.push({
    id: `vfx-primary-${Date.now()}-${Math.random()}`,
    type: isAutoArcherShot ? 'rail_beam' : abilityId,
    row: targetRow,
    col: targetCol,
    bounceTargets,
    delayMs: 0,
    duration: abilityId === 'nova_bomb' ? 560 : 420,
  });

  function applyDamageToCell(idx, rawDamage, sourceLabel, isChainReaction = false) {
    const cell = nextCells[idx];
    if (!cell || cell.type === NODE_TYPES.EMPTY || cell.hp <= 0) return;

    // 1. Roll for Critical Strike (3x Damage!)
    const isCrit = !isTutorial && Math.random() < critChance;
    const critMult = isCrit ? 3.0 : 1.0;
    if (isCrit) {
      cell.critHit = true;
      critHitsCount += 1;
    }

    // 2. Add % Max-HP Shred on Chain Reactions so explosions can topple high-HP waves!
    const hpShredBonus = isChainReaction ? Math.ceil(cell.maxHp * maxHpShredRatio) : 0;

    let effectiveDamage = Math.max(
      1,
      Math.ceil((rawDamage * critMult + hpShredBonus) * dynamicAmp * (cell.vulnerable || 1))
    );

    // 3. Roll for "LUCKY FUSE IGNITION / INSTANT EXECUTE" if the hit wouldn't normally kill the unit!
    let triggeredLuckyProc = false;
    if (!isTutorial && cell.hp > effectiveDamage) {
      const isVolatileUnit =
        cell.type === NODE_TYPES.BOMB ||
        cell.type === NODE_TYPES.CONDUIT ||
        cell.type === NODE_TYPES.AMPLIFIER;

      if (isVolatileUnit && Math.random() < luckyFuseIgniteChance) {
        effectiveDamage = cell.hp;
        triggeredLuckyProc = true;
        cell.luckyIgnited = true;
        luckyProcsCount += 1;
        events.push({
          type: 'LUCKY_PROC',
          text: `🎲 LUCKY IGNITION! Spark hit the ${NODE_META[cell.type].label} fuse at (${
            cell.row + 1
          },${cell.col + 1}) and instantly detonated all ${cell.hp} HP!`,
        });
      } else if (cell.type === NODE_TYPES.STANDARD && Math.random() < luckyExecuteChance) {
        effectiveDamage = cell.hp;
        triggeredLuckyProc = true;
        cell.luckyIgnited = true;
        luckyProcsCount += 1;
        events.push({
          type: 'LUCKY_PROC',
          text: `🎲 LUCKY HEADSHOT! Instant lethal strike on Goblin Footpad at (${
            cell.row + 1
          },${cell.col + 1})!`,
        });
      } else if (cell.type === NODE_TYPES.BOSS && Math.random() < luckyExecuteChance) {
        const bossCrush = Math.ceil(cell.maxHp * 0.55);
        effectiveDamage = Math.max(effectiveDamage, bossCrush);
        triggeredLuckyProc = true;
        cell.luckyIgnited = true;
        luckyProcsCount += 1;
        events.push({
          type: 'LUCKY_PROC',
          text: `🎲 LUCKY CRUSHING BLOW! Shattered Ogre armor for ${bossCrush} DMG!`,
        });
      }
    }

    const actualDamage = Math.min(cell.hp, effectiveDamage);
    cell.hp -= actualDamage;
    cell.justHit = true;
    totalDamageDealt += actualDamage;

    if (cell.hp <= 0) {
      cell.hp = 0;
      nodesDestroyed += 1;
      if (isChainReaction || triggeredLuckyProc) {
        cell.destroyedByChain = true;
      }

      if (!triggeredIndices.has(idx)) {
        triggeredIndices.add(idx);

        if (cell.type === NODE_TYPES.AMPLIFIER) {
          dynamicAmp += 0.5;
          events.push({
            type: 'AMPLIFIER',
            text: `War-Banner shattered at (${cell.row + 1},${cell.col + 1})! Rally Damage boosted to ${(
              dynamicAmp * 100
            ).toFixed(0)}%!`,
          });
        } else if (
          cell.type === NODE_TYPES.BOMB ||
          cell.type === NODE_TYPES.CONDUIT ||
          cell.type === NODE_TYPES.BOSS
        ) {
          chainExplosionQueue.push({
            idx,
            row: cell.row,
            col: cell.col,
            type: cell.type,
            conduitAxis: cell.conduitAxis,
            sourceLabel,
          });
        } else if (
          cell.type === NODE_TYPES.STANDARD &&
          contagionExplodeChance > 0 &&
          Math.random() < contagionExplodeChance
        ) {
          // GOBLIN BARREL CONTAGION SYNERGY: Slain standard Goblin explodes like a Powder-Keg!
          luckyProcsCount += 1;
          events.push({
            type: 'LUCKY_PROC',
            text: `💥 CONTAGION! Slain Goblin at (${cell.row + 1},${
              cell.col + 1
            }) dropped a hidden Powder-Keg and exploded!`,
          });
          chainExplosionQueue.push({
            idx,
            row: cell.row,
            col: cell.col,
            type: NODE_TYPES.BOMB,
            conduitAxis: 'ROW',
            sourceLabel: 'Goblin Contagion',
          });
        }
      }
    }
  }

  // 1. Apply Primary Weapon Strike (or Single-Tile Battlement Archer Arrow)
  if (isAutoArcherShot) {
    const archerIdx = targetRow * gridSize + targetCol;
    const archerDmg = Math.max(2, 2 + abilityLevel * 2);
    applyDamageToCell(archerIdx, archerDmg, 'Battlement Archer', false);
  } else {
    const targetIndices = getAbilityPreviewIndices({
      abilityId,
      abilityLevel,
      targetRow,
      targetCol,
      gridSize,
      cells: nextCells,
    });

    const abilityObj = ABILITIES.find((a) => a.id === abilityId) || ABILITIES[0];
    const abilityStats = abilityObj.getStats(abilityLevel);

    targetIndices.forEach((idx) => {
      const cell = nextCells[idx];
      if (!cell || cell.type === NODE_TYPES.EMPTY) return;

      if (abilityId === 'overclock_pulse' && cell.hp > 0) {
        cell.vulnerable = Math.max(cell.vulnerable || 1, abilityStats.weakenMultiplier);
      }

      applyDamageToCell(idx, abilityStats.damage, abilityObj.name, false);
    });
  }

  // 2. Resolve Recursive Chain Reactions (Powder-Kegs, Storm-Rune Shamans, Ogre Boss, Contagion)
  while (chainExplosionQueue.length > 0 && chainDepth < 25) {
    chainDepth += 1;
    const currentWave = [...chainExplosionQueue];
    chainExplosionQueue.length = 0;

    for (const explosion of currentWave) {
      const { row, col, type, conduitAxis } = explosion;

      if (type === NODE_TYPES.BOMB || type === NODE_TYPES.BOSS) {
        const radius = type === NODE_TYPES.BOSS ? 2 : 1;
        vfxAnimations.push({
          id: `vfx-chain-keg-${Date.now()}-${Math.random()}`,
          type: 'BARREL_EXPLOSION',
          row,
          col,
          delayMs: Math.min(chainDepth * 140, 900),
          duration: 460,
          impactAt: 0.1,
        });

        events.push({
          type: 'EXPLOSION',
          text: `${type === NODE_TYPES.BOSS ? 'Siege Ogre' : 'Powder-Keg'} detonated at (${
            row + 1
          },${col + 1})!`,
        });

        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
              const nIdx = nr * gridSize + nc;
              applyDamageToCell(
                nIdx,
                type === NODE_TYPES.BOSS ? baseChainDamage * 1.5 : baseChainDamage,
                'Powder Blast',
                true
              );
            }
          }
        }
      } else if (type === NODE_TYPES.CONDUIT) {
        vfxAnimations.push({
          id: `vfx-chain-rune-${Date.now()}-${Math.random()}`,
          type: 'RUNE_LIGHTNING',
          row,
          col,
          axis: conduitAxis,
          delayMs: Math.min(chainDepth * 140, 900),
          duration: 420,
          impactAt: 0.1,
        });

        events.push({
          type: 'CONDUIT',
          text: `Storm-Rune Shaman unleashed a ${conduitAxis} lightning bolt from (${row + 1},${
            col + 1
          })!`,
        });

        for (let i = 0; i < gridSize; i++) {
          const nIdx = conduitAxis === 'ROW' ? row * gridSize + i : i * gridSize + col;
          applyDamageToCell(nIdx, Math.ceil(baseChainDamage * 1.1), 'Rune Lightning', true);
        }
      }
    }
  }

  const remainingNodes = nextCells.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0).length;
  const isBoardClear = remainingNodes === 0;

  // Momentum Volley Refund Roll: If player kills >= 5 enemies in a single shot!
  let refundedCharge = 0;
  if (!isTutorial && !isAutoArcherShot && !isBoardClear && nodesDestroyed >= 5) {
    const refundChance = 0.12 + contagionLevel * 0.03;
    if (Math.random() < refundChance) {
      refundedCharge = 1;
      luckyProcsCount += 1;
      events.push({
        type: 'LUCKY_PROC',
        text: `⚡ MOMENTUM REFUND! Routing ${nodesDestroyed} foes in one volley granted +1 FREE Siege Volley!`,
      });
    }
  }

  // REBALANCED GRIND ECONOMY: Controlled Gold Drops so upgrades require genuine progression!
  const baseGoldPerKill = 1 + Math.floor((sector - 1) * 0.35);
  const cappedChainBonus = 1 + Math.min(0.8, chainDepth * 0.08);
  const taxCharterMult = 1 + shardMultLevel * 0.2;
  const clearBonusMult = isBoardClear ? 1.25 : 1.0;
  const flatClearBounty = isBoardClear ? 2 + Math.floor(sector * 0.5) : 0;

  const rawShards =
    (nodesDestroyed * baseGoldPerKill + flatClearBounty) *
    cappedChainBonus *
    taxCharterMult *
    clearBonusMult *
    adBoostMultiplier;

  const shardsEarned =
    nodesDestroyed > 0 || isBoardClear ? Math.max(1, Math.floor(rawShards)) : 0;

  return {
    nextCells,
    events,
    vfxAnimations,
    nextTurnAmplifierBonus: dynamicAmp,
    stats: {
      nodesDestroyed,
      chainDepth,
      shardsEarned,
      totalDamageDealt,
      isBoardClear,
      remainingNodes,
      luckyProcsCount,
      critHitsCount,
      refundedCharge,
    },
  };
}
