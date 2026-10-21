import React from 'react';
import { NODE_TYPES } from '../game/engine';

/**
 * Handcrafted Medieval Fantasy Units & Sir Aldric the Siege Master
 *
 * Every unit has custom layered SVG illustration with idle breathing, weapon bobbing,
 * and panic shake when targeted by your siege weapons:
 * 1. STANDARD  -> "Goblin Footpad" (Pointy ears, iron Kettle helm, wooden buckler shield & dagger)
 * 2. BOMB      -> "Powder-Keg Sapper" (Crazy goblin hugging a banded oak Black-Powder Barrel with a burning fuse!)
 * 3. CONDUIT   -> "Storm-Rune Shaman" (Hooded battle-mage holding a crackling golden Runestone staff)
 * 4. AMPLIFIER -> "Royal War-Horn Herald" (Golden banner-bearer whose horn rally boosts your turn damage by +50%!)
 * 5. BOSS      -> "Ironclad Siege Ogre" (Massive horned iron-armored warlord with glowing crimson eyes)
 */
export function CreatureSprite({ type, conduitAxis = 'ROW', isTargeted = false, isLowHp = false }) {
  const pulseClass = isTargeted ? 'creature-panicked' : 'creature-idle';
  const lowHpClass = isLowHp ? 'creature-wounded' : '';

  if (type === NODE_TYPES.BOMB) {
    // POWDER-KEG SAPPER (Explodes in a 3x3 fireball when slain!)
    return (
      <div
        className={`creature-wrap ${pulseClass} ${lowHpClass}`}
        title="Powder-Keg Sapper: Black-powder barrel explodes in a 3x3 area when slain!"
      >
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Warm torchlight glow behind barrel */}
          <circle cx="32" cy="36" r="22" className="bomb-aura" />

          {/* Goblin Ears peeking from behind barrel */}
          <path d="M14 22 L4 16 L12 28 Z" fill="#65a30d" stroke="#365314" strokeWidth="1.8" />
          <path d="M50 22 L60 16 L52 28 Z" fill="#65a30d" stroke="#365314" strokeWidth="1.8" />

          {/* Wooden Black-Powder Keg */}
          <rect
            x="16"
            y="20"
            width="32"
            height="34"
            rx="10"
            fill="#78350f"
            stroke="#451a03"
            strokeWidth="2.5"
          />
          {/* Wood stave lines */}
          <line x1="25" y1="21" x2="25" y2="53" stroke="#451a03" strokeWidth="1.8" />
          <line x1="39" y1="21" x2="39" y2="53" stroke="#451a03" strokeWidth="1.8" />

          {/* Hammered Iron Barrel Bands */}
          <rect x="15" y="26" width="34" height="4.5" rx="2" fill="#57534e" stroke="#1c1917" strokeWidth="1.2" />
          <rect x="15" y="42" width="34" height="4.5" rx="2" fill="#57534e" stroke="#1c1917" strokeWidth="1.2" />

          {/* Glowing Skull / Powder Warning Sign on Barrel */}
          <circle cx="32" cy="36" r="6" fill="#ea580c" className="bomb-belly-pulse" />
          <path d="M29 35 L35 35 M32 32 L32 39" stroke="#fef08a" strokeWidth="2.2" strokeLinecap="round" />

          {/* Burning Rope Fuse & Dancing Spark */}
          <path d="M32 20 Q37 10 45 11" stroke="#d6d3d1" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="46" cy="11" r="5" fill="#f97316" className="fuse-spark" />
          <circle cx="46" cy="11" r="2.5" fill="#fef08a" className="fuse-spark" />
        </svg>
      </div>
    );
  }

  if (type === NODE_TYPES.CONDUIT) {
    // STORM-RUNE SHAMAN (Unleashes a row/col lightning bolt on death!)
    return (
      <div
        className={`creature-wrap ${pulseClass} ${lowHpClass}`}
        title={`Storm-Rune Shaman: Unleashes a ${conduitAxis} lightning bolt on death!`}
      >
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Directional Rune Arrows */}
          {conduitAxis === 'ROW' ? (
            <g className="conduit-arrows">
              <path d="M2 34 L11 28 L11 40 Z" fill="#facc15" />
              <path d="M62 34 L53 28 L53 40 Z" fill="#facc15" />
              <line x1="8" y1="34" x2="56" y2="34" stroke="#eab308" strokeWidth="2" strokeDasharray="3 3" />
            </g>
          ) : (
            <g className="conduit-arrows">
              <path d="M32 2 L26 11 L38 11 Z" fill="#facc15" />
              <path d="M32 62 L26 53 L38 53 Z" fill="#facc15" />
              <line x1="32" y1="8" x2="32" y2="56" stroke="#eab308" strokeWidth="2" strokeDasharray="3 3" />
            </g>
          )}

          {/* Mage Hood & Cloak */}
          <path
            d="M32 12 L48 28 L45 52 L19 52 L16 28 Z"
            fill="#1e3a8a"
            stroke="#fbbf24"
            strokeWidth="2.2"
          />
          {/* Shadowed Face inside Hood */}
          <ellipse cx="32" cy="29" rx="10" ry="8" fill="#0f172a" />
          {/* Glowing Runic Eyes */}
          <circle cx="28" cy="29" r="2.6" fill="#fde047" />
          <circle cx="36" cy="29" r="2.6" fill="#fde047" />
          {/* Crackling Lightning Rune on Chest */}
          <path d="M34 36 L28 43 L33 43 L30 50" stroke="#fde047" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (type === NODE_TYPES.AMPLIFIER) {
    // WAR-BANNER HERALD (+50% Rally Damage for the rest of the turn when slain!)
    return (
      <div
        className={`creature-wrap ${pulseClass} ${lowHpClass}`}
        title="War-Banner Herald: Slaying this unit rallies your siege weapons for +50% Turn Damage!"
      >
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Golden Rally Aura */}
          <g className="crystal-orbit">
            <circle cx="32" cy="32" r="24" fill="none" stroke="#34d399" strokeWidth="1.8" strokeDasharray="6 6" />
          </g>
          {/* Wooden Banner Pole */}
          <line x1="20" y1="10" x2="20" y2="56" stroke="#a16207" strokeWidth="4" strokeLinecap="round" />
          {/* Emerald & Gold Medieval Pennant Flag */}
          <path
            d="M22 14 L52 18 L44 28 L52 38 L22 42 Z"
            fill="#15803d"
            stroke="#fde047"
            strokeWidth="2.2"
          />
          {/* Lion / Sword Crest on Banner */}
          <path d="M33 21 L33 35 M28 26 L38 26" stroke="#fef08a" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (type === NODE_TYPES.BOSS) {
    // IRONCLAD SIEGE OGRE (Boss Unit)
    return (
      <div
        className={`creature-wrap ${pulseClass} ${lowHpClass}`}
        title="Ironclad Siege Ogre: Huge Gold Bounty + 5x5 Shockwave when slain!"
      >
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Giant Curved Iron Horns */}
          <path d="M16 24 L4 10 L22 18 Z" fill="#d6d3d1" stroke="#44403c" strokeWidth="2" />
          <path d="M48 24 L60 10 L42 18 Z" fill="#d6d3d1" stroke="#44403c" strokeWidth="2" />
          {/* Heavy Riveted Iron Great-Helm */}
          <rect
            x="14"
            y="16"
            width="36"
            height="36"
            rx="8"
            fill="#44403c"
            stroke="#f59e0b"
            strokeWidth="2.8"
          />
          {/* Gold Warlord Crown */}
          <polygon points="22,16 27,8 32,14 37,8 42,16" fill="#facc15" stroke="#78350f" strokeWidth="1.2" />
          {/* Glowing Fiery Visor Slits */}
          <polygon points="19,29 30,33 20,35" fill="#ef4444" />
          <polygon points="45,29 34,33 44,35" fill="#ef4444" />
          {/* Iron Faceplate Grille */}
          <line x1="23" y1="42" x2="23" y2="49" stroke="#1c1917" strokeWidth="3" />
          <line x1="32" y1="41" x2="32" y2="49" stroke="#1c1917" strokeWidth="3" />
          <line x1="41" y1="42" x2="41" y2="49" stroke="#1c1917" strokeWidth="3" />
        </svg>
      </div>
    );
  }

  // DEFAULT: GOBLIN FOOTPAD (Standard Raider with Kettle Helm & Wooden Shield)
  return (
    <div className={`creature-wrap ${pulseClass} ${lowHpClass}`} title="Goblin Footpad">
      <svg viewBox="0 0 64 64" className="creature-svg">
        {/* Pointy Goblin Ears */}
        <path d="M16 32 L5 26 L15 39 Z" fill="#65a30d" stroke="#365314" strokeWidth="1.8" />
        <path d="M48 32 L59 26 L49 39 Z" fill="#65a30d" stroke="#365314" strokeWidth="1.8" />

        {/* Goblin Head */}
        <circle cx="32" cy="36" r="15" fill="#65a30d" stroke="#365314" strokeWidth="2.2" />

        {/* Iron Kettle Helmet */}
        <path
          d="M14 29 C14 13, 50 13, 50 29 L54 31 L10 31 Z"
          fill="#78716c"
          stroke="#292524"
          strokeWidth="2.2"
        />
        <circle cx="32" cy="15" r="2.5" fill="#a8a29e" />

        {/* Yellow Sneaky Eyes */}
        <circle cx="26" cy="36" r="3" fill="#fef08a" />
        <circle cx="26" cy="36" r="1.3" fill="#1c1917" />
        <circle cx="38" cy="36" r="3" fill="#fef08a" />
        <circle cx="38" cy="36" r="1.3" fill="#1c1917" />

        {/* Little Fang Grin */}
        <path d="M26 44 Q32 47 38 44" stroke="#1c1917" strokeWidth="2" fill="none" />
        <polygon points="28,44 30,41 32,45" fill="#fafaf9" />
      </svg>
    </div>
  );
}

