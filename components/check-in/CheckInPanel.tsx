"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  interpretDecisionResponse,
  proposalCardView,
  type UiProposal,
} from "@/lib/coach-actions/card-state";
import type { CheckInStatus } from "@/lib/coaching/schedule";
import { SCHEDULE_KEYS } from "@/lib/coaching/schedule";
import { matchMetricValue, parseDetectedMetrics } from "@/lib/metrics/scale-scan";
import { parseProgressMetricNames, trackedMetrics, type TrackedMetric } from "@/lib/metrics/tracked";
import {
  DEFAULT_WEIGHT_METRIC_NAME,
  convertWeight,
  isWeightMetricName,
  normalizeWeightUnit,
} from "@/lib/metrics/weight";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

type PanelState = {
  today: string;
  status: CheckInStatus;
  weighInDue: boolean;
  weighedSinceLastCheckIn: boolean;
  weightUnit: "lbs" | "kg" | null;
};

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

/** The card scrolls inside itself so it never pushes the screen's own content out. */
const cardStyle = { margin: "8px 16px", padding: 12, maxHeight: "45vh", overflowY: "auto" } as const;
const inputClass =
  "h-9 w-24 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-sm text-[var(--text)]";

// ------------------------------------------------------------- weigh-in form

function WeighInForm({
  userId,
  weightUnit,
  onSaved,
  onSnooze,
}: {
  userId: string;
  weightUnit: "lbs" | "kg" | null;
  onSaved: () => void;
  onSnooze?: () => void;
}) {
  const [metrics, setMetrics] = useState<TrackedMetric[] | null>(null);
  /** The user's saved progress-metric list, when weight has to be added to it. */
  const [addWeightTo, setAddWeightTo] = useState<string[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  /** Only asked when the app doesn't know the user's weight unit yet: no default. */
  const [pickedUnit, setPickedUnit] = useState<"" | "lbs" | "kg">("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("key, value")
        .eq("user_id", userId)
        .in("key", ["body_metric_keys", "progress_metric_keys"]);
      const all = trackedMetrics((data ?? []).map((r) => ({ key: r.key, value: r.value ?? "" })));
      // Weight first, then the user's other tracked metrics.
      const weight = all.filter((m) => isWeightMetricName(m.name)).slice(0, 1);
      const rest = all.filter((m) => !isWeightMetricName(m.name));
      if (!weight.length) {
        // No weight metric yet: saving adds "Weight" to the progress list, as onboarding does.
        setAddWeightTo(parseProgressMetricNames(data?.find((r) => r.key === "progress_metric_keys")?.value));
      }
      setMetrics([...(weight.length ? weight : [{ name: DEFAULT_WEIGHT_METRIC_NAME, unit: "" }]), ...rest]);
    })();
  }, [userId, weightUnit]);

  const nameUnit = (name: string) => normalizeWeightUnit(/\(([^)]+)\)\s*$/.exec(name)?.[1] ?? "");
  const unitFor = (m: TrackedMetric) =>
    m.unit || (isWeightMetricName(m.name) ? nameUnit(m.name) ?? weightUnit ?? pickedUnit : "");
  const needsUnitPick = Boolean(
    metrics?.some((m) => isWeightMetricName(m.name) && !m.unit && !nameUnit(m.name)) && !weightUnit
  );

  async function scan(file: File) {
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result ?? ""));
        fr.onerror = () => rej(new Error("read"));
        fr.readAsDataURL(file);
      });
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coachTask: "detect_body_metrics", imageBase64: dataUrl }),
      });
      const data = (await res.json()) as { coachTaskReply?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Scan failed.");
        return;
      }
      const list = parseDetectedMetrics(data.coachTaskReply ?? "");
      if (!list.length) {
        toast.error("No metrics detected.");
        return;
      }
      setValues((prev) => {
        const next = { ...prev };
        for (const m of metrics ?? []) {
          const v = matchMetricValue(list, m.name);
          if (!v) continue;
          // Convert a scanned weight to this field's unit (lbs/kg).
          const scanned = list.find((d) => isWeightMetricName(d.name));
          const from = isWeightMetricName(m.name) && scanned ? normalizeWeightUnit(scanned.unit) : null;
          const to = normalizeWeightUnit(unitFor(m));
          next[m.name] = from && to && from !== to && Number.isFinite(Number(v)) ? String(convertWeight(Number(v), from, to)) : v;
        }
        return next;
      });
      toast.success("Review the values, then save.");
    } catch {
      toast.error("Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const rows = (metrics ?? [])
      .map((m) => ({ m, v: Number(values[m.name]?.trim()) }))
      .filter(({ m, v }) => values[m.name]?.trim() && Number.isFinite(v));
    const weight = rows.find(({ m }) => isWeightMetricName(m.name));
    if (!weight) {
      toast.error("Enter your weight.");
      return;
    }
    if (needsUnitPick && !pickedUnit) {
      toast.error("Choose lbs or kg.");
      return;
    }
    setBusy(true);
    try {
      if (addWeightTo) {
        const { error: listErr } = await supabase.from("user_preferences").upsert(
          {
            user_id: userId,
            key: "progress_metric_keys",
            value: JSON.stringify([...addWeightTo, DEFAULT_WEIGHT_METRIC_NAME]),
            updated_by: "user",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,key" }
        );
        if (listErr) {
          toast.error(listErr.message);
          return;
        }
        setAddWeightTo(null);
      }
      const loggedAt = new Date().toISOString();
      const { error } = await supabase.from("progress_entries").insert(
        rows.map(({ m, v }) => ({
          user_id: userId,
          metric_key: m.name,
          value: v,
          unit: unitFor(m),
          logged_at: loggedAt,
        }))
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Weigh-in saved.");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  if (!metrics) return <p style={{ fontSize: 13, color: "var(--text2)" }}>Loading…</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {needsUnitPick ? (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ flex: 1, color: "var(--text)" }}>Weight unit</span>
          <select
            className={inputClass}
            aria-label="Weight unit"
            value={pickedUnit}
            onChange={(e) => setPickedUnit(e.target.value as "" | "lbs" | "kg")}
          >
            <option value="">Choose</option>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
        </label>
      ) : null}
      {metrics.map((m) => (
        <label key={m.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ flex: 1, color: "var(--text)" }}>
            {m.name}
            {unitFor(m) ? ` (${unitFor(m)})` : ""}
          </span>
          <input
            className={inputClass}
            inputMode="decimal"
            aria-label={m.name}
            value={values[m.name] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [m.name]: e.target.value }))}
          />
        </label>
      ))}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void scan(f);
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          Scan scale screenshot
        </Button>
        {onSnooze ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onSnooze}>
            Not today
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ check-in flow

