"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

type CardioMetric = {
  id: string;
  key: string;
  value: number;
  unit: string;
};

type CardioSession = {
  id: string;
  logged_at: string;
  type: string;
  duration_minutes: number | null;
  notes: string | null;
  cardio_metrics: CardioMetric[] | null;
};

type MetricFormRow = { key: string; value: string; unit: string };

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

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function CardioClient({ userId }: { userId: string }) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [formType, setFormType] = useState("");
  const [formDuration, setFormDuration] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDate, setFormDate] = useState(localDateInputValue);
  const [metricRows, setMetricRows] = useState<MetricFormRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("cardio_sessions")
      .select(
        "id, logged_at, type, duration_minutes, notes, cardio_metrics(id, key, value, unit)"
      )
      .eq("user_id", userId)
      .order("logged_at", { ascending: false });

    if (error) {
      console.error(error);
      startTransition(() => setInitialLoading(false));
      return;
    }

    const list = (data ?? []) as CardioSession[];
    startTransition(() => {
      setSessions(list);
      setInitialLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function addMetricRow() {
    setMetricRows((rows) => [...rows, { key: "", value: "", unit: "" }]);
  }

  function removeMetricRow(index: number) {
    setMetricRows((rows) => rows.filter((_, i) => i !== index));
  }

  function updateMetricRow(index: number, patch: Partial<MetricFormRow>) {
    setMetricRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const type = formType.trim();
    if (!type) {
      toast.error("Enter a cardio type.");
      return;
    }
    const dur = Number(formDuration);
    if (!Number.isFinite(dur) || dur <= 0) {
      toast.error("Duration must be a positive number (minutes).");
      return;
    }

    const metricsToInsert: { key: string; value: number; unit: string }[] = [];
    for (const r of metricRows) {
      const k = r.key.trim();
      const vStr = r.value.trim();
      const u = r.unit.trim();
      if (!k && !vStr) continue;
      if (k && !vStr) {
        toast.error(`Enter a value for "${k}" or clear that row.`);
        return;
      }
      if (!k && vStr) {
        toast.error("Each metric needs a name (key).");
        return;
      }
      const v = Number(vStr);
      if (!Number.isFinite(v)) {
        toast.error(`Metric "${k}" must be a number.`);
        return;
      }
      metricsToInsert.push({ key: k, value: v, unit: u });
    }

    setSubmitting(true);
    const loggedAt = dateInputToIso(formDate);

    const { data: sessionRow, error: sessionErr } = await supabase
      .from("cardio_sessions")
      .insert({
        user_id: userId,
        type,
        duration_minutes: dur,
        notes: formNotes.trim() || null,
        logged_at: loggedAt,
      })
      .select("id, logged_at, type, duration_minutes, notes")
      .single();

    if (sessionErr || !sessionRow) {
      setSubmitting(false);
      toast.error(sessionErr?.message ?? "Could not log session.");
      return;
    }

    const sessionId = sessionRow.id;

    if (metricsToInsert.length > 0) {
      const { error: metricsErr } = await supabase.from("cardio_metrics").insert(
        metricsToInsert.map((m) => ({
          cardio_session_id: sessionId,
          key: m.key,
          value: m.value,
          unit: m.unit,
        }))
      );

      if (metricsErr) {
        setSubmitting(false);
        toast.error(metricsErr.message);
        return;
      }
    }

    toast.success("Cardio session logged.");
    await load();
    startTransition(() => {
      setFormType("");
      setFormDuration("");
      setFormNotes("");
      setFormDate(localDateInputValue());
      setMetricRows([]);
    });
    setSubmitting(false);
  }

  if (initialLoading) {
    return (
      <div className="dark mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="dark mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
      <header>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">
          Cardio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Log sessions with optional custom metrics (distance, pace, heart rate,
          etc.).
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Log session</h2>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cardio-type">Type</Label>
            <Input
              id="cardio-type"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              placeholder="e.g. bike, walk, elliptical"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="cardio-duration">Duration (minutes)</Label>
              <Input
                id="cardio-duration"
                inputMode="decimal"
                value={formDuration}
                onChange={(e) => setFormDuration(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cardio-date">Date</Label>
              <Input
                id="cardio-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cardio-notes">Notes (optional)</Label>
            <Input
              id="cardio-notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="How it felt, route, etc."
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-foreground">Extra metrics (optional)</Label>
              <Button type="button" variant="secondary" size="sm" onClick={addMetricRow}>
                Add metric
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use any names you like — numeric value plus optional unit per row.
            </p>
            {metricRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                None added. Tap &quot;Add metric&quot; to include distance, pace, etc.
              </p>
            ) : null}
            <ul className="space-y-2">
              {metricRows.map((row, index) => (
                <li
                  key={index}
                  className="grid grid-cols-12 gap-2 rounded-lg border border-border/60 bg-background/40 p-2 sm:grid-cols-12"
                >
                  <div className="col-span-12 space-y-1 sm:col-span-4">
                    <Label className="sr-only" htmlFor={`cm-key-${index}`}>
                      Metric name
                    </Label>
                    <Input
                      id={`cm-key-${index}`}
                      value={row.key}
                      onChange={(e) =>
                        updateMetricRow(index, { key: e.target.value })
                      }
                      placeholder="Name"
                    />
                  </div>
                  <div className="col-span-6 space-y-1 sm:col-span-3">
                    <Label className="sr-only" htmlFor={`cm-val-${index}`}>
                      Value
                    </Label>
                    <Input
                      id={`cm-val-${index}`}
                      inputMode="decimal"
                      value={row.value}
                      onChange={(e) =>
                        updateMetricRow(index, { value: e.target.value })
                      }
                      placeholder="Value"
                    />
                  </div>
                  <div className="col-span-4 space-y-1 sm:col-span-3">
                    <Label className="sr-only" htmlFor={`cm-unit-${index}`}>
                      Unit
                    </Label>
                    <Input
                      id={`cm-unit-${index}`}
                      value={row.unit}
                      onChange={(e) =>
                        updateMetricRow(index, { unit: e.target.value })
                      }
                      placeholder="Unit"
                    />
                  </div>
                  <div className="col-span-2 flex items-end justify-end sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => removeMetricRow(index)}
                      aria-label="Remove metric row"
                    >
                      ✕
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Saving…" : "Save session"}
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No cardio sessions yet. Log your first session above.
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const metrics = s.cardio_metrics ?? [];
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-border bg-card/80 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-semibold text-foreground">
                      {s.type || "Session"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(s.logged_at)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.duration_minutes != null
                      ? `${s.duration_minutes} min`
                      : "—"}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </p>
                  {metrics.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 border-t border-border/80 pt-3">
                      {metrics.map((m) => (
                        <li
                          key={m.id}
                          className="flex flex-wrap justify-between gap-2 text-sm"
                        >
                          <span className="font-medium text-foreground">{m.key}</span>
                          <span className="text-muted-foreground">
                            {m.value}
                            {m.unit ? ` ${m.unit}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 border-t border-border/80 pt-3 text-xs text-muted-foreground">
                      No extra metrics for this session.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
