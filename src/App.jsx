import React, { useState, useEffect } from 'react';
import {
  Crosshair,
  Flame,
  Zap,
  Sparkles,
  TrendingUp,
  Layers,
  Cpu,
  Shield,
  Award,
  RotateCcw,
  Share2,
  Gift,
  Activity,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  Volume2,
  VolumeX,
  FastForward,
  Lock,
} from 'lucide-react';
import {
  NODE_TYPES,
  NODE_META,
  ABILITIES,
  UPGRADE_CATALOG,
  generateBoard,
  getAbilityPreviewIndices,
  executeAbilityAndResolveChains,
  getUpgradeCost,
  getAbilityUpgradeCost,
  getTodayDateSeed,
} from './game/engine';
import {
  initAnalyticsAndAds,
  trackEvent,
  subscribeToTelemetry,
  getMonetizationConfig,
} from './services/analytics';
import { AdBannerSlot, RewardedAdModal } from './components/AdUnit';

const STORAGE_KEY = 'lethal_grid_overclock_save_v1';

const ABILITY_ICONS = {
  Crosshair,
  Flame,
  Zap,
  Sparkles,
};

/**
 * Web Audio Synthesizer for crunchy, zero-dependency procedural laser & explosion SFX
 */
function playSound(type, muted) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!window.__gameAudioCtx) {
      window.__gameAudioCtx = new AudioCtx();
    }
    const ctx = window.__gameAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'strike') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.16);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'chain') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.24);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (type === 'clear') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(660, now + 0.08);
      osc.frequency.setValueAtTime(880, now + 0.16);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'upgrade') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.14);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    }
  } catch {
    // Ignore audio context blocks
  }
}

const DEFAULT_SAVE = {
  shards: 30,
  totalShardsEarned: 30,
  sector: 1,
  maxSectorReached: 1,
  lethalClears: 0,
  overclockCores: 0, // Prestige currency
  upgrades: {
    grid_size: 0, // 0 = 3x3, up to 5 = 8x8
    max_charges: 0, // 0 = 2 charges
    chain_amp: 0,
    shard_mult: 0,
    volatile_spawn: 0,
    auto_drone: 0,
  },
  abilityLevels: {
    rail_beam: 1,
    nova_bomb: 1,
    arc_chain: 1,
    overclock_pulse: 1,
  },
  dailyClearedDate: null,
  dailyMovesHistory: [],
  estSessionRevenueUsd: 0.004,
};

