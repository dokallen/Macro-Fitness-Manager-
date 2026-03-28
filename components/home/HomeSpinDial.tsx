"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const N = 5;
const STEP = (2 * Math.PI) / N;
const SIDE = 280;
const CX = 140;
const CY = 140;
const R = 95;
const BTN = 78;
const HUB = 36;
const HIT_EXTRA = 12;
const SLIDE_CENTER_R = 80;
const SLIDE_MIN_DRAG = 15;
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

function ringAngle(rotation: number, i: number): number {
  return rotation + i * STEP;
}

function angleToDialIndex(rotation: number): number {
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < N; i++) {
    const a = ringAngle(rotation, i);
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
  rotation: number
): number | null {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const ang = ringAngle(rotation, i);
    const bx = CX + R * Math.cos(ang);
    const by = CY + R * Math.sin(ang);
    const d = Math.hypot(x - bx, y - by);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD < BTN / 2 + HIT_EXTRA ? best : null;
}

type RotSample = { t: number; rot: number };

export function HomeSpinDial() {
  const router = useRouter();
  const dialRef = useRef<HTMLDivElement>(null);

  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [, setRenderTick] = useState(0);
  const bump = useCallback(() => setRenderTick((n) => n + 1), []);

  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0, t: 0, ang: 0 });
  const startClientRef = useRef({ x: 0, y: 0, t: 0 });
  const lastClientMoveRef = useRef({ x: 0, y: 0 });
  const totalDragPxRef = useRef(0);
  const sectorDownRef = useRef<number | null>(null);
  const rotSamplesRef = useRef<RotSample[]>([]);
  const slideTriggeredRef = useRef(false);
  const [hubGlow, setHubGlow] = useState(0);
  const [dialHover, setDialHover] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dayOfMonth, setDayOfMonth] = useState(() => new Date().getDate());

  useEffect(() => {
    const id = window.setInterval(() => {
      setDayOfMonth((prev) => {
        const d = new Date().getDate();
        return d !== prev ? d : prev;
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

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
    (
      el: HTMLDivElement,
      pointerId: number,
      lx: number,
      ly: number,
      totalDragPx: number
    ) => {
      if (slideTriggeredRef.current || sectorDownRef.current == null) return false;
      const d = Math.hypot(lx - CX, ly - CY);
      if (d >= SLIDE_CENTER_R || totalDragPx <= SLIDE_MIN_DRAG) return false;
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
      totalDragPxRef.current = 0;
      setDragOffset({ x: 0, y: 0 });
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
    totalDragPxRef.current = 0;
    const rect = dial.getBoundingClientRect();
    const { x, y } = localXY(e, rect);
    const t = performance.now();
    startClientRef.current = { x: e.clientX, y: e.clientY, t };
    lastClientMoveRef.current = { x: e.clientX, y: e.clientY };
    lastPointerRef.current = {
      x,
      y,
      t,
      ang: Math.atan2(y - CY, x - CX),
    };
    sectorDownRef.current = hitTestIndex(e.clientX, e.clientY, rect, rotationRef.current);
    setDragOffset({ x: 0, y: 0 });
    pushSample(t, rotationRef.current);
    setHubGlow(0);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const dial = dialRef.current;
    if (!dial || !draggingRef.current) return;
    const rect = dial.getBoundingClientRect();
    const { x, y } = localXY(e, rect);
    const t = performance.now();
    const lp = lastPointerRef.current;
    const ang = Math.atan2(y - CY, x - CX);
    let da = ang - lp.ang;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    rotationRef.current += da;
    lastPointerRef.current = { x, y, t, ang };
    pushSample(t, rotationRef.current);

    const lm = lastClientMoveRef.current;
    totalDragPxRef.current += Math.hypot(e.clientX - lm.x, e.clientY - lm.y);
    lastClientMoveRef.current = { x: e.clientX, y: e.clientY };

    const dist = Math.hypot(x - CX, y - CY);
    const glow = dist >= SLIDE_CENTER_R ? 0 : 1 - dist / SLIDE_CENTER_R;
    setHubGlow(glow);
    bump();

    if (trySlideNavigate(dial, e.pointerId, x, y, totalDragPxRef.current)) return;

    const di = sectorDownRef.current;
    if (di !== null && dialRef.current) {
      const rectInner = dialRef.current.getBoundingClientRect();
      const pointerX = e.clientX - rectInner.left;
      const pointerY = e.clientY - rectInner.top;
      const ringAng = ringAngle(rotationRef.current, di);
      const naturalX = CX + R * Math.cos(ringAng);
      const naturalY = CY + R * Math.sin(ringAng);
      const offsetX = (pointerX - naturalX) * 0.6;
      const offsetY = (pointerY - naturalY) * 0.6;
      setDragOffset({ x: offsetX, y: offsetY });
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const dial = dialRef.current;
    if (!dial || pointerIdRef.current !== e.pointerId) return;
    const rect = dial.getBoundingClientRect();
    const { x, y } = localXY(e, rect);
    const t = performance.now();

    const lmEnd = lastClientMoveRef.current;
    totalDragPxRef.current += Math.hypot(e.clientX - lmEnd.x, e.clientY - lmEnd.y);

    if (trySlideNavigate(dial, e.pointerId, x, y, totalDragPxRef.current)) return;

    try {
      dial.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draggingRef.current = false;
    pointerIdRef.current = null;
    totalDragPxRef.current = 0;
    setHubGlow(0);
    setDragOffset({ x: 0, y: 0 });

    const move = Math.hypot(e.clientX - startClientRef.current.x, e.clientY - startClientRef.current.y);
    const dt = t - startClientRef.current.t;

    if (move < TAP_MAX_PX && dt < TAP_MAX_MS) {
      const idx = hitTestIndex(
        startClientRef.current.x,
        startClientRef.current.y,
        rect,
        rotationRef.current
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
  const labelFs = 10;
  const emojiFs = 18;

  const hubPulse = Math.max(hubGlow, pulse);
  const hubShadow =
    hubPulse > 0
      ? `0 0 ${10 + hubPulse * 28}px ${2 + hubPulse * 10}px rgba(59,130,246,${0.25 + hubPulse * 0.55})`
      : dialHover
        ? "0 0 8px 2px rgba(59,130,246,0.2)"
        : "none";

  return (
    <div className="flex w-full flex-col items-center justify-center overflow-hidden bg-transparent">
      <div
        ref={dialRef}
        role="presentation"
        className="relative mx-auto touch-none select-none bg-transparent"
        style={{ width: SIDE, height: SIDE }}
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
            width: HUB,
            height: HUB,
            left: CX,
            top: CY,
            transform: "translate(-50%, -50%)",
            border: "1.5px solid rgba(59,130,246,0.2)",
            boxShadow: hubShadow,
            transition: "box-shadow 0.15s ease-out",
          }}
          aria-hidden
        />
        {DIAL_ITEMS.map((item, i) => {
          const ang = ringAngle(rotation, i);
          const cxBtn = CX + R * Math.cos(ang);
          const cyBtn = CY + R * Math.sin(ang);
          const active = i === activeIndex;
          const isDragging = draggingRef.current && sectorDownRef.current === i;
          const offsetX = isDragging ? dragOffset.x : 0;
          const offsetY = isDragging ? dragOffset.y : 0;
          return (
            <div
              key={item.label}
              className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full text-center leading-tight"
              style={{
                width: BTN,
                height: BTN,
                left: cxBtn + offsetX,
                top: cyBtn + offsetY,
                transform: "translate(-50%, -50%)",
                background: active
                  ? "linear-gradient(135deg, #0f1f35, #1a2a4a)"
                  : "var(--surface2)",
                border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "50%",
                fontFamily: "var(--fb)",
                fontSize: labelFs,
                color: "var(--text2)",
                transition: isDragging ? "none" : "left 0.2s ease-out, top 0.2s ease-out",
                zIndex: isDragging ? 20 : 1,
              }}
            >
              <span className="leading-none" style={{ fontSize: emojiFs }} aria-hidden>
                {item.emoji}
              </span>
              {item.label === "TODAY" ? (
                <span
                  className="mt-0.5 font-bold tabular-nums text-[var(--text)]"
                  style={{ fontSize: Math.max(11, labelFs + 2), lineHeight: 1 }}
                >
                  {dayOfMonth}
                </span>
              ) : (
                <span
                  className="mt-0.5 font-semibold uppercase text-[var(--text)]"
                  style={{ letterSpacing: "0.06em" }}
                >
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
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
