import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import confetti from 'canvas-confetti';
import {
  Flame,
  Sparkles,
  Shield,
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
  Sword,
  Heart,
  Skull,
  Tv,
  Settings,
  GoldCoin,
  Castle,
  Star,
  Robot,
  Crown,
} from './components/PixelIcons';
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
  getWeaponUnlockCost,
  FIRST_CLEAR_GOLD_MULT,
  getStageLabel,
  STAGES_PER_CHAPTER,
  CHAPTER_CHEST_STARS,
  getClearStars,
  getChapterStars,
  getChapterChestGold,
  getOfflineReward,
  getCrestsForReset,
  getCrestGoldMult,
  getCrestsSpent,
  CREST_TREE,
  PRESTIGE_MIN_SECTOR,
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
import { playSfx } from './services/sfx';
import { StageMapModal } from './components/StageMapModal';
import { OfflineRewardModal } from './components/OfflineRewardModal';
import { CrestTreeModal } from './components/CrestTreeModal';
import { shake, squash, popIn } from './services/juice';
import { RewardedAdModal } from './components/AdUnit';
import { useRewardedAd, isRewardedAdPlaying } from './services/rewardedAds';
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

// Canvas item for one hit: tile flash, damage number and, on a kill, debris.
// Repeat hits on a tile stack their numbers upward so they stay readable.
function buildHitVfx(hit, atMs, stackIndex = 0) {
  return {
    id: `vfx-hit-${hit.cellId}-${atMs}-${Math.random()}`,
    type: 'HIT',
    row: hit.row,
    col: hit.col,
    damage: hit.damage,
    crit: hit.crit,
    lucky: hit.lucky,
    killed: hit.killed,
    delayMs: atMs,
    duration: 780,
    impactMs: 0,
    jitterX: (Math.random() - 0.5) * 10,
    jitterY: -stackIndex * 16,
  };
}

const DEFAULT_SAVE = {
  tutorialCompleted: false,
  shards: 0, // Gold
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
  // Only the Ballista starts unlocked; the rest are bought in the Forge
  abilityLevels: {
    rail_beam: 1,
    nova_bomb: 0,
    arc_chain: 0,
    overclock_pulse: 0,
  },
  dailyClearedDate: null,
  // Attempts at the frontier wave, reported to analytics when it is first cleared
  waveAttempts: { sector: 0, count: 0 },
  // Best stars per stage (wave number -> 1..3) and chapter chests opened (chapter -> tiers);
  // both survive a prestige reset
  stageStars: {},
  chestsClaimed: {},
  // Royal Crest tree levels (crest node id -> level), bought with overclockCores
  crestUpgrades: {},
  // totalShardsEarned at the last reset; crests for the next reset come from gold since then
  runGoldStart: 0,
  estSessionRevenueUsd: 0.004,
};

// Last time the game was open, for the offline garrison; kept apart from the save so the
// heartbeat that refreshes it doesn't re-render the game
const LAST_SEEN_KEY = 'lethal_grid_last_seen';
const LAST_SEEN_HEARTBEAT_MS = 30000;

