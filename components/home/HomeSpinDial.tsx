"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const N = 5;
const STEP = (2 * Math.PI) / N;
const BASE = 300;
const FRICTION = 0.994;
const FLING_MULT = 2.5;
const MS_PER_FRAME = 1000 / 60;
const STOP_V_RAD_PER_FRAME = (0.05 * Math.PI) / 180;
const TAP_MAX_PX = 12;
const TAP_MAX_MS = 400;
const VELOCITY_WINDOW_MS = 80;
const SNAP_MS = 240;

function snapRotation(rotation: number): number {
  return Math.round(rotation / STEP) * STEP;
}

function wrapAngle(d: number): number {
  let x = d;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

export type DialItem = {
  label: string;
  emoji: string;
  href: string;
};

export const DIAL_ITEMS: DialItem[] = [
  { label: "TODAY", emoji: "📅", href: "/meals" },
  { label: "WORKOUT", emoji: "🏋🏾", href: "/workout" },
  { label: "MEALS", emoji: "🥗", href: "/meals" },
  { label: "LOG", emoji: "📊", href: "/progress" },
  { label: "SCALE", emoji: "⚖️", href: "/progress" },
];

type DialGeom = {
  side: number;
  cx: number;
  cy: number;
  r: number;
  btn: number;
  hub: number;
  slideR: number;
  hitExtra: number;
};

function buildGeom(side: number): DialGeom {
  const u = side / BASE;
  const btn = Math.max(70, side * 0.28);
  return {
    side,
    cx: side / 2,
    cy: side / 2,
    r: side * 0.38,
    btn,
    hub: side * 0.13,
    slideR: side * 0.1,
    hitExtra: 12 * u,
  };
}

function angleToDialIndex(rotation: number): number {
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < N; i++) {
    const a = rotation + i * STEP - Math.PI / 2;
    const diff = Math.abs(wrapAngle(a - -Math.PI / 2));
    if (diff < bestAbs) {
      bestAbs = diff;
      best = i;
    }
  }
  return best;
}

function hitTestIndex(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  rotation: number,
  g: DialGeom
): number | null {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const ang = rotation + i * STEP - Math.PI / 2;
    const bx = g.cx + g.r * Math.cos(ang);
    const by = g.cy + g.r * Math.sin(ang);
    const d = Math.hypot(x - bx, y - by);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD < g.btn / 2 + g.hitExtra ? best : null;
}

type RotSample = { t: number; rot: number };

