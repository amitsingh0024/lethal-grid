/**
 * Rewarded ads through Google H5 Games Ads (the Ad Placement API).
 *
 * - live:    AdSense is configured. A reward button shows only once Google says an ad is ready
 *            (`beforeReward`), and the reward is granted only when the ad is watched (`adViewed`).
 * - sandbox: dev builds or `?debug`. A 3-second simulated ad stands in so placements can be tested.
 * - off:     production without AdSense. No reward buttons at all.
 */
import { useEffect, useRef, useState } from 'react';
import { getMonetizationConfig, recordAdEvent, SHOW_DEV_TOOLS, trackEvent } from './analytics';
import { setSfxPaused } from './sfx';

export const REWARDED_AD_MODE = getMonetizationConfig().isLiveAdSense
  ? 'live'
  : SHOW_DEV_TOOLS
  ? 'sandbox'
  : 'off';

// True while an ad covers the game, so timers (archers, auto) hold still
let adPlaying = false;
export const isRewardedAdPlaying = () => adPlaying;

// Wait before asking again after Google had no ad (no fill, frequency cap, timeout)
const RETRY_MS = 45000;

/**
 * Offers one rewarded placement at a time. Pass the placement name while its button should be
 * offered, or null. Returns `ready` (show the button) and `show(onReward)`, which plays the ad
 * and calls onReward only if it was watched to the end.
 */
export function useRewardedAd(placement, { onSandboxShow } = {}) {
  const [readyFor, setReadyFor] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const showFnRef = useRef(null);
  const onRewardRef = useRef(null);

  useEffect(() => {
    setReadyFor(null);
    showFnRef.current = null;
    if (!placement || REWARDED_AD_MODE === 'off') return undefined;
    if (REWARDED_AD_MODE === 'sandbox') {
      setReadyFor(placement);
      return undefined;
    }
    if (typeof window.adBreak !== 'function') return undefined;

    let active = true;
    let retryTimer = null;
    window.adBreak({
      type: 'reward',
      name: placement,
      beforeAd: () => {
        adPlaying = true;
        setSfxPaused(true);
      },
      afterAd: () => {
        adPlaying = false;
        setSfxPaused(false);
      },
      beforeReward: (showAdFn) => {
        if (!active) return;
        showFnRef.current = showAdFn;
        setReadyFor(placement);
      },
      adViewed: () => {
        const grant = onRewardRef.current;
        onRewardRef.current = null;
        recordAdEvent(`Rewarded_${placement}`, true);
        if (grant) grant();
      },
      adDismissed: () => {
        onRewardRef.current = null;
        trackEvent('rewarded_ad_dismissed', { placement });
      },
      adBreakDone: (info) => {
        adPlaying = false;
        setSfxPaused(false);
        const status = info?.breakStatus;
        if (status === 'viewed' || status === 'dismissed') {
          // The offer is used up; a later visit to this placement asks again
          if (active) setReadyFor(null);
          showFnRef.current = null;
          return;
        }
        if (status !== 'notReady' && active) {
          trackEvent('rewarded_ad_unavailable', { placement, status: status || 'unknown' });
        }
        if (active && !showFnRef.current) {
          retryTimer = setTimeout(() => setRetryTick((t) => t + 1), RETRY_MS);
        }
      },
    });
    return () => {
      active = false;
      clearTimeout(retryTimer);
    };
  }, [placement, retryTick]);

  const ready = readyFor !== null && readyFor === placement;

  const show = (onReward) => {
    if (!ready) return;
    if (REWARDED_AD_MODE === 'sandbox') {
      onSandboxShow?.(onReward);
      return;
    }
    const showAdFn = showFnRef.current;
    if (!showAdFn) return;
    onRewardRef.current = onReward;
    showFnRef.current = null;
    setReadyFor(null);
    showAdFn();
  };

  return { ready, show };
}