type RunResponse = {
  error?: string;
  needsWeighIn?: boolean;
  needsCaloriesKey?: boolean;
  targetKeys?: string[];
  text?: string;
  conversationId?: string;
  proposal?: UiProposal;
};

function CheckInFlow({
  userId,
  state,
  onFinished,
}: {
  userId: string;
  state: PanelState;
  onFinished: () => void;
}) {
  const [weighed, setWeighed] = useState(state.weighedSinceLastCheckIn);
  const [answer, setAnswer] = useState<"yes" | "mostly" | "no" | null>(null);
  const [busy, setBusy] = useState(false);
  const [askCalories, setAskCalories] = useState<string[] | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [proposal, setProposal] = useState<UiProposal | null>(null);
  const [deciding, setDeciding] = useState(false);

  async function run(loggingAnswer: "yes" | "mostly" | "no", caloriesKey?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loggingAnswer, timeZone: deviceTimeZone(), ...(caloriesKey ? { caloriesKey } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as RunResponse;
      if (data.needsWeighIn) {
        setWeighed(false);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Check-in failed.");
        return;
      }
      if (data.needsCaloriesKey) {
        setAskCalories(data.targetKeys ?? []);
        return;
      }
      setAskCalories(null);
      setResult(data);
      setProposal(data.proposal ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "apply" | "cancel") {
    if (!proposal || !result?.conversationId || deciding) return;
    setDeciding(true);
    try {
      let ok = false;
      let status: number | undefined;
      let payload: unknown = {};
      try {
        const res = await fetch("/api/coach-actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId: result.conversationId, proposalId: proposal.id, decision }),
        });
        ok = res.ok;
        status = res.status;
        payload = await res.json().catch(() => ({}));
      } catch {
        ok = false;
      }
      const outcome = interpretDecisionResponse(proposal.id, proposal.summary, ok, payload, status);
      if (outcome.update) setProposal({ ...proposal, ...outcome.update });
      if (outcome.toast) {
        const { kind, text } = outcome.toast;
        if (kind === "success") toast.success(text);
        else if (kind === "error") toast.error(text);
        else toast(text);
      }
    } finally {
      setDeciding(false);
    }
  }

  if (!weighed) {
    return (
      <div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
          Step 1 of 2: log a weigh-in first.
        </p>
        <WeighInForm userId={userId} weightUnit={state.weightUnit} onSaved={() => setWeighed(true)} />
      </div>
    );
  }

  if (result) {
    const view = proposal ? proposalCardView(proposal) : null;
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ fontSize: 13, color: "var(--text)" }}>{result.text}</p>
        {proposal && view ? (
          <div className="rounded-lg border border-border bg-surface-2 p-2">
            <p className="text-xs font-semibold text-foreground">{proposal.summary}</p>
            {view.showButtons ? (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" disabled={deciding} aria-label={`Apply: ${proposal.summary}`} onClick={() => void decide("apply")}>
                  Apply
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={deciding} aria-label={`Cancel: ${proposal.summary}`} onClick={() => void decide("cancel")}>
                  Cancel
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground" role="status">
                {view.statusLabel}
                {view.detail ? ` — ${view.detail}` : ""}
              </p>
            )}
          </div>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onFinished}>
          Done
        </Button>
      </div>
    );
  }

  if (askCalories) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ fontSize: 13, color: "var(--text)" }}>Which of your targets is calories? I&apos;ll remember it.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {askCalories.map((k) => (
            <Button key={k} type="button" size="sm" variant="outline" disabled={busy} onClick={() => answer && void run(answer, k)}>
              {k}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ fontSize: 13, color: "var(--text)" }}>Did you log everything you ate this week?</p>
      <div style={{ display: "flex", gap: 8 }}>
        {(["yes", "mostly", "no"] as const).map((a) => (
          <Button
            key={a}
            type="button"
            size="sm"
            variant={answer === a ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              setAnswer(a);
              void run(a);
            }}
          >
            {a === "yes" ? "Yes" : a === "mostly" ? "Mostly" : "No"}
          </Button>
        ))}
      </div>
      {busy ? <p style={{ fontSize: 12, color: "var(--text2)" }}>Calculating…</p> : null}
    </div>
  );
}

