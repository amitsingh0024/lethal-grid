/**
 * Game portal SDKs: CrazyGames, GameDistribution and Poki. `vite build --mode <portal>` picks
 * one, and only that build loads the portal's script. Every other build (the website, and the
 * SDK-free `portal` zip for itch.io and CrazyGames Basic Launch) gets no-ops, so the game calls
 * these the same way everywhere.
 *
 * Every portal's ads go through two calls: commercialBreak() between waves and
 * rewardedBreak() for the optional rewards. While an ad shows, sound is paused and
 * isAdPlaying() holds the game's timers (archers, auto).
 */
import { setMusicPaused } from './music';
import { setSfxPaused } from './sfx';

// Written as plain comparisons so the bundler drops the other portals' code from each build
const MODE = import.meta.env.MODE;
export const PORTAL_SDK =
  MODE === 'crazygames' || MODE === 'gamedistribution' || MODE === 'poki' ? MODE : null;

let adPlaying = false;
let lastAdEndedAt = 0;
export const isAdPlaying = () => adPlaying;

export function setAdPlaying(value) {
  if (adPlaying && !value) lastAdEndedAt = Date.now();
  adPlaying = value;
  setSfxPaused(value);
  setMusicPaused(value);
}

// No break right after another ad, such as the wave a +1 Shot reward reopens
const AD_GAP_MS = 30000;

let sdk = null;
let ready = Promise.resolve();
let inGameplay = false;
// GameDistribution reports a watched rewarded ad as an event, not through showAd's promise
let gdRewardEarned = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Loads the portal's SDK once. The game never waits on it: if a blocker stops the script, every
// call below quietly does nothing and rewarded buttons stay hidden.
export function initPortalSdk() {
  if (!PORTAL_SDK || typeof window === 'undefined') return ready;
  if (PORTAL_SDK === 'poki') {
    ready = loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js')
      .then(() => window.PokiSDK.init())
      .then(() => {
        sdk = window.PokiSDK;
      });
  } else if (PORTAL_SDK === 'crazygames') {
    ready = loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js')
      .then(() => window.CrazyGames.SDK.init())
      .then(() => {
        sdk = window.CrazyGames.SDK;
      });
  } else {
    window.GD_OPTIONS = {
      gameId: import.meta.env.VITE_GD_GAME_ID,
      onEvent(event) {
        if (event.name === 'SDK_GAME_PAUSE') setAdPlaying(true);
        else if (event.name === 'SDK_GAME_START') setAdPlaying(false);
        else if (event.name === 'SDK_REWARDED_WATCH_COMPLETE') gdRewardEarned = true;
      },
    };
    ready = loadScript('https://html5.api.gamedistribution.com/main.min.js').then(() => {
      sdk = window.gdsdk;
    });
  }
  ready = ready.catch(() => {
    sdk = null;
  });
  return ready;
}

// Resolves true once the portal's SDK is up; rewarded buttons show only then
export const whenPortalAdsReady = () => ready.then(() => Boolean(sdk));

export function portalLoadingFinished() {
  ready.then(() => {
    try {
      if (PORTAL_SDK === 'poki') sdk?.gameLoadingFinished();
      else if (PORTAL_SDK === 'crazygames') sdk?.game.loadingStop();
    } catch {
      // SDK calls must never break the game
    }
  });
}

function callGameplay(start) {
  try {
    if (PORTAL_SDK === 'poki') start ? sdk?.gameplayStart() : sdk?.gameplayStop();
    else if (PORTAL_SDK === 'crazygames') start ? sdk?.game.gameplayStart() : sdk?.game.gameplayStop();
  } catch {
    // SDK calls must never break the game
  }
}

// Portals reject the same event twice in a row, so these only fire on a change
export function portalGameplayStart() {
  if (inGameplay || adPlaying) return;
  inGameplay = true;
  callGameplay(true);
}

export function portalGameplayStop() {
  if (!inGameplay) return;
  inGameplay = false;
  callGameplay(false);
}

// CrazyGames' confetti moment, for a big win
export function portalHappyTime() {
  try {
    if (PORTAL_SDK === 'crazygames') sdk?.game.happytime();
  } catch {
    // SDK calls must never break the game
  }
}

function crazyGamesAd(type) {
  return new Promise((resolve) => {
    sdk.ad.requestAd(type, {
      adStarted: () => setAdPlaying(true),
      adFinished: () => resolve(true),
      adError: () => resolve(false),
    });
  });
}

// An ad between waves. Resolves when the game can go on, whether or not an ad played.
export async function portalCommercialBreak() {
  if (!sdk || adPlaying || Date.now() - lastAdEndedAt < AD_GAP_MS) return;
  try {
    if (PORTAL_SDK === 'poki') await sdk.commercialBreak(() => setAdPlaying(true));
    else if (PORTAL_SDK === 'crazygames') await crazyGamesAd('midgame');
    else await sdk.showAd();
  } catch {
    // No fill or a blocked ad: carry on without one
  } finally {
    setAdPlaying(false);
  }
}

// A rewarded ad. Resolves true only if the player watched it to the end.
export async function portalRewardedBreak() {
  if (!sdk || adPlaying) return false;
  const wasPlaying = inGameplay;
  portalGameplayStop();
  let earned = false;
  try {
    if (PORTAL_SDK === 'poki') {
      earned = await sdk.rewardedBreak({ size: 'medium', onStart: () => setAdPlaying(true) });
    } else if (PORTAL_SDK === 'crazygames') {
      earned = await crazyGamesAd('rewarded');
    } else {
      gdRewardEarned = false;
      await sdk.showAd('rewarded');
      earned = gdRewardEarned;
    }
  } catch {
    earned = false;
  } finally {
    setAdPlaying(false);
  }
  if (wasPlaying) portalGameplayStart();
  return Boolean(earned);
}
