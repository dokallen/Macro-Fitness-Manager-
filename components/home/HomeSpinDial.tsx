"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const DIAL_BTNS = [
  { icon: "📅", label: "TODAY", screen: "/meals" },
  { icon: "🏋🏾", label: "WORKOUT", screen: "/workout" },
  { icon: "🥗", label: "MEALS", screen: "/meals" },
  { icon: "📊", label: "LOG", screen: "/progress" },
  { icon: "⚖️", label: "SCALE", screen: "/progress" },
] as const;

const DR = 95;
const DC = 140;
const N = DIAL_BTNS.length;
const STEP_DEG = 360 / N;

export type DialItem = {
  label: string;
  emoji: string;
  href: string;
};

export const DIAL_ITEMS: DialItem[] = DIAL_BTNS.map((b) => ({
  label: b.label,
  emoji: b.icon,
  href: b.screen,
}));

function dialActive(dialRot: number): number {
  let best = 0;
  let bd = 999;
  for (let i = 0; i < N; i++) {
    const a = (((dialRot + i * STEP_DEG) % 360) + 360) % 360;
    let d = Math.abs(a - 270);
    if (d > 180) d = 360 - d;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function dialSnap(dialRot: number): number {
  let bd = 999;
  let delta = 0;
  for (let i = 0; i < N; i++) {
    const a = (((dialRot + i * STEP_DEG) % 360) + 360) % 360;
    let d = a - 270;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) < bd) {
      bd = Math.abs(d);
      delta = d;
    }
  }
  return dialRot - delta;
}

