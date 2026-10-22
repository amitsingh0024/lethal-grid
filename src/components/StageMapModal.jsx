import React from 'react';
import { Castle, Crown, Lock } from './PixelIcons';
import { STAGES_PER_CHAPTER, getStageLabel } from '../game/engine';

/**
 * Chapter map of campaign stages. Cleared stages can be replayed to farm Gold,
 * the frontier stage is the next push, and later stages stay locked.
 */
export function StageMapModal({ frontierSector, onPlayStage, onClose }) {
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
            first clear pays triple.
          </p>
        </div>

        <div className="stage-map-chapters">
          {chapters.map((chapter) => (
            <div key={chapter} className="stage-map-chapter">
              <span className="stage-map-chapter-label">Chapter {chapter}</span>
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
                        isCleared ? 'cleared, replay' : isFrontier ? 'next push' : 'locked'
                      }`}
                    >
                      <span className="stage-map-node-label">
                        {isBoss && <Crown size={12} />}
                        {getStageLabel(sector)}
                      </span>
                      <span className="stage-map-node-tag">
                        {isCleared ? 'Replay' : isFrontier ? 'Next' : <Lock size={12} />}
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
