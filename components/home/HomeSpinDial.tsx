"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const N = 5;
const STEP = (2 * Math.PI) / N;
const R = 118;
const BTN = 90;
const CX = 160;
const CY = 160;
const DCX = 140;
const DCY = 140;
const FRICTION = 0.994;
const MIN_V = 0.000045;
const FLING_VELOCITY_MULT = 2.35;
const SLIDE_CENTER_R = 30;
const GLOW_FADE_DIST = 118;
const TAP_MAX_DIST = 16;
const TAP_MAX_MS = 450;

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

function nearestDialIndex(clientX: number, clientY: number, rect: DOMRect, rotation: number) {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const ang = rotation + i * STEP - Math.PI / 2;
    const bx = CX + R * Math.cos(ang);
    const by = CY + R * Math.sin(ang);
    const d = Math.hypot(x - bx, y - by);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD < BTN / 2 + 14 ? best : null;
}

export function HomeSpinDial() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);

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
      if (slideDoneRef.current || sectorRef.current == null || !inwardThisDragRef.current) return false;
      const distHub = Math.hypot(x - DCX, y - DCY);
      if (distHub >= SLIDE_CENTER_R) return false;
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

  const angleFromCenter = (x: number, y: number) => Math.atan2(y - CY, x - CX);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    draggingRef.current = true;
    stopRaf();
    velocityRef.current = 0;
    const { x, y } = localXY(e, el);
    const t = performance.now();
    startRef.current = { x, y, t, clientX: e.clientX, clientY: e.clientY };
    lastRef.current = { x, y, t, ang: angleFromCenter(x, y) };
    lastDistToHubRef.current = Math.hypot(x - DCX, y - DCY);
    inwardThisDragRef.current = false;
    slideDoneRef.current = false;
    setHubGlow(0);
    setNavPulse(0);
    const rect = el.getBoundingClientRect();
    sectorRef.current = nearestDialIndex(
      e.clientX,
      e.clientY,
      rect,
      rotationRef.current
    );
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !wrapRef.current) return;
    const { x, y } = localXY(e, wrapRef.current);
    const t = performance.now();
    const la = lastRef.current;
    const ang = angleFromCenter(x, y);
    let da = ang - la.ang;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    rotationRef.current += da;
    const dt = Math.max(t - la.t, 1);
    const instantV = da / dt;
    velocityRef.current = velocityRef.current * 0.22 + instantV * 0.78;
    lastRef.current = { x, y, t, ang };
    const distHub = Math.hypot(x - DCX, y - DCY);
    if (distHub < lastDistToHubRef.current) inwardThisDragRef.current = true;
    lastDistToHubRef.current = distHub;
    const g =
      distHub <= SLIDE_CENTER_R
        ? 1
        : distHub >= GLOW_FADE_DIST
          ? 0
          : (GLOW_FADE_DIST - distHub) / (GLOW_FADE_DIST - SLIDE_CENTER_R);
    setHubGlow(g);
    redraw();
    const wrap = wrapRef.current;
    if (wrap && trySlideToCenterNav(wrap, e.pointerId, x, y)) return;
  };

  const endPointer = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el || pointerIdRef.current !== e.pointerId) return;
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

    if (moveDist < TAP_MAX_DIST && dt < TAP_MAX_MS) {
      const rect = el.getBoundingClientRect();
      const idx = nearestDialIndex(startRef.current.clientX, startRef.current.clientY, rect, rotationRef.current);
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

  return (
    <div className="flex flex-col items-center">
      <div
        ref={wrapRef}
        className="relative touch-none select-none"
        style={{ width: 320, height: 320 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={(ev) => {
          if (draggingRef.current) endPointer(ev);
        }}
      >
        <div
          className="absolute z-10 rounded-full border-2"
          style={{
            width: 44,
            height: 44,
            left: DCX,
            top: DCY,
            transform: "translate(-50%, -50%)",
            borderColor: "var(--border)",
            background: "var(--surface2)",
            boxShadow: (() => {
              const g = Math.min(1, Math.max(hubGlow, navPulse));
              if (g <= 0) return "none";
              const spread = 6 + g * 16;
              const blur = 22 + g * 36;
              const alpha = 0.38 + g * 0.52;
              return `0 0 ${blur}px ${spread}px rgba(59,130,246,${alpha})`;
            })(),
            transition: "box-shadow 0.1s ease-out",
          }}
          aria-hidden
        />
        {DIAL_ITEMS.map((item, i) => {
          const ang = rotation + i * STEP - Math.PI / 2;
          const bx = CX + R * Math.cos(ang) - BTN / 2;
          const by = CY + R * Math.sin(ang) - BTN / 2;
          return (
            <div
              key={item.label}
              className="absolute flex flex-col items-center justify-center rounded-full border bg-[var(--surface)] text-center leading-tight"
              style={{
                width: BTN,
                height: BTN,
                left: bx,
                top: by,
                pointerEvents: "none",
                borderColor: "var(--border)",
                fontFamily: "var(--fb)",
                fontSize: 10,
                color: "var(--text2)",
              }}
            >
              <span className="text-xl" aria-hidden>
                {item.emoji}
              </span>
              <span
                className="mt-0.5 font-semibold uppercase text-[var(--text)]"
                style={{ letterSpacing: "1px" }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
      <p
        className="mt-4 max-w-[280px] text-center text-[10px] uppercase text-[var(--text2)]"
        style={{ fontFamily: "var(--fb)", letterSpacing: "2px" }}
      >
        FLING TO SPIN · SLIDE TO CENTER · TAP TO OPEN
      </p>
    </div>
  );
}
