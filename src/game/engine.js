/**
 * SIEGE OF EMBERKEEP — Medieval Tactical Chain-Reaction Engine
 *
 * Implements:
 * - Mulberry32 deterministic PRNG for 100% client-side Daily Siege seeds
 * - Dynamic Courtyard Scaling (3x3 -> 4x4 -> 5x5 -> 6x6 -> 7x7 -> 8x8)
 * - 5 Medieval Unit Types with recursive chain-reaction physics:
 *   1. STANDARD ( Goblin Footpad ) — Standard shield raider, drops Gold Crowns
 *   2. BOMB ( Powder-Keg Sapper ) — Carries a black-powder barrel that explodes 3x3 on death!
 *   3. CONDUIT ( Storm-Rune Shaman ) — Discharges a lightning bolt along its row/col on death!
 *   4. AMPLIFIER ( War-Banner Herald ) — Slaying him rallies your siege weapons for +50% turn damage!
 *   5. BOSS ( Ironclad Siege Ogre ) — Armored warlord, drops 5x Gold & triggers a 5x5 shockwave!
 * - 4 Upgradable Medieval Siege Weapons with trajectory metadata for the 60FPS Canvas VFX Engine
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
    desc: 'Carries an unstable black-powder barrel! Explodes in a 3×3 fireball when slain!',
  },
  CONDUIT: {
    label: 'Storm-Rune Shaman',
    short: 'SHAMAN',
    color: 'amber',
    desc: 'Unleashes a crackling Runic Lightning bolt across its entire Row or Column when slain!',
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
    desc: 'Towering iron-plated warlord. Drops 5× Gold Crowns and shatters surrounding tiles on death!',
  },
};

export const ABILITIES = [
  {
    id: 'rail_beam',
    name: 'Heavy Ballista Volley',
    hotkey: '1',
    icon: 'Crosshair',
    color: 'amber',
    baseDesc: 'Fires iron-tipped bolts across the entire Row & Column (+ shape).',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.8);
      const radius = level >= 5 ? 1 : 0;
      return {
        damage: dmg,
        radius,
        tierLabel:
          level >= 5
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
    baseDesc: 'Hurls a volatile glass potion that shatters into a 3×3 wildfire blast.',
    getStats: (level) => {
      const dmg = Math.floor(3 + level * 2.2);
      const range = level >= 6 ? 2 : 1;
      return {
        damage: dmg,
        range,
        tierLabel:
          level >= 6
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
    baseDesc: 'Hurls a runic warhammer that ricochets to the highest-HP enemies.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.6);
      const bounces = 3 + Math.floor(level * 1.2);
      return {
        damage: dmg,
        bounces,
        tierLabel: `Tier ${level >= 5 ? 'III' : level >= 3 ? 'II' : 'I'}: Ricochets to ${bounces} Foes`,
      };
    },
  },
  {
    id: 'overclock_pulse',
    name: "Executioner's Greatsword",
    hotkey: '4',
    icon: 'Sparkles',
    color: 'violet',
    baseDesc: 'Cleaves diagonals (X-slash) and sunders enemy armor (2× damage taken).',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.7);
      return {
        damage: dmg,
        weakenMultiplier: level >= 4 ? 2.5 : 2,
        tierLabel:
          level >= 4
            ? 'Tier II: Royal Whirlwind Cleave (2.5× Sunder)'
            : 'Tier I: Diagonal Steel Cleave (2× Sunder)',
      };
    },
  },
];

export const UPGRADE_CATALOG = [
  {
    id: 'grid_size',
    name: 'Expand Castle Courtyard',
    category: 'BF_EXPANSION',
    maxLevel: 5,
    baseCost: 25,
    costScale: 3.4,
    getEffectText: (lvl) => {
      const size = 3 + lvl;
      const next = Math.min(8, size + 1);
      return lvl >= 5
        ? `MAX: ${size}×${size} Grand Citadel Courtyard`
        : `${size}×${size} → ${next}×${next} Stone Courtyard (+More Enemies & Chain Combos!)`;
    },
  },
  {
    id: 'max_charges',
    name: 'Extra Siege Volley',
    category: 'BF_EXPANSION',
    maxLevel: 5,
    baseCost: 40,
    costScale: 3.2,
    getEffectText: (lvl) => `${2 + lvl} → ${3 + lvl} Weapon Attacks per 1-Turn Siege Wave`,
  },
  {
    id: 'chain_amp',
    name: 'Refined Black Powder',
    category: 'SYNERGY',
    maxLevel: 25,
    baseCost: 15,
    costScale: 1.65,
    getEffectText: (lvl) =>
      `+${lvl * 25}% → +${(lvl + 1) * 25}% Powder-Keg & Shaman Chain Explosion Damage`,
  },
  {
    id: 'shard_mult',
    name: 'Royal Tax & Plunder Charter',
    category: 'SYNERGY',
    maxLevel: 30,
    baseCost: 18,
    costScale: 1.6,
    getEffectText: (lvl) =>
      `×${(1 + lvl * 0.35).toFixed(2)} → ×${(1 + (lvl + 1) * 0.35).toFixed(2)} Gold Crowns Looted`,
  },
  {
    id: 'volatile_spawn',
    name: 'Saboteur Ambush Traps',
    category: 'SYNERGY',
    maxLevel: 8,
    baseCost: 30,
    costScale: 2.1,
    getEffectText: (lvl) =>
      `+${lvl * 5}% → +${(lvl + 1) * 5}% extra Powder-Kegs, Shamans & Banners on every wave`,
  },
  {
    id: 'auto_drone',
    name: 'Battlement Archer Garrison',
    category: 'AUTOMATION',
    maxLevel: 15,
    baseCost: 35,
    costScale: 1.85,
    getEffectText: (lvl) =>
      lvl === 0
        ? 'Hire Castle Archers (Passively loots Gold Crowns every 2.5s!)'
        : `Archers loot +${lvl * 4} Passive Gold Crowns every 2.5 seconds`,
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
  return Math.floor(upgradeDef.baseCost * Math.pow(upgradeDef.costScale, currentLevel));
}

export function getAbilityUpgradeCost(abilityIndex, currentLevel) {
  const base = 12 + abilityIndex * 8;
  return Math.floor(base * Math.pow(1.62, currentLevel - 1));
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

  const baseHp = isDaily
    ? 4
    : Math.max(2, Math.floor(2 + (sector - 1) * 1.45 + Math.pow(sector, 1.15) * 0.4));

  const specialChanceBonus = volatileBonusLevel * 0.04;

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
      maxHp = Math.floor(baseHp * 2.4);
    } else if (i === guaranteedBombIdx) {
      type = NODE_TYPES.BOMB;
      maxHp = Math.max(1, Math.floor(baseHp * 0.75));
    } else if (i === guaranteedConduitIdx) {
      type = NODE_TYPES.CONDUIT;
      maxHp = Math.max(1, Math.floor(baseHp * 0.8));
    } else if (roll < 0.14 && totalCells > 6) {
      type = NODE_TYPES.EMPTY;
      maxHp = 0;
    } else if (roll < 0.34 + specialChanceBonus) {
      type = NODE_TYPES.BOMB;
      maxHp = Math.max(1, Math.floor(baseHp * (0.7 + rng() * 0.25)));
    } else if (roll < 0.50 + specialChanceBonus) {
      type = NODE_TYPES.CONDUIT;
      maxHp = Math.max(1, Math.floor(baseHp * (0.75 + rng() * 0.25)));
    } else if (roll < 0.60 + specialChanceBonus * 0.8) {
      type = NODE_TYPES.AMPLIFIER;
      maxHp = Math.max(1, Math.floor(baseHp * 0.65));
    } else {
      type = NODE_TYPES.STANDARD;
      maxHp = Math.max(1, Math.floor(baseHp * (0.85 + rng() * 0.35)));
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
  chainAmpLevel,
  shardMultLevel,
  adBoostMultiplier = 1,
  sector = 1,
  turnAmplifierBonus = 1,
}) {
  const nextCells = cells.map((c) => ({
    ...c,
    justHit: false,
    destroyedByChain: false,
  }));

  const events = [];
  const vfxAnimations = [];
  let totalDamageDealt = 0;
  let nodesDestroyed = 0;
  let chainDepth = 0;
  let dynamicAmp = turnAmplifierBonus;

  const chainExplosionQueue = [];
  const triggeredIndices = new Set();

  const baseChainDamage = Math.max(
    2,
    Math.floor((2 + sector * 1.35) * (1 + chainAmpLevel * 0.25))
  );

  // Enqueue Primary Weapon Animation for the 60FPS Canvas VFX Layer
  const bounceTargets = [];
  if (abilityId === 'arc_chain') {
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
    type: abilityId,
    row: targetRow,
    col: targetCol,
    bounceTargets,
    delayMs: 0,
    duration: abilityId === 'nova_bomb' ? 560 : 440,
  });

  function applyDamageToCell(idx, rawDamage, sourceLabel, isChainReaction = false) {
    const cell = nextCells[idx];
    if (!cell || cell.type === NODE_TYPES.EMPTY || cell.hp <= 0) return;

    const effectiveDamage = Math.max(1, Math.ceil(rawDamage * dynamicAmp * (cell.vulnerable || 1)));
    const actualDamage = Math.min(cell.hp, effectiveDamage);
    cell.hp -= actualDamage;
    cell.justHit = true;
    totalDamageDealt += actualDamage;

    if (cell.hp <= 0) {
      cell.hp = 0;
      nodesDestroyed += 1;
      if (isChainReaction) {
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
        }
      }
    }
  }

  // 1. Apply Primary Weapon Strike
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

  // 2. Resolve Recursive Chain Reactions (Powder-Kegs, Storm-Rune Shamans, Ogre Boss)
  while (chainExplosionQueue.length > 0) {
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
          delayMs: chainDepth * 160,
          duration: 460,
          impactAt: 0.1,
        });

        events.push({
          type: 'EXPLOSION',
          text: `${type === NODE_TYPES.BOSS ? 'Siege Ogre' : 'Powder-Keg'} detonated at (${
            row + 1
          },${col + 1}) for ${Math.ceil(baseChainDamage * dynamicAmp)} Blast DMG!`,
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
          delayMs: chainDepth * 160,
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

  const baseShardPerKill = 2 + Math.floor(sector * 0.9);
  const comboMultiplier = 1 + chainDepth * 0.25;
  const upgradeMultiplier = 1 + shardMultLevel * 0.35;
  const lethalClearBonus = isBoardClear ? 1.75 : 1;

  const rawShards =
    (nodesDestroyed * baseShardPerKill + Math.floor(totalDamageDealt * 0.25)) *
    comboMultiplier *
    upgradeMultiplier *
    lethalClearBonus *
    adBoostMultiplier;

  const shardsEarned = Math.max(nodesDestroyed > 0 ? 1 : 0, Math.floor(rawShards));

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
    },
  };
}
