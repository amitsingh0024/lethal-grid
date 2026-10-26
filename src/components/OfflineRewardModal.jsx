import React from 'react';
import { Castle, GoldCoin, Tv } from './PixelIcons';
import { getStageLabel } from '../game/engine';

function formatAway(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Welcome-back card for the offline garrison. Collecting is free; the ad that doubles it
 * is optional and never shown on its own.
 */
export function OfflineRewardModal({ reward, onCollect, onWatchAd, canWatchAd = true }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="offline-title">
      <div className="modal-card offline-reward-card">
        <div className="bestiary-modal-header">
          <h3 id="offline-title">
            <Castle size={18} className="text-amber" /> Welcome back
          </h3>
          <p>
            You were away {formatAway(reward.minutes)}. Your garrison farmed Stage{' '}
            {getStageLabel(reward.sector)}
            {reward.capped ? ' until its watch ended. Train the garrison to hold longer.' : '.'}
          </p>
        </div>

        <div className="offline-reward-amount">
          <GoldCoin size={24} /> +{reward.gold.toLocaleString()}
        </div>

        <div className="banner-buttons">
          {canWatchAd && (
            <button type="button" className="btn-secondary" onClick={onWatchAd}>
              <Tv size={15} />
              <span>Watch ad: +{(reward.gold * 2).toLocaleString()}</span>
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onCollect}>
            <span>Collect</span>
          </button>
        </div>
      </div>
    </div>
  );
}
