import React, { useEffect, useRef } from 'react';

/**
 * 60FPS HTML5 Canvas Medieval Weapon & Chain-Reaction VFX Engine
 *
 * Renders tangible, physical weapon animations whenever the player uses an item:
 * 1. `rail_beam` (Heavy Ballista Volley):
 *    Launches giant iron-tipped wooden bolts from the edges of the courtyard across the target Row & Column,
 *    leaving wind-streaks, wood splinters, and impact sparks.
 * 2. `nova_bomb` (Alchemist Wildfire Flask):
 *    Throws a spinning emerald/amber glass potion in a high parabolic arc from the bottom weapon dock
 *    onto the target stone tile, shattering into roaring wildfire embers & smoke!
 * 3. `arc_chain` (Dwarven Thunder-Hammer):
 *    Hurls a spinning runic warhammer that physically leaps from the primary target to each ricochet target,
 *    crackling with golden storm lightning.
 * 4. `overclock_pulse` (Executioner's Greatsword):
 *    Carves two sweeping, gleaming steel sword arcs in an X-pattern across the diagonals with iron sparks.
 * 5. Chain Explosions (Powder-Keg Barrel Blast & Storm-Rune Bolts):
 *    Spawns expanding shockwaves, flying wooden barrel staves, fireballs, and runic lightning bolts!
 */
