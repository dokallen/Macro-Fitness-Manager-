"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

type ProgressEntry = {
  id: string;
  logged_at: string;
  metric_key: string;
  value: number;
  unit: string;
};

function localDateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToIso(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

function parseProgressMetricKeys(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

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

function MetricTrendChart({ points }: { points: { at: string; value: number }[] }) {
  const w = 320;
  const h = 112;
  const padX = 12;
  const padY = 10;

  if (points.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No entries yet for this metric.</p>
    );
  }

  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const innerW = w - 2 * padX;
  const innerH = h - 2 * padY;

  const coords = points.map((p, i) => {
    const x =
      padX + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + (1 - (p.value - minV) / range) * innerH;
    return { x, y, at: p.at };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[7rem] w-full text-primary"
        preserveAspectRatio="none"
        aria-hidden
      >
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          className="fill-muted/20"
          rx={8}
        />
        {points.length > 1 ? (
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
            r={4}
            className="fill-primary stroke-background stroke-2"
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[10px] text-muted-foreground">
        <span>{formatShortDate(points[0].at)}</span>
        {points.length > 1 ? (
          <span>{formatShortDate(points[points.length - 1].at)}</span>
        ) : null}
      </div>
    </div>
  );
}

export function ProgressClient({ userId }: { userId: string }) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [metricKeys, setMetricKeys] = useState<string[]>([]);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [formMetric, setFormMetric] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formDate, setFormDate] = useState(localDateInputValue);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [{ data: prefRow, error: prefErr }, { data: rows, error: entErr }] =
      await Promise.all([
        supabase
          .from("user_preferences")
          .select("value")
          .eq("user_id", userId)
          .eq("key", "progress_metric_keys")
          .maybeSingle(),
        supabase
          .from("progress_entries")
          .select("id, logged_at, metric_key, value, unit")
          .eq("user_id", userId)
          .order("logged_at", { ascending: true }),
      ]);

    if (prefErr) console.error(prefErr);
    if (entErr) console.error(entErr);

    const keys = parseProgressMetricKeys(prefRow?.value ?? null);
    const list = (rows ?? []) as ProgressEntry[];

    startTransition(() => {
      setMetricKeys(keys);
      setEntries(list);
      setFormMetric((m) => {
        if (m && keys.includes(m)) return m;
        return keys[0] ?? "";
      });
      setInitialLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const entriesByMetric = useMemo(() => {
    const map = new Map<string, ProgressEntry[]>();
    for (const e of entries) {
      const arr = map.get(e.metric_key) ?? [];
      arr.push(e);
      map.set(e.metric_key, arr);
    }
    return map;
  }, [entries]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formMetric.trim()) {
      toast.error("Choose a metric.");
      return;
    }
    const n = Number(formValue);
    if (!Number.isFinite(n)) {
      toast.error("Enter a numeric value.");
      return;
    }

    setSubmitting(true);
    const loggedAt = dateInputToIso(formDate);
    const { data, error } = await supabase
      .from("progress_entries")
      .insert({
        user_id: userId,
        metric_key: formMetric.trim(),
        value: n,
        unit: formUnit.trim(),
        logged_at: loggedAt,
      })
      .select("id, logged_at, metric_key, value, unit")
      .single();

    if (error || !data) {
      setSubmitting(false);
      toast.error(error?.message ?? "Could not save entry.");
      return;
    }

    startTransition(() => {
      setEntries((prev) => {
        const next = [...prev, data as ProgressEntry];
        next.sort(
          (a, b) =>
            new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
        );
        return next;
      });
      setFormValue("");
      setFormUnit("");
      setFormDate(localDateInputValue());
    });
    setSubmitting(false);
    toast.success("Progress logged.");
  }

  if (initialLoading) {
    return (
      <div className="dark mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (metricKeys.length === 0) {
    return (
      <div className="dark mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
        <header>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">
            Progress
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track metrics over time with simple charts.
          </p>
        </header>
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-4 py-8 text-center">
          <p className="text-sm text-foreground">No metrics to track yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up progress metrics during onboarding, or ask Coach from the home
            screen to help you choose what to measure.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/onboarding">Onboarding</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
      <header>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">
          Progress
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Log entries and review trends for each tracked metric.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Log entry</h2>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="progress-metric">Metric</Label>
            <select
              id="progress-metric"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={formMetric}
              onChange={(e) => setFormMetric(e.target.value)}
            >
              {metricKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="progress-value">Value</Label>
              <Input
                id="progress-value"
                inputMode="decimal"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="72.5"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="progress-unit">Unit</Label>
              <Input
                id="progress-unit"
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                placeholder="lbs, %, in…"
              />
            </div>
            <div className="col-span-2 space-y-1 sm:col-span-1">
              <Label htmlFor="progress-date">Date</Label>
              <Input
                id="progress-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Saving…" : "Save entry"}
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Your metrics</h2>
        <ul className="grid gap-4">
          {metricKeys.map((key, idx) => {
            const forMetric = entriesByMetric.get(key) ?? [];
            const chartPoints = forMetric.map((e) => ({
              at: e.logged_at,
              value: e.value,
            }));
            const latest = forMetric[forMetric.length - 1];

            return (
              <li
                key={`${key}-${idx}`}
                className="rounded-xl border border-border bg-card/80 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">{key}</h3>
                  {latest ? (
                    <p className="text-sm text-muted-foreground">
                      Latest:{" "}
                      <span className="font-medium text-foreground">
                        {latest.value}
                        {latest.unit ? ` ${latest.unit}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatShortDate(latest.logged_at)}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="mt-3">
                  <MetricTrendChart points={chartPoints} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
