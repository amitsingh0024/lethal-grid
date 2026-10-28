import React, { useEffect, useRef } from 'react';

/**
 * Canvas layer over the grid for weapon, chain and hit effects. Each item in vfxQueue is one
 * effect: a weapon type (rail_beam, nova_bomb, arc_chain, overclock_pulse), a chain blast
 * (BARREL_EXPLOSION, RUNE_LIGHTNING), a HIT flash with its damage number, a board-clear FLASH,
 * or a HITSTOP that freezes the layer for a few frames.
 *
 * Effects are drawn in a fixed 520x520 space scaled to the device's pixel density, and run on
 * their own clock so they play at the same speed on 60Hz and 120Hz screens and pause for hit-stop.
 */
const LOGICAL_SIZE = 520;
const MAX_PIXEL_RATIO = 2;
// Longest frame step the clock takes, so a stalled or backgrounded tab doesn't skip effects
const MAX_FRAME_STEP_MS = 100;
const FRAME_MS = 1000 / 60;

const KILL_DEBRIS = ['#65a30d', '#365314', '#141013', '#b45309', '#fbbf24'];

export function BattleVFXCanvas({ vfxQueue, gridSize, gridRef }) {
  const canvasRef = useRef(null);
  const activeAnimsRef = useRef([]);
  const particlesRef = useRef([]);
  const processedIdsRef = useRef(new Set());
  // Effect clock: advances with real time except while a hit-stop is holding it
  const clockRef = useRef({ now: 0, last: null, frozenUntil: 0 });
  // Tile centers in canvas space, measured from the real grid when effects start
  const layoutRef = useRef(null);
  // Starts the draw loop; the loop stops itself once nothing is left to draw
  const wakeLoopRef = useRef(() => {});

  const measureLayout = () => {
    const canvas = canvasRef.current;
    const grid = gridRef?.current;
    if (!canvas || !grid) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const k = LOGICAL_SIZE / box.width;
    layoutRef.current = Array.from(grid.children, (tile) => {
      const r = tile.getBoundingClientRect();
      return {
        x: (r.left + r.width / 2 - box.left) * k,
        y: (r.top + r.height / 2 - box.top) * k,
        cellW: r.width * k,
        cellH: r.height * k,
      };
    });
  };

  useEffect(() => {
    if (!vfxQueue || vfxQueue.length === 0) return;

    const clock = clockRef.current;
    let added = false;
    vfxQueue.forEach((item) => {
      if (processedIdsRef.current.has(item.id)) return;
      processedIdsRef.current.add(item.id);
      added = true;
      activeAnimsRef.current.push({
        ...item,
        startTime: clock.now + (item.delayMs || 0),
      });
    });
    if (!added) return;
    measureLayout();
    wakeLoopRef.current();
  }, [vfxQueue]);

  // Match the canvas's pixel buffer to its on-screen size so effects stay sharp on phones
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const cssW = entry.contentRect.width;
      if (!cssW) return;
      const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
      const px = Math.round(cssW * ratio);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      layoutRef.current = null;
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let rafId = null;
    layoutRef.current = null;

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
      const measured = layoutRef.current?.[row * gridSize + col];
      if (measured) return measured;
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

    const renderLoop = (frameTime) => {
      const clock = clockRef.current;
      const step = clock.last === null ? FRAME_MS : Math.min(MAX_FRAME_STEP_MS, frameTime - clock.last);
      clock.last = frameTime;

      // Hit-stop: hold the last frame as it is while the freeze lasts
      if (frameTime < clock.frozenUntil) {
        rafId = requestAnimationFrame(renderLoop);
        return;
      }
      clock.now += step;
      const now = clock.now;
      const dt = step / FRAME_MS;

      const width = LOGICAL_SIZE;
      const height = LOGICAL_SIZE;
      const scale = canvas.width / LOGICAL_SIZE;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (!layoutRef.current) measureLayout();
      let freezeMs = 0;

      const remainingAnims = [];
      for (const anim of activeAnimsRef.current) {
        if (now < anim.startTime) {
          remainingAnims.push(anim);
          continue;
        }

        const elapsed = now - anim.startTime;
        const duration = anim.duration || 480;
        const progress = Math.min(1, elapsed / duration);

        if (anim.type === 'HITSTOP') {
          freezeMs = Math.max(freezeMs, anim.duration);
          continue;
        }

        const targetPos = getCellCenter(anim.row, anim.col, width, height);
        const impactMs = anim.impactMs ?? duration * (anim.impactAt ?? 0.55);

        // Impact particles spawn once, when the projectile lands
        if (!anim.hasSpawnedImpact && elapsed >= impactMs) {
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
          } else if (anim.type === 'HIT' && anim.killed) {
            spawnBurstParticles(targetPos.x, targetPos.y, KILL_DEBRIS, 10, 0.75);
          }
        }

        if (anim.type === 'HIT') {
          drawHit(ctx, anim, elapsed, targetPos);
        } else if (anim.type === 'FLASH') {
          ctx.save();
          ctx.fillStyle = `rgba(255, 244, 214, ${0.55 * (1 - progress) ** 2})`;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }

        // Ballista: bolts along the row and column
        if (anim.type === 'rail_beam') {
          ctx.save();
          const boltX = progress * width * 1.15;
          const boltY = progress * height * 1.15;

          ctx.strokeStyle = `rgba(251, 191, 36, ${(1 - progress) * 0.85})`;
          ctx.lineWidth = 10 * (1 - progress * 0.5);
          ctx.beginPath();
          ctx.moveTo(0, targetPos.y);
          ctx.lineTo(boltX, targetPos.y);
          ctx.moveTo(targetPos.x, 0);
          ctx.lineTo(targetPos.x, boltY);
          ctx.stroke();

          // Horizontal bolt
          ctx.fillStyle = '#fde68a';
          ctx.beginPath();
          ctx.moveTo(boltX + 14, targetPos.y);
          ctx.lineTo(boltX - 12, targetPos.y - 7);
          ctx.lineTo(boltX - 12, targetPos.y + 7);
          ctx.closePath();
          ctx.fill();

          // Vertical bolt
          ctx.beginPath();
          ctx.moveTo(targetPos.x, boltY + 14);
          ctx.lineTo(targetPos.x - 7, boltY - 12);
          ctx.lineTo(targetPos.x + 7, boltY - 12);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Wildfire Flask: thrown in an arc, then a 3x3 fire ring
        else if (anim.type === 'nova_bomb') {
          ctx.save();
          if (progress < 0.55) {
            const t = progress / 0.55;
            const startX = width * 0.38;
            const startY = height + 10;
            const curX = startX + (targetPos.x - startX) * t;
            const arcLift = Math.sin(t * Math.PI) * 130;
            const curY = startY + (targetPos.y - startY) * t - arcLift;

            ctx.translate(curX, curY);
            ctx.rotate(t * Math.PI * 4);

            ctx.fillStyle = '#f97316';
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 4, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fde68a';
            ctx.fillRect(-4, -12, 8, 9);
          } else {
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

        // Thunder-Hammer: lightning from the sky, then between bounce targets
        else if (anim.type === 'arc_chain') {
          ctx.save();
          const t = Math.sin(progress * Math.PI);
          ctx.strokeStyle = `rgba(250, 204, 21, ${1 - progress * 0.7})`;
          ctx.lineWidth = 4;

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

        // Greatsword: two diagonal slashes
        else if (anim.type === 'overclock_pulse') {
          ctx.save();
          const slashLen = Math.max(width, height) * 0.85;
          const alpha = 1 - progress;
          ctx.translate(targetPos.x, targetPos.y);

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

        // Keg and ogre blasts
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

        // Shaman lightning down a row or column
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

      // Particles
      const nextParticles = [];
      for (const p of particlesRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
        p.alpha -= p.decay * dt;
        p.rotation += p.vRot * dt;

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

      if (freezeMs > 0) clock.frozenUntil = frameTime + freezeMs;

      if (remainingAnims.length === 0 && nextParticles.length === 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        clock.last = null;
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    const wakeLoop = () => {
      if (rafId === null) rafId = requestAnimationFrame(renderLoop);
    };
    wakeLoopRef.current = wakeLoop;
    if (activeAnimsRef.current.length > 0 || particlesRef.current.length > 0) wakeLoop();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      clockRef.current.last = null;
      wakeLoopRef.current = () => {};
    };
  }, [gridSize]);

  return (
    <canvas
      ref={canvasRef}
      width={LOGICAL_SIZE}
      height={LOGICAL_SIZE}
      className="battle-vfx-canvas"
      aria-hidden="true"
    />
  );
}

const HIT_FLASH_MS = 110;
const NUMBER_MS = 780;

/** Damage number styles: crits are big and gold, lucky procs violet, kills red, blocks steel blue */
function numberStyle(anim) {
  if (anim.blocked) return { fill: '#bfdbfe', stroke: '#1e3a8a', size: 20 };
  if (anim.lucky) return { fill: '#e9d5ff', stroke: '#3b0764', size: 30 };
  if (anim.crit) return { fill: '#fde047', stroke: '#7c2d12', size: 32 };
  if (anim.killed) return { fill: '#fecaca', stroke: '#450a0a', size: 24 };
  return { fill: '#ffffff', stroke: '#1c1917', size: 22 };
}

function drawHit(ctx, anim, elapsed, pos) {
  // Tile flash
  if (elapsed < HIT_FLASH_MS) {
    const a = 1 - elapsed / HIT_FLASH_MS;
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * a})`;
    const w = pos.cellW * 0.9;
    const h = pos.cellH * 0.9;
    ctx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h);
    ctx.restore();
  }

  // Number: pops in with overshoot, drifts up, fades out at the end
  const t = Math.min(1, elapsed / NUMBER_MS);
  const style = numberStyle(anim);
  const pop = t < 0.15 ? 0.4 + (t / 0.15) * 0.95 : t < 0.28 ? 1.35 - ((t - 0.15) / 0.13) * 0.35 : 1;
  const rise = (1 - (1 - t) ** 3) * 30;
  const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
  const text = anim.blocked
    ? 'BLOCK'
    : anim.lucky
    ? `${anim.damage}!!`
    : anim.crit
    ? `${anim.damage}!`
    : `${anim.damage}`;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pos.x + (anim.jitterX || 0), pos.y - pos.cellH * 0.15 - rise + (anim.jitterY || 0));
  ctx.scale(pop, pop);
  ctx.font = `900 ${style.size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = style.stroke;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = style.fill;
  ctx.fillText(text, 0, 0);
  if (anim.crit || anim.lucky) {
    ctx.font = `900 11px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.lineWidth = 4;
    const label = anim.lucky ? 'LUCKY' : 'CRIT';
    ctx.strokeText(label, 0, -style.size * 0.75);
    ctx.fillText(label, 0, -style.size * 0.75);
  }
  ctx.restore();
}
