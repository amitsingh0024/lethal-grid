import React from 'react';
import { Castle, Crown, Lock, Star } from './PixelIcons';
import {
  STAGES_PER_CHAPTER,
  CHAPTER_CHEST_STARS,
  getStageLabel,
  getChapterStars,
} from '../game/engine';

/**
 * Chapter map of campaign stages. Cleared stages can be replayed to farm Gold,
 * the frontier stage is the next push, and later stages stay locked.
 */
export function StageMapModal({ frontierSector, stageStars, chestsClaimed, onPlayStage, onClose }) {
  const chapterCount = Math.ceil(frontierSector / STAGES_PER_CHAPTER);
  const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card stage-map-card" onClick={(e) => e.stopPropagation()}>
        <div className="bestiary-modal-header">
          <h3>
            <Castle size={18} className="text-amber" /> Stage Map
          </h3>
          <p>
            Replay a cleared stage to farm Gold. Every run pays, and harder stages pay more. A
            first clear pays triple. Stars open chapter chests at {CHAPTER_CHEST_STARS.join(' and ')}{' '}
            stars, and a 3-star stage can be set to auto.
          </p>
        </div>

        <div className="stage-map-chapters">
          {chapters.map((chapter) => (
            <div key={chapter} className="stage-map-chapter">
              <span className="stage-map-chapter-label">
                Chapter {chapter}
                <span className="stage-map-chapter-stars">
                  <Star size={12} /> {getChapterStars(stageStars, chapter)}/15
                  {(chestsClaimed[chapter] || 0) < CHAPTER_CHEST_STARS.length &&
                    ` · next chest at ${CHAPTER_CHEST_STARS[chestsClaimed[chapter] || 0]}`}
                </span>
              </span>
              <div className="stage-map-row">
                {Array.from({ length: STAGES_PER_CHAPTER }, (_, i) => {
                  const sector = (chapter - 1) * STAGES_PER_CHAPTER + i + 1;
                  const isCleared = sector < frontierSector;
                  const isFrontier = sector === frontierSector;
                  const isBoss = sector % STAGES_PER_CHAPTER === 0;
                  const state = isCleared ? 'cleared' : isFrontier ? 'frontier' : 'locked';
                  return (
                    <button
                      key={sector}
                      type="button"
                      className={`stage-map-node ${state}`}
                      disabled={!isCleared && !isFrontier}
                      onClick={() => onPlayStage(sector)}
                      aria-label={`Stage ${getStageLabel(sector)}${isBoss ? ', boss' : ''}, ${
                        isCleared ? `${stageStars[sector] || 0} of 3 stars, replay` : isFrontier ? 'next push' : 'locked'
                      }`}
                    >
                      <span className="stage-map-node-label">
                        {isBoss && <Crown size={12} />}
                        {getStageLabel(sector)}
                      </span>
                      <span className="stage-map-node-tag">
                        {isCleared ? (
                          <span className="star-row" aria-hidden="true">
                            {[1, 2, 3].map((n) => (
                              <Star
                                key={n}
                                size={12}
                                className={n <= (stageStars[sector] || 0) ? 'star-lit' : 'star-dim'}
                              />
                            ))}
                          </span>
                        ) : isFrontier ? (
                          'Next'
                        ) : (
                          <Lock size={12} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
