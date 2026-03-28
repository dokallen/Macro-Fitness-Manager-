"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const N = 5;
const STEP = (2 * Math.PI) / N;
const R = 118;
const BTN = 90;
const CX = 160;
const CY = 160;
const FRICTION = 0.988;
const MIN_V = 0.00012;
const CENTER_HIT = 52;
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
  const nearCenterRef = useRef(false);
  const sectorRef = useRef<number | null>(null);
  const [nearCenter, setNearCenter] = useState(false);

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
    nearCenterRef.current = false;
    setNearCenter(false);
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
    velocityRef.current = velocityRef.current * 0.45 + instantV * 0.55;
    lastRef.current = { x, y, t, ang };
    const dist = Math.hypot(x - CX, y - CY);
    const startD = Math.hypot(startRef.current.x - CX, startRef.current.y - CY);
    const nc = dist < CENTER_HIT && startD > R - 35 && sectorRef.current != null;
    nearCenterRef.current = nc;
    setNearCenter(nc);
    redraw();
  };

  const endPointer = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el || pointerIdRef.current !== e.pointerId) return;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    draggingRef.current = false;
    pointerIdRef.current = null;
    const t = performance.now();
    const moveDist = Math.hypot(e.clientX - startRef.current.clientX, e.clientY - startRef.current.clientY);
    const dt = t - startRef.current.t;

    if (nearCenterRef.current && sectorRef.current != null) {
      router.push(DIAL_ITEMS[sectorRef.current].href);
      nearCenterRef.current = false;
      setNearCenter(false);
      sectorRef.current = null;
      return;
    }

    if (moveDist < TAP_MAX_DIST && dt < TAP_MAX_MS) {
      const rect = el.getBoundingClientRect();
      const idx = nearestDialIndex(startRef.current.clientX, startRef.current.clientY, rect, rotationRef.current);
      if (idx != null) {
        router.push(DIAL_ITEMS[idx].href);
        nearCenterRef.current = false;
        setNearCenter(false);
        sectorRef.current = null;
        return;
      }
    }

    runPhysics();
    nearCenterRef.current = false;
    setNearCenter(false);
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
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            width: 44,
            height: 44,
            borderColor: "var(--border)",
            background: "var(--surface2)",
            boxShadow: nearCenter ? "0 0 22px 6px rgba(59,130,246,0.85)" : "none",
            transition: "box-shadow 0.12s ease",
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
