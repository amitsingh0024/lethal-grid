import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
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
import { CreatureSprite, WeaponPixelIcon } from './components/CreatureSprite';
import { BattleVFXCanvas } from './components/BattleVFXCanvas';
import { DungeonStageBanner } from './components/DungeonStageBanner';

const STORAGE_KEY = 'siege_of_emberkeep_save_v1';

function WeaponIllustration({ id }) {
  return <WeaponPixelIcon id={id} size={36} />;
}

/**
 * Medieval Acoustic SFX Synthesizer (Bow Twang, Alchemist Shatter, Barrel Boom, Fanfare)
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
      // Bowstring twang / sword thud
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.18);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'chain') {
      // Deep black-powder barrel boom
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.32);
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === 'clear') {
      // Royal Brass Horn Fanfare chord
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(293.66, now); // D4
      osc.frequency.setValueAtTime(369.99, now + 0.09); // F#4
      osc.frequency.setValueAtTime(440.0, now + 0.18); // A4
      osc.frequency.setValueAtTime(587.33, now + 0.28); // D5
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'upgrade') {
      // Blacksmith anvil clink
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch {
    // Ignore audio context blocks
  }
}

const DEFAULT_SAVE = {
  tutorialCompleted: false,
  shards: 30, // Gold Crowns
  totalShardsEarned: 30,
  sector: 1,
  maxSectorReached: 1,
  lethalClears: 0,
  overclockCores: 0, // Royal Crests
  upgrades: {
    grid_size: 0,
    max_charges: 0,
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
  const [vfxQueue, setVfxQueue] = useState([]);
  const [firingWeaponId, setFiringWeaponId] = useState(null);

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
    'Choose a Siege Weapon below and strike a raider in the stone courtyard!'
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

  useEffect(() => {
    initAnalyticsAndAds();
    const unsub = subscribeToTelemetry((entries) => {
      setTelemetryFeed(entries);
    });
    return unsub;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // Ignore storage quota errors
    }
  }, [save]);

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

  useEffect(() => {
    if (adBoostSeconds <= 0) return;
    const t = setInterval(() => {
      setAdBoostSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [adBoostSeconds]);

  // Passive Battlement Archers Gold Loop
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
        ? `Royal Daily Decree #${getTodayDateSeed()}: Every Commander in the realm faces this exact Siege formation today!`
        : `Wave ${targetSector}: Aim for Powder-Keg Sappers and Storm-Rune Shamans to rout the whole courtyard in ONE turn!`
    );
  };

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

  // Execute Weapon Strike + Trigger 60fps Canvas Weapon Animation
  const handleCellClick = (row, col) => {
    if (chargesLeft <= 0) return;

    // Trigger physical recoil/use animation on the weapon card in the dock
    setFiringWeaponId(selectedAbilityId);
    setTimeout(() => setFiringWeaponId(null), 420);

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

    // Enqueue 60fps Canvas weapon projectile & barrel explosion animations!
    if (result.vfxAnimations && result.vfxAnimations.length > 0) {
      setVfxQueue((prev) => [...prev.slice(-10), ...result.vfxAnimations]);
    }

    const nextCharges = chargesLeft - 1;
    setBoard(result.nextCells);
    setChargesLeft(nextCharges);
    setTurnAmplifierBonus(result.nextTurnAmplifierBonus);
    setLastTurnStats(result.stats);

    if (result.stats.chainDepth > 0 || result.stats.isBoardClear) {
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 380);
    }

    // Celebrate 100% Lethal Siege Clear with Golden Confetti!
    if (result.stats.isBoardClear) {
      try {
        confetti({
          particleCount: 45,
          spread: 65,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f59e0b', '#fef08a', '#dc2626'],
        });
      } catch {
        // Ignore confetti errors
      }
    }

    const popupId = `${Date.now()}-${Math.random()}`;
    setFloatingPopups((prev) => [
      ...prev.slice(-4),
      {
        id: popupId,
        row,
        col,
        text: result.stats.isBoardClear
          ? `⚔️ SIEGE BROKEN! +${result.stats.shardsEarned} Gold`
          : `-${result.stats.totalDamageDealt} HP (${result.stats.chainDepth}× Chain)`,
      },
    ]);
    setTimeout(() => {
      setFloatingPopups((prev) => prev.filter((p) => p.id !== popupId));
    }, 1150);

    if (result.stats.isBoardClear) {
      playSound('clear', muted);
    } else if (result.stats.chainDepth > 0) {
      playSound('chain', muted);
    } else {
      playSound('strike', muted);
    }

    if (screen === 'TUTORIAL') {
      if (result.stats.isBoardClear) {
        if (tutorialStep < 3) {
          setCommanderMessage(
            `HUZZAH! Every raider routed in a single volley! Click "Next Training Trial" below!`
          );
        } else {
          setCommanderMessage(
            `🏆 Training Complete! You've mastered Powder-Kegs, Storm-Rune Shamans, and War-Banners (+50 Gold Crowns awarded)!`
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
          `Close, Commander! Strike the glowing yellow-circled unit so its explosion chains to the entire courtyard!`
        );
      }
      return;
    }

    if (result.stats.isBoardClear) {
      setCommanderMessage(
        `⚔️ TOTAL VICTORY! ${result.stats.chainDepth}× Chain Reaction routed the siege for +${result.stats.shardsEarned} Gold Crowns!`
      );
    } else if (nextCharges > 0) {
      setCommanderMessage(
        `Direct hit! ${result.stats.remainingNodes} raiders remain and you have ${nextCharges} attack left—finish them!`
      );
    } else {
      setCommanderMessage(
        `Volley spent! You looted +${result.stats.shardsEarned} Gold Crowns. Call a fresh wave or visit the Royal Forge to upgrade!`
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

  const handleShareScore = () => {
    const todaySeed = getTodayDateSeed();
    const emojiRows = [];
    for (let r = 0; r < activeGridSize; r++) {
      let rowStr = '';
      for (let c = 0; c < activeGridSize; c++) {
        const cell = board[r * activeGridSize + c];
        if (!cell || cell.type === NODE_TYPES.EMPTY) rowStr += '⬛';
        else if (cell.hp <= 0 && cell.destroyedByChain) rowStr += '💥';
        else if (cell.hp <= 0) rowStr += '⚔️';
        else rowStr += '🛡️';
      }
      emojiRows.push(rowStr);
    }

    const shareText = [
      `🏰 SIEGE OF EMBERKEEP (${
        gameMode === 'DAILY' ? `Daily Decree #${todaySeed}` : `Wave ${save.sector}`
      })`,
      `Courtyard: ${activeGridSize}×${activeGridSize} | Sieges Broken: ${save.lethalClears}`,
      ...emojiRows,
      `Play Free: ${window.location.origin}`,
    ].join('\n');

    navigator.clipboard?.writeText(shareText);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
    trackEvent('share_score_copied', { mode: gameMode, sector: save.sector });
  };

  const triggerRewardedAd = (type) => {
    if (type === 'DOUBLE_SHARDS') {
      setRewardedModalConfig({
        isOpen: true,
        rewardTitle: '2× Royal Gold Plunder Charter (3 Minutes)',
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
        rewardTitle: '+1 Emergency Siege Volley + 50 Gold Crowns',
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
      {/* MEDIEVAL WOODEN TAVERN & IRON HEADER BAR */}
      <header className="top-nav">
        <div
          className="brand-group clickable"
          onClick={() => setScreen('MENU')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setScreen('MENU')}
        >
          <div className="brand-logo">
            <Shield size={20} className="text-amber" />
          </div>
          <div>
            <h1 className="brand-title">
              SIEGE OF EMBERKEEP <span className="badge-cyan">ROYAL EDITION</span>
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
            <span>Keep Gate</span>
          </button>

          <button
            type="button"
            className={`mode-tab ${screen === 'TUTORIAL' ? 'active' : ''}`}
            onClick={() => startTutorial(1)}
          >
            <GraduationCap size={15} />
            <span>Training Yard</span>
          </button>

          <button
            type="button"
            className={`mode-tab ${screen === 'PLAY' ? 'active' : ''}`}
            onClick={() => startGameSession('CAMPAIGN', save.sector)}
          >
            <Play size={15} />
            <span>Defend Courtyard</span>
          </button>

          <button
            type="button"
            className={`mode-tab ${screen === 'UPGRADES' ? 'active' : ''}`}
            onClick={() => setScreen('UPGRADES')}
          >
            <ShoppingBag size={15} />
            <span>Royal Forge</span>
            {affordableUpgradesCount > 0 && (
              <span className="nav-badge-count">{affordableUpgradesCount}</span>
            )}
          </button>
        </nav>

        {/* GOLD POUCH & TELEMETRY */}
        <div className="top-actions">
          <div className="wallet-pill" title="Your Royal Gold Crowns">
            <span className="gold-coin-dot">🪙</span>
            <strong>{save.shards.toLocaleString()}</strong>
            <span>GOLD</span>
          </div>

          <button
            type="button"
            className={`btn-telemetry ${showRevenueDashboard ? 'active' : ''}`}
            onClick={() => setShowRevenueDashboard((v) => !v)}
            title="Inspect Google Analytics 4 Events & AdSense Revenue"
          >
            <Activity size={15} className="text-emerald" />
            <span className="hide-mobile">Ad Ledger</span>
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
                <Activity size={18} className="text-emerald" /> Live Google Analytics 4 & AdSense Ledger
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
          SCREEN 1: MEDIEVAL CASTLE GATE MENU
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

            <span className="menu-eyebrow">TACTICAL ONE-TURN MEDIEVAL SIEGE PUZZLE</span>
            <h2 className="menu-headline">Break the Goblin Siege in a Single Volley!</h2>
            <p className="menu-subheadline">
              Loose piercing <strong>Ballista Bolts</strong>, hurl{' '}
              <strong>Alchemist Wildfire Flasks</strong>, detonate reckless{' '}
              <strong>Powder-Keg Sappers</strong>, and expand your stone courtyard from{' '}
              <strong>3×3</strong> to a grand <strong>8×8 citadel</strong>!
            </p>

            <div className="menu-cta-stack">
              {!save.tutorialCompleted ? (
                <button
                  type="button"
                  className="btn-hero-primary"
                  onClick={() => startTutorial(1)}
                >
                  <GraduationCap size={24} />
                  <div>
                    <strong>Enter the Training Yard (60s Tutorial)</strong>
                    <span>Learn chain-reaction warfare with Sir Aldric (+50 Free Gold Crowns!)</span>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-hero-primary"
                  onClick={() => startGameSession('CAMPAIGN', save.sector)}
                >
                  <Play size={24} />
                  <div>
                    <strong>Defend the Keep (Wave {save.sector})</strong>
                    <span>
                      Courtyard: {campaignGridSize}×{campaignGridSize} • {save.shards.toLocaleString()}{' '}
                      Gold Crowns in Treasury
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
                    <Play size={18} className="text-amber" />
                    <div>
                      <strong>Skip to Siege Wave {save.sector}</strong>
                      <span>{campaignGridSize}×{campaignGridSize} Stone Courtyard</span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-menu-card"
                    onClick={() => startTutorial(1)}
                  >
                    <GraduationCap size={18} className="text-amber" />
                    <div>
                      <strong>Replay Training Yard</strong>
                      <span>Practice with Sir Aldric</span>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-menu-card"
                  onClick={() => startGameSession('DAILY', 5)}
                >
                  <Award size={18} className="text-rose" />
                  <div>
                    <strong>Royal Daily Decree</strong>
                    <span>Shared Global Siege #{getTodayDateSeed()}</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="btn-menu-card"
                  onClick={() => setScreen('UPGRADES')}
                >
                  <ShoppingBag size={18} className="text-emerald" />
                  <div>
                    <strong>The Royal Forge</strong>
                    <span>
                      {affordableUpgradesCount > 0
                        ? `${affordableUpgradesCount} Upgrades Ready to Forge!`
                        : 'Expand Courtyard & Weapons'}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* MEDIEVAL BESTIARY FIELD GUIDE */}
            <div className="bestiary-strip">
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.STANDARD} />
                <div>
                  <strong className="text-amber">Goblin Footpad</strong>
                  <span>Drops Gold Crowns</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.BOMB} />
                <div>
                  <strong className="text-rose">Powder-Keg Sapper</strong>
                  <span>3×3 Barrel Blast on death!</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.CONDUIT} />
                <div>
                  <strong className="text-cyan">Storm-Rune Shaman</strong>
                  <span>Row/Col Lightning on death!</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.AMPLIFIER} />
                <div>
                  <strong className="text-emerald">War-Banner Herald</strong>
                  <span>+50% Turn Damage on death!</span>
                </div>
              </div>
            </div>
          </div>

          <AdBannerSlot
            slotId={import.meta.env.VITE_ADSENSE_TOP_SLOT || '1111111111'}
            label="Royal Proclamation Banner (728x90)"
            format="horizontal"
          />
        </main>
      )}

      {/* =====================================================================
          SCREEN 2: STONE COURTYARD BATTLEFIELD & INTERACTIVE TRAINING YARD
          ===================================================================== */}
      {(screen === 'PLAY' || screen === 'TUTORIAL') && (
        <main className="arena-focused-stage">
          {/* BACKPACK HERO / PEGLIN STYLE TOP DUNGEON STAGE SCENE */}
          <DungeonStageBanner
            waveNumber={screen === 'TUTORIAL' ? tutorialStep : save.sector}
            remainingEnemies={remainingAliveNodes}
            totalEnemies={board.filter((c) => c.type !== NODE_TYPES.EMPTY).length}
            isAttacking={Boolean(firingWeaponId)}
            isCleared={isBoardCleared}
            commanderMessage={commanderMessage}
            selectedWeaponId={selectedAbilityId}
          />

          {/* STATUS STRIP: VOLLEY CHARGES + ACTIONS */}
          <div className="battle-hud-bar">
            <div className="charges-display">
              <span className="charges-label">SIEGE VOLLEYS LEFT:</span>
              <div className="charge-pips">
                {Array.from({ length: maxTurnCharges }).map((_, i) => (
                  <span
                    key={i}
                    className={`charge-pip ${i < chargesLeft ? 'active' : 'spent'}`}
                    title="Available Weapon Attack"
                  >
                    ⚔️
                  </span>
                ))}
              </div>
              {turnAmplifierBonus > 1 && (
                <span className="amp-pill">
                  +{Math.round((turnAmplifierBonus - 1) * 100)}% RALLY DAMAGE
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
                    {adBoostSeconds > 0 ? `2× Gold (${adBoostSeconds}s)` : '2× Gold Charter'}
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
                <span>{screen === 'TUTORIAL' ? 'Reset Trial' : 'New Wave'}</span>
              </button>

              {screen === 'PLAY' && (
                <button type="button" className="btn-secondary btn-sm" onClick={handleShareScore}>
                  <Share2 size={14} />
                  <span>{shareCopied ? 'Scroll Copied!' : 'Share'}</span>
                </button>
              )}
            </div>
          </div>

          {/* COBBLESTONE COURTYARD GRID + 60FPS CANVAS WEAPON VFX OVERLAY */}
          <div className={`grid-stage ${screenShake ? 'board-shake' : ''}`}>
            <div className="courtyard-board-wrap">
              {/* 60FPS WEAPON TRAJECTORY & EXPLOSION CANVAS */}
              <BattleVFXCanvas vfxQueue={vfxQueue} gridSize={activeGridSize} />

              <div
                className={`tactical-grid grid-size-${activeGridSize}`}
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
                        <span className="tutorial-click-tag">👇 STRIKE HERE!</span>
                      )}

                      {!isDead ? (
                        <>
                          <div className="tile-top-row">
                            <span className="tile-type-tag">{meta.short}</span>
                            <span className="tile-hp-pill">❤️ {cell.hp}</span>
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
                            <span className="tile-cleared-mark">🪨</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* WAVE VICTORY OR RETRY BANNER */}
            {(isBoardCleared || chargesLeft === 0) && (
              <div className={`turn-result-banner ${isBoardCleared ? 'win' : 'retry'}`}>
                <div>
                  <strong>
                    {isBoardCleared
                      ? '🎺 SIEGE BROKEN! 100% COURTYARD CLEARED!'
                      : `Volley Expended • ${remainingAliveNodes} Raiders Still Standing`}
                  </strong>
                  <p>
                    {screen === 'TUTORIAL'
                      ? isBoardCleared
                        ? 'Glorious chain reaction, Commander!'
                        : 'Click Reset Trial and strike the highlighted target!'
                      : isBoardCleared
                      ? `Looted +${lastTurnStats?.shardsEarned || 0} Gold Crowns (with 1.75× Total Victory Bonus!)`
                      : 'Tip: Visit the Royal Forge to sharpen your weapons or add extra Siege Volleys!'}
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
                          <span>Next Training Trial ({tutorialStep + 1}/3)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => startGameSession('CAMPAIGN', save.sector)}
                        >
                          <Play size={16} />
                          <span>March to Wave 1!</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => startTutorial(tutorialStep)}
                      >
                        <RotateCcw size={16} />
                        <span>Reset Trial</span>
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
                          📺 +1 Volley (Ad)
                        </button>
                      )}
                      {affordableUpgradesCount > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setScreen('UPGRADES')}
                        >
                          <ShoppingBag size={15} />
                          <span>Royal Forge ({affordableUpgradesCount})</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => startGameSession(gameMode, save.sector)}
                      >
                        <FastForward size={16} />
                        <span>
                          {isBoardCleared ? `March to Wave ${save.sector}` : 'Call Next Wave'}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* TACTILE WOODEN & IRON WEAPON DOCK */}
          <div className="weapon-dock" role="radiogroup" aria-label="Select Siege Weapon">
            {ABILITIES.map((ab) => {
              const lvl =
                screen === 'TUTORIAL'
                  ? 2
                  : gameMode === 'DAILY'
                  ? 3
                  : save.abilityLevels[ab.id] || 1;
              const stats = ab.getStats(lvl);
              const isSelected = selectedAbilityId === ab.id;
              const isFiring = firingWeaponId === ab.id;

              return (
                <button
                  key={ab.id}
                  type="button"
                  className={[
                    'weapon-dock-btn',
                    `color-${ab.color}`,
                    isSelected ? 'selected' : '',
                    isFiring ? 'weapon-firing-recoil' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedAbilityId(ab.id)}
                >
                  <div className={`ability-icon bg-${ab.color}`}>
                    <WeaponIllustration id={ab.id} />
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
          SCREEN 3: THE ROYAL FORGE (Separate Upgrade Screen)
          ===================================================================== */}
      {screen === 'UPGRADES' && (
        <main className="upgrade-lab-screen">
          <div className="upgrade-lab-header">
            <div>
              <h2>
                <TrendingUp size={22} className="text-amber" /> THE ROYAL BLACKSMITH FORGE
              </h2>
              <p>
                Spend your Gold Crowns to expand the castle courtyard (3×3 → 8×8), add extra Siege
                Volleys, and temper your 4 weapons!
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => startGameSession('CAMPAIGN', save.sector)}
            >
              <Play size={16} />
              <span>Return to Courtyard (Wave {save.sector})</span>
            </button>
          </div>

          <div className="upgrade-lab-columns">
            <section className="panel">
              <div className="section-heading">
                <h2>I. FORTIFICATIONS & BLACK POWDER</h2>
                <span>Expand your courtyard size and chain explosion damage</span>
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
                        {isMax ? 'MAXED' : `${cost.toLocaleString()} 🪙`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>II. TEMPER SIEGE WEAPONS</h2>
                <span>Increase direct strike damage & unlock wider blast patterns</span>
              </div>

              <div className="ability-list">
                {ABILITIES.map((ab, idx) => {
                  const lvl = save.abilityLevels[ab.id] || 1;
                  const stats = ab.getStats(lvl);
                  const upgCost = getAbilityUpgradeCost(idx, lvl);
                  const canAfford = save.shards >= upgCost;

                  return (
                    <div key={ab.id} className={`ability-card color-${ab.color}`}>
                      <div className="ability-card-main">
                        <div className={`ability-icon bg-${ab.color}`}>
                          <WeaponIllustration id={ab.id} />
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
                        Forge ({upgCost.toLocaleString()} 🪙)
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="prestige-card">
                <div className="prestige-info">
                  <strong>
                    <Cpu size={15} className="text-amber" /> Royal Ascension (Prestige)
                  </strong>
                  <p>
                    Requires Wave 10 (Current: Wave {save.sector}). Dedicate your stronghold to the
                    King in exchange for permanent <strong>+50% Gold & Damage Royal Crests</strong>!
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
                      <Lock size={13} /> Unlocks at Wave 10
                    </>
                  ) : (
                    `Ascend for +${Math.max(1, Math.floor((save.sector - 5) / 4))} Royal Crests`
                  )}
                </button>
              </div>
            </section>
          </div>

          <AdBannerSlot
            slotId={import.meta.env.VITE_ADSENSE_SIDEBAR_SLOT || '2222222222'}
            label="Royal Forge Banner Slot"
            format="horizontal"
          />
        </main>
      )}

      {/* CLEAN FOOTER BAR */}
      <footer className="clean-footer">
        <button
          type="button"
          className="btn-link"
          onClick={() => setShowGuideDrawer((v) => !v)}
        >
          <BookOpen size={14} /> {showGuideDrawer ? 'Close Field Manual' : 'Siege Field Manual & Rules'}
        </button>
        <span>•</span>
        <button
          type="button"
          className="btn-link"
          onClick={() => setShowPrivacyModal(true)}
        >
          <Shield size={14} /> Privacy Charter & AdSense Disclosure
        </button>
        <span>•</span>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            if (window.confirm('Reset all local Kingdom save progress?')) {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }
          }}
        >
          Reset Kingdom Save
        </button>
      </footer>

      {showGuideDrawer && (
        <section className="seo-guide-section" aria-label="Game Strategy Guide and Documentation">
          <div className="seo-grid">
            <article className="seo-card">
              <h3>
                <BookOpen size={18} className="text-amber" /> How to Play Siege of Emberkeep
              </h3>
              <p>
                <strong>Siege of Emberkeep</strong> blends tactical one-turn medieval puzzle warfare
                (&ldquo;Find Lethal&rdquo;) with incremental stronghold progression. Rout 100% of the
                invading raiders in the courtyard in a single turn using your Siege Volleys!
              </p>
              <ul>
                <li>
                  <strong>Powder-Keg Sappers (Red Barrel):</strong> Explode in a 3×3 fireball when
                  slain.
                </li>
                <li>
                  <strong>Storm-Rune Shamans (Blue Hood):</strong> Unleash a lightning bolt across
                  their row or column when slain.
                </li>
                <li>
                  <strong>War-Banner Heralds (Emerald Flag):</strong> Rally your siege weapons for
                  +50% turn damage when shattered.
                </li>
              </ul>
            </article>
            <article className="seo-card">
              <h3>
                <HelpCircle size={18} className="text-amber" /> The Royal Forge & Daily Decrees
              </h3>
              <p>
                Visit the <strong>Royal Forge</strong> anytime to expand your castle courtyard from a
                3×3 grid up to an 8×8 grand citadel, hire Battlement Archers for passive Gold Crowns,
                and temper your 4 siege weapons.
              </p>
            </article>
          </div>
        </section>
      )}

      <RewardedAdModal
        isOpen={rewardedModalConfig.isOpen}
        onClose={() => setRewardedModalConfig((prev) => ({ ...prev, isOpen: false }))}
        rewardTitle={rewardedModalConfig.rewardTitle}
        onRewardClaimed={rewardedModalConfig.onClaim}
      />

      {showPrivacyModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card privacy-modal-card">
            <h3>Privacy Charter & Google AdSense / Analytics Disclosure</h3>
            <p>
              <strong>1. Local Browser Storage:</strong> Siege of Emberkeep stores your Kingdom
              progress locally in your browser&apos;s <code>localStorage</code>.
            </p>
            <p>
              <strong>2. Google Analytics (GA4):</strong> We use Google Analytics to measure anonymous
              gameplay metrics such as waves cleared and weapon popularity.
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
                Close Scroll
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