// -------------------------------------------------------------------- panel

/**
 * Shows the weekly check-in card when a check-in is due or late, otherwise the
 * weigh-in card when a weigh-in is due. Shows nothing when there is no schedule.
 */
export function CheckInPanel({ userId, onChanged }: { userId: string; onChanged?: () => void }) {
  const [state, setState] = useState<PanelState | null>(null);
  const [started, setStarted] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/check-in?tz=${encodeURIComponent(deviceTimeZone())}`);
      if (!res.ok) return;
      setState((await res.json()) as PanelState);
    } catch {
      /* the cards are optional; stay quiet */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;
  const s = state.status.state;

  if (s === "due" || s === "late" || s === "missed" || (s === "early" && started)) {
    return (
      <div className="supp-card" style={cardStyle}>
        <h2 style={{ fontFamily: "var(--fd)", fontSize: 13, letterSpacing: 2, color: "var(--accent3)", marginBottom: 8 }}>
          WEEKLY CHECK-IN
          {state.status.state === "late" ? ` · ${state.status.daysLate} day${state.status.daysLate === 1 ? "" : "s"} late` : ""}
        </h2>
        <CheckInFlow
          userId={userId}
          state={state}
          onFinished={() => {
            setStarted(false);
            void load();
            onChanged?.();
          }}
        />
      </div>
    );
  }

  if (state.weighInDue) {
    return (
      <div className="supp-card" style={cardStyle}>
        {s === "early" ? (
          <div style={{ textAlign: "right" }}>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStarted(true)}>
              Check in early
            </Button>
          </div>
        ) : null}
        <h2 style={{ fontFamily: "var(--fd)", fontSize: 13, letterSpacing: 2, color: "var(--accent3)", marginBottom: 8 }}>
          WEIGH-IN
        </h2>
        <WeighInForm
          userId={userId}
          weightUnit={state.weightUnit}
          onSaved={() => {
            void load();
            onChanged?.();
          }}
          onSnooze={() => {
            void (async () => {
              const { error } = await supabase.from("user_preferences").upsert(
                {
                  user_id: userId,
                  key: SCHEDULE_KEYS.weighInSnoozedDate,
                  value: state.today,
                  updated_by: "user",
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,key" }
              );
              if (error) toast.error(error.message);
              else void load();
            })();
          }}
        />
      </div>
    );
  }

  if (s === "early") {
    return (
      <div style={{ margin: "4px 16px", textAlign: "right" }}>
        <Button type="button" size="sm" variant="ghost" onClick={() => setStarted(true)}>
          Check in early
        </Button>
      </div>
    );
  }

  return null;
}
