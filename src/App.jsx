import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import confetti from 'canvas-confetti';
import {
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
  Tv,
  Settings,
  GoldCoin,
  Castle,
  Star,
  Robot,
  Crown,
  Music,
  Bomb,
  Zap,
  Flag,
  Crosshair,
  Fire,
  Coins,
  Potion,
} from './components/PixelIcons';
import {
  NODE_TYPES,
  NODE_META,
  ABILITIES,
  UPGRADE_CATALOG,
  INTRO_STAGES,
  BOSS_KINDS,
  RAIDER_KINDS,
  getNewRaiderKinds,
  dealBattleCards,
  getCardShotMods,
  revealSaboteurs,
  isShieldedByTroll,
  generateBoard,
  generateIntroBoard,
  getWallMax,
  marchHorde,
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
  IS_PORTAL_BUILD,
} from './services/analytics';
import { playSfx } from './services/sfx';
import { StageMapModal } from './components/StageMapModal';
import { OfflineRewardModal } from './components/OfflineRewardModal';
import { CrestTreeModal } from './components/CrestTreeModal';
import { shake, squash, popIn } from './services/juice';
import { setMusicEnabled, setMusicTrack } from './services/music';
import { RewardedAdModal } from './components/AdUnit';
import { useRewardedAd, isRewardedAdPlaying } from './services/rewardedAds';
import {
  initPortalSdk,
  portalCommercialBreak,
  portalGameplayStart,
  portalGameplayStop,
  portalHappyTime,
  portalLoadingFinished,
} from './services/portalSdk';
import {
  CreatureSprite,
  FallenCreature,
  TutorialPointer,
  WeaponPixelIcon,
} from './components/CreatureSprite';
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
    blocked: hit.blocked,
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

const MUSIC_KEY = 'lethal_grid_music';

// BASE_URL is '/' on our site and './' in the portal build, which runs from a subfolder
const LOGO_URL = `${import.meta.env.BASE_URL}logo.svg`;

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

const CARD_ICONS = {
  Sword,
  Bomb,
  Zap,
  Flag,
  Crosshair,
  Castle,
  Fire,
  Coins,
  Star,
  Sparkles,
  Shield,
  Potion,
};

