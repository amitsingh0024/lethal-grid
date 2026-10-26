import React, { useState, useRef, useEffect } from 'react';
import {
  Lock,
  TrendingUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  Castle,
  Sword,
  Crown,
  Fire,
  Flag,
  Potion,
  Bomb,
  Sparkles,
  Zap,
  Coins,
  Target,
  Check,
  GoldCoin,
} from './PixelIcons';
import {
  ABILITIES,
  UPGRADE_CATALOG,
  getUpgradeCost,
  getUpgradeRequiredSector,
  getAbilityUpgradeCost,
  getWeaponUnlockCost,
  getStageLabel,
  getCrestsForReset,
  getCrestGoldMult,
  PRESTIGE_MIN_SECTOR,
} from '../game/engine';
import { WeaponPixelIcon } from './CreatureSprite';

// Node positions are in a fixed 1800x1200 world with the Ballista at the center; the
// viewport pans and zooms over it
const WORLD_WIDTH = 1800;
const WORLD_HEIGHT = 1200;
const WORLD_CENTER_X = 900;
const WORLD_CENTER_Y = 600;

export const SKILL_TREE_NODES = [
  // Root
  {
    id: 'rail_beam',
    kind: 'ABILITY',
    abilityIndex: 0,
    x: 900,
    y: 600,
    branch: 'CORE',
    icon: Target,
    parentId: null,
    parentReqLevel: 0,
  },

  // North: courtyard size and volleys
  {
    id: 'grid_size',
    kind: 'UPGRADE',
    x: 900,
    y: 340,
    branch: 'CITADEL',
    icon: Castle,
    parentId: 'rail_beam',
    parentReqLevel: 2,
  },
  {
    id: 'max_charges',
    kind: 'UPGRADE',
    x: 680,
    y: 140,
    branch: 'CITADEL',
    icon: Sword,
    parentId: 'grid_size',
    parentReqLevel: 1,
  },
  {
    id: 'prestige_ascension',
    kind: 'PRESTIGE',
    x: 1120,
    y: 140,
    branch: 'CITADEL',
    icon: Crown,
    parentId: 'grid_size',
    parentReqLevel: 1,
  },

  // West: chain damage, traps, Wildfire Flask and contagion
  {
    id: 'chain_amp',
    kind: 'UPGRADE',
    x: 590,
    y: 540,
    branch: 'DEMOLITION',
    icon: Fire,
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'volatile_spawn',
    kind: 'UPGRADE',
    x: 310,
    y: 340,
    branch: 'DEMOLITION',
    icon: Flag,
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
    icon: Potion,
    parentId: 'chain_amp',
    parentReqLevel: 2,
  },
  {
    id: 'contagion',
    kind: 'UPGRADE',
    x: 240,
    y: 960,
    branch: 'DEMOLITION',
    icon: Bomb,
    parentId: 'nova_bomb',
    parentReqLevel: 1,
  },

  // East: luck, Thunder-Hammer and Greatsword
  {
    id: 'lucky_spark',
    kind: 'UPGRADE',
    x: 1210,
    y: 540,
    branch: 'FORTUNE',
    icon: Sparkles,
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
    icon: Zap,
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
    icon: Sword,
    parentId: 'arc_chain',
    parentReqLevel: 1,
  },

  // South: gold and archers
  {
    id: 'shard_mult',
    kind: 'UPGRADE',
    x: 900,
    y: 860,
    branch: 'ECONOMY',
    icon: Coins,
    parentId: 'rail_beam',
    parentReqLevel: 1,
  },
  {
    id: 'auto_drone',
    kind: 'UPGRADE',
    x: 900,
    y: 1090,
    branch: 'ECONOMY',
    icon: Target,
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
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });

  const clampZoom = (z) => Math.min(1.45, Math.max(0.5, +z.toFixed(2)));

  // React attaches wheel listeners as passive, so preventDefault only works on a native listener
  const viewportRef = useRef(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((z) => clampZoom(z + delta));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

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
    return 'Ascend';
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
        : getWeaponUnlockCost(ab);
      const stats = ab.getStats(Math.max(1, currentLvl));
      const nextStats = !isMax ? ab.getStats(currentLvl + 1) : null;
      const canAfford =
        isParentMet && !isMax && !sectorLocked && save.shards >= cost;

      return {
        title: ab.name,
        subtitle: isUnlocked ? stats.tierLabel : 'Weapon',
        description: `${ab.baseDesc}`,
        statLine: isUnlocked
          ? nextStats
            ? `Damage ${stats.damage} → ${nextStats.damage}`
            : `Damage ${stats.damage}`
          : `Damage ${stats.damage}`,
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
          ? `Needs ${parentName} Lv ${node.parentReqLevel}`
          : sectorLocked
          ? `Reach Stage ${getStageLabel(reqSector)}`
          : isMax
          ? 'Max level'
          : isUnlocked
          ? `Upgrade · ${cost.toLocaleString()} Gold`
          : `Unlock · ${cost.toLocaleString()} Gold`,
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
            ? 'Walls'
            : node.branch === 'FORTUNE'
            ? 'Luck'
            : node.branch === 'DEMOLITION'
            ? 'Powder'
            : 'Treasury',
        description: upg.desc,
        statLine: upg.getEffectText(currentLvl),
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
          ? `Needs ${parentName} Lv ${node.parentReqLevel}`
          : isMax
          ? 'Max level'
          : sectorLocked
          ? `Reach Stage ${getStageLabel(reqSector)}`
          : `Upgrade · ${cost.toLocaleString()} Gold`,
      };
    }

    const canPrestige = isParentMet && save.sector >= PRESTIGE_MIN_SECTOR;
    const coresToGain = getCrestsForReset(save.totalShardsEarned - save.runGoldStart);
    const crestMult = getCrestGoldMult(save.overclockCores || 0, save.crestUpgrades);
    return {
      title: 'Ascend',
      subtitle: 'Prestige',
      description:
        'Start over from Stage 1-1 and lose Gold upgrades. Keep Crests and spend them on lasting upgrades. More Gold this run means more Crests.',
      statLine: `Crests now give ×${crestMult.toFixed(2)} Gold. Ascend for +${coresToGain} ${coresToGain === 1 ? 'Crest' : 'Crests'}.`,
      currentLvl,
      maxLvl: 99,
      isMax: false,
      cost: 0,
      reqSector: PRESTIGE_MIN_SECTOR,
      sectorLocked: save.sector < PRESTIGE_MIN_SECTOR,
      isParentMet,
      parentName,
      parentReqLevel: node.parentReqLevel,
      canAfford: canPrestige,
      actionLabel: !isParentMet
        ? `Needs ${parentName} Lv ${node.parentReqLevel}`
        : save.sector < PRESTIGE_MIN_SECTOR
        ? `Reach Stage ${getStageLabel(PRESTIGE_MIN_SECTOR)} (now Stage ${getStageLabel(save.sector)})`
        : `Ascend · +${coresToGain} ${coresToGain === 1 ? 'Crest' : 'Crests'}`,
    };
  };

  const activeNodeId = hoveredNodeId || selectedNodeId;
  const selectedNode =
    SKILL_TREE_NODES.find((n) => n.id === activeNodeId) || SKILL_TREE_NODES[0];
  const selectedDetails = getNodeDetails(selectedNode);
  const hoveredNode = hoveredNodeId
    ? SKILL_TREE_NODES.find((n) => n.id === hoveredNodeId)
    : null;
  const hoveredDetails = hoveredNode ? getNodeDetails(hoveredNode) : null;

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
      <div className="skill-tree-header">
        <div>
          <h2>
            <TrendingUp size={24} className="text-amber" /> Forge
          </h2>
          <p>Spend Gold on upgrades. Tap one to see it, tap again to buy.</p>
        </div>

        <div className="skill-tree-header-right">
          <div className="tree-treasury-pill">
            <span><GoldCoin size={16} /> {save.shards.toLocaleString()}</span>
            <span className="chip-sep">·</span>
            <span>Best: Stage {getStageLabel(save.maxSectorReached)}</span>
          </div>
          <button type="button" className="btn-primary" onClick={onReturnToBattle}>
            <Sword size={18} />
            <span>Play Stage {getStageLabel(save.sector)}</span>
          </button>
        </div>
      </div>

      <div
        className={`skill-tree-viewport ${isDragging ? 'is-dragging' : ''}`}
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="tree-camera-controls"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="tree-cam-btn"
            onClick={() => setZoom((z) => clampZoom(z + 0.15))}
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <span className="tree-zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="tree-cam-btn"
            onClick={() => setZoom((z) => clampZoom(z - 0.15))}
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            className="tree-cam-btn"
            onClick={resetCamera}
            title="Center"
          >
            <Maximize2 size={15} />
            <span>Center</span>
          </button>
        </div>

        <div className="tree-drag-hint">
          <Move size={12} /> Drag to move
        </div>

        <div
          className="skill-tree-world-plane"
          style={{
            width: `${WORLD_WIDTH}px`,
            height: `${WORLD_HEIGHT}px`,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          }}
        >
          <div className="world-branch-banner" style={{ left: '900px', top: '55px' }}>
            Walls
          </div>
          <div className="world-branch-banner" style={{ left: '300px', top: '230px' }}>
            Powder
          </div>
          <div className="world-branch-banner" style={{ left: '1490px', top: '230px' }}>
            Luck
          </div>
          <div className="world-branch-banner" style={{ left: '900px', top: '1165px' }}>
            Treasury
          </div>

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

          {SKILL_TREE_NODES.map((node) => {
            const details = getNodeDetails(node);
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;
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
                  isHovered ? 'node-hovered' : '',
                  !details.isParentMet ? 'node-parent-locked' : '',
                  details.sectorLocked && details.isParentMet ? 'node-sector-locked' : '',
                  details.canAfford ? 'node-affordable' : '',
                  details.isMax ? 'node-maxed' : '',
                  details.currentLvl > 0 ? 'node-owned' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() =>
                  setHoveredNodeId((prev) => (prev === node.id ? null : prev))
                }
                onFocus={() => setHoveredNodeId(node.id)}
                onBlur={() =>
                  setHoveredNodeId((prev) => (prev === node.id ? null : prev))
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragStartRef.current.moved) return;
                  setSelectedNodeId(node.id);
                  if (details.canAfford) {
                    handlePurchaseNode(node);
                  } else {
                    centerOnNode(node);
                  }
                }}
              >
                <div className="medallion-circle">
                  {node.kind === 'ABILITY' ? (
                    <WeaponPixelIcon id={node.id} size={38} />
                  ) : (
                    <node.icon size={36} className="medallion-emoji" />
                  )}

                  {!details.isParentMet && (
                    <span className="tree-node-lock-badge">
                      <Lock size={12} />
                    </span>
                  )}

                  <span className="medallion-lvl-pip">
                    {details.isMax
                      ? 'Max'
                      : node.kind === 'ABILITY' && details.currentLvl === 0
                      ? <Lock size={12} />
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
                      ? `Stage ${getStageLabel(details.reqSector)}`
                      : <>{details.cost.toLocaleString()} <GoldCoin size={12} /></>}
                  </span>
                )}
              </button>
            );
          })}

          {hoveredNode && hoveredDetails && !isDragging && (
            <div
              className={[
                'tree-node-hover-tooltip',
                hoveredNode.y < 320 ? 'tooltip-below' : 'tooltip-above',
                hoveredNode.x < 400
                  ? 'tooltip-shift-right'
                  : hoveredNode.x > 1400
                  ? 'tooltip-shift-left'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                left: `${hoveredNode.x}px`,
                top: `${hoveredNode.y}px`,
              }}
            >
              <div className="hover-tooltip-header">
                <div className="hover-tooltip-icon">
                  {hoveredNode.kind === 'ABILITY' ? (
                    <WeaponPixelIcon id={hoveredNode.id} size={30} />
                  ) : (
                    <hoveredNode.icon size={24} />
                  )}
                </div>
                <div className="hover-tooltip-title-col">
                  <div className="hover-tooltip-title-row">
                    <h4>{hoveredDetails.title}</h4>
                    <span className="hover-tooltip-lvl-badge">
                      {hoveredDetails.isMax
                        ? 'Max'
                        : `Lv ${hoveredDetails.currentLvl}/${hoveredDetails.maxLvl}`}
                    </span>
                  </div>
                  <span className="hover-tooltip-subtitle">
                    {hoveredDetails.subtitle}
                  </span>
                </div>
              </div>

              <div className="hover-tooltip-stat-box">
                {hoveredDetails.statLine}
              </div>

              <p className="hover-tooltip-desc">{hoveredDetails.description}</p>

              {(hoveredNode.parentId || hoveredDetails.reqSector > 1) && (
                <div className="hover-tooltip-reqs">
                  {hoveredNode.parentId && (
                    <div
                      className={`hover-req-row ${
                        hoveredDetails.isParentMet ? 'req-met' : 'req-locked'
                      }`}
                    >
                      <span>{hoveredDetails.isParentMet ? <Check size={12} /> : <Lock size={12} />}</span>
                      <span>
                        Needs <strong>{hoveredDetails.parentName}</strong> Lv{' '}
                        {hoveredDetails.parentReqLevel}
                      </span>
                    </div>
                  )}
                  {hoveredDetails.reqSector > 1 && (
                    <div
                      className={`hover-req-row ${
                        !hoveredDetails.sectorLocked ? 'req-met' : 'req-locked'
                      }`}
                    >
                      <span>{!hoveredDetails.sectorLocked ? <Check size={12} /> : <Lock size={12} />}</span>
                      <span>
                        Reach Stage {getStageLabel(hoveredDetails.reqSector)} (best: Stage{' '}
                        {getStageLabel(save.maxSectorReached)})
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="hover-tooltip-footer">
                {!hoveredDetails.isMax && hoveredDetails.cost > 0 ? (
                  <span
                    className={`hover-cost-tag ${
                      save.shards >= hoveredDetails.cost ? 'cost-ok' : 'cost-short'
                    }`}
                  >
                    <GoldCoin size={16} /> {hoveredDetails.cost.toLocaleString()}
                  </span>
                ) : (
                  <span className="hover-cost-tag cost-ok">
                    {hoveredDetails.isMax ? 'Max level' : 'Prestige'}
                  </span>
                )}

                <span
                  className={`hover-action-hint ${
                    hoveredDetails.canAfford ? 'hint-ready' : ''
                  }`}
                >
                  {hoveredDetails.canAfford
                    ? 'Tap to buy'
                    : hoveredDetails.isMax
                    ? 'Max level'
                    : !hoveredDetails.isParentMet
                    ? 'Locked'
                    : hoveredDetails.sectorLocked
                    ? `Reach Stage ${getStageLabel(hoveredDetails.reqSector)}`
                    : `Need ${(hoveredDetails.cost - save.shards).toLocaleString()} more Gold`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="skill-tree-bottom-dock">
        <div className="dock-node-summary">
          <div className="inspector-icon-box">
            {selectedNode.kind === 'ABILITY' ? (
              <WeaponPixelIcon id={selectedNode.id} size={44} />
            ) : (
              <selectedNode.icon size={48} className="inspector-big-emoji" />
            )}
          </div>

          <div className="dock-node-text">
            <div className="dock-title-row">
              <h3>{selectedDetails.title}</h3>
              <span className="inspector-branch-tag">
                {selectedDetails.subtitle}
              </span>
              <span className="inspector-lvl-pill">
                Lv {selectedDetails.currentLvl}/{selectedDetails.maxLvl}
              </span>
            </div>

            <p className="dock-stat-highlight">{selectedDetails.statLine}</p>
            <p className="dock-effect-desc">{selectedDetails.description}</p>

            {!selectedDetails.isParentMet && (
              <p className="inspector-req-warning">
                <Lock size={12} /> Needs <strong>{selectedDetails.parentName}</strong> at Lv{' '}
                {selectedDetails.parentReqLevel}.
              </p>
            )}
            {selectedDetails.isParentMet && selectedDetails.sectorLocked && (
              <p className="inspector-req-warning">
                <Lock size={12} /> Reach <strong>Stage {getStageLabel(selectedDetails.reqSector)}</strong> first.
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
