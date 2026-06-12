import { useRef, useEffect, type MutableRefObject } from 'react';

export type OrbState = 'idle' | 'recording' | 'processing' | 'thinking' | 'speaking';

interface AmbientOrbProps {
  state: OrbState;
  logoSrc: string;
  /** Visual orb diameter in CSS px (default 192). Canvas extends 2x this to accommodate glow. */
  size?: number;
  /** Live audio level 0–1 (e.g. mic RMS). Read per-frame; modulates blob amplitude. */
  levelRef?: MutableRefObject<number>;
}

interface RGB { r: number; g: number; b: number }
interface AnimParams { amp: number; speed: number; complexity: number }

// State → target color
const STATE_COLORS: Record<OrbState, RGB> = {
  idle:       { r: 59,  g: 130, b: 246 }, // blue-500
  recording:  { r: 37,  g: 99,  b: 235 }, // blue-600
  processing: { r: 245, g: 158, b: 11  }, // amber-500
  thinking:   { r: 168, g: 85,  b: 247 }, // purple-500
  speaking:   { r: 34,  g: 197, b: 94  }, // emerald-500
};

// State → secondary hue for the iridescent second gradient layer
const STATE_COLORS_2: Record<OrbState, RGB> = {
  idle:       { r: 129, g: 140, b: 248 }, // indigo-400
  recording:  { r: 6,   g: 182, b: 212 }, // cyan-500
  processing: { r: 251, g: 146, b: 60  }, // orange-400
  thinking:   { r: 236, g: 72,  b: 153 }, // pink-500
  speaking:   { r: 20,  g: 184, b: 166 }, // teal-500
};

