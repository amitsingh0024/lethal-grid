/**
 * LETHAL GRID: OVERCLOCK — Core Game Engine
 *
 * Implements:
 * - Mulberry32 deterministic PRNG for 100% client-side Daily "Find Lethal" seeds
 * - Dynamic Grid Scaling (3x3 -> 4x4 -> 5x5 -> 6x6 -> 7x7 -> 8x8)
 * - 5 Node Types with recursive chain-reaction physics:
 *   1. STANDARD ( Drone Core ) — Standard armor, drops base Shards
 *   2. BOMB ( Volatile Mine ) — Explodes in a 3x3 area when destroyed!
 *   3. CONDUIT ( Arc Pylon ) — Fires chain lightning along its row/col on death!
 *   4. AMPLIFIER ( Prism Node ) — Boosts all subsequent ability & chain damage by +50% on death!
 *   5. BOSS ( Dreadnought Core ) — High HP, huge Shard jackpot, triggers a board shockwave on death!
 * - 4 Upgradable Tactical Abilities with preview targeting & evolution tiers
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
    label: 'Drone Core',
    short: 'DRN',
    color: 'cyan',
    desc: 'Standard cyber-node. Awards Overclock Shards when destroyed.',
  },
  BOMB: {
    label: 'Volatile Mine',
    short: 'BMB',
    color: 'rose',
    desc: 'Explodes on destruction, dealing heavy blast damage to all 8 surrounding tiles!',
  },
  CONDUIT: {
    label: 'Arc Pylon',
    short: 'ARC',
    color: 'amber',
    desc: 'Discharges a high-voltage beam across its entire Row or Column when destroyed!',
  },
  AMPLIFIER: {
    label: 'Prism Catalyst',
    short: 'AMP',
    color: 'emerald',
    desc: 'Shattering this node permanently boosts ALL chain-reaction damage this turn by +50%!',
  },
  BOSS: {
    label: 'Overlord Core',
    short: 'BOSS',
    color: 'violet',
    desc: 'Armored command unit. Drops 5x Shards and detonates all adjacent tiles when destroyed!',
  },
};

export const ABILITIES = [
  {
    id: 'rail_beam',
    name: 'Rail-Cross Laser',
    hotkey: '1',
    icon: 'Crosshair',
    color: 'cyan',
    baseDesc: 'Strikes target tile + entire Row & Column (+ shape).',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.8);
      const radius = level >= 5 ? 1 : 0; // Level 5+ widens center blast
      return {
        damage: dmg,
        radius,
        tierLabel:
          level >= 5
            ? 'Tier III: Superheated Cross + 3x3 Core'
            : level >= 3
            ? 'Tier II: High-Pierce Cross Beam'
            : 'Tier I: Orthogonal Laser (+)',
      };
    },
  },
  {
    id: 'nova_bomb',
    name: 'Nova Detonator',
    hotkey: '2',
    icon: 'Flame',
    color: 'rose',
    baseDesc: 'Heavy explosive blast in a 3x3 square around target tile.',
    getStats: (level) => {
      const dmg = Math.floor(3 + level * 2.2);
      const range = level >= 6 ? 2 : 1; // Level 6+ expands to 5x5!
      return {
        damage: dmg,
        range,
        tierLabel:
          level >= 6
            ? 'Tier III: 5x5 Thermonuclear Nova'
            : level >= 3
            ? 'Tier II: High-Yield 3x3 Blast'
            : 'Tier I: 3x3 Tactical Blast',
      };
    },
  },
  {
    id: 'arc_chain',
    name: 'Tesla Ricochet',
    hotkey: '3',
    icon: 'Zap',
    color: 'amber',
    baseDesc: 'Strikes target tile and ricochets to highest-HP nodes on the board.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.6);
      const bounces = 3 + Math.floor(level * 1.2);
      return {
        damage: dmg,
        bounces,
        tierLabel: `Tier ${level >= 5 ? 'III' : level >= 3 ? 'II' : 'I'}: Chains to ${bounces} Targets`,
      };
    },
  },
  {
    id: 'overclock_pulse',
    name: 'Singularity X-Wave',
    hotkey: '4',
    icon: 'Sparkles',
    color: 'violet',
    baseDesc: 'Strikes diagonals (X-shape) + weakens armor of hit nodes by doubling their damage taken.',
    getStats: (level) => {
      const dmg = Math.floor(2 + level * 1.7);
      return {
        damage: dmg,
        weakenMultiplier: level >= 4 ? 2.5 : 2,
        tierLabel:
          level >= 4
            ? 'Tier II: Diagonal X-Slash + 2.5x Vulnerability'
            : 'Tier I: Diagonal X-Slash + 2x Vulnerability',
      };
    },
  },
];

export const UPGRADE_CATALOG = [
  {
    id: 'grid_size',
    name: 'Expand Tactical Grid',
    category: 'BF_EXPANSION',
    maxLevel: 5, // Level 0 = 3x3, Lv1 = 4x4, Lv2 = 5x5, Lv3 = 6x6, Lv4 = 7x7, Lv5 = 8x8
    baseCost: 25,
    costScale: 3.4,
    getEffectText: (lvl) => {
      const size = 3 + lvl;
      const next = Math.min(8, size + 1);
      return lvl >= 5
        ? `MAX: ${size}x${size} Mega-Sector Grid`
        : `${size}x${size} → ${next}x${next} Grid (+More Nodes & Combos!)`;
    },
  },
  {
    id: 'max_charges',
    name: 'Action Point Capacitor',
    category: 'BF_EXPANSION',
    maxLevel: 5, // Starts with 2 charges per turn -> up to 7 charges per turn!
    baseCost: 40,
    costScale: 3.2,
    getEffectText: (lvl) => `${2 + lvl} → ${3 + lvl} Ability Charges per 1-Turn Lethal attempt`,
  },
  {
    id: 'chain_amp',
    name: 'Chain Reaction Core',
    category: 'SYNERGY',
    maxLevel: 25,
    baseCost: 15,
    costScale: 1.65,
    getEffectText: (lvl) =>
      `+${lvl * 25}% → +${(lvl + 1) * 25}% Bomb & Conduit Chain Explosion Damage`,
  },
  {
    id: 'shard_mult',
    name: 'Shard Harvester Matrix',
    category: 'SYNERGY',
    maxLevel: 30,
    baseCost: 18,
    costScale: 1.6,
    getEffectText: (lvl) => `x${(1 + lvl * 0.35).toFixed(2)} → x${(1 + (lvl + 1) * 0.35).toFixed(2)} Shards Earned`,
  },
  {
    id: 'volatile_spawn',
    name: 'Volatile Seeding Protocol',
    category: 'SYNERGY',
    maxLevel: 8,
    baseCost: 30,
    costScale: 2.1,
    getEffectText: (lvl) =>
      `+${lvl * 5}% → +${(lvl + 1) * 5}% extra Bomb, Conduit & Prism nodes spawned`,
  },
  {
    id: 'auto_drone',
    name: 'Autonomous Pulse Drone',
    category: 'AUTOMATION',
    maxLevel: 15,
    baseCost: 35,
    costScale: 1.85,
    getEffectText: (lvl) =>
      lvl === 0
        ? 'Unlock Idle Auto-Drone (Fires every 2.5s + Offline Shards)'
        : `Auto-Strikes for ${lvl * 3} DMG/pulse & +${lvl * 4} Passive Shards/sec`,
  },
];

/**
 * Deterministic PRNG (Mulberry32) so Daily Seeds are 100% identical across all browsers
 */
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

