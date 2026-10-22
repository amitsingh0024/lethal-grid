import React from 'react';
import { Crown } from './PixelIcons';
import { CREST_TREE, UNSPENT_CREST_GOLD_BONUS, getCrestsSpent } from '../game/engine';

/**
 * Permanent upgrades bought with Royal Crests. Crests come from resetting (Ascend in the
 * Forge) and every node keeps its level through later resets.
 */
export function CrestTreeModal({ totalCrests, crestUpgrades, onBuy, onClose }) {
  const unspent = Math.max(0, totalCrests - getCrestsSpent(crestUpgrades));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card crest-tree-card" onClick={(e) => e.stopPropagation()}>
        <div className="bestiary-modal-header">
          <h3>
            <Crown size={18} className="text-amber" /> Royal Crests
          </h3>
          <p>
            {unspent} of {totalCrests} to spend. Upgrades here last forever. Each unspent crest
            adds +{Math.round(UNSPENT_CREST_GOLD_BONUS * 100)}% Gold.
          </p>
        </div>

        <div className="crest-tree-list">
          {CREST_TREE.map((node) => {
            const lvl = crestUpgrades[node.id] || 0;
            const cost = node.costs[lvl];
            const isMax = cost === undefined;
            return (
              <div key={node.id} className="crest-node">
                <div className="crest-node-text">
                  <strong>
                    {node.name} · Lv {lvl}/{node.costs.length}
                  </strong>
                  <span>
                    {isMax ? node.getEffectText(lvl) : `Next: ${node.getEffectText(lvl + 1)}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={isMax || unspent < cost}
                  onClick={() => onBuy(node.id)}
                >
                  {isMax ? 'Max' : `${cost} ${cost === 1 ? 'Crest' : 'Crests'}`}
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
