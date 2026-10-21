import React from 'react';
import { NODE_TYPES } from '../game/engine';
import { PixelSprite } from './CreatureSprite';

/**
 * BACKPACK HERO / PEGLIN STYLE TOP DUNGEON BATTLE SCENE
 *
 * Gives the game a living, atmospheric medieval world!
 * - Brick dungeon wall with flickering wall torches and stone archways
 * - Sir Aldric (your Knight Hero) on the left platform with speech bubble + lunge animation when attacking!
 * - The Siege Horde Leader & surviving raider count on the right platform!
 */
export function DungeonStageBanner({
  waveNumber = 1,
  remainingEnemies = 5,
  totalEnemies = 9,
  isAttacking = false,
  isCleared = false,
  commanderMessage = '',
  selectedWeaponId = 'rail_beam',
}) {
  return (
    <div className="dungeon-stage-banner">
      {/* FLICKERING DUNGEON WALL TORCHES */}
      <div className="dungeon-torches">
        <div className="wall-torch">
          <span className="torch-flame" />
          <span className="torch-bracket" />
        </div>
        <div className="dungeon-arch-title">
          <span>WAVE {waveNumber} • CASTLE COURTYARD</span>
        </div>
        <div className="wall-torch">
          <span className="torch-flame" />
          <span className="torch-bracket" />
        </div>
      </div>

      {/* HERO VS HORDE STAGE */}
      <div className="dungeon-actors-row">
        {/* LEFT: PLAYER KNIGHT + EQUIPPED WEAPON */}
        <div className={`hero-stage-side ${isAttacking ? 'hero-lunging' : ''}`}>
          <div className="hero-character-box">
            <PixelSprite frame0="HERO_IDLE_0" frame1="HERO_IDLE_1" size={64} />
            <div className="hero-equipped-weapon">
              <PixelSprite
                frame0={
                  selectedWeaponId === 'rail_beam'
                    ? 'WEAPON_BALLISTA'
                    : selectedWeaponId === 'nova_bomb'
                    ? 'WEAPON_FLASK'
                    : selectedWeaponId === 'arc_chain'
                    ? 'WEAPON_HAMMER'
                    : 'WEAPON_SWORD'
                }
                size={34}
              />
            </div>
          </div>
          <span className="actor-pedestal-label">SIR ALDRIC</span>
        </div>

        {/* CENTER: COMPACT SPEECH SCROLL / TACTICAL TIP */}
        <div className="stage-speech-scroll">
          <p>{commanderMessage}</p>
        </div>

        {/* RIGHT: ENEMY HORDE LEADER & REMAINING COUNT */}
        <div className={`horde-stage-side ${isCleared ? 'horde-defeated' : ''}`}>
          <div className="horde-character-box">
            {isCleared ? (
              <span className="victory-flag-icon">🏳️</span>
            ) : waveNumber % 5 === 0 ? (
              <PixelSprite frame0="BOSS_0" frame1="BOSS_1" size={64} />
            ) : (
              <PixelSprite frame0="GOBLIN_0" frame1="GOBLIN_1" size={60} />
            )}
          </div>
          <span className="actor-pedestal-label horde-label">
            {isCleared ? 'ROUTED!' : `${remainingEnemies}/${totalEnemies} RAIDERS`}
          </span>
        </div>
      </div>

      {/* COBBLESTONE FLOOR LEDGE */}
      <div className="dungeon-floor-ledge" />
    </div>
  );
}
