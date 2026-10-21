import React, { useState } from 'react';
import {
  Lock,
  Sparkles,
  Flame,
  Zap,
  Crosshair,
  Shield,
  Award,
  TrendingUp,
  Cpu,
  Check,
} from 'lucide-react';
import {
  ABILITIES,
  UPGRADE_CATALOG,
  getUpgradeCost,
  getUpgradeRequiredSector,
  getAbilityUpgradeCost,
} from '../game/engine';
import { WeaponPixelIcon } from './CreatureSprite';

/**
 * Nodebuster / RPG Style Interactive Upgrade Skill Tree
 * Coordinates (x, y) are in percentages (0-100) on the 920x580 tree canvas.
 */
export const SKILL_TREE_NODES = [
  // CENTER ROOT NODE: Heavy Ballista
  {
    id: 'rail_beam',
    kind: 'ABILITY',
    abilityIndex: 0,
    x: 50,
    y: 50,
    branch: 'CORE',
    iconEmoji: '🏹',
    parentId: null,
    parentReqLevel: 0,
  },

  // NORTH BRANCH: Citadel Courtyard & Volleys
  {
    id: 'grid_size',
    kind: 'UPGRADE',
    x: 50,
    y: 24,
    branch: 'CITADEL',
    iconEmoji: '🏰',
    parentId: 'rail_beam',
    parentReqLevel: 2,
  },
  {
    id: 'max_charges',
    kind: 'UPGRADE',
    x: 32,
    y: 11,
    branch: 'CITADEL',
    iconEmoji: '⚔️',
    parentId: 'grid_size',
    parentReqLevel: 1,
  },
  {
    id: 'prestige_ascension',
    kind: 'PRESTIGE',
    x: 68,
    y: 11,
    branch: 'CITADEL',
    iconEmoji: '👑',
    parentId: 'grid_size',
    parentReqLevel: 1,
  },

  // WEST BRANCH: Black Powder, Traps, Wildfire Flask & Contagion
  {
    id: 'chain_amp',
    kind: 'UPGRADE',
    x: 27,
    y: 44,
    branch: 'DEMOLITION',
    iconEmoji: '🛢️',
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'volatile_spawn',
    kind: 'UPGRADE',
    x: 12,
    y: 26,
    branch: 'DEMOLITION',
    iconEmoji: '💣',
    parentId: 'chain_amp',
    parentReqLevel: 2,
  },
  {
    id: 'nova_bomb',
    kind: 'ABILITY',
    abilityIndex: 1,
    x: 13,
    y: 58,
    branch: 'DEMOLITION',
    iconEmoji: '🧪',
    parentId: 'chain_amp',
    parentReqLevel: 2,
  },
  {
    id: 'contagion',
    kind: 'UPGRADE',
    x: 18,
    y: 84,
    branch: 'DEMOLITION',
    iconEmoji: '💥',
    parentId: 'nova_bomb',
    parentReqLevel: 1,
  },

  // EAST BRANCH: Luck / Instant-Ignite, Thunder-Hammer & Greatsword
  {
    id: 'lucky_spark',
    kind: 'UPGRADE',
    x: 73,
    y: 44,
    branch: 'FORTUNE',
    iconEmoji: '🎲',
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'arc_chain',
    kind: 'ABILITY',
    abilityIndex: 2,
    x: 87,
    y: 30,
    branch: 'FORTUNE',
    iconEmoji: '🔨',
    parentId: 'lucky_spark',
    parentReqLevel: 2,
  },
  {
    id: 'overclock_pulse',
    kind: 'ABILITY',
    abilityIndex: 3,
    x: 86,
    y: 66,
    branch: 'FORTUNE',
    iconEmoji: '🗡️',
    parentId: 'arc_chain',
    parentReqLevel: 1,
  },

  // SOUTH BRANCH: Royal Treasury & Battlement Auto-Archers
  {
    id: 'shard_mult',
    kind: 'UPGRADE',
    x: 50,
    y: 75,
    branch: 'ECONOMY',
    iconEmoji: '🪙',
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'auto_drone',
    kind: 'UPGRADE',
    x: 56,
    y: 91,
    branch: 'ECONOMY',
    iconEmoji: '🎯',
    parentId: 'shard_mult',
    parentReqLevel: 2,
  },
];

