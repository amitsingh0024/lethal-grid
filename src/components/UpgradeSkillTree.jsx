import React, { useState, useRef } from 'react';
import {
  Lock,
  TrendingUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
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
 * Spacious 1800x1200 Virtual World Coordinate Space (Center = 900, 600)
 * Every node is 240px–320px apart so the tree never feels cramped or cluttered,
 * and supports smooth Click-and-Drag Panning + Scroll/Button Zooming!
 */
export const WORLD_WIDTH = 1800;
export const WORLD_HEIGHT = 1200;
export const WORLD_CENTER_X = 900;
export const WORLD_CENTER_Y = 600;

export const SKILL_TREE_NODES = [
  // CENTER ROOT NODE: Heavy Ballista (900, 600)
  {
    id: 'rail_beam',
    kind: 'ABILITY',
    abilityIndex: 0,
    x: 900,
    y: 600,
    branch: 'CORE',
    iconEmoji: '🏹',
    parentId: null,
    parentReqLevel: 0,
  },

  // NORTH BRANCH: Citadel Courtyard & Volleys
  {
    id: 'grid_size',
    kind: 'UPGRADE',
    x: 900,
    y: 340,
    branch: 'CITADEL',
    iconEmoji: '🏰',
    parentId: 'rail_beam',
    parentReqLevel: 2,
  },
  {
    id: 'max_charges',
    kind: 'UPGRADE',
    x: 680,
    y: 140,
    branch: 'CITADEL',
    iconEmoji: '⚔️',
    parentId: 'grid_size',
    parentReqLevel: 1,
  },
  {
    id: 'prestige_ascension',
    kind: 'PRESTIGE',
    x: 1120,
    y: 140,
    branch: 'CITADEL',
    iconEmoji: '👑',
    parentId: 'grid_size',
    parentReqLevel: 1,
  },

  // WEST BRANCH: Black Powder, Traps, Wildfire Flask & Contagion
  {
    id: 'chain_amp',
    kind: 'UPGRADE',
    x: 590,
    y: 540,
    branch: 'DEMOLITION',
    iconEmoji: '🛢️',
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'volatile_spawn',
    kind: 'UPGRADE',
    x: 310,
    y: 340,
    branch: 'DEMOLITION',
    iconEmoji: '💣',
    parentId: 'chain_amp',
    parentReqLevel: 2,
  },
  {
    id: 'nova_bomb',
    kind: 'ABILITY',
    abilityIndex: 1,
    x: 310,
    y: 680,
    branch: 'DEMOLITION',
    iconEmoji: '🧪',
    parentId: 'chain_amp',
    parentReqLevel: 2,
  },
  {
    id: 'contagion',
    kind: 'UPGRADE',
    x: 240,
    y: 960,
    branch: 'DEMOLITION',
    iconEmoji: '💥',
    parentId: 'nova_bomb',
    parentReqLevel: 1,
  },

  // EAST BRANCH: Luck / Instant-Ignite, Thunder-Hammer & Greatsword
  {
    id: 'lucky_spark',
    kind: 'UPGRADE',
    x: 1210,
    y: 540,
    branch: 'FORTUNE',
    iconEmoji: '🎲',
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'arc_chain',
    kind: 'ABILITY',
    abilityIndex: 2,
    x: 1490,
    y: 360,
    branch: 'FORTUNE',
    iconEmoji: '🔨',
    parentId: 'lucky_spark',
    parentReqLevel: 2,
  },
  {
    id: 'overclock_pulse',
    kind: 'ABILITY',
    abilityIndex: 3,
    x: 1520,
    y: 720,
    branch: 'FORTUNE',
    iconEmoji: '🗡️',
    parentId: 'arc_chain',
    parentReqLevel: 1,
  },

  // SOUTH BRANCH: Royal Treasury & Battlement Auto-Archers
  {
    id: 'shard_mult',
    kind: 'UPGRADE',
    x: 900,
    y: 860,
    branch: 'ECONOMY',
    iconEmoji: '🪙',
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'auto_drone',
    kind: 'UPGRADE',
    x: 900,
    y: 1090,
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
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });

  const clampZoom = (z) => Math.min(1.45, Math.max(0.5, +z.toFixed(2)));

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((z) => clampZoom(z + delta));
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragStartRef.current.moved = true;
    }
    setPan({
      x: Math.max(-650, Math.min(650, dragStartRef.current.panX + dx)),
      y: Math.max(-450, Math.min(450, dragStartRef.current.panY + dy)),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const resetCamera = () => {
    setPan({ x: 0, y: 0 });
    setZoom(0.85);
  };

  const centerOnNode = (node) => {
    const offsetX = (WORLD_CENTER_X - node.x) * zoom;
    const offsetY = (WORLD_CENTER_Y - node.y) * zoom;
    setPan({
      x: Math.max(-650, Math.min(650, offsetX * 0.45)),
      y: Math.max(-450, Math.min(450, offsetY * 0.45)),
    });
  };

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

  function getNodeTitle(node) {
    if (node.kind === 'ABILITY') return ABILITIES[node.abilityIndex].name;
    if (node.kind === 'UPGRADE') {
      return UPGRADE_CATALOG.find((u) => u.id === node.id)?.name || node.id;
    }
    return 'Royal Ascension';
  }

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
          <span className="skill-tree-eyebrow">PANNABLE & ZOOMABLE CONSTELLATION TREE</span>
          <h2>
            <TrendingUp size={20} className="text-amber" /> THE ROYAL FORGE SKILL TREE
          </h2>
          <p>
            Drag anywhere to pan • Scroll or use <strong>+/-</strong> to zoom • Click a medallion to
            inspect or forge!
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

      {/* FULL-WIDTH PANNABLE & ZOOMABLE SKILL TREE VIEWPORT */}
      <div
        className={`skill-tree-viewport ${isDragging ? 'is-dragging' : ''}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* FLOATING ZOOM & CAMERA CONTROLS */}
        <div
          className="tree-camera-controls"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="tree-cam-btn"
            onClick={() => setZoom((z) => clampZoom(z + 0.15))}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <span className="tree-zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="tree-cam-btn"
            onClick={() => setZoom((z) => clampZoom(z - 0.15))}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            className="tree-cam-btn"
            onClick={resetCamera}
            title="Reset & Center Camera"
          >
            <Maximize2 size={15} />
            <span>Center</span>
          </button>
        </div>

        <div className="tree-drag-hint">
          <Move size={13} /> Drag to Pan • Scroll to Zoom
        </div>

        {/* TRANSFORMABLE 1800x1200 WORLD PLANE */}
        <div
          className="skill-tree-world-plane"
          style={{
            width: `${WORLD_WIDTH}px`,
            height: `${WORLD_HEIGHT}px`,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          }}
        >
          {/* QUADRANT BANNERS IN WORLD SPACE */}
          <div className="world-branch-banner" style={{ left: '900px', top: '55px' }}>
            🏰 NORTH: CITADEL FORTIFICATIONS & VOLLEYS
          </div>
          <div className="world-branch-banner" style={{ left: '300px', top: '230px' }}>
            🛢️ WEST: BLACK POWDER & CONTAGION
          </div>
          <div className="world-branch-banner" style={{ left: '1490px', top: '230px' }}>
            🎲 EAST: FORTUNE, CRITS & ARSENAL
          </div>
          <div className="world-branch-banner" style={{ left: '900px', top: '1165px' }}>
            🪙 SOUTH: ROYAL TREASURY & AUTO-ARCHERS
          </div>

          {/* 1:1 PIXEL SVG DEPENDENCY LINES */}
          <svg
            className="skill-tree-svg-lines"
            width={WORLD_WIDTH}
            height={WORLD_HEIGHT}
            viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
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

          {/* SPACIOUS MEDALLION NODES */}
          {SKILL_TREE_NODES.map((node) => {
            const details = getNodeDetails(node);
            const isSelected = selectedNodeId === node.id;
            const isRoot = !node.parentId;

            return (
              <button
                key={node.id}
                type="button"
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                className={[
                  'tree-medallion-node',
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
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragStartRef.current.moved) return;
                  if (selectedNodeId === node.id && details.canAfford) {
                    handlePurchaseNode(node);
                  } else {
                    setSelectedNodeId(node.id);
                    centerOnNode(node);
                  }
                }}
              >
                <div className="medallion-circle">
                  {node.kind === 'ABILITY' ? (
                    <WeaponPixelIcon id={node.id} size={38} />
                  ) : (
                    <span className="medallion-emoji">{node.iconEmoji}</span>
                  )}

                  {!details.isParentMet && (
                    <span className="tree-node-lock-badge">
                      <Lock size={12} />
                    </span>
                  )}

                  <span className="medallion-lvl-pip">
                    {details.isMax
                      ? 'MAX'
                      : node.kind === 'ABILITY' && details.currentLvl === 0
                      ? '🔒'
                      : `${details.currentLvl}/${details.maxLvl}`}
                  </span>
                </div>

                <span className="medallion-caption">{details.title}</span>

                {!details.isMax && details.isParentMet && (
                  <span
                    className={`medallion-cost-pill ${
                      details.canAfford ? 'price-ready' : ''
                    }`}
                  >
                    {details.sectorLocked
                      ? `🔒 Wave ${details.reqSector}`
                      : `${details.cost.toLocaleString()} 🪙`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* BOTTOM HORIZONTAL BLACKSMITH INSPECTOR BAR */}
      <aside className="skill-tree-bottom-dock">
        <div className="dock-node-summary">
          <div className="inspector-icon-box">
            {selectedNode.kind === 'ABILITY' ? (
              <WeaponPixelIcon id={selectedNode.id} size={44} />
            ) : (
              <span className="inspector-big-emoji">{selectedNode.iconEmoji}</span>
            )}
          </div>

          <div className="dock-node-text">
            <div className="dock-title-row">
              <h3>{selectedDetails.title}</h3>
              <span className="inspector-branch-tag">
                {selectedDetails.subtitle}
              </span>
              <span className="inspector-lvl-pill">
                Lv. {selectedDetails.currentLvl} / {selectedDetails.maxLvl}
              </span>
            </div>

            <p className="dock-effect-desc">{selectedDetails.description}</p>

            {!selectedDetails.isParentMet && (
              <p className="inspector-req-warning">
                🔒 Prerequisite: Forge <strong>{selectedDetails.parentName}</strong> to Level{' '}
                {selectedDetails.parentReqLevel} first.
              </p>
            )}
            {selectedDetails.isParentMet && selectedDetails.sectorLocked && (
              <p className="inspector-req-warning">
                🔒 Milestone Locked: Reach <strong>Siege Wave {selectedDetails.reqSector}</strong> in
                battle first.
              </p>
            )}
          </div>
        </div>

        <div className="dock-node-action">
          <button
            type="button"
            className={`btn-forge-node ${selectedDetails.canAfford ? 'ready' : ''}`}
            disabled={!selectedDetails.canAfford}
            onClick={() => handlePurchaseNode(selectedNode)}
          >
            {selectedDetails.actionLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}
