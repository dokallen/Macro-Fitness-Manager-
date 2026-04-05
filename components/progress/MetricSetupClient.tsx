"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type BodyMetricDef = {
  name: string;
  unit: string;
  better: "higher" | "lower";
};

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

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

type Props = {
  userId: string;
  onSaved?: () => void;
  onClose?: () => void;
};

export function MetricSetupClient({ userId, onSaved, onClose }: Props) {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [detected, setDetected] = useState<{ name: string; value: string; unit: string }[] | null>(
    null
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [manualName, setManualName] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [manualBetter, setManualBetter] = useState<"higher" | "lower">("lower");
  const [manualList, setManualList] = useState<BodyMetricDef[]>([]);
  const [saving, setSaving] = useState(false);

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result ?? ""));
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(file);
    });
  }, []);

  const persistMetrics = useCallback(
    async (defs: BodyMetricDef[]) => {
      const cleaned = defs
        .map((d) => ({
          name: d.name.trim(),
          unit: d.unit.trim(),
          better: d.better === "higher" ? "higher" : "lower",
        }))
        .filter((d) => d.name.length > 0);
      if (cleaned.length === 0) {
        toast.error("Add at least one metric.");
        return;
      }
      setSaving(true);
      const { error } = await supabase.from("user_preferences").upsert(
        {
          user_id: userId,
          key: "body_metric_keys",
          value: JSON.stringify(cleaned),
          updated_by: "user",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,key" }
      );
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Metrics saved.");
      onSaved?.();
      router.refresh();
    },
    [onSaved, router, supabase, userId]
  );

  async function onScanFile(file: File) {
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
        toast.error("No metrics detected. Try a clearer photo or add manually.");
        setDetected([]);
        return;
      }
      setDetected(list);
      const sel: Record<string, boolean> = {};
      for (const row of list) sel[normalizeName(row.name)] = true;
      setSelected(sel);
      toast.success(`${list.length} metrics detected — pick what to track.`);
    } catch {
      toast.error("Scan failed.");
    } finally {
      setScanBusy(false);
    }
  }

  function confirmDetected() {
    if (!detected?.length) return;
    const defs: BodyMetricDef[] = [];
    for (const row of detected) {
      const k = normalizeName(row.name);
      if (!selected[k]) continue;
      defs.push({ name: row.name.trim(), unit: row.unit.trim(), better: "lower" });
    }
    void persistMetrics(defs);
  }

  function addManual() {
    const name = manualName.trim();
    if (!name) {
      toast.error("Enter a metric name.");
      return;
    }
    setManualList((prev) => [
      ...prev,
      { name, unit: manualUnit.trim(), better: manualBetter },
    ]);
    setManualName("");
    setManualUnit("");
    setManualBetter("lower");
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-6 pt-4 sm:max-w-2xl sm:px-6">
      {onClose ? (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="text-sm text-[var(--accent)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      ) : null}

      <div className="macro-card">
        <h2 className="text-center font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
          TRACK YOUR METRICS
        </h2>
        <p className="mt-2 text-center text-sm text-[var(--text2)]">
          Tell us what your scale or device tracks. You can add any metrics you want.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-4">
            <p className="text-center text-2xl" aria-hidden>
              📸
            </p>
            <p className="mt-2 text-center font-medium text-[var(--text)]">
              Scan a weigh-in screenshot
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onScanFile(f);
              }}
            />
            <button
              type="button"
              className="upload-area mt-3 w-full text-left"
              disabled={scanBusy}
              onClick={() => fileRef.current?.click()}
            >
              <span className="block text-center text-sm text-[var(--text2)]">
                {scanBusy ? "Reading image…" : "Camera or gallery"}
              </span>
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-4">
            <p className="text-center text-2xl" aria-hidden>
              ✍️
            </p>
            <p className="mt-2 text-center font-medium text-[var(--text)]">Add metrics manually</p>
            <label className="mt-3 block text-xs text-[var(--text3)]">Metric name</label>
            <input
              className="inf mt-1 w-full"
              placeholder="Metric name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <label className="mt-2 block text-xs text-[var(--text3)]">Unit</label>
            <input
              className="inf mt-1 w-full"
              placeholder="Unit"
              value={manualUnit}
              onChange={(e) => setManualUnit(e.target.value)}
            />
            <label className="mt-2 block text-xs text-[var(--text3)]">Better direction</label>
            <select
              className="inf mt-1 w-full"
              value={manualBetter}
              onChange={(e) =>
                setManualBetter(e.target.value === "higher" ? "higher" : "lower")
              }
            >
              <option value="lower">Lower is better</option>
              <option value="higher">Higher is better</option>
            </select>
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 text-sm font-medium text-[var(--text)]"
              onClick={addManual}
            >
              + Add Metric
            </button>
          </div>
        </div>

        {detected && detected.length > 0 ? (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-sm font-medium text-[var(--text)]">Detected from image</p>
            <ul className="mt-3 space-y-2">
              {detected.map((row) => {
                const k = normalizeName(row.name);
                return (
                  <li key={k} className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected[k] !== false}
                      onChange={(e) => setSelected((s) => ({ ...s, [k]: e.target.checked }))}
                    />
                    <span className="text-[var(--text)]">
                      {row.name}
                      {row.value ? ` — ${row.value}` : ""}
                      {row.unit ? ` ${row.unit}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent2)" }}
              disabled={saving}
              onClick={confirmDetected}
            >
              Start Tracking These
            </button>
          </div>
        ) : null}

        {manualList.length > 0 ? (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-sm font-medium text-[var(--text)]">Your metrics</p>
            <ul className="mt-3 space-y-2">
              {manualList.map((m, i) => (
                <li
                  key={`${m.name}-${i}`}
                  className="flex items-center justify-between gap-2 text-sm text-[var(--text)]"
                >
                  <span>
                    {m.name}
                    {m.unit ? ` (${m.unit})` : ""} ·{" "}
                    {m.better === "higher" ? "↑ better" : "↓ better"}
                  </span>
                  <button
                    type="button"
                    className="text-[var(--red)]"
                    onClick={() => setManualList((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent2)" }}
              disabled={saving}
              onClick={() => void persistMetrics(manualList)}
            >
              Save My Metrics
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function parseBodyMetricKeysPref(raw: string | null | undefined): BodyMetricDef[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: BodyMetricDef[] = [];
    for (const item of parsed) {
      if (typeof item === "string") {
        const n = item.trim();
        if (n) out.push({ name: n, unit: "", better: "lower" });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      if (!name) continue;
      const unit = String(o.unit ?? "").trim();
      const betterRaw = String(o.better ?? "").toLowerCase();
      const better: "higher" | "lower" =
        betterRaw === "higher" ? "higher" : "lower";
      out.push({ name, unit, better });
    }
    return out;
  } catch {
    return [];
  }
}