export function UpgradeSkillTree({
  save,
  onBuyUpgrade,
  onUpgradeAbility,
  onPrestigeReboot,
  onReturnToBattle,
}) {
  const [selectedNodeId, setSelectedNodeId] = useState('rail_beam');

  const getNodeLevel = (nodeId) => {
    const node = SKILL_TREE_NODES.find((n) => n.id === nodeId);
    if (!node) return 0;
    if (node.kind === 'ABILITY') {
      return save.abilityLevels[nodeId] ?? (node.abilityIndex === 0 ? 1 : 0);
    }
    if (node.kind === 'UPGRADE') {
      return save.upgrades[nodeId] || 0;
    }
    if (node.kind === 'PRESTIGE') {
      return save.overclockCores || 0;
    }
    return 0;
  };

  const getNodeDetails = (node) => {
    const currentLvl = getNodeLevel(node.id);
    const parentLvl = node.parentId ? getNodeLevel(node.parentId) : 999;
    const isParentMet = !node.parentId || parentLvl >= node.parentReqLevel;
    const parentNode = node.parentId
      ? SKILL_TREE_NODES.find((n) => n.id === node.parentId)
      : null;
    const parentName = parentNode ? getNodeTitle(parentNode) : '';

    if (node.kind === 'ABILITY') {
      const ab = ABILITIES[node.abilityIndex];
      const isUnlocked = currentLvl >= 1;
      const maxLvl = 15;
      const isMax = currentLvl >= maxLvl;
      const reqSector = ab.minSector || 1;
      const sectorLocked = !isUnlocked && save.maxSectorReached < reqSector;
      const cost = isUnlocked
        ? getAbilityUpgradeCost(node.abilityIndex, currentLvl)
        : ab.unlockCost;
      const stats = ab.getStats(Math.max(1, currentLvl));
      const canAfford =
        isParentMet && !isMax && !sectorLocked && save.shards >= cost;

      return {
        title: ab.name,
        subtitle: isUnlocked ? stats.tierLabel : 'Weapon Blueprint (Locked)',
        description: `${stats.damage} Direct DMG • ${ab.baseDesc}`,
        currentLvl,
        maxLvl,
        isMax,
        cost,
        reqSector,
        sectorLocked,
        isParentMet,
        parentName,
        parentReqLevel: node.parentReqLevel,
        canAfford,
        actionLabel: !isParentMet
          ? `Requires ${parentName} Lv.${node.parentReqLevel}`
          : sectorLocked
          ? `🔒 Reach Wave ${reqSector} (${cost.toLocaleString()} 🪙)`
          : isMax
          ? 'MAX TEMPERED'
          : isUnlocked
          ? `Temper Lv.${currentLvl + 1} (${cost.toLocaleString()} 🪙)`
          : `Unlock Weapon (${cost.toLocaleString()} 🪙)`,
      };
    }

    if (node.kind === 'UPGRADE') {
      const upg = UPGRADE_CATALOG.find((u) => u.id === node.id);
      const maxLvl = upg.maxLevel;
      const isMax = currentLvl >= maxLvl;
      const reqSector = getUpgradeRequiredSector(upg, currentLvl);
      const sectorLocked = !isMax && save.maxSectorReached < reqSector;
      const cost = getUpgradeCost(upg, currentLvl);
      const canAfford =
        isParentMet && !isMax && !sectorLocked && save.shards >= cost;

      return {
        title: upg.name,
        subtitle:
          node.branch === 'CITADEL'
            ? 'Citadel Fortification'
            : node.branch === 'FORTUNE'
            ? 'Luck & Critical Cascade'
            : node.branch === 'DEMOLITION'
            ? 'Black Powder & Contagion'
            : 'Royal Treasury & Garrison',
        description: upg.getEffectText(currentLvl),
        currentLvl,
        maxLvl,
        isMax,
        cost,
        reqSector,
        sectorLocked,
        isParentMet,
        parentName,
        parentReqLevel: node.parentReqLevel,
        canAfford,
        actionLabel: !isParentMet
          ? `Requires ${parentName} Lv.${node.parentReqLevel}`
          : isMax
          ? 'MAX LEVEL REACHED'
          : sectorLocked
          ? `🔒 Reach Wave ${reqSector} (${cost.toLocaleString()} 🪙)`
          : `Forge Lv.${currentLvl + 1} (${cost.toLocaleString()} 🪙)`,
      };
    }

    // PRESTIGE NODE
    const canPrestige = isParentMet && save.sector >= 10;
    const coresToGain = Math.max(1, Math.floor((save.sector - 5) / 4));
    return {
      title: 'Royal Ascension (Prestige)',
      subtitle: `Permanent +${(save.overclockCores || 0) * 50}% Global Gold & Damage`,
      description:
        'Requires Wave 10. Reset your wave and gold upgrades in exchange for permanent Royal Crests (+50% Gold & Damage per Crest)!',
      currentLvl,
      maxLvl: 99,
      isMax: false,
      cost: 0,
      reqSector: 10,
      sectorLocked: save.sector < 10,
      isParentMet,
      parentName,
      parentReqLevel: node.parentReqLevel,
      canAfford: canPrestige,
      actionLabel: !isParentMet
        ? `Requires ${parentName} Lv.${node.parentReqLevel}`
        : save.sector < 10
        ? `🔒 Reach Wave 10 in Current Run (Now: Wave ${save.sector})`
        : `👑 Ascend for +${coresToGain} Royal Crests`,
    };
  };

  function getNodeTitle(node) {
    if (node.kind === 'ABILITY') return ABILITIES[node.abilityIndex].name;
    if (node.kind === 'UPGRADE') {
      return UPGRADE_CATALOG.find((u) => u.id === node.id)?.name || node.id;
    }
    return 'Royal Ascension';
  }

  const selectedNode =
    SKILL_TREE_NODES.find((n) => n.id === selectedNodeId) || SKILL_TREE_NODES[0];
  const selectedDetails = getNodeDetails(selectedNode);

  const handlePurchaseNode = (node) => {
    const details = getNodeDetails(node);
    if (!details.canAfford) return;
    if (node.kind === 'ABILITY') {
      onUpgradeAbility(node.id, node.abilityIndex);
    } else if (node.kind === 'UPGRADE') {
      const upg = UPGRADE_CATALOG.find((u) => u.id === node.id);
      if (upg) onBuyUpgrade(upg);
    } else if (node.kind === 'PRESTIGE') {
      onPrestigeReboot();
    }
  };

  return (
    <div className="skill-tree-wrapper">
      {/* HEADER BAR */}
      <div className="skill-tree-header">
        <div>
          <span className="skill-tree-eyebrow">INTERACTIVE CONSTELLATION & BLACKSMITH TREE</span>
          <h2>
            <TrendingUp size={20} className="text-amber" /> THE ROYAL FORGE SKILL TREE
          </h2>
          <p>
            Click any node to inspect or forge it. Level up core nodes to unlock outer branches!
          </p>
        </div>

        <div className="skill-tree-header-right">
          <div className="tree-treasury-pill">
            <span>🪙 {save.shards.toLocaleString()} Gold</span>
            <span className="chip-sep">•</span>
            <span>Max Wave: {save.maxSectorReached}</span>
          </div>
          <button type="button" className="btn-primary" onClick={onReturnToBattle}>
            <span>⚔️ Return to Siege (Wave {save.sector})</span>
          </button>
        </div>
      </div>

      {/* MAIN TREE STAGE + SIDE INSPECTOR */}
      <div className="skill-tree-layout">
        {/* INTERACTIVE NODEBUSTER-STYLE TREE CANVAS */}
        <div className="skill-tree-canvas">
          {/* BRANCH QUADRANT LABELS */}
          <span className="tree-branch-tag north">🏰 CITADEL & VOLLEYS</span>
          <span className="tree-branch-tag west">🛢️ BLACK POWDER & CONTAGION</span>
          <span className="tree-branch-tag east">🎲 LUCK, CRITS & ARSENAL</span>
          <span className="tree-branch-tag south">🪙 TREASURY & AUTO-ARCHERS</span>

          {/* SVG DEPENDENCY LINES */}
          <svg
            className="skill-tree-svg-lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {SKILL_TREE_NODES.filter((n) => n.parentId).map((node) => {
              const parent = SKILL_TREE_NODES.find((p) => p.id === node.parentId);
              if (!parent) return null;
              const parentLvl = getNodeLevel(parent.id);
              const unlocked = parentLvl >= node.parentReqLevel;
              const activeChild = getNodeLevel(node.id) > 0;

              return (
                <g key={`${parent.id}->${node.id}`}>
                  <line
                    x1={parent.x}
                    y1={parent.y}
                    x2={node.x}
                    y2={node.y}
                    className={[
                      'tree-edge-line',
                      unlocked ? 'edge-unlocked' : 'edge-locked',
                      activeChild ? 'edge-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                </g>
              );
            })}
          </svg>

          {/* SKILL TREE NODES */}
          {SKILL_TREE_NODES.map((node) => {
            const details = getNodeDetails(node);
            const isSelected = selectedNodeId === node.id;
            const isRoot = !node.parentId;

            return (
              <button
                key={node.id}
                type="button"
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                className={[
                  'tree-node-btn',
                  `branch-${node.branch.toLowerCase()}`,
                  isRoot ? 'node-root' : '',
                  isSelected ? 'node-selected' : '',
                  !details.isParentMet ? 'node-parent-locked' : '',
                  details.sectorLocked && details.isParentMet ? 'node-sector-locked' : '',
                  details.canAfford ? 'node-affordable' : '',
                  details.isMax ? 'node-maxed' : '',
                  details.currentLvl > 0 ? 'node-owned' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  if (selectedNodeId === node.id && details.canAfford) {
                    handlePurchaseNode(node);
                  } else {
                    setSelectedNodeId(node.id);
                  }
                }}
                title={`${details.title} (${details.actionLabel})`}
              >
                <div className="tree-node-icon-wrap">
                  {node.kind === 'ABILITY' ? (
                    <WeaponPixelIcon id={node.id} size={32} />
                  ) : (
                    <span className="tree-node-emoji">{node.iconEmoji}</span>
                  )}

                  {!details.isParentMet && (
                    <span className="tree-node-lock-badge">
                      <Lock size={11} />
                    </span>
                  )}
                </div>

                <span className="tree-node-short-title">{details.title}</span>

                <div className="tree-node-meta-row">
                  <span className="tree-node-lvl">
                    {details.isMax
                      ? 'MAX'
                      : node.kind === 'ABILITY' && details.currentLvl === 0
                      ? 'LOCKED'
                      : `Lv.${details.currentLvl}/${details.maxLvl}`}
                  </span>
                  {!details.isMax && details.isParentMet && (
                    <span
                      className={`tree-node-price ${
                        details.canAfford ? 'price-ready' : ''
                      }`}
                    >
                      {details.sectorLocked
                        ? `W${details.reqSector}`
                        : `${details.cost.toLocaleString()}🪙`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* SELECTED NODE BLACKSMITH INSPECTOR CARD */}
        <aside className="skill-tree-inspector">
          <div className="inspector-badge-row">
            <span className={`inspector-branch-tag branch-${selectedNode.branch.toLowerCase()}`}>
              {selectedDetails.subtitle}
            </span>
            <span className="inspector-lvl-pill">
              Level {selectedDetails.currentLvl} / {selectedDetails.maxLvl}
            </span>
          </div>

          <div className="inspector-hero-row">
            <div className="inspector-icon-box">
              {selectedNode.kind === 'ABILITY' ? (
                <WeaponPixelIcon id={selectedNode.id} size={46} />
              ) : (
                <span className="inspector-big-emoji">{selectedNode.iconEmoji}</span>
              )}
            </div>
            <div>
              <h3>{selectedDetails.title}</h3>
              {!selectedDetails.isParentMet && (
                <p className="inspector-req-warning">
                  🔒 Requires <strong>{selectedDetails.parentName}</strong> at Level{' '}
                  {selectedDetails.parentReqLevel}
                </p>
              )}
              {selectedDetails.isParentMet && selectedDetails.sectorLocked && (
                <p className="inspector-req-warning">
                  🔒 Milestone Locked: Reach <strong>Siege Wave {selectedDetails.reqSector}</strong>{' '}
                  first!
                </p>
              )}
            </div>
          </div>

          <div className="inspector-effect-box">
            <span className="effect-box-label">CURRENT / NEXT FORGE EFFECT</span>
            <p>{selectedDetails.description}</p>
          </div>

          <button
            type="button"
            className={`btn-forge-node ${selectedDetails.canAfford ? 'ready' : ''}`}
            disabled={!selectedDetails.canAfford}
            onClick={() => handlePurchaseNode(selectedNode)}
          >
            {selectedDetails.actionLabel}
          </button>

          <p className="inspector-hint">
            💡 Tip: Click any node on the tree to inspect it. Click a highlighted node twice to
            rapidly forge upgrades!
          </p>
        </aside>
      </div>
    </div>
  );
}
