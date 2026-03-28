"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const N = 5;
const STEP = (2 * Math.PI) / N;
const BASE = 320;
const FRICTION = 0.994;
const MIN_V = 0.000045;
const FLING_VELOCITY_MULT = 2.35;
const TAP_MAX_MS = 450;

type DialGeom = {
  side: number;
  u: number;
  cx: number;
  cy: number;
  r: number;
  btn: number;
  dcx: number;
  dcy: number;
  hub: number;
  slideR: number;
  glowFade: number;
  tapMax: number;
  hitPad: number;
};

function getGeom(side: number): DialGeom {
  const u = side / BASE;
  const cx = side / 2;
  const cy = side / 2;
  return {
    side,
    u,
    cx,
    cy,
    r: 118 * u,
    btn: 90 * u,
    dcx: cx - 20 * u,
    dcy: cy - 20 * u,
    hub: 44 * u,
    slideR: 30 * u,
    glowFade: 118 * u,
    tapMax: Math.max(10, 16 * u),
    hitPad: 14 * u,
  };
}

type DialItem = {
  label: string;
  emoji: string;
  href: string;
};

export const DIAL_ITEMS: DialItem[] = [
  { label: "TODAY", emoji: "📅", href: "/" },
  { label: "WORKOUT", emoji: "🏋🏾", href: "/workout" },
  { label: "MEALS", emoji: "🥗", href: "/meals" },
  { label: "LOG", emoji: "📊", href: "/progress" },
  { label: "SCALE", emoji: "⚖️", href: "/progress" },
];

function snapAngle(rotation: number) {
  return Math.round(rotation / STEP) * STEP;
}

function nearestDialIndex(
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
  return bestD < g.btn / 2 + g.hitPad ? best : null;
}