/**
 * SIR ALDRIC — Grizzled Medieval Siege Master & Tutorial Mentor
 */
export function CommanderAvatar({ mood = 'happy' }) {
  return (
    <div className={`commander-avatar mood-${mood}`} title="Sir Aldric, Siege Master">
      <svg viewBox="0 0 64 64" className="commander-svg">
        {/* Crimson Cloak & Gold Pauldrons */}
        <circle cx="32" cy="32" r="29" fill="#451a03" stroke="#d97706" strokeWidth="3" />
        <path d="M12 54 C14 42, 50 42, 52 54" fill="#991b1b" stroke="#fbbf24" strokeWidth="2" />

        {/* Knight Steel Helm Top */}
        <path d="M16 26 C16 10, 48 10, 48 26 Z" fill="#a8a29e" stroke="#292524" strokeWidth="2.2" />
        {/* Plume Feather */}
        <path d="M32 12 Q42 4 48 11 Q39 14 32 12 Z" fill="#dc2626" />

        {/* Warm Face & Bushy White Beard */}
        <rect x="19" y="24" width="26" height="18" rx="6" fill="#fed7aa" />
        <path
          d="M17 34 C17 52, 47 52, 47 34 L41 34 Q32 39 23 34 Z"
          fill="#e7e5e4"
          stroke="#78716c"
          strokeWidth="1.5"
        />

        {/* Eyes & Eyebrows */}
        <line x1="22" y1="27" x2="29" y2="28" stroke="#57534e" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="42" y1="27" x2="35" y2="28" stroke="#57534e" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="26" cy="31" r="2.2" fill="#1c1917" />
        <circle cx="38" cy="31" r="2.2" fill="#1c1917" />
      </svg>
    </div>
  );
}
