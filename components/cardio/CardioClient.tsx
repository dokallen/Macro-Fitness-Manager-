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

type PendingLive = {
  startAt: number;
  durationMinutes: number;
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

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatElapsedMs(totalMs: number) {
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
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

  const [liveType, setLiveType] = useState("");
  const [liveStartAt, setLiveStartAt] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  const [pendingLive, setPendingLive] = useState<PendingLive | null>(null);
  const [pendingNotes, setPendingNotes] = useState("");
  const [pendingMetricRows, setPendingMetricRows] = useState<MetricFormRow[]>(
    []
  );

  const [quickTypeList, setQuickTypeList] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [fullRes, typesOnlyRes] = await Promise.all([
      supabase
        .from("cardio_sessions")
        .select(
          'id, logged_at, "type", duration_minutes, notes, cardio_metrics(id, key, value, unit)'
        )
        .eq("user_id", userId)
        .order("logged_at", { ascending: false }),
      supabase
        .from("cardio_sessions")
        .select('logged_at, "type"')
        .eq("user_id", userId)
        .order("logged_at", { ascending: false }),
    ]);

    if (fullRes.error) {
      console.error(fullRes.error);
      setInitialLoading(false);
      return;
    }

    const list = (fullRes.data ?? []) as CardioSession[];

    console.log("[CardioClient] types-only query", {
      error: typesOnlyRes.error,
      rowCount: typesOnlyRes.data?.length ?? 0,
      rawRows: typesOnlyRes.data?.slice(0, 8),
    });

    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const s of list) {
      const raw = (s as { type?: unknown }).type;
      const t = typeof raw === "string" ? raw.trim() : "";
      if (!t || seen.has(t)) continue;
      seen.add(t);
      ordered.push(t);
    }

    console.log("[CardioClient] quickTypeList (deduped from full session rows)", ordered);

    setSessions(list);
    setQuickTypeList(ordered);
    setInitialLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (liveStartAt === null) {
      setTickMs(0);
      return;
    }
    const tick = () => setTickMs(Date.now());
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [liveStartAt]);

  const elapsedMs =
    liveStartAt !== null ? Math.max(0, tickMs - liveStartAt) : 0;

  function applyQuickType(t: string) {
    setLiveType(t);
    setFormType(t);
  }

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

  function addPendingMetricRow() {
    setPendingMetricRows((rows) => [...rows, { key: "", value: "", unit: "" }]);
  }

  function removePendingMetricRow(index: number) {
    setPendingMetricRows((rows) => rows.filter((_, i) => i !== index));
  }

  function updatePendingMetricRow(index: number, patch: Partial<MetricFormRow>) {
    setPendingMetricRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  function validateMetricRows(
    rows: MetricFormRow[]
  ): { key: string; value: number; unit: string }[] | null {
    const out: { key: string; value: number; unit: string }[] = [];
    for (const r of rows) {
      const k = r.key.trim();
      const vStr = r.value.trim();
      const u = r.unit.trim();
      if (!k && !vStr) continue;
      if (k && !vStr) {
        toast.error(`Enter a value for "${k}" or clear that row.`);
        return null;
      }
      if (!k && vStr) {
        toast.error("Each metric needs a name (key).");
        return null;
      }
      const v = Number(vStr);
      if (!Number.isFinite(v)) {
        toast.error(`Metric "${k}" must be a number.`);
        return null;
      }
      out.push({ key: k, value: v, unit: u });
    }
    return out;
  }

  async function insertSessionAndMetrics(
    type: string,
    durationMinutes: number,
    loggedAtIso: string,
    notes: string | null,
    metrics: { key: string; value: number; unit: string }[]
  ): Promise<boolean> {
    const { data: sessionRow, error: sessionErr } = await supabase
      .from("cardio_sessions")
      .insert({
        user_id: userId,
        type,
        duration_minutes: durationMinutes,
        notes,
        logged_at: loggedAtIso,
      })
      .select("id, logged_at, type, duration_minutes, notes")
      .single();

    if (sessionErr || !sessionRow) {
      toast.error(sessionErr?.message ?? "Could not log session.");
      return false;
    }

    if (metrics.length > 0) {
      const { error: metricsErr } = await supabase.from("cardio_metrics").insert(
        metrics.map((m) => ({
          cardio_session_id: sessionRow.id,
          key: m.key,
          value: m.value,
          unit: m.unit,
        }))
      );

      if (metricsErr) {
        toast.error(metricsErr.message);
        return false;
      }
    }

    return true;
  }

  function startLiveSession() {
    if (pendingLive !== null) {
      toast.error("Finish or cancel the pending session first.");
      return;
    }
    setLiveStartAt(Date.now());
  }

  function stopLiveSession() {
    if (liveStartAt === null) return;
    const end = Date.now();
    const durationMinutes = (end - liveStartAt) / 60000;
    if (durationMinutes < 1 / 120) {
      toast.error("Session is too short to save.");
      setLiveStartAt(null);
      return;
    }
    setPendingLive({ startAt: liveStartAt, durationMinutes });
    setLiveStartAt(null);
    setPendingNotes("");
    setPendingMetricRows([]);
  }

  function cancelPendingLive() {
    setPendingLive(null);
    setPendingNotes("");
    setPendingMetricRows([]);
  }

  async function onSubmitPendingLive(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingLive) return;
    const type = liveType.trim();
    if (!type) {
      toast.error("Enter a cardio type.");
      return;
    }
    const metrics = validateMetricRows(pendingMetricRows);
    if (!metrics) return;

    setSubmitting(true);
    const loggedAtIso = new Date(pendingLive.startAt).toISOString();
    const ok = await insertSessionAndMetrics(
      type,
      pendingLive.durationMinutes,
      loggedAtIso,
      pendingNotes.trim() || null,
      metrics
    );
    if (ok) {
      toast.success("Cardio session saved.");
      await load();
      startTransition(() => {
        setPendingLive(null);
        setPendingNotes("");
        setPendingMetricRows([]);
        setLiveType("");
      });
    }
    setSubmitting(false);
  }

  async function onSubmitManual(e: React.FormEvent) {
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

    const metrics = validateMetricRows(metricRows);
    if (!metrics) return;

    setSubmitting(true);
    const loggedAt = dateInputToIso(formDate);
    const ok = await insertSessionAndMetrics(
      type,
      dur,
      loggedAt,
      formNotes.trim() || null,
      metrics
    );
    if (ok) {
      toast.success("Cardio session logged.");
      await load();
      startTransition(() => {
        setFormType("");
        setFormDuration("");
        setFormNotes("");
        setFormDate(localDateInputValue());
        setMetricRows([]);
      });
    }
    setSubmitting(false);
  }

  const manualLocked = liveStartAt !== null || pendingLive !== null;

  if (initialLoading) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 bg-background px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
        <p className="text-sm font-sans text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 bg-background px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
      <header>
        <h1 className="page-title">Cardio</h1>
        <p className="mt-2 text-sm font-sans text-muted-foreground">
          Start a timed session or log manually with optional custom metrics.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="section-label">Live session</h2>
        <p className="mt-2 text-xs font-sans text-muted-foreground">
          Start the timer, then stop when you&apos;re done. Duration is saved
          automatically; add notes and metrics before saving.
        </p>

        <div className="mt-3 space-y-1">
          <Label htmlFor="live-cardio-type">Type</Label>
          {quickTypeList.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {quickTypeList.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => applyQuickType(t)}
                  className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm font-sans font-medium text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}
          <Input
            id="live-cardio-type"
            value={liveType}
            onChange={(e) => setLiveType(e.target.value)}
            placeholder="Tap a pill above or type here"
            autoComplete="off"
            disabled={liveStartAt !== null}
          />
        </div>

        {pendingLive === null && liveStartAt === null ? (
          <div className="mt-4">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={startLiveSession}
            >
              Start Cardio
            </Button>
          </div>
        ) : null}

        {liveStartAt !== null ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/40 bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-sans text-muted-foreground">Elapsed</p>
              <p className="font-heading text-4xl tracking-[0.06em] tabular-nums text-foreground">
                {formatElapsedMs(elapsedMs)}
              </p>
            </div>
            <Button type="button" variant="destructive" onClick={stopLiveSession}>
              Stop
            </Button>
          </div>
        ) : null}

        {pendingLive !== null ? (
          <form onSubmit={onSubmitPendingLive} className="mt-4 space-y-3 border-t border-border pt-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">Duration: </span>
              {pendingLive.durationMinutes < 1
                ? `${Math.round(pendingLive.durationMinutes * 60)} sec`
                : `${pendingLive.durationMinutes.toFixed(
                    pendingLive.durationMinutes >= 10 ? 1 : 2
                  )} min`}
            </p>
            <p className="text-xs text-muted-foreground">
              Started: {formatWhen(new Date(pendingLive.startAt).toISOString())}
            </p>

            <div className="space-y-1">
              <Label htmlFor="pending-notes">Notes (optional)</Label>
              <Input
                id="pending-notes"
                value={pendingNotes}
                onChange={(e) => setPendingNotes(e.target.value)}
                placeholder="How it felt, route, etc."
              />
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-foreground">Extra metrics (optional)</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addPendingMetricRow}
                >
                  Add metric
                </Button>
              </div>
              {pendingMetricRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  None added. Tap &quot;Add metric&quot; for distance, pace, etc.
                </p>
              ) : null}
              <ul className="space-y-2">
                {pendingMetricRows.map((row, index) => (
                  <li
                    key={index}
                    className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-surface-2 p-2"
                  >
                    <div className="col-span-12 space-y-1 sm:col-span-4">
                      <Input
                        value={row.key}
                        onChange={(e) =>
                          updatePendingMetricRow(index, { key: e.target.value })
                        }
                        placeholder="Name"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-3">
                      <Input
                        inputMode="decimal"
                        value={row.value}
                        onChange={(e) =>
                          updatePendingMetricRow(index, { value: e.target.value })
                        }
                        placeholder="Value"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-3">
                      <Input
                        value={row.unit}
                        onChange={(e) =>
                          updatePendingMetricRow(index, { unit: e.target.value })
                        }
                        placeholder="Unit"
                      />
                    </div>
                    <div className="col-span-2 flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => removePendingMetricRow(index)}
                        aria-label="Remove metric row"
                      >
                        ✕
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save session"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={cancelPendingLive}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section
        className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${
          manualLocked ? "opacity-60" : ""
        }`}
      >
        <h2 className="section-label">Log manually</h2>
        <p className="mt-2 text-xs font-sans text-muted-foreground">
          Enter duration and date yourself (same types as above).
        </p>
        <form onSubmit={onSubmitManual} className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cardio-type">Type</Label>
            {quickTypeList.length > 0 && !manualLocked ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {quickTypeList.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => applyQuickType(t)}
                    className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm font-sans font-medium text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
            <Input
              id="cardio-type"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              placeholder="e.g. bike, walk, elliptical"
              autoComplete="off"
              disabled={manualLocked}
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
                disabled={manualLocked}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cardio-date">Date</Label>
              <Input
                id="cardio-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                disabled={manualLocked}
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
              disabled={manualLocked}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-foreground">Extra metrics (optional)</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addMetricRow}
                disabled={manualLocked}
              >
                Add metric
              </Button>
            </div>
            {metricRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                None added. Tap &quot;Add metric&quot; to include distance, pace, etc.
              </p>
            ) : null}
            <ul className="space-y-2">
              {metricRows.map((row, index) => (
                <li
                  key={index}
                  className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-surface-2 p-2 sm:grid-cols-12"
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
                      disabled={manualLocked}
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
                      disabled={manualLocked}
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
                      disabled={manualLocked}
                    />
                  </div>
                  <div className="col-span-2 flex items-end justify-end sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => removeMetricRow(index)}
                      disabled={manualLocked}
                      aria-label="Remove metric row"
                    >
                      ✕
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <Button
            type="submit"
            disabled={submitting || manualLocked}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            {submitting ? "Saving…" : "Save manual entry"}
          </Button>
          {manualLocked ? (
            <p className="text-xs text-muted-foreground">
              Finish or cancel the live session to use manual logging.
            </p>
          ) : null}
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">History</h2>
        {sessions.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center text-sm font-sans text-muted-foreground shadow-sm"
            role="status"
          >
            No cardio sessions yet. Log your first session above.
          </div>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const metrics = s.cardio_metrics ?? [];
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-heading text-lg tracking-[0.08em] text-foreground">
                      {s.type || "Session"}
                    </p>
                    <p className="text-xs font-sans text-muted-foreground">
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
