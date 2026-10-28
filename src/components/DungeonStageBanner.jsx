import React from 'react';
import { PixelSprite, WeaponPixelIcon } from './CreatureSprite';
import { Flag } from './PixelIcons';

// The scene above the board: Sir Aldric with the selected weapon on the left, the commander's
// line in the middle, and the wave's leader with the raiders left on the right.
export function DungeonStageBanner({
  waveNumber = 1,
  stageTitle = '',
  remainingEnemies = 5,
  totalEnemies = 9,
  isAttacking = false,
  isCleared = false,
  commanderMessage = '',
  selectedWeaponId = 'rail_beam',
  bossKind = null,
}) {
  return (
    <div className="dungeon-stage-banner">
      <div className="dungeon-torches">
        <div className="wall-torch">
          <span className="torch-flame" />
          <span className="torch-bracket" />
        </div>
        <div className="dungeon-arch-title">
          <span>{stageTitle || `Wave ${waveNumber}`}</span>
        </div>
        <div className="wall-torch">
          <span className="torch-flame" />
          <span className="torch-bracket" />
        </div>
      </div>

      <div className="dungeon-actors-row">
        <div className={`hero-stage-side ${isAttacking ? 'hero-lunging' : ''}`}>
          <div className="hero-character-box">
            <PixelSprite frame0="HERO_IDLE_0" frame1="HERO_IDLE_1" size={64} />
            <div className="hero-equipped-weapon">
              <WeaponPixelIcon id={selectedWeaponId} size={34} />
            </div>
          </div>
          <span className="actor-pedestal-label">SIR ALDRIC</span>
        </div>

        <div className="stage-speech-scroll">
          <p>{commanderMessage}</p>
        </div>

        <div className={`horde-stage-side ${isCleared ? 'horde-defeated' : ''}`}>
          <div className="horde-character-box">
            {isCleared ? (
              <Flag size={48} className="victory-flag-icon" />
            ) : waveNumber % 5 === 0 ? (
              <PixelSprite
                frame0={bossKind && bossKind !== 'OGRE' ? `BOSS_${bossKind}_0` : 'BOSS_0'}
                frame1={bossKind && bossKind !== 'OGRE' ? `BOSS_${bossKind}_1` : 'BOSS_1'}
                size={64}
              />
            ) : (
              <PixelSprite frame0="GOBLIN_0" frame1="GOBLIN_1" size={60} />
            )}
          </div>
          <span className="actor-pedestal-label horde-label">
            {isCleared ? 'Cleared' : `${remainingEnemies}/${totalEnemies} left`}
          </span>
        </div>
      </div>

      <div className="dungeon-floor-ledge" />
    </div>
  );
}
