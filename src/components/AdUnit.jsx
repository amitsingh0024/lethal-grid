import React, { useEffect, useState } from 'react';
import { Play, Sparkles, DollarSign, ShieldCheck, Tv } from './PixelIcons';
import { getMonetizationConfig, recordAdEvent } from '../services/analytics';

/**
 * Responsive Google AdSense Banner Component
 * - Maintains strict layout separation and fixed aspect ratios to prevent Cumulative Layout Shift (CLS)
 * - Automatically serves real Google AdSense units when `VITE_ADSENSE_CLIENT_ID` is configured
 * - Displays an interactive AdSense Preview Sandbox when running locally so you can verify placements
 */
export function AdBannerSlot({ slotId = '1111111111', label = 'Top Leaderboard Ad Slot', format = 'horizontal' }) {
  const config = getMonetizationConfig();

  useEffect(() => {
    recordAdEvent(label, false);
    if (config.isLiveAdSense && typeof window !== 'undefined') {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // Ignore duplicate push errors in dev strict mode
      }
    }
  }, [config.isLiveAdSense, label]);

  return (
    <aside className={`ad-slot-wrapper ad-format-${format}`} aria-label="Advertisement">
      <div className="ad-slot-badge">
        <span>ADVERTISEMENT • GOOGLE ADSENSE READY</span>
        <span className="ad-slot-status">
          {config.isLiveAdSense ? 'LIVE ADSENSE' : 'SANDBOX PREVIEW ($2.00 eCPM)'}
        </span>
      </div>

      {config.isLiveAdSense ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height: '100%' }}
          data-ad-client={config.adsenseClientId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <div className="ad-sandbox-placeholder">
          <div className="ad-sandbox-left">
            <DollarSign size={16} className="text-emerald" />
            <div>
              <strong>{label}</strong>
              <p>
                Safe 150px margin from game buttons • Paste your <code>ca-pub-XXXX</code> in{' '}
                <code>.env</code> to activate live ads.
              </p>
            </div>
          </div>
          <span className="ad-sandbox-pill">Est. +$0.002 / view</span>
        </div>
      )}
    </aside>
  );
}

/**
 * High-eCPM Rewarded Video Ad Modal Simulator / Trigger
 * Gives the player an immediate in-game reward (2x Overclock Shards or +1 Extra Charge)
 * after watching a short 3-second simulated ad (or real Google H5 Games Placement API ad).
 */
export function RewardedAdModal({ isOpen, onClose, rewardTitle, onRewardClaimed }) {
  const [secondsLeft, setSecondsLeft] = useState(3);

  useEffect(() => {
    if (!isOpen) {
      setSecondsLeft(3);
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClaim = () => {
    recordAdEvent(`Rewarded_Video_${rewardTitle}`, true);
    onRewardClaimed();
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reward-ad-title">
      <div className="modal-card rewarded-ad-card">
        <div className="rewarded-ad-header">
          <span className="badge-amber">
            <Tv size={12} /> Optional reward
          </span>
          <span className="rewarded-timer">
            {secondsLeft > 0 ? `Ready in ${secondsLeft}s` : 'Ready'}
          </span>
        </div>

        <div className="rewarded-video-stage">
          <div className="pulse-ring" />
          <Sparkles size={42} className="text-cyan" />
          <h3 id="reward-ad-title">{rewardTitle}</h3>
          <p className="rewarded-subtext">
            Watch a short ad to claim this reward. Ads are always optional, and you can cancel at any time.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary btn-claim"
            disabled={secondsLeft > 0}
            onClick={handleClaim}
          >
            <Play size={16} />
            {secondsLeft > 0 ? `Watching ad (${secondsLeft}s)` : 'Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}
