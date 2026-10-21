import React from 'react';
import { NODE_TYPES } from '../game/engine';

/**
 * Animated SVG Cyber-Creatures & Bosses
 * Gives every grid cell a distinct, breathing, animated monster character:
 * 1. STANDARD -> "Cyber-Mite" (hovering mechanical beetle with blinking visor & wiggling legs)
 * 2. BOMB     -> "Pyro-Tick" (volatile magma bug with a pulsing, sparking plasma belly)
 * 3. CONDUIT  -> "Volt-Wisp" (crackling electric jellyfish with directional lightning tendrils)
 * 4. AMPLIFIER-> "Crystal-Sprite" (levitating emerald prism creature with rotating orbital shards)
 * 5. BOSS     -> "Apex Dreadnought" (horned cyber-mech titan with glowing core & menacing eyes)
 */
export function CreatureSprite({ type, conduitAxis = 'ROW', isTargeted = false, isLowHp = false }) {
  const pulseClass = isTargeted ? 'creature-panicked' : 'creature-idle';
  const lowHpClass = isLowHp ? 'creature-wounded' : '';

  if (type === NODE_TYPES.BOMB) {
    // PYRO-TICK (Volatile Bomb Creature — explodes in 3x3 on death!)
    return (
      <div className={`creature-wrap ${pulseClass} ${lowHpClass}`} title="Pyro-Tick: Explodes 3x3 on death!">
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Glowing magma aura */}
          <circle cx="32" cy="34" r="22" className="bomb-aura" />
          {/* Little legs */}
          <path d="M12 32 L4 26 M12 38 L4 42 M52 32 L60 26 M52 38 L60 42" stroke="#fb7185" strokeWidth="3.5" strokeLinecap="round" />
          {/* Bomb Body */}
          <circle cx="32" cy="35" r="18" fill="#be123c" stroke="#fda4af" strokeWidth="2.5" />
          {/* Pulsing Magma Core */}
          <circle cx="32" cy="36" r="10" fill="#fb923c" className="bomb-belly-pulse" />
          {/* Sparking Fuse Horn */}
          <path d="M32 17 Q36 9 43 10" stroke="#fde047" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="44" cy="10" r="4.5" fill="#fef08a" className="fuse-spark" />
          {/* Angry Glowing Eyes */}
          <polygon points="22,29 29,32 23,34" fill="#fef08a" />
          <polygon points="42,29 35,32 41,34" fill="#fef08a" />
        </svg>
      </div>
    );
  }

  if (type === NODE_TYPES.CONDUIT) {
    // VOLT-WISP (Electric Jellyfish — shoots a lightning laser along its Row or Col on death!)
    return (
      <div
        className={`creature-wrap ${pulseClass} ${lowHpClass}`}
        title={`Volt-Wisp: Shoots ${conduitAxis} lightning on death!`}
      >
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Directional Laser Indicator Arrows */}
          {conduitAxis === 'ROW' ? (
            <g className="conduit-arrows">
              <path d="M3 32 L11 26 L11 38 Z" fill="#fde047" />
              <path d="M61 32 L53 26 L53 38 Z" fill="#fde047" />
              <line x1="8" y1="32" x2="56" y2="32" stroke="#facc15" strokeWidth="2" strokeDasharray="3 3" />
            </g>
          ) : (
            <g className="conduit-arrows">
              <path d="M32 3 L26 11 L38 11 Z" fill="#fde047" />
              <path d="M32 61 L26 53 L38 53 Z" fill="#fde047" />
              <line x1="32" y1="8" x2="32" y2="56" stroke="#facc15" strokeWidth="2" strokeDasharray="3 3" />
            </g>
          )}
          {/* Electric Dome Head */}
          <path
            d="M16 34 C16 18, 48 18, 48 34 C48 40, 16 40, 16 34 Z"
            fill="#d97706"
            stroke="#fef08a"
            strokeWidth="2.5"
          />
          {/* Floating Tentacles */}
          <path
            d="M22 39 Q20 48 24 52 M32 40 Q34 49 30 54 M42 39 Q44 48 40 52"
            stroke="#fde047"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            className="wisp-tentacles"
          />
          {/* Bright Visor Eyes */}
          <circle cx="26" cy="30" r="3.2" fill="#fff" />
          <circle cx="38" cy="30" r="3.2" fill="#fff" />
        </svg>
      </div>
    );
  }

  if (type === NODE_TYPES.AMPLIFIER) {
    // CRYSTAL-SPRITE (Buffs your damage by +50% when shattered!)
    return (
      <div className={`creature-wrap ${pulseClass} ${lowHpClass}`} title="Crystal-Sprite: +50% Damage Boost on death!">
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Rotating Orbiting Shards */}
          <g className="crystal-orbit">
            <polygon points="32,4 36,12 28,12" fill="#6ee7b7" />
            <polygon points="32,60 36,52 28,52" fill="#6ee7b7" />
            <polygon points="4,32 12,28 12,36" fill="#6ee7b7" />
            <polygon points="60,32 52,28 52,36" fill="#6ee7b7" />
          </g>
          {/* Main Diamond Body */}
          <polygon
            points="32,12 49,32 32,52 15,32"
            fill="#059669"
            stroke="#a7f3d0"
            strokeWidth="2.5"
          />
          <polygon points="32,18 42,32 32,46 22,32" fill="#34d399" opacity="0.55" />
          {/* Cute Sprite Eyes */}
          <circle cx="27" cy="31" r="2.8" fill="#ecfdf5" />
          <circle cx="37" cy="31" r="2.8" fill="#ecfdf5" />
        </svg>
      </div>
    );
  }

  if (type === NODE_TYPES.BOSS) {
    // APEX DREADNOUGHT (Mini-Boss Creature)
    return (
      <div className={`creature-wrap ${pulseClass} ${lowHpClass}`} title="Apex Dreadnought Boss!">
        <svg viewBox="0 0 64 64" className="creature-svg">
          {/* Menacing Horns */}
          <path d="M14 24 L6 10 L22 18 Z" fill="#c084fc" />
          <path d="M50 24 L58 10 L42 18 Z" fill="#c084fc" />
          {/* Armored Mech Skull */}
          <rect
            x="14"
            y="18"
            width="36"
            height="32"
            rx="10"
            fill="#5b21b6"
            stroke="#e9d5ff"
            strokeWidth="2.8"
          />
          {/* Crown Emblem */}
          <polygon points="24,18 28,11 32,16 36,11 40,18" fill="#facc15" />
          {/* Glowing Cyber Visor */}
          <polygon points="19,28 30,33 20,36" fill="#f43f5e" />
          <polygon points="45,28 34,33 44,36" fill="#f43f5e" />
          {/* Jaw Grille */}
          <line x1="24" y1="43" x2="40" y2="43" stroke="#ddd6fe" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // DEFAULT: CYBER-MITE (Standard Creature)
  return (
    <div className={`creature-wrap ${pulseClass} ${lowHpClass}`} title="Cyber-Mite">
      <svg viewBox="0 0 64 64" className="creature-svg">
        {/* Mechanical Legs */}
        <path
          d="M15 28 L7 23 M14 38 L6 43 M49 28 L57 23 M50 38 L58 43"
          stroke="#38bdf8"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        {/* Antennae */}
        <path d="M25 18 L20 10 M39 18 L44 10" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="20" cy="10" r="2.5" fill="#38bdf8" />
        <circle cx="44" cy="10" r="2.5" fill="#38bdf8" />
        {/* Rounded Carapace */}
        <rect
          x="15"
          y="18"
          width="34"
          height="30"
          rx="14"
          fill="#0369a1"
          stroke="#7dd3fc"
          strokeWidth="2.5"
        />
        {/* Glowing Eyes */}
        <circle cx="25" cy="31" r="3.5" fill="#e0f2fe" className="creature-eye" />
        <circle cx="39" cy="31" r="3.5" fill="#e0f2fe" className="creature-eye" />
        {/* Little Mouth */}
        <path d="M28 40 Q32 43 36 40" stroke="#bae6fd" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * Commander NOVA — Your friendly tactical AI companion Avatar!
 */
export function CommanderAvatar({ mood = 'happy' }) {
  return (
    <div className={`commander-avatar mood-${mood}`}>
      <svg viewBox="0 0 64 64" className="commander-svg">
        <circle cx="32" cy="32" r="28" fill="#0f172a" stroke="#38bdf8" strokeWidth="3" />
        {/* Headset Ears */}
        <rect x="3" y="24" width="6" height="16" rx="3" fill="#06b6d4" />
        <rect x="55" y="24" width="6" height="16" rx="3" fill="#06b6d4" />
        {/* Robot Helmet */}
        <rect x="14" y="16" width="36" height="32" rx="12" fill="#1e293b" stroke="#7dd3fc" strokeWidth="2" />
        {/* Visor Screen */}
        <rect x="18" y="22" width="28" height="16" rx="6" fill="#090d16" />
        {/* Expressive Eyes */}
        {mood === 'excited' ? (
          <>
            <path d="M22 31 L26 26 L30 31" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M34 31 L38 26 L42 31" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="25" cy="30" r="3.5" fill="#38bdf8" />
            <circle cx="39" cy="30" r="3.5" fill="#38bdf8" />
          </>
        )}
        {/* Smile */}
        <path d="M27 42 Q32 46 37 42" stroke="#38bdf8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