const AUTO_BEAT_MS = 1200;
// Pause after a run ends so the result reads and auto never outpaces a player by much
const AUTO_RESTART_MS = 2500;
// How long the horde takes to step forward after a shot
const MARCH_MS = 420;

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
      mods: getCardShotMods(live.card, live.volleysFired === 0),
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

  // Top-level screen state: 'MENU' | 'PLAY' | 'UPGRADES'
  const [screen, setScreen] = useState('MENU');

  const [gameMode, setGameMode] = useState('CAMPAIGN'); // 'CAMPAIGN' | 'DAILY'
  const [selectedAbilityId, setSelectedAbilityId] = useState('rail_beam');
  const [hoverCell, setHoverCell] = useState({ row: null, col: null });
  // Touch has no hover, so the first tap aims (shows the blast preview) and a second tap fires
  const [armedCellId, setArmedCellId] = useState(null);
  const lastPointerTypeRef = useRef('mouse');
  const [muted, setMuted] = useState(false);
  // Music has its own switch in Settings and is remembered; the speaker button mutes everything
  const [musicOn, setMusicOn] = useState(() => {
    try {
      return localStorage.getItem(MUSIC_KEY) !== 'off';
    } catch {
      return true;
    }
  });
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
  const activeGridSize = gameMode === 'DAILY' ? 5 : campaignGridSize;
  const maxTurnCharges = gameMode === 'DAILY' ? 3 : 2 + (save.upgrades.max_charges || 0);

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

  // 'IN_PROGRESS' until the board is cleared (VICTORY), or the volleys run out or the wall
  // falls (DEFEAT)
  const [waveOutcome, setWaveOutcome] = useState('IN_PROGRESS');
  const [wallHp, setWallHp] = useState(() => getWallMax(campaignGridSize));
  // The intro stage's tile to point at, until the first shot
  const [introTarget, setIntroTarget] = useState(null);
  // Raiders striking the wall this turn, by tile id
  const [strikingIds, setStrikingIds] = useState(null);
  // Before a campaign stage: three battle cards to pick from; then the one picked
  const [cardOffer, setCardOffer] = useState(null);
  const [activeCard, setActiveCard] = useState(null);
  const [wallCap, setWallCap] = useState(() => getWallMax(campaignGridSize));
  const shotCap = maxTurnCharges + (activeCard?.id === 'extra_shot' ? 1 : 0);
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
      wallHp: getWallMax(campaignGridSize),
      wallCap: getWallMax(campaignGridSize),
      intro: false,
      card: null,
      cardPending: false,
    };
  }

  const syncBattle = (patch) => {
    Object.assign(battleRef.current, patch);
    if ('board' in patch) setBoard(patch.board);
    if ('chargesLeft' in patch) setChargesLeft(patch.chargesLeft);
    if ('outcome' in patch) setWaveOutcome(patch.outcome);
    if ('amp' in patch) setTurnAmplifierBonus(patch.amp);
    if ('adVolleyUsed' in patch) setAdVolleyUsed(patch.adVolleyUsed);
    if ('wallHp' in patch) setWallHp(patch.wallHp);
    if ('wallCap' in patch) setWallCap(patch.wallCap);
  };

  const [commanderMessage, setCommanderMessage] = useState(
    'Pick a weapon, then tap a raider.'
  );
  const [lastTurnStats, setLastTurnStats] = useState(null);
  // Big text over the board after a long chain: { id, title, kills }
  const [comboCallout, setComboCallout] = useState(null);
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
    if (gameMode === 'DAILY') return true;
    return (save.abilityLevels[abilityId] || 0) >= 1;
  };

  useEffect(() => {
    initAnalyticsAndAds();
    initPortalSdk();
    portalLoadingFinished();
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
        // Clearing the last intro stage opens the full menu
        tutorialCompleted:
          prev.tutorialCompleted || (advance && !INTRO_STAGES[clearedSector + 1]),
        waveAttempts: advance ? { sector: nextSector, count: 0 } : prev.waveAttempts,
        dailyClearedDate:
          live.mode === 'DAILY' && isVictory && earned > 0 ? live.dailySeed : prev.dailyClearedDate,
      };
    });

    if (outcome === 'DEFEAT') trackWaveFailed(result.stats.remainingNodes, 'shots');
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

  const trackWaveFailed = (raidersLeft, reason) => {
    const live = battleRef.current;
    trackEvent('wave_failed', {
      mode: live.mode,
      sector: live.sector,
      frontier: live.sector === saveRef.current.sector,
      raiders_left: raidersLeft,
      volleys_fired: live.volleysFired,
      reason,
    });
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
      if (live.outcome !== 'IN_PROGRESS' || live.chargesLeft <= 0 || live.cardPending) return;

      const aliveCells = live.board.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0);
      if (aliveCells.length === 0) return;

      registerCampaignAttempt();
      const target = aliveCells[Math.floor(Math.random() * aliveCells.length)];
      const prestigeMult = getCrestGoldMult(currentSave.overclockCores || 0, currentSave.crestUpgrades);
      const plunder = live.card === 'plunder' ? 2 : 1;
      const adMult = (boostLeft > 0 ? 2 : 1) * prestigeMult * plunder;

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
        isAutoArcherShot: true,
        mods: getCardShotMods(live.card),
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
    // A new player's first three stages are set boards that teach one enemy each
    const intro =
      !isDaily &&
      !save.tutorialCompleted &&
      targetSector === save.sector &&
      gSize === 3 &&
      INTRO_STAGES[targetSector];

    const nextCells = intro
      ? generateIntroBoard(targetSector)
      : generateBoard({
          gridSize: gSize,
          sector: boardSectorValue,
          volatileBonusLevel: isDaily ? 3 : save.upgrades.volatile_spawn || 0,
          seedString: isDaily ? `DAILY-SEED-${todaySeed}` : null,
          isDaily,
        });
    const wallStart = getWallMax(gSize);
    // Campaign stages past the intro open with a choice of battle card
    const offer = targetMode === 'CAMPAIGN' && !intro ? dealBattleCards() : null;

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
      wallHp: wallStart,
      wallCap: wallStart,
      intro: Boolean(intro),
      card: null,
      cardPending: Boolean(offer),
      cardOffer: offer,
    };
    syncBattle({
      board: nextCells,
      chargesLeft: maxChg,
      outcome: 'IN_PROGRESS',
      amp: 1,
      adVolleyUsed: false,
      wallHp: wallStart,
      wallCap: wallStart,
    });
    setCardOffer(offer);
    setActiveCard(null);
    setArmedCellId(null);
    setBoardSector(boardSectorValue);
    setLastTurnStats(null);
    setStrikingIds(null);
    setIntroTarget(intro ? intro.target : null);
    const dailyAlreadyWon = isDaily && save.dailyClearedDate === todaySeed;
    setCommanderMessage(
      intro
        ? intro.hint
        : isDaily
        ? dailyAlreadyWon
          ? `Daily Siege #${todaySeed}. You already won today, so this run is practice.`
          : `Daily Siege #${todaySeed}. Everyone gets this board today. Win it once for Gold.`
        : targetSector < save.sector
        ? `Stage ${getStageLabel(targetSector)}, replay. Every raider you take down pays Gold.`
        : `Stage ${getStageLabel(targetSector)}. Hit the kegs and shamans first.`
    );
    if (intro) trackEvent('tutorial_step_started', { step: targetSector });
    if (!offer) announceBoss(nextCells);
  };

  // Big text over the board: a long chain, or the boss of a chapter arriving
  const showCallout = (title, sub, ms = 1400) => {
    const id = `callout-${Date.now()}-${Math.random()}`;
    setComboCallout({ id, title, sub, ms });
    setTimeout(() => setComboCallout((c) => (c?.id === id ? null : c)), ms);
  };

  // A chapter boss, or a raider this stage brings to the horde for the first time
  const announceBoss = (cells) => {
    const boss = cells.find((c) => c.bossKind);
    const live = battleRef.current;
    const newKind =
      live.mode === 'CAMPAIGN' &&
      getNewRaiderKinds(live.sector).find((k) => cells.some((c) => c.kind === k));
    const kind = boss ? BOSS_KINDS[boss.bossKind] : newKind ? RAIDER_KINDS[newKind] : null;
    if (!kind) return;
    showCallout(boss ? kind.name : `New: ${kind.name}`, kind.rule, 2400);
    setCommanderMessage(`${kind.name}! ${kind.rule}`);
  };

  // The card applies at once where it changes the stage itself: shots, wall, or the board
  const pickBattleCard = (card) => {
    const live = battleRef.current;
    if (!live.cardPending) return;
    live.cardPending = false;
    live.card = card.id;
    setCardOffer(null);
    setActiveCard(card);
    playSfx('upgrade', muted);
    trackEvent('battle_card_picked', { card: card.id, sector: live.sector });

    const patch = {};
    if (card.id === 'extra_shot') patch.chargesLeft = live.chargesLeft + 1;
    if (card.id === 'masons') {
      patch.wallHp = live.wallHp + 8;
      patch.wallCap = live.wallCap + 8;
    }
    if (card.id === 'saboteurs') patch.board = revealSaboteurs(live.board);
    if (card.id === 'war_horn') patch.amp = live.amp + 0.5;
    if (Object.keys(patch).length > 0) syncBattle(patch);

    setCommanderMessage(`${card.name}: ${card.desc}`);
    announceBoss(live.board);
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
      gameMode === 'DAILY' ? 3 : Math.max(1, save.abilityLevels[selectedAbilityId] || 1),
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
    const shields = new Set();
    hits.forEach((h, i) => {
      if (!(h.cellId in hidden)) hidden[h.cellId] = shownHp.get(h.cellId) ?? h.hpAfter + h.damage;
      lastHitIndex[h.cellId] = i;
      if (h.blocked) shields.add(h.cellId);
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
    setReveal({ token, board: result.nextCells, hidden, shields });
    const lastAt = groups[groups.length - 1].realAt;
    live.lockUntil = performance.now() + lastAt + 40;

    groups.forEach((g, gi) => {
      setTimeout(() => {
        if (revealTokenRef.current !== token) return;
        flushSync(() =>
          setReveal((r) => {
            if (!r || r.token !== token) return r;
            const next = { ...r.hidden };
            const shieldsUp = new Set(r.shields);
            g.hits.forEach((h) => {
              if (h.last) delete next[h.cellId];
              else next[h.cellId] = h.hpAfter;
              if (h.blocked) shieldsUp.delete(h.cellId);
            });
            return { ...r, hidden: next, shields: shieldsUp };
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

  /**
   * The horde's turn, after a shot that leaves raiders standing: the front rank strikes the
   * wall, then the rest step forward. Tiles slide to their new places (see the grid's layout
   * effect). The wall falling loses the wave.
   */
  const marchOnWall = () => {
    const live = battleRef.current;
    if (live.outcome !== 'IN_PROGRESS') return;
    const gridSize = Math.round(Math.sqrt(live.board.length));
    const march = marchHorde(live.board, gridSize);
    const bossActed = march.summoned.length > 0 || march.healed > 0;
    if (march.moved.length === 0 && march.wallDamage === 0 && !bossActed) return;

    const wallHpLeft = Math.max(0, live.wallHp - march.wallDamage);
    const outcome = wallHpLeft <= 0 ? 'DEFEAT' : 'IN_PROGRESS';
    syncBattle({ board: march.nextCells, wallHp: wallHpLeft, outcome });

    const notes = [];
    if (march.strikes.length > 0) {
      const ids = new Set(march.strikes.map((st) => st.cellId));
      setStrikingIds(ids);
      setTimeout(() => setStrikingIds((cur) => (cur === ids ? null : cur)), 520);
      shake(gridStageRef.current, 4 + Math.min(6, march.wallDamage), 260);
      playSfx('hit', muted, { weapon: 'nova_bomb' });
      const hitters = march.strikes.length;
      const arrows = march.strikes.every((st) => st.arrow);
      notes.push(
        `${
          arrows
            ? 'Arrows hit the wall!'
            : hitters === 1
            ? 'A raider hits the wall!'
            : `${hitters} raiders hit the wall!`
        } Wall ${wallHpLeft}/${live.wallCap}.`
      );
    }
    if (march.summoned.length > 0) notes.push('The Goblin King calls a goblin!');
    if (march.healed > 0) notes.push(`The Hex Witch heals ${march.healed}!`);
    if (bossActed) playSfx('lucky', muted);

    if (outcome === 'DEFEAT') {
      playSfx('defeat', muted);
      const left = march.nextCells.filter((c) => c.type !== NODE_TYPES.EMPTY && c.hp > 0);
      trackWaveFailed(left.length, 'wall');
      setCommanderMessage('The wall fell! Clear the front row before they reach it.');
      return;
    }
    if (notes.length > 0) setCommanderMessage(notes.join(' '));
  };

  const handleCellClick = (cell) => {
    const live = battleRef.current;
    if (live.outcome !== 'IN_PROGRESS' || live.chargesLeft <= 0 || live.cardPending) return;
    if (performance.now() < live.lockUntil) return;
    const { row, col } = cell;

    if (lastPointerTypeRef.current === 'touch' && armedCellId !== cell.id) {
      setArmedCellId(cell.id);
      setHoverCell({ row, col });
      playSfx('tap', muted);
      return;
    }
    setArmedCellId(null);

    const isDaily = live.mode === 'DAILY';
    registerCampaignAttempt();
    live.volleysFired += 1;
    setIntroTarget(null);

    // Recoil on the weapon card in the dock
    setFiringWeaponId(selectedAbilityId);
    setTimeout(() => setFiringWeaponId(null), 420);

    const prestigeMult = getCrestGoldMult(save.overclockCores || 0, save.crestUpgrades);
    const plunder = live.card === 'plunder' ? 2 : 1;
    const adMult = (adBoostSeconds > 0 ? 2 : 1) * prestigeMult * plunder;
    const mods = getCardShotMods(live.card, live.volleysFired === 1);

    const result = executeAbilityAndResolveChains({
      cells: live.board,
      gridSize: activeGridSize,
      targetRow: row,
      targetCol: col,
      abilityId: selectedAbilityId,
      abilityLevel: isDaily ? 3 : Math.max(1, save.abilityLevels[selectedAbilityId] || 1),
      chainAmpLevel: isDaily ? 4 : save.upgrades.chain_amp || 0,
      shardMultLevel: save.upgrades.shard_mult || 0,
      luckySparkLevel: isDaily ? 5 : save.upgrades.lucky_spark || 0,
      contagionLevel: isDaily ? 4 : save.upgrades.contagion || 0,
      adBoostMultiplier: isDaily ? 1 : adMult,
      sector: live.sector,
      turnAmplifierBonus: live.amp,
      isIntro: live.intro,
      isAutoArcherShot: false,
      mods,
      rng: live.rng,
    });

    const shotFrom = live.board;
    const nextCharges = Math.min(
      shotCap,
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
        if (outcome === 'IN_PROGRESS') marchOnWall();
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

        const { chainDepth, nodesDestroyed } = result.stats;
        if (chainDepth >= 2 && nodesDestroyed >= 3) {
          showCallout(
            chainDepth >= 6 ? 'Massacre!' : chainDepth >= 4 ? 'Great chain!' : 'Chain!',
            `${nodesDestroyed} raiders down`
          );
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
    // Hold input until the horde has finished its step
    if (outcome === 'IN_PROGRESS') {
      live.lockUntil = performance.now() + (revealMs > 0 ? revealMs + 320 : 0) + MARCH_MS;
    }
    // The commander comments once the shot has played out, not while it is still landing
    const announce = (msg) => setTimeout(() => setCommanderMessage(msg), revealMs);

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
    if (live.adVolleyUsed || live.outcome !== 'DEFEAT' || live.wallHp <= 0) return;
    // Ignore the trailing click of a double-click on "Claim" landing on the board
    live.lockUntil = performance.now() + 350;
    syncBattle({
      chargesLeft: Math.min(shotCap, live.chargesLeft + 1),
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
    screen === 'PLAY' && waveOutcome === 'DEFEAT' && wallHp > 0 && !adVolleyUsed ? 'extra_shot' : null,
    { onSandboxShow: showSandboxAd('+1 Shot') }
  );
  const garrisonAd = useRewardedAd(offlineReward && screen === 'MENU' ? 'garrison_double' : null, {
    onSandboxShow: showSandboxAd('2× Garrison Gold'),
  });

  const isRevealing = Boolean(reveal && reveal.board === board);
  const displayBoard = isRevealing
    ? board.map((c) =>
        c.id in reveal.hidden
          ? {
              ...c,
              hp: reveal.hidden[c.id],
              shield: c.shield || reveal.shields.has(c.id),
              justHit: false,
              destroyedByChain: false,
            }
          : c
      )
    : board;
  // When the horde marches, each raider's tile slides from its old slot to its new one. Slots
  // never move, so the old slot's box is where the tile came from.
  const tileOrder = displayBoard.map((c) => c.id).join();
  const tileSlotsRef = useRef(new Map());
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const prevSlots = tileSlotsRef.current;
    const slots = new Map();
    displayBoard.forEach((c, i) => slots.set(c.id, i));
    tileSlotsRef.current = slots;
    if (!grid || typeof grid.animate !== 'function') return;
    displayBoard.forEach((c, i) => {
      const from = prevSlots.get(c.id);
      if (from === undefined || from === i || c.type === NODE_TYPES.EMPTY || c.hp <= 0) return;
      const tile = grid.children[i];
      const origin = grid.children[from];
      if (!tile || !origin) return;
      const a = origin.getBoundingClientRect();
      const b = tile.getBoundingClientRect();
      tile.animate(
        [
          { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`, zIndex: 2 },
          { transform: 'translate(0, 0)', zIndex: 2 },
        ],
        { duration: MARCH_MS, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' }
      );
    });
  }, [tileOrder]);

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
  autoActionsRef.current = {
    handleCellClick,
    startGameSession,
    pickBattleCard,
    selectedAbilityId,
    save,
    activeGridSize,
  };
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
      // Auto takes the first card it is dealt
      if (live.cardPending) {
        actions.pickBattleCard(live.cardOffer[0]);
        return;
      }
      const target = pickAutoTarget(live, actions);
      if (!target) return;
      lastPointerTypeRef.current = 'auto';
      actions.handleCellClick(target);
    }, AUTO_BEAT_MS);
    return () => clearInterval(timer);
  }, [autoSector, screen, gameMode]);

  // Game portals time play and place their ads around it. A wave being played is gameplay;
  // entering one is the natural break for an ad, except on the intro stages and auto replays.
  const inBattle = screen === 'PLAY';
  useEffect(() => {
    setMusicTrack(inBattle ? 'battle' : 'menu');
  }, [inBattle]);
  useEffect(() => {
    setMusicEnabled(musicOn && !muted);
    try {
      localStorage.setItem(MUSIC_KEY, musicOn ? 'on' : 'off');
    } catch {
      // Private mode: the setting just isn't remembered
    }
  }, [musicOn, muted]);

  const inGameplay = inBattle && isWaveLive;
  useEffect(() => {
    if (!inGameplay) {
      portalGameplayStop();
      return undefined;
    }
    let active = true;
    const skipBreak = battleRef.current.intro || autoSector !== null;
    (skipBreak ? Promise.resolve() : portalCommercialBreak()).then(() => {
      if (active) portalGameplayStart();
    });
    return () => {
      active = false;
    };
  }, [inGameplay]);

  // A boss stage cleared is the portal's "happy time"
  useEffect(() => {
    if (screen === 'PLAY' && isBoardCleared && boardSector % 5 === 0) portalHappyTime();
  }, [screen, isBoardCleared, boardSector]);

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

  // Until the intro stages are cleared the menu shows only Play
  const isNewPlayer = !save.tutorialCompleted && save.sector <= 3;

  // HUD: home, logo, forge or play, gold, sound and settings. In battle it sits inside the arena,
  // so on a wide screen it can take the top of the weapon column instead of a full-width row.
  const hud = screen !== 'MENU' && (
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
          src={LOGO_URL}
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
  );

  return (
    <div className="app-shell">
      {screen !== 'PLAY' && hud}

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
              {!isNewPlayer && (
                <button
                  type="button"
                  className="title-utility-btn"
                  onClick={() => setShowBestiaryModal(true)}
                  title="Bestiary"
                >
                  <BookOpen size={15} />
                  <span>Bestiary</span>
                </button>
              )}

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
              <img src={LOGO_URL} alt="Lethal Grid" width="576" height="112" />
            </h1>
            <p className="title-tagline">
              One shot. One chain. No goblins left.
            </p>

            <nav className="indie-menu-stack" aria-label="Main Menu">
              <button
                type="button"
                className="indie-menu-btn primary"
                onClick={() => continueCampaign()}
              >
                <Sword size={18} className="menu-sword-cursor" />
                <span className="menu-btn-label">{save.sector > 1 ? 'Continue' : 'Play'}</span>
                <span className="menu-btn-tag gold">Stage {getStageLabel(save.sector)}</span>
              </button>

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

              {/* A new player sees only Play; the rest opens up after the intro stages */}
              {!isNewPlayer && (
                <>
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
                </>
              )}

            </nav>
          </div>
        </main>
      )}

      {/* Battle (campaign and Daily) */}
      {screen === 'PLAY' && (
        <main className="arena-focused-stage">
          {hud}

          <div className="arena-side">
            <DungeonStageBanner
              waveNumber={boardSector}
              stageTitle={gameMode === 'DAILY' ? 'Daily Siege' : `Stage ${getStageLabel(boardSector)}`}
              remainingEnemies={remainingAliveNodes}
              totalEnemies={board.filter((c) => c.type !== NODE_TYPES.EMPTY).length}
              isAttacking={Boolean(firingWeaponId)}
              isCleared={isBoardCleared}
              commanderMessage={commanderMessage}
              selectedWeaponId={selectedAbilityId}
              bossKind={board.find((c) => c.bossKind)?.bossKind}
            />

            <div className="battle-hud-bar">
              <div className="charges-display">
                <span className="charges-label">Shots</span>
                <div className="charge-pips">
                  {Array.from({ length: shotCap }).map((_, i) => (
                    <span
                      key={i}
                      className={`charge-pip ${i < chargesLeft ? 'active' : 'spent'}`}
                      title="Shot"
                    >
                      <Sword size={18} />
                    </span>
                  ))}
                </div>
                <span
                  key={wallHp}
                  className={`wall-meter ${wallHp < wallCap ? 'wall-hit' : ''} ${
                    wallHp <= Math.ceil(wallCap / 3) ? 'wall-low' : ''
                  }`}
                  title="Raiders on the bottom row hit the wall after each shot. If it falls, the wave is lost."
                >
                  <Castle size={14} /> Wall {wallHp}/{wallCap}
                </span>
                {screen === 'PLAY' && (
                  <span
                    className="amp-pill ignite-pill"
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
                {activeCard && (
                  <span className="amp-pill card-pill" title={activeCard.desc}>
                    {React.createElement(CARD_ICONS[activeCard.icon] || Star, { size: 12 })}{' '}
                    {activeCard.name}
                  </span>
                )}
                {turnAmplifierBonus > 1 && (
                  <span className="amp-pill">
                    Rally +{Math.round((turnAmplifierBonus - 1) * 100)}%
                  </span>
                )}
              </div>

              {screen === 'PLAY' && gameMode === 'CAMPAIGN' && (
                <div className="stage-goals" aria-label="Star goals">
                  <StarRow
                    count={save.stageStars[boardSector] || 0}
                    label={`Best: ${save.stageStars[boardSector] || 0} of 3 stars`}
                  />
                  <ul>
                    <li>Clear every raider</li>
                    <li>Keep a shot spare</li>
                    <li>Clear it in one shot</li>
                  </ul>
                </div>
              )}

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
                  onClick={() => startGameSession(gameMode, boardSector)}
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
          </div>

          <div className="grid-stage" ref={gridStageRef}>
            <div className="courtyard-board-wrap">
              <BattleVFXCanvas vfxQueue={vfxQueue} gridSize={activeGridSize} gridRef={gridRef} />

              {cardOffer && (
                <div className="card-offer" role="dialog" aria-label="Choose a battle card">
                  <strong className="card-offer-title">Choose a battle card</strong>
                  <div className="card-offer-row">
                    {cardOffer.map((card) => {
                      const Icon = CARD_ICONS[card.icon] || Star;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          className="battle-card"
                          onClick={() => pickBattleCard(card)}
                        >
                          <span className="battle-card-icon">
                            <Icon size={26} />
                          </span>
                          <strong>{card.name}</strong>
                          <span>{card.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {comboCallout && (
                <div
                  key={comboCallout.id}
                  className="combo-callout"
                  style={{ animationDuration: `${comboCallout.ms}ms` }}
                  aria-live="polite"
                >
                  <strong>{comboCallout.title}</strong>
                  <span>{comboCallout.sub}</span>
                </div>
              )}

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
                    !isDead &&
                    isWaveLive &&
                    introTarget?.row === cell.row &&
                    introTarget?.col === cell.col;

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
                        strikingIds?.has(cell.id) ? 'tile-striking' : '',
                        !isDead && isWaveLive && cell.row === activeGridSize - 1 ? 'tile-at-wall' : '',
                        isArmed ? 'tile-armed' : '',
                        cell.justHit ? 'tile-hit-flash' : '',
                        cell.destroyedByChain ? 'tile-chain-wrecked' : '',
                        cell.summoned ? 'tile-summoned' : '',
                        cell.healed ? 'tile-healed' : '',
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
                        isTutorialTarget && <TutorialPointer />
                      )}

                      {!isDead ? (
                        <>
                          <div className="tile-top-row">
                            <span className="tile-type-tag">
                              {cell.bossKind
                                ? BOSS_KINDS[cell.bossKind].short
                                : cell.kind
                                ? RAIDER_KINDS[cell.kind].short
                                : meta.short}
                            </span>
                            <span className="tile-hp-pill">
                              <Heart size={12} className="tile-hp-heart" />
                              {cell.hp}
                            </span>
                          </div>

                          {isShieldedByTroll(displayBoard, cell) && (
                            <span className="tile-shield-badge" title="Shielded by the troll">
                              <Shield size={14} />
                            </span>
                          )}

                          {cell.kind === 'ARCHER' &&
                            cell.draw === 1 &&
                            cell.row < activeGridSize - 1 && (
                              <span
                                className="tile-arrow-badge"
                                title="Shoots the wall at the end of this turn"
                              >
                                <Crosshair size={14} />
                              </span>
                            )}

                          <CreatureSprite
                            type={cell.type}
                            bossKind={cell.bossKind}
                            kind={cell.kind}
                            shield={cell.shield}
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
                          {cell.type !== NODE_TYPES.EMPTY && (
                            <FallenCreature
                              type={cell.type}
                              bossKind={cell.bossKind}
                              kind={cell.kind}
                              byBlast={cell.destroyedByChain}
                            />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* The castle wall the horde marches on, one block per point of wall */}
              <div
                key={wallHp}
                className={`castle-wall-strip ${wallHp < wallCap ? 'wall-hit' : ''} ${
                  wallHp <= Math.ceil(wallCap / 3) ? 'wall-low' : ''
                }`}
                aria-hidden="true"
              >
                {Array.from({ length: wallCap }).map((_, i) => (
                  <span key={i} className={i < wallHp ? 'wall-block' : 'wall-block broken'} />
                ))}
              </div>
            </div>

            {!isWaveLive && !isRevealing && (
              <div className={`turn-result-banner ${isBoardCleared ? 'win' : 'retry'}`}>
                <div>
                  <strong>
                    {isBoardCleared
                      ? 'Wave cleared!'
                      : wallHp <= 0
                      ? 'The wall fell!'
                      : `Out of shots. ${remainingAliveNodes} still standing.`}
                  </strong>
                  {screen === 'PLAY' && gameMode === 'CAMPAIGN' && isBoardCleared && lastTurnStats?.stars > 0 && (
                    <StarRow
                      count={lastTurnStats.stars}
                      label={`${lastTurnStats.stars} of 3 stars. Best: ${save.stageStars[boardSector] || 0}`}
                    />
                  )}
                  <p>
                    {isBoardCleared
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
                      : wallHp <= 0
                      ? 'Hit the raiders at the front first. Every hit still paid.'
                      : 'Every hit still paid. Upgrade in the Forge, then retry or farm a cleared stage.'}
                  </p>
                </div>

                <div className="banner-buttons">
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
                </div>
              </div>
            )}
          </div>

          <div className="weapon-dock" role="radiogroup" aria-label="Weapons">
            {ABILITIES.map((ab) => {
              const unlocked = isWeaponUnlocked(ab.id);
              const lvl = gameMode === 'DAILY' ? 3 : Math.max(1, save.abilityLevels[ab.id] || 1);
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
                        <span className="weapon-dmg-badge weapon-lock-badge">
                          Stage {getStageLabel(ab.minSector)}
                        </span>
                      )}
                    </div>
                    <span>
                      {unlocked ? ab.baseDesc : 'Unlock in the Forge'}
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
                <strong>Lethal Grid</strong> is a chain-reaction siege puzzle with upgrades between
                waves. Clear every raider on the board with the shots you have. Hit the right one and
                the chain does the rest.
              </p>
              <p>
                After each shot the horde marches one row closer. Raiders on the bottom row strike the
                castle wall, and if the wall falls the wave is lost, so deal with the front first.
              </p>
              <p>
                Before each stage, pick one of three <strong>battle cards</strong>: an extra shot,
                bigger keg blasts, double Gold and more. Every fifth stage ends on a boss with its own
                rule: the Ogre Warlord, the Goblin King, the Shield Troll and the Hex Witch.
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
              <button type="button" className="btn-secondary" onClick={() => setMusicOn((m) => !m)}>
                <Music size={18} />
                <span>Music: {musicOn ? 'on' : 'off'}</span>
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
                    try {
                      localStorage.removeItem(STORAGE_KEY);
                    } catch {
                      // Storage is blocked, so there is no saved progress to remove
                    }
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
              {Object.entries(RAIDER_KINDS).map(([kind, raider]) => (
                <div className="bestiary-item" key={kind}>
                  <CreatureSprite type={NODE_TYPES.STANDARD} kind={kind} />
                  <div>
                    <strong className="text-amber">{raider.name}</strong>
                    <span>
                      From stage {getStageLabel(raider.from)}. {raider.rule}
                    </span>
                  </div>
                </div>
              ))}
              {Object.entries(BOSS_KINDS).map(([kind, boss]) => (
                <div className="bestiary-item" key={kind}>
                  <CreatureSprite type={NODE_TYPES.BOSS} bossKind={kind} />
                  <div>
                    <strong className="text-violet">{boss.name}</strong>
                    <span>Chapter boss. {boss.rule} Shakes 5×5 when it falls.</span>
                  </div>
                </div>
              ))}
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
            {IS_PORTAL_BUILD ? (
              // Portal iframes block links out, so the whole policy is here
              <>
                <p>
                  Lethal Grid is a free game with no accounts. We never ask for your name, email or
                  payment details.
                </p>
                <p>
                  <strong>Your progress stays on your device.</strong> Your save (gold, stages,
                  upgrades, stars and settings) is kept in your browser&apos;s local storage and is
                  never sent to us. Clearing your browser&apos;s site data, or Reset progress in
                  Settings, deletes it.
                </p>
                <p>
                  <strong>No tracking or ads of our own.</strong> This version of Lethal Grid loads
                  no analytics, cookies or ad scripts. The website you are playing on may show ads
                  and collect data under its own privacy policy.
                </p>
                <p>
                  Lethal Grid is made for a general audience and is not directed at children under
                  13.
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
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