export function HomeSpinDial() {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);

  const [side, setSide] = useState(BASE);
  const geom = useMemo(() => getGeom(side), [side]);
  const geomRef = useRef(geom);
  geomRef.current = geom;

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const raw = Math.min(r.width, r.height) - 2;
      if (!Number.isFinite(raw) || raw < 72) return;
      const s = Math.floor(raw);
      setSide((prev) => {
        const next = Math.max(120, Math.min(s, 360));
        return next === prev ? prev : next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const lastRef = useRef({ x: 0, y: 0, t: 0, ang: 0 });
  const startRef = useRef({ x: 0, y: 0, t: 0, clientX: 0, clientY: 0 });
  const sectorRef = useRef<number | null>(null);
  const lastDistToHubRef = useRef<number>(Infinity);
  const inwardThisDragRef = useRef(false);
  const slideDoneRef = useRef(false);
  const [hubGlow, setHubGlow] = useState(0);
  const [navPulse, setNavPulse] = useState(0);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const runPhysics = useCallback(() => {
    const loop = () => {
      let v = velocityRef.current;
      let r = rotationRef.current;
      if (Math.abs(v) > MIN_V) {
        v *= FRICTION;
        r += v;
        rotationRef.current = r;
        velocityRef.current = v;
        rafRef.current = requestAnimationFrame(loop);
        redraw();
      } else {
        velocityRef.current = 0;
        rotationRef.current = snapAngle(r);
        rafRef.current = null;
        redraw();
      }
    };
    stopRaf();
    rafRef.current = requestAnimationFrame(loop);
  }, [redraw, stopRaf]);

  const trySlideToCenterNav = useCallback(
    (el: HTMLDivElement, pointerId: number, x: number, y: number) => {
      const g = geomRef.current;
      if (slideDoneRef.current || sectorRef.current == null || !inwardThisDragRef.current) return false;
      const distHub = Math.hypot(x - g.dcx, y - g.dcy);
      if (distHub >= g.slideR) return false;
      slideDoneRef.current = true;
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
      draggingRef.current = false;
      pointerIdRef.current = null;
      velocityRef.current = 0;
      const idx = sectorRef.current;
      sectorRef.current = null;
      lastDistToHubRef.current = Infinity;
      inwardThisDragRef.current = false;
      setHubGlow(1);
      setNavPulse(1);
      window.setTimeout(() => {
        setNavPulse(0);
        setHubGlow(0);
      }, 380);
      router.push(DIAL_ITEMS[idx].href);
      return true;
    },
    [router]
  );

  const localXY = (e: React.PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const angleFromCenter = (x: number, y: number, g: DialGeom) => Math.atan2(y - g.cy, x - g.cx);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    draggingRef.current = true;
    stopRaf();
    velocityRef.current = 0;
    const g = geomRef.current;
    const { x, y } = localXY(e, el);
    const t = performance.now();
    startRef.current = { x, y, t, clientX: e.clientX, clientY: e.clientY };
    lastRef.current = { x, y, t, ang: angleFromCenter(x, y, g) };
    lastDistToHubRef.current = Math.hypot(x - g.dcx, y - g.dcy);
    inwardThisDragRef.current = false;
    slideDoneRef.current = false;
    setHubGlow(0);
    setNavPulse(0);
    const rect = el.getBoundingClientRect();
    sectorRef.current = nearestDialIndex(
      e.clientX,
      e.clientY,
      rect,
      rotationRef.current,
      g
    );
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !wrapRef.current) return;
    const g = geomRef.current;
    const { x, y } = localXY(e, wrapRef.current);
    const t = performance.now();
    const la = lastRef.current;
    const ang = angleFromCenter(x, y, g);
    let da = ang - la.ang;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    rotationRef.current += da;
    const dt = Math.max(t - la.t, 1);
    const instantV = da / dt;
    velocityRef.current = velocityRef.current * 0.22 + instantV * 0.78;
    lastRef.current = { x, y, t, ang };
    const distHub = Math.hypot(x - g.dcx, y - g.dcy);
    if (distHub < lastDistToHubRef.current) inwardThisDragRef.current = true;
    lastDistToHubRef.current = distHub;
    const glow =
      distHub <= g.slideR
        ? 1
        : distHub >= g.glowFade
          ? 0
          : (g.glowFade - distHub) / (g.glowFade - g.slideR);
    setHubGlow(glow);
    redraw();
    const wrap = wrapRef.current;
    if (wrap && trySlideToCenterNav(wrap, e.pointerId, x, y)) return;
  };

  const endPointer = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el || pointerIdRef.current !== e.pointerId) return;
    const g = geomRef.current;
    const { x, y } = localXY(e, el);
    if (trySlideToCenterNav(el, e.pointerId, x, y)) return;

    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    draggingRef.current = false;
    pointerIdRef.current = null;
    setHubGlow(0);
    lastDistToHubRef.current = Infinity;
    inwardThisDragRef.current = false;
    const t = performance.now();
    const moveDist = Math.hypot(e.clientX - startRef.current.clientX, e.clientY - startRef.current.clientY);
    const dt = t - startRef.current.t;

    if (moveDist < g.tapMax && dt < TAP_MAX_MS) {
      const rect = el.getBoundingClientRect();
      const idx = nearestDialIndex(
        startRef.current.clientX,
        startRef.current.clientY,
        rect,
        rotationRef.current,
        g
      );
      if (idx != null) {
        router.push(DIAL_ITEMS[idx].href);
        sectorRef.current = null;
        return;
      }
    }

    velocityRef.current *= FLING_VELOCITY_MULT;
    runPhysics();
    sectorRef.current = null;
  };

  useEffect(() => () => stopRaf(), [stopRaf]);

  const rotation = rotationRef.current;
  const u = geom.u;
  const hubBorder = Math.max(1, 2 * u);
  const labelFs = Math.max(7, Math.round(10 * u));
  const emojiFs = Math.max(12, Math.round(20 * u));

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col items-center justify-center overflow-hidden">
      <div
        ref={hostRef}
        className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center"
      >
        <div
          ref={wrapRef}
          className="relative shrink-0 touch-none select-none"
          style={{ width: side, height: side }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={(ev) => {
            if (draggingRef.current) endPointer(ev);
          }}
        >
          <div
            className="absolute z-10 rounded-full border border-solid"
            style={{
              borderWidth: hubBorder,
              width: geom.hub,
              height: geom.hub,
              left: geom.dcx,
              top: geom.dcy,
              transform: "translate(-50%, -50%)",
              borderColor: "var(--border)",
              background: "var(--surface2)",
              boxShadow: (() => {
                const glow = Math.min(1, Math.max(hubGlow, navPulse));
                if (glow <= 0) return "none";
                const spread = (6 + glow * 16) * u;
                const blur = (22 + glow * 36) * u;
                const alpha = 0.38 + glow * 0.52;
                return `0 0 ${blur}px ${spread}px rgba(59,130,246,${alpha})`;
              })(),
              transition: "box-shadow 0.1s ease-out",
            }}
            aria-hidden
          />
          {DIAL_ITEMS.map((item, i) => {
            const ang = rotation + i * STEP - Math.PI / 2;
            const bx = geom.cx + geom.r * Math.cos(ang) - geom.btn / 2;
            const by = geom.cy + geom.r * Math.sin(ang) - geom.btn / 2;
            return (
              <div
                key={item.label}
                className="absolute flex flex-col items-center justify-center rounded-full border bg-[var(--surface)] text-center leading-tight"
                style={{
                  width: geom.btn,
                  height: geom.btn,
                  left: bx,
                  top: by,
                  pointerEvents: "none",
                  borderColor: "var(--border)",
                  borderWidth: Math.max(1, u),
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
                  style={{ letterSpacing: `${Math.max(0.5, u)}px` }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p
        className="shrink-0 px-2 pb-0.5 pt-1 text-center uppercase text-[var(--text2)]"
        style={{
          fontFamily: "var(--fb)",
          letterSpacing: "clamp(1px, 0.4vw, 2px)",
          fontSize: "clamp(8px, 2.4vw, 10px)",
          maxWidth: "min(100%, 22rem)",
          lineHeight: 1.35,
        }}
      >
        FLING TO SPIN · SLIDE TO CENTER · TAP TO OPEN
      </p>
    </div>
  );
}
