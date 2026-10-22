import React, { useState, useEffect, useRef } from 'react';
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
  getUpgradeRequiredSector,
  getAbilityUpgradeCost,
  getRetryGoldMultiplier,
  getTodayDateSeed,
  createSeededRandom,
} from './game/engine';
import {
  initAnalyticsAndAds,
  trackEvent,
  subscribeToTelemetry,
  getMonetizationConfig,
  SHOW_DEV_TOOLS,
} from './services/analytics';
import { RewardedAdModal } from './components/AdUnit';
import { CreatureSprite, WeaponPixelIcon } from './components/CreatureSprite';
import { BattleVFXCanvas } from './components/BattleVFXCanvas';
import { DungeonStageBanner } from './components/DungeonStageBanner';
import { UpgradeSkillTree, SKILL_TREE_NODES } from './components/UpgradeSkillTree';

const STORAGE_KEY = 'siege_of_emberkeep_save_v2';
// A save that fails to parse is copied here instead of being silently overwritten
const CORRUPT_BACKUP_KEY = `${STORAGE_KEY}_corrupt_backup`;

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
  shards: 0, // Start at 0 Gold Crowns so players earn every upgrade
  totalShardsEarned: 0,
  sector: 1,
  maxSectorReached: 1,
  lethalClears: 0,
  overclockCores: 0, // Royal Crests
  upgrades: {
    grid_size: 0,
    max_charges: 0,
    lucky_spark: 0,
    contagion: 0,
    chain_amp: 0,
    shard_mult: 0,
    volatile_spawn: 0,
    auto_drone: 0,
  },
  // Start with only Heavy Ballista unlocked (Lv.1); other 3 weapons unlock in Royal Forge!
  abilityLevels: {
    rail_beam: 1,
    nova_bomb: 0,
    arc_chain: 0,
    overclock_pulse: 0,
  },
  dailyClearedDate: null,
  // Attempts made on the current campaign wave; each retry pays less gold
  waveAttempts: { sector: 0, count: 0 },
  estSessionRevenueUsd: 0.004,
};

const toFiniteNumber = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const toWhole = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Math.floor(toFiniteNumber(value, fallback, min, max));

// localStorage is player-editable, so coerce every field back into a valid range
function sanitizeSave(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const rawUpgrades = parsed.upgrades && typeof parsed.upgrades === 'object' ? parsed.upgrades : {};
  const rawAbilities =
    parsed.abilityLevels && typeof parsed.abilityLevels === 'object' ? parsed.abilityLevels : {};

  const upgrades = {};
  Object.keys(DEFAULT_SAVE.upgrades).forEach((id) => {
    const def = UPGRADE_CATALOG.find((u) => u.id === id);
    upgrades[id] = toWhole(rawUpgrades[id], 0, 0, def ? def.maxLevel : 0);
  });

  const abilityLevels = {};
  Object.keys(DEFAULT_SAVE.abilityLevels).forEach((id) => {
    const minLvl = DEFAULT_SAVE.abilityLevels[id];
    abilityLevels[id] = toWhole(rawAbilities[id], minLvl, minLvl, 15);
  });

  const sector = toWhole(parsed.sector, 1, 1, 100000);
  const rawAttempts = parsed.waveAttempts && typeof parsed.waveAttempts === 'object' ? parsed.waveAttempts : {};

  return {
    tutorialCompleted: parsed.tutorialCompleted === true,
    shards: toWhole(parsed.shards, 0),
    totalShardsEarned: toWhole(parsed.totalShardsEarned, 0),
    sector,
    maxSectorReached: Math.max(sector, toWhole(parsed.maxSectorReached, 1, 1, 100000)),
    lethalClears: toWhole(parsed.lethalClears, 0),
    overclockCores: toWhole(parsed.overclockCores, 0, 0, 1000),
    upgrades,
    abilityLevels,
    dailyClearedDate:
      typeof parsed.dailyClearedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dailyClearedDate)
        ? parsed.dailyClearedDate
        : null,
    waveAttempts: {
      sector: toWhole(rawAttempts.sector, 0, 0, 100000),
      count: toWhole(rawAttempts.count, 0, 0, 1000),
    },
    estSessionRevenueUsd: toFiniteNumber(parsed.estSessionRevenueUsd, DEFAULT_SAVE.estSessionRevenueUsd),
  };
}

function backupCorruptSave(raw) {
  try {
    localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
  } catch {
    // Ignore storage quota errors
  }
}

// Gold multiplier the next attempt at this wave will earn
function getNextAttemptGoldMult(waveAttempts, sector) {
  const attempt = waveAttempts && waveAttempts.sector === sector ? waveAttempts.count + 1 : 1;
  return getRetryGoldMultiplier(attempt);
}