/**
 * Generate a tactical board for either Campaign Sector or Daily Seed Challenge
 */
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

  // Scale HP smoothly so chain reactions feel crunchy and winnable
  const baseHp = isDaily
    ? 4
    : Math.max(2, Math.floor(2 + (sector - 1) * 1.45 + Math.pow(sector, 1.15) * 0.4));

  const specialChanceBonus = volatileBonusLevel * 0.04;

  // Guarantee at least 1 Bomb and 1 Conduit on every board so chain reactions are always possible
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

/**
 * Preview which cells an ability will directly target when hovering over (targetRow, targetCol)
 */
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

/**
 * Execute an ability on (targetRow, targetCol) and resolve recursive chain reactions!
 * Returns:
 * - nextCells: updated board state
 * - events: ordered list of chain steps for visual/combat log feedback
 * - stats: { nodesDestroyed, chainDepth, shardsEarned, totalDamageDealt, isBoardClear }
 */
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
            text: `Prism Catalyst shattered at (${cell.row + 1},${cell.col + 1})! Damage boosted to ${(
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

  // 1. Apply Primary Ability Strike
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

    // Singularity X-Wave applies armor vulnerability BEFORE and AFTER damage
    if (abilityId === 'overclock_pulse' && cell.hp > 0) {
      cell.vulnerable = Math.max(cell.vulnerable || 1, abilityStats.weakenMultiplier);
    }

    applyDamageToCell(idx, abilityStats.damage, abilityObj.name, false);
  });

  // 2. Resolve Recursive Chain Reactions (Bombs, Conduits, Boss Shockwaves)
  while (chainExplosionQueue.length > 0) {
    chainDepth += 1;
    const currentWave = [...chainExplosionQueue];
    chainExplosionQueue.length = 0;

    for (const explosion of currentWave) {
      const { row, col, type, conduitAxis } = explosion;

      if (type === NODE_TYPES.BOMB || type === NODE_TYPES.BOSS) {
        const radius = type === NODE_TYPES.BOSS ? 2 : 1;
        events.push({
          type: 'EXPLOSION',
          text: `${type === NODE_TYPES.BOSS ? 'Overlord Core' : 'Volatile Mine'} detonated at (${
            row + 1
          },${col + 1}) for ${Math.ceil(baseChainDamage * dynamicAmp)} AoE DMG!`,
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
                'Chain Blast',
                true
              );
            }
          }
        }
      } else if (type === NODE_TYPES.CONDUIT) {
        events.push({
          type: 'CONDUIT',
          text: `Arc Pylon discharged a ${conduitAxis} lightning beam from (${row + 1},${col + 1})!`,
        });

        for (let i = 0; i < gridSize; i++) {
          const nIdx = conduitAxis === 'ROW' ? row * gridSize + i : i * gridSize + col;
          applyDamageToCell(nIdx, Math.ceil(baseChainDamage * 1.1), 'Arc Discharge', true);
        }
      }
    }
  }

  // 3. Check if the entire board is cleared!
  const remainingNodes = nextCells.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0).length;
  const isBoardClear = remainingNodes === 0;

  // 4. Calculate Overclock Shards Reward
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