function readLastSeen() {
  try {
    const n = Number(localStorage.getItem(LAST_SEEN_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeLastSeen() {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  } catch {
    // Ignore storage quota errors
  }
}

// What the garrison farmed while the game was closed, or null
function computeOfflineReward(save) {
  const lastSeen = readLastSeen();
  if (!lastSeen || save.sector <= 1) return null;
  const garrisonLevel = save.upgrades.auto_drone || 0;
  return getOfflineReward({
    elapsedMs: Date.now() - lastSeen,
    sector: save.sector - 1,
    gridSize: Math.min(8, 3 + (save.upgrades.grid_size || 0)),
    shardMultLevel: save.upgrades.shard_mult || 0,
    garrisonLevel,
    crestOfflineLevel: save.crestUpgrades.crest_offline || 0,
    goldMult: getCrestGoldMult(save.overclockCores || 0, save.crestUpgrades),
  });
}

const toFiniteNumber = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const toWhole = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Math.floor(toFiniteNumber(value, fallback, min, max));

// A { positive whole key: whole count } map, with every count clamped to 1..maxCount
const toCountMap = (value, maxCount) => {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  Object.keys(value).forEach((key) => {
    const k = Number(key);
    const count = toWhole(value[key], 0, 0, maxCount);
    if (Number.isInteger(k) && k >= 1 && k <= 100000 && count > 0) out[k] = count;
  });
  return out;
};

const AUTO_BEAT_MS = 1200;
// Pause after a run ends so the result reads and auto never outpaces a player by much
const AUTO_RESTART_MS = 2500;

// Auto's aim: try every living raider with a throwaway roll and take the shot that fells the most
function pickAutoTarget(live, { selectedAbilityId, save, activeGridSize }) {
  const rng = createSeededRandom(`auto-${live.volleysFired}`);
  let best = null;
  let bestScore = -1;
  live.board.forEach((cell) => {
    if (cell.type === NODE_TYPES.EMPTY || cell.hp <= 0) return;
    const trial = executeAbilityAndResolveChains({
      cells: live.board,
      gridSize: activeGridSize,
      targetRow: cell.row,
      targetCol: cell.col,
      abilityId: selectedAbilityId,
      abilityLevel: Math.max(1, save.abilityLevels[selectedAbilityId] || 1),
      chainAmpLevel: save.upgrades.chain_amp || 0,
      luckySparkLevel: save.upgrades.lucky_spark || 0,
      contagionLevel: save.upgrades.contagion || 0,
      sector: live.sector,
      turnAmplifierBonus: live.amp,
      rng,
    });
    const score = trial.stats.nodesDestroyed + (trial.stats.isBoardClear ? 100 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  });
  return best;
}

function StarRow({ count, label, size = 14 }) {
  return (
    <span className="star-row" role="img" aria-label={label} title={label}>
      {[1, 2, 3].map((n) => (
        <Star key={n} size={size} className={n <= count ? 'star-lit' : 'star-dim'} />
      ))}
    </span>
  );
}

// Records a stage clear's stars and opens any chapter chests they unlock
function applyStageClear(prevStars, prevChests, sector, stars) {
  if (stars <= (prevStars[sector] || 0)) {
    return { stageStars: prevStars, chestsClaimed: prevChests, chestGold: 0 };
  }
  const stageStars = { ...prevStars, [sector]: stars };
  const chapter = Math.ceil(sector / STAGES_PER_CHAPTER);
  const claimed = prevChests[chapter] || 0;
  const reached = CHAPTER_CHEST_STARS.filter((n) => getChapterStars(stageStars, chapter) >= n).length;
  let chestGold = 0;
  for (let tier = claimed + 1; tier <= reached; tier++) {
    chestGold += getChapterChestGold(chapter, tier);
  }
  const chestsClaimed = reached > claimed ? { ...prevChests, [chapter]: reached } : prevChests;
  return { stageStars, chestsClaimed, chestGold };
}

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
  const totalShardsEarned = toWhole(parsed.totalShardsEarned, 0);
  const rawCrests =
    parsed.crestUpgrades && typeof parsed.crestUpgrades === 'object' ? parsed.crestUpgrades : {};
  const crestUpgrades = {};
  CREST_TREE.forEach((node) => {
    const lvl = toWhole(rawCrests[node.id], 0, 0, node.costs.length);
    if (lvl > 0) crestUpgrades[node.id] = lvl;
  });
  const rawAttempts = parsed.waveAttempts && typeof parsed.waveAttempts === 'object' ? parsed.waveAttempts : {};

  return {
    tutorialCompleted: parsed.tutorialCompleted === true,
    shards: toWhole(parsed.shards, 0),
    totalShardsEarned,
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
    stageStars: toCountMap(parsed.stageStars, 3),
    chestsClaimed: toCountMap(parsed.chestsClaimed, CHAPTER_CHEST_STARS.length),
    crestUpgrades,
    runGoldStart: toWhole(parsed.runGoldStart, 0, 0, totalShardsEarned),
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
  const [floatingPopups, setFloatingPopups] = useState([]);
  const [vfxQueue, setVfxQueue] = useState([]);
  const [firingWeaponId, setFiringWeaponId] = useState(null);
  // A shot settles the battle at once, but the board keeps showing each hit tile's old HP until
  // that hit's effect lands. `hidden` maps cell id to the HP still shown; `board` ties the reveal
  // to the board it was made for, so a new wave or reset drops it.
  const [reveal, setReveal] = useState(null);
  const revealTokenRef = useRef(null);
  const gridStageRef = useRef(null);
  const gridRef = useRef(null);

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
      runGold: 0,
      firstClearBonus: 0,
      volleysFired: 0,
      starsEarned: 0,
      chestGold: 0,
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
    if ('adVolleyUsed' in patch) setAdVolleyUsed(patch.adVolleyUsed);
  };

  const [commanderMessage, setCommanderMessage] = useState(
    'Pick a weapon, then tap a raider.'
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
  const [showStageMap, setShowStageMap] = useState(false);
  const [showCrestTree, setShowCrestTree] = useState(false);
  // Gold the garrison farmed while the game was closed, shown once on load
  const [offlineReward, setOfflineReward] = useState(() => computeOfflineReward(save));
  // Stage that auto is replaying, or null
  const [autoSector, setAutoSector] = useState(null);
  const [showGuideDrawer, setShowGuideDrawer] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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

  // The game changes screens without changing the URL, so GA4 would only ever see the first
  // page_view. Report each screen so time spent in the Forge, Daily and so on is visible.
  useEffect(() => {
    trackEvent('screen_view', {
      screen_name: screen === 'PLAY' ? `PLAY_${gameMode}` : screen,
    });
  }, [screen, gameMode]);

  // Keep the last-seen time fresh so the offline garrison counts only real time away
  useEffect(() => {
    writeLastSeen();
    const timer = setInterval(writeLastSeen, LAST_SEEN_HEARTBEAT_MS);
    window.addEventListener('pagehide', writeLastSeen);
    document.addEventListener('visibilitychange', writeLastSeen);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', writeLastSeen);
      document.removeEventListener('visibilitychange', writeLastSeen);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // Ignore storage quota errors
    }
  }, [save]);

  // With the game open in two tabs, each tab would overwrite the other's progress on its next
  // save. Adopt whatever another tab writes, so the last tab played always holds the real save.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || e.storageArea !== localStorage) return;
      if (e.newValue === null) {
        // Another tab reset progress
        window.location.reload();
        return;
      }
      try {
        const sanitized = sanitizeSave(JSON.parse(e.newValue));
        if (sanitized) {
          saveRef.current = sanitized;
          setSave(sanitized);
        }
      } catch {
        // Ignore a half-written or foreign value
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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

  // Escape closes the top open dialog
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (rewardedModalConfig.isOpen) setRewardedModalConfig((prev) => ({ ...prev, isOpen: false }));
      else if (showSettingsModal) setShowSettingsModal(false);
      else if (showBestiaryModal) setShowBestiaryModal(false);
      else if (showPrivacyModal) setShowPrivacyModal(false);
      else if (showStageMap) setShowStageMap(false);
      else if (showCrestTree) setShowCrestTree(false);
      else if (showGuideDrawer) setShowGuideDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    rewardedModalConfig.isOpen,
    showSettingsModal,
    showBestiaryModal,
    showPrivacyModal,
    showStageMap,
    showCrestTree,
    showGuideDrawer,
  ]);

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

  // The first shot (player or archer) on a campaign board commits an attempt at that wave.
  // Only attempts at the frontier wave are counted; replays of cleared stages are farming.
  const registerCampaignAttempt = () => {
    const live = battleRef.current;
    if (live.mode !== 'CAMPAIGN' || live.attemptCounted) return;
    live.attemptCounted = true;
    const isFrontier = live.sector === saveRef.current.sector;
    trackEvent('wave_started', { sector: live.sector, frontier: isFrontier });
    if (!isFrontier) return;

    const prevAttempts = saveRef.current.waveAttempts;
    const attempt = prevAttempts && prevAttempts.sector === live.sector ? prevAttempts.count + 1 : 1;
    const waveAttempts = { sector: live.sector, count: attempt };
    saveRef.current = { ...saveRef.current, waveAttempts };
    setSave((prev) => ({ ...prev, waveAttempts }));
  };

  // Banks the gold for a resolved shot and advances the wave exactly once on VICTORY.
  // Every campaign run pays in full; the first clear of the frontier wave pays triple.
  const settleShot = (result, outcome) => {
    const live = battleRef.current;
    const isVictory = outcome === 'VICTORY';
    let earned = 0;

    if (live.mode === 'CAMPAIGN') {
      earned = Math.floor(result.stats.shardsEarned);
      live.runGold += earned;
      if (isVictory && live.sector === saveRef.current.sector) {
        live.firstClearBonus = live.runGold * (FIRST_CLEAR_GOLD_MULT - 1);
        earned += live.firstClearBonus;
      }
      if (isVictory) {
        live.starsEarned = getClearStars({
          volleysFired: live.volleysFired,
          volleysLeft: live.chargesLeft,
        });
        const { stageStars, chestsClaimed } = saveRef.current;
        live.chestGold = applyStageClear(stageStars, chestsClaimed, live.sector, live.starsEarned).chestGold;
      }
    } else if (live.mode === 'DAILY') {
      // Daily gold is held until the decree is won, and only the first win each day pays
      live.dailyPending += result.stats.shardsEarned;
      // Judged against the day the board belongs to, so a run that crosses midnight
      // can't claim the new day's daily with yesterday's board
      if (isVictory && saveRef.current.dailyClearedDate !== live.dailySeed) {
        earned = live.dailyPending;
      }
    }

    if (live.mode === 'TUTORIAL') return earned;

    const clearedSector = live.sector;
    const starsEarned = live.starsEarned;
    setSave((prev) => {
      const advance = live.mode === 'CAMPAIGN' && isVictory && prev.sector === clearedSector;
      const nextSector = advance ? clearedSector + 1 : prev.sector;
      const clear =
        live.mode === 'CAMPAIGN' && isVictory
          ? applyStageClear(prev.stageStars, prev.chestsClaimed, clearedSector, starsEarned)
          : { stageStars: prev.stageStars, chestsClaimed: prev.chestsClaimed, chestGold: 0 };
      const banked = earned + clear.chestGold;
      return {
        ...prev,
        shards: prev.shards + banked,
        totalShardsEarned: prev.totalShardsEarned + banked,
        stageStars: clear.stageStars,
        chestsClaimed: clear.chestsClaimed,
        sector: nextSector,
        maxSectorReached: Math.max(prev.maxSectorReached, nextSector),
        lethalClears: isVictory ? prev.lethalClears + 1 : prev.lethalClears,
        waveAttempts: advance ? { sector: nextSector, count: 0 } : prev.waveAttempts,
        dailyClearedDate:
          live.mode === 'DAILY' && isVictory && earned > 0 ? live.dailySeed : prev.dailyClearedDate,
      };
    });

    if (outcome === 'DEFEAT' && live.mode !== 'TUTORIAL') {
      trackEvent('wave_failed', {
        mode: live.mode,
        sector: clearedSector,
        frontier: clearedSector === saveRef.current.sector,
        raiders_left: result.stats.remainingNodes,
        volleys_fired: live.volleysFired,
      });
    }
    if (isVictory) {
      const attempts = saveRef.current.waveAttempts;
      trackEvent('lethal_board_clear', {
        mode: live.mode,
        sector: clearedSector,
        first_clear: live.firstClearBonus > 0,
        attempts: attempts && attempts.sector === clearedSector ? attempts.count : 0,
        grid_size: `${archerContextRef.current.activeGridSize}x${archerContextRef.current.activeGridSize}`,
        chain_depth: result.stats.chainDepth,
      });
    }
    return earned;
  };

  // Battlement archers shoot a living raider every 2.2s. They only fight while the wave is live
  // and the player still has volleys, so they can help win a wave but never finish a lost one.
  const droneLevel = save.upgrades.auto_drone || 0;
  useEffect(() => {
    if (droneLevel <= 0) return;

    const timer = setInterval(() => {
      const { screen: currentScreen, adBoostSeconds: boostLeft, activeGridSize: gridSize } =
        archerContextRef.current;
      const live = battleRef.current;
      const currentSave = saveRef.current;
      if (currentScreen !== 'PLAY' || live.mode !== 'CAMPAIGN' || isRewardedAdPlaying()) return;
      if (live.outcome !== 'IN_PROGRESS' || live.chargesLeft <= 0) return;

      const aliveCells = live.board.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0);
      if (aliveCells.length === 0) return;

      registerCampaignAttempt();
      const target = aliveCells[Math.floor(Math.random() * aliveCells.length)];
      const prestigeMult = getCrestGoldMult(currentSave.overclockCores || 0, currentSave.crestUpgrades);
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

      const hitVfx = (result.hits || []).map((h) => buildHitVfx(h, h.atMs));
      setVfxQueue((prev) => [...prev.slice(-10), ...(result.vfxAnimations || []), ...hitVfx]);
      const outcome = result.stats.isBoardClear ? 'VICTORY' : 'IN_PROGRESS';
      const shotFrom = live.board;
      // Archers land between player shots; keep any reveal in progress pointed at the new board
      setReveal((r) => (r && r.board === shotFrom ? { ...r, board: result.nextCells } : r));
      syncBattle({ board: result.nextCells, amp: result.nextTurnAmplifierBonus, outcome });
      const earned = settleShot(result, outcome);

      if (outcome === 'VICTORY') {
        setLastTurnStats(clearStats(result, earned));
        setCommanderMessage(
          `Your archers got the last one. Wave cleared! +${earned} Gold`
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
      runGold: 0,
      firstClearBonus: 0,
      volleysFired: 0,
      starsEarned: 0,
      chestGold: 0,
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
      adVolleyUsed: false,
    });
    setArmedCellId(null);
    setLastTurnStats(null);
    const lesson = TUTORIAL_LESSONS[step - 1] || TUTORIAL_LESSONS[0];
    setCommanderMessage(lesson.commanderSpeech);
    trackEvent('tutorial_step_started', { step });
  };

  // Shot stats for the result banner, with the clear's bonus gold and stars
  const clearStats = (result, earned) => {
    const live = battleRef.current;
    return {
      ...result.stats,
      shardsEarned: earned,
      firstClearBonus: live.firstClearBonus,
      stars: live.starsEarned,
      chestGold: live.chestGold,
    };
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

    battleRef.current = {
      board: nextCells,
      chargesLeft: maxChg,
      outcome: 'IN_PROGRESS',
      amp: 1,
      mode: targetMode,
      sector: boardSectorValue,
      attemptCounted: false,
      runGold: 0,
      firstClearBonus: 0,
      volleysFired: 0,
      starsEarned: 0,
      chestGold: 0,
      // Seeding crits and lucky procs makes the Daily play out the same for everyone
      rng: isDaily ? createSeededRandom(`DAILY-RNG-${todaySeed}`) : Math.random,
      dailySeed: isDaily ? todaySeed : null,
      dailyPending: 0,
      adVolleyUsed: false,
      lockUntil: 0,
    };
    syncBattle({
      board: nextCells,
      chargesLeft: maxChg,
      outcome: 'IN_PROGRESS',
      amp: 1,
      adVolleyUsed: false,
    });
    setArmedCellId(null);
    setBoardSector(boardSectorValue);
    setLastTurnStats(null);
    const dailyAlreadyWon = isDaily && save.dailyClearedDate === todaySeed;
    setCommanderMessage(
      isDaily
        ? dailyAlreadyWon
          ? `Daily Siege #${todaySeed}. You already won today, so this run is practice.`
          : `Daily Siege #${todaySeed}. Everyone gets this board today. Win it once for Gold.`
        : targetSector < save.sector
        ? `Stage ${getStageLabel(targetSector)}, replay. Every raider you take down pays Gold.`
        : `Stage ${getStageLabel(targetSector)}. Hit the kegs and shamans first.`
    );
  };

  // Resume a live campaign wave (e.g. returning from the Forge) instead of rerolling it
  const continueCampaign = () => {
    const live = battleRef.current;
    const canResume =
      live.mode === 'CAMPAIGN' &&
      live.outcome === 'IN_PROGRESS' &&
      live.attemptCounted &&
      live.sector <= save.sector &&
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

  /**
   * Plays a resolved shot back in time with its effects: each group of hits shows its HP loss,
   * flash, number, squash, shake and sound when its projectile or chain blast lands. Big moments
   * get a short hit-stop, and every later beat is pushed back by it so the board and effects
   * stay in step. Input stays locked until the last hit lands.
   */
  const playShotReveal = (result, shotFrom, { weaponId, onFinish }) => {
    const token = {};
    revealTokenRef.current = token;
    const hits = result.hits || [];
    const live = battleRef.current;

    const shownHp = new Map(shotFrom.map((c) => [c.id, c.hp]));
    const hidden = {};
    const lastHitIndex = {};
    hits.forEach((h, i) => {
      if (!(h.cellId in hidden)) hidden[h.cellId] = shownHp.get(h.cellId) ?? h.hpAfter + h.damage;
      lastHitIndex[h.cellId] = i;
    });

    const groups = [];
    hits.forEach((h, i) => {
      let g = groups[groups.length - 1];
      if (!g || g.atMs !== h.atMs) {
        g = { atMs: h.atMs, depth: h.depth, hits: [] };
        groups.push(g);
      }
      g.hits.push({ ...h, last: lastHitIndex[h.cellId] === i });
    });
    groups.sort((a, b) => a.atMs - b.atMs);

    const isClear = result.stats.isBoardClear;
    const extraVfx = [];
    const hitsOnCell = {};
    let freezeSoFar = 0;
    groups.forEach((g, gi) => {
      const isFinal = gi === groups.length - 1;
      g.realAt = g.atMs + freezeSoFar;
      g.hits.forEach((h) => {
        const n = (hitsOnCell[h.cellId] = (hitsOnCell[h.cellId] || 0) + 1);
        if (extraVfx.length < 64) extraVfx.push(buildHitVfx(h, g.atMs, n - 1));
      });
      const bigHit = g.hits.some(
        (h) => h.crit || h.lucky || (h.killed && shotFrom[h.idx]?.type === NODE_TYPES.BOSS)
      );
      const freeze = isFinal && isClear ? 140 : bigHit ? 70 : 0;
      if (isFinal && isClear) {
        extraVfx.push({ id: `vfx-flash-${Math.random()}`, type: 'FLASH', delayMs: g.atMs, duration: 320 });
      }
      if (freeze > 0) {
        extraVfx.push({ id: `vfx-stop-${Math.random()}`, type: 'HITSTOP', delayMs: g.atMs, duration: freeze });
        freezeSoFar += freeze;
      }
    });

    setVfxQueue((prev) => [...prev.slice(-10), ...(result.vfxAnimations || []), ...extraVfx]);
    if (groups.length === 0) {
      playSfx('hit', muted, { weapon: weaponId });
      onFinish();
      return 0;
    }
    setReveal({ token, board: result.nextCells, hidden });
    const lastAt = groups[groups.length - 1].realAt;
    live.lockUntil = performance.now() + lastAt + 40;

    groups.forEach((g, gi) => {
      setTimeout(() => {
        if (revealTokenRef.current !== token) return;
        flushSync(() =>
          setReveal((r) => {
            if (!r || r.token !== token) return r;
            const next = { ...r.hidden };
            g.hits.forEach((h) => {
              if (h.last) delete next[h.cellId];
              else next[h.cellId] = h.hpAfter;
            });
            return { ...r, hidden: next };
          })
        );
        playHitGroupFeedback(g, {
          weaponId,
          isClearBeat: isClear && gi === groups.length - 1,
        });
      }, g.realAt);
    });

    // Let the final blow breathe before the result banner and summary appear
    setTimeout(() => {
      if (revealTokenRef.current !== token) return;
      revealTokenRef.current = null;
      setReveal((r) => (r && r.token === token ? null : r));
      onFinish();
    }, lastAt + (isClear ? 520 : 320));
    return lastAt;
  };

  const playHitGroupFeedback = (g, { weaponId, isClearBeat }) => {
    const kills = g.hits.filter((h) => h.killed).length;
    const crits = g.hits.some((h) => h.crit);
    const lucky = g.hits.some((h) => h.lucky);

    const grid = gridRef.current;
    if (grid) {
      g.hits.forEach((h) => {
        const tile = grid.children[h.idx];
        if (!tile) return;
        if (h.killed && h.last) popIn(tile.querySelector('.tile-wreckage'));
        else squash(tile.querySelector('.creature-wrap'), h.crit || h.lucky);
      });
    }

    if (isClearBeat) {
      shake(gridStageRef.current, 10, 460);
    } else {
      const base = g.depth === 0 ? (kills > 0 ? 3 : 2) : Math.min(9, 3 + g.depth * 1.2);
      shake(gridStageRef.current, base + (crits || lucky ? 2 : 0), g.depth === 0 ? 180 : 260);
    }

    if (g.depth === 0) {
      playSfx('hit', muted, { kills, weapon: weaponId });
    } else {
      const lightning = g.hits.some((h) => h.source === 'Rune Lightning');
      playSfx('chain', muted, { depth: g.depth, lightning });
    }
    if (lucky) playSfx('lucky', muted);
    else if (crits) playSfx('crit', muted);
    if (isClearBeat) playSfx('clear', muted);
  };

  const handleCellClick = (cell) => {
    const live = battleRef.current;
    if (live.outcome !== 'IN_PROGRESS' || live.chargesLeft <= 0) return;
    if (performance.now() < live.lockUntil) return;
    const { row, col } = cell;

    if (lastPointerTypeRef.current === 'touch' && armedCellId !== cell.id) {
      setArmedCellId(cell.id);
      setHoverCell({ row, col });
      playSfx('tap', muted);
      return;
    }
    setArmedCellId(null);

    const isTutorial = live.mode === 'TUTORIAL';
    const isDaily = live.mode === 'DAILY';
    registerCampaignAttempt();
    live.volleysFired += 1;

    // Recoil on the weapon card in the dock
    setFiringWeaponId(selectedAbilityId);
    setTimeout(() => setFiringWeaponId(null), 420);

    const prestigeMult = getCrestGoldMult(save.overclockCores || 0, save.crestUpgrades);
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

    const shotFrom = live.board;
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
    const earned = settleShot(result, outcome);
    setLastTurnStats(clearStats(result, earned));

    const popupId = `${Date.now()}-${Math.random()}`;
    const luckyTag =
      result.stats.refundedCharge > 0
        ? '+1 Shot! '
        : result.stats.luckyProcsCount > 0
        ? `Ignite ×${result.stats.luckyProcsCount}! `
        : result.stats.critHitsCount > 0
        ? `Crit ×${result.stats.critHitsCount}! `
        : '';

    const revealMs = playShotReveal(result, shotFrom, {
      weaponId: selectedAbilityId,
      onFinish: () => {
        if (result.stats.isBoardClear) {
          try {
            confetti({
              particleCount: 45,
              spread: 65,
              origin: { y: 0.6 },
              colors: ['#fbbf24', '#f59e0b', '#fef08a', '#dc2626'],
              disableForReducedMotion: true,
            });
          } catch {
            // Ignore confetti errors
          }
        } else if (outcome === 'DEFEAT') {
          playSfx('defeat', muted);
        }

        setFloatingPopups((prev) => [
          ...prev.slice(-4),
          {
            id: popupId,
            row,
            col,
            text: result.stats.isBoardClear
              ? `${luckyTag}Cleared! +${earned} Gold`
              : `${luckyTag}-${result.stats.totalDamageDealt} (Chain ×${result.stats.chainDepth})`,
          },
        ]);
        setTimeout(() => {
          setFloatingPopups((prev) => prev.filter((p) => p.id !== popupId));
        }, 1350);
      },
    });
    // The commander comments once the shot has played out, not while it is still landing
    const announce = (msg) => setTimeout(() => setCommanderMessage(msg), revealMs);

    if (isTutorial) {
      if (result.stats.isBoardClear) {
        if (tutorialStep < 3) {
          announce(
            `One shot, whole board. That's the game.`
          );
        } else {
          const rewardGold = save.tutorialCompleted ? 0 : 15;
          announce(
            `Training done. Kegs, shamans, banners: you know them all.${
              rewardGold > 0 ? ` +${rewardGold} Gold` : ''
            }`
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
        announce(
          `Close. Hit the marked tile so the blast spreads.`
        );
      }
      return;
    }

    const latestLuckyEvent = result.events?.find((e) => e.type === 'LUCKY_PROC');
    if (result.stats.isBoardClear) {
      const goldText =
        isDaily && earned === 0
          ? 'Practice run, no Gold.'
          : live.firstClearBonus > 0
          ? `+${earned} Gold, first clear pays triple`
          : `+${earned} Gold`;
      announce(
        latestLuckyEvent
          ? `${latestLuckyEvent.text} Wave cleared! ${goldText}`
          : `Wave cleared! Chain ×${result.stats.chainDepth}. ${goldText}`
      );
    } else if (latestLuckyEvent) {
      announce(
        `${latestLuckyEvent.text} ${result.stats.remainingNodes} left, ${nextCharges} ${nextCharges === 1 ? 'shot' : 'shots'} to go.`
      );
    } else if (nextCharges > 0) {
      announce(
        `${result.stats.remainingNodes} left, ${nextCharges} ${nextCharges === 1 ? 'shot' : 'shots'} to go.`
      );
    } else if (isDaily) {
      announce(
        `Out of shots. The daily board holds. Try again; Gold comes when you win.`
      );
    } else {
      announce(
        `Out of shots. +${earned} Gold. Upgrade in the Forge, then try again or farm a cleared stage.`
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

    playSfx('upgrade', muted);
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
      currentLvl === 0 ? getWeaponUnlockCost(ab) : getAbilityUpgradeCost(idx, currentLvl);
    if (save.shards < cost) return;

    playSfx('upgrade', muted);
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
    if (save.sector < PRESTIGE_MIN_SECTOR) return;
    const coresToGain = getCrestsForReset(save.totalShardsEarned - save.runGoldStart);
    const crests = save.crestUpgrades;
    // Crest tree perks set where the new run starts
    const startGrid = crests.crest_courtyard || 0;
    const startVolleys = crests.crest_volley || 0;
    playSfx('clear', muted);

    setSave((prev) => ({
      ...DEFAULT_SAVE,
      tutorialCompleted: true,
      shards: 100 + (prev.crestUpgrades.crest_start_gold || 0) * 250,
      totalShardsEarned: prev.totalShardsEarned,
      runGoldStart: prev.totalShardsEarned,
      maxSectorReached: prev.maxSectorReached,
      lethalClears: prev.lethalClears,
      overclockCores: (prev.overclockCores || 0) + coresToGain,
      crestUpgrades: prev.crestUpgrades,
      upgrades: { ...DEFAULT_SAVE.upgrades, grid_size: startGrid, max_charges: startVolleys },
      stageStars: prev.stageStars,
      chestsClaimed: prev.chestsClaimed,
      dailyClearedDate: prev.dailyClearedDate,
      estSessionRevenueUsd: prev.estSessionRevenueUsd,
    }));

    // Pass the reset grid and volley sizes; `save` here is still the pre-reset snapshot
    startGameSession('CAMPAIGN', 1, 3 + startGrid, 2 + startVolleys);
    trackEvent('prestige_overclock', { cores_gained: coresToGain });
  };

  const handleBuyCrest = (nodeId) => {
    const node = CREST_TREE.find((n) => n.id === nodeId);
    if (!node) return;
    const lvl = save.crestUpgrades[nodeId] || 0;
    const cost = node.costs[lvl];
    const unspent = (save.overclockCores || 0) - getCrestsSpent(save.crestUpgrades);
    if (cost === undefined || unspent < cost) return;
    playSfx('upgrade', muted);
    setSave((prev) => ({
      ...prev,
      crestUpgrades: { ...prev.crestUpgrades, [nodeId]: (prev.crestUpgrades[nodeId] || 0) + 1 },
    }));
    trackEvent('crest_upgrade', { node_id: nodeId, new_level: lvl + 1, cost });
  };

  const collectOfflineReward = (mult) => {
    const reward = offlineReward;
    if (!reward) return;
    setOfflineReward(null);
    const gold = reward.gold * mult;
    setSave((prev) => ({
      ...prev,
      shards: prev.shards + gold,
      totalShardsEarned: prev.totalShardsEarned + gold,
    }));
    trackEvent('offline_collect', { gold, minutes: reward.minutes, doubled: mult > 1 });
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
      `🏰 Lethal Grid (${
        gameMode === 'DAILY' ? `Daily Siege #${todaySeed}` : `Stage ${getStageLabel(boardSector)}`
      })`,
      `Board ${activeGridSize}×${activeGridSize} | Waves cleared: ${save.lethalClears}`,
      ...emojiRows,
      `Play free: ${window.location.origin}`,
    ].join('\n');

    // The clipboard can be blocked (permissions, iframes, older browsers), so only say
    // "Copied" when it worked and fall back to the system share sheet when there is one
    const showShareState = (state) => {
      setShareCopied(state);
      setTimeout(() => setShareCopied(false), 2500);
    };
    const copy = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(shareText)
      : Promise.reject(new Error('Clipboard unavailable'));
    copy
      .then(() => {
        showShareState('copied');
        trackEvent('share_score_copied', { mode: gameMode, sector: save.sector });
      })
      .catch(() => {
        if (navigator.share) {
          navigator.share({ text: shareText }).catch(() => {});
          trackEvent('share_score_sheet', { mode: gameMode, sector: save.sector });
        } else {
          showShareState('failed');
        }
      });
  };

  // What each rewarded ad grants. Revenue is only estimated in sandbox mode; live ads are
  // paid and counted by Google.
  const addSandboxRevenue = () =>
    setSave((prev) => ({
      ...prev,
      estSessionRevenueUsd: +(prev.estSessionRevenueUsd + 0.025).toFixed(3),
    }));
  const grantDoubleGold = () => setAdBoostSeconds((s) => (s > 0 ? s : 180));
  const grantExtraShot = () => {
    const live = battleRef.current;
    if (live.adVolleyUsed || live.outcome !== 'DEFEAT') return;
    // Ignore the trailing click of a double-click on "Claim" landing on the board
    live.lockUntil = performance.now() + 350;
    syncBattle({
      chargesLeft: Math.min(maxTurnCharges, live.chargesLeft + 1),
      outcome: 'IN_PROGRESS',
      adVolleyUsed: true,
    });
  };

  // Sandbox stand-in for a real ad: the simulated 3-second card
  const showSandboxAd = (rewardTitle) => (onReward) =>
    setRewardedModalConfig({
      isOpen: true,
      rewardTitle,
      onClaim: () => {
        onReward();
        addSandboxRevenue();
      },
    });

  // Reward buttons appear only while an ad can actually be shown. Google serves one rewarded
  // request at a time, so on a lost wave the 2x Gold offer yields to the +1 Shot offer.
  const goldAd = useRewardedAd(
    screen === 'PLAY' &&
      gameMode === 'CAMPAIGN' &&
      adBoostSeconds <= 0 &&
      waveOutcome === 'IN_PROGRESS'
      ? 'double_gold'
      : null,
    { onSandboxShow: showSandboxAd('2× Gold for 3 minutes') }
  );
  const shotAd = useRewardedAd(
    screen === 'PLAY' && waveOutcome === 'DEFEAT' && !adVolleyUsed ? 'extra_shot' : null,
    { onSandboxShow: showSandboxAd('+1 Shot') }
  );
  const garrisonAd = useRewardedAd(offlineReward && screen === 'MENU' ? 'garrison_double' : null, {
    onSandboxShow: showSandboxAd('2× Garrison Gold'),
  });

  const isRevealing = Boolean(reveal && reveal.board === board);
  const displayBoard = isRevealing
    ? board.map((c) =>
        c.id in reveal.hidden
          ? { ...c, hp: reveal.hidden[c.id], justHit: false, destroyedByChain: false }
          : c
      )
    : board;
  const remainingAliveNodes = displayBoard.filter(
    (c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0
  ).length;
  const isBoardCleared = remainingAliveNodes === 0;
  const isWaveLive = waveOutcome === 'IN_PROGRESS' && chargesLeft > 0;
  // Best stage cleared this run of the campaign, the one to farm when the frontier holds
  const bestClearedSector = save.sector - 1;
  const isFrontierBoard = boardSector === save.sector;
  const unspentCrests = Math.max(0, (save.overclockCores || 0) - getCrestsSpent(save.crestUpgrades));
  // Auto: fires the best-scoring shot each beat, then starts the stage again when it ends.
  // Handlers change every render, so the loop reads the latest ones through a ref.
  const autoActionsRef = useRef(null);
  autoActionsRef.current = { handleCellClick, startGameSession, selectedAbilityId, save, activeGridSize };
  useEffect(() => {
    if (autoSector === null) return;
    if (screen !== 'PLAY' || gameMode !== 'CAMPAIGN') {
      setAutoSector(null);
      return;
    }
    const timer = setInterval(() => {
      const live = battleRef.current;
      const actions = autoActionsRef.current;
      if (live.mode !== 'CAMPAIGN' || live.sector !== autoSector) {
        setAutoSector(null);
        return;
      }
      if (isRewardedAdPlaying() || performance.now() < live.lockUntil) return;
      if (live.outcome !== 'IN_PROGRESS' || live.chargesLeft <= 0) {
        if (performance.now() < live.lockUntil + AUTO_RESTART_MS) return;
        actions.startGameSession('CAMPAIGN', autoSector);
        return;
      }
      const target = pickAutoTarget(live, actions);
      if (!target) return;
      lastPointerTypeRef.current = 'auto';
      actions.handleCellClick(target);
    }, AUTO_BEAT_MS);
    return () => clearInterval(timer);
  }, [autoSector, screen, gameMode]);

  // Auto plays only stages already cleared with 3 stars, so it farms and never pushes
  const canAutoSiege =
    screen === 'PLAY' && !isFrontierBoard && (save.stageStars[boardSector] || 0) >= 3 && autoSector === null;
  const isAutoSieging = autoSector !== null && autoSector === boardSector;
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
        return save.maxSectorReached >= (ab.minSector || 1) && save.shards >= getWeaponUnlockCost(ab);
      }
      return save.shards >= getAbilityUpgradeCost(node.abilityIndex, lvl);
    }
    return false;
  }).length;

  // A player who skipped the tutorial and has cleared a stage is past the first-run menu
  const isNewPlayer = !save.tutorialCompleted && save.maxSectorReached <= 1;

  const activeTutorialLesson =
    screen === 'TUTORIAL' ? TUTORIAL_LESSONS[tutorialStep - 1] || TUTORIAL_LESSONS[0] : null;

  return (
    <div className="app-shell">
      {/* HUD: home, logo, forge or play, gold, sound and settings */}
      {screen !== 'MENU' && (
        <header className="top-nav game-hud">
          <div className="hud-left">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setScreen('MENU')}
              aria-label="Home"
              title="Home"
            >
              <Home size={18} />
            </button>
            <img
              className="hud-logo"
              src="/logo.svg"
              alt="Lethal Grid"
              width="144"
              height="28"
            />
          </div>

          <div className="top-actions">
            {screen === 'UPGRADES' ? (
              <button type="button" className="btn-secondary hud-btn" onClick={() => continueCampaign()}>
                <Play size={18} />
                <span>Play</span>
              </button>
            ) : (
              screen === 'PLAY' && (
                <button type="button" className="btn-secondary hud-btn" onClick={() => setScreen('UPGRADES')}>
                  <ShoppingBag size={18} />
                  <span>Forge</span>
                  {affordableUpgradesCount > 0 && (
                    <span className="nav-badge-count">{affordableUpgradesCount}</span>
                  )}
                </button>
              )
            )}

            <div className="wallet-pill" title="Gold">
              <GoldCoin size={16} />
              <strong>{save.shards.toLocaleString()}</strong>
            </div>

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
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={() => setShowSettingsModal(true)}
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>
      )}

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

      {/* Title screen */}
      {screen === 'MENU' && (
        <main className="indie-title-screen">
          <div className="title-corner-bar">
            <div className="title-corner-left">
              <div className="title-status-chip" title="Your Kingdom Save Progress">
                <span><GoldCoin size={16} /> {save.shards.toLocaleString()}</span>
                <span className="chip-sep">•</span>
                <span>Stage {getStageLabel(save.sector)}</span>
              </div>
            </div>

            <div className="title-corner-right">
              <button
                type="button"
                className="title-utility-btn"
                onClick={() => setShowBestiaryModal(true)}
                title="Bestiary"
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
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>

              <button
                type="button"
                className="title-utility-btn icon-only"
                onClick={() => setShowSettingsModal(true)}
                aria-label="Settings"
                title="Settings"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

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

            <span className="title-eyebrow-ribbon">A chain-reaction siege puzzle</span>
            <h1 className="title-main-logo">
              <img src="/logo.svg" alt="Lethal Grid" width="576" height="112" />
            </h1>
            <p className="title-tagline">
              One shot. One chain. No goblins left.
            </p>

            <nav className="indie-menu-stack" aria-label="Main Menu">
              {isNewPlayer ? (
                <button
                  type="button"
                  className="indie-menu-btn primary"
                  onClick={() => startTutorial(1)}
                >
                  <Sword size={18} className="menu-sword-cursor" />
                  <span className="menu-btn-label">Learn to Play</span>
                  <span className="menu-btn-tag gold">+15 <GoldCoin size={16} /></span>
                </button>
              ) : (
                <button
                  type="button"
                  className="indie-menu-btn primary"
                  onClick={() => continueCampaign()}
                >
                  <Sword size={18} className="menu-sword-cursor" />
                  <span className="menu-btn-label">Continue</span>
                  <span className="menu-btn-tag gold">Stage {getStageLabel(save.sector)}</span>
                </button>
              )}

              {save.sector > 1 && (
                <button
                  type="button"
                  className="indie-menu-btn"
                  onClick={() => setShowStageMap(true)}
                >
                  <Castle size={18} className="menu-sword-cursor" />
                  <span className="menu-btn-label">Map</span>
                  <span className="menu-btn-tag">Replay stages</span>
                </button>
              )}

              {(save.overclockCores || 0) > 0 && (
                <button
                  type="button"
                  className="indie-menu-btn"
                  onClick={() => setShowCrestTree(true)}
                >
                  <Crown size={18} className="menu-sword-cursor" />
                  <span className="menu-btn-label">Crests</span>
                  <span className={`menu-btn-tag ${unspentCrests > 0 ? 'ready' : ''}`}>
                    {unspentCrests > 0 ? `${unspentCrests} to spend` : 'Crest tree'}
                  </span>
                </button>
              )}

              <button
                type="button"
                className="indie-menu-btn"
                onClick={() => startGameSession('DAILY', 5)}
              >
                <Sword size={18} className="menu-sword-cursor" />
                <span className="menu-btn-label">Daily Siege</span>
                <span className="menu-btn-tag">#{getTodayDateSeed().slice(5)}</span>
              </button>

              <button
                type="button"
                className="indie-menu-btn"
                onClick={() => setScreen('UPGRADES')}
              >
                <Sword size={18} className="menu-sword-cursor" />
                <span className="menu-btn-label">Forge</span>
                {affordableUpgradesCount > 0 ? (
                  <span className="menu-btn-tag ready">{affordableUpgradesCount} ready</span>
                ) : (
                  <span className="menu-btn-tag">{campaignGridSize}×{campaignGridSize}</span>
                )}
              </button>

              {isNewPlayer ? (
                <button
                  type="button"
                  className="indie-menu-btn"
                  onClick={() => continueCampaign()}
                >
                  <Sword size={18} className="menu-sword-cursor" />
                  <span className="menu-btn-label">Skip Tutorial</span>
                  <span className="menu-btn-tag">Stage {getStageLabel(save.sector)}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="indie-menu-btn"
                  onClick={() => startTutorial(1)}
                >
                  <Sword size={18} className="menu-sword-cursor" />
                  <span className="menu-btn-label">Training</span>
                  <span className="menu-btn-tag">Practice</span>
                </button>
              )}
            </nav>
          </div>
        </main>
      )}

      {/* Battle (campaign, Daily and tutorial) */}
      {(screen === 'PLAY' || screen === 'TUTORIAL') && (
        <main className="arena-focused-stage">
          <DungeonStageBanner
            waveNumber={screen === 'TUTORIAL' ? tutorialStep : boardSector}
            stageTitle={
              screen === 'TUTORIAL'
                ? `Trial ${tutorialStep}`
                : gameMode === 'DAILY'
                ? 'Daily Siege'
                : `Stage ${getStageLabel(boardSector)}`
            }
            remainingEnemies={remainingAliveNodes}
            totalEnemies={board.filter((c) => c.type !== NODE_TYPES.EMPTY).length}
            isAttacking={Boolean(firingWeaponId)}
            isCleared={isBoardCleared}
            commanderMessage={commanderMessage}
            selectedWeaponId={selectedAbilityId}
          />

          <div className="battle-hud-bar">
            <div className="charges-display">
              <span className="charges-label">Shots</span>
              <div className="charge-pips">
                {Array.from({ length: maxTurnCharges }).map((_, i) => (
                  <span
                    key={i}
                    className={`charge-pip ${i < chargesLeft ? 'active' : 'spent'}`}
                    title="Shot"
                  >
                    <Sword size={18} />
                  </span>
                ))}
              </div>
              {screen === 'PLAY' && (
                <span
                  className="amp-pill"
                  title="Ignite: any hit can set off a keg or shaman instantly"
                >
                  <Sparkles size={12} /> Ignite {8 + Math.round((save.upgrades.lucky_spark || 0) * 1.8)}%
                </span>
              )}
              {screen === 'PLAY' && gameMode === 'CAMPAIGN' && isAutoSieging ? (
                <button
                  type="button"
                  className="amp-pill"
                  title="Auto plays this stage until you stop it"
                  onClick={() => setAutoSector(null)}
                >
                  <Robot size={12} /> Auto on · Stop
                </button>
              ) : (
                screen === 'PLAY' &&
                gameMode === 'CAMPAIGN' &&
                !isFrontierBoard && (
                  <span className="amp-pill" title="A cleared stage. Replays pay full Gold.">
                    Replay {getStageLabel(boardSector)}
                  </span>
                )
              )}
              {turnAmplifierBonus > 1 && (
                <span className="amp-pill">
                  Rally +{Math.round((turnAmplifierBonus - 1) * 100)}%
                </span>
              )}
            </div>

            <div className="arena-actions">
              {screen === 'PLAY' && (goldAd.ready || adBoostSeconds > 0) && (
                <button
                  type="button"
                  className="btn-reward-chip"
                  onClick={() => goldAd.show(grantDoubleGold)}
                  disabled={adBoostSeconds > 0}
                >
                  <Gift size={14} />
                  <span>
                    {adBoostSeconds > 0 ? `2× Gold (${adBoostSeconds}s)` : '2× Gold'}
                  </span>
                </button>
              )}

              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  screen === 'TUTORIAL'
                    ? startTutorial(tutorialStep)
                    : startGameSession(gameMode, boardSector)
                }
              >
                <RotateCcw size={14} />
                <span>
                  Restart
                </span>
              </button>

              {screen === 'PLAY' && (
                <button type="button" className="btn-secondary btn-sm" onClick={handleShareScore}>
                  <Share2 size={14} />
                  <span>{shareCopied === 'copied' ? 'Copied' : shareCopied === 'failed' ? "Couldn't copy" : 'Share'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid-stage" ref={gridStageRef}>
            <div className="courtyard-board-wrap">
              <BattleVFXCanvas vfxQueue={vfxQueue} gridSize={activeGridSize} gridRef={gridRef} />

              <div
                ref={gridRef}
                className={`tactical-grid grid-size-${activeGridSize}`}
                style={{
                  gridTemplateColumns: `repeat(${activeGridSize}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${activeGridSize}, minmax(0, 1fr))`,
                }}
                onMouseLeave={() => {
                  if (lastPointerTypeRef.current !== 'touch') setHoverCell({ row: null, col: null });
                }}
              >
                {displayBoard.map((cell, idx) => {
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
                        <span className="tutorial-click-tag">Tap again to fire</span>
                      ) : (
                        isTutorialTarget && (
                          <span className="tutorial-click-tag">Shoot here</span>
                        )
                      )}

                      {!isDead ? (
                        <>
                          <div className="tile-top-row">
                            <span className="tile-type-tag">{meta.short}</span>
                            <span className="tile-hp-pill">
                              <Heart size={12} className="tile-hp-heart" />
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
                            <Flame size={24} className="explosion-burst" />
                          ) : (
                            cell.type !== NODE_TYPES.EMPTY && (
                              <Skull size={18} className="tile-cleared-mark" />
                            )
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {!isWaveLive && !isRevealing && (
              <div className={`turn-result-banner ${isBoardCleared ? 'win' : 'retry'}`}>
                <div>
                  <strong>
                    {isBoardCleared
                      ? 'Wave cleared!'
                      : `Out of shots. ${remainingAliveNodes} still standing.`}
                  </strong>
                  {screen === 'PLAY' && gameMode === 'CAMPAIGN' && isBoardCleared && lastTurnStats?.stars > 0 && (
                    <StarRow
                      count={lastTurnStats.stars}
                      label={`${lastTurnStats.stars} of 3 stars. Best: ${save.stageStars[boardSector] || 0}`}
                    />
                  )}
                  <p>
                    {screen === 'TUTORIAL'
                      ? isBoardCleared
                        ? 'Lovely chain.'
                        : 'Restart and hit the marked tile.'
                      : isBoardCleared
                      ? gameMode === 'DAILY' && !lastTurnStats?.shardsEarned
                        ? "You already won today, so this was practice."
                        : `${
                            lastTurnStats?.firstClearBonus > 0
                              ? `+${lastTurnStats?.shardsEarned || 0} Gold. First clear pays triple.`
                              : `+${lastTurnStats?.shardsEarned || 0} Gold, clear bonus included.`
                          }${
                            lastTurnStats?.chestGold > 0
                              ? ` Chapter chest opened: +${lastTurnStats.chestGold} Gold.`
                              : ''
                          }`
                      : gameMode === 'DAILY'
                      ? 'The daily board holds. Win it once for Gold.'
                      : 'Every hit still paid. Upgrade in the Forge, then retry or farm a cleared stage.'}
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
                          <span>Next lesson ({tutorialStep + 1}/3)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => startGameSession('CAMPAIGN', save.sector)}
                        >
                          <Play size={16} />
                          <span>Start Stage {getStageLabel(save.sector)}</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => startTutorial(tutorialStep)}
                      >
                        <RotateCcw size={16} />
                        <span>Restart</span>
                      </button>
                    )
                  ) : (
                    <>
                      {!isBoardCleared && !adVolleyUsed && shotAd.ready && (
                        <button
                          type="button"
                          className="btn-reward-inline"
                          onClick={() => shotAd.show(grantExtraShot)}
                        >
                          <Tv size={12} /> +1 Shot (ad)
                        </button>
                      )}
                      {affordableUpgradesCount > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setScreen('UPGRADES')}
                        >
                          <ShoppingBag size={15} />
                          <span>Forge ({affordableUpgradesCount})</span>
                        </button>
                      )}
                      {gameMode === 'CAMPAIGN' && canAutoSiege && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setAutoSector(boardSector)}
                        >
                          <Robot size={15} />
                          <span>Auto {getStageLabel(boardSector)}</span>
                        </button>
                      )}
                      {gameMode === 'CAMPAIGN' &&
                        (isBoardCleared ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => startGameSession('CAMPAIGN', boardSector)}
                          >
                            <RotateCcw size={15} />
                            <span>Replay {getStageLabel(boardSector)}</span>
                          </button>
                        ) : (
                          bestClearedSector >= 1 &&
                          bestClearedSector !== boardSector && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => startGameSession('CAMPAIGN', bestClearedSector)}
                            >
                              <RotateCcw size={15} />
                              <span>Farm {getStageLabel(bestClearedSector)}</span>
                            </button>
                          )
                        ))}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() =>
                          startGameSession(
                            gameMode,
                            gameMode === 'CAMPAIGN' && isBoardCleared ? save.sector : boardSector
                          )
                        }
                      >
                        <FastForward size={16} />
                        <span>
                          {gameMode === 'DAILY'
                            ? isBoardCleared
                              ? 'Play again (practice)'
                              : 'Retry'
                            : isBoardCleared
                            ? `Next: Stage ${getStageLabel(save.sector)}`
                            : `Retry ${getStageLabel(boardSector)}`}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="weapon-dock" role="radiogroup" aria-label="Weapons">
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
                    if (ab.id !== selectedAbilityId) playSfx('tap', muted);
                    setSelectedAbilityId(ab.id);
                  }}
                >
                  <div className={`ability-icon bg-${ab.color}`}>
                    <WeaponIllustration id={ab.id} />
                    <span className="hotkey-badge">{unlocked ? ab.hotkey : <Lock size={12} />}</span>
                  </div>
                  <div className="weapon-dock-text">
                    <div className="weapon-dock-top">
                      <strong>{ab.name}</strong>
                      {unlocked ? (
                        <span className="weapon-dmg-badge">{stats.damage} dmg</span>
                      ) : (
                        <span className="weapon-dmg-badge">
                          Stage {getStageLabel(ab.minSector)} · {getWeaponUnlockCost(ab)} <GoldCoin size={12} />
                        </span>
                      )}
                    </div>
                    <span>
                      {unlocked
                        ? ab.baseDesc
                        : idx > 0 && screen === 'TUTORIAL'
                        ? 'Unlocks after training'
                        : 'Unlock in the Forge'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </main>
      )}

      {/* Royal Forge */}
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

      {showGuideDrawer && (
        <section className="seo-guide-section" aria-label="Game Strategy Guide and Documentation">
          <div className="seo-grid">
            <article className="seo-card">
              <h3>
                <BookOpen size={18} className="text-amber" /> How to play Lethal Grid
              </h3>
              <p>
                <strong>Lethal Grid</strong> is a one-turn medieval puzzle with upgrades between waves.
                Clear every raider on the board with the shots you have. Hit the right one and
                the chain does the rest.
              </p>
              <ul>
                <li>
                  <strong>Sapper (red keg):</strong> explodes 3×3 when it falls.
                </li>
                <li>
                  <strong>Shaman (blue hood):</strong> throws lightning down its row or column when
                  it falls.
                </li>
                <li>
                  <strong>Herald (green banner):</strong> Rally: +50% damage for the rest of the turn.
                </li>
              </ul>
            </article>
            <article className="seo-card">
              <h3>
                <HelpCircle size={18} className="text-amber" /> The Forge and the Daily Siege
              </h3>
              <p>
                Spend Gold in the <strong>Forge</strong> to grow the board from 3×3 to 8×8, hire
                archers, and upgrade your four weapons. The <strong>Daily Siege</strong> is the same
                board for everyone, and pays Gold once a day.
              </p>
            </article>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowGuideDrawer(false)}>
              Close guide
            </button>
          </div>
        </section>
      )}

      {showSettingsModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={() => setShowSettingsModal(false)}
        >
          <div className="modal-card settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 id="settings-title">
              <Settings size={18} className="text-amber" /> Settings
            </h3>
            <div className="settings-list">
              <button type="button" className="btn-secondary" onClick={() => setMuted((m) => !m)}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                <span>Sound: {muted ? 'off' : 'on'}</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowBestiaryModal(true);
                }}
              >
                <BookOpen size={18} />
                <span>Bestiary</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowGuideDrawer(true);
                  // The guide renders below the screen, so bring it into view
                  setTimeout(() => {
                    document.querySelector('.seo-guide-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
              >
                <HelpCircle size={18} />
                <span>How to play</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowPrivacyModal(true);
                }}
              >
                <Shield size={18} />
                <span>Privacy</span>
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  if (window.confirm('Reset all progress? This cannot be undone.')) {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                  }
                }}
              >
                <RotateCcw size={18} />
                <span>Reset progress</span>
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => setShowSettingsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <RewardedAdModal
        isOpen={rewardedModalConfig.isOpen}
        onClose={() => setRewardedModalConfig((prev) => ({ ...prev, isOpen: false }))}
        rewardTitle={rewardedModalConfig.rewardTitle}
        onRewardClaimed={rewardedModalConfig.onClaim}
      />

      {/* Hidden while the ad plays so the ad card sits on top; it returns if the ad is skipped */}
      {offlineReward && screen === 'MENU' && !rewardedModalConfig.isOpen && (
        <OfflineRewardModal
          reward={offlineReward}
          onCollect={() => collectOfflineReward(1)}
          canWatchAd={garrisonAd.ready}
          onWatchAd={() => garrisonAd.show(() => collectOfflineReward(2))}
        />
      )}

      {showCrestTree && (
        <CrestTreeModal
          totalCrests={save.overclockCores || 0}
          crestUpgrades={save.crestUpgrades}
          onBuy={handleBuyCrest}
          onClose={() => setShowCrestTree(false)}
        />
      )}

      {showStageMap && (
        <StageMapModal
          frontierSector={save.sector}
          stageStars={save.stageStars}
          chestsClaimed={save.chestsClaimed}
          onPlayStage={(sector) => {
            setShowStageMap(false);
            startGameSession('CAMPAIGN', sector);
          }}
          onClose={() => setShowStageMap(false)}
        />
      )}

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
                <BookOpen size={18} className="text-amber" /> Bestiary
              </h3>
              <p>Hit the volatile ones first and let the blasts do the work.</p>
            </div>

            <div className="bestiary-modal-grid">
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.STANDARD} />
                <div>
                  <strong className="text-amber">Goblin</strong>
                  <span>Plain raider. Drops Gold.</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.BOMB} />
                <div>
                  <strong className="text-rose">Sapper</strong>
                  <span>Explodes 3×3 when it falls.</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.CONDUIT} />
                <div>
                  <strong className="text-cyan">Shaman</strong>
                  <span>Throws lightning down its row or column when it falls.</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.AMPLIFIER} />
                <div>
                  <strong className="text-emerald">Herald</strong>
                  <span>Rally: +50% damage for the rest of the turn.</span>
                </div>
              </div>
              <div className="bestiary-item">
                <CreatureSprite type={NODE_TYPES.BOSS} />
                <div>
                  <strong className="text-violet">Ogre</strong>
                  <span>Lots of HP. Shakes 5×5 when it falls. Bring it down with chains.</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowBestiaryModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrivacyModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
          <div className="modal-card privacy-modal-card">
            <h3 id="privacy-title">Privacy</h3>
            <p>
              <strong>1. Local storage:</strong> Lethal Grid stores your
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
            <p>
              <a href="/privacy" target="_blank" rel="noopener">
                Read the full privacy policy
              </a>
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
