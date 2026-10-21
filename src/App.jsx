import React, { useState, useEffect } from 'react';
import {
  Crosshair,
  Flame,
  Zap,
  Sparkles,
  TrendingUp,
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
  Play,
  Home,
  ShoppingBag,
  GraduationCap,
} from 'lucide-react';
import {
  NODE_TYPES,
  NODE_META,
  ABILITIES,
  UPGRADE_CATALOG,
  TUTORIAL_LESSONS,
  generateBoard,
  generateTutorialBoard,
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
import { CreatureSprite, CommanderAvatar } from './components/CreatureSprite';

const STORAGE_KEY = 'lethal_grid_overclock_save_v2';

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
  tutorialCompleted: false,
  shards: 30,
  totalShardsEarned: 30,
  sector: 1,
  maxSectorReached: 1,
  lethalClears: 0,
  overclockCores: 0,
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
  estSessionRevenueUsd: 0.004,
};

export default function App() {
  // 1. Load Persistent Save State
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

  // Top-level screen state: 'MENU' | 'TUTORIAL' | 'PLAY' | 'UPGRADES'
  const [screen, setScreen] = useState('MENU');
  const [tutorialStep, setTutorialStep] = useState(1);

  const [gameMode, setGameMode] = useState('CAMPAIGN'); // 'CAMPAIGN' | 'DAILY'
  const [selectedAbilityId, setSelectedAbilityId] = useState('rail_beam');
  const [hoverCell, setHoverCell] = useState({ row: null, col: null });
  const [muted, setMuted] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [floatingPopups, setFloatingPopups] = useState([]);

  // Derived Grid & Turn Stats
  const campaignGridSize = Math.min(8, 3 + (save.upgrades.grid_size || 0));
  const activeGridSize =
    screen === 'TUTORIAL' ? 3 : gameMode === 'DAILY' ? 5 : campaignGridSize;
  const maxTurnCharges =
    screen === 'TUTORIAL' ? 1 : gameMode === 'DAILY' ? 3 : 2 + (save.upgrades.max_charges || 0);

  const [chargesLeft, setChargesLeft] = useState(maxTurnCharges);
  const [turnAmplifierBonus, setTurnAmplifierBonus] = useState(1);
  const [board, setBoard] = useState(() =>
    generateBoard({
      gridSize: campaignGridSize,
      sector: save.sector,
      volatileBonusLevel: save.upgrades.volatile_spawn,
    })
  );

  const [commanderMessage, setCommanderMessage] = useState(
    'Pick a weapon below and click a creature on the grid to trigger a chain reaction!'
  );
  const [lastTurnStats, setLastTurnStats] = useState(null);
  const [adBoostSeconds, setAdBoostSeconds] = useState(0);
  const [rewardedModalConfig, setRewardedModalConfig] = useState({
    isOpen: false,
    rewardTitle: '',
    onClaim: () => {},
  });
  const [showRevenueDashboard, setShowRevenueDashboard] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showGuideDrawer, setShowGuideDrawer] = useState(false);
  const [telemetryFeed, setTelemetryFeed] = useState([]);
  const [shareCopied, setShareCopied] = useState(false);

  // Initialize GA4 & AdSense
  useEffect(() => {
    initAnalyticsAndAds();
    const unsub = subscribeToTelemetry((entries) => {
      setTelemetryFeed(entries);
    });
    return unsub;
  }, []);

  // Persist save
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // Ignore storage quota errors
    }
  }, [save]);

  // Keyboard shortcuts [1-4] for abilities
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

  // Passive Auto-Drone Automation Loop
  useEffect(() => {
    const droneLevel = save.upgrades.auto_drone || 0;
    if (droneLevel <= 0) return;

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
  }, [save.upgrades.auto_drone, save.upgrades.shard_mult, adBoostSeconds]);

  // Launch Guided Tutorial
  const startTutorial = (step = 1) => {
    setScreen('TUTORIAL');
    setTutorialStep(step);
    setSelectedAbilityId('rail_beam');
    setBoard(generateTutorialBoard(step));
    setChargesLeft(1);
    setTurnAmplifierBonus(1);
    setLastTurnStats(null);
    const lesson = TUTORIAL_LESSONS[step - 1] || TUTORIAL_LESSONS[0];
    setCommanderMessage(lesson.commanderSpeech);
    trackEvent('tutorial_step_started', { step });
  };

  // Launch Main Game (Campaign or Daily)
  const startGameSession = (targetMode = 'CAMPAIGN', targetSector = save.sector, customGridSize = null) => {
    setScreen('PLAY');
    setGameMode(targetMode);
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
    setCommanderMessage(
      isDaily
        ? `Daily Seed #${getTodayDateSeed()}: Everyone on Earth gets this exact board today. Can you wipe it in 3 charges?`
        : `Sector ${targetSector}: Aim for red Pyro-Ticks and yellow Volt-Wisps to trigger a 1-Turn Lethal Chain Reaction!`
    );
  };

  // Preview highlighted tiles on hover
  const previewIndices = getAbilityPreviewIndices({
    abilityId: selectedAbilityId,
    abilityLevel:
      screen === 'TUTORIAL'
        ? 2
        : gameMode === 'DAILY'
        ? 3
        : save.abilityLevels[selectedAbilityId] || 1,
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
      abilityLevel:
        screen === 'TUTORIAL'
          ? 2
          : gameMode === 'DAILY'
          ? 3
          : save.abilityLevels[selectedAbilityId] || 1,
      chainAmpLevel: screen === 'TUTORIAL' ? 3 : gameMode === 'DAILY' ? 4 : save.upgrades.chain_amp || 0,
      shardMultLevel: save.upgrades.shard_mult || 0,
      adBoostMultiplier: adMult,
      sector: screen === 'TUTORIAL' ? 2 : gameMode === 'DAILY' ? 5 : save.sector,
      turnAmplifierBonus,
    });

    const nextCharges = chargesLeft - 1;
    setBoard(result.nextCells);
    setChargesLeft(nextCharges);
    setTurnAmplifierBonus(result.nextTurnAmplifierBonus);
    setLastTurnStats(result.stats);

    // Trigger screen shake & floating damage popup when chain reaction occurs
    if (result.stats.chainDepth > 0 || result.stats.isBoardClear) {
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 380);
    }

    const popupId = `${Date.now()}-${Math.random()}`;
    setFloatingPopups((prev) => [
      ...prev.slice(-4),
      {
        id: popupId,
        row,
        col,
        text: result.stats.isBoardClear
          ? `💥 LETHAL CLEAR! +${result.stats.shardsEarned}⚡`
          : `-${result.stats.totalDamageDealt} HP (${result.stats.chainDepth}x Chain)`,
      },
    ]);
    setTimeout(() => {
      setFloatingPopups((prev) => prev.filter((p) => p.id !== popupId));
    }, 1100);

    // Sound effects
    if (result.stats.isBoardClear) {
      playSound('clear', muted);
    } else if (result.stats.chainDepth > 0) {
      playSound('chain', muted);
    } else {
      playSound('strike', muted);
    }

    // Update Commander NOVA's dynamic reaction speech
    if (screen === 'TUTORIAL') {
      if (result.stats.isBoardClear) {
        if (tutorialStep < 3) {
          setCommanderMessage(
            `BOOM! 100% LETHAL CLEAR! Click "Next Tutorial Lesson" below to learn the next creature combo!`
          );
        } else {
          setCommanderMessage(
            `🎉 Tutorial Complete! You've mastered Pyro-Ticks, Volt-Wisps, and Crystal-Sprites (+50 Bonus Shards awarded)!`
          );
          setSave((prev) => ({
            ...prev,
            tutorialCompleted: true,
            shards: prev.shards + 50,
            totalShardsEarned: prev.totalShardsEarned + 50,
          }));
        }
      } else {
        setCommanderMessage(
          `Almost! Remember to click the highlighted pulsing creature so its explosion chains to the whole board. Click "Retry Lesson" to try again!`
        );
      }
      return;
    }

    // Campaign / Daily progression
    if (result.stats.isBoardClear) {
      setCommanderMessage(
        `⚡ OVERCLOCK LETHAL CLEAR! ${result.stats.chainDepth}x Chain Reaction wiped the sector for +${result.stats.shardsEarned} Shards!`
      );
    } else if (nextCharges > 0) {
      setCommanderMessage(
        `Nice hit! ${result.stats.remainingNodes} creatures left and ${nextCharges} charge remaining—finish them off!`
      );
    } else {
      setCommanderMessage(
        `Turn finished! You collected +${result.stats.shardsEarned} Shards. Spawn a new wave or visit the Upgrade Lab to power up!`
      );
    }

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

  // Prestige Overclock Reboot
  const handlePrestigeReboot = () => {
    if (save.sector < 10) return;
    const coresToGain = Math.max(1, Math.floor((save.sector - 5) / 4));
    playSound('clear', muted);

    setSave((prev) => ({
      ...DEFAULT_SAVE,
      tutorialCompleted: true,
      shards: 50,
      totalShardsEarned: prev.totalShardsEarned,
      maxSectorReached: prev.maxSectorReached,
      lethalClears: prev.lethalClears,
      overclockCores: (prev.overclockCores || 0) + coresToGain,
      dailyClearedDate: prev.dailyClearedDate,
      estSessionRevenueUsd: prev.estSessionRevenueUsd,
    }));

    startGameSession('CAMPAIGN', 1, 3);
    trackEvent('prestige_overclock', { cores_gained: coresToGain });
  };

  // Copy Wordle-style Daily Share Result
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

  // Check how many upgrades are currently affordable so we can show a notification badge on the Upgrade Lab button!
  const affordableUpgradesCount =
    UPGRADE_CATALOG.filter((u) => {
      const lvl = save.upgrades[u.id] || 0;
      return lvl < u.maxLevel && save.shards >= getUpgradeCost(u, lvl);
    }).length +
    ABILITIES.filter((ab, idx) => {
      const lvl = save.abilityLevels[ab.id] || 1;
      return save.shards >= getAbilityUpgradeCost(idx, lvl);
    }).length;

  const activeTutorialLesson =
    screen === 'TUTORIAL' ? TUTORIAL_LESSONS[tutorialStep - 1] || TUTORIAL_LESSONS[0] : null;

  return (
    <div className="app-shell">
      {/* CLEAN, FOCUSED TOP BAR */}
      <header className="top-nav">
        <div
          className="brand-group clickable"
          onClick={() => setScreen('MENU')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setScreen('MENU')}
        >
          <div className="brand-logo">
            <Zap size={20} className="text-cyan" />
          </div>
          <div>
            <h1 className="brand-title">
              LETHAL GRID <span className="badge-cyan">OVERCLOCK</span>
            </h1>
          </div>
        </div>

        {/* NAVIGATION PILLS */}
        <nav className="mode-switcher" aria-label="Primary Navigation">
          <button
            type="button"
            className={`mode-tab ${screen === 'MENU' ? 'active' : ''}`}
            onClick={() => setScreen('MENU')}
          >
            <Home size={15} />
            <span>Menu</span>
          </button>

          <button
            type="button"
            className={`mode-tab ${screen === 'TUTORIAL' ? 'active' : ''}`}
            onClick={() => startTutorial(1)}
          >
            <GraduationCap size={15} />
            <span>Tutorial</span>
          </button>

          <button
            type="button"
            className={`mode-tab ${screen === 'PLAY' ? 'active' : ''}`}
            onClick={() => startGameSession('CAMPAIGN', save.sector)}
          >
            <Play size={15} />
            <span>Battle Arena</span>
          </button>

          <button
            type="button"
            className={`mode-tab ${screen === 'UPGRADES' ? 'active' : ''}`}
            onClick={() => setScreen('UPGRADES')}
          >
            <ShoppingBag size={15} />
            <span>Upgrade Lab</span>
            {affordableUpgradesCount > 0 && (
              <span className="nav-badge-count">{affordableUpgradesCount}</span>
            )}
          </button>
        </nav>

        {/* SHARD WALLET & DEV TOOLS */}
        <div className="top-actions">
          <div className="wallet-pill" title="Your Overclock Shards">
            <Sparkles size={15} className="text-cyan" />
            <strong>{save.shards.toLocaleString()}</strong>
            <span>SHARDS</span>
          </div>

          <button
            type="button"
            className={`btn-telemetry ${showRevenueDashboard ? 'active' : ''}`}
            onClick={() => setShowRevenueDashboard((v) => !v)}
            title="Inspect Google Analytics 4 Events & AdSense Revenue"
          >
            <Activity size={15} className="text-emerald" />
            <span className="hide-mobile">Ad Revenue</span>
            <span className="revenue-pill">${save.estSessionRevenueUsd.toFixed(3)}</span>
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      </header>

      {/* COLLAPSIBLE GA4 & AD REVENUE OWNER INSPECTOR */}
      {showRevenueDashboard && (
        <section className="owner-telemetry-panel" aria-label="Analytics and Ad Revenue Dashboard">
          <div className="telemetry-header">
            <div>
              <h2>
                <Activity size={18} className="text-emerald" /> Live Google Analytics 4 & AdSense Inspector
              </h2>
              <p>
                Real-time GA4 events and Ad impressions. Configure <code>.env</code> to send live data to
                Google.
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

      {/* =====================================================================
          SCREEN 1: HERO START MENU (Clean, inviting, zero info overload!)
          ===================================================================== */}
      {screen === 'MENU' && (
        <main className="menu-screen">
          <div className="menu-hero-card">
            <div className="menu-mascot-showcase">
              <CreatureSprite type={NODE_TYPES.STANDARD} />
              <CreatureSprite type={NODE_TYPES.BOMB} />
              <CreatureSprite type={NODE_TYPES.BOSS} />
              <CreatureSprite type={NODE_TYPES.CONDUIT} />
              <CreatureSprite type={NODE_TYPES.AMPLIFIER} />
            </div>

            <span className="menu-eyebrow">ONE-TURN TACTICAL CHAIN-REACTION GAME</span>
            <h2 className="menu-headline">Can You Wipe the Grid in One Turn?</h2>
            <p className="menu-subheadline">
              Detonate volatile <strong>Pyro-Ticks</strong>, chain lightning through{' '}
              <strong>Volt-Wisps</strong>, and expand your battlefield from a cozy{' '}
              <strong>3×3 grid</strong> to a chaotic <strong>8×8 mega-sector</strong>!
            </p>

            <div className="menu-cta-stack">
              {!save.tutorialCompleted ? (
                <button
                  type="button"
                  className="btn-hero-primary pulse-glow"
                  onClick={() => startTutorial(1)}
                >
                  <GraduationCap size={22} />
                  <div>
                    <strong>Play 60-Second Interactive Tutorial</strong>
                    <span>Recommended for first-time Commanders (+50 Free Shards!)</span>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-hero-primary"
                  onClick={() => startGameSession('CAMPAIGN', save.sector)}
                >
                  <Play size={22} />
                  <div>
                    <strong>Continue Campaign (Sector {save.sector})</strong>
                    <span>
                      Current Grid: {campaignGridSize}×{campaignGridSize} • {save.shards.toLocaleString()}{' '}
                      Shards Ready
                    </span>
                  </div>
                </button>
              )}

              <div className="menu-secondary-grid">
                {!save.tutorialCompleted ? (
                  <button
                    type="button"
                    className="btn-menu-card"
                    onClick={() => startGameSession('CAMPAIGN', save.sector)}
                  >
                    <Play size={18} className="text-cyan" />
                    <div>
                      <strong>Skip to Campaign</strong>
                      <span>Sector {save.sector} ({campaignGridSize}×{campaignGridSize} Grid)</span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-menu-card"
                    onClick={() => startTutorial(1)}
                  >
                    <GraduationCap size={18} className="text-cyan" />
                    <div>
                      <strong>Replay Tutorial</strong>
                      <span>Practice chain-reaction combos</span>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-menu-card"
                  onClick={() => startGameSession('DAILY', 5)}
                >
                  <Award size={18} className="text-amber" />
                  <div>
                    <strong>Daily Seed Challenge</strong>
                    <span>Shared Global Board #{getTodayDateSeed()}</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="btn-menu-card"
                  onClick={() => setScreen('UPGRADES')}
                >
                  <ShoppingBag size={18} className="text-emerald" />
                  <div>
                    <strong>Upgrade Lab</strong>
                    <span>
                      {affordableUpgradesCount > 0
                        ? `${affordableUpgradesCount} Upgrades Available!`
                        : 'Scale Grid & Evolve Weapons'}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* CREATURE BESTIARY PREVIEW */}
            <div className="bestiary-strip">
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.STANDARD} />
                <div>
                  <strong className="text-cyan">Cyber-Mite</strong>
                  <span>Drops Shards on kill</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.BOMB} />
                <div>
                  <strong className="text-rose">Pyro-Tick</strong>
                  <span>Explodes 3×3 on death!</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.CONDUIT} />
                <div>
                  <strong className="text-amber">Volt-Wisp</strong>
                  <span>Fires Row/Col laser on death!</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.AMPLIFIER} />
                <div>
                  <strong className="text-emerald">Crystal-Sprite</strong>
                  <span>+50% Turn Damage on death!</span>
                </div>
              </div>
            </div>
          </div>

          <AdBannerSlot
            slotId={import.meta.env.VITE_ADSENSE_TOP_SLOT || '1111111111'}
            label="Main Menu Bottom Banner (728x90)"
            format="horizontal"
          />
        </main>
      )}

      {/* =====================================================================
          SCREEN 2: FOCUSED BATTLE ARENA & INTERACTIVE TUTORIAL
          ===================================================================== */}
      {(screen === 'PLAY' || screen === 'TUTORIAL') && (
        <main className="arena-focused-stage">
          {/* COMMANDER NOVA DIALOGUE & MISSION HEADER */}
          <div className="commander-dialogue-bar">
            <CommanderAvatar mood={isBoardCleared ? 'excited' : 'happy'} />
            <div className="commander-speech-box">
              <div className="commander-name-row">
                <strong>
                  {screen === 'TUTORIAL'
                    ? `COMMANDER NOVA • ${activeTutorialLesson?.title}`
                    : gameMode === 'DAILY'
                    ? `DAILY LETHAL CHALLENGE (#${getTodayDateSeed()})`
                    : `COMMANDER NOVA • SECTOR ${save.sector} (${activeGridSize}×${activeGridSize} GRID)`}
                </strong>

                {screen === 'PLAY' && gameMode === 'CAMPAIGN' && (
                  <div className="sector-stepper">
                    <button
                      type="button"
                      disabled={save.sector <= 1}
                      onClick={() => {
                        const prevSec = Math.max(1, save.sector - 1);
                        setSave((s) => ({ ...s, sector: prevSec }));
                        startGameSession('CAMPAIGN', prevSec);
                      }}
                    >
                      ◀ Prev Sector
                    </button>
                    <button
                      type="button"
                      disabled={save.sector >= save.maxSectorReached}
                      onClick={() => {
                        const nextSec = save.sector + 1;
                        setSave((s) => ({ ...s, sector: nextSec }));
                        startGameSession('CAMPAIGN', nextSec);
                      }}
                    >
                      Next Sector ▶
                    </button>
                  </div>
                )}
              </div>
              <p>{commanderMessage}</p>
            </div>
          </div>

          {/* STATUS STRIP: CHARGES LEFT + QUICK ACTIONS */}
          <div className="battle-hud-bar">
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
                  +{Math.round((turnAmplifierBonus - 1) * 100)}% CRYSTAL BOOST
                </span>
              )}
            </div>

            <div className="arena-actions">
              {screen === 'PLAY' && (
                <button
                  type="button"
                  className="btn-reward-chip"
                  onClick={() => triggerRewardedAd('DOUBLE_SHARDS')}
                >
                  <Gift size={14} />
                  <span>
                    {adBoostSeconds > 0 ? `2x Shards (${adBoostSeconds}s)` : '2x Shards Boost'}
                  </span>
                </button>
              )}

              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  screen === 'TUTORIAL'
                    ? startTutorial(tutorialStep)
                    : startGameSession(gameMode, save.sector)
                }
              >
                <RotateCcw size={14} />
                <span>{screen === 'TUTORIAL' ? 'Retry Lesson' : 'New Wave'}</span>
              </button>

              {screen === 'PLAY' && (
                <button type="button" className="btn-secondary btn-sm" onClick={handleShareScore}>
                  <Share2 size={14} />
                  <span>{shareCopied ? 'Copied!' : 'Share'}</span>
                </button>
              )}
            </div>
          </div>

          {/* THE INTERACTIVE CREATURE GRID */}
          <div className={`grid-stage ${screenShake ? 'board-shake' : ''}`}>
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

                const isTutorialTarget =
                  screen === 'TUTORIAL' &&
                  !isDead &&
                  activeTutorialLesson?.highlightCell.row === cell.row &&
                  activeTutorialLesson?.highlightCell.col === cell.col;

                const cellPopup = floatingPopups.find(
                  (p) => p.row === cell.row && p.col === cell.col
                );

                return (
                  <button
                    key={cell.id}
                    type="button"
                    disabled={chargesLeft <= 0}
                    className={[
                      'grid-tile',
                      isDead ? 'tile-dead' : `tile-alive color-${meta.color}`,
                      isTargeted ? 'tile-targeted' : '',
                      isTutorialTarget ? 'tile-tutorial-beacon' : '',
                      cell.justHit ? 'tile-hit-flash' : '',
                      cell.destroyedByChain ? 'tile-chain-wrecked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => setHoverCell({ row: cell.row, col: cell.col })}
                    onFocus={() => setHoverCell({ row: cell.row, col: cell.col })}
                    onClick={() => handleCellClick(cell.row, cell.col)}
                  >
                    {cellPopup && <span className="floating-dmg-popup">{cellPopup.text}</span>}

                    {isTutorialTarget && (
                      <span className="tutorial-click-tag">👇 CLICK HERE!</span>
                    )}

                    {!isDead ? (
                      <>
                        <div className="tile-top-row">
                          <span className="tile-type-tag">{meta.short}</span>
                          <span className="tile-hp-pill">{cell.hp} HP</span>
                        </div>

                        <CreatureSprite
                          type={cell.type}
                          conduitAxis={cell.conduitAxis}
                          isTargeted={isTargeted}
                          isLowHp={hpPercent <= 40}
                        />

                        <div className="tile-hp-bar-bg">
                          <div
                            className="tile-hp-bar-fill"
                            style={{ width: `${hpPercent}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="tile-wreckage">
                        {cell.destroyedByChain ? (
                          <span className="explosion-burst">💥</span>
                        ) : (
                          <span className="tile-cleared-mark">·</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* CLEAR / NEXT WAVE BANNER */}
            {(isBoardCleared || chargesLeft === 0) && (
              <div className={`turn-result-banner ${isBoardCleared ? 'win' : 'retry'}`}>
                <div>
                  <strong>
                    {isBoardCleared
                      ? '⚡ 100% LETHAL OVERCLOCK CLEAR!'
                      : `Out of Charges • ${remainingAliveNodes} Creatures Survived`}
                  </strong>
                  <p>
                    {screen === 'TUTORIAL'
                      ? isBoardCleared
                        ? 'You triggered a full chain reaction!'
                        : 'Click Retry Lesson and hit the highlighted creature!'
                      : isBoardCleared
                      ? `Earned +${lastTurnStats?.shardsEarned || 0} Shards (1.75x Lethal Bonus!)`
                      : 'Tip: Visit the Upgrade Lab to boost your damage or expand your charges!'}
                  </p>
                </div>

                <div className="banner-buttons">
                  {screen === 'TUTORIAL' ? (
                    isBoardCleared ? (
                      tutorialStep < 3 ? (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => startTutorial(tutorialStep + 1)}
                        >
                          <FastForward size={16} />
                          <span>Next Tutorial Lesson ({tutorialStep + 1}/3)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => startGameSession('CAMPAIGN', save.sector)}
                        >
                          <Play size={16} />
                          <span>Start Real Campaign!</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => startTutorial(tutorialStep)}
                      >
                        <RotateCcw size={16} />
                        <span>Retry Lesson</span>
                      </button>
                    )
                  ) : (
                    <>
                      {!isBoardCleared && (
                        <button
                          type="button"
                          className="btn-reward-inline"
                          onClick={() => triggerRewardedAd('EXTRA_CHARGE')}
                        >
                          📺 +1 Charge (Ad)
                        </button>
                      )}
                      {affordableUpgradesCount > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setScreen('UPGRADES')}
                        >
                          <ShoppingBag size={15} />
                          <span>Upgrade Lab ({affordableUpgradesCount})</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => startGameSession(gameMode, save.sector)}
                      >
                        <FastForward size={16} />
                        <span>
                          {isBoardCleared ? `Launch Sector ${save.sector}` : 'Spawn Fresh Wave'}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* COMPACT BOTTOM WEAPON DOCK (4 Weapons side-by-side) */}
          <div className="weapon-dock" role="radiogroup" aria-label="Select Tactical Weapon">
            {ABILITIES.map((ab) => {
              const IconComponent = ABILITY_ICONS[ab.icon] || Crosshair;
              const lvl =
                screen === 'TUTORIAL'
                  ? 2
                  : gameMode === 'DAILY'
                  ? 3
                  : save.abilityLevels[ab.id] || 1;
              const stats = ab.getStats(lvl);
              const isSelected = selectedAbilityId === ab.id;

              return (
                <button
                  key={ab.id}
                  type="button"
                  className={`weapon-dock-btn color-${ab.color} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedAbilityId(ab.id)}
                >
                  <div className={`ability-icon bg-${ab.color}`}>
                    <IconComponent size={18} />
                    <span className="hotkey-badge">{ab.hotkey}</span>
                  </div>
                  <div className="weapon-dock-text">
                    <div className="weapon-dock-top">
                      <strong>{ab.name}</strong>
                      <span className="weapon-dmg-badge">{stats.damage} DMG</span>
                    </div>
                    <span>{ab.baseDesc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </main>
      )}

      {/* =====================================================================
          SCREEN 3: SEPARATE UPGRADE LAB SCREEN (No clutter during battle!)
          ===================================================================== */}
      {screen === 'UPGRADES' && (
        <main className="upgrade-lab-screen">
          <div className="upgrade-lab-header">
            <div>
              <h2>
                <TrendingUp size={22} className="text-emerald" /> OVERCLOCK UPGRADE LAB
              </h2>
              <p>
                Spend your Overclock Shards to expand the grid size (3×3 → 8×8), add extra 1-Turn
                Charges, and evolve your 4 weapons!
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => startGameSession('CAMPAIGN', save.sector)}
            >
              <Play size={16} />
              <span>Return to Battle (Sector {save.sector})</span>
            </button>
          </div>

          <div className="upgrade-lab-columns">
            {/* LEFT: GRID & MATRIX UPGRADES */}
            <section className="panel">
              <div className="section-heading">
                <h2>1. BATTLEFIELD & SYNERGY UPGRADES</h2>
                <span>Expand your tactical grid and chain-reaction damage</span>
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
            </section>

            {/* RIGHT: WEAPON EVOLUTIONS & PRESTIGE */}
            <section className="panel">
              <div className="section-heading">
                <h2>2. EVOLVE TACTICAL WEAPONS</h2>
                <span>Boost direct strike damage & unlock wider blast patterns</span>
              </div>

              <div className="ability-list">
                {ABILITIES.map((ab, idx) => {
                  const IconComponent = ABILITY_ICONS[ab.icon] || Crosshair;
                  const lvl = save.abilityLevels[ab.id] || 1;
                  const stats = ab.getStats(lvl);
                  const upgCost = getAbilityUpgradeCost(idx, lvl);
                  const canAfford = save.shards >= upgCost;

                  return (
                    <div key={ab.id} className={`ability-card color-${ab.color}`}>
                      <div className="ability-card-main">
                        <div className={`ability-icon bg-${ab.color}`}>
                          <IconComponent size={18} />
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

                      <button
                        type="button"
                        className={`btn-buy-upgrade ${canAfford ? 'affordable' : ''}`}
                        disabled={!canAfford}
                        onClick={() => handleUpgradeAbility(ab.id, idx)}
                      >
                        Evolve ({upgCost.toLocaleString()} ⚡)
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="prestige-card">
                <div className="prestige-info">
                  <strong>
                    <Cpu size={15} className="text-violet" /> Prestige: Overclock Reboot
                  </strong>
                  <p>
                    Requires Sector 10 (Current: Sector {save.sector}). Reboots sector progress for
                    permanent <strong>+50% Shard & Damage Overclock Cores</strong>!
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
            </section>
          </div>

          <AdBannerSlot
            slotId={import.meta.env.VITE_ADSENSE_SIDEBAR_SLOT || '2222222222'}
            label="Upgrade Lab Banner Slot"
            format="horizontal"
          />
        </main>
      )}

      {/* CLEAN FOOTER BAR (Keeps AdSense SEO Guide & Privacy Policy accessible without cluttering gameplay) */}
      <footer className="clean-footer">
        <button
          type="button"
          className="btn-link"
          onClick={() => setShowGuideDrawer((v) => !v)}
        >
          <BookOpen size={14} /> {showGuideDrawer ? 'Hide Game Guide' : 'How to Play & Strategy Guide'}
        </button>
        <span>•</span>
        <button
          type="button"
          className="btn-link"
          onClick={() => setShowPrivacyModal(true)}
        >
          <Shield size={14} /> Privacy Policy & AdSense Disclosure
        </button>
        <span>•</span>
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
          Reset Save Data
        </button>
      </footer>

      {showGuideDrawer && (
        <section className="seo-guide-section" aria-label="Game Strategy Guide and Documentation">
          <div className="seo-grid">
            <article className="seo-card">
              <h3>
                <BookOpen size={18} className="text-cyan" /> How to Play Lethal Grid: Overclock
              </h3>
              <p>
                <strong>Lethal Grid: Overclock</strong> blends tactical one-turn puzzle mechanics
                (&ldquo;Find Lethal&rdquo;) with incremental progression. Wipe 100% of the cyber
                creatures on the grid in a single turn using your available Charges!
              </p>
              <ul>
                <li>
                  <strong>Pyro-Ticks (Red):</strong> Explode in a 3×3 area when destroyed.
                </li>
                <li>
                  <strong>Volt-Wisps (Yellow):</strong> Shoot a lightning beam across their row or
                  column when destroyed.
                </li>
                <li>
                  <strong>Crystal-Sprites (Green):</strong> Boost all subsequent damage this turn by
                  +50% when shattered.
                </li>
              </ul>
            </article>
            <article className="seo-card">
              <h3>
                <HelpCircle size={18} className="text-amber" /> Incremental Scaling & Daily Seeds
              </h3>
              <p>
                Visit the <strong>Upgrade Lab</strong> anytime to expand your battlefield from a 3×3
                grid up to an 8×8 mega-sector, unlock an Autonomous Pulse Drone, and evolve your 4
                weapons.
              </p>
            </article>
          </div>
        </section>
      )}

      {/* REWARDED VIDEO AD MODAL */}
      <RewardedAdModal
        isOpen={rewardedModalConfig.isOpen}
        onClose={() => setRewardedModalConfig((prev) => ({ ...prev, isOpen: false }))}
        rewardTitle={rewardedModalConfig.rewardTitle}
        onRewardClaimed={rewardedModalConfig.onClaim}
      />

      {/* PRIVACY POLICY & COOKIE DISCLOSURE MODAL */}
      {showPrivacyModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card privacy-modal-card">
            <h3>Privacy Policy & Google AdSense / Analytics Disclosure</h3>
            <p>
              <strong>1. Local Browser Storage:</strong> Lethal Grid: Overclock stores your game
              progress locally in your browser&apos;s <code>localStorage</code>.
            </p>
            <p>
              <strong>2. Google Analytics (GA4):</strong> We use Google Analytics to measure anonymous
              gameplay metrics such as waves cleared and upgrade popularity.
            </p>
            <p>
              <strong>3. Google AdSense & Cookies:</strong> Third-party vendors, including Google, use
              cookies to serve ads based on a user&apos;s prior visits to this website or other
              websites.
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
