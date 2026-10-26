import React, { useEffect, useState } from 'react';
import { Play, Sparkles, Tv } from './PixelIcons';
import { recordAdEvent } from '../services/analytics';

// Sandbox stand-in for a rewarded ad: a 3-second card that grants the reward when claimed.
// Live rewarded ads go through services/rewardedAds.js instead.
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