// State → animation character
const STATE_PARAMS: Record<OrbState, AnimParams> = {
  idle:       { amp: 0.055, speed: 0.40, complexity: 1.9 }, // slow, gentle
  recording:  { amp: 0.110, speed: 1.60, complexity: 3.8 }, // baseline; mic level adds the rest
  processing: { amp: 0.090, speed: 2.30, complexity: 2.8 }, // spinning-ish
  thinking:   { amp: 0.080, speed: 0.90, complexity: 2.3 }, // medium pulse
  speaking:   { amp: 0.130, speed: 1.40, complexity: 3.0 }, // rhythmic
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function AmbientOrb({ state, logoSrc, size = 192, levelRef }: AmbientOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  // Refs for animation loop — avoids stale closures without restarting the RAF
  const stateRef   = useRef<OrbState>(state);
  const colorRef   = useRef<RGB>({ ...STATE_COLORS[state] });
  const color2Ref  = useRef<RGB>({ ...STATE_COLORS_2[state] });
  const paramsRef  = useRef<AnimParams>({ ...STATE_PARAMS[state] });
  const levelSmoothRef = useRef(0);
  const audioLevelRef = useRef(levelRef);

  // Sync latest state into ref each render
  useEffect(() => {
    stateRef.current = state;
    audioLevelRef.current = levelRef;
  }, [state, levelRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Canvas is 2× the visual size so the outer glow has room to breathe
    const CANVAS_CSS = size * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width  = CANVAS_CSS * dpr;
    canvas.height = CANVAS_CSS * dpr;
    canvas.style.width  = `${CANVAS_CSS}px`;
    canvas.style.height = `${CANVAS_CSS}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = CANVAS_CSS / 2;  // drawing center x
    const cy = CANVAS_CSS / 2;  // drawing center y
    const baseR = size * 0.375; // visual orb radius (~72px for 192px orb)
    const NUM_PTS = 128;
    const startTime = performance.now();

    function draw() {
      if (!ctx) return;

      const t  = (performance.now() - startTime) / 1000;
      const lr = 0.05; // lerp rate per frame (~60fps → ~95% transition in 1s)

      // Smooth color & param transitions
      const tc  = STATE_COLORS[stateRef.current];
      const tc2 = STATE_COLORS_2[stateRef.current];
      const tp  = STATE_PARAMS[stateRef.current];
      const c   = colorRef.current;
      const c2  = color2Ref.current;
      const p   = paramsRef.current;

      c.r = lerp(c.r, tc.r, lr);
      c.g = lerp(c.g, tc.g, lr);
      c.b = lerp(c.b, tc.b, lr);
      c2.r = lerp(c2.r, tc2.r, lr);
      c2.g = lerp(c2.g, tc2.g, lr);
      c2.b = lerp(c2.b, tc2.b, lr);
      p.amp        = lerp(p.amp,        tp.amp,        lr * 1.5);
      p.speed      = lerp(p.speed,      tp.speed,      lr);
      p.complexity = lerp(p.complexity, tp.complexity, lr);

      // Audio reactivity: fast attack, slow release so the orb rides speech peaks
      const targetLevel = audioLevelRef.current?.current ?? 0;
      const ls = levelSmoothRef.current;
      levelSmoothRef.current = ls + (targetLevel - ls) * (targetLevel > ls ? 0.35 : 0.06);

      const { r, g, b } = c;
      const { speed, complexity } = p;
      const amp = p.amp * (1 + levelSmoothRef.current * 1.4);
      const ts = t * speed;

      const ri = Math.round(r);
      const gi = Math.round(g);
      const bi = Math.round(b);
      const r2 = Math.round(c2.r);
      const g2 = Math.round(c2.g);
      const b2 = Math.round(c2.b);

      ctx.clearRect(0, 0, CANVAS_CSS, CANVAS_CSS);

      // ─── Outer glow blob (large, soft) ───────────────────────────────────
      ctx.beginPath();
      for (let i = 0; i <= NUM_PTS; i++) {
        const angle = (i / NUM_PTS) * Math.PI * 2;
        const n =
          Math.sin(angle * 2          + ts * 0.85) * amp * 0.50 +
          Math.sin(angle * complexity + ts * 1.05 + 1.1) * amp * 0.35 +
          Math.sin(angle * 4          + ts * 0.65 + 2.2) * amp * 0.20;
        const rr = baseR * 1.45 * (1 + n * 0.5);
        const a  = angle - Math.PI / 2;
        const x  = cx + rr * Math.cos(a);
        const y  = cy + rr * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const glowBoost = 1 + levelSmoothRef.current * 0.5;
      const og = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.8);
      og.addColorStop(0,   `rgba(${ri},${gi},${bi},${0.18 * glowBoost})`);
      og.addColorStop(0.5, `rgba(${ri},${gi},${bi},${0.09 * glowBoost})`);
      og.addColorStop(1,   `rgba(${ri},${gi},${bi},0)`);
      ctx.fillStyle = og;
      ctx.fill();

      // ─── Inner blob ───────────────────────────────────────────────────────
      const blob = new Path2D();
      for (let i = 0; i <= NUM_PTS; i++) {
        const angle = (i / NUM_PTS) * Math.PI * 2;
        const n =
          Math.sin(angle * 2          + ts * 1.10) * amp * 0.55 +
          Math.sin(angle * complexity + ts * 0.90 + 1.0) * amp * 0.40 +
          Math.sin(angle * 4          + ts * 1.30 + 2.1) * amp * 0.25 +
          Math.sin(angle * 1          + ts * 0.60 + 0.5) * amp * 0.30;
        const rr = baseR * (1 + n);
        const a  = angle - Math.PI / 2;
        const x  = cx + rr * Math.cos(a);
        const y  = cy + rr * Math.sin(a);
        if (i === 0) blob.moveTo(x, y); else blob.lineTo(x, y);
      }
      blob.closePath();

      // Primary gradient, offset up-left for an off-axis light source
      const ig = ctx.createRadialGradient(
        cx - baseR * 0.22, cy - baseR * 0.28, 0,
        cx, cy, baseR * 1.1
      );
      ig.addColorStop(0,    `rgba(${ri},${gi},${bi},0.65)`);
      ig.addColorStop(0.50, `rgba(${ri},${gi},${bi},0.42)`);
      ig.addColorStop(0.85, `rgba(${ri},${gi},${bi},0.15)`);
      ig.addColorStop(1,    `rgba(${ri},${gi},${bi},0.00)`);
      ctx.fillStyle = ig;
      ctx.fill(blob);

      // Secondary hue, offset down-right — drifts slowly for an iridescent shimmer
      const driftX = Math.sin(t * 0.35) * baseR * 0.18;
      const driftY = Math.cos(t * 0.28) * baseR * 0.15;
      const ig2 = ctx.createRadialGradient(
        cx + baseR * 0.30 + driftX, cy + baseR * 0.32 + driftY, 0,
        cx, cy, baseR * 1.05
      );
      ig2.addColorStop(0,    `rgba(${r2},${g2},${b2},0.38)`);
      ig2.addColorStop(0.55, `rgba(${r2},${g2},${b2},0.18)`);
      ig2.addColorStop(1,    `rgba(${r2},${g2},${b2},0.00)`);
      ctx.fillStyle = ig2;
      ctx.fill(blob);

      // Glass highlight near the top
      const hl = ctx.createRadialGradient(
        cx, cy - baseR * 0.42, 0,
        cx, cy - baseR * 0.42, baseR * 0.58
      );
      hl.addColorStop(0, 'rgba(255,255,255,0.16)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fill(blob);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [size]); // only re-initialise if size changes

  // The container is exactly size×size. The canvas is 2× that, centred via
  // negative offset so the glow overflows symmetrically on all sides.
  const offset = -(size / 2);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        className="absolute pointer-events-none"
        style={{ left: offset, top: offset }}
      />
      <img
        src={logoSrc}
        alt="Agentforce"
        className="absolute inset-0 m-auto object-contain z-10 pointer-events-none"
        style={{ width: size * 0.56, height: size * 0.56 }}
        data-testid="voice-mode-logo"
      />
    </div>
  );
}