export function HomeSpinDial() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const dialRotRef = useRef<number>(270);
  const dialVelRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  function renderDial() {
    const c = containerRef.current;
    if (!c) return;
    const ai = dialActive(dialRotRef.current);
    const btns = c.querySelectorAll<HTMLElement>(".dial-btn");
    btns.forEach((el, i) => {
      const deg = (((dialRotRef.current + i * STEP_DEG) % 360) + 360) % 360;
      const rad = (deg * Math.PI) / 180;
      el.style.left = DC + DR * Math.cos(rad) + "px";
      el.style.top = DC + DR * Math.sin(rad) + "px";
      el.classList.toggle("active-slot", i === ai);
    });
  }

  function animDial(target: number, cb?: () => void) {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const s = dialRotRef.current;
    const d = target - s;
    const dur = Math.min(500, Math.max(180, Math.abs(d) * 3));
    const t0 = performance.now();
    function step(now: number) {
      const t = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3);
      dialRotRef.current = s + d * e;
      renderDial();
      if (t < 1) {
        rafIdRef.current = requestAnimationFrame(step);
      } else {
        dialRotRef.current = target;
        renderDial();
        if (cb) cb();
      }
    }
    rafIdRef.current = requestAnimationFrame(step);
  }

  function startMomentum() {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    function spin() {
      dialVelRef.current *= 0.992;
      dialRotRef.current += dialVelRef.current;
      renderDial();
      if (Math.abs(dialVelRef.current) > 0.15) {
        rafIdRef.current = requestAnimationFrame(spin);
      } else {
        rafIdRef.current = null;
        animDial(dialSnap(dialRotRef.current));
      }
    }
    rafIdRef.current = requestAnimationFrame(spin);
  }

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    /* Ref is stable for this effect lifetime; TS does not narrow refs inside closures. */
    const dialEl = root;

    let startA = 0;
    let startRot = 0;
    let lastA = 0;
    let isDrag = false;
    let totalPx = 0;
    let lastX = 0;
    let lastY = 0;
    let triggered = false;
    let startBtnIdx = -1;
    const vbuf: { v: number; t: number }[] = [];

    function angle(x: number, y: number): number {
      const r = dialEl.getBoundingClientRect();
      return (
        (Math.atan2(y - r.top - DC, x - r.left - DC) * 180) / Math.PI
      );
    }
    function cdist(x: number, y: number): number {
      const r = dialEl.getBoundingClientRect();
      return Math.hypot(x - r.left - DC, y - r.top - DC);
    }
    function nearestBtn(x: number, y: number): number {
      const r = dialEl.getBoundingClientRect();
      const lx = x - r.left;
      const ly = y - r.top;
      let best = -1;
      let bd = 999;
      for (let i = 0; i < N; i++) {
        const deg = (((dialRotRef.current + i * STEP_DEG) % 360) + 360) % 360;
        const rad = (deg * Math.PI) / 180;
        const bx = DC + DR * Math.cos(rad);
        const by = DC + DR * Math.sin(rad);
        const dist = Math.hypot(lx - bx, ly - by);
        if (dist < bd) {
          bd = dist;
          best = i;
        }
      }
      return best;
    }

    function onStart(x: number, y: number) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      startA = angle(x, y);
      lastA = startA;
      startRot = dialRotRef.current;
      isDrag = true;
      totalPx = 0;
      dialVelRef.current = 0;
      vbuf.length = 0;
      triggered = false;
      lastX = x;
      lastY = y;
      startBtnIdx = nearestBtn(x, y);
    }

    function onMove(x: number, y: number) {
      if (!isDrag || triggered) return;
      const now = performance.now();
      const cur = angle(x, y);
      let d = cur - lastA;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      totalPx += Math.hypot(x - lastX, y - lastY);
      lastX = x;
      lastY = y;
      lastA = cur;
      vbuf.push({ v: d, t: now });
      while (vbuf.length && vbuf[0].t < now - 80) vbuf.shift();
      dialRotRef.current = startRot + (cur - startA);
      renderDial();
      const ed = cdist(x, y);
      const dot = dialEl.querySelector<HTMLElement>(".dial-center-dot");
      if (dot) dot.classList.toggle("lit", ed < 80);
      if (ed < 80 && totalPx > 15) {
        triggered = true;
        isDrag = false;
        if (dot) dot.classList.remove("lit");
        const targetIdx =
          startBtnIdx >= 0 ? startBtnIdx : dialActive(dialRotRef.current);
        animDial(dialSnap(dialRotRef.current), () =>
          router.push(DIAL_BTNS[targetIdx].screen)
        );
      }
    }

    function onEnd(x: number, y: number) {
      if (!isDrag) return;
      isDrag = false;
      const dot = dialEl.querySelector<HTMLElement>(".dial-center-dot");
      if (dot) dot.classList.remove("lit");
      if (triggered) return;
      const endDist = cdist(x, y);
      if (totalPx < 12) {
        const best = nearestBtn(x, y);
        if (best >= 0) router.push(DIAL_BTNS[best].screen);
        return;
      }
      if (endDist < 80) {
        const targetIdx =
          startBtnIdx >= 0 ? startBtnIdx : dialActive(dialRotRef.current);
        animDial(dialSnap(dialRotRef.current), () =>
          router.push(DIAL_BTNS[targetIdx].screen)
        );
        return;
      }
      const recent = vbuf.slice(-4);
      const smoothV = recent.length
        ? recent.reduce((s, e) => s + e.v, 0) / recent.length
        : 0;
      dialVelRef.current = smoothV * 3.5;
      if (Math.abs(dialVelRef.current) > 0.8) {
        startMomentum();
      } else {
        dialVelRef.current = 0;
        animDial(dialSnap(dialRotRef.current));
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    };
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      onStart(e.clientX, e.clientY);
    };
    const onWindowMouseMove = (e: MouseEvent) => {
      if (isDrag) onMove(e.clientX, e.clientY);
    };
    const onWindowMouseUp = (e: MouseEvent) => {
      if (isDrag) onEnd(e.clientX, e.clientY);
    };

    dialEl.addEventListener("touchstart", onTouchStart, { passive: false });
    dialEl.addEventListener("touchmove", onTouchMove, { passive: false });
    dialEl.addEventListener("touchend", onTouchEnd, { passive: false });
    dialEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);

    renderDial();

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      dialEl.removeEventListener("touchstart", onTouchStart);
      dialEl.removeEventListener("touchmove", onTouchMove);
      dialEl.removeEventListener("touchend", onTouchEnd);
      dialEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dial uses refs; resubscribe only on router change
  }, [router]);

  return (
    <div className="dial-wrapper">
      <div className="dial-container" ref={containerRef}>
        <div className="dial-ring" />
        <div className="dial-center-dot" />
        {DIAL_BTNS.map((btn, i) => (
          <div key={i} className="dial-btn" data-i={i}>
            <div className="di">{btn.icon}</div>
            <div className="dl">{btn.label}</div>
          </div>
        ))}
      </div>
      <div className="dial-hint">FLING TO SPIN · SLIDE TO CENTER · TAP TO OPEN</div>
    </div>
  );
}