export default function App() {
  // 1. Load Persistent Save State from Browser localStorage
  const [save, setSave] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SAVE;
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SAVE,
        ...parsed,
        upgrades: { ...DEFAULT_SAVE.upgrades, ...(parsed.upgrades || {}) },
        abilityLevels: { ...DEFAULT_SAVE.abilityLevels, ...(parsed.abilityLevels || {}) },
      };
    } catch {
      return DEFAULT_SAVE;
    }
  });

  const [gameMode, setGameMode] = useState('CAMPAIGN'); // 'CAMPAIGN' | 'DAILY'
  const [selectedAbilityId, setSelectedAbilityId] = useState('rail_beam');
  const [hoverCell, setHoverCell] = useState({ row: null, col: null });
  const [muted, setMuted] = useState(false);

  // Derived Grid & Turn Stats
  const campaignGridSize = Math.min(8, 3 + (save.upgrades.grid_size || 0));
  const activeGridSize = gameMode === 'DAILY' ? 5 : campaignGridSize;
  const maxTurnCharges = gameMode === 'DAILY' ? 3 : 2 + (save.upgrades.max_charges || 0);

  const [chargesLeft, setChargesLeft] = useState(maxTurnCharges);
  const [turnAmplifierBonus, setTurnAmplifierBonus] = useState(1);
  const [board, setBoard] = useState(() =>
    generateBoard({
      gridSize: activeGridSize,
      sector: save.sector,
      volatileBonusLevel: save.upgrades.volatile_spawn,
    })
  );

  const [combatLog, setCombatLog] = useState([
    {
      id: 'init',
      type: 'INFO',
      text: 'Select an ability [1-4] and click any grid node to trigger a 1-Turn Lethal Chain Reaction!',
    },
  ]);
  const [lastTurnStats, setLastTurnStats] = useState(null);
  const [adBoostSeconds, setAdBoostSeconds] = useState(0);
  const [rewardedModalConfig, setRewardedModalConfig] = useState({
    isOpen: false,
    rewardTitle: '',
    onClaim: () => {},
  });
  const [showRevenueDashboard, setShowRevenueDashboard] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [telemetryFeed, setTelemetryFeed] = useState([]);
  const [shareCopied, setShareCopied] = useState(false);

  // Initialize GA4 & AdSense + subscribe to live telemetry feed
  useEffect(() => {
    initAnalyticsAndAds();
    const unsub = subscribeToTelemetry((entries) => {
      setTelemetryFeed(entries);
    });
    return unsub;
  }, []);

  // Persist save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // Ignore storage quota errors
    }
  }, [save]);

  // Keyboard shortcuts [1-4] for abilities and [R] for new wave
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '1') setSelectedAbilityId('rail_beam');
      if (e.key === '2') setSelectedAbilityId('nova_bomb');
      if (e.key === '3') setSelectedAbilityId('arc_chain');
      if (e.key === '4') setSelectedAbilityId('overclock_pulse');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Countdown for 2x Ad Boost Multiplier
  useEffect(() => {
    if (adBoostSeconds <= 0) return;
    const t = setInterval(() => {
      setAdBoostSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [adBoostSeconds]);

  // Passive Auto-Drone Automation Loop (Fires every 2.5s if unlocked in Campaign mode)
  useEffect(() => {
    const droneLevel = save.upgrades.auto_drone || 0;
    if (droneLevel <= 0 || gameMode !== 'CAMPAIGN') return;

    const timer = setInterval(() => {
      const passiveIncome = Math.ceil(
        droneLevel * 4 * (1 + (save.upgrades.shard_mult || 0) * 0.35) * (adBoostSeconds > 0 ? 2 : 1)
      );
      setSave((prev) => ({
        ...prev,
        shards: prev.shards + passiveIncome,
        totalShardsEarned: prev.totalShardsEarned + passiveIncome,
      }));
    }, 2500);

    return () => clearInterval(timer);
  }, [save.upgrades.auto_drone, save.upgrades.shard_mult, gameMode, adBoostSeconds]);

  // Spawn a fresh board for Campaign or Daily Challenge
  const startNewBoard = (targetMode = gameMode, targetSector = save.sector, customGridSize = null) => {
    const isDaily = targetMode === 'DAILY';
    const gSize = isDaily ? 5 : customGridSize || Math.min(8, 3 + (save.upgrades.grid_size || 0));
    const maxChg = isDaily ? 3 : 2 + (save.upgrades.max_charges || 0);

    const nextCells = generateBoard({
      gridSize: gSize,
      sector: isDaily ? 5 : targetSector,
      volatileBonusLevel: isDaily ? 3 : save.upgrades.volatile_spawn || 0,
      seedString: isDaily ? `DAILY-SEED-${getTodayDateSeed()}` : null,
      isDaily,
    });

    setBoard(nextCells);
    setChargesLeft(maxChg);
    setTurnAmplifierBonus(1);
    setLastTurnStats(null);
  };

  // Switch between Incremental Campaign and Daily Seed Challenge
  const handleSwitchMode = (nextMode) => {
    setGameMode(nextMode);
    startNewBoard(nextMode, save.sector);
    trackEvent('switch_game_mode', { mode: nextMode });
  };

  // Preview highlighted tiles on hover
  const previewIndices = getAbilityPreviewIndices({
    abilityId: selectedAbilityId,
    abilityLevel: gameMode === 'DAILY' ? 3 : save.abilityLevels[selectedAbilityId] || 1,
    targetRow: hoverCell.row,
    targetCol: hoverCell.col,
    gridSize: activeGridSize,
    cells: board,
  });

  // Execute Tactical Strike on cell click
  const handleCellClick = (row, col) => {
    if (chargesLeft <= 0) return;

    const prestigeMult = 1 + (save.overclockCores || 0) * 0.5;
    const adMult = (adBoostSeconds > 0 ? 2 : 1) * prestigeMult;

    const result = executeAbilityAndResolveChains({
      cells: board,
      gridSize: activeGridSize,
      targetRow: row,
      targetCol: col,
      abilityId: selectedAbilityId,
      abilityLevel: gameMode === 'DAILY' ? 3 : save.abilityLevels[selectedAbilityId] || 1,
      chainAmpLevel: gameMode === 'DAILY' ? 4 : save.upgrades.chain_amp || 0,
      shardMultLevel: save.upgrades.shard_mult || 0,
      adBoostMultiplier: adMult,
      sector: gameMode === 'DAILY' ? 5 : save.sector,
      turnAmplifierBonus,
    });

    const nextCharges = chargesLeft - 1;
    setBoard(result.nextCells);
    setChargesLeft(nextCharges);
    setTurnAmplifierBonus(result.nextTurnAmplifierBonus);
    setLastTurnStats(result.stats);

    // Sound effects
    if (result.stats.isBoardClear) {
      playSound('clear', muted);
    } else if (result.stats.chainDepth > 0) {
      playSound('chain', muted);
    } else {
      playSound('strike', muted);
    }

    // Combat log update
    const summaryLine = {
      id: `${Date.now()}-sum`,
      type: result.stats.isBoardClear ? 'CLEAR' : 'STRIKE',
      text: result.stats.isBoardClear
        ? `⚡ LETHAL OVERCLOCK CLEAR! Wiped board with ${result.stats.chainDepth}x Chain Depth (+${result.stats.shardsEarned} Shards)!`
        : `Dealt ${result.stats.totalDamageDealt} DMG (${result.stats.nodesDestroyed} destroyed, ${result.stats.chainDepth}x chain) → +${result.stats.shardsEarned} Shards`,
    };
    setCombatLog((prev) => [summaryLine, ...result.events.slice(0, 4), ...prev].slice(0, 12));

    // Update Save State & Progression
    const todaySeed = getTodayDateSeed();
    setSave((prev) => {
      const isClear = result.stats.isBoardClear;
      const nextSector =
        gameMode === 'CAMPAIGN' && isClear ? prev.sector + 1 : prev.sector;
      return {
        ...prev,
        shards: prev.shards + result.stats.shardsEarned,
        totalShardsEarned: prev.totalShardsEarned + result.stats.shardsEarned,
        sector: nextSector,
        maxSectorReached: Math.max(prev.maxSectorReached, nextSector),
        lethalClears: isClear ? prev.lethalClears + 1 : prev.lethalClears,
        dailyClearedDate:
          gameMode === 'DAILY' && isClear ? todaySeed : prev.dailyClearedDate,
      };
    });

    if (result.stats.isBoardClear) {
      trackEvent('lethal_board_clear', {
        mode: gameMode,
        sector: save.sector,
        grid_size: `${activeGridSize}x${activeGridSize}`,
        chain_depth: result.stats.chainDepth,
      });
    }
  };

  // Purchase an Incremental Upgrade
  const handleBuyUpgrade = (upgradeDef) => {
    const currentLvl = save.upgrades[upgradeDef.id] || 0;
    if (currentLvl >= upgradeDef.maxLevel) return;
    const cost = getUpgradeCost(upgradeDef, currentLvl);
    if (save.shards < cost) return;

    playSound('upgrade', muted);
    const nextLvl = currentLvl + 1;

    setSave((prev) => ({
      ...prev,
      shards: prev.shards - cost,
      upgrades: {
        ...prev.upgrades,
        [upgradeDef.id]: nextLvl,
      },
    }));

    trackEvent('upgrade_purchased', {
      upgrade_id: upgradeDef.id,
      new_level: nextLvl,
      cost,
    });

    // If the player expanded the grid size or max charges, refresh the board immediately!
    if (upgradeDef.id === 'grid_size' && gameMode === 'CAMPAIGN') {
      const newSize = Math.min(8, 3 + nextLvl);
      startNewBoard('CAMPAIGN', save.sector, newSize);
    } else if (upgradeDef.id === 'max_charges' && gameMode === 'CAMPAIGN') {
      setChargesLeft((c) => c + 1);
    }
  };

  // Upgrade an Ability Tier
  const handleUpgradeAbility = (abilityId, idx) => {
    const currentLvl = save.abilityLevels[abilityId] || 1;
    const cost = getAbilityUpgradeCost(idx, currentLvl);
    if (save.shards < cost) return;

    playSound('upgrade', muted);
    setSave((prev) => ({
      ...prev,
      shards: prev.shards - cost,
      abilityLevels: {
        ...prev.abilityLevels,
        [abilityId]: currentLvl + 1,
      },
    }));

    trackEvent('ability_upgraded', {
      ability_id: abilityId,
      new_level: currentLvl + 1,
      cost,
    });
  };

  // Prestige Overclock Reboot (Available at Sector 10+)
  const handlePrestigeReboot = () => {
    if (save.sector < 10) return;
    const coresToGain = Math.max(1, Math.floor((save.sector - 5) / 4));
    playSound('clear', muted);

    setSave((prev) => ({
      ...DEFAULT_SAVE,
      shards: 50,
      totalShardsEarned: prev.totalShardsEarned,
      maxSectorReached: prev.maxSectorReached,
      lethalClears: prev.lethalClears,
      overclockCores: (prev.overclockCores || 0) + coresToGain,
      dailyClearedDate: prev.dailyClearedDate,
      estSessionRevenueUsd: prev.estSessionRevenueUsd,
    }));

    startNewBoard('CAMPAIGN', 1, 3);
    trackEvent('prestige_overclock', { cores_gained: coresToGain });
  };

  // Copy Wordle-style Daily Share Result to Clipboard
  const handleShareScore = () => {
    const todaySeed = getTodayDateSeed();
    const emojiRows = [];
    for (let r = 0; r < activeGridSize; r++) {
      let rowStr = '';
      for (let c = 0; c < activeGridSize; c++) {
        const cell = board[r * activeGridSize + c];
        if (!cell || cell.type === NODE_TYPES.EMPTY) rowStr += '⬛';
        else if (cell.hp <= 0 && cell.destroyedByChain) rowStr += '💥';
        else if (cell.hp <= 0) rowStr += '⚡';
        else rowStr += '🟥';
      }
      emojiRows.push(rowStr);
    }

    const shareText = [
      `⚡ LETHAL GRID: OVERCLOCK (${
        gameMode === 'DAILY' ? `Daily #${todaySeed}` : `Sector ${save.sector}`
      })`,
      `Grid: ${activeGridSize}x${activeGridSize} | Lethal Clears: ${save.lethalClears}`,
      ...emojiRows,
      `Play Free: ${window.location.origin}`,
    ].join('\n');

    navigator.clipboard?.writeText(shareText);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
    trackEvent('share_score_copied', { mode: gameMode, sector: save.sector });
  };

  // Trigger a Rewarded Video Ad
  const triggerRewardedAd = (type) => {
    if (type === 'DOUBLE_SHARDS') {
      setRewardedModalConfig({
        isOpen: true,
        rewardTitle: '2x Overclock Shard Multiplier (3 Minutes)',
        onClaim: () => {
          setAdBoostSeconds((s) => s + 180);
          setSave((prev) => ({
            ...prev,
            estSessionRevenueUsd: +(prev.estSessionRevenueUsd + 0.025).toFixed(3),
          }));
        },
      });
    } else if (type === 'EXTRA_CHARGE') {
      setRewardedModalConfig({
        isOpen: true,
        rewardTitle: '+1 Emergency Ability Charge + 50 Bonus Shards',
        onClaim: () => {
          setChargesLeft((c) => c + 1);
          setSave((prev) => ({
            ...prev,
            shards: prev.shards + 50 + prev.sector * 15,
            estSessionRevenueUsd: +(prev.estSessionRevenueUsd + 0.025).toFixed(3),
          }));
        },
      });
    }
  };

  const remainingAliveNodes = board.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0).length;
  const isBoardCleared = remainingAliveNodes === 0;
  const monetizationConfig = getMonetizationConfig();

  return (
    <div className="app-shell">
      {/* TOP NAVIGATION & TELEMETRY BAR */}
      <header className="top-nav">
        <div className="brand-group">
          <div className="brand-logo">
            <Zap size={20} className="text-cyan" />
          </div>
          <div>
            <h1 className="brand-title">
              LETHAL GRID <span className="badge-cyan">OVERCLOCK</span>
            </h1>
            <p className="brand-subtitle">Incremental 1-Turn Tactical Chain-Reaction Game</p>
          </div>
        </div>

        <div className="mode-switcher" role="tablist" aria-label="Game Modes">
          <button
            type="button"
            role="tab"
            aria-selected={gameMode === 'CAMPAIGN'}
            className={`mode-tab ${gameMode === 'CAMPAIGN' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('CAMPAIGN')}
          >
            <Layers size={15} />
            Incremental Campaign
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={gameMode === 'DAILY'}
            className={`mode-tab ${gameMode === 'DAILY' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('DAILY')}
          >
            <Award size={15} />
            Daily Lethal ({getTodayDateSeed()})
            {save.dailyClearedDate === getTodayDateSeed() && (
              <CheckCircle2 size={14} className="text-emerald" />
            )}
          </button>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className={`btn-telemetry ${showRevenueDashboard ? 'active' : ''}`}
            onClick={() => setShowRevenueDashboard((v) => !v)}
            title="Inspect Google Analytics 4 Events & AdSense Revenue"
          >
            <Activity size={15} className="text-emerald" />
            <span>GA4 & Ad Revenue</span>
            <span className="revenue-pill">${save.estSessionRevenueUsd.toFixed(3)}</span>
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            title={muted ? 'Unmute SFX' : 'Mute SFX'}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      </header>

      {/* NON-INTRUSIVE TOP LEADERBOARD AD SLOT (ADSENSE COMPLIANT) */}
      <div className="top-ad-container">
        <AdBannerSlot
          slotId={import.meta.env.VITE_ADSENSE_TOP_SLOT || '1111111111'}
          label="Top Header Banner (728x90 Responsive)"
          format="horizontal"
        />
      </div>

      {/* OPTIONAL COLLAPSIBLE GA4 & AD REVENUE OWNER INSPECTOR */}
      {showRevenueDashboard && (
        <section className="owner-telemetry-panel" aria-label="Analytics and Ad Revenue Dashboard">
          <div className="telemetry-header">
            <div>
              <h2>
                <Activity size={18} className="text-emerald" /> Live Google Analytics 4 & AdSense Inspector
              </h2>
              <p>
                This panel shows you every GA4 event and Ad impression firing in real time. Configure{' '}
                <code>.env</code> to send live data to your Google accounts.
              </p>
            </div>
            <div className="telemetry-badges">
              <span className="status-tag">
                GA4 ID: <strong>{monetizationConfig.gaMeasurementId}</strong>
              </span>
              <span className="status-tag">
                AdSense ID: <strong>{monetizationConfig.adsenseClientId}</strong>
              </span>
            </div>
          </div>

          <div className="telemetry-feed">
            {telemetryFeed.map((item) => (
              <div key={item.id} className="telemetry-row">
                <span className="telemetry-time">{item.timestamp}</span>
                <span className={`telemetry-badge type-${item.type}`}>{item.type}</span>
                <strong className="telemetry-name">{item.name}</strong>
                <span className="telemetry-detail">{item.detail}</span>
                {item.estRevenue > 0 && (
                  <span className="telemetry-rev">+${item.estRevenue.toFixed(3)} est.</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* MAIN 3-COLUMN WORKSPACE: TACTICAL ARENA + INCREMENTAL UPGRADE SHOP */}
      <main className="game-workspace">
        {/* LEFT COLUMN: RESOURCES, ABILITY LOADOUT & REWARDED AD BOOSTS */}
        <section className="panel panel-loadout" aria-label="Tactical Abilities and Resources">
          {/* CURRENCY HUD */}
          <div className="resource-hud">
            <div className="resource-card primary-shard">
              <span className="resource-label">OVERCLOCK SHARDS</span>
              <div className="resource-value">
                <Sparkles size={20} className="text-cyan" />
                <span>{save.shards.toLocaleString()}</span>
              </div>
              <span className="resource-sub">
                Multiplier: x
                {(
                  (1 + (save.upgrades.shard_mult || 0) * 0.35) *
                  (1 + (save.overclockCores || 0) * 0.5) *
                  (adBoostSeconds > 0 ? 2 : 1)
                ).toFixed(2)}
                {save.upgrades.auto_drone > 0 &&
                  ` • Auto-Drone: +${save.upgrades.auto_drone * 4}/pulse`}
              </span>
            </div>

            <div className="resource-mini-row">
              <div className="resource-mini">
                <span>GRID SCALE</span>
                <strong>
                  {activeGridSize}×{activeGridSize}
                </strong>
              </div>
              <div className="resource-mini">
                <span>LETHAL CLEARS</span>
                <strong>{save.lethalClears}</strong>
              </div>
              <div className="resource-mini">
                <span>PRESTIGE CORES</span>
                <strong className="text-violet">{save.overclockCores || 0}</strong>
              </div>
            </div>
          </div>

          {/* 4 TACTICAL ABILITIES */}
          <div className="section-heading">
            <h2>1. SELECT TACTICAL ABILITY [1–4]</h2>
            <span>Click a tile on the grid to fire</span>
          </div>

          <div className="ability-list">
            {ABILITIES.map((ab, idx) => {
              const IconComponent = ABILITY_ICONS[ab.icon] || Crosshair;
              const lvl = gameMode === 'DAILY' ? 3 : save.abilityLevels[ab.id] || 1;
              const stats = ab.getStats(lvl);
              const upgCost = getAbilityUpgradeCost(idx, lvl);
              const canAfford = save.shards >= upgCost && gameMode === 'CAMPAIGN';
              const isSelected = selectedAbilityId === ab.id;

              return (
                <div
                  key={ab.id}
                  className={`ability-card color-${ab.color} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedAbilityId(ab.id)}
                >
                  <div className="ability-card-main">
                    <div className={`ability-icon bg-${ab.color}`}>
                      <IconComponent size={18} />
                      <span className="hotkey-badge">{ab.hotkey}</span>
                    </div>
                    <div className="ability-info">
                      <div className="ability-title-row">
                        <strong>{ab.name}</strong>
                        <span className="ability-lvl">Lv.{lvl}</span>
                      </div>
                      <p className="ability-tier">{stats.tierLabel}</p>
                      <p className="ability-desc">
                        <strong className="text-white">{stats.damage} DMG</strong> • {ab.baseDesc}
                      </p>
                    </div>
                  </div>

                  {gameMode === 'CAMPAIGN' && (
                    <button
                      type="button"
                      className={`btn-upgrade-inline ${canAfford ? 'affordable' : ''}`}
                      disabled={!canAfford}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpgradeAbility(ab.id, idx);
                      }}
                    >
                      <span>Evolve</span>
                      <strong>{upgCost.toLocaleString()} ⚡</strong>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* HIGH-ECPM REWARDED VIDEO AD TRIGGERS */}
          <div className="rewarded-boost-box">
            <div className="rewarded-box-title">
              <Gift size={16} className="text-amber" />
              <span>OPTIONAL OVERCLOCK AD BOOSTS</span>
            </div>
            <div className="rewarded-buttons">
              <button
                type="button"
                className="btn-reward"
                onClick={() => triggerRewardedAd('DOUBLE_SHARDS')}
              >
                <span>
                  {adBoostSeconds > 0
                    ? `🔥 2x Shards Active (${adBoostSeconds}s)`
                    : '📺 Watch Ad: 2x Shards (3m)'}
                </span>
              </button>
              <button
                type="button"
                className="btn-reward"
                onClick={() => triggerRewardedAd('EXTRA_CHARGE')}
              >
                <span>📺 Watch Ad: +1 Charge & Shards</span>
              </button>
            </div>
          </div>
        </section>

        {/* CENTER COLUMN: INTERACTIVE TACTICAL GRID BOARD */}
        <section className="panel panel-arena" aria-label="Tactical Chain-Reaction Grid">
          <div className="arena-header">
            <div className="sector-controls">
              {gameMode === 'CAMPAIGN' ? (
                <>
                  <button
                    type="button"
                    className="btn-sector-nav"
                    disabled={save.sector <= 1}
                    onClick={() => {
                      const prevSec = Math.max(1, save.sector - 1);
                      setSave((s) => ({ ...s, sector: prevSec }));
                      startNewBoard('CAMPAIGN', prevSec);
                    }}
                  >
                    ◀
                  </button>
                  <div className="sector-badge">
                    <span className="sector-eyebrow">
                      {save.sector % 5 === 0 ? '⚠️ BOSS SECTOR' : 'ACTIVE SECTOR'}
                    </span>
                    <strong>SECTOR {save.sector}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn-sector-nav"
                    disabled={save.sector >= save.maxSectorReached}
                    onClick={() => {
                      const nextSec = save.sector + 1;
                      setSave((s) => ({ ...s, sector: nextSec }));
                      startNewBoard('CAMPAIGN', nextSec);
                    }}
                  >
                    ▶
                  </button>
                </>
              ) : (
                <div className="sector-badge daily-badge">
                  <span className="sector-eyebrow">GLOBAL SHARED SEED</span>
                  <strong>DAILY LETHAL #{getTodayDateSeed()}</strong>
                </div>
              )}
            </div>

            {/* 1-TURN ACTION CHARGES PIPS */}
            <div className="charges-display">
              <span className="charges-label">1-TURN CHARGES:</span>
              <div className="charge-pips">
                {Array.from({ length: maxTurnCharges }).map((_, i) => (
                  <span
                    key={i}
                    className={`charge-pip ${i < chargesLeft ? 'active' : 'spent'}`}
                  />
                ))}
              </div>
              {turnAmplifierBonus > 1 && (
                <span className="amp-pill">
                  +{Math.round((turnAmplifierBonus - 1) * 100)}% PRISM AMP
                </span>
              )}
            </div>

            <div className="arena-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => startNewBoard(gameMode, save.sector)}
              >
                <RotateCcw size={14} />
                <span>{isBoardCleared ? 'Next Wave' : 'Reset Wave'}</span>
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={handleShareScore}>
                <Share2 size={14} />
                <span>{shareCopied ? 'Copied Emoji Grid!' : 'Share'}</span>
              </button>
            </div>
          </div>

          {/* THE DYNAMIC SCALING TACTICAL GRID (3x3 up to 8x8) */}
          <div className="grid-stage">
            <div
              className="tactical-grid"
              style={{
                gridTemplateColumns: `repeat(${activeGridSize}, minmax(0, 1fr))`,
              }}
              onMouseLeave={() => setHoverCell({ row: null, col: null })}
            >
              {board.map((cell, idx) => {
                const isTargeted = previewIndices.has(idx);
                const isDead = cell.type === NODE_TYPES.EMPTY || cell.hp <= 0;
                const meta = NODE_META[cell.type] || NODE_META.STANDARD;
                const hpPercent = cell.maxHp > 0 ? Math.max(0, (cell.hp / cell.maxHp) * 100) : 0;

                return (
                  <button
                    key={cell.id}
                    type="button"
                    disabled={chargesLeft <= 0}
                    className={[
                      'grid-tile',
                      isDead ? 'tile-dead' : `tile-alive color-${meta.color}`,
                      isTargeted ? 'tile-targeted' : '',
                      cell.justHit ? 'tile-hit-flash' : '',
                      cell.destroyedByChain ? 'tile-chain-wrecked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => setHoverCell({ row: cell.row, col: cell.col })}
                    onFocus={() => setHoverCell({ row: cell.row, col: cell.col })}
                    onClick={() => handleCellClick(cell.row, cell.col)}
                    aria-label={`Row ${cell.row + 1} Col ${cell.col + 1}: ${
                      isDead ? 'Cleared' : `${meta.label} ${cell.hp} HP`
                    }`}
                  >
                    {!isDead ? (
                      <>
                        <div className="tile-top-row">
                          <span className="tile-type-tag">
                            {cell.type === NODE_TYPES.CONDUIT
                              ? cell.conduitAxis === 'ROW'
                                ? '↔ ARC'
                                : '↕ ARC'
                              : cell.type === NODE_TYPES.BOMB
                              ? '💣 BMB'
                              : cell.type === NODE_TYPES.AMPLIFIER
                              ? '💎 AMP'
                              : cell.type === NODE_TYPES.BOSS
                              ? '👑 BOSS'
                              : '⚙️ DRN'}
                          </span>
                          {cell.vulnerable > 1 && (
                            <span className="vuln-tag">{cell.vulnerable}x</span>
                          )}
                        </div>

                        <div className="tile-hp-number">{cell.hp}</div>

                        <div className="tile-hp-bar-bg">
                          <div
                            className="tile-hp-bar-fill"
                            style={{ width: `${hpPercent}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="tile-cleared-mark">
                        {cell.destroyedByChain ? '💥' : '✓'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* OVERLAY BANNER WHEN WAVE IS CLEARED OR OUT OF CHARGES */}
            {(isBoardCleared || chargesLeft === 0) && (
              <div className={`turn-result-banner ${isBoardCleared ? 'win' : 'retry'}`}>
                <div>
                  <strong>
                    {isBoardCleared
                      ? '⚡ LETHAL OVERCLOCK CLEAR! 100% SECTOR WIPED!'
                      : `Turn Complete • ${remainingAliveNodes} Nodes Remaining`}
                  </strong>
                  <p>
                    {isBoardCleared
                      ? `You earned +${lastTurnStats?.shardsEarned || 0} Shards (with 1.75x Lethal Clear Bonus!)`
                      : 'Tip: Target Volatile Mines (💣) and Arc Pylons (↔/↕) first to trigger recursive chain reactions!'}
                  </p>
                </div>
                <div className="banner-buttons">
                  {!isBoardCleared && (
                    <button
                      type="button"
                      className="btn-reward-inline"
                      onClick={() => triggerRewardedAd('EXTRA_CHARGE')}
                    >
                      📺 +1 Charge (Watch Ad)
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => startNewBoard(gameMode, save.sector)}
                  >
                    <FastForward size={16} />
                    <span>
                      {isBoardCleared
                        ? gameMode === 'CAMPAIGN'
                          ? `Launch Sector ${save.sector}`
                          : 'Replay Daily Board'
                        : 'Spawn Fresh Wave'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* NODE LEGEND & REAL-TIME CHAIN REACTION LOG */}
          <div className="arena-footer">
            <div className="node-legend">
              <span>
                <strong className="text-rose">💣 BMB:</strong> 3×3 Blast on Death
              </span>
              <span>
                <strong className="text-amber">↔/↕ ARC:</strong> Row/Col Laser on Death
              </span>
              <span>
                <strong className="text-emerald">💎 AMP:</strong> +50% Turn Damage on Death
              </span>
              <span>
                <strong className="text-violet">👑 BOSS:</strong> 5×5 Mega-Blast + 5× Shards
              </span>
            </div>

            <div className="combat-log-box" aria-live="polite">
              {combatLog.slice(0, 3).map((entry) => (
                <div key={entry.id} className={`log-line log-${entry.type}`}>
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: INCREMENTAL GRID EXPANSION & UPGRADE TREE + SIDEBAR AD */}
        <section className="panel panel-upgrades" aria-label="Incremental Upgrades and Scaling">
          <div className="section-heading">
            <h2>
              <TrendingUp size={16} className="text-emerald" /> 2. INCREMENTAL MATRIX UPGRADES
            </h2>
            <span>Scale your Grid Size, Charges & Automation</span>
          </div>

          <div className="upgrade-list">
            {UPGRADE_CATALOG.map((upg) => {
              const lvl = save.upgrades[upg.id] || 0;
              const isMax = lvl >= upg.maxLevel;
              const cost = getUpgradeCost(upg, lvl);
              const canAfford = !isMax && save.shards >= cost;

              return (
                <div key={upg.id} className={`upgrade-item ${canAfford ? 'can-buy' : ''}`}>
                  <div className="upgrade-meta">
                    <div className="upgrade-title-line">
                      <strong>{upg.name}</strong>
                      <span className="upgrade-level-pill">
                        Lv.{lvl}/{upg.maxLevel}
                      </span>
                    </div>
                    <p className="upgrade-effect">{upg.getEffectText(lvl)}</p>
                  </div>

                  <button
                    type="button"
                    className={`btn-buy-upgrade ${canAfford ? 'affordable' : ''}`}
                    disabled={!canAfford || isMax}
                    onClick={() => handleBuyUpgrade(upg)}
                  >
                    {isMax ? 'MAXED' : `${cost.toLocaleString()} ⚡`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* PRESTIGE OVERCLOCK REBOOT CARD */}
          <div className="prestige-card">
            <div className="prestige-info">
              <strong>
                <Cpu size={15} className="text-violet" /> Prestige: Overclock Reboot
              </strong>
              <p>
                Requires Sector 10 (Current: Sector {save.sector}). Reboots sector progress in exchange
                for permanent <strong>+50% Shard & Damage Overclock Cores</strong>!
              </p>
            </div>
            <button
              type="button"
              className="btn-prestige"
              disabled={save.sector < 10}
              onClick={handlePrestigeReboot}
            >
              {save.sector < 10 ? (
                <>
                  <Lock size={13} /> Unlock at Sector 10
                </>
              ) : (
                `Reboot for +${Math.max(1, Math.floor((save.sector - 5) / 4))} Cores`
              )}
            </button>
          </div>

          {/* SIDEBAR RECTANGLE AD SLOT */}
          <AdBannerSlot
            slotId={import.meta.env.VITE_ADSENSE_SIDEBAR_SLOT || '2222222222'}
            label="Sidebar Ad Slot (300x250)"
            format="rectangle"
          />
        </section>
      </main>

      {/* BELOW-THE-FOLD SEO GUIDE & ADSENSE APPROVAL CONTENT */}
      <section className="seo-guide-section" aria-label="Game Strategy Guide and Documentation">
        <div className="seo-grid">
          <article className="seo-card">
            <h3>
              <BookOpen size={18} className="text-cyan" /> How to Play Lethal Grid: Overclock
            </h3>
            <p>
              <strong>Lethal Grid: Overclock</strong> blends tactical one-turn puzzle mechanics
              (&ldquo;Find Lethal&rdquo;) with exponential incremental progression. Each Sector spawns
              a cybernetic grid of armored nodes. Your objective is to wipe 100% of the board in a
              single turn using your available Ability Charges.
            </p>
            <ul>
              <li>
                <strong>Trigger Chain Reactions:</strong> Destroying a <em>Volatile Mine (BMB)</em>{' '}
                detonates a 3×3 blast around it, while destroying an <em>Arc Pylon (ARC)</em> fires a
                high-voltage beam across its entire row or column.
              </li>
              <li>
                <strong>Shatter Prism Catalysts First:</strong> Hitting a green{' '}
                <em>Prism Catalyst (AMP)</em> permanently boosts all subsequent ability and chain
                damage during that turn by +50%.
              </li>
              <li>
                <strong>Scale Your Battlefield:</strong> Spend Overclock Shards to expand your tactical
                arena from a compact <strong>3×3 grid</strong> all the way to a massive{' '}
                <strong>8×8 mega-grid</strong> with dozens of simultaneous chain reactions!
              </li>
            </ul>
          </article>

          <article className="seo-card">
            <h3>
              <HelpCircle size={18} className="text-amber" /> Daily Seed Challenge & Idle Automation
            </h3>
            <p>
              Every 24 hours at 00:00 UTC, the <strong>Daily Lethal Challenge</strong> generates a
              standardized 5×5 tactical puzzle using a deterministic mathematical date seed. Every
              player worldwide faces the exact same board layout and ability tiers—allowing you to
              share your emoji battle report with friends on Discord, Reddit, or X.
            </p>
            <p>
              Prefer idle incremental progression? Unlock the <strong>Autonomous Pulse Drone</strong>{' '}
              in the Upgrade Matrix to automatically harvest Overclock Shards every 2.5 seconds while
              you plan your next Boss Sector breakthrough.
            </p>
            <div className="seo-footer-links">
              <button
                type="button"
                className="btn-link"
                onClick={() => setShowPrivacyModal(true)}
              >
                <Shield size={14} /> Privacy Policy, Cookies & AdSense Disclosure
              </button>
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  if (window.confirm('Reset all local save progress?')) {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                  }
                }}
              >
                Reset Local Save Data
              </button>
            </div>
          </article>
        </div>
      </section>

      {/* REWARDED VIDEO AD MODAL */}
      <RewardedAdModal
        isOpen={rewardedModalConfig.isOpen}
        onClose={() => setRewardedModalConfig((prev) => ({ ...prev, isOpen: false }))}
        rewardTitle={rewardedModalConfig.rewardTitle}
        onRewardClaimed={rewardedModalConfig.onClaim}
      />

      {/* PRIVACY POLICY & COOKIE DISCLOSURE MODAL (REQUIRED FOR GOOGLE ADSENSE APPROVAL) */}
      {showPrivacyModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card privacy-modal-card">
            <h3>Privacy Policy & Google AdSense / Analytics Disclosure</h3>
            <p>
              <strong>1. Local Browser Storage:</strong> Lethal Grid: Overclock stores your game
              progress (Overclock Shards, Sector level, and Upgrades) locally in your browser&apos;s{' '}
              <code>localStorage</code>. No personal account registration is required.
            </p>
            <p>
              <strong>2. Google Analytics (GA4):</strong> We use Google Analytics to measure anonymous
              gameplay metrics such as waves cleared, session duration, and upgrade popularity so we
              can balance and improve the game.
            </p>
            <p>
              <strong>3. Google AdSense & Cookies:</strong> Third-party vendors, including Google, use
              cookies to serve ads based on a user&apos;s prior visits to this website or other
              websites. Google&apos;s use of advertising cookies enables it and its partners to serve
              ads to users based on their visit to this site and/or other sites on the Internet. Users
              may opt out of personalized advertising by visiting{' '}
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noreferrer"
                className="text-cyan"
              >
                Google Ads Settings
              </a>
              .
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowPrivacyModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