export function BattleVFXCanvas({ vfxQueue, gridSize }) {
  const canvasRef = useRef(null);
  const activeAnimsRef = useRef([]);
  const particlesRef = useRef([]);
  const processedIdsRef = useRef(new Set());

  // Enqueue new weapon & chain-reaction animations
  useEffect(() => {
    if (!vfxQueue || vfxQueue.length === 0) return;

    vfxQueue.forEach((item) => {
      if (processedIdsRef.current.has(item.id)) return;
      processedIdsRef.current.add(item.id);
      activeAnimsRef.current.push({
        ...item,
        startTime: performance.now() + (item.delayMs || 0),
      });
    });
  }, [vfxQueue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let rafId;

    const spawnBurstParticles = (x, y, colorPalette, count = 24, speedScale = 1) => {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = (1.5 + Math.random() * 4.5) * speedScale;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.8,
          gravity: 0.12,
          size: 3 + Math.random() * 5,
          color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
          alpha: 1,
          decay: 0.02 + Math.random() * 0.02,
          shape: Math.random() > 0.4 ? 'circle' : 'splinter',
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.25,
        });
      }
    };

    const getCellCenter = (row, col, width, height) => {
      const pad = 12;
      const usableW = width - pad * 2;
      const usableH = height - pad * 2;
      const cellW = usableW / gridSize;
      const cellH = usableH / gridSize;
      return {
        x: pad + (col + 0.5) * cellW,
        y: pad + (row + 0.5) * cellH,
        cellW,
        cellH,
      };
    };

    const renderLoop = (now) => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // 1. Render Active Weapon Trajectories & Chain Bursts
      const remainingAnims = [];
      for (const anim of activeAnimsRef.current) {
        if (now < anim.startTime) {
          remainingAnims.push(anim);
          continue;
        }

        const elapsed = now - anim.startTime;
        const duration = anim.duration || 480;
        const progress = Math.min(1, elapsed / duration);

        const targetPos = getCellCenter(anim.row, anim.col, width, height);

        // Trigger impact particles when trajectory finishes (or immediately for explosions)
        if (!anim.hasSpawnedImpact && progress >= (anim.impactAt || 0.55)) {
          anim.hasSpawnedImpact = true;
          if (anim.type === 'nova_bomb' || anim.type === 'BARREL_EXPLOSION') {
            spawnBurstParticles(
              targetPos.x,
              targetPos.y,
              ['#f97316', '#facc15', '#ef4444', '#fde047', '#78350f'],
              34,
              1.35
            );
          } else if (anim.type === 'rail_beam') {
            spawnBurstParticles(
              targetPos.x,
              targetPos.y,
              ['#fbbf24', '#d97706', '#e2e8f0', '#a16207'],
              22,
              1.1
            );
          } else if (anim.type === 'arc_chain' || anim.type === 'RUNE_LIGHTNING') {
            spawnBurstParticles(
              targetPos.x,
              targetPos.y,
              ['#fde047', '#38bdf8', '#ffffff', '#f59e0b'],
              24,
              1.2
            );
          } else if (anim.type === 'overclock_pulse') {
            spawnBurstParticles(
              targetPos.x,
              targetPos.y,
              ['#f43f5e', '#e2e8f0', '#fb7185', '#fef08a'],
              26,
              1.2
            );
          }
        }

        // --- DRAW WEAPON 1: HEAVY BALLISTA VOLLEY (Row & Col Piercing Bolts) ---
        if (anim.type === 'rail_beam') {
          ctx.save();
          const boltX = progress * width * 1.15;
          const boltY = progress * height * 1.15;

          // Golden wind streak along Row & Column
          ctx.strokeStyle = `rgba(251, 191, 36, ${(1 - progress) * 0.85})`;
          ctx.lineWidth = 10 * (1 - progress * 0.5);
          ctx.beginPath();
          ctx.moveTo(0, targetPos.y);
          ctx.lineTo(boltX, targetPos.y);
          ctx.moveTo(targetPos.x, 0);
          ctx.lineTo(targetPos.x, boltY);
          ctx.stroke();

          // Draw Horizontal Ballista Bolt Head
          ctx.fillStyle = '#fde68a';
          ctx.beginPath();
          ctx.moveTo(boltX + 14, targetPos.y);
          ctx.lineTo(boltX - 12, targetPos.y - 7);
          ctx.lineTo(boltX - 12, targetPos.y + 7);
          ctx.closePath();
          ctx.fill();

          // Draw Vertical Ballista Bolt Head
          ctx.beginPath();
          ctx.moveTo(targetPos.x, boltY + 14);
          ctx.lineTo(targetPos.x - 7, boltY - 12);
          ctx.lineTo(targetPos.x + 7, boltY - 12);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // --- DRAW WEAPON 2: ALCHEMIST WILDFIRE FLASK (Arcing Bottle Throw -> Firestorm) ---
        else if (anim.type === 'nova_bomb') {
          ctx.save();
          if (progress < 0.55) {
            // Parabolic throw from bottom center to target tile
            const t = progress / 0.55;
            const startX = width * 0.38;
            const startY = height + 10;
            const curX = startX + (targetPos.x - startX) * t;
            const arcLift = Math.sin(t * Math.PI) * 130;
            const curY = startY + (targetPos.y - startY) * t - arcLift;

            ctx.translate(curX, curY);
            ctx.rotate(t * Math.PI * 4);

            // Draw glowing Alchemist Glass Flask
            ctx.fillStyle = '#f97316';
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 4, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Flask neck & cork
            ctx.fillStyle = '#fde68a';
            ctx.fillRect(-4, -12, 8, 9);
          } else {
            // Expanding 3x3 Wildfire Ring
            const t = (progress - 0.55) / 0.45;
            const maxRadius = targetPos.cellW * 1.45;
            const r = maxRadius * t;
            const grad = ctx.createRadialGradient(
              targetPos.x,
              targetPos.y,
              r * 0.1,
              targetPos.x,
              targetPos.y,
              r
            );
            grad.addColorStop(0, `rgba(254, 240, 138, ${1 - t})`);
            grad.addColorStop(0.5, `rgba(249, 115, 22, ${(1 - t) * 0.85})`);
            grad.addColorStop(1, 'rgba(185, 28, 28, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(targetPos.x, targetPos.y, r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // --- DRAW WEAPON 3: DWARVEN THUNDER-HAMMER (Ricochet Hammer + Lightning Arcs) ---
        else if (anim.type === 'arc_chain') {
          ctx.save();
          const t = Math.sin(progress * Math.PI);
          ctx.strokeStyle = `rgba(250, 204, 21, ${1 - progress * 0.7})`;
          ctx.lineWidth = 4;

          // Draw jagged lightning bolt from top sky & between ricochet targets
          const drawJaggedBolt = (x1, y1, x2, y2) => {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            const steps = 6;
            for (let i = 1; i < steps; i++) {
              const px = x1 + ((x2 - x1) * i) / steps + (Math.random() - 0.5) * 18;
              const py = y1 + ((y2 - y1) * i) / steps + (Math.random() - 0.5) * 18;
              ctx.lineTo(px, py);
            }
            ctx.lineTo(x2, y2);
            ctx.stroke();
          };

          drawJaggedBolt(targetPos.x, 0, targetPos.x, targetPos.y);
          if (anim.bounceTargets && anim.bounceTargets.length > 0) {
            let prev = targetPos;
            anim.bounceTargets.forEach((b) => {
              const nextPos = getCellCenter(b.row, b.col, width, height);
              drawJaggedBolt(prev.x, prev.y, nextPos.x, nextPos.y);
              prev = nextPos;
            });
          }

          // Spinning Dwarven Warhammer Icon at target
          ctx.translate(targetPos.x, targetPos.y);
          ctx.rotate(progress * Math.PI * 3);
          ctx.scale(0.8 + t * 0.5, 0.8 + t * 0.5);
          ctx.fillStyle = '#92400e';
          ctx.fillRect(-3, -6, 6, 26);
          ctx.fillStyle = '#e2e8f0';
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2;
          ctx.fillRect(-16, -16, 32, 14);
          ctx.strokeRect(-16, -16, 32, 14);
          ctx.restore();
        }

        // --- DRAW WEAPON 4: EXECUTIONER'S GREATSWORD (Diagonal X-Slash) ---
        else if (anim.type === 'overclock_pulse') {
          ctx.save();
          const slashLen = Math.max(width, height) * 0.85;
          const alpha = 1 - progress;
          ctx.translate(targetPos.x, targetPos.y);

          // Draw 2 gleaming steel diagonal sword slashes
          [-Math.PI / 4, Math.PI / 4].forEach((angle, idx) => {
            ctx.save();
            ctx.rotate(angle);
            const sweep = Math.min(1, progress * 2.2 - idx * 0.25);
            if (sweep > 0) {
              const grad = ctx.createLinearGradient(-slashLen / 2, 0, slashLen / 2, 0);
              grad.addColorStop(0, 'rgba(244, 63, 94, 0)');
              grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
              grad.addColorStop(0.8, `rgba(251, 113, 133, ${alpha})`);
              grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.ellipse(0, 0, (slashLen / 2) * sweep, 8 * alpha, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          });
          ctx.restore();
        }

        // --- DRAW CHAIN REACTION: POWDER-KEG BARREL EXPLOSION ---
        else if (anim.type === 'BARREL_EXPLOSION') {
          ctx.save();
          const r = targetPos.cellW * 1.35 * progress;
          ctx.strokeStyle = `rgba(251, 146, 60, ${1 - progress})`;
          ctx.lineWidth = 8 * (1 - progress);
          ctx.beginPath();
          ctx.arc(targetPos.x, targetPos.y, r, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = `rgba(254, 240, 138, ${(1 - progress) * 0.65})`;
          ctx.beginPath();
          ctx.arc(targetPos.x, targetPos.y, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // --- DRAW CHAIN REACTION: STORM-RUNE MAGE LIGHTNING BEAM ---
        else if (anim.type === 'RUNE_LIGHTNING') {
          ctx.save();
          ctx.strokeStyle = `rgba(250, 204, 21, ${1 - progress})`;
          ctx.lineWidth = 12 * (1 - progress);
          ctx.beginPath();
          if (anim.axis === 'ROW') {
            ctx.moveTo(0, targetPos.y);
            ctx.lineTo(width, targetPos.y);
          } else {
            ctx.moveTo(targetPos.x, 0);
            ctx.lineTo(targetPos.x, height);
          }
          ctx.stroke();
          ctx.restore();
        }

        if (progress < 1) {
          remainingAnims.push(anim);
        }
      }
      activeAnimsRef.current = remainingAnims;

      // 2. Render & Update Flying Shrapnel, Wood Splinters & Fire Embers
      const nextParticles = [];
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.decay;
        p.rotation += p.vRot;

        if (p.alpha > 0.02) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;

          if (p.shape === 'splinter') {
            ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          nextParticles.push(p);
        }
      }
      particlesRef.current = nextParticles;

      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [gridSize]);

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={520}
      className="battle-vfx-canvas"
      aria-hidden="true"
    />
  );
}
