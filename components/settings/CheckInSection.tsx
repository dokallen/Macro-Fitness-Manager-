"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { GOAL_PACE_GUIDE, GOAL_PACE_MAX } from "@/lib/coaching/constants";
import { GOAL_PACE_KEYS, readGoalPace } from "@/lib/coaching/goal-pace";
import {
  SCHEDULE_KEYS,
  WEEKDAY_NAMES,
  WEIGH_IN_FREQUENCIES,
  WEIGH_IN_FREQUENCY_LABELS,
  WEIGH_IN_RECOMMENDATION,
  readSchedule,
} from "@/lib/coaching/schedule";
import { checkInSettingsWrites, type CheckInSettingsForm as Form } from "@/lib/coaching/settings";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

const labelStyle = { fontSize: 12, color: "var(--text3)" } as const;
const inputClass =
  "h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-sm text-[var(--text)]";

export function CheckInSection({ userId }: { userId: string }) {
  const [form, setForm] = useState<Form>({ frequency: "", day: "", reminder: false, direction: "", percent: "" });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId)
      .in("key", [...Object.values(SCHEDULE_KEYS), ...Object.values(GOAL_PACE_KEYS)]);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []).map((r) => ({ key: r.key, value: r.value ?? "" }));
    const s = readSchedule(rows);
    const pace = readGoalPace(rows);
    setForm({
      frequency: s.weighInFrequency ?? "",
      day: s.checkInWeekday !== undefined ? WEEKDAY_NAMES[s.checkInWeekday]! : "",
      reminder: s.reminder,
      direction: pace?.direction ?? "",
      percent: pace && pace.direction !== "maintain" ? String(pace.percentPerWeek) : "",
    });
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const { upserts, deletes, error } = checkInSettingsWrites(form);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error: upErr } = await supabase.from("user_preferences").upsert(
        upserts.map((u) => ({ user_id: userId, key: u.key, value: u.value, updated_by: "user" as const, updated_at: now })),
        { onConflict: "user_id,key" }
      );
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      if (deletes.length) {
        const { error: delErr } = await supabase.from("user_preferences").delete().eq("user_id", userId).in("key", deletes);
        if (delErr) {
          toast.error(delErr.message);
          return;
        }
      }
      toast.success("Check-in settings saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  const guide = form.direction === "loss" || form.direction === "gain" ? GOAL_PACE_GUIDE[form.direction] : null;

  return (
    <div className="supp-card" style={{ marginTop: 20 }}>
      <h2
        style={{
          fontFamily: "var(--fd)",
          fontSize: 13,
          letterSpacing: 2,
          color: "var(--accent3)",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        📅 WEEKLY CHECK-IN
      </h2>
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 12, color: "var(--text2)" }}>{WEIGH_IN_RECOMMENDATION}</p>

        <label>
          <span style={labelStyle}>Weigh-in frequency</span>
          <select className={inputClass} value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
            <option value="">Not set</option>
            {WEIGH_IN_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {WEIGH_IN_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span style={labelStyle}>Check-in day (weekly)</span>
          <select className={inputClass} value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}>
            <option value="">Not set</option>
            {WEEKDAY_NAMES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={form.reminder}
            onChange={(e) => setForm((f) => ({ ...f, reminder: e.target.checked }))}
          />
          Push reminder on the check-in day (needs notifications enabled below)
        </label>

        <div>
          <span style={labelStyle}>Goal pace</span>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <select
              aria-label="Goal pace direction"
              className={inputClass}
              value={form.direction}
              onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
            >
              <option value="">Not set</option>
              <option value="loss">Lose weight</option>
              <option value="gain">Gain weight</option>
              <option value="maintain">Maintain</option>
            </select>
            {guide ? (
              <input
                aria-label="Percent of body weight per week"
                className={inputClass}
                style={{ width: 110 }}
                inputMode="decimal"
                placeholder="% per week"
                value={form.percent}
                onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))}
              />
            ) : null}
          </div>
          {guide ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {guide.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]"
                  onClick={() => setForm((f) => ({ ...f, percent: String(g.min) }))}
                >
                  {g.label}: {g.min}–{g.max}%
                </button>
              ))}
              <span style={{ fontSize: 11, color: "var(--text3)", alignSelf: "center" }}>
                % of body weight per week, up to {GOAL_PACE_MAX[form.direction as "loss" | "gain"]}%
              </span>
            </div>
          ) : null}
        </div>

        <button type="button" className="cbtn yes" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save check-in settings"}
        </button>
      </div>
    </div>
  );
}
