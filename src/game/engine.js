/**
 * LETHAL GRID — Medieval Tactical Chain-Reaction & Snowball Incremental Engine
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
    label: 'Goblin',
    short: 'GOBLIN',
    color: 'cyan',
    desc: 'Plain raider. Drops Gold.',
  },
  BOMB: {
    label: 'Sapper',
    short: 'KEG',
    color: 'rose',
    desc: 'Explodes 3×3 when it falls or Ignites.',
  },
  CONDUIT: {
    label: 'Shaman',
    short: 'SHAMAN',
    color: 'amber',
    desc: 'Throws lightning down its row or column when it falls or Ignites.',
  },
  AMPLIFIER: {
    label: 'Herald',
    short: 'BANNER',
    color: 'emerald',
    desc: 'Rally: +50% damage for the rest of the turn.',
  },
  BOSS: {
    label: 'Ogre',
    short: 'OGRE',
    color: 'violet',
    desc: 'Lots of HP. Drops 5× Gold and shakes 5×5 when it falls.',
  },
};

export const ABILITIES = [
  {
    id: 'rail_beam',
    name: 'Ballista',
    hotkey: '1',
    icon: 'Crosshair',
    color: 'amber',
    unlockCost: 0,
    minSector: 1,
    baseDesc: 'Hits its row and column.',
    getStats: (level) => {
      const dmg = Math.floor(1 + level * 1.4);
      const radius = level >= 6 ? 1 : 0;
      return {
        damage: dmg,
        radius,
        tierLabel:
          level >= 6
            ? 'Tier III: row, column and 3×3 shrapnel'
            : level >= 3
            ? 'Tier II: tempered bolts'
            : 'Tier I: row and column',
      };
    },
  },
  {
    id: 'nova_bomb',
    name: 'Wildfire',
    hotkey: '2',
    icon: 'Flame',
    color: 'rose',
    unlockCost: 180,
    minSector: 3,
    baseDesc: 'Bursts 3×3.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.7);
      const range = level >= 7 ? 2 : 1;
      return {
        damage: dmg,
        range,
        tierLabel:
          level >= 7
            ? 'Tier III: bursts 5×5'
            : level >= 3
            ? 'Tier II: hotter 3×3'
            : 'Tier I: bursts 3×3',
      };
    },
  },
  {
    id: 'arc_chain',
    name: 'Hammer',
    hotkey: '3',
    icon: 'Zap',
    color: 'cyan',
    unlockCost: 850,
    minSector: 7,
    baseDesc: 'Bounces to the toughest enemies.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.5);
      const bounces = 3 + Math.floor(level * 1.1);
      return {
        damage: dmg,
        bounces,
        tierLabel: `Tier ${level >= 6 ? 'III' : level >= 3 ? 'II' : 'I'}: bounces ${bounces} times`,
      };
    },
  },
  {
    id: 'overclock_pulse',
    name: 'Greatsword',
    hotkey: '4',
    icon: 'Sparkles',
    color: 'violet',
    unlockCost: 3600,
    minSector: 12,
    baseDesc: 'Cuts both diagonals. Sunder: targets take 2× damage.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.6);
      return {
        damage: dmg,
        weakenMultiplier: level >= 5 ? 2.5 : 2,
        tierLabel:
          level >= 5
            ? 'Tier II: Sunder 2.5×'
            : 'Tier I: Sunder 2×',
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
    name: 'Bigger Board',
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
        ? `Max: ${size}×${size}`
        : `Board ${size}×${size} → ${next}×${next}. More raiders, longer chains.`;
    },
  },
  {
    id: 'max_charges',
    name: 'Extra Shot',
    category: 'BF_EXPANSION',
    maxLevel: 5,
    baseCost: 160,
    costScale: 5.0,
    customCosts: EXTRA_CHARGE_COSTS,
    requiredSectors: EXTRA_CHARGE_SECTORS,
    getEffectText: (lvl) => `Shots per wave ${2 + lvl} → ${3 + lvl}`,
  },
  {
    id: 'lucky_spark',
    name: 'Lucky Spark',
    category: 'LUCK_SNOWBALL',
    maxLevel: 25,
    baseCost: 28,
    costScale: 1.55,
    getEffectText: (lvl) =>
      `Ignite ${8 + Math.round(lvl * 1.8)}% → ${8 + Math.round((lvl + 1) * 1.8)}%. Crit (3×) ${8 + Math.round((lvl + 1) * 1.5)}%.`,
  },
  {
    id: 'contagion',
    name: 'Contagion',
    category: 'LUCK_SNOWBALL',
    maxLevel: 20,
    baseCost: 45,
    costScale: 1.65,
    getEffectText: (lvl) =>
      `Goblins explode 3×3: ${lvl * 4}% → ${(lvl + 1) * 4}%. ${12 + (lvl + 1) * 3}% chance a 5-kill shot refunds +1 Shot.`,
  },
  {
    id: 'chain_amp',
    name: 'Black Powder',
    category: 'SYNERGY',
    maxLevel: 40,
    baseCost: 20,
    costScale: 1.48,
    getEffectText: (lvl) =>
      `Chain damage +${lvl * 20}% → +${(lvl + 1) * 20}%. Blasts also take ${18 + (lvl + 1) * 1.5}% of max HP.`,
  },
  {
    id: 'shard_mult',
    name: 'Plunder',
    category: 'SYNERGY',
    maxLevel: 50,
    baseCost: 24,
    costScale: 1.52,
    getEffectText: (lvl) =>
      `Gold ×${(1 + lvl * 0.2).toFixed(2)} → ×${(1 + (lvl + 1) * 0.2).toFixed(2)}`,
  },
  {
    id: 'volatile_spawn',
    name: 'Saboteurs',
    category: 'SYNERGY',
    maxLevel: 15,
    baseCost: 55,
    costScale: 1.75,
    getEffectText: (lvl) =>
      `More sappers, shamans and heralds: +${lvl * 3}% → +${(lvl + 1) * 3}%`,
  },
  {
    id: 'auto_drone',
    name: 'Archers',
    category: 'AUTOMATION',
    maxLevel: 25,
    baseCost: 65,
    costScale: 1.72,
    getEffectText: (lvl) =>
      lvl === 0
        ? 'Archers fire at a random enemy every 2.2s.'
        : `${1 + Math.floor((lvl + 1) / 5)} arrows every 2.2s, ${2 + lvl * 2} damage each. Can Ignite.`,
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
    return upgradeDef.customCosts[currentLevel] * UPGRADE_PRICE_SCALE;
  }
  return Math.floor(upgradeDef.baseCost * Math.pow(upgradeDef.costScale, currentLevel)) * UPGRADE_PRICE_SCALE;
}

export function getUpgradeRequiredSector(upgradeDef, currentLevel) {
  if (upgradeDef.requiredSectors && upgradeDef.requiredSectors[currentLevel] !== undefined) {
    return upgradeDef.requiredSectors[currentLevel];
  }
  return 1;
}

// Every run pays in full, win or lose. Farming is held back by upgrade costs outgrowing income,
// and pushing forward pays best: kill gold tracks enemy HP and a stage's first clear pays triple.
// Pacing was tuned with a bot playing the real engine (see README, "Economy").
export const FIRST_CLEAR_GOLD_MULT = 3;
// One knob for every Forge price, so the cost curve can be retuned without touching each upgrade
export const UPGRADE_PRICE_SCALE = 4;
export const STAGES_PER_CHAPTER = 5;

// Waves are shown as chapter stages: waves 1-5 are 1-1 to 1-5 (boss on 1-5), wave 6 is 2-1
export function getStageLabel(sector) {
  const s = Math.max(1, Math.floor(sector));
  const chapter = Math.ceil(s / STAGES_PER_CHAPTER);
  const stage = ((s - 1) % STAGES_PER_CHAPTER) + 1;
  return `${chapter}-${stage}`;
}

const DAILY_BASE_HP = 6;

// Base raider HP for a wave; individual raiders roll around this value
export function getWaveBaseHp(sector, isDaily = false) {
  if (isDaily) return DAILY_BASE_HP;
  return Math.max(3, Math.floor(2 + (sector - 1) * 2.1 + Math.pow(sector, 1.38) * 0.65));
}

// Stars for a stage clear: one for the clear, one for a volley to spare, one for a single volley
export function getClearStars({ volleysFired, volleysLeft }) {
  return 1 + (volleysLeft > 0 ? 1 : 0) + (volleysFired <= 1 ? 1 : 0);
}

// A chapter chest opens at each star total; a chapter holds 15 stars
export const CHAPTER_CHEST_STARS = [8, 15];

export function getChapterStars(stageStars, chapter) {
  let total = 0;
  for (let i = 1; i <= STAGES_PER_CHAPTER; i++) {
    total += stageStars[(chapter - 1) * STAGES_PER_CHAPTER + i] || 0;
  }
  return total;
}

// Chest gold scales with the chapter boss, so later chests stay worth opening
export function getChapterChestGold(chapter, tier) {
  return getGoldPerKill(chapter * STAGES_PER_CHAPTER) * 40 * tier;
}

// Gold for each raider slain: about a sixth of the wave's base HP, so harder stages pay more.
// The Daily is priced as wave 5 (stage 1-5), the sector it is played at.
export function getGoldPerKill(sector) {
  return Math.max(1, Math.round(getWaveBaseHp(sector) / 6));
}

export function getWeaponUnlockCost(ability) {
  return ability.unlockCost * UPGRADE_PRICE_SCALE;
}

export function getAbilityUpgradeCost(abilityIndex, currentLevel) {
  const base = 25 + abilityIndex * 35;
  return Math.floor(base * Math.pow(1.72, currentLevel - 1)) * UPGRADE_PRICE_SCALE;
}

export const TUTORIAL_LESSONS = [
  {
    step: 1,
    title: 'Lesson 1: Sappers',
    commanderSpeech:
      'That goblin in the middle is holding a powder keg. Shoot it and watch.',
    recommendedAbility: 'rail_beam',
    highlightCell: { row: 1, col: 1 },
  },
  {
    step: 2,
    title: 'Lesson 2: Shamans',
    commanderSpeech:
      'Shamans throw lightning down their row when they fall. Hit the shaman.',
    recommendedAbility: 'rail_beam',
    highlightCell: { row: 1, col: 0 },
  },
  {
    step: 3,
    title: 'Lesson 3: Heralds',
    commanderSpeech:
      'An ogre. Hit the green banner first: it gives +50% damage for the rest of the turn.',
    recommendedAbility: 'rail_beam',
    highlightCell: { row: 0, col: 1 },
  },
];

// Chain links land one after another after the weapon hits; deep chains bunch up so a turn
// never takes more than about a second to play out
const CHAIN_STEP_MS = 150;
const CHAIN_IMPACT_MS = 40;
const MAX_STAGGERED_LINKS = 6;

function getHitRevealMs(depth, primaryImpactMs) {
  if (depth === 0) return primaryImpactMs;
  return primaryImpactMs + 60 + Math.min(depth - 1, MAX_STAGGERED_LINKS) * CHAIN_STEP_MS;
}

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
  const baseHp = getWaveBaseHp(sector, isDaily);

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
  // Daily boards pass a seeded generator so crits and lucky procs match for every player
  rng = Math.random,
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
  // Every hit in resolution order, so the screen can reveal damage when its effect lands
  const hits = [];
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

  const primaryType = isAutoArcherShot ? 'rail_beam' : abilityId;
  const primaryDuration = primaryType === 'nova_bomb' ? 560 : 420;
  const primaryImpactMs = Math.round(primaryDuration * 0.55);
  vfxAnimations.push({
    id: `vfx-primary-${Date.now()}-${Math.random()}`,
    type: primaryType,
    row: targetRow,
    col: targetCol,
    bounceTargets,
    delayMs: 0,
    duration: primaryDuration,
    impactMs: primaryImpactMs,
  });

  function applyDamageToCell(idx, rawDamage, sourceLabel, isChainReaction = false) {
    const cell = nextCells[idx];
    if (!cell || cell.type === NODE_TYPES.EMPTY || cell.hp <= 0) return;

    // 1. Roll for Critical Strike (3x Damage!)
    const isCrit = !isTutorial && rng() < critChance;
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

      if (isVolatileUnit && rng() < luckyFuseIgniteChance) {
        effectiveDamage = cell.hp;
        triggeredLuckyProc = true;
        cell.luckyIgnited = true;
        luckyProcsCount += 1;
        events.push({
          type: 'LUCKY_PROC',
          text: `Ignite! The ${NODE_META[cell.type].label.toLowerCase()} went up early.`,
        });
      } else if (cell.type === NODE_TYPES.STANDARD && rng() < luckyExecuteChance) {
        effectiveDamage = cell.hp;
        triggeredLuckyProc = true;
        cell.luckyIgnited = true;
        luckyProcsCount += 1;
        events.push({
          type: 'LUCKY_PROC',
          text: `Headshot!`,
        });
      } else if (cell.type === NODE_TYPES.BOSS && rng() < luckyExecuteChance) {
        const bossCrush = Math.ceil(cell.maxHp * 0.55);
        effectiveDamage = Math.max(effectiveDamage, bossCrush);
        triggeredLuckyProc = true;
        cell.luckyIgnited = true;
        luckyProcsCount += 1;
        events.push({
          type: 'LUCKY_PROC',
          text: `Crushing blow! ${bossCrush} to the ogre.`,
        });
      }
    }

    const actualDamage = Math.min(cell.hp, effectiveDamage);
    cell.hp -= actualDamage;
    cell.justHit = true;
    totalDamageDealt += actualDamage;
    hits.push({
      idx,
      cellId: cell.id,
      row: cell.row,
      col: cell.col,
      damage: actualDamage,
      hpAfter: Math.max(0, cell.hp),
      killed: cell.hp <= 0,
      crit: isCrit,
      lucky: triggeredLuckyProc,
      depth: chainDepth,
      source: sourceLabel,
      atMs: getHitRevealMs(chainDepth, primaryImpactMs),
    });

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
            text: `Rally! Damage now ${(dynamicAmp * 100).toFixed(0)}%.`,
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
          rng() < contagionExplodeChance
        ) {
          // GOBLIN BARREL CONTAGION SYNERGY: Slain standard Goblin explodes like a Powder-Keg!
          luckyProcsCount += 1;
          events.push({
            type: 'LUCKY_PROC',
            text: `Contagion! A goblin had a keg after all.`,
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
          delayMs: getHitRevealMs(chainDepth, primaryImpactMs) - CHAIN_IMPACT_MS,
          duration: 460,
          impactMs: CHAIN_IMPACT_MS,
        });

        events.push({
          type: 'EXPLOSION',
          text: `${type === NODE_TYPES.BOSS ? 'Ogre' : 'Keg'} blast!`,
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
          delayMs: getHitRevealMs(chainDepth, primaryImpactMs) - CHAIN_IMPACT_MS,
          duration: 420,
          impactMs: CHAIN_IMPACT_MS,
        });

        events.push({
          type: 'CONDUIT',
          text: `Shaman lightning!`,
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
    if (rng() < refundChance) {
      refundedCharge = 1;
      luckyProcsCount += 1;
      events.push({
        type: 'LUCKY_PROC',
        text: `${nodesDestroyed} in one shot. +1 Shot`,
      });
    }
  }

  const baseGoldPerKill = getGoldPerKill(sector);
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
    hits,
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

// ---------------------------------------------------------------------------
// Offline garrison: while the player is away, the Archer Garrison farms the
// best cleared stage at one clear's worth of gold every OFFLINE_MINUTES_PER_CLEAR.
// ---------------------------------------------------------------------------
export const OFFLINE_MINUTES_PER_CLEAR = 10;
export const OFFLINE_MIN_MINUTES = 1;

// Hours of absence the garrison counts: 2 at base, longer with Garrison levels and the Crest tree
export function getOfflineCapHours(garrisonLevel, crestOfflineLevel = 0) {
  return Math.min(8, 2 + garrisonLevel * 0.25) + crestOfflineLevel * 2;
}

export function getOfflineRateMult(garrisonLevel) {
  return 1 + garrisonLevel * 0.1;
}

// Rough gold for one full clear of a stage: about 14% of tiles are empty on boards above 3x3
export function estimateClearGold({ sector, gridSize, shardMultLevel = 0 }) {
  const cells = gridSize * gridSize;
  const raiders = cells > 9 ? Math.round(cells * 0.86) : cells;
  const bounty = 2 + Math.floor(sector * 0.5);
  return (raiders * getGoldPerKill(sector) + bounty) * 1.25 * (1 + shardMultLevel * 0.2);
}

export function getOfflineReward({
  elapsedMs,
  sector,
  gridSize,
  shardMultLevel,
  garrisonLevel,
  crestOfflineLevel,
  goldMult = 1,
}) {
  const capMinutes = getOfflineCapHours(garrisonLevel, crestOfflineLevel) * 60;
  const minutes = Math.min(capMinutes, Math.max(0, elapsedMs) / 60000);
  if (minutes < OFFLINE_MIN_MINUTES || sector < 1) return null;
  const clears = minutes / OFFLINE_MINUTES_PER_CLEAR;
  const gold = Math.floor(
    estimateClearGold({ sector, gridSize, shardMultLevel }) *
      clears *
      getOfflineRateMult(garrisonLevel) *
      goldMult
  );
  if (gold < 1) return null;
  return { gold, minutes: Math.floor(minutes), capped: minutes >= capMinutes, sector };
}

// ---------------------------------------------------------------------------
// Royal Crests: earned by resetting from wave 10 (the 2-5 boss) on, then spent
// in a permanent tree. Unspent crests still add a little gold each.
// ---------------------------------------------------------------------------
export const PRESTIGE_MIN_SECTOR = 10;
export const UNSPENT_CREST_GOLD_BONUS = 0.1;

// Crests for a reset grow with the square root of gold earned since the last one,
// so a longer run always pays more but doubling the crests takes 4x the gold
export function getCrestsForReset(runGold) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, runGold) / 400)));
}

export const CREST_TREE = [
  {
    id: 'crest_gold',
    name: 'Royal Treasury',
    costs: [1, 2, 3, 4, 5],
    getEffectText: (lvl) => `+${lvl * 25}% Gold from raiders and the garrison`,
  },
  {
    id: 'crest_start_gold',
    name: 'War Chest',
    costs: [1, 2, 3],
    getEffectText: (lvl) => `Start each run with ${100 + lvl * 250} Gold`,
  },
  {
    id: 'crest_courtyard',
    name: 'Wider Walls',
    costs: [2, 5],
    getEffectText: (lvl) => `Start each run on a ${3 + lvl}×${3 + lvl} board`,
  },
  {
    id: 'crest_volley',
    name: 'Veteran Crew',
    costs: [3, 7],
    getEffectText: (lvl) => `Start each run with ${2 + lvl} shots per wave`,
  },
  {
    id: 'crest_offline',
    name: 'Night Watch',
    costs: [2, 4],
    getEffectText: (lvl) => `Garrison counts +${lvl * 2}h of time away`,
  },
];

export function getCrestsSpent(crestUpgrades) {
  return CREST_TREE.reduce((sum, node) => {
    const lvl = crestUpgrades[node.id] || 0;
    return sum + node.costs.slice(0, lvl).reduce((a, b) => a + b, 0);
  }, 0);
}

// Gold multiplier from crests: the Treasury plus a small bonus per unspent crest
export function getCrestGoldMult(totalCrests, crestUpgrades) {
  const unspent = Math.max(0, totalCrests - getCrestsSpent(crestUpgrades));
  return 1 + (crestUpgrades.crest_gold || 0) * 0.25 + unspent * UNSPENT_CREST_GOLD_BONUS;
}