export function HomeSpinDial() {
  const router = useRouter();
  const measureRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);

  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [, setRenderTick] = useState(0);
  const bump = useCallback(() => setRenderTick((n) => n + 1), []);

  const [side, setSide] = useState(BASE);
  const geom = useMemo(() => buildGeom(side), [side]);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const s = Math.floor(Math.min(r.width, r.height));
      if (!Number.isFinite(s) || s < 80) return;
      setSide((prev) => (prev === s ? prev : s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0, t: 0, ang: 0 });
  const startClientRef = useRef({ x: 0, y: 0, t: 0 });
  const sectorDownRef = useRef<number | null>(null);
  const rotSamplesRef = useRef<RotSample[]>([]);
  const slideTriggeredRef = useRef(false);
  const hubGlowRef = useRef(0);
  const [hubGlow, setHubGlow] = useState(0);
  const [dialHover, setDialHover] = useState(false);
  const [pulse, setPulse] = useState(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const runSnapAnimation = useCallback(
    (from: number, to: number, onDone?: () => void) => {
      stopLoop();
      const t0 = performance.now();
      let delta = to - from;
      delta -= Math.round(delta / (2 * Math.PI)) * (2 * Math.PI);
      const target = from + delta;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / SNAP_MS);
        const e = 1 - (1 - p) * (1 - p);
        rotationRef.current = from + (target - from) * e;
        bump();
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rotationRef.current = snapRotation(rotationRef.current);
          rafRef.current = null;
          onDone?.();
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [bump, stopLoop]
  );

  const runPhysics = useCallback(() => {
    stopLoop();
    const tick = () => {
      let v = velocityRef.current;
      rotationRef.current += v;
      v *= FRICTION;
      velocityRef.current = v;
      bump();

      if (Math.abs(v) < STOP_V_RAD_PER_FRAME) {
        velocityRef.current = 0;
        const r = rotationRef.current;
        const snapped = snapRotation(r);
        if (Math.abs(wrapAngle(snapped - r)) > 1e-4) {
          runSnapAnimation(r, snapped);
        } else {
          rotationRef.current = snapped;
          bump();
        }
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [bump, runSnapAnimation, stopLoop]);

  const pushSample = useCallback((t: number, rot: number) => {
    const arr = rotSamplesRef.current;
    arr.push({ t, rot });
    const cutoff = t - VELOCITY_WINDOW_MS - 50;
    while (arr.length > 0 && arr[0].t < cutoff) arr.shift();
  }, []);

  const releaseVelocityFromSamples = useCallback((now: number) => {
    const arr = rotSamplesRef.current.filter((s) => s.t >= now - VELOCITY_WINDOW_MS);
    if (arr.length < 2) return 0;
    const a0 = arr[0];
    const a1 = arr[arr.length - 1];
    const dt = a1.t - a0.t;
    if (dt < 1) return 0;
    const dRot = a1.rot - a0.rot;
    const radPerMs = dRot / dt;
    return radPerMs * MS_PER_FRAME * FLING_MULT;
  }, []);

  const trySlideNavigate = useCallback(
    (el: HTMLDivElement, pointerId: number, lx: number, ly: number, g: DialGeom) => {
      if (slideTriggeredRef.current || sectorDownRef.current == null) return false;
      const d = Math.hypot(lx - g.cx, ly - g.cy);
      if (d >= g.slideR) return false;
      slideTriggeredRef.current = true;
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      draggingRef.current = false;
      pointerIdRef.current = null;
      velocityRef.current = 0;
      stopLoop();
      const idx = sectorDownRef.current;
      sectorDownRef.current = null;
      rotSamplesRef.current = [];
      setPulse(1);
      window.setTimeout(() => setPulse(0), 320);
      router.push(DIAL_ITEMS[idx].href);
      return true;
    },
    [router, stopLoop]
  );

  const localXY = (e: React.PointerEvent, rect: DOMRect) => ({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    const dial = dialRef.current;
    if (!dial) return;
    dial.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    draggingRef.current = true;
    slideTriggeredRef.current = false;
    stopLoop();
    velocityRef.current = 0;
    rotSamplesRef.current = [];
    const g = buildGeom(side);
    const rect = dial.getBoundingClientRect();
    const { x, y } = localXY(e, rect);
    const t = performance.now();
    startClientRef.current = { x: e.clientX, y: e.clientY, t };
    lastPointerRef.current = {
      x,
      y,
      t,
      ang: Math.atan2(y - g.cy, x - g.cx),
    };
    sectorDownRef.current = hitTestIndex(e.clientX, e.clientY, rect, rotationRef.current, g);
    pushSample(t, rotationRef.current);
    hubGlowRef.current = 0;
    setHubGlow(0);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const dial = dialRef.current;
    if (!dial || !draggingRef.current) return;
    const g = buildGeom(side);
    const rect = dial.getBoundingClientRect();
    const { x, y } = localXY(e, rect);
    const t = performance.now();
    const lp = lastPointerRef.current;
    const ang = Math.atan2(y - g.cy, x - g.cx);
    let da = ang - lp.ang;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    rotationRef.current += da;
    lastPointerRef.current = { x, y, t, ang };
    pushSample(t, rotationRef.current);

    const dist = Math.hypot(x - g.cx, y - g.cy);
    const glow =
      dist >= g.slideR ? 0 : 1 - dist / Math.max(g.slideR, 1e-6);
    hubGlowRef.current = glow;
    setHubGlow(glow);
    bump();

    if (trySlideNavigate(dial, e.pointerId, x, y, g)) return;
  };

  const endPointer = (e: React.PointerEvent) => {
    const dial = dialRef.current;
    if (!dial || pointerIdRef.current !== e.pointerId) return;
    const g = buildGeom(side);
    const rect = dial.getBoundingClientRect();
    const { x, y } = localXY(e, rect);
    const t = performance.now();

    if (trySlideNavigate(dial, e.pointerId, x, y, g)) return;

    try {
      dial.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draggingRef.current = false;
    pointerIdRef.current = null;
    hubGlowRef.current = 0;
    setHubGlow(0);

    const move = Math.hypot(e.clientX - startClientRef.current.x, e.clientY - startClientRef.current.y);
    const dt = t - startClientRef.current.t;

    if (move < TAP_MAX_PX && dt < TAP_MAX_MS) {
      const idx = hitTestIndex(
        startClientRef.current.x,
        startClientRef.current.y,
        rect,
        rotationRef.current,
        g
      );
      if (idx != null) {
        router.push(DIAL_ITEMS[idx].href);
        sectorDownRef.current = null;
        rotSamplesRef.current = [];
        return;
      }
    }

    pushSample(t, rotationRef.current);
    const v0 = releaseVelocityFromSamples(t);
    velocityRef.current = v0;
    sectorDownRef.current = null;
    rotSamplesRef.current = [];

    if (Math.abs(v0) >= STOP_V_RAD_PER_FRAME) {
      runPhysics();
    } else {
      const r = rotationRef.current;
      const snapped = snapRotation(r);
      if (Math.abs(wrapAngle(snapped - r)) > 1e-4) {
        runSnapAnimation(r, snapped);
      }
    }
  };

  useEffect(() => () => stopLoop(), [stopLoop]);

  const rotation = rotationRef.current;
  const activeIndex = angleToDialIndex(rotation);
  const u = side / BASE;
  const labelFs = Math.max(8, Math.round(10 * u));
  const emojiFs = Math.max(14, Math.round(18 * u));

  const hubPulse = Math.max(hubGlow, pulse);
  const hubShadow =
    hubPulse > 0
      ? `0 0 ${(10 + hubPulse * 28) * u}px ${(2 + hubPulse * 10) * u}px rgba(59,130,246,${0.25 + hubPulse * 0.55})`
      : dialHover
        ? `0 0 ${8 * u}px ${2 * u}px rgba(59,130,246,0.2)`
        : "none";

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-transparent">
      <div
        ref={measureRef}
        className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-hidden bg-transparent"
      >
        <div
          ref={dialRef}
          role="presentation"
          className="relative touch-none select-none bg-transparent"
          style={{ width: side, height: side }}
          onPointerEnter={() => setDialHover(true)}
          onPointerLeave={(ev) => {
            setDialHover(false);
            if (draggingRef.current) endPointer(ev);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <div
            className="pointer-events-none absolute z-10 rounded-full bg-[var(--surface2)]"
            style={{
              width: geom.hub,
              height: geom.hub,
              left: geom.cx,
              top: geom.cy,
              transform: "translate(-50%, -50%)",
              border: "1.5px solid rgba(59,130,246,0.2)",
              boxShadow: hubShadow,
              transition: "box-shadow 0.15s ease-out",
            }}
            aria-hidden
          />
          {DIAL_ITEMS.map((item, i) => {
            const ang = rotation + i * STEP - Math.PI / 2;
            const bx = geom.cx + geom.r * Math.cos(ang) - geom.btn / 2;
            const by = geom.cy + geom.r * Math.sin(ang) - geom.btn / 2;
            const active = i === activeIndex;
            return (
              <div
                key={item.label}
                className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full text-center leading-tight"
                style={{
                  width: geom.btn,
                  height: geom.btn,
                  left: bx,
                  top: by,
                  background: active
                    ? "linear-gradient(135deg, #0f1f35, #1a2a4a)"
                    : "var(--surface2)",
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "50%",
                  fontFamily: "var(--fb)",
                  fontSize: labelFs,
                  color: "var(--text2)",
                }}
              >
                <span className="leading-none" style={{ fontSize: emojiFs }} aria-hidden>
                  {item.emoji}
                </span>
                <span
                  className="mt-0.5 font-semibold uppercase text-[var(--text)]"
                  style={{ letterSpacing: "0.06em" }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p
        className="shrink-0 bg-transparent py-2 text-center uppercase text-[var(--text3)]"
        style={{
          fontFamily: '"DM Sans", var(--fb), sans-serif',
          fontSize: 11,
          letterSpacing: "1px",
          lineHeight: 1.3,
        }}
      >
        FLING TO SPIN &middot; SLIDE TO CENTER &middot; TAP TO OPEN
      </p>
    </div>
  );
}