export default function App() {
  const [save, setSave] = useState(() => {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SAVE;
      const sanitized = sanitizeSave(JSON.parse(raw));
      if (sanitized) return sanitized;
    } catch {
      // Fall through to the backup below
    }
    if (raw) backupCorruptSave(raw);
    return DEFAULT_SAVE;
  });
  const saveRef = useRef(save);
  saveRef.current = save;

  // Top-level screen state: 'MENU' | 'TUTORIAL' | 'PLAY' | 'UPGRADES'
  const [screen, setScreen] = useState('MENU');
  const [tutorialStep, setTutorialStep] = useState(1);

  const [gameMode, setGameMode] = useState('CAMPAIGN'); // 'CAMPAIGN' | 'DAILY'
  const [selectedAbilityId, setSelectedAbilityId] = useState('rail_beam');
  const [hoverCell, setHoverCell] = useState({ row: null, col: null });
  // Touch has no hover, so the first tap aims (shows the blast preview) and a second tap fires
  const [armedCellId, setArmedCellId] = useState(null);
  const lastPointerTypeRef = useRef('mouse');
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
  // Wave the board on screen belongs to; save.sector moves ahead as soon as a wave is cleared
  const [boardSector, setBoardSector] = useState(save.sector);
  const [turnAmplifierBonus, setTurnAmplifierBonus] = useState(1);
  const [board, setBoard] = useState(() =>
    generateBoard({
      gridSize: campaignGridSize,
      sector: save.sector,
      volatileBonusLevel: save.upgrades.volatile_spawn,
    })
  );

  // 'IN_PROGRESS' until the board is cleared (VICTORY) or the volleys run out (DEFEAT)
  const [waveOutcome, setWaveOutcome] = useState('IN_PROGRESS');
  const [boardGoldMult, setBoardGoldMult] = useState(1);
  const [adVolleyUsed, setAdVolleyUsed] = useState(false);

  // Live battle state read and written synchronously, so clicks landing in the same frame
  // and archer ticks never resolve against a stale board or volley count
  const battleRef = useRef(null);
  if (!battleRef.current) {
    battleRef.current = {
      board,
      chargesLeft: maxTurnCharges,
      outcome: 'IN_PROGRESS',
      amp: 1,
      mode: 'CAMPAIGN',
      sector: save.sector,
      attemptCounted: false,
      goldMult: 1,
      rng: Math.random,
      dailyPending: 0,
      adVolleyUsed: false,
      lockUntil: 0,
    };
  }

  const syncBattle = (patch) => {
    Object.assign(battleRef.current, patch);
    if ('board' in patch) setBoard(patch.board);
    if ('chargesLeft' in patch) setChargesLeft(patch.chargesLeft);
    if ('outcome' in patch) setWaveOutcome(patch.outcome);
    if ('amp' in patch) setTurnAmplifierBonus(patch.amp);
    if ('goldMult' in patch) setBoardGoldMult(patch.goldMult);
    if ('adVolleyUsed' in patch) setAdVolleyUsed(patch.adVolleyUsed);
  };

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
  const [showBestiaryModal, setShowBestiaryModal] = useState(false);
  const [showGuideDrawer, setShowGuideDrawer] = useState(false);
  const [telemetryFeed, setTelemetryFeed] = useState([]);
  const [shareCopied, setShareCopied] = useState(false);

  const isWeaponUnlocked = (abilityId) => {
    if (screen === 'TUTORIAL') return abilityId === 'rail_beam';
    if (gameMode === 'DAILY') return true;
    return (save.abilityLevels[abilityId] || 0) >= 1;
  };

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
      if (e.key === '2' && isWeaponUnlocked('nova_bomb')) setSelectedAbilityId('nova_bomb');
      if (e.key === '3' && isWeaponUnlocked('arc_chain')) setSelectedAbilityId('arc_chain');
      if (e.key === '4' && isWeaponUnlocked('overclock_pulse'))
        setSelectedAbilityId('overclock_pulse');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save.abilityLevels, screen, gameMode]);

  useEffect(() => {
    if (adBoostSeconds <= 0) return;
    const t = setInterval(() => {
      setAdBoostSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [adBoostSeconds]);

  // Latest render values for the archer timer, so it doesn't restart on every board or second tick
  const archerContextRef = useRef({});
  archerContextRef.current = { screen, adBoostSeconds, activeGridSize };

  // The first shot (player or archer) on a campaign board commits an attempt at that wave
  const registerCampaignAttempt = () => {
    const live = battleRef.current;
    if (live.mode !== 'CAMPAIGN') return 1;
    if (live.attemptCounted) return live.goldMult;

    const prevAttempts = saveRef.current.waveAttempts;
    const attempt = prevAttempts && prevAttempts.sector === live.sector ? prevAttempts.count + 1 : 1;
    const goldMult = getRetryGoldMultiplier(attempt);
    live.attemptCounted = true;
    syncBattle({ goldMult });

    const waveAttempts = { sector: live.sector, count: attempt };
    saveRef.current = { ...saveRef.current, waveAttempts };
    setSave((prev) => ({ ...prev, waveAttempts }));
    return goldMult;
  };

  // Banks the gold for a resolved shot and advances the wave exactly once on VICTORY
  const settleShot = (result, outcome, goldMult) => {
    const live = battleRef.current;
    const isVictory = outcome === 'VICTORY';
    let earned = 0;

    if (live.mode === 'CAMPAIGN') {
      earned = Math.floor(result.stats.shardsEarned * goldMult);
    } else if (live.mode === 'DAILY') {
      // Daily gold is held until the decree is won, and only the first win each day pays
      live.dailyPending += result.stats.shardsEarned;
      if (isVictory && saveRef.current.dailyClearedDate !== getTodayDateSeed()) {
        earned = live.dailyPending;
      }
    }

    if (live.mode === 'TUTORIAL') return earned;

    const todaySeed = getTodayDateSeed();
    const clearedSector = live.sector;
    setSave((prev) => {
      const advance = live.mode === 'CAMPAIGN' && isVictory && prev.sector === clearedSector;
      const nextSector = advance ? clearedSector + 1 : prev.sector;
      return {
        ...prev,
        shards: prev.shards + earned,
        totalShardsEarned: prev.totalShardsEarned + earned,
        sector: nextSector,
        maxSectorReached: Math.max(prev.maxSectorReached, nextSector),
        lethalClears: isVictory ? prev.lethalClears + 1 : prev.lethalClears,
        waveAttempts: advance ? { sector: nextSector, count: 0 } : prev.waveAttempts,
        dailyClearedDate: live.mode === 'DAILY' && isVictory ? todaySeed : prev.dailyClearedDate,
      };
    });

    if (isVictory) {
      trackEvent('lethal_board_clear', {
        mode: live.mode,
        sector: clearedSector,
        grid_size: `${archerContextRef.current.activeGridSize}x${archerContextRef.current.activeGridSize}`,
        chain_depth: result.stats.chainDepth,
      });
    }
    return earned;
  };

  // PHYSICAL BATTLEMENT ARCHERS LOOP: Physically shoots living enemies on the board every 2.2s!
  // Archers only fight while the wave is live and the player still has volleys, so they can
  // help win a wave but never finish one the player already lost.
  const droneLevel = save.upgrades.auto_drone || 0;
  useEffect(() => {
    if (droneLevel <= 0) return;

    const timer = setInterval(() => {
      const { screen: currentScreen, adBoostSeconds: boostLeft, activeGridSize: gridSize } =
        archerContextRef.current;
      const live = battleRef.current;
      const currentSave = saveRef.current;
      if (currentScreen !== 'PLAY' || live.mode !== 'CAMPAIGN') return;
      if (live.outcome !== 'IN_PROGRESS' || live.chargesLeft <= 0) return;

      const aliveCells = live.board.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0);
      if (aliveCells.length === 0) return;

      const goldMult = registerCampaignAttempt();
      const target = aliveCells[Math.floor(Math.random() * aliveCells.length)];
      const prestigeMult = 1 + (currentSave.overclockCores || 0) * 0.5;
      const adMult = (boostLeft > 0 ? 2 : 1) * prestigeMult;

      const result = executeAbilityAndResolveChains({
        cells: live.board,
        gridSize,
        targetRow: target.row,
        targetCol: target.col,
        abilityId: 'rail_beam',
        abilityLevel: droneLevel,
        chainAmpLevel: currentSave.upgrades.chain_amp || 0,
        shardMultLevel: currentSave.upgrades.shard_mult || 0,
        luckySparkLevel: currentSave.upgrades.lucky_spark || 0,
        contagionLevel: currentSave.upgrades.contagion || 0,
        adBoostMultiplier: adMult,
        sector: live.sector,
        turnAmplifierBonus: live.amp,
        isTutorial: false,
        isAutoArcherShot: true,
      });

      if (result.vfxAnimations?.length > 0) {
        setVfxQueue((prev) => [...prev.slice(-10), ...result.vfxAnimations]);
      }
      const outcome = result.stats.isBoardClear ? 'VICTORY' : 'IN_PROGRESS';
      syncBattle({ board: result.nextCells, amp: result.nextTurnAmplifierBonus, outcome });
      const earned = settleShot(result, outcome, goldMult);

      if (outcome === 'VICTORY') {
        setLastTurnStats({ ...result.stats, shardsEarned: earned });
        setCommanderMessage(
          `⚔️ TOTAL VICTORY! Your Battlement Archers felled the last raider for +${earned} Gold Crowns!`
        );
      }
    }, 2200);

    return () => clearInterval(timer);
  }, [droneLevel]);

  const startTutorial = (step = 1) => {
    setScreen('TUTORIAL');
    setTutorialStep(step);
    setSelectedAbilityId('rail_beam');
    const tutorialBoard = generateTutorialBoard(step);
    battleRef.current = {
      board: tutorialBoard,
      chargesLeft: 1,
      outcome: 'IN_PROGRESS',
      amp: 1,
      mode: 'TUTORIAL',
      sector: 2,
      attemptCounted: false,
      goldMult: 1,
      rng: Math.random,
      dailyPending: 0,
      adVolleyUsed: false,
      lockUntil: 0,
    };
    syncBattle({
      board: tutorialBoard,
      chargesLeft: 1,
      outcome: 'IN_PROGRESS',
      amp: 1,
      goldMult: 1,
      adVolleyUsed: false,
    });
    setArmedCellId(null);
    setLastTurnStats(null);
    const lesson = TUTORIAL_LESSONS[step - 1] || TUTORIAL_LESSONS[0];
    setCommanderMessage(lesson.commanderSpeech);
    trackEvent('tutorial_step_started', { step });
  };

  const startGameSession = (
    targetMode = 'CAMPAIGN',
    targetSector = save.sector,
    customGridSize = null,
    customMaxCharges = null
  ) => {
    setScreen('PLAY');
    setGameMode(targetMode);
    if (targetMode === 'CAMPAIGN' && !isWeaponUnlocked(selectedAbilityId)) {
      setSelectedAbilityId('rail_beam');
    }
    const isDaily = targetMode === 'DAILY';
    const gSize = isDaily ? 5 : customGridSize || Math.min(8, 3 + (save.upgrades.grid_size || 0));
    const maxChg = isDaily ? 3 : customMaxCharges ?? 2 + (save.upgrades.max_charges || 0);
    const todaySeed = getTodayDateSeed();
    const boardSectorValue = isDaily ? 5 : targetSector;

    const nextCells = generateBoard({
      gridSize: gSize,
      sector: boardSectorValue,
      volatileBonusLevel: isDaily ? 3 : save.upgrades.volatile_spawn || 0,
      seedString: isDaily ? `DAILY-SEED-${todaySeed}` : null,
      isDaily,
    });

    const goldMult = isDaily ? 1 : getNextAttemptGoldMult(save.waveAttempts, targetSector);
    battleRef.current = {
      board: nextCells,
      chargesLeft: maxChg,
      outcome: 'IN_PROGRESS',
      amp: 1,
      mode: targetMode,
      sector: boardSectorValue,
      attemptCounted: false,
      goldMult,
      // Seeding crits and lucky procs makes the Daily play out the same for everyone
      rng: isDaily ? createSeededRandom(`DAILY-RNG-${todaySeed}`) : Math.random,
      dailyPending: 0,
      adVolleyUsed: false,
      lockUntil: 0,
    };
    syncBattle({
      board: nextCells,
      chargesLeft: maxChg,
      outcome: 'IN_PROGRESS',
      amp: 1,
      goldMult,
      adVolleyUsed: false,
    });
    setArmedCellId(null);
    setBoardSector(boardSectorValue);
    setLastTurnStats(null);
    const luckPct = 8 + Math.round((save.upgrades.lucky_spark || 0) * 1.8);
    const dailyAlreadyWon = isDaily && save.dailyClearedDate === todaySeed;
    setCommanderMessage(
      isDaily
        ? dailyAlreadyWon
          ? `Royal Daily Decree #${todaySeed}: You already won today's decree. This run is practice and pays no Gold.`
          : `Royal Daily Decree #${todaySeed}: Every Commander in the realm faces this exact Siege formation today! Gold is paid on victory, once per day.`
        : goldMult < 1
        ? `Wave ${targetSector} retry: this attempt pays ${Math.round(goldMult * 100)}% Gold. Clear it to march on!`
        : `Wave ${targetSector}: Strike Powder-Kegs & Shamans! (${luckPct}% Lucky Instant-Ignition chance on high-HP foes!)`
    );
  };

  // Resume a live campaign wave (e.g. returning from the Forge) instead of rerolling it
  const continueCampaign = () => {
    const live = battleRef.current;
    const canResume =
      live.mode === 'CAMPAIGN' &&
      live.outcome === 'IN_PROGRESS' &&
      live.attemptCounted &&
      live.sector === save.sector &&
      live.board.length === campaignGridSize * campaignGridSize;
    if (canResume) {
      setScreen('PLAY');
      setGameMode('CAMPAIGN');
      return;
    }
    startGameSession('CAMPAIGN', save.sector);
  };

  const previewIndices = getAbilityPreviewIndices({
    abilityId: selectedAbilityId,
    abilityLevel:
      screen === 'TUTORIAL'
        ? 2
        : gameMode === 'DAILY'
        ? 3
        : Math.max(1, save.abilityLevels[selectedAbilityId] || 1),
    targetRow: hoverCell.row,
    targetCol: hoverCell.col,
    gridSize: activeGridSize,
    cells: board,
  });

  // Execute Weapon Strike + Trigger 60fps Canvas Weapon Animation
  const handleCellClick = (cell) => {
    const live = battleRef.current;
    if (live.outcome !== 'IN_PROGRESS' || live.chargesLeft <= 0) return;
    if (performance.now() < live.lockUntil) return;
    const { row, col } = cell;

    if (lastPointerTypeRef.current === 'touch' && armedCellId !== cell.id) {
      setArmedCellId(cell.id);
      setHoverCell({ row, col });
      return;
    }
    setArmedCellId(null);

    const isTutorial = live.mode === 'TUTORIAL';
    const isDaily = live.mode === 'DAILY';
    const goldMult = registerCampaignAttempt();

    // Trigger physical recoil/use animation on the weapon card in the dock
    setFiringWeaponId(selectedAbilityId);
    setTimeout(() => setFiringWeaponId(null), 420);

    const prestigeMult = 1 + (save.overclockCores || 0) * 0.5;
    const adMult = (adBoostSeconds > 0 ? 2 : 1) * prestigeMult;

    const result = executeAbilityAndResolveChains({
      cells: live.board,
      gridSize: activeGridSize,
      targetRow: row,
      targetCol: col,
      abilityId: selectedAbilityId,
      abilityLevel: isTutorial
        ? 2
        : isDaily
        ? 3
        : Math.max(1, save.abilityLevels[selectedAbilityId] || 1),
      chainAmpLevel: isTutorial ? 3 : isDaily ? 4 : save.upgrades.chain_amp || 0,
      shardMultLevel: save.upgrades.shard_mult || 0,
      luckySparkLevel: isTutorial ? 0 : isDaily ? 5 : save.upgrades.lucky_spark || 0,
      contagionLevel: isTutorial ? 0 : isDaily ? 4 : save.upgrades.contagion || 0,
      adBoostMultiplier: isDaily ? 1 : adMult,
      sector: live.sector,
      turnAmplifierBonus: live.amp,
      isTutorial,
      isAutoArcherShot: false,
      rng: live.rng,
    });

    // Enqueue 60fps Canvas weapon projectile & barrel explosion animations!
    if (result.vfxAnimations && result.vfxAnimations.length > 0) {
      setVfxQueue((prev) => [...prev.slice(-10), ...result.vfxAnimations]);
    }

    const nextCharges = Math.min(
      maxTurnCharges,
      live.chargesLeft - 1 + (result.stats.refundedCharge || 0)
    );
    const outcome = result.stats.isBoardClear
      ? 'VICTORY'
      : nextCharges <= 0
      ? 'DEFEAT'
      : 'IN_PROGRESS';
    syncBattle({
      board: result.nextCells,
      chargesLeft: nextCharges,
      amp: result.nextTurnAmplifierBonus,
      outcome,
    });
    const earned = settleShot(result, outcome, goldMult);
    setLastTurnStats({ ...result.stats, shardsEarned: earned });

    if (
      result.stats.chainDepth > 0 ||
      result.stats.isBoardClear ||
      result.stats.luckyProcsCount > 0
    ) {
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 380);
    }

    // Celebrate 100% Lethal Siege Clear or Lucky Jackpot with Golden Confetti!
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
    const luckyTag =
      result.stats.refundedCharge > 0
        ? '⚡ +1 FREE VOLLEY! '
        : result.stats.luckyProcsCount > 0
        ? `🎲 ${result.stats.luckyProcsCount}× LUCKY IGNITE! `
        : result.stats.critHitsCount > 0
        ? `⚡ ${result.stats.critHitsCount}× CRIT! `
        : '';

    setFloatingPopups((prev) => [
      ...prev.slice(-4),
      {
        id: popupId,
        row,
        col,
        text: result.stats.isBoardClear
          ? `${luckyTag}⚔️ SIEGE BROKEN! +${earned} Gold`
          : `${luckyTag}-${result.stats.totalDamageDealt} HP (${result.stats.chainDepth}× Chain)`,
      },
    ]);
    setTimeout(() => {
      setFloatingPopups((prev) => prev.filter((p) => p.id !== popupId));
    }, 1350);

    if (result.stats.isBoardClear) {
      playSound('clear', muted);
    } else if (result.stats.chainDepth > 0 || result.stats.luckyProcsCount > 0) {
      playSound('chain', muted);
    } else {
      playSound('strike', muted);
    }

    if (isTutorial) {
      if (result.stats.isBoardClear) {
        if (tutorialStep < 3) {
          setCommanderMessage(
            `HUZZAH! Every raider routed in a single volley! Click "Next Training Trial" below!`
          );
        } else {
          const rewardGold = save.tutorialCompleted ? 0 : 15;
          setCommanderMessage(
            `🏆 Training Complete! You've mastered Powder-Kegs, Storm-Rune Shamans, and War-Banners${
              rewardGold > 0 ? ` (+${rewardGold} Gold Crowns awarded)` : ''
            }!`
          );
          setSave((prev) => {
            const grant = prev.tutorialCompleted ? 0 : 15;
            return {
              ...prev,
              tutorialCompleted: true,
              shards: prev.shards + grant,
              totalShardsEarned: prev.totalShardsEarned + grant,
            };
          });
        }
      } else {
        setCommanderMessage(
          `Close, Commander! Strike the glowing yellow-circled unit so its explosion chains to the entire courtyard!`
        );
      }
      return;
    }

    const latestLuckyEvent = result.events?.find((e) => e.type === 'LUCKY_PROC');
    const nextRetryPct = Math.round(
      getNextAttemptGoldMult(saveRef.current.waveAttempts, live.sector) * 100
    );
    if (result.stats.isBoardClear) {
      const goldText = isDaily && earned === 0 ? 'practice run, no Gold' : `+${earned} Gold`;
      setCommanderMessage(
        latestLuckyEvent
          ? `${latestLuckyEvent.text} ⚔️ TOTAL VICTORY (${goldText})!`
          : `⚔️ TOTAL VICTORY! ${result.stats.chainDepth}× Chain Reaction routed the siege (${goldText})!`
      );
    } else if (latestLuckyEvent) {
      setCommanderMessage(
        `${latestLuckyEvent.text} (${result.stats.remainingNodes} foes remain, ${nextCharges} volleys left!)`
      );
    } else if (nextCharges > 0) {
      setCommanderMessage(
        `Direct hit! ${result.stats.remainingNodes} raiders remain and you have ${nextCharges} attack left—finish them!`
      );
    } else if (isDaily) {
      setCommanderMessage(
        `Volley spent! The Daily Decree holds. Retry it — Gold is paid only when you win.`
      );
    } else {
      setCommanderMessage(
        `Volley spent! Wave ${live.sector} holds (+${earned} Gold looted). A retry pays ${nextRetryPct}% Gold—upgrade in the Royal Forge and try again!`
      );
    }
  };

  const handleBuyUpgrade = (upgradeDef) => {
    const currentLvl = save.upgrades[upgradeDef.id] || 0;
    if (currentLvl >= upgradeDef.maxLevel) return;
    const reqSector = getUpgradeRequiredSector(upgradeDef, currentLvl);
    if (save.maxSectorReached < reqSector) return;
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
    const ab = ABILITIES[idx];
    const currentLvl = save.abilityLevels[abilityId] ?? (idx === 0 ? 1 : 0);
    if (currentLvl === 0 && save.maxSectorReached < (ab.minSector || 1)) return;
    const cost =
      currentLvl === 0 ? ab.unlockCost : getAbilityUpgradeCost(idx, currentLvl);
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
      shards: 25,
      totalShardsEarned: prev.totalShardsEarned,
      maxSectorReached: prev.maxSectorReached,
      lethalClears: prev.lethalClears,
      overclockCores: (prev.overclockCores || 0) + coresToGain,
      dailyClearedDate: prev.dailyClearedDate,
      estSessionRevenueUsd: prev.estSessionRevenueUsd,
    }));

    // Pass the reset grid and volley sizes; `save` here is still the pre-reset snapshot
    startGameSession('CAMPAIGN', 1, 3, 2);
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
      `🏰 LETHAL GRID: OVERCLOCK (${
        gameMode === 'DAILY' ? `Daily Decree #${todaySeed}` : `Wave ${boardSector}`
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
      // The charter doesn't stack; it can be claimed again once it runs out
      if (adBoostSeconds > 0) return;
      setRewardedModalConfig({
        isOpen: true,
        rewardTitle: '2× Royal Gold Plunder Charter (3 Minutes)',
        onClaim: () => {
          setAdBoostSeconds((s) => (s > 0 ? s : 180));
          setSave((prev) => ({
            ...prev,
            estSessionRevenueUsd: +(prev.estSessionRevenueUsd + 0.025).toFixed(3),
          }));
        },
      });
    } else if (type === 'EXTRA_CHARGE') {
      // One emergency volley per wave, only to revive a lost wave, and no Gold attached
      if (battleRef.current.adVolleyUsed || battleRef.current.outcome !== 'DEFEAT') return;
      setRewardedModalConfig({
        isOpen: true,
        rewardTitle: '+1 Emergency Siege Volley',
        onClaim: () => {
          const live = battleRef.current;
          if (live.adVolleyUsed || live.outcome !== 'DEFEAT') return;
          // Ignore the trailing click of a double-click on "Claim" landing on the board
          live.lockUntil = performance.now() + 350;
          syncBattle({
            chargesLeft: Math.min(maxTurnCharges, live.chargesLeft + 1),
            outcome: 'IN_PROGRESS',
            adVolleyUsed: true,
          });
          setSave((prev) => ({
            ...prev,
            estSessionRevenueUsd: +(prev.estSessionRevenueUsd + 0.025).toFixed(3),
          }));
        },
      });
    }
  };

  const remainingAliveNodes = board.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0).length;
  const isBoardCleared = remainingAliveNodes === 0;
  const isWaveLive = waveOutcome === 'IN_PROGRESS' && chargesLeft > 0;
  const nextRetryGoldPct = Math.round(getNextAttemptGoldMult(save.waveAttempts, boardSector) * 100);
  const monetizationConfig = getMonetizationConfig();

  const getSkillNodeLevel = (nodeId) => {
    const node = SKILL_TREE_NODES.find((n) => n.id === nodeId);
    if (!node) return 0;
    if (node.kind === 'ABILITY') {
      return save.abilityLevels[nodeId] ?? (node.abilityIndex === 0 ? 1 : 0);
    }
    if (node.kind === 'UPGRADE') {
      return save.upgrades[nodeId] || 0;
    }
    return 0;
  };

  const affordableUpgradesCount = SKILL_TREE_NODES.filter((node) => {
    const parentLvl = node.parentId ? getSkillNodeLevel(node.parentId) : 999;
    if (node.parentId && parentLvl < node.parentReqLevel) return false;

    if (node.kind === 'UPGRADE') {
      const u = UPGRADE_CATALOG.find((item) => item.id === node.id);
      if (!u) return false;
      const lvl = save.upgrades[u.id] || 0;
      const reqSector = getUpgradeRequiredSector(u, lvl);
      return (
        lvl < u.maxLevel &&
        save.maxSectorReached >= reqSector &&
        save.shards >= getUpgradeCost(u, lvl)
      );
    }
    if (node.kind === 'ABILITY') {
      const ab = ABILITIES[node.abilityIndex];
      const lvl = save.abilityLevels[ab.id] ?? (node.abilityIndex === 0 ? 1 : 0);
      if (lvl >= 15) return false;
      if (lvl === 0) {
        return save.maxSectorReached >= (ab.minSector || 1) && save.shards >= ab.unlockCost;
      }
      return save.shards >= getAbilityUpgradeCost(node.abilityIndex, lvl);
    }
    return false;
  }).length;

  const activeTutorialLesson =
    screen === 'TUTORIAL' ? TUTORIAL_LESSONS[tutorialStep - 1] || TUTORIAL_LESSONS[0] : null;

  return (
    <div className="app-shell">
      {/* IN-GAME HUD BAR (Hidden on the Title Screen for a clean, uncluttered landing view) */}
      {screen !== 'MENU' && (
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
                LETHAL GRID: OVERCLOCK <span className="badge-cyan">ROYAL EDITION</span>
              </h1>
            </div>
          </div>

          {/* NAVIGATION PILLS */}
          <nav className="mode-switcher" aria-label="Primary Navigation">
            <button
              type="button"
              className="mode-tab"
              onClick={() => setScreen('MENU')}
            >
              <Home size={15} />
              <span>Title Screen</span>
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
              onClick={() => continueCampaign()}
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
              className="btn-icon"
              onClick={() => setShowBestiaryModal(true)}
              title="Open Bestiary & Field Manual"
            >
              <BookOpen size={16} />
            </button>

            {SHOW_DEV_TOOLS && (
              <button
                type="button"
                className={`btn-telemetry ${showRevenueDashboard ? 'active' : ''}`}
                onClick={() => setShowRevenueDashboard((v) => !v)}
                title="Inspect Google Analytics 4 Events & AdSense Revenue"
              >
                <Activity size={15} className="text-emerald" />
                <span className="revenue-pill">${save.estSessionRevenueUsd.toFixed(3)}</span>
              </button>
            )}

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
      )}

      {/* COLLAPSIBLE GA4 & AD REVENUE OWNER INSPECTOR */}
      {SHOW_DEV_TOOLS && showRevenueDashboard && (
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
          SCREEN 1: MODERN INDIE TITLE SCREEN (SLAY THE SPIRE / SEA OF STARS STYLE)
          ===================================================================== */}
      {screen === 'MENU' && (
        <main className="indie-title-screen">
          {/* MINIMAL CORNER MICRO-HUD */}
          <div className="title-corner-bar">
            <div className="title-corner-left">
              <div className="title-status-chip" title="Your Kingdom Save Progress">
                <span>🪙 {save.shards.toLocaleString()} Gold</span>
                <span className="chip-sep">•</span>
                <span>Wave {save.sector} ({campaignGridSize}×{campaignGridSize})</span>
              </div>
            </div>

            <div className="title-corner-right">
              <button
                type="button"
                className="title-utility-btn"
                onClick={() => setShowBestiaryModal(true)}
                title="View Raider Bestiary & Chain Rules"
              >
                <BookOpen size={15} />
                <span>Bestiary</span>
              </button>

              {SHOW_DEV_TOOLS && (
                <button
                  type="button"
                  className={`title-utility-btn ${showRevenueDashboard ? 'active' : ''}`}
                  onClick={() => setShowRevenueDashboard((v) => !v)}
                  title="GA4 & AdSense Revenue Ledger"
                >
                  <Activity size={15} className="text-emerald" />
                  <span>${save.estSessionRevenueUsd.toFixed(3)}</span>
                </button>
              )}

              <button
                type="button"
                className="title-utility-btn icon-only"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          </div>

          {/* CENTER STAGE: HERALDIC CREST, TITLE LOCKUP & VERTICAL MENU STACK */}
          <div className="title-center-stage">
            <div className="title-crest-diorama">
              <div className="diorama-pedestal">
                <CreatureSprite type={NODE_TYPES.BOMB} />
              </div>
              <div className="diorama-pedestal featured">
                <CreatureSprite type={NODE_TYPES.BOSS} />
              </div>
              <div className="diorama-pedestal">
                <CreatureSprite type={NODE_TYPES.CONDUIT} />
              </div>
            </div>

            <span className="title-eyebrow-ribbon">ONE-TURN CHAIN-REACTION SIEGE TACTICS</span>
            <h1 className="title-main-logo">LETHAL GRID: OVERCLOCK</h1>
            <p className="title-tagline">
              Command the battlements. Detonate the Goblin horde in a single volley.
            </p>

            {/* FOCUSED VERTICAL INDIE MENU STACK */}
            <nav className="indie-menu-stack" aria-label="Main Menu">
              {!save.tutorialCompleted ? (
                <button
                  type="button"
                  className="indie-menu-btn primary"
                  onClick={() => startTutorial(1)}
                >
                  <span className="menu-sword-cursor">⚔️</span>
                  <span className="menu-btn-label">Play Tutorial</span>
                  <span className="menu-btn-tag gold">+15 🪙</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="indie-menu-btn primary"
                  onClick={() => continueCampaign()}
                >
                  <span className="menu-sword-cursor">⚔️</span>
                  <span className="menu-btn-label">Continue Siege</span>
                  <span className="menu-btn-tag gold">Wave {save.sector}</span>
                </button>
              )}

              <button
                type="button"
                className="indie-menu-btn"
                onClick={() => startGameSession('DAILY', 5)}
              >
                <span className="menu-sword-cursor">⚔️</span>
                <span className="menu-btn-label">Daily Royal Decree</span>
                <span className="menu-btn-tag">#{getTodayDateSeed().slice(5)}</span>
              </button>

              <button
                type="button"
                className="indie-menu-btn"
                onClick={() => setScreen('UPGRADES')}
              >
                <span className="menu-sword-cursor">⚔️</span>
                <span className="menu-btn-label">The Royal Forge</span>
                {affordableUpgradesCount > 0 ? (
                  <span className="menu-btn-tag ready">{affordableUpgradesCount} Ready!</span>
                ) : (
                  <span className="menu-btn-tag">{campaignGridSize}×{campaignGridSize} Keep</span>
                )}
              </button>

              {!save.tutorialCompleted ? (
                <button
                  type="button"
                  className="indie-menu-btn"
                  onClick={() => continueCampaign()}
                >
                  <span className="menu-sword-cursor">⚔️</span>
                  <span className="menu-btn-label">Skip to Siege Wave {save.sector}</span>
                  <span className="menu-btn-tag">{campaignGridSize}×{campaignGridSize}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="indie-menu-btn"
                  onClick={() => startTutorial(1)}
                >
                  <span className="menu-sword-cursor">⚔️</span>
                  <span className="menu-btn-label">Training Yard</span>
                  <span className="menu-btn-tag">Practice</span>
                </button>
              )}
            </nav>
          </div>
        </main>
      )}

      {/* =====================================================================
          SCREEN 2: STONE COURTYARD BATTLEFIELD & INTERACTIVE TRAINING YARD
          ===================================================================== */}
      {(screen === 'PLAY' || screen === 'TUTORIAL') && (
        <main className="arena-focused-stage">
          {/* BACKPACK HERO / PEGLIN STYLE TOP DUNGEON STAGE SCENE */}
          <DungeonStageBanner
            waveNumber={screen === 'TUTORIAL' ? tutorialStep : boardSector}
            remainingEnemies={remainingAliveNodes}
            totalEnemies={board.filter((c) => c.type !== NODE_TYPES.EMPTY).length}
            isAttacking={Boolean(firingWeaponId)}
            isCleared={isBoardCleared}
            commanderMessage={commanderMessage}
            selectedWeaponId={selectedAbilityId}
          />

          {/* STATUS STRIP: VOLLEY CHARGES + LUCK & RALLY BADGES + ACTIONS */}
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
              {screen === 'PLAY' && (
                <span
                  className="amp-pill"
                  title="Fortune's Spark: Any hit has a chance to instantly detonate high-HP Powder-Kegs/Shamans or deal 3× Crit Damage!"
                >
                  🎲 {8 + Math.round((save.upgrades.lucky_spark || 0) * 1.8)}% Luck Ignite
                </span>
              )}
              {screen === 'PLAY' && gameMode === 'CAMPAIGN' && boardGoldMult < 1 && (
                <span
                  className="amp-pill"
                  title="Each retry of the same wave pays less Gold. Clear the wave to reset it."
                >
                  ↻ Retry: {Math.round(boardGoldMult * 100)}% Gold
                </span>
              )}
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
                  disabled={adBoostSeconds > 0}
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
                <span>
                  {screen === 'TUTORIAL' ? 'Reset Trial' : gameMode === 'DAILY' ? 'Restart Decree' : 'Restart Wave'}
                </span>
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
                  gridTemplateRows: `repeat(${activeGridSize}, minmax(0, 1fr))`,
                }}
                onMouseLeave={() => {
                  if (lastPointerTypeRef.current !== 'touch') setHoverCell({ row: null, col: null });
                }}
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

                  const isArmed = armedCellId === cell.id && isWaveLive;

                  const cellPopup = floatingPopups.find(
                    (p) => p.row === cell.row && p.col === cell.col
                  );

                  return (
                    <button
                      key={cell.id}
                      type="button"
                      disabled={!isWaveLive}
                      className={[
                        'grid-tile',
                        isDead ? 'tile-dead' : `tile-alive color-${meta.color}`,
                        isTargeted ? 'tile-targeted' : '',
                        isTutorialTarget ? 'tile-tutorial-beacon' : '',
                        isArmed ? 'tile-armed' : '',
                        cell.justHit ? 'tile-hit-flash' : '',
                        cell.destroyedByChain ? 'tile-chain-wrecked' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onPointerDown={(e) => {
                        lastPointerTypeRef.current = e.pointerType;
                      }}
                      onMouseEnter={() => {
                        if (lastPointerTypeRef.current !== 'touch') {
                          setHoverCell({ row: cell.row, col: cell.col });
                        }
                      }}
                      onFocus={() => setHoverCell({ row: cell.row, col: cell.col })}
                      onClick={() => handleCellClick(cell)}
                    >
                      {cellPopup && <span className="floating-dmg-popup">{cellPopup.text}</span>}

                      {isArmed ? (
                        <span className="tutorial-click-tag">TAP AGAIN TO FIRE</span>
                      ) : (
                        isTutorialTarget && (
                          <span className="tutorial-click-tag">👇 STRIKE HERE!</span>
                        )
                      )}

                      {!isDead ? (
                        <>
                          <div className="tile-top-row">
                            <span className="tile-type-tag">{meta.short}</span>
                            <span className="tile-hp-pill">
                              <span className="tile-hp-heart" aria-hidden="true">❤️ </span>
                              {cell.hp}
                            </span>
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
            {!isWaveLive && (
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
                      ? gameMode === 'DAILY' && !lastTurnStats?.shardsEarned
                        ? "Today's decree is already won, so this run was practice (no Gold)."
                        : `Looted +${lastTurnStats?.shardsEarned || 0} Gold Crowns (includes +25% Clear Bounty!)`
                      : gameMode === 'DAILY'
                      ? 'The decree holds. Gold is paid only when you win it, once per day.'
                      : `Wave ${boardSector} holds. A retry pays ${nextRetryGoldPct}% Gold, so upgrade in the Royal Forge before trying again.`}
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
                          <span>March to Wave {save.sector}!</span>
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
                      {!isBoardCleared && !adVolleyUsed && (
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
                          {gameMode === 'DAILY'
                            ? isBoardCleared
                              ? 'Replay Decree (Practice)'
                              : 'Retry Decree'
                            : isBoardCleared
                            ? `March to Wave ${save.sector}`
                            : `Retry Wave ${boardSector} (${nextRetryGoldPct}% Gold)`}
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
            {ABILITIES.map((ab, idx) => {
              const unlocked = isWeaponUnlocked(ab.id);
              const lvl =
                screen === 'TUTORIAL'
                  ? 2
                  : gameMode === 'DAILY'
                  ? 3
                  : Math.max(1, save.abilityLevels[ab.id] || 1);
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
                    !unlocked ? 'weapon-locked' : '',
                    isFiring ? 'weapon-firing-recoil' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    if (!unlocked) {
                      if (screen === 'PLAY') setScreen('UPGRADES');
                      return;
                    }
                    setSelectedAbilityId(ab.id);
                  }}
                >
                  <div className={`ability-icon bg-${ab.color}`}>
                    <WeaponIllustration id={ab.id} />
                    <span className="hotkey-badge">{unlocked ? ab.hotkey : '🔒'}</span>
                  </div>
                  <div className="weapon-dock-text">
                    <div className="weapon-dock-top">
                      <strong>{ab.name}</strong>
                      {unlocked ? (
                        <span className="weapon-dmg-badge">{stats.damage} DMG</span>
                      ) : (
                        <span className="weapon-dmg-badge">
                          Wave {ab.minSector} • {ab.unlockCost} 🪙
                        </span>
                      )}
                    </div>
                    <span>
                      {unlocked
                        ? ab.baseDesc
                        : idx > 0 && screen === 'TUTORIAL'
                        ? 'Unlocks after Training Yard'
                        : `Locked — Click to unlock in the Royal Forge!`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </main>
      )}

      {/* =====================================================================
          SCREEN 3: THE ROYAL FORGE INTERACTIVE SKILL TREE
          ===================================================================== */}
      {screen === 'UPGRADES' && (
        <main className="upgrade-lab-screen">
          <UpgradeSkillTree
            save={save}
            onBuyUpgrade={handleBuyUpgrade}
            onUpgradeAbility={handleUpgradeAbility}
            onPrestigeReboot={handlePrestigeReboot}
            onReturnToBattle={continueCampaign}
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
                <BookOpen size={18} className="text-amber" /> How to Play Lethal Grid: Overclock
              </h3>
              <p>
                <strong>Lethal Grid: Overclock</strong> blends tactical one-turn medieval puzzle warfare
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

      {showBestiaryModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowBestiaryModal(false)}
        >
          <div
            className="modal-card bestiary-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bestiary-modal-header">
              <h3>
                <BookOpen size={18} className="text-amber" /> Royal Bestiary & Chain-Reaction Guide
              </h3>
              <p>Strike volatile units first so their death blasts wipe out the entire courtyard!</p>
            </div>

            <div className="bestiary-modal-grid">
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.STANDARD} />
                <div>
                  <strong className="text-amber">Goblin Footpad</strong>
                  <span>Standard raider. Drops Gold Crowns when slain.</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.BOMB} />
                <div>
                  <strong className="text-rose">Powder-Keg Sapper</strong>
                  <span>Explodes in a 3×3 fireball on death, chaining to nearby foes!</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.CONDUIT} />
                <div>
                  <strong className="text-cyan">Storm-Rune Shaman</strong>
                  <span>Fires a lightning beam across its Row or Column when slain!</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.AMPLIFIER} />
                <div>
                  <strong className="text-emerald">War-Banner Herald</strong>
                  <span>Grants +50% bonus turn damage to all subsequent blasts when slain!</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.BOSS} />
                <div>
                  <strong className="text-violet">Ironclad Siege Ogre</strong>
                  <span>Heavily armored warlord. Use chained explosions to bring him down!</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowBestiaryModal(false)}
              >
                Close Bestiary
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrivacyModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card privacy-modal-card">
            <h3>Privacy Charter & Google AdSense / Analytics Disclosure</h3>
            <p>
              <strong>1. Local Browser Storage:</strong> Lethal Grid: Overclock stores your Kingdom
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
