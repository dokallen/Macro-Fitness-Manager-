"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getCoach } from "@/components/coach/CoachChooser";
import {
  MetricSetupClient,
  parseBodyMetricKeysPref,
  type BodyMetricDef,
} from "@/components/progress/MetricSetupClient";
import { getProgramWeekNumberFromPreferencesRows } from "@/lib/program-week";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type WebSpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

function localDateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToIso(dateStr: string) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (!y || !mo || !d) return new Date().toISOString();
  return new Date(y, mo - 1, d, 12, 0, 0).toISOString();
}

function stripJsonFence(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence) s = fence[1].trim();
  return s;
}

function parseDetectedMetrics(text: string): { name: string; value: string; unit: string }[] {
  const s = stripJsonFence(text);
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: { name: string; value: string; unit: string }[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      if (!name) continue;
      out.push({
        name,
        value: String(o.value ?? "").trim(),
        unit: String(o.unit ?? "").trim(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchMetricValue(
  detected: { name: string; value: string }[],
  defName: string
): string {
  const target = norm(defName);
  for (const row of detected) {
    if (norm(row.name) === target) return row.value.replace(/[^\d.-]/g, "") || row.value;
  }
  for (const row of detected) {
    if (norm(row.name).includes(target) || target.includes(norm(row.name))) {
      return row.value.replace(/[^\d.-]/g, "") || row.value;
    }
  }
  return "";
}

const NOTES_PREF_KEY = "body_weighin_notes";

function FieldVoiceButton({
  onTranscript,
}: {
  onTranscript: (t: string) => void;
}) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    setOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!ok) return null;
  return (
    <button
      type="button"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-lg"
      disabled={busy}
      aria-label="Voice input"
      onClick={() => {
        const w = window as unknown as {
          SpeechRecognition?: WebSpeechCtor;
          webkitSpeechRecognition?: WebSpeechCtor;
        };
        const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!Ctor) return;
        try {
          setBusy(true);
          const r = new Ctor();
          r.lang = "en-US";
          r.interimResults = false;
          r.onresult = (ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
            const t = Array.from(ev.results)
              .map((x) => x[0]?.transcript ?? "")
              .join(" ")
              .trim();
            if (t) onTranscript(t);
          };
          r.onerror = () => {
            setBusy(false);
            toast.error("Voice not available.");
          };
          r.onend = () => setBusy(false);
          r.start();
        } catch {
          setBusy(false);
          toast.error("Voice not available.");
        }
      }}
    >
      🎤
    </button>
  );
}

type Props = {
  userId: string;
  initialMetrics: BodyMetricDef[];
};

export function BodyCompositionClient({ userId, initialMetrics }: Props) {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const scanRef = useRef<HTMLInputElement>(null);
  const [metrics, setMetrics] = useState<BodyMetricDef[]>(initialMetrics);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dateStr, setDateStr] = useState(localDateInputValue);
  const [notes, setNotes] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [coachInsight, setCoachInsight] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachDisplay, setCoachDisplay] = useState<{
    name: string;
    icon: string;
  } | null>(null);

  useEffect(() => {
    setMetrics(initialMetrics);
  }, [initialMetrics]);

  useEffect(() => {
    const c = getCoach();
    setCoachDisplay({ name: c.name, icon: c.icon });
  }, []);

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result ?? ""));
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(file);
    });
  }, []);

  async function runScan(file: File) {
    setScanBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coachTask: "detect_body_metrics",
          imageBase64: dataUrl,
        }),
      });
      const data = (await res.json()) as { coachTaskReply?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Scan failed.");
        return;
      }
      const list = parseDetectedMetrics(data.coachTaskReply ?? "");
      if (list.length === 0) {
        toast.error("No metrics detected.");
        return;
      }
      const next: Record<string, string> = { ...values };
      for (const m of metrics) {
        const v = matchMetricValue(list, m.name);
        if (v) next[m.name] = v;
      }
      setValues(next);
      toast.success(`${list.length} metrics detected — review and save`);
    } catch {
      toast.error("Scan failed.");
    } finally {
      setScanBusy(false);
    }
  }

  async function loadNotesForDate(ymd: string) {
    const { data } = await supabase
      .from("user_preferences")
      .select("value")
      .eq("user_id", userId)
      .eq("key", NOTES_PREF_KEY)
      .maybeSingle();
    const map: Record<string, string> = {};
    if (data?.value) {
      try {
        const p = JSON.parse(data.value) as unknown;
        if (p && typeof p === "object") Object.assign(map, p as Record<string, string>);
      } catch {
        /* ignore */
      }
    }
    setNotes(map[ymd] ?? "");
  }

  useEffect(() => {
    void loadNotesForDate(dateStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when date changes
  }, [dateStr, userId]);

  async function mergeNotesPref(ymd: string, note: string) {
    const { data } = await supabase
      .from("user_preferences")
      .select("value")
      .eq("user_id", userId)
      .eq("key", NOTES_PREF_KEY)
      .maybeSingle();
    const map: Record<string, string> = {};
    if (data?.value) {
      try {
        const p = JSON.parse(data.value) as unknown;
        if (p && typeof p === "object") Object.assign(map, p as Record<string, string>);
      } catch {
        /* ignore */
      }
    }
    if (note.trim()) map[ymd] = note.trim();
    else delete map[ymd];
    await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        key: NOTES_PREF_KEY,
        value: JSON.stringify(map),
        updated_by: "user",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" }
    );
  }

  async function fetchPreviousSnapshot(
    beforeIso: string,
    names: string[]
  ): Promise<Record<string, number>> {
    if (names.length === 0) return {};
    const { data, error } = await supabase
      .from("progress_entries")
      .select("logged_at, metric_key, value")
      .eq("user_id", userId)
      .in("metric_key", names)
      .lt("logged_at", beforeIso)
      .order("logged_at", { ascending: false });
    if (error || !data?.length) return {};
    const byTs = new Map<string, Record<string, number>>();
    for (const row of data) {
      const ts = row.logged_at as string;
      if (!byTs.has(ts)) byTs.set(ts, {});
      const bucket = byTs.get(ts)!;
      bucket[row.metric_key as string] = Number(row.value);
    }
    const timestamps = Array.from(byTs.keys()).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
    const prevTs = timestamps[0];
    return prevTs ? (byTs.get(prevTs) ?? {}) : {};
  }

  async function runCoachAnalysis(params: {
    current: Record<string, number>;
    previous: Record<string, number>;
    goal: string;
    programWeek: number;
  }) {
    setCoachBusy(true);
    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coachTask: "body_comp_analysis",
          userText: JSON.stringify(params),
        }),
      });
      const data = (await res.json()) as { coachTaskReply?: string; error?: string };
      if (!res.ok) {
        setCoachInsight("");
        return;
      }
      setCoachInsight((data.coachTaskReply ?? "").trim());
    } catch {
      setCoachInsight("");
    } finally {
      setCoachBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const loggedAt = dateInputToIso(dateStr);
    const rows: { metric_key: string; value: number; unit: string; logged_at: string }[] = [];
    for (const m of metrics) {
      const raw = values[m.name]?.trim() ?? "";
      if (!raw) continue;
      const n = Number.parseFloat(raw.replace(/,/g, ""));
      if (!Number.isFinite(n)) continue;
      rows.push({
        metric_key: m.name,
        value: n,
        unit: m.unit,
        logged_at: loggedAt,
      });
    }
    if (rows.length === 0) {
      toast.error("Enter at least one metric value.");
      return;
    }
    setSaving(true);
    const ins = rows.map((r) => ({
      user_id: userId,
      metric_key: r.metric_key,
      value: r.value,
      unit: r.unit,
      logged_at: r.logged_at,
    }));
    const { error } = await supabase.from("progress_entries").insert(ins);
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    await mergeNotesPref(dateStr, notes);
    toast.success("Weigh-in logged! Coach is analyzing your trends...");
    setSaving(false);
    setValues({});
    router.refresh();

    const current: Record<string, number> = {};
    for (const r of rows) current[r.metric_key] = r.value;
    const names = metrics.map((m) => m.name);
    const previous = await fetchPreviousSnapshot(loggedAt, names);

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId);
    const goalRow = (prefs ?? []).find((p) => p.key === "goal");
    const goal = goalRow?.value?.trim() ?? "";
    const programWeek = getProgramWeekNumberFromPreferencesRows(prefs ?? []);
    void runCoachAnalysis({
      current,
      previous,
      goal,
      programWeek,
    });
  }

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-4 pt-2 sm:max-w-2xl sm:px-6">
      <div className="relative mb-4">
        <button
          type="button"
          className="absolute right-0 top-0 text-xs text-[var(--accent)]"
          onClick={() => setSheetOpen(true)}
        >
          ⚙ Edit Metrics
        </button>
        <h2 className="pr-24 font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
          LOG WEIGH-IN
        </h2>
        <p className="text-xs text-[var(--text3)]">{todayLabel}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          ref={scanRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            ev.target.value = "";
            if (f) void runScan(f);
          }}
        />
        <button
          type="button"
          className="upload-area w-full text-left"
          disabled={scanBusy}
          onClick={() => scanRef.current?.click()}
        >
          {scanBusy ? (
            <span className="block text-center text-sm text-[var(--text2)]">Reading…</span>
          ) : (
            <>
              <span className="block text-center text-2xl" aria-hidden>
                📸
              </span>
              <span className="mt-1 block text-center text-sm font-medium text-[var(--text)]">
                Scan Scale Screenshot
              </span>
              <span className="mt-0.5 block text-center text-xs text-[var(--text3)]">
                AI reads all your metrics automatically
              </span>
            </>
          )}
        </button>

        {metrics.map((m) => (
          <div key={m.name} className="space-y-1">
            <label className="text-xs text-[var(--text3)]">
              {m.name}
              {m.unit ? ` (${m.unit})` : ""}
            </label>
            <div className="flex gap-2">
              <input
                className="inf min-w-0 flex-1"
                type="number"
                step={0.1}
                inputMode="decimal"
                placeholder={`Enter ${m.name}…`}
                value={values[m.name] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [m.name]: e.target.value }))
                }
              />
              <FieldVoiceButton
                onTranscript={(t) => {
                  const num = t.replace(/[^\d.-]/g, "");
                  if (num) setValues((prev) => ({ ...prev, [m.name]: num }));
                }}
              />
            </div>
          </div>
        ))}

        <div className="space-y-1">
          <label className="text-xs text-[var(--text3)]">Date</label>
          <input
            className="inf w-full"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--text3)]">Notes (optional)</label>
          <div className="flex gap-2">
            <textarea
              className="inf min-h-[72px] min-w-0 flex-1 resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
            />
            <FieldVoiceButton onTranscript={(t) => setNotes((n) => (n ? `${n} ${t}` : t))} />
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--accent2)" }}
          disabled={saving}
        >
          💾 Log Weigh-In
        </button>
      </form>

      {coachBusy || coachInsight ? (
        <div
          className="mt-6 rounded-xl p-4 text-sm text-[var(--text)]"
          style={{
            background: "linear-gradient(135deg, #0d1e33, #111827)",
            border: "1px solid color-mix(in srgb, var(--accent) 27%, transparent)",
          }}
        >
          <div className="flex items-center gap-2 font-medium">
            <span aria-hidden>{coachDisplay?.icon ?? "🧠"}</span>
            <span>{coachDisplay?.name ?? "Coach"}</span>
            {coachBusy ? <span className="text-xs text-[var(--text3)]">Analyzing…</span> : null}
          </div>
          {coachInsight ? (
            <p className="mt-2 whitespace-pre-wrap text-[var(--text2)]">{coachInsight}</p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className={`sheet-overlay${sheetOpen ? " open" : ""}`}
        aria-label="Close metric editor"
        onClick={() => setSheetOpen(false)}
      />
      <div className={`bottom-sheet-base${sheetOpen ? " open" : ""}`}>
        <div className="max-h-[85vh] overflow-y-auto p-4 pb-10">
          <MetricSetupClient
            userId={userId}
            onClose={() => setSheetOpen(false)}
            onSaved={async () => {
              const { data } = await supabase
                .from("user_preferences")
                .select("value")
                .eq("user_id", userId)
                .eq("key", "body_metric_keys")
                .maybeSingle();
              setMetrics(parseBodyMetricKeysPref(data?.value ?? null));
              setSheetOpen(false);
              router.refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}
