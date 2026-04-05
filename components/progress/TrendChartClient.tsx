"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getCoach } from "@/components/coach/CoachChooser";
import type { BodyMetricDef } from "@/components/progress/MetricSetupClient";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ProgressEntry = {
  logged_at: string;
  metric_key: string;
  value: number;
  unit: string;
};

type RangeId = "2w" | "1m" | "3m" | "all";

const RANGE_MS: Record<Exclude<RangeId, "all">, number> = {
  "2w": 14 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
};

function formatShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function startOfLocalWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function linearRegression(pts: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function trendTone(
  delta: number,
  better: "higher" | "lower",
  flatEps: number
): "good" | "bad" | "flat" {
  if (Math.abs(delta) < flatEps) return "flat";
  if (better === "higher") {
    return delta > 0 ? "good" : "bad";
  }
  return delta < 0 ? "good" : "bad";
}

function MetricLineChart({
  points,
  range,
  showTrend,
}: {
  points: { at: string; value: number }[];
  range: RangeId;
  showTrend: boolean;
}) {
  const w = 320;
  const h = 120;
  const padX = 14;
  const padY = 12;
  const [hover, setHover] = useState<{ idx: number; px: number; py: number } | null>(null);

  const filtered = useMemo(() => {
    if (range === "all" || points.length === 0) return points;
    const last = new Date(points[points.length - 1].at).getTime();
    const ms = RANGE_MS[range];
    return points.filter((p) => last - new Date(p.at).getTime() <= ms);
  }, [points, range]);

  if (filtered.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No entries in this range.</p>
    );
  }

  const vals = filtered.map((p) => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const pad = maxV === minV ? 1 : (maxV - minV) * 0.08;
  const lo = minV - pad;
  const hi = maxV + pad;
  const rangeV = hi - lo || 1;
  const innerW = w - 2 * padX;
  const innerH = h - 2 * padY;

  const coords = filtered.map((p, i) => {
    const x =
      padX +
      (filtered.length <= 1 ? innerW / 2 : (i / (filtered.length - 1)) * innerW);
    const y = padY + (1 - (p.value - lo) / rangeV) * innerH;
    return { x, y, at: p.at, value: p.value };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  let trendLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (showTrend && filtered.length >= 3) {
    const reg = linearRegression(
      coords.map((c, i) => ({ x: i, y: c.value }))
    );
    const y0 = reg.intercept;
    const y1 = reg.slope * (coords.length - 1) + reg.intercept;
    const mapY = (val: number) => padY + (1 - (val - lo) / rangeV) * innerH;
    trendLine = {
      x1: padX,
      y1: mapY(y0),
      x2: padX + innerW,
      y2: mapY(y1),
    };
  }

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[7.5rem] w-full text-primary"
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          className="fill-surface-2"
          rx={8}
        />
        {trendLine ? (
          <line
            x1={trendLine.x1}
            y1={trendLine.y1}
            x2={trendLine.x2}
            y2={trendLine.y2}
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeWidth={1.5}
          />
        ) : null}
        {filtered.length > 1 ? (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylinePoints}
          />
        ) : null}
        {coords.map((c, i) => (
          <circle
            key={`${c.at}-${i}`}
            cx={c.x}
            cy={c.y}
            r={hover?.idx === i ? 6 : 4}
            className="cursor-pointer fill-primary stroke-background stroke-2"
            onMouseEnter={() => setHover({ idx: i, px: c.x, py: c.y })}
            onFocus={() => setHover({ idx: i, px: c.x, py: c.y })}
          />
        ))}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] text-[var(--text)] shadow-md"
          style={{
            left: `${(hover.px / w) * 100}%`,
            top: 0,
            transform: "translate(-50%, -110%)",
          }}
        >
          {filtered[hover.idx].value} · {formatShortDate(filtered[hover.idx].at)}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[10px] text-muted-foreground">
        <span>{formatShortDate(filtered[0].at)}</span>
        {filtered.length > 1 ? (
          <span>{formatShortDate(filtered[filtered.length - 1].at)}</span>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  userId: string;
  metrics: BodyMetricDef[];
};

export function TrendChartClient({ userId, metrics }: Props) {
  const supabase = createBrowserSupabaseClient();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeByMetric, setRangeByMetric] = useState<Record<string, RangeId>>({});
  const [wowInsight, setWowInsight] = useState("");
  const [wowBusy, setWowBusy] = useState(false);
  const [wowCoachIcon, setWowCoachIcon] = useState("🧠");

  useEffect(() => {
    setWowCoachIcon(getCoach().icon);
  }, []);

  const names = useMemo(() => metrics.map((m) => m.name), [metrics]);

  const load = useCallback(async () => {
    if (names.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("progress_entries")
      .select("logged_at, metric_key, value, unit")
      .eq("user_id", userId)
      .in("metric_key", names)
      .order("logged_at", { ascending: true });
    if (error) {
      console.error(error);
      setEntries([]);
    } else {
      setEntries((data ?? []) as ProgressEntry[]);
    }
    setLoading(false);
  }, [names, supabase, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const entriesByMetric = useMemo(() => {
    const map = new Map<string, ProgressEntry[]>();
    for (const n of names) map.set(n, []);
    for (const e of entries) {
      const list = map.get(e.metric_key);
      if (list) list.push(e);
    }
    for (const list of Array.from(map.values())) {
      list.sort(
        (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
      );
    }
    return map;
  }, [entries, names]);

  const summaryCells = useMemo(() => {
    return metrics.map((m) => {
      const list = entriesByMetric.get(m.name) ?? [];
      const latest = list[list.length - 1];
      const prev = list.length > 1 ? list[list.length - 2] : null;
      const flatEps =
        latest && prev ? Math.max(Math.abs(latest.value), Math.abs(prev.value)) * 0.002 + 0.0001 : 0.01;
      const delta = latest && prev ? latest.value - prev.value : 0;
      const tone = prev ? trendTone(delta, m.better, flatEps) : "flat";
      const color =
        tone === "good"
          ? "var(--accent2)"
          : tone === "bad"
            ? "var(--red)"
            : "var(--text3)";
      return { m, latest, prev, delta, tone, color };
    });
  }, [entriesByMetric, metrics]);

  const wowPayload = useMemo(() => {
    const now = new Date();
    const thisStart = startOfLocalWeek(now);
    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);
    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);
    const out: Record<
      string,
      { thisAvg: number | null; lastAvg: number | null; diff: number | null }
    > = {};
    for (const m of metrics) {
      const list = entriesByMetric.get(m.name) ?? [];
      const thisPts: number[] = [];
      const lastPts: number[] = [];
      for (const e of list) {
        const d = new Date(e.logged_at);
        if (d >= thisStart && d < thisEnd) thisPts.push(e.value);
        else if (d >= lastStart && d < thisStart) lastPts.push(e.value);
      }
      const avg = (arr: number[]) =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const thisAvg = avg(thisPts);
      const lastAvg = avg(lastPts);
      const diff =
        thisAvg !== null && lastAvg !== null ? thisAvg - lastAvg : null;
      out[m.name] = { thisAvg, lastAvg, diff };
    }
    return { metrics: out, weekStart: ymdLocal(thisStart) };
  }, [entriesByMetric, metrics]);

  const wowPayloadKey = useMemo(() => JSON.stringify(wowPayload), [wowPayload]);

  useEffect(() => {
    if (metrics.length === 0) return;
    let payload: typeof wowPayload;
    try {
      payload = JSON.parse(wowPayloadKey) as typeof wowPayload;
    } catch {
      return;
    }
    const hasData = Object.values(payload.metrics).some(
      (x) => x.thisAvg !== null || x.lastAvg !== null
    );
    if (!hasData) {
      setWowInsight("");
      return;
    }
    let cancelled = false;
    setWowBusy(true);
    void (async () => {
      try {
        const res = await fetch("/api/coach-chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            coachTask: "metric_week_insight",
            userText: JSON.stringify(payload),
          }),
        });
        const data = (await res.json()) as { coachTaskReply?: string };
        if (!cancelled) setWowInsight((data.coachTaskReply ?? "").trim());
      } catch {
        if (!cancelled) setWowInsight("");
      } finally {
        if (!cancelled) setWowBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metrics.length, wowPayloadKey]);

  if (metrics.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 pb-6 sm:max-w-2xl sm:px-6">
      <section>
        <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
          Summary
        </h2>
        {loading ? (
          <p className="mt-2 text-sm text-[var(--text3)]">Loading trends…</p>
        ) : (
          <div className="renpho-grid mt-3">
            {summaryCells.map(({ m, latest, delta, tone, color }) => (
              <div key={m.name} className="renpho-metric">
                <div className="renpho-val" style={{ color: latest ? color : undefined }}>
                  {latest ? (
                    <>
                      {latest.value}
                      {latest.unit ? (
                        <span className="text-sm font-normal text-[var(--text3)]">
                          {" "}
                          {latest.unit}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[var(--text3)]">—</span>
                  )}
                </div>
                <div className="renpho-lbl">{m.name}</div>
                {latest && tone !== "flat" ? (
                  <div className="mt-1 text-[10px]" style={{ color }}>
                    {m.better === "higher"
                      ? delta > 0
                        ? "↑ vs last"
                        : "↓ vs last"
                      : delta < 0
                        ? "↓ vs last"
                        : "↑ vs last"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="macro-card">
        <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
          Week over week
        </h2>
        {wowBusy && !wowInsight ? (
          <p className="mt-2 text-xs text-[var(--text3)]">Coach insight…</p>
        ) : null}
        {wowInsight ? (
          <p className="mt-2 text-sm text-[var(--text2)]">
            <span className="mr-1" aria-hidden>
              {wowCoachIcon}
            </span>
            {wowInsight}
          </p>
        ) : null}
        <ul className="mt-4 space-y-2 text-sm">
          {metrics.map((m) => {
            const row = wowPayload.metrics[m.name];
            const diff = row?.diff;
            return (
              <li
                key={m.name}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] border-opacity-40 py-2 last:border-0"
              >
                <span className="text-[var(--text)]">{m.name}</span>
                <span className="text-[var(--text2)]">
                  {row?.thisAvg != null ? row.thisAvg.toFixed(1) : "—"} this wk
                  {" · "}
                  {row?.lastAvg != null ? row.lastAvg.toFixed(1) : "—"} last wk
                  {diff != null && Number.isFinite(diff) ? (
                    <span
                      className="ml-2 font-medium"
                      style={{
                        color:
                          trendTone(diff, m.better, Math.max(Math.abs(diff) * 0.05, 0.01)) ===
                          "good"
                            ? "var(--accent2)"
                            : trendTone(diff, m.better, Math.max(Math.abs(diff) * 0.05, 0.01)) ===
                                "bad"
                              ? "var(--red)"
                              : "var(--text3)",
                      }}
                    >
                      ({diff > 0 ? "+" : ""}
                      {diff.toFixed(1)})
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
          Trends
        </h2>
        {metrics.map((m) => {
          const forMetric = entriesByMetric.get(m.name) ?? [];
          const chartPoints = forMetric.map((e) => ({
            at: e.logged_at,
            value: e.value,
          }));
          const latest = forMetric[forMetric.length - 1];
          const prev = forMetric.length > 1 ? forMetric[forMetric.length - 2] : null;
          const r = rangeByMetric[m.name] ?? "1m";
          const flatEps =
            latest && prev
              ? Math.max(Math.abs(latest.value), Math.abs(prev.value)) * 0.002 + 0.0001
              : 0.01;
          const delta = latest && prev ? latest.value - prev.value : 0;
          const tone = prev ? trendTone(delta, m.better, flatEps) : "flat";
          const arrowColor =
            tone === "good"
              ? "var(--accent2)"
              : tone === "bad"
                ? "var(--red)"
                : "var(--text3)";

          return (
            <div
              key={m.name}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-heading text-lg tracking-[0.08em] text-foreground">
                  {m.name}
                </h3>
                {latest ? (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {latest.value}
                      {latest.unit ? ` ${latest.unit}` : ""}
                    </span>
                    {prev ? (
                      <span className="ml-2" style={{ color: arrowColor }}>
                        {m.better === "higher"
                          ? delta > 0
                            ? "↑"
                            : delta < 0
                              ? "↓"
                              : "→"
                          : delta < 0
                            ? "↓"
                            : delta > 0
                              ? "↑"
                              : "→"}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(
                  [
                    ["2W", "2w"],
                    ["1M", "1m"],
                    ["3M", "3m"],
                    ["All", "all"],
                  ] as const
                ).map(([label, id]) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${
                      r === id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                    onClick={() =>
                      setRangeByMetric((prev) => ({ ...prev, [m.name]: id }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <MetricLineChart
                  points={chartPoints}
                  range={r}
                  showTrend={chartPoints.length >= 3}
                />
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
